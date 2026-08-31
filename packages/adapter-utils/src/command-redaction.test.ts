import { describe, expect, it } from "vitest";
import { REDACTED_COMMAND_TEXT_VALUE, redactDiagnosticText } from "./command-redaction.js";

describe("redactDiagnosticText", () => {
  it("redacts a JSON secret field value", () => {
    const input = '{"token":"opaque-value","status":"error"}';
    const output = redactDiagnosticText(input);
    expect(output).not.toContain("opaque-value");
    expect(output).toContain(`"token":"${REDACTED_COMMAND_TEXT_VALUE}"`);
    // The non-secret field keeps its value.
    expect(output).toContain('"status":"error"');
  });

  it("redacts an api_key JSON field with whitespace around the colon", () => {
    const input = '{ "api_key" : "sk-secret-123" }';
    const output = redactDiagnosticText(input);
    expect(output).not.toContain("sk-secret-123");
    expect(output).toContain(REDACTED_COMMAND_TEXT_VALUE);
  });

  it("redacts an escaped-JSON secret field value", () => {
    // A diagnostic can carry a JSON string, so the double quotes appear as `\"`.
    const input = '{\\"token\\":\\"opaque-value\\"}';
    const output = redactDiagnosticText(input);
    expect(output).not.toContain("opaque-value");
    expect(output).toContain(`\\"token\\":\\"${REDACTED_COMMAND_TEXT_VALUE}\\"`);
  });

  it("still redacts a shell KEY=value secret", () => {
    const input = "ANTHROPIC_API_KEY=super-secret-value claude --print";
    const output = redactDiagnosticText(input);
    expect(output).not.toContain("super-secret-value");
    expect(output).toContain(REDACTED_COMMAND_TEXT_VALUE);
  });

  it("redacts a provider-specific shell assignment without a secret-looking name", () => {
    const output = redactDiagnosticText(
      "env PROVIDER_SPECIFIC_BINDING=synthetic-provider-canary custom-acp",
    );
    expect(output).not.toContain("synthetic-provider-canary");
    expect(output).toContain(`PROVIDER_SPECIFIC_BINDING=${REDACTED_COMMAND_TEXT_VALUE}`);
  });

  it("keeps CLI flag values intact because a flag is not a shell assignment", () => {
    const input = "paperclip-runner --mode=canary --port=3100 --sandbox=none";
    // The lookbehind anchors the assignment name to a word start, so the
    // leading dashes keep these flags out of the assignment rule.
    expect(redactDiagnosticText(input)).toBe(input);
  });

  it("keeps the allowlisted diagnostic fields readable", () => {
    const input = "probe finished status=ok latency_ms=142 attempt=2";
    expect(redactDiagnosticText(input)).toBe(input);
  });

  it("redacts an unknown assignment that sits next to allowlisted fields", () => {
    const output = redactDiagnosticText(
      "status=ok attempt=2 UPSTREAM_BINDING=synthetic-upstream-canary latency_ms=142",
    );
    expect(output).not.toContain("synthetic-upstream-canary");
    expect(output).toContain(`UPSTREAM_BINDING=${REDACTED_COMMAND_TEXT_VALUE}`);
    expect(output).toContain("status=ok");
    expect(output).toContain("attempt=2");
    expect(output).toContain("latency_ms=142");
  });

  it("redacts a quoted assignment value and keeps the quotes", () => {
    const output = redactDiagnosticText(
      "env CUSTOM_BINDING='synthetic quoted canary' custom-acp",
    );
    expect(output).not.toContain("synthetic quoted canary");
    expect(output).toContain(`CUSTOM_BINDING='${REDACTED_COMMAND_TEXT_VALUE}'`);
  });

  it("keeps non-secret text and non-secret JSON fields intact", () => {
    const input = '{"status":"ok","message":"probe finished"}';
    expect(redactDiagnosticText(input)).toBe(input);
  });

  it("redacts the secret but keeps a non-secret marker in the same string", () => {
    const input = 'DIAGMARKER1234 said {"authorization":"Bearer opaque"}';
    const output = redactDiagnosticText(input);
    expect(output).toContain("DIAGMARKER1234");
    expect(output).not.toContain("opaque");
  });

  it("redacts a JSON secret value that contains an escaped quote", () => {
    // The value holds an escaped quote, so a naive matcher stops at the `\"` and
    // leaves the rest of the credential. The marker sits after the escaped quote.
    const input = '{"token":"pre\\"MARKERQUOTE_A"}';
    const output = redactDiagnosticText(input);
    expect(output).not.toContain("MARKERQUOTE_A");
    expect(output).toContain(`"token":"${REDACTED_COMMAND_TEXT_VALUE}"`);
  });

  it("redacts a JSON secret value that contains an escaped backslash", () => {
    const input = '{"secret":"pre\\\\MARKERBACKSLASH_A"}';
    const output = redactDiagnosticText(input);
    expect(output).not.toContain("MARKERBACKSLASH_A");
    expect(output).toContain(`"secret":"${REDACTED_COMMAND_TEXT_VALUE}"`);
  });

  it("redacts an escaped-JSON secret value that contains an escaped quote", () => {
    // A diagnostic can carry a serialized JSON string, so the whole JSON is
    // escaped a second time. The inner value still holds an escaped quote.
    const innerJson = '{"token":"pre\\"MARKERQUOTE_B"}';
    const input = JSON.stringify(innerJson);
    const output = redactDiagnosticText(input);
    expect(output).not.toContain("MARKERQUOTE_B");
    expect(output).toContain(REDACTED_COMMAND_TEXT_VALUE);
  });

  it("redacts an escaped-JSON secret value that contains an escaped backslash", () => {
    const innerJson = '{"password":"pre\\\\MARKERBACKSLASH_B"}';
    const input = JSON.stringify(innerJson);
    const output = redactDiagnosticText(input);
    expect(output).not.toContain("MARKERBACKSLASH_B");
    expect(output).toContain(REDACTED_COMMAND_TEXT_VALUE);
  });
});
