import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  OpenAgentHostError,
  context,
  createHostClient,
  createPluginHost,
  hookContext,
  hookEvent,
  requireConversationContext,
} from "../lib/openagent-host.mjs";

function response(result, ok = true, status = 200) {
  return { ok, status, json: async () => (ok ? { ok: true, result } : { ok: false, error: result }) };
}

describe("OpenAgent host bridge client", () => {
  test("conversation UI probes support and retains explicit scope, identity and JSON props", async () => {
    const requests=[];
    const host=createHostClient({environment:{OPENAGENT_PLUGIN_HOST_URL:"http://127.0.0.1:1234/v1/execute",OPENAGENT_PLUGIN_HOST_TOKEN:"secret",OPENAGENT_PLUGIN_ID:"example"},fetch:async (_url,init)=>{
      requests.push(JSON.parse(init.body));return response({version:1});
    }});
    await host.conversation.ui.capabilities();
    const ui={version:1,component:"plugin:example:counter",props:{count:2},fallback:"Count: 2"};
    await host.conversation.ui.set({convId:"conv",branchId:"branch",id:"counter",ui});
    expect(requests).toEqual([
      {operation:"conversation.ui.capabilities",args:{plugin_id:"example"}},
      {operation:"conversation.ui.set",args:{conv_id:"conv",branch_id:"branch",id:"counter",ui,plugin_id:"example"}},
    ]);
    expect(()=>host.conversation.ui.set({convId:"conv",id:"counter",ui})).toThrow("branch_id");
  });
  test("the full-kit template carries the same capability client", () => {
    expect(readFileSync(new URL("../templates/full-kit/lib/openagent-host.mjs", import.meta.url), "utf8")).toBe(readFileSync(new URL("../lib/openagent-host.mjs", import.meta.url), "utf8"));
  });
  test("embedding preserves texts and validates ordered vector metadata", async () => {
    const requests = [];
    let malformed = false;
    const host = createHostClient({environment: {
      OPENAGENT_PLUGIN_HOST_URL: "http://127.0.0.1:1234/v1/execute",
      OPENAGENT_PLUGIN_HOST_TOKEN: "secret", OPENAGENT_PLUGIN_ID: "example",
    }, fetch: async (_url, init) => {
      const request = JSON.parse(init.body);
      requests.push(request);
      const metadata = {version: 1, model_id: "test-model", model_version: "1", dimensions: 2};
      return response(request.operation === "embedding.status"
        ? {...metadata, supported: true, ready: false, max_texts: 32, max_text_bytes: 8192, max_total_bytes: 65536}
        : {...metadata, vectors: malformed ? [[1]] : [[1, 0], [0, 1]]});
    }});
    expect((await host.embedding.status()).ready).toBe(false);
    expect((await host.embedding.embed([" first ", "中文"])).vectors).toEqual([[1, 0], [0, 1]]);
    expect(requests[1]).toEqual({operation: "embedding.embed", args: {plugin_id: "example", texts: [" first ", "中文"]}});
    malformed = true;
    await expect(host.embedding.embed(["one", "two"])).rejects.toThrow("unsupported host embedding inference");
    await expect(host.embedding.embed([" "])).rejects.toThrow("non-blank");
    await expect(host.embedding.embed([])).rejects.toThrow("non-empty");
  });
  test("embedding rejects unknown versions and surfaces unsupported Runtime errors", async () => {
    const environment = {OPENAGENT_PLUGIN_HOST_URL: "http://127.0.0.1:1234/v1/execute", OPENAGENT_PLUGIN_HOST_TOKEN: "secret", OPENAGENT_PLUGIN_ID: "example"};
    const incompatible = createHostClient({environment, fetch: async () => response({version: 2})});
    await expect(incompatible.embedding.status()).rejects.toThrow("unsupported host embedding status");
    const old = createHostClient({environment, fetch: async () => response("cannot call host operation 'embedding.status'", false, 400)});
    await expect(old.embedding.status()).rejects.toMatchObject({name: "OpenAgentHostError", status: 400, operation: "embedding.status"});
  });
  test("locale is read live and rejects unknown response versions", async () => {
    let locale = "zh";
    let version = 1;
    const host = createHostClient({environment: {
      OPENAGENT_PLUGIN_HOST_URL: "http://127.0.0.1:1234/v1/execute",
      OPENAGENT_PLUGIN_HOST_TOKEN: "secret", OPENAGENT_PLUGIN_ID: "example",
    }, fetch: async (_url, init) => {
      expect(JSON.parse(init.body)).toEqual({operation: "locale.get", args: {plugin_id: "example"}});
      return response({version, locale});
    }});
    expect(await host.locale.get()).toBe("zh");
    locale = "en";
    expect(await host.locale.get()).toBe("en");
    version = 2;
    await expect(host.locale.get()).rejects.toThrow();
  });
  test("adds the authenticated plugin identity and exposes capability modules", async () => {
    const requests = [];
    const host = createHostClient({
      environment: {
        OPENAGENT_PLUGIN_HOST_URL: "http://127.0.0.1:1234/v1/execute",
        OPENAGENT_PLUGIN_HOST_TOKEN: "secret",
        OPENAGENT_PLUGIN_ID: "example",
      },
      fetch: async (url, init) => {
        requests.push({ url, init });
        return response({ accepted: true });
      },
    });

    await host.agent.wake({ conv_id: "child", text: "continue" }, { wait: false });
    await host.conversation.state("conversation", "branch");
    await host.conversation.children("parent", { workspace: "workspace" });
    await host.conversation.setFlow("conversation", "branch", {
      kind: "plugin",
      state: { plugin_id: "example", status: "running" },
    });
    await host.branch.setHead("branch", "checkpoint");
    await host.roles.list("workspace");
    await host.event.emit("progress", { step: 1 });

    expect(requests).toHaveLength(7);
    const wake = JSON.parse(requests[0].init.body);
    expect(wake).toEqual({
      operation: "agent.wake",
      args: { conv_id: "child", text: "continue", wait: false, plugin_id: "example" },
    });
    expect(requests[1].init.headers.authorization).toBe("Bearer secret");
    expect(JSON.parse(requests[1].init.body).args).toEqual({
      conv_id: "conversation",
      branch_id: "branch",
      plugin_id: "example",
    });
    expect(JSON.parse(requests[2].init.body).args).toEqual({
      workspace: "workspace",
      parent_conv_id: "parent",
      plugin_id: "example",
    });
    expect(JSON.parse(requests[3].init.body).args).toEqual({
      conv_id: "conversation",
      branch_id: "branch",
      flow: {
        kind: "plugin",
        state: { plugin_id: "example", status: "running" },
      },
      plugin_id: "example",
    });
  });

  test("reports bridge failures as structured errors", async () => {
    const host = createHostClient({
      environment: {
        OPENAGENT_PLUGIN_HOST_URL: "http://127.0.0.1:1234/v1/execute",
        OPENAGENT_PLUGIN_HOST_TOKEN: "secret",
        OPENAGENT_PLUGIN_ID: "example",
      },
      fetch: async () => response("denied", false, 400),
    });
    await expect(host.conversation.state("conv")).rejects.toMatchObject({
      name: "OpenAgentHostError",
      status: 400,
      operation: "conversation.state",
      message: "denied",
    });
  });

  test("keeps MCP context opaque and rejects missing conversation context", () => {
    expect(context({ _openagent: { conversation_id: "conv", branch_id: "branch", workspace: "ws" } })).toEqual({
      conversationId: "conv",
      branchId: "branch",
      workspace: "ws",
    });
    expect(() => requireConversationContext({})).toThrow(OpenAgentHostError);
  });

  test("normalizes SDK aliases and nested hook events", async () => {
    const requests = [];
    const host = createPluginHost({
      environment: {
        OPENAGENT_PLUGIN_HOST_URL: "http://127.0.0.1:1234/v1/execute",
        OPENAGENT_PLUGIN_HOST_TOKEN: "secret",
        OPENAGENT_PLUGIN_ID: "example",
      },
      fetch: async (_url, init) => {
        requests.push(JSON.parse(init.body));
        return response({ accepted: true });
      },
    });

    await host.agent.wake(
      {
        convId: "conversation",
        branchId: "branch",
        parentCheckpointId: null,
        text: "continue",
        flow: { state: { flow_id: "plugin:example:run", title: "Run", status: "running" } },
      },
      { wait: false, hidden: true },
    );

    expect(requests[0]).toEqual({
      operation: "agent.wake",
      args: {
        conv_id: "conversation",
        branch_id: "branch",
        parent_checkpoint_id: null,
        text: "continue",
        flow: {
          kind: "plugin",
          state: { plugin_id: "example", flow_id: "plugin:example:run", title: "Run", status: "running" },
        },
        hidden: true,
        wait: false,
        plugin_id: "example",
      },
    });
    expect(hookEvent({ hook_event_name: "Stop", event: { conversation_id: "conversation", branch_id: "branch" } })).toEqual({
      conversation_id: "conversation",
      branch_id: "branch",
    });
    expect(hookContext({ event: { conversation_id: "conversation", branch_id: "branch" } })).toMatchObject({
      conversationId: "conversation",
      branchId: "branch",
    });
  });

  test("turns an aborted bridge request into an operation error", async () => {
    const host = createHostClient({
      environment: {
        OPENAGENT_PLUGIN_HOST_URL: "http://127.0.0.1:1234/v1/execute",
        OPENAGENT_PLUGIN_HOST_TOKEN: "secret",
        OPENAGENT_PLUGIN_ID: "example",
      },
      timeoutMs: 5,
      fetch: async () => new Promise(() => {}),
    });

    await expect(host.event.emit("slow", {})).rejects.toMatchObject({
      name: "OpenAgentHostError",
      operation: "event.emit",
      message: "host operation timed out: event.emit",
    });
  });
});
