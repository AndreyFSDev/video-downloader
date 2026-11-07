import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { translate } from './messages.ts';

export interface Format {
  format_id: string;
  ext: string;
  width?: number;
  height?: number;
  fps?: number;
  vcodec?: string | null;
  acodec?: string | null;
  video_ext?: string | null;
  audio_ext?: string | null;
  filesize?: number;
  format_note?: string;
}

export interface VideoInfo {
  id: string;
  title: string;
  thumbnail?: string;
  duration?: number;
  uploader?: string;
  webpage_url: string;
  formats: Format[];
}

export interface ProgressEvent {
  taskId?: string;
  progress: number;
  speed?: string;
  eta?: string;
  /** 0 — first file, 1 — second (audio for muxing with video). */
  part?: number;
  merging?: boolean;
}

export interface BoostyQuality {
  id: string;
  label: string;
  height?: number;
}

export interface BoostyMedia {
  id: string;
  kind: 'video' | 'audio' | 'external';
  title: string;
  duration?: number;
  thumbnail?: string;
  /** Item number in the post playlist for yt-dlp. */
  index?: number;
  url?: string;
  qualities: BoostyQuality[];
}

export interface BoostyPostSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  price: number;
  hasAccess: boolean;
  videoCount: number;
  audioCount: number;
  thumbnail?: string;
}

export interface BoostyPostDetail {
  summary: BoostyPostSummary;
  media: BoostyMedia[];
}

export interface BoostyList {
  blog: string;
  kind: 'blog' | 'bundle';
  posts: BoostyPostSummary[];
}

export async function boostyList(
  taskId: string,
  url: string,
  cookiesPath: string | null,
  limit = 50,
  accessibleOnly = false,
): Promise<BoostyList> {
  return invoke('boosty_list', { taskId, url, cookiesPath, limit, accessibleOnly });
}

export async function boostyGetPost(
  taskId: string,
  url: string,
  cookiesPath: string | null,
): Promise<BoostyPostDetail> {
  return invoke('boosty_get_post', { taskId, url, cookiesPath });
}

export async function getFormats(
  taskId: string,
  url: string,
  cookiesPath: string | null,
): Promise<VideoInfo> {
  return invoke('get_formats', { taskId, url, cookiesPath });
}

export const taskBackend = {
  prepare: (taskId: string) => invoke<void>('prepare_task', { taskId }),
  cancel: (taskId: string) => invoke<void>('cancel_download', { taskId }),
  release: (taskId: string) => invoke<void>('release_task', { taskId }),
};

export async function downloadVideo(
  taskId: string,
  url: string,
  formatId: string,
  outputDir: string,
  cookiesPath: string | null,
  playlistIndex?: number | null,
  quality?: string | null,
): Promise<string> {
  return invoke('download_video', {
    taskId,
    url,
    formatId,
    outputDir,
    cookiesPath,
    playlistIndex: playlistIndex ?? null,
    quality: quality ?? null,
  });
}

export async function cancelDownload(taskId: string): Promise<void> {
  return invoke('cancel_download', { taskId });
}

export function onProgress(callback: (event: ProgressEvent) => void): Promise<() => void> {
  return listen<ProgressEvent>('download-progress', (event: { payload: ProgressEvent }) => {
    callback(event.payload);
  });
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || translate('common.unknownError');
  if (typeof error === 'string' && error) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return translate('common.unknownError');
}

export async function saveSiteCookies(site: string, content: string): Promise<string> {
  return invoke('save_site_cookies', { site, content });
}

// Path to the saved site cookies file (or null if there is no file).
export async function getSiteCookiesPath(site: string): Promise<string | null> {
  return invoke('get_site_cookies_path', { site });
}

export async function getSiteCookies(site: string): Promise<string | null> {
  return invoke('get_site_cookies', { site });
}

export async function getCookiesList(): Promise<string[]> {
  return invoke('get_cookies_list');
}

export async function removeSiteCookies(site: string): Promise<void> {
  return invoke('remove_site_cookies', { site });
}

export async function detectSiteFromUrl(url: string): Promise<string | null> {
  return invoke('detect_site_from_url', { url });
}

export interface BoostySubscription {
  blog: string;
  title: string;
  level: string;
}

export interface BoostyAccount {
  loggedIn: boolean;
  expiresAt: number | null;
  canRefresh: boolean;
  subscriptions: BoostySubscription[];
}

export async function boostyAccount(): Promise<BoostyAccount> {
  return invoke('boosty_account');
}

export const BROWSERS = [
  'firefox',
  'chrome',
  'edge',
  'brave',
  'opera',
  'vivaldi',
  'yandex',
  'chromium',
] as const;
export type Browser = (typeof BROWSERS)[number];

export async function importBrowserCookies(
  taskId: string,
  browser: Browser,
  site: string,
): Promise<{ site: string; cookies: number }> {
  return invoke('import_browser_cookies', { taskId, browser, site });
}

export interface ToolsStatus {
  dir: string;
  ytdlp: boolean;
  ffmpeg: boolean;
  ytdlpVersion: string;
  ffmpegVersion: string;
}

export interface ToolsProgress {
  tool: string;
  downloaded: number;
  total: number | null;
  stage: 'download' | 'verify' | 'extract' | 'retry';
}

export async function toolsStatus(): Promise<ToolsStatus> {
  return invoke('tools_status');
}

export async function installTools(): Promise<ToolsStatus> {
  return invoke('install_tools');
}

export function onToolsProgress(callback: (event: ToolsProgress) => void): Promise<() => void> {
  return listen<ToolsProgress>('tools-progress', (event: { payload: ToolsProgress }) => {
    callback(event.payload);
  });
}
