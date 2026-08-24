/**
 * Startup port-availability helper.
 *
 * On restart an old embedded-postgres postmaster (or a previous server
 * process) can still hold the configured port for a short window. The previous
 * behaviour resolved that by silently drifting to the next free port via
 * `detect-port`, which moved PostgreSQL/HTTP onto an unstable port and broke
 * every consumer that references the configured port (watchdogs, backups,
 * health checks). See RENA-57494 / RENA-57511.
 *
 * This helper instead waits for the *configured* port to free up, and never
 * drifts on its own. On timeout it reports the last detected substitute port
 * and lets the caller decide the policy:
 *   - embedded postgres: fall back to a free port, but log at ERROR level;
 *   - HTTP listener: hard-fail instead of rewriting the URL to a new port.
 *
 * The port probe and clock are injected so this module stays dependency-free
 * and unit testable. Call sites pass a `detect-port`-backed probe.
 */

/**
 * Resolves the port that would actually be used when requesting `port`.
 * A `detect-port`-style probe returns `port` when it is free, or the next free
 * port when the requested one is occupied.
 */
export type PortProbe = (port: number) => Promise<number>;

export interface WaitForPortOptions {
  /** Maximum total time to wait for the port to free up. Default 60000ms. */
  timeoutMs?: number;
  /** Delay between probe attempts. Default 500ms. */
  intervalMs?: number;
  /** Injectable clock returning elapsed milliseconds. Defaults to Date.now. */
  now?: () => number;
  /** Injectable delay. Defaults to a setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>;
}

export type PortAvailability =
  | { status: "available"; port: number; waitedMs: number; attempts: number }
  | {
      status: "timeout";
      port: number;
      waitedMs: number;
      attempts: number;
      lastDetectedPort: number;
    };

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_INTERVAL_MS = 500;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

/**
 * Polls `probe(port)` until it reports the configured `port` as free, or until
 * `timeoutMs` elapses. Never selects a substitute port itself: on timeout it
 * returns the last detected substitute so the caller owns the fallback policy.
 */
export async function waitForPortAvailable(
  port: number,
  probe: PortProbe,
  options: WaitForPortOptions = {},
): Promise<PortAvailability> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;

  const start = now();
  let attempts = 0;
  let lastDetectedPort = port;

  for (;;) {
    attempts += 1;
    lastDetectedPort = await probe(port);
    if (lastDetectedPort === port) {
      return { status: "available", port, waitedMs: now() - start, attempts };
    }

    const elapsed = now() - start;
    // Stop before a sleep that would push us past the deadline, so total wait
    // stays bounded by timeoutMs even with coarse intervals.
    if (elapsed + intervalMs >= timeoutMs) {
      return {
        status: "timeout",
        port,
        waitedMs: elapsed,
        attempts,
        lastDetectedPort,
      };
    }

    await sleep(intervalMs);
  }
}
