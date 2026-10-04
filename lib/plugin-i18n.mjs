// Presentation contract shared with Runtime validation and the official catalog.
const TAG = /^(?:(?:[a-z]{2,3}(?:-[a-z]{3}){0,3}|[a-z]{4}|[a-z]{5,8})(?:-[a-z]{4})?(?:-[a-z]{2}|-\d{3})?(?:-(?:[a-z0-9]{5,8}|\d[a-z0-9]{3}))*(?:-[0-9a-wy-z](?:-[a-z0-9]{2,8})+)*(?:-x(?:-[a-z0-9]{1,8})+)?|x(?:-[a-z0-9]{1,8})+)$/i;
const GRANDFATHERED = new Set("art-lojban cel-gaulish en-gb-oed i-ami i-bnn i-default i-enochian i-hak i-klingon i-lux i-mingo i-navajo i-pwn i-tao i-tay i-tsu no-bok no-nyn sgn-be-fr sgn-be-nl sgn-ch-de zh-guoyu zh-hakka zh-min zh-min-nan zh-xiang".split(" "));
export function normalizePluginLocale(value) {
  if (typeof value !== "string" || value.length > 128 || (!TAG.test(value) && !GRANDFATHERED.has(value.toLowerCase()))) throw new Error("invalid BCP 47 locale");
  const tag = value.toLowerCase();
  const seen = new Set();
  let extension = false;
  for (const part of tag.split("-").slice(1)) {
    if (part === "x") break;
    if (part.length === 1 || (!extension && (part.length >= 5 || /^\d.{3}$/.test(part)))) {
      if (seen.has(part)) throw new Error("duplicate locale subtag");
      seen.add(part);
    }
    if (part.length === 1) extension = true;
  }
  return tag;
}
export function validatePluginI18n(manifest, {required = false, locales = []} = {}) {
  const input = manifest.extensions?.openagent?.i18n;
  if (input === undefined) {
    if (required || locales.length) throw new Error("plugin must declare extensions.openagent.i18n");
    return null;
  }
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["supported_locales", "default_locale", "translations"].includes(key)) || !Array.isArray(input.supported_locales) || input.supported_locales.length < 1 || input.supported_locales.length > 32) throw new Error("invalid plugin i18n declaration");
  const supported_locales = input.supported_locales.map(normalizePluginLocale);
  const default_locale = normalizePluginLocale(input.default_locale);
  if (new Set(supported_locales).size !== supported_locales.length || !supported_locales.includes(default_locale)) throw new Error("duplicate locale or unsupported default");
  if (!input.translations || typeof input.translations !== "object" || Array.isArray(input.translations)) throw new Error("invalid plugin translations");
  const requiredKeys = ["display_name", ...(manifest.description !== undefined ? ["description"] : [])];
  for (const [component, fields] of [["commands", ["label", "description"]], ["sidebar", ["title"]]]) {
    for (const entry of Array.isArray(manifest.extensions?.openagent?.[component]) ? manifest.extensions.openagent[component] : []) {
      if (typeof entry?.id === "string") for (const field of fields) requiredKeys.push(`${component}.${entry.id}.${field}`);
    }
  }
  const translations = Object.create(null);
  let keys;
  let parameters;
  for (const [rawTag, messages] of Object.entries(input.translations)) {
    const tag = normalizePluginLocale(rawTag);
    if (!supported_locales.includes(tag) || Object.hasOwn(translations, tag) || !messages || typeof messages !== "object" || Array.isArray(messages)) throw new Error("invalid translation locale");
    const entries = Object.entries(messages);
    const current = entries.map(([key]) => key).sort();
    if (entries.length > 256 || requiredKeys.some(key => !current.includes(key)) || entries.some(([key, text]) => (!requiredKeys.includes(key) && !(key.startsWith("notice.") && key.length > 7 && Buffer.byteLength(key, "utf8") <= 128)) || typeof text !== "string" || !text.trim() || Buffer.byteLength(text, "utf8") > 4096) || (keys !== undefined && keys !== JSON.stringify(current))) throw new Error("incomplete plugin translations");
    keys = JSON.stringify(current);
    const currentParameters = JSON.stringify(current.map(key => [key, [...messages[key].matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(match => match[1]).sort()]));
    if (parameters !== undefined && parameters !== currentParameters) throw new Error("translation placeholders must match");
    parameters = currentParameters;
    translations[tag] = Object.fromEntries(entries);
  }
  if (Object.keys(translations).length !== supported_locales.length) throw new Error("missing translation locale");
  if (locales.map(normalizePluginLocale).some(tag => !supported_locales.includes(tag))) throw new Error("official plugin is missing a platform locale");
  return {supported_locales, default_locale, translations};
}
