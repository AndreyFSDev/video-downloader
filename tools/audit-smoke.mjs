import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'audit-2026-11-04', 'live');
fs.mkdirSync(out, { recursive: true });
const exe =
  process.env.VD_AUDIT_EXE ?? path.join(root, 'src-tauri/target/release/video-downloader.exe');
const port = Number(process.env.VD_AUDIT_CDP ?? 9235);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, label, timeout = 20000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await predicate()) return;
    await delay(100);
  }
  throw new Error(`Timeout: ${label}`);
}

const clip = path.join(out, 'clip.mp4');
execFileSync(
  path.join(root, 'src-tauri/binaries/ffmpeg.exe'),
  [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=blue:s=160x90:r=12',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=22050',
    '-t',
    '2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    '-y',
    clip,
  ],
  { windowsHide: true, timeout: 30000 },
);
const data = fs.readFileSync(clip);
const held = new Set();
const server = http.createServer((request, response) => {
  if (request.url === '/silent.mp4') {
    held.add(response);
    response.on('close', () => held.delete(response));
    return;
  }
  response.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': data.length });
  if (request.method === 'HEAD') return response.end();
  if (request.url === '/slow.mp4') {
    held.add(response);
    let offset = 0;
    const timer = setInterval(() => {
      response.write(data.subarray(offset, offset + 256));
      offset += 256;
      if (offset >= data.length) {
        clearInterval(timer);
        response.end();
      }
    }, 100);
    response.on('close', () => {
      clearInterval(timer);
      held.delete(response);
    });
  } else {
    response.end(data);
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const app = spawn(exe, [], {
  cwd: path.dirname(exe),
  windowsHide: true,
  stdio: 'ignore',
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
});
let socket;
let storage;
let restored = false;
let passed = 0;
let sequence = 0;
const pending = new Map();
const check = (label) => {
  passed++;
  console.log(`PASS ${label}`);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 30000);
    pending.set(id, (reply) => {
      clearTimeout(timer);
      reply.error ? reject(new Error(JSON.stringify(reply.error))) : resolve(reply.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails)
    throw new Error(
      result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails),
    );
  return result.result?.value;
}
const click = (text, selector = 'button') =>
  evaluate(
    `(() => { const button = [...document.querySelectorAll(${JSON.stringify(selector)})].find(b => b.textContent.trim() === ${JSON.stringify(text)} && !b.disabled); if (!button) throw new Error('Button unavailable: ' + ${JSON.stringify(text)}); button.click(); return true; })()`,
  );
const type = (selector, value) =>
  evaluate(
    `(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!input || input.disabled) throw new Error('Input unavailable'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
  );
const _text = () => evaluate('document.body.innerText');
async function analyze(url) {
  await type('.url-input', url);
  await click('Анализировать');
  await waitFor(() => evaluate('!!document.querySelector(".video-info-card")'), 'metadata');
}
function closeNative() {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '$p=Get-Process -Id $env:VD_SMOKE_PID -ErrorAction Stop; if(-not $p.CloseMainWindow()){throw "No main window"}',
    ],
    { windowsHide: true, env: { ...process.env, VD_SMOKE_PID: String(app.pid) }, timeout: 10000 },
  );
}

try {
  let target;
  await waitFor(
    async () => {
      try {
        target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(
          (page) => page.type === 'page' && page.url.startsWith('http://tauri.localhost'),
        );
        return !!target;
      } catch {
        return false;
      }
    },
    'WebView2 CDP',
    30000,
  );
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(String(data));
    const done = pending.get(message.id);
    if (done) {
      pending.delete(message.id);
      done(message);
    }
  });
  await send('Runtime.enable');
  await waitFor(() => evaluate('!!document.querySelector(".url-input")'), 'download page');
  storage = await evaluate('Object.fromEntries(Object.entries(localStorage))');
  check('release window rendered');

  await click('Настройки');
  await type('#download-path', path.join(out, 'downloads'));
  await click('Скачать', '.tab-btn');
  // The navigation label includes an icon but its text remains "Скачать".
  await waitFor(
    () =>
      evaluate(
        '!!document.querySelector(".url-input") && !document.querySelector(".url-input").disabled',
      ),
    'download tab',
  );
  check('settings round trip');

  await type('.url-input', `${base}/silent.mp4`);
  await click('Анализировать');
  await waitFor(() => held.size > 0, 'silent analysis connected');
  await click('Отмена');
  await waitFor(() => held.size === 0, 'analysis process/socket closed', 3000);
  assert.equal(await evaluate('!!document.querySelector(".video-info-card")'), false);
  check('cancel analysis kills real yt-dlp');

  await analyze(`${base}/clip.mp4`);
  await click('Скачать', '.download-btn');
  await waitFor(
    () => evaluate('!!document.querySelector(".history-item.status-completed")'),
    'completed download',
    30000,
  );
  assert.ok(fs.readdirSync(path.join(out, 'downloads')).some((name) => name.endsWith('.mp4')));
  check('real mp4 download and history completion');

  await analyze(`${base}/slow.mp4`);
  await evaluate('window.confirm = () => true');
  await click('Скачать', '.download-btn');
  await waitFor(
    () => evaluate('!!document.querySelector(".download-item.active")'),
    'active history record',
  );
  await click('Очистить');
  assert.equal(await evaluate('!!document.querySelector(".download-item.active")'), true);
  check('clear history preserves active download');
  await click('Отмена');
  await waitFor(
    () =>
      evaluate(
        '!!document.querySelector(".history-item-error") && document.querySelector(".history-item-error").textContent.includes("Отменено")',
      ),
    'cancelled history',
  );
  await waitFor(() => held.size === 0, 'download socket closed', 3000);
  check('cancel download preserves its final record');

  await evaluate(
    `(() => { localStorage.clear(); for (const [key,value] of Object.entries(${JSON.stringify(storage)})) localStorage.setItem(key,value); return true; })()`,
  );
  restored = true;
  const cookies = path.join(out, 'dummy-cookies.txt');
  fs.writeFileSync(
    cookies,
    '# Netscape HTTP Cookie File\n.example.invalid\tTRUE\t/\tFALSE\t2000000000\tsession\tdummy',
  );
  await evaluate(
    `(() => { const invoke=window.__TAURI_INTERNALS__.invoke; window.__nativeWorker=invoke('prepare_task',{taskId:'exit-smoke'}).then(() => invoke('download_video',{taskId:'exit-smoke',url:${JSON.stringify(`${base}/silent.mp4`)},formatId:'best',outputDir:${JSON.stringify(path.join(out, 'downloads'))},cookiesPath:${JSON.stringify(cookies)}})).catch(() => {}); return true; })()`,
  );
  await waitFor(() => held.size > 0, 'native exit worker connected');
  closeNative();
  await waitFor(() => app.exitCode !== null, 'native window exit', 10000);
  await waitFor(() => held.size === 0, 'no worker survives application exit', 3000);
  const staging = path.join(process.env.APPDATA, 'video-downloader/cookies/.work');
  if (fs.existsSync(staging))
    assert.ok(!fs.readdirSync(staging).some((name) => name.startsWith(`${app.pid}-`)));
  check('native exit terminates worker and removes staged cookies');
  console.log(`RESULT ${passed}/${passed} PASS`);
} finally {
  if (socket?.readyState === WebSocket.OPEN && storage && !restored) {
    await evaluate(
      `(() => { localStorage.clear(); for (const [key,value] of Object.entries(${JSON.stringify(storage)})) localStorage.setItem(key,value); return true; })()`,
    ).catch(() => {});
  }
  if (app.exitCode === null) {
    try {
      closeNative();
    } catch {
      app.kill();
    }
  }
  socket?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  for (const done of pending.values()) done({ error: 'Smoke finished' });
  pending.clear();
}

