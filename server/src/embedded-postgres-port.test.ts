import { describe, expect, it, vi } from "vitest";
import { waitForEmbeddedPostgresPort } from "./embedded-postgres-port.js";

describe("waitForEmbeddedPostgresPort", () => {
  it("keeps retrying the configured port until it becomes available", async () => {
    let nowMs = 0;
    const detectAvailablePort = vi
      .fn<(port: number) => Promise<number>>()
      .mockResolvedValueOnce(56000)
      .mockResolvedValueOnce(56000)
      .mockResolvedValueOnce(54332);

    const result = await waitForEmbeddedPostgresPort(54332, {
      timeoutMs: 60_000,
      retryIntervalMs: 1_000,
      detectAvailablePort,
      now: () => nowMs,
      sleep: async (delayMs) => {
        nowMs += delayMs;
      },
    });

    expect(result).toEqual({ port: 54332, timedOut: false, waitedMs: 2_000 });
    expect(detectAvailablePort).toHaveBeenCalledTimes(3);
  });

  it("returns the fallback port only after the configured timeout", async () => {
    let nowMs = 0;
    const detectAvailablePort = vi.fn(async () => 56000);

    const result = await waitForEmbeddedPostgresPort(54332, {
      timeoutMs: 3_000,
      retryIntervalMs: 1_000,
      detectAvailablePort,
      now: () => nowMs,
      sleep: async (delayMs) => {
        nowMs += delayMs;
      },
    });

    expect(result).toEqual({ port: 56000, timedOut: true, waitedMs: 3_000 });
    expect(detectAvailablePort).toHaveBeenCalledTimes(4);
  });

  it("returns immediately when the configured port is free", async () => {
    const detectAvailablePort = vi.fn(async (port: number) => port);

    const result = await waitForEmbeddedPostgresPort(54332, {
      detectAvailablePort,
      now: () => 0,
    });

    expect(result).toEqual({ port: 54332, timedOut: false, waitedMs: 0 });
    expect(detectAvailablePort).toHaveBeenCalledOnce();
  });
});
