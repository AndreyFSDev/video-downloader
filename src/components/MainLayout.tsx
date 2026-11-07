import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDownloadHistory } from '@/hooks/useDownloadHistory';
import { isAudioRecord } from '@/lib/history';
import { syncBackendLocale, translate, useLocale, useT } from '@/lib/i18n';
import { useAppVersion } from '@/lib/version';
import { ActivePage } from './ActivePage';
import { Download, type ReopenRequest } from './Download';
import { History } from './History';
import { Settings } from './Settings';
import { type AppPage, Sidebar } from './Sidebar';
import { ToolsBanner } from './ToolsBanner';
import './MainLayout.css';

export function MainLayout() {
  const [page, setPage] = useState<AppPage>('new');
  const [reopen, setReopen] = useState<ReopenRequest | null>(null);
  const version = useAppVersion();
  const history = useDownloadHistory();
  const t = useT();
  const locale = useLocale();

  useEffect(() => {
    syncBackendLocale(locale);
  }, [locale]);

  // The downloading status is persisted: after the app closed, records
  // stayed active forever. On startup we mark them as interrupted.
  // A single pass over already saved records. Dependencies must not be added:
  // otherwise a record just moved to downloading immediately becomes an error.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the window opens
  useEffect(() => {
    for (const record of history.records) {
      if (record.status !== 'downloading') continue;
      history.updateRecord(record.id, {
        status: 'failed',
        error: translate('interrupted'),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appWindow = getCurrentWindow();

  return (
    <div className="app">
      <Sidebar
        page={page}
        onPage={setPage}
        onReopen={(record) => {
          setReopen({ url: record.url, audio: isAudioRecord(record), nonce: Date.now() });
          setPage('new');
        }}
        version={version}
      />

      <main className="app-main">
        {/* A double click on the Tauri drag region maximizes the window by itself; a custom handler would give a second toggle. */}
        <header className="app-topbar" data-tauri-drag-region>
          <span className="window-drag-fill" data-tauri-drag-region />
          <div className="window-controls">
            <button
              type="button"
              className="window-btn"
              onClick={() => void appWindow.minimize()}
              title={t('window.minimize')}
              aria-label={t('window.minimize')}
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              className="window-btn"
              onClick={() => void appWindow.toggleMaximize()}
              title={t('window.maximize')}
              aria-label={t('window.maximize')}
            >
              <Square size={12} />
            </button>
            <button
              type="button"
              className="window-btn close"
              onClick={() => void appWindow.close()}
              title={t('window.close')}
              aria-label={t('window.close')}
            >
              <X size={14} />
            </button>
          </div>
        </header>
        <ToolsBanner />

        <div className="app-content">
          {/* The download screen is not unmounted: going to Settings would otherwise break
              the progress and allow a second yt-dlp to run on top of the first. */}
          <div className={page === 'new' ? 'page' : 'page hidden'}>
            <Download reopen={reopen} />
          </div>
          {page === 'active' && <ActivePage />}
          {page === 'history' && <History />}
          {page === 'settings' && <Settings />}
        </div>
      </main>
    </div>
  );
}
