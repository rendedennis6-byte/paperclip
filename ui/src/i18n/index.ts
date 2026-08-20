import i18n, { type InitOptions, type TOptions } from "i18next";
import { initReactI18next, useTranslation as useReactI18nextTranslation } from "react-i18next";

import { DEFAULT_LOCALE, i18nextResources, supportedLocales } from "./locales";
import { serverMessages } from "@paperclipai/shared/server-i18n";

function initialLocale() {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const requested = window.localStorage.getItem("paperclip.locale") ?? window.navigator.language;
  const exact = supportedLocales.find((locale) => locale.toLowerCase() === requested.toLowerCase());
  if (exact) return exact;
  const language = requested.split("-", 1)[0]?.toLowerCase();
  return supportedLocales.find((locale) => locale.toLowerCase() === language) ?? DEFAULT_LOCALE;
}

for (const [locale, messages] of Object.entries(serverMessages)) {
  const resource = (i18nextResources[locale] ??= { translation: {} });
  Object.assign(resource.translation as Record<string, unknown>, messages);
}

const i18nextOptions: InitOptions = {
  resources: i18nextResources,
  lng: initialLocale(),
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: supportedLocales,
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  returnObjects: false,
  initAsync: false,
};

void i18n.use(initReactI18next).init(i18nextOptions).catch((error: unknown) => {
  console.error("Failed to initialize i18next", error);
});

export function t(key: string, options: TOptions = {}) {
  return i18n.t(key, options);
}

export const useTranslation = useReactI18nextTranslation;
export { i18n };
