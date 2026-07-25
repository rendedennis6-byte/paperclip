import { describe, expect, it } from "vitest";
import { classifyContinuationFailure } from "./service.js";

function buildRun(errorCode: string | null) {
  return {
    id: "run-1",
    agentId: "agent-1",
    status: "failed",
    error: null,
    errorCode,
    contextSnapshot: null,
    livenessState: null,
    resultJson: null,
  } as Parameters<typeof classifyContinuationFailure>[0];
}

describe("classifyContinuationFailure", () => {
  it("treats a deterministic Codex invalid_request_error (RENA-50574) as non-retryable", () => {
    const classification = classifyContinuationFailure(buildRun("codex_invalid_request"));

    expect(classification).toEqual({
      kind: "non_retryable",
      maxAttempts: 0,
      baseBackoffMs: 0,
      errorCode: "codex_invalid_request",
    });
  });

  it("still treats generic adapter failures as retryable transient infra", () => {
    const classification = classifyContinuationFailure(buildRun("adapter_failed"));

    expect(classification.kind).toBe("transient_infra");
  });
});
