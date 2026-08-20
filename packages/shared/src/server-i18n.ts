export const SERVER_MESSAGE_IDS = ["notice.successfulRun.missingDisposition.title"] as const;
export type ServerMessageId = (typeof SERVER_MESSAGE_IDS)[number];
export type ServerLocale = "en" | "de";
export const DEFAULT_SERVER_LOCALE: ServerLocale = "en";

export const serverMessages: Record<ServerLocale, Record<ServerMessageId, string>> = {
  en: { "notice.successfulRun.missingDisposition.title": "Missing issue disposition" },
  de: { "notice.successfulRun.missingDisposition.title": "Fehlender Issue-Abschluss" },
};

export function resolveServerLocale(requested: string | readonly string[] | null | undefined): ServerLocale {
  const candidates = typeof requested === "string" ? requested.split(",") : (requested ?? []);
  for (const candidate of candidates) {
    const language = candidate.trim().split(";", 1)[0]?.split("-", 1)[0]?.toLowerCase();
    if (language === "de" || language === "en") return language;
  }
  return DEFAULT_SERVER_LOCALE;
}

export function translateServerMessage(messageId: ServerMessageId, requested?: string | readonly string[] | null) {
  const locale = resolveServerLocale(requested);
  return serverMessages[locale][messageId] ?? serverMessages[DEFAULT_SERVER_LOCALE][messageId];
}
