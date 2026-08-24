import { describe, expect, it, vi } from "vitest";
import { waitForPortAvailable } from "./port-availability.js";

// A deterministic fake clock: time only advances when the injected sleep is
// awaited, so tests never depend on real timers.
function fakeClock() {
  let nowMs = 0;
  return {
    now: () => nowMs,
    sleep: async (ms: number) => {
      nowMs += ms;
    },
  };
}

describe("waitForPortAvailable", () => {
  it("resolves immediately when the configured port is already free", async () => {
    const clock = fakeClock();
    const probe = vi.fn(async (port: number) => port);

    const result = await waitForPortAvailable(54329, probe, {
      timeoutMs: 60_000,
      intervalMs: 500,
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(result.status).toBe("available");
    expect(result).toMatchObject({ status: "available", port: 54329, attempts: 1, waitedMs: 0 });
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("keeps retrying and succeeds once the old holder releases the port", async () => {
    const clock = fakeClock();
    // Busy (drift to +1) for the first two probes, then the configured port frees up.
    const probe = vi
      .fn<(port: number) => Promise<number>>()
      .mockResolvedValueOnce(54330)
      .mockResolvedValueOnce(54330)
      .mockResolvedValueOnce(54329);

    const result = await waitForPortAvailable(54329, probe, {
      timeoutMs: 60_000,
      intervalMs: 500,
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(result).toMatchObject({ status: "available", port: 54329, attempts: 3 });
    // Two sleeps between the three probes.
    expect(result.waitedMs).toBe(1000);
    expect(probe).toHaveBeenCalledTimes(3);
  });

  it("times out without drifting when the port never frees, exposing the substitute", async () => {
    const clock = fakeClock();
    const probe = vi.fn(async () => 56000); // always busy -> next free port

    const result = await waitForPortAvailable(54329, probe, {
      timeoutMs: 2_000,
      intervalMs: 500,
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(result.status).toBe("timeout");
    // Never reports "available", and surfaces the detected substitute for the caller's policy.
    expect(result).toMatchObject({
      status: "timeout",
      port: 54329,
      lastDetectedPort: 56000,
    });
    // 2000ms budget / 500ms interval -> stops before the sleep that would cross the deadline.
    expect(result.waitedMs).toBeLessThanOrEqual(2_000);
    expect((result as { attempts: number }).attempts).toBeGreaterThanOrEqual(1);
  });

  it("uses the 60s/500ms defaults and honours a custom probe", async () => {
    let calls = 0;
    // Free on the 5th probe; with defaults that is well inside the 60s budget.
    const probe = async (port: number) => (++calls >= 5 ? port : port + 1);
    const clock = fakeClock();

    const result = await waitForPortAvailable(3100, probe, {
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(result).toMatchObject({ status: "available", port: 3100, attempts: 5 });
    // 4 default 500ms sleeps between 5 probes.
    expect(result.waitedMs).toBe(2000);
  });
});
