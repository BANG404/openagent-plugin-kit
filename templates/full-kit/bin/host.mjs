import { context, createPluginHost, hookContext, hookEvent, requireConversationContext } from "./lib/openagent-host.mjs";

const client = createPluginHost();

export const host = (operation, args = {}) => client.call(operation, args);
export { context, hookContext, hookEvent, requireConversationContext };
export const hostClient = client;
export const conversation = client.conversation;
export const branch = client.branch;
export const agent = client.agent;
export const roles = client.roles;
export const event = client.event;
