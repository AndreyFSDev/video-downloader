import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Settings {
  downloadPath: string;
  maxConcurrentDownloads: number;
  preferredQuality: string;
  theme: 'light' | 'dark' | 'system';
  language: 'auto' | 'ru' | 'en';
  setSettings: (
    settings: Partial<
      Pick<
        Settings,
        'downloadPath' | 'maxConcurrentDownloads' | 'preferredQuality' | 'theme' | 'language'
      >
    >,
  ) => void;
}

export const useSettingsStore = create<Settings>()(
  persist(
    (set) => ({
      downloadPath: '~/Downloads/Viloader',
      maxConcurrentDownloads: 2,
      preferredQuality: '1080p',
      theme: 'dark',
      language: 'auto',
      setSettings: (newSettings) => set((state) => ({ ...state, ...newSettings })),
    }),
    {
      name: 'video-downloader-settings',
      // Cookies live in the app's file. A copy in localStorage hits the quota
      // and kept showing old secrets after the file was deleted.
      partialize: (state) => ({
        downloadPath: state.downloadPath,
        maxConcurrentDownloads: state.maxConcurrentDownloads,
        preferredQuality: state.preferredQuality,
        theme: state.theme,
        language: state.language,
      }),
      onRehydrateStorage: () => () => {
        try {
          const key = 'video-downloader-settings';
          const raw = localStorage.getItem(key);
          if (!raw?.includes('cookiesBySite')) return;
          const parsed = JSON.parse(raw) as { state?: { cookiesBySite?: unknown } };
          if (parsed.state) delete parsed.state.cookiesBySite;
          localStorage.setItem(key, JSON.stringify(parsed));
        } catch {
          // Corrupted settings JSON must not crash the window.
        }
      },
    },
  ),
);

export function useSettings() {
  return useSettingsStore();
}


