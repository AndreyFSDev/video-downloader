// Minimal CDP client to check WebView2 without GUI clicks.
// Usage: node tools/cdp-eval.mjs <ws-url> "<js-expression>"

const [, , wsUrl, expression] = process.argv;
if (!wsUrl || !expression) {
  console.error('usage: node tools/cdp-eval.mjs <ws-url> "<expression>"');
  process.exit(2);
}

const socket = new WebSocket(wsUrl);
const pending = new Map();
let nextId = 0;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const call = pending.get(message.id);
  if (!call) return;
  pending.delete(message.id);
  if (message.error) call.reject(new Error(message.error.message));
  else call.resolve(message.result);
});

socket.addEventListener('open', async () => {
  try {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      console.error(JSON.stringify(result.exceptionDetails, null, 2));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify(result.result?.value ?? result.result ?? null, null, 2));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    socket.close();
  }
});

socket.addEventListener('error', (event) => {
  console.error('websocket error', event.message ?? '');
  process.exitCode = 1;
});
