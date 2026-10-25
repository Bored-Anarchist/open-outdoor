/** Timers cannot interrupt synchronous work; check elapsed time at every stage boundary too. */
export async function withDeadline<T>(
  operation: (signal: AbortSignal, assertActive: () => void) => Promise<T>,
  milliseconds: number,
  timeoutError: () => Error,
): Promise<T> {
  const controller = new AbortController();
  const started = performance.now();
  const assertActive = () => {
    if (!controller.signal.aborted && performance.now() - started >= milliseconds)
      controller.abort(timeoutError());
    controller.signal.throwIfAborted();
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        const error = timeoutError();
        controller.abort(error);
        reject(error);
      }, milliseconds);
    });
    const result = await Promise.race([operation(controller.signal, assertActive), timeout]);
    assertActive();
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
