import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type FormatChoice,
  formatChoiceLabel,
  formatSelector,
  isVideoChoice,
  pickFormatId,
} from '../src/lib/formats.ts';

const formats: FormatChoice[] = [
  { format_id: '18', ext: 'mp4', height: 360, vcodec: 'avc1', acodec: 'mp4a' },
  { format_id: '22', ext: 'mp4', height: 720, vcodec: 'avc1', acodec: 'mp4a' },
  { format_id: '137', ext: 'mp4', height: 1080, vcodec: 'avc1', acodec: 'none' },
  { format_id: '248', ext: 'webm', height: 1080, vcodec: 'vp9', acodec: 'none' },
  { format_id: '140', ext: 'm4a', vcodec: 'none', acodec: 'mp4a' },
  { format_id: 'sb0', ext: 'mhtml', vcodec: 'none', acodec: 'none' },
];

test('preferred height picks the closest format and prefers mp4 at that height', () => {
  assert.equal(pickFormatId(formats, '1080p'), '137');
  assert.equal(pickFormatId(formats, '720p'), '22');
  assert.equal(pickFormatId(formats, 'best'), '137');
  assert.equal(pickFormatId(formats, '480p'), '18');
});

test('video-only format downloads with audio, a direct file does not', () => {
  assert.equal(formatSelector(formats[2]), '137+bestaudio');
  assert.equal(formatSelector(formats[1]), '22');
  assert.match(formatChoiceLabel(formats[2]), /\+ звук/);
  const direct: FormatChoice = {
    format_id: 'mp4',
    ext: 'mp4',
    video_ext: 'mp4',
    audio_ext: 'none',
  };
  assert.equal(isVideoChoice(direct), true);
  assert.equal(formatSelector(direct), 'mp4');
  assert.equal(pickFormatId([direct], '1080p'), 'mp4');
  assert.equal(isVideoChoice(formats[5]), false);
  assert.equal(pickFormatId([formats[5]], 'best'), '');
});

test('audio-only list falls back when there is no video', () => {
  assert.equal(pickFormatId([formats[4]], '1080p'), '140');
  assert.match(formatChoiceLabel(formats[4]), /^аудио/);
});

test('silent video does not request nonexistent standalone audio', () => {
  const video = formats[2];
  assert.equal(formatSelector(video, [video]), '137');
  assert.equal(formatSelector(video, [video, formats[0]]), '137');
  assert.match(formatChoiceLabel(video, [video]), /без звука/);
  assert.equal(formatSelector(video, [video, formats[4]]), '137+bestaudio');
  assert.equal(formatSelector({ ...video, acodec: null, audio_ext: 'm4a' }), '137');
});
