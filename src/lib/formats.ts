import { translate } from './messages.ts';
export interface FormatChoice {
  format_id: string;
  ext: string;
  height?: number;
  fps?: number;
  vcodec?: string | null;
  acodec?: string | null;
  video_ext?: string | null;
  audio_ext?: string | null;
  filesize?: number;
}

export function qualityOptions(best: string): Array<{ value: string; label: string }> {
  return [
    { value: 'best', label: best },
    { value: '2160p', label: '4K (2160p)' },
    { value: '1440p', label: '2K (1440p)' },
    { value: '1080p', label: 'Full HD (1080p)' },
    { value: '720p', label: 'HD (720p)' },
    { value: '480p', label: 'SD (480p)' },
  ];
}

function present(value: string | null | undefined): boolean {
  return !!value && value !== 'none';
}

export function hasVideo(format: FormatChoice): boolean {
  return present(format.vcodec) || present(format.video_ext);
}

export function hasAudio(format: FormatChoice): boolean {
  return present(format.acodec) || present(format.audio_ext);
}

export function isAudioOnly(format: FormatChoice): boolean {
  return hasAudio(format) && !hasVideo(format);
}

// A direct file often comes without vcodec/acodec but with video_ext.
// Storyboards (mhtml, vcodec none + acodec none) are not put into the list.
export function isVideoChoice(format: FormatChoice): boolean {
  if (format.ext === 'mhtml') return false;
  if (isAudioOnly(format)) return false;
  if (hasVideo(format)) return true;
  const codecsKnown = format.vcodec != null || format.acodec != null;
  return !codecsKnown;
}

// +bestaudio only when yt-dlp explicitly said "video without audio".
// A direct mp4 has null codecs: an audio track cannot be added, muxing fails.
export function formatSelector(format: FormatChoice, formats?: FormatChoice[]): string {
  const explicitVideoOnly =
    present(format.vcodec) && format.acodec === 'none' && (!formats || formats.some(isAudioOnly));
  return explicitVideoOnly ? `${format.format_id}+bestaudio` : format.format_id;
}

export function formatKind(format: FormatChoice): 'video' | 'audio' {
  return isAudioOnly(format) ? 'audio' : 'video';
}

export function formatChoiceLabel(format: FormatChoice, formats?: FormatChoice[]): string {
  const video = hasVideo(format);
  const audio = hasAudio(format);
  const quality =
    !video && audio ? translate('format.audio') : format.height ? `${format.height}p` : format.ext;
  const size = format.filesize ? ` (${(format.filesize / 1024 / 1024).toFixed(1)} MB)` : '';
  const merge =
    formatSelector(format, formats) !== format.format_id
      ? translate('format.withAudio')
      : present(format.vcodec) && format.acodec === 'none'
        ? translate('format.noAudio')
        : '';
  return `${quality} • ${format.ext}${size}${merge}`;
}

function score(format: FormatChoice): number {
  let value = 0;
  if (hasAudio(format)) value += 1_000_000;
  if (format.ext === 'mp4') value += 10_000;
  else if (format.ext === 'webm' || format.ext === 'mkv') value += 1_000;
  value += Math.round(format.fps || 0);
  return value;
}

function targetHeight(preferred: string): number {
  if (!preferred || preferred === 'best') return Number.POSITIVE_INFINITY;
  const height = parseInt(preferred, 10);
  return Number.isFinite(height) && height > 0 ? height : Number.POSITIVE_INFINITY;
}

export function pickFormatId(formats: FormatChoice[], preferred: string): string {
  const videos = formats.filter((format) => isVideoChoice(format));
  if (videos.length === 0) {
    return formats.find((format) => isAudioOnly(format))?.format_id ?? '';
  }
  const target = targetHeight(preferred);
  const within = videos.filter((format) => (format.height || 0) <= target);
  const pool = within.length > 0 ? within : videos;
  const bestHeight = Math.max(...pool.map((format) => format.height || 0));
  const same = pool.filter((format) => (format.height || 0) === bestHeight);
  same.sort((a, b) => score(b) - score(a));
  return same[0]?.format_id ?? '';
}
