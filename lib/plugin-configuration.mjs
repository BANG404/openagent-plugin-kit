// Reviewed bindings shared by conversions and maintained adaptations.
export function externalPluginConfiguration(id) {
  const fields = [];
  if (["asana", "gitlab", "linear"].includes(id)) fields.push(
    { key: "client-id", label: "OAuth client ID", description: "Optional registered public client ID; leave blank for dynamic registration.", type: "string", mcp: { server: id, property: "oauth_client_id" } },
    { key: "scope", label: "OAuth scope", description: "Optional scopes accepted by the provider. Changing this disconnects the existing local authorization.", type: "string", mcp: { server: id, property: "oauth_scope" } },
  );
  if (["github", "discord", "telegram", "terraform"].includes(id)) fields.push({
    key: "token", label: id === "terraform" ? "Terraform Enterprise token" : id === "github" ? "GitHub token" : "Bot token",
    description: "Saved privately for this plugin. Leave the password field blank to keep its saved value.",
    type: "string", secret: true, required: id !== "terraform",
    env: { github: "GITHUB_TOKEN", discord: "DISCORD_BOT_TOKEN", telegram: "TELEGRAM_BOT_TOKEN", terraform: "TFE_TOKEN" }[id],
  });
  if (id === "fakechat") fields.push({ key: "port", label: "Local chat port", type: "integer", default: 8787, minimum: 1, maximum: 65535, env: "FAKECHAT_PORT" });
  return fields.length ? { version: 1, fields } : undefined;
}

export function configurationTranslations(schema) {
  const en = {}; const zh = {};
  const labels = { "client-id": "OAuth 客户端 ID", scope: "OAuth 权限范围", token: "访问令牌", port: "本地聊天端口" };
  const descriptions = { "client-id": "可选的已注册公共客户端 ID；留空时尝试动态注册。", scope: "可选的服务提供方支持的权限范围；修改后会断开已有的本地授权。", token: "此插件的密钥私有保存；密码框留空表示保留已保存的密钥。" };
  for (const field of schema?.fields ?? []) {
    en[`configuration.${field.key}.label`] = field.label;
    zh[`configuration.${field.key}.label`] = labels[field.key] ?? field.label;
    if (field.description) {
      en[`configuration.${field.key}.description`] = field.description;
      zh[`configuration.${field.key}.description`] = descriptions[field.key] ?? field.description;
    }
  }
  return { en, zh };
}
