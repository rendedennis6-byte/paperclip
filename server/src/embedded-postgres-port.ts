export type EmbeddedPostgresPortResolution = {
  port: number;
  timedOut: boolean;
  waitedMs: number;
};

type WaitForEmbeddedPostgresPortOptions = {
  timeoutMs?: number;
  retryIntervalMs?: number;
  detectAvailablePort: (preferredPort: number) => Promise<number>;
  sleep?: (delayMs: number) => Promise<void>;
  now?: () => number;
};

const sleep = (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs));

export async function waitForEmbeddedPostgresPort(
  preferredPort: number,
  options: WaitForEmbeddedPostgresPortOptions,
): Promise<EmbeddedPostgresPortResolution> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const retryIntervalMs = options.retryIntervalMs ?? 1_000;
  const wait = options.sleep ?? sleep;
  const now = options.now ?? Date.now;
  const startedAt = now();

  let detectedPort = await options.detectAvailablePort(preferredPort);
  while (detectedPort !== preferredPort && now() - startedAt < timeoutMs) {
    const remainingMs = timeoutMs - (now() - startedAt);
    await wait(Math.min(retryIntervalMs, remainingMs));
    detectedPort = await options.detectAvailablePort(preferredPort);
  }

  const waitedMs = Math.max(0, now() - startedAt);
  return {
    port: detectedPort,
    timedOut: detectedPort !== preferredPort,
    waitedMs,
  };
}
