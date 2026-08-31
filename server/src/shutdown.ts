type HotRestartShutdownPreparation = {
  skipDrain: boolean;
};

type ShutdownLogger = {
  info(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
};

export type ClosableHttpServer = {
  close(callback: (error?: Error) => void): unknown;
  closeIdleConnections?: () => void;
  closeAllConnections?: () => void;
};

// `server.close()` reports this code when the listener has already stopped.
// The shutdown path may run twice (early hook plus coordinated teardown), so
// the second call is an idempotent success, not a failure to bound.
const SERVER_NOT_RUNNING_CODE = "ERR_SERVER_NOT_RUNNING";

/**
 * Close the HTTP listener without letting a single client connection hold the
 * early signal path open forever.
 *
 * The order matters. Idle keep-alive sockets are reaped immediately: no
 * request is in flight on them, so dropping them costs nothing and removes the
 * common reason `close()` never settles. Sockets that are still serving a
 * request — and upgraded sockets such as SSE or WebSocket, which
 * `closeIdleConnections()` never touches — keep the close pending until the
 * deadline expires. Only then are they forced down, so an in-flight response
 * is never truncated ahead of its budget.
 *
 * The deadline timer stays referenced on purpose. An `unref()`ed timer lets
 * the event loop drain while `close()` is still pending, which is the exact
 * hang this deadline exists to bound. Every path clears the timer, so the
 * helper never keeps the process alive after it resolves.
 *
 * Resolves `true` when the listener closed within the deadline, `false` when
 * the deadline forced it.
 */
export async function closeHttpServerWithDeadline(
  server: ClosableHttpServer,
  timeoutMs = 5_000,
  onTimeout?: () => void,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const closePromise = new Promise<boolean>((resolve) => {
    server.close((error) => {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      resolve(!error || code === SERVER_NOT_RUNNING_CODE);
    });
    server.closeIdleConnections?.();
  });

  const deadlinePromise = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      timer = undefined;
      server.closeAllConnections?.();
      onTimeout?.();
      resolve(false);
    }, timeoutMs);
  });

  try {
    return await Promise.race([closePromise, deadlinePromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }
}

/**
 * Runs the final, ordered teardown of the server. It awaits the application
 * service cleanup first, so a live setup-token login session stops and releases
 * its sandbox lease before the database and the provider stop. The caller runs
 * `process.exit(0)` only after this helper resolves, so an orderly shutdown
 * never leaves a sandbox lease or confidential login state alive past the
 * process exit.
 *
 * A step that rejects does not stop the teardown. The helper logs the error and
 * continues to the next step. A failed setup-token lease release stays a
 * durable record for the startup reaper; the helper surfaces it in the log
 * instead of blocking the exit path.
 */
export async function finalizeServerShutdown(input: {
  signal: "SIGINT" | "SIGTERM";
  shutdownAppServices: (() => Promise<void>) | undefined;
  stopEmbeddedPostgres: (() => Promise<void>) | null;
  shutdownInstrumentation: () => Promise<void>;
  shutdownSentry: () => Promise<void>;
  log: ShutdownLogger;
}): Promise<void> {
  const { signal } = input;

  // Await the application service cleanup, so a live setup-token login session
  // releases its sandbox lease before the database and the provider stop. A
  // rejected cleanup stays durable for the reaper; it does not block the exit.
  try {
    await input.shutdownAppServices?.();
  } catch (err) {
    input.log.error({ err, signal }, "Application service shutdown failed");
  }

  if (input.stopEmbeddedPostgres) {
    input.log.info({ signal }, "Stopping embedded PostgreSQL");
    try {
      await input.stopEmbeddedPostgres();
    } catch (err) {
      input.log.error({ err }, "Failed to stop embedded PostgreSQL cleanly");
    }
  }

  // Flush buffered OTel spans before the process goes away; without this await
  // the exporter's final batch is dropped on exit.
  await input.shutdownInstrumentation();

  // Flush buffered Sentry events before the process goes away; without this
  // await the last events are dropped on exit.
  await input.shutdownSentry();
}

const COORDINATED_SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

type ShutdownSignalTarget = {
  rawListeners(eventName: string): Function[];
  removeListener(eventName: string, listener: (...args: any[]) => void): unknown;
};

/**
 * Some dependencies eagerly install process signal handlers as an import side
 * effect. Paperclip must remain the sole owner of SIGINT/SIGTERM ordering: its
 * handler first snapshots live heartbeat runs and only then stops embedded
 * infrastructure. Remove only listeners added by the supplied import, while
 * preserving every listener that was already registered.
 */
export async function loadWithoutCoordinatedShutdownSignalHooks<T>(
  load: () => Promise<T>,
  signalTarget: ShutdownSignalTarget = process,
) {
  const listenersBeforeLoad = new Map(
    COORDINATED_SHUTDOWN_SIGNALS.map((signal) => [
      signal,
      signalTarget.rawListeners(signal),
    ]),
  );

  let loaded: T;
  try {
    loaded = await load();
  } finally {
    for (const signal of COORDINATED_SHUTDOWN_SIGNALS) {
      const remainingBeforeLoad = [...(listenersBeforeLoad.get(signal) ?? [])];
      for (const listener of signalTarget.rawListeners(signal)) {
        const existingIndex = remainingBeforeLoad.indexOf(listener);
        if (existingIndex >= 0) {
          remainingBeforeLoad.splice(existingIndex, 1);
          continue;
        }
        signalTarget.removeListener(signal, listener as (...args: any[]) => void);
      }
    }
  }

  return loaded;
}

export async function coordinateHeartbeatSchedulerShutdown<
  TPreparation extends HotRestartShutdownPreparation,
>(input: {
  signal: "SIGINT" | "SIGTERM";
  prepareHotRestartShutdown: ((signal: "SIGINT" | "SIGTERM") => Promise<TPreparation>) | null;
  waitForHeartbeatSchedulerIdle: () => Promise<void>;
  schedulerIdleTimeoutMs?: number;
}): Promise<{
  hotRestart: TPreparation | null;
  preparationError: unknown;
  waitedForSchedulerIdle: boolean;
}> {
  let hotRestart: TPreparation | null = null;
  let preparationError: unknown = null;

  // The signal handler stops the scheduler before entering this coordinator.
  // Quiesce any callback that was already in flight before querying running
  // rows for the shutdown snapshot, otherwise a late queue claim can create a
  // run that is absent from both the snapshot and the selective drain set.
  let waitedForSchedulerIdle = true;
  if (input.schedulerIdleTimeoutMs === undefined) {
    await input.waitForHeartbeatSchedulerIdle();
  } else {
    waitedForSchedulerIdle = await Promise.race([
      input.waitForHeartbeatSchedulerIdle().then(() => true),
      new Promise<false>((resolve) => {
        const timeout = setTimeout(() => resolve(false), input.schedulerIdleTimeoutMs);
        timeout.unref?.();
      }),
    ]);
  }

  // A hot-restart snapshot is only authoritative after scheduler quiescence.
  if (!waitedForSchedulerIdle) {
    return { hotRestart: null, preparationError: null, waitedForSchedulerIdle: false };
  }

  if (input.prepareHotRestartShutdown) {
    try {
      hotRestart = await input.prepareHotRestartShutdown(input.signal);
    } catch (err) {
      preparationError = err;
    }
  }

  return {
    hotRestart,
    preparationError,
    waitedForSchedulerIdle,
  };
}
