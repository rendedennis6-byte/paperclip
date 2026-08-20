import { describe, expect, it } from "vitest";
import { resolveServerLocale, translateServerMessage } from "./server-i18n.js";

describe("server i18n", () => {
  it("selects English and German from language tags", () => {
    expect(resolveServerLocale("en-US")).toBe("en");
    expect(resolveServerLocale("de-DE,de;q=0.9")).toBe("de");
    expect(translateServerMessage("notice.successfulRun.missingDisposition.title", "de"))
      .toBe("Fehlender Issue-Abschluss");
  });

  it("falls back to English", () => {
    expect(resolveServerLocale("fr-FR")).toBe("en");
    expect(translateServerMessage("notice.successfulRun.missingDisposition.title", null))
      .toBe("Missing issue disposition");
  });
});
