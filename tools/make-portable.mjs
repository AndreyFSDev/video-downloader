// Portable build: a single exe without an installer. yt-dlp and FFmpeg are
// downloaded by the app itself on first launch (src-tauri/src/services/tools.rs).
// Run: npm run portable

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const RELEASE = path.join(ROOT, 'src-tauri/target/release');
const OUT = path.join(ROOT, 'release');

const conf = JSON.parse(fs.readFileSync(path.join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8'));
const version = conf.version;

const exe = path.join(RELEASE, 'video-downloader.exe');
if (!fs.existsSync(exe)) {
  throw new Error(`нет ${exe} — сначала tauri build --no-bundle`);
}

fs.mkdirSync(OUT, { recursive: true });
const target = path.join(OUT, `Viloader-${version}-portable.exe`);
fs.copyFileSync(exe, target);
const mb = (fs.statSync(target).size / 1048576).toFixed(2);
console.log(`release/${path.basename(target)}  (${mb} МБ)`);


