import { onUnmounted } from 'vue';

type RunOptions = {
  silent?: boolean;
  onStart?: () => void;
  onFinish?: () => void;
  onError?: (error: unknown) => void;
};

export function useRealtimeListSync() {
  let requestToken = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function runLatest<T>(task: () => Promise<T>, options: RunOptions = {}): Promise<T | undefined> {
    const token = ++requestToken;
    if (!options.silent) {
      options.onStart?.();
    }

    try {
      const result = await task();
      if (token !== requestToken) return undefined;
      return result;
    } catch (error) {
      if (token === requestToken) {
        options.onError?.(error);
      }
      return undefined;
    } finally {
      if (!options.silent && token === requestToken) {
        options.onFinish?.();
      }
    }
  }

  function startPolling(task: () => void | Promise<void>, intervalMs: number): void {
    stopPolling();
    timer = setInterval(() => {
      void task();
    }, intervalMs);
  }

  function stopPolling(): void {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  function invalidatePending(): void {
    requestToken += 1;
  }

  onUnmounted(() => {
    stopPolling();
  });

  return {
    runLatest,
    startPolling,
    stopPolling,
    invalidatePending
  };
}
