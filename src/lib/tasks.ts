import { translate } from './messages.ts';
export interface TaskBackend {
  prepare: (taskId: string) => Promise<void>;
  cancel: (taskId: string) => Promise<void>;
  release: (taskId: string) => Promise<void>;
}

// WebView event loop. The task is registered in the backend before the first cancellable await.
export async function runTask<T>(
  backend: TaskBackend,
  taskId: string,
  signal: AbortSignal,
  action: () => Promise<T>,
): Promise<T> {
  await backend.prepare(taskId);
  let cancellation: Promise<void> | undefined;
  const cancel = () => {
    // A cancel failure must not replace the task outcome: release below shuts it down anyway.
    cancellation ??= backend.cancel(taskId).catch((error) => console.warn('cancel failed', error));
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (signal.aborted) throw new DOMException(translate('common.cancelled'), 'AbortError');
    // A cancellation that arrives after completion does not undo the result: the file is already on disk.
    return await action();
  } finally {
    signal.removeEventListener('abort', cancel);
    await cancellation;
    await backend.release(taskId);
  }
}
