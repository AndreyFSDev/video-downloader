export function isAudioRecord(record: {
  kind?: 'video' | 'audio';
  format: string;
  formatLabel?: string;
}): boolean {
  if (record.kind) return record.kind === 'audio';
  const label = (record.formatLabel || '').toLowerCase();
  return (
    label.startsWith('аудио') || label.startsWith('audio') || record.format.startsWith('audio')
  );
}
