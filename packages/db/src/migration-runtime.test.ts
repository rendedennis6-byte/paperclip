import { describe, expect, it, vi } from "vitest";
import { waitForPreferredEmbeddedPostgresPort } from "./migration-runtime.js";

describe("waitForPreferredEmbeddedPostgresPort", () => {
  it("waits for the configured port and keeps it when it becomes available", async () => {
    const portInUse = vi
      .fn<(port: number) => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const sleep = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue(undefined);
    const logError = vi.fn<(message: string) => void>();

    const port = await waitForPreferredEmbeddedPostgresPort(54332, {
      timeoutMs: 60_000,
      retryMs: 1,
      portInUse,
      sleep,
      logError,
    });

    expect(port).toBe(54332);
    expect(portInUse).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(logError).not.toHaveBeenCalled();
  });

  it("falls back only after timeout and logs the drift as an error", async () => {
    const logError = vi.fn<(message: string) => void>();

    const port = await waitForPreferredEmbeddedPostgresPort(54332, {
      timeoutMs: 0,
      portInUse: async (candidate) => candidate === 54332,
      logError,
    });

    expect(port).toBe(54333);
    expect(logError).toHaveBeenCalledOnce();
    expect(logError.mock.calls[0]?.[0]).toContain("[ERROR]");
    expect(logError.mock.calls[0]?.[0]).toContain("configured port 54332 remained occupied");
    expect(logError.mock.calls[0]?.[0]).toContain("falling back to port 54333");
  });
});
