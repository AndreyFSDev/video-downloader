import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { CheckCircle2, CircleAlert, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettings } from '@/hooks/useSettings';
import {
  type BoostyAccount,
  BROWSERS,
  type Browser,
  boostyAccount,
  errorMessage,
  getCookiesList,
  importBrowserCookies,
  removeSiteCookies,
  saveSiteCookies,
  taskBackend,
} from '@/lib/api';
import { detectCookiesKind, normalizeCookies } from '@/lib/cookies';
import { qualityOptions } from '@/lib/formats';
import { type LocalePreference, useLocale, useT } from '@/lib/i18n';
import { runTask } from '@/lib/tasks';
import { toolsReady, useTools } from '@/lib/tools';
import { useAppVersion } from '@/lib/version';
import { Dropdown } from './Dropdown';
import './Settings.css';

const SITE_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  tiktok: 'TikTok',
  twitter: 'Twitter / X',
  instagram: 'Instagram',
  facebook: 'Facebook',
  twitch: 'Twitch',
  dailymotion: 'Dailymotion',
  rutube: 'Rutube',
};

const BROWSER_LABELS: Record<Browser, string> = {
  firefox: 'Firefox',
  chrome: 'Chrome',
  edge: 'Edge',
  brave: 'Brave',
  opera: 'Opera',
  vivaldi: 'Vivaldi',
  yandex: 'Yandex Browser',
  chromium: 'Chromium',
};

const REPO_URL = 'https://github.com/AndreyFSDev/Viloader';

function openExternal(url: string) {
  // The shell plugin is already connected and allows only http(s): no separate opener for two links.
  void invoke('plugin:shell|open', { path: url }).catch(() => {});
}

function BoostyCard() {
  const t = useT();
  const locale = useLocale();
  const [browser, setBrowser] = useState<Browser>('firefox');
  const [account, setAccount] = useState<BoostyAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ready = toolsReady(useTools((state) => state.status));

  const check = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNote(t('settings.boosty.checking'));
    try {
      setAccount(await boostyAccount());
      setNote('');
    } catch (err) {
      setAccount(null);
      setNote('');
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [t]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: check once when Settings opens
  useEffect(() => {
    void check();
  }, []);

  const importFromBrowser = async () => {
    setBusy(true);
    setError(null);
    try {
      const taskId = crypto.randomUUID();
      const result = await runTask(taskBackend, taskId, new AbortController().signal, () =>
        importBrowserCookies(taskId, browser, 'boosty'),
      );
      setNote(t('settings.boosty.imported', { n: result.cookies }));
      setAccount(await boostyAccount());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const importFromFile = async () => {
    setError(null);
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: 'Cookies', extensions: ['txt', 'json'] },
          { name: 'All files', extensions: ['*'] },
        ],
      });
      if (typeof selected !== 'string') return;
      setBusy(true);
      await saveSiteCookies('boosty', normalizeCookies(await readTextFile(selected)));
      setAccount(await boostyAccount());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await removeSiteCookies('boosty');
      setAccount({ loggedIn: false, expiresAt: null, canRefresh: false, subscriptions: [] });
      setNote(t('settings.cookies.deleted'));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const expires = account?.expiresAt
    ? new Date(account.expiresAt).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')
    : null;

  return (
    <div className="settings-card boosty-card">
      <h2>{t('settings.boosty.title')}</h2>
      <p className="setting-hint">{t('settings.boosty.intro')}</p>

      <div className={`boosty-account ${account?.loggedIn ? 'ok' : ''}`}>
        {busy ? (
          <Loader2 size={16} className="spin" />
        ) : account?.loggedIn ? (
          <CheckCircle2 size={16} />
        ) : (
          <CircleAlert size={16} />
        )}
        <div className="boosty-account-copy">
          <strong>
            {account?.loggedIn ? t('settings.boosty.logged') : t('settings.boosty.notLogged')}
            {account?.loggedIn && expires && (
              <span className="muted">
                {' · '}
                {account.canRefresh
                  ? t('settings.boosty.autoRefresh')
                  : t('settings.boosty.expires', { date: expires })}
              </span>
            )}
          </strong>
          {account?.loggedIn && (
            <span>
              {account.subscriptions.length > 0
                ? t('settings.boosty.subscriptions', {
                    list: account.subscriptions
                      .map(
                        (item) =>
                          `${item.title || item.blog}${item.level ? ` (${item.level})` : ''}`,
                      )
                      .join(', '),
                  })
                : t('settings.boosty.noSubscriptions')}
            </span>
          )}
        </div>
      </div>

      <div className="setting-group">
        <label className="setting-label" htmlFor="boosty-browser">
          {t('settings.boosty.fromBrowser')}
        </label>
        <div className="setting-input-group">
          <Dropdown
            id="boosty-browser"
            value={browser}
            options={BROWSERS.map((item) => ({ value: item, label: BROWSER_LABELS[item] }))}
            onChange={(value) => setBrowser(value as Browser)}
            disabled={busy}
          />
          <button
            type="button"
            className="primary"
            onClick={() => void importFromBrowser()}
            disabled={busy || !ready}
          >
            {t('settings.boosty.import')}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => void importFromFile()}
            disabled={busy}
          >
            {t('settings.boosty.fromFile')}
          </button>
        </div>
        <p className="setting-hint">{t('settings.boosty.browserHint')}</p>
      </div>

      <div className="cookies-actions">
        <button type="button" className="ghost" onClick={() => void check()} disabled={busy}>
          {t('settings.boosty.check')}
        </button>
        {account?.loggedIn && (
          <button type="button" className="danger" onClick={() => void logout()} disabled={busy}>
            {t('settings.boosty.logout')}
          </button>
        )}
        {note && <span className="save-status">{note}</span>}
      </div>
      {error && <p className="setting-error">{error}</p>}
    </div>
  );
}

function ToolsCard() {
  const t = useT();
  const { status, installing, progress, error, refresh, install } = useTools();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const row = (name: string, ok: boolean | undefined) => (
    <div className="tool-row">
      <span>{name}</span>
      <span className={ok ? 'tool-ok' : 'tool-missing'}>
        {ok ? t('settings.tools.ready') : t('settings.tools.missing')}
      </span>
    </div>
  );

  return (
    <div className="settings-card">
      <h2>{t('settings.tools.title')}</h2>
      <p className="setting-hint">
        {t('settings.tools.hint', {
          ytdlp: status?.ytdlpVersion ?? '',
          ffmpeg: status?.ffmpegVersion ?? '',
        })}
      </p>
      {row('yt-dlp', status?.ytdlp)}
      {row('FFmpeg', status?.ffmpeg)}
      {status && <p className="setting-hint">{t('settings.tools.folder', { dir: status.dir })}</p>}
      {!toolsReady(status) && (
        <div className="cookies-actions">
          <button
            type="button"
            className="primary"
            onClick={() => void install()}
            disabled={installing}
          >
            {installing && <Loader2 size={14} className="spin" />}
            {t('settings.tools.install')}
          </button>
          {progress && <span className="save-status">{progress}</span>}
        </div>
      )}
      {error && <p className="setting-error">{error}</p>}
    </div>
  );
}

function OtherCookiesCard() {
  const t = useT();
  const [selectedSite, setSelectedSite] = useState<string>('youtube');
  const [cookiesText, setCookiesText] = useState<string>('');
  const [savedSites, setSavedSites] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [jsonDetected, setJsonDetected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const statusTimer = useRef<ReturnType<typeof setTimeout>>();

  const loadSites = useCallback(async () => {
    try {
      setSavedSites(await getCookiesList());
    } catch {
      setSavedSites([]);
    }
  }, []);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  useEffect(() => () => clearTimeout(statusTimer.current), []);

  const showStatus = (status: string) => {
    clearTimeout(statusTimer.current);
    setSaveStatus(status);
    statusTimer.current = setTimeout(() => setSaveStatus(''), 3000);
  };

  const selectSite = (site: string) => {
    // Saved cookies are not read back into the field: they are encrypted and must not show in the window.
    setSelectedSite(site);
    setCookiesText('');
    setJsonDetected(null);
    setSaveStatus('');
  };

  const handleCookiesInput = (text: string) => {
    setCookiesText(text);
    setJsonDetected(text.trim() ? detectCookiesKind(text) : null);
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      await saveSiteCookies(selectedSite, normalizeCookies(cookiesText));
      setCookiesText('');
      setJsonDetected(null);
      showStatus(t('settings.cookies.saved'));
      await loadSites();
    } catch (err) {
      setSaveStatus(t('settings.cookies.error', { error: errorMessage(err) }));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await removeSiteCookies(selectedSite);
      showStatus(t('settings.cookies.deleted'));
      await loadSites();
    } catch (err) {
      setSaveStatus(t('settings.cookies.error', { error: errorMessage(err) }));
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: 'Cookies', extensions: ['txt', 'json'] },
          { name: 'All files', extensions: ['*'] },
        ],
      });
      if (typeof selected === 'string') handleCookiesInput(await readTextFile(selected));
    } catch (err) {
      setSaveStatus(errorMessage(err));
    }
  };

  const handleAcceptConversion = () => {
    try {
      setCookiesText(normalizeCookies(cookiesText));
      setJsonDetected(null);
    } catch (err) {
      setSaveStatus(errorMessage(err));
    }
  };

  const allSites = Array.from(
    new Set([...Object.keys(SITE_LABELS), ...savedSites.filter((site) => site !== 'boosty')]),
  );
  const stored = savedSites.includes(selectedSite);

  return (
    <div className="settings-card cookies-card">
      <h2>{t('settings.cookies.title')}</h2>
      <p className="setting-hint">{t('settings.cookies.hint')}</p>

      <div className="cookies-site-tabs">
        {allSites.map((site) => (
          <button
            type="button"
            key={site}
            className={`site-tab ${selectedSite === site ? 'active' : ''} ${
              savedSites.includes(site) ? 'has-cookies' : ''
            }`}
            onClick={() => selectSite(site)}
            disabled={busy}
          >
            {SITE_LABELS[site] || site}
            {savedSites.includes(site) && <span className="tab-dot" />}
          </button>
        ))}
      </div>

      <div className="cookies-editor">
        <div className="cookies-toolbar">
          <button type="button" className="ghost" onClick={handleImportFile} disabled={busy}>
            {t('settings.cookies.importFile')}
          </button>
          {saveStatus && <span className="save-status">{saveStatus}</span>}
        </div>

        {jsonDetected && (
          <div className="json-detected-banner">
            <span className="banner-icon">⚡</span>
            <span className="banner-text">
              {jsonDetected === 'boosty-tokens'
                ? t('settings.cookies.jsonTokens')
                : t('settings.cookies.jsonCookies')}
            </span>
            <div className="banner-actions">
              <button type="button" className="primary small" onClick={handleAcceptConversion}>
                {t('settings.cookies.convert')}
              </button>
              <button type="button" className="ghost small" onClick={() => setJsonDetected(null)}>
                {t('settings.cookies.hide')}
              </button>
            </div>
          </div>
        )}

        {stored && !cookiesText && <p className="setting-hint">{t('settings.cookies.stored')}</p>}

        <textarea
          className="cookies-textarea"
          value={cookiesText}
          onChange={(e) => handleCookiesInput(e.target.value)}
          placeholder={t('settings.cookies.placeholder', {
            site: SITE_LABELS[selectedSite] || selectedSite,
          })}
          rows={10}
          spellCheck={false}
          disabled={busy}
        />
        <div className="cookies-actions">
          <button
            type="button"
            className="primary"
            onClick={handleSave}
            disabled={busy || !cookiesText.trim()}
          >
            {t('common.save')}
          </button>
          {stored && (
            <button type="button" className="danger" onClick={handleDelete} disabled={busy}>
              {t('common.delete')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Settings() {
  const t = useT();
  const settings = useSettings();
  const version = useAppVersion();
  const [pathError, setPathError] = useState('');

  const pickDownloadPath = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === 'string') settings.setSettings({ downloadPath: selected });
    } catch (err) {
      setPathError(errorMessage(err));
    }
  };

  return (
    <div className="settings">
      <div className="settings-card">
        <h2>{t('settings.title')}</h2>

        <div className="setting-group">
          <label className="setting-label" htmlFor="download-path">
            {t('settings.folder')}
          </label>
          <div className="setting-input-group">
            <input
              id="download-path"
              type="text"
              className="setting-input"
              value={settings.downloadPath}
              onChange={(e) => settings.setSettings({ downloadPath: e.target.value })}
            />
            <button type="button" className="browse-btn" onClick={pickDownloadPath}>
              {t('settings.browse')}
            </button>
          </div>
          <p className="setting-hint">{pathError || t('settings.folderHint')}</p>
        </div>

        <div className="setting-group">
          <label className="setting-label" htmlFor="preferred-quality">
            {t('settings.quality')}
          </label>
          <div className="setting-dropdown">
            <Dropdown
              id="preferred-quality"
              value={settings.preferredQuality}
              options={qualityOptions(t('composer.quality.best'))}
              onChange={(value) => settings.setSettings({ preferredQuality: value })}
            />
          </div>
          <p className="setting-hint">{t('settings.qualityHint')}</p>
        </div>

        <div className="setting-group">
          <label className="setting-label" htmlFor="language">
            {t('settings.language')}
          </label>
          <div className="setting-dropdown">
            <Dropdown
              id="language"
              value={settings.language}
              options={[
                { value: 'auto', label: t('settings.language.auto') },
                { value: 'ru', label: 'Русский' },
                { value: 'en', label: 'English' },
              ]}
              onChange={(value) => settings.setSettings({ language: value as LocalePreference })}
            />
          </div>
        </div>
      </div>

      <BoostyCard />
      <ToolsCard />
      <OtherCookiesCard />

      <div className="about-card">
        <h3>{t('about.title')}</h3>
        <div className="about-info">
          <p>
            <strong>Viloader</strong> v{version}
          </p>
          <p>{t('about.tagline')}</p>
          <p>{t('about.portable')}</p>
          <p className="setting-hint">{t('about.license')}</p>
          <div className="about-update">
            <button type="button" className="quiet" onClick={() => openExternal(REPO_URL)}>
              {t('about.repo')}
            </button>
          </div>
          <p className="tech-stack">Tauri 2 · Rust · React 18 · yt-dlp · FFmpeg</p>
        </div>
      </div>
    </div>
  );
}

