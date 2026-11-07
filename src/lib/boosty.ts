import type { BoostyMedia, BoostyPostSummary } from './api';
import { translate } from './messages.ts';

export type BoostyUrlKind = 'blog' | 'post' | 'bundle';

function isBoostyHost(host: string): boolean {
  return host === 'boosty.to' || host === 'www.boosty.to';
}

export function boostyUrlKind(url: string): BoostyUrlKind | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (!isBoostyHost(parsed.hostname.toLowerCase())) return null;
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length === 1) {
    return segments[0] === 'app' || segments[0] === 'api' ? null : 'blog';
  }
  if (segments.length === 3 && segments[1] === 'posts') return 'post';
  if (segments.length === 3 && segments[1] === 'bundle') return 'bundle';
  return null;
}

export function isBoostyUrl(url: string): boolean {
  return boostyUrlKind(url) !== null;
}

export function boostyQualityLabel(quality: string): string {
  if (quality === 'best') return translate('composer.quality.best');
  if (quality === 'audio') return translate('composer.mode.audio');
  if (/^\d+p$/.test(quality)) return quality;
  return quality;
}

/** How many channel posts are loaded for selection; the whole feed is a separate button. */
export const BOOSTY_LIST_PAGE = 50;

export function sanitizePathSegment(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  const limited = Array.from(cleaned)
    .slice(0, 80)
    .join('')
    .replace(/[. ]+$/g, '');
  // Windows device names (con, nul, com1…) cannot be created even with an extension
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(limited)) return `_${limited}`;
  return limited || 'untitled';
}

function timestampDate(timestamp: number): Date {
  return new Date(timestamp > 1e12 ? timestamp : timestamp * 1000);
}

export function boostyPostDate(post: BoostyPostSummary): string {
  const date = timestampDate(post.createdAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

export function boostyPostFolderName(post: BoostyPostSummary): string {
  return `${boostyPostDate(post)} ${sanitizePathSegment(post.title)} [${sanitizePathSegment(post.id)}]`;
}

export function boostyPostFolder(base: string, blog: string, post: BoostyPostSummary): string {
  const root = base.trim().replace(/[\\/]+$/, '');
  return `${root}\\Boosty\\${sanitizePathSegment(blog)}\\${boostyPostFolderName(post)}`;
}

export interface BoostySelector {
  formatId: string;
  playlistIndex: number | null;
  quality: string | null;
}

export function boostyMediaSelector(media: BoostyMedia, quality: string): BoostySelector {
  if (media.kind === 'audio') {
    return { formatId: 'bestaudio/best', playlistIndex: null, quality: null };
  }
  if (media.kind === 'external') {
    return { formatId: 'best', playlistIndex: null, quality };
  }
  if (media.index != null) {
    return { formatId: 'best', playlistIndex: media.index + 1, quality };
  }
  // Nested list: yt-dlp does not see it in the post playlist, so we download the direct URL.
  return { formatId: 'best', playlistIndex: null, quality: null };
}

export function boostyMediaUrl(postUrl: string, media: BoostyMedia): string {
  if (media.url) return media.url;
  // A post URL without an item number downloads the first item, not the selected one
  if (media.index == null) throw new Error(translate('boosty.noMediaUrl'));
  return postUrl;
}

export function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}
