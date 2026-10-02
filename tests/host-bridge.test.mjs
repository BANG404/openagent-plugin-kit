import { describe, expect, test } from "bun:test";

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
