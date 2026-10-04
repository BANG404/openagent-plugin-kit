import { test, expect } from "bun:test";
import { validatePluginI18n, normalizePluginLocale } from "../lib/plugin-i18n.mjs";
const manifest = () => ({description:"Messages",extensions:{openagent:{i18n:{supported_locales:["en","ZH"], default_locale:"en",translations:{en:{display_name:"Board",description:"Messages"},zh:{display_name:"留言板",description:"消息"}}}}}});
test("normalizes declarations and requires every platform locale at official qualification", () => {
  expect(validatePluginI18n(manifest(),{locales:["zh","en"]}).supported_locales).toEqual(["en","zh"]);
  expect(() => validatePluginI18n(manifest(),{locales:["fr"]})).toThrow("missing a platform locale");
  expect(() => validatePluginI18n({}, {required:true})).toThrow("must declare");
  expect(validatePluginI18n({})).toBeNull();
});
test("rejects duplicate, malformed, unsupported default and incomplete translations", () => {
  for (const mutate of [
    i => i.supported_locales.push("EN"), i => i.default_locale="fr",
    i => i.supported_locales=["en_US"], i => delete i.translations.zh.description,
    i => i.translations.zh.description=" ", i => i.translations.en.other="ignored",
  ]) {const input=manifest();mutate(input.extensions.openagent.i18n);expect(()=>validatePluginI18n(input)).toThrow();}
  const input=manifest();input.extensions.openagent.commands=[{id:"run",label:"Run",description:"Start"}];
  expect(()=>validatePluginI18n(input)).toThrow("incomplete");
});
test("locale syntax includes extensions and private use without accepting repeated variants", () => {
  for (const tag of ["zh-Hans-CN","en-u-ca-gregory","en-abcde-u-abcde","x-private","i-klingon"]) expect(normalizePluginLocale(tag)).toBe(tag.toLowerCase());
  for (const tag of ["en_US","en-abcde-abcde","en-u-ca-gregory-u-hc-h12"," en"]) expect(()=>normalizePluginLocale(tag)).toThrow();
});
