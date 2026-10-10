import { expect, test } from "bun:test";
import { externalPluginConfiguration, configurationTranslations } from "../lib/plugin-configuration.mjs";
import { validatePluginI18n } from "../lib/plugin-i18n.mjs";

test("reviewed conversions bind secrets without defaults and translate their setup", () => {
  for (const id of ["asana", "gitlab", "linear", "github", "discord", "telegram", "terraform", "fakechat"]) {
    const schema = externalPluginConfiguration(id);
    expect(schema.version).toBe(1);
    const messages = configurationTranslations(schema);
    for (const field of schema.fields) {
      expect(messages.zh[`configuration.${field.key}.label`]).toBeTruthy();
      if (field.secret) expect(field.default).toBeUndefined();
      if (field.mcp) expect(field.mcp.server).toBe(id);
    }
    const manifest = { extensions: { openagent: { configuration: schema, i18n: { supported_locales: ["en", "zh"], default_locale: "en", translations: { en: { display_name: id, ...messages.en }, zh: { display_name: id, ...messages.zh } } } } } };
    expect(validatePluginI18n(manifest)).not.toBeNull();
    delete manifest.extensions.openagent.i18n.translations.zh[Object.keys(messages.zh)[0]];
    expect(() => validatePluginI18n(manifest)).toThrow("incomplete");
  }
  expect(externalPluginConfiguration("playwright")).toBeUndefined();
});
