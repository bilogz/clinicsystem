import { onUnmounted } from 'vue';

type RunOptions = {
  silent?: boolean;
  notifyOnSilentError?: boolean;
  onStart?: () => void;
  onFinish?: () => void;
  onError?: (error: unknown) => void;
};

type PollOptions = {
  immediate?: boolean;
  pauseWhenHidden?: boolean;
  refreshOnVisible?: boolean;
};

export function useRealtimeListSync() {
  let requestToken = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let pollTask: (() => void | Promise<void>) | null = null;
  let pollIntervalMs = 0;
  let pollOptions: Required<PollOptions> = {
    immediate: false,
    pauseWhenHidden: true,
    refreshOnVisible: true
  };
  let visibilityBound = false;

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
      if (token === requestToken && (!options.silent || options.notifyOnSilentError)) {
        options.onError?.(error);
      }
      return undefined;
    } finally {
      if (!options.silent && token === requestToken) {
        options.onFinish?.();
      }
    }
  }

  async function runPollTick(): Promise<void> {
    if (!pollTask) return;
    if (pollOptions.pauseWhenHidden && typeof document !== 'undefined' && document.hidden) {
      scheduleNextPoll();
      return;
    }
    if (inFlight) {
      scheduleNextPoll();
      return;
    }
    inFlight = true;
    try {
      await pollTask();
    } catch {
      // Background polling errors are handled by each task's own logic.
    } finally {
      inFlight = false;
      scheduleNextPoll();
    }
  }

  function scheduleNextPoll(): void {
    if (!pollTask || pollIntervalMs <= 0) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void runPollTick();
    }, pollIntervalMs);
  }

  function onVisibilityChange(): void {
    if (!pollTask) return;
    if (typeof document === 'undefined' || document.hidden) return;
    if (pollOptions.refreshOnVisible) {
      void runPollTick();
    } else {
      scheduleNextPoll();
    }
  }

  function bindVisibilityListener(): void {
    if (visibilityBound || typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', onVisibilityChange);
    visibilityBound = true;
  }

  function unbindVisibilityListener(): void {
    if (!visibilityBound || typeof document === 'undefined') return;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    visibilityBound = false;
  }

  function startPolling(task: () => void | Promise<void>, intervalMs: number, options: PollOptions = {}): void {
    stopPolling();
    pollTask = task;
    pollIntervalMs = intervalMs;
    pollOptions = {
      immediate: options.immediate ?? false,
      pauseWhenHidden: options.pauseWhenHidden ?? true,
      refreshOnVisible: options.refreshOnVisible ?? true
    };
    bindVisibilityListener();
    if (pollOptions.immediate) {
      void runPollTick();
      return;
    }
    scheduleNextPoll();
  }

  function stopPolling(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    pollTask = null;
    inFlight = false;
    unbindVisibilityListener();
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
