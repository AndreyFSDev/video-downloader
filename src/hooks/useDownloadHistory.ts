import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DownloadRecord {
  id: string;
  url: string;
  title: string;
  site: string;
  format: string;
  /** Human-readable format label, e.g. "1080p • mp4" or "audio • m4a" */
  formatLabel: string;
  /** Download kind; missing on old records (before 04.11.2026) — the filter falls back */
  kind?: 'video' | 'audio';
  outputPath: string;
  timestamp: number;
  status: 'completed' | 'failed' | 'downloading';
  error?: string;
  filesize?: number;
}

interface DownloadHistory {
  records: DownloadRecord[];
  addRecord: (record: DownloadRecord) => void;
  updateRecord: (id: string, updates: Partial<DownloadRecord>) => void;
  removeRecord: (id: string) => void;
  clearHistory: () => void;
}

export const useDownloadHistory = create<DownloadHistory>()(
  persist(
    (set) => ({
      records: [],
      addRecord: (record) =>
        set((state) => ({
          records: [record, ...state.records].slice(0, 500),
        })),
      updateRecord: (id, updates) =>
        set((state) => ({
          records: state.records.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        })),
      removeRecord: (id) =>
        set((state) => ({
          records: state.records.filter((r) => r.id !== id),
        })),
      clearHistory: () =>
        set((state) => ({ records: state.records.filter((r) => r.status === 'downloading') })),
    }),
    {
      name: 'video-downloader-history',
    },
  ),
);

