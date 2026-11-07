import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '@/hooks/useSettings';
import {
  format,
  type Locale,
  type MessageKey,
  resolveLocale,
  setCurrentLocale,
} from './messages.ts';

export { type Locale, type LocalePreference, type MessageKey, translate } from './messages.ts';

export function useLocale(): Locale {
  return resolveLocale(useSettingsStore((state) => state.language));
}

export function useT() {
  const locale = useLocale();
  return (key: MessageKey, vars?: Record<string, string | number>) => format(locale, key, vars);
}

/** The backend keeps its own language for errors and the tray menu; synced on startup and on change. */
export function syncBackendLocale(locale: Locale) {
  setCurrentLocale(locale);
  document.documentElement.lang = locale;
  void invoke('set_language', { language: locale }).catch(() => {});
}
