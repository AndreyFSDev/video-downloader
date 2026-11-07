import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runTask, type TaskBackend } from '../src/lib/tasks.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('cancel before registration completes never starts the worker', async () => {
  const prepared = deferred<void>();
  const controller = new AbortController();
  const calls: string[] = [];
  const backend: TaskBackend = {
    prepare: () => prepared.promise,
    cancel: async () => {
      calls.push('cancel');
    },
    release: async () => {
      calls.push('release');
    },
  };
  const work = runTask(backend, 'test', controller.signal, async () => {
    calls.push('worker');
  });
  controller.abort();
  prepared.resolve();
  await assert.rejects(work, { name: 'AbortError' });
  assert.deepEqual(calls, ['release']);
});

test('cancel reaches the registered worker once and waits for cleanup', async () => {
  const started = deferred<void>();
  const completed = deferred<void>();
  const controller = new AbortController();
  const calls: string[] = [];
  const backend: TaskBackend = {
    prepare: async () => {
      calls.push('prepare');
    },
    cancel: async () => {
      calls.push('cancel');
      completed.resolve();
    },
    release: async () => {
      calls.push('release');
    },
  };
  const work = runTask(backend, 'test', controller.signal, async () => {
    started.resolve();
    await completed.promise;
    calls.push('done');
    throw new Error('Загрузка отменена');
  });
  await started.promise;
  controller.abort();
  controller.abort();
  await assert.rejects(work, /отменена/);
  assert.deepEqual(calls, ['prepare', 'cancel', 'done', 'release']);
});

test('cancel that arrives after the worker finished keeps its result', async () => {
  const controller = new AbortController();
  const calls: string[] = [];
  const backend: TaskBackend = {
    prepare: async () => {},
    cancel: async () => {
      calls.push('cancel');
    },
    release: async () => {
      calls.push('release');
    },
  };
  const work = runTask(backend, 'test', controller.signal, async () => {
    controller.abort();
    return 'saved';
  });
  assert.equal(await work, 'saved');
  assert.deepEqual(calls, ['cancel', 'release']);
});

test('failed cancel keeps the worker outcome and still releases the task', async () => {
  const controller = new AbortController();
  const calls: string[] = [];
  const backend: TaskBackend = {
    prepare: async () => {},
    cancel: async () => {
      calls.push('cancel');
      throw new Error('ipc down');
    },
    release: async () => {
      calls.push('release');
    },
  };
  const work = runTask(backend, 'test', controller.signal, async () => {
    controller.abort();
    throw new Error('Загрузка отменена');
  });
  await assert.rejects(work, /отменена/);
  assert.deepEqual(calls, ['cancel', 'release']);
});
