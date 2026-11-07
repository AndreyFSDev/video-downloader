import { create } from 'zustand';
import {
  errorMessage,
  installTools,
  onToolsProgress,
  type ToolsProgress,
  type ToolsStatus,
  toolsStatus,
} from './api';
import { translate } from './messages.ts';

interface ToolsState {
  status: ToolsStatus | null;
  installing: boolean;
  progress: string;
  error: string | null;
  refresh: () => Promise<void>;
  install: () => Promise<void>;
}

function progressText(event: ToolsProgress): string {
  const tool = event.tool === 'ffmpeg' ? 'FFmpeg' : 'yt-dlp';
  if (event.stage === 'verify') return translate('settings.tools.verify', { tool });
  if (event.stage === 'extract') return translate('settings.tools.extract', { tool });
  if (event.stage === 'retry') return translate('settings.tools.retry', { tool });
  const mb = (bytes: number) => (bytes / 1048576).toFixed(1);
  return translate('settings.tools.download', {
    tool,
    done: mb(event.downloaded),
    total: event.total ? ` / ${mb(event.total)}` : '',
  });
}

// Shared store of the banner and Settings: one install per app, buttons in both places see its progress.
export const useTools = create<ToolsState>()((set, get) => ({
  status: null,
  installing: false,
  progress: '',
  error: null,
  refresh: async () => {
    try {
      set({ status: await toolsStatus() });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },
  install: async () => {
    if (get().installing) return;
    set({ installing: true, error: null, progress: '' });
    // subscription inside try: its rejection would otherwise leave installing forever
    let unlisten: (() => void) | undefined;
    try {
      unlisten = await onToolsProgress((event) => set({ progress: progressText(event) }));
      set({ status: await installTools() });
    } catch (err) {
      set({ error: errorMessage(err) });
    } finally {
      unlisten?.();
      set({ installing: false, progress: '' });
    }
  },
}));

export function toolsReady(status: ToolsStatus | null): boolean {
  return !!status && status.ytdlp && status.ffmpeg;
}
