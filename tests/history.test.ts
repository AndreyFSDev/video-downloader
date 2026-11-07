import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useDownloadHistory } from '../src/hooks/useDownloadHistory.ts';
import { isAudioRecord } from '../src/lib/history.ts';

test('clearing history keeps an active download and its final result', () => {
  const store = useDownloadHistory;
  store.setState({ records: [] });
  store.getState().addRecord({
    id: 'active',
    url: 'https://example.com',
    title: 'Fixture',
    site: 'example',
    format: 'mp4',
    formatLabel: 'mp4',
    outputPath: 'downloads',
    timestamp: 1,
    status: 'downloading',
  });
  store.getState().clearHistory();
  assert.equal(store.getState().records.length, 1);
  store.getState().updateRecord('active', { status: 'completed' });
  assert.equal(store.getState().records[0].status, 'completed');
  store.getState().clearHistory();
  assert.equal(store.getState().records.length, 0);
});

test('audio filter understands kind, label, and legacy ids', () => {
  assert.equal(isAudioRecord({ kind: 'audio', format: '140', formatLabel: '1080p • mp4' }), true);
  assert.equal(isAudioRecord({ kind: 'video', format: '137', formatLabel: 'аудио • m4a' }), false);
  assert.equal(isAudioRecord({ format: '140', formatLabel: 'аудио • m4a' }), true);
  assert.equal(isAudioRecord({ format: 'audio-best' }), true);
  assert.equal(isAudioRecord({ format: '137', formatLabel: '1080p • mp4' }), false);
});
