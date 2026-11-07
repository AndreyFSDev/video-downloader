import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  boostyMediaSelector,
  boostyMediaUrl,
  boostyPostFolder,
  boostyPostFolderName,
  boostyQualityLabel,
  boostyUrlKind,
  formatDuration,
  sanitizePathSegment,
} from '../src/lib/boosty.ts';

const post = {
  id: 'post-1',
  title: 'Тестовый пост: часть 1/2',
  createdAt: 1_700_000_000,
  updatedAt: 1_700_000_000,
  price: 0,
  hasAccess: true,
  videoCount: 1,
  audioCount: 0,
};

test('boosty url kinds are detected by host and path', () => {
  assert.equal(boostyUrlKind('https://boosty.to/author'), 'blog');
  assert.equal(boostyUrlKind('https://www.boosty.to/author/posts/abc?x=1'), 'post');
  assert.equal(boostyUrlKind('https://boosty.to/author/bundle/abc'), 'bundle');
  assert.equal(boostyUrlKind('https://boosty.to/app/settings'), null);
  assert.equal(boostyUrlKind('https://example.com/author'), null);
  assert.equal(boostyUrlKind('https://boosty.to/author/posts/abc/extra'), null);
  assert.equal(boostyUrlKind('not a url'), null);
});

test('folder names remove windows-forbidden characters and keep unicode', () => {
  const clean = sanitizePathSegment('  Тест/пост: "1" * ? < > |  ');
  assert.ok(!/[\\/:*?"<>|]/.test(clean));
  assert.ok(clean.startsWith('Тест_пост_'));
  assert.equal(sanitizePathSegment('...'), 'untitled');
  assert.equal(sanitizePathSegment(''), 'untitled');
  assert.equal(sanitizePathSegment('con'), '_con');
  assert.equal(sanitizePathSegment('COM1'), '_COM1');
  assert.equal(sanitizePathSegment('nul.txt'), '_nul.txt');
  assert.equal(sanitizePathSegment('console'), 'console');
  assert.ok(Array.from(sanitizePathSegment('я'.repeat(200))).length <= 80);
});

test('post folder is date + safe title + id', () => {
  const name = boostyPostFolderName(post);
  assert.match(name, /^\d{4}\.\d{2}\.\d{2} /);
  assert.ok(name.includes('[post-1]'));
  assert.ok(!/[\\/:*?"<>|]/.test(name.replace(/\[|\]/g, '')));
  assert.equal(
    boostyPostFolder('C:\\Downloads\\', 'author', post).startsWith(
      'C:\\Downloads\\Boosty\\author\\',
    ),
    true,
  );
});

test('media selector distinguishes playlist, direct and audio sources', () => {
  assert.deepEqual(
    boostyMediaSelector({ id: 'v', kind: 'video', title: 'V', index: 0, qualities: [] }, '1080p'),
    { formatId: 'best', playlistIndex: 1, quality: '1080p' },
  );
  assert.deepEqual(
    boostyMediaSelector({ id: 'v2', kind: 'video', title: 'V2', qualities: [] }, 'best'),
    { formatId: 'best', playlistIndex: null, quality: null },
  );
  assert.deepEqual(
    boostyMediaSelector({ id: 'a', kind: 'audio', title: 'A', qualities: [] }, 'best'),
    { formatId: 'bestaudio/best', playlistIndex: null, quality: null },
  );
  assert.deepEqual(
    boostyMediaSelector(
      { id: 'e', kind: 'external', title: 'E', url: 'https://youtu.be/x', qualities: [] },
      '720p',
    ),
    { formatId: 'best', playlistIndex: null, quality: '720p' },
  );
});

test('quality labels and durations are human-readable', () => {
  assert.equal(boostyQualityLabel('best'), 'Лучшее');
  assert.equal(boostyQualityLabel('1080p'), '1080p');
  assert.equal(boostyQualityLabel('audio'), 'Аудио');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(3599), '59:59');
  assert.equal(formatDuration(3600), '1:00:00');
  assert.equal(formatDuration(45296), '12:34:56');
  assert.equal(formatDuration(undefined), '');
});

test('media without direct url and index does not fall back to the first post item', () => {
  const post = 'https://boosty.to/a/posts/p';
  assert.throws(() => boostyMediaUrl(post, { id: 'v', kind: 'video', title: 'V', qualities: [] }));
  assert.equal(
    boostyMediaUrl(post, { id: 'v', kind: 'video', title: 'V', qualities: [], index: 1 }),
    post,
  );
});
