import { useState } from 'react';
import { useDownloadHistory } from '@/hooks/useDownloadHistory';
import { isAudioRecord } from '@/lib/history';
import { useLocale, useT } from '@/lib/i18n';
import './History.css';

const SITE_LABELS: Record<string, string> = {
  boosty: 'Boosty',
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

export function History() {
  const t = useT();
  const locale = useLocale();
  const siteLabel = (site: string) =>
    site === 'other' ? t('common.other') : SITE_LABELS[site] || site;
  const history = useDownloadHistory();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'video' | 'audio' | 'failed'>('all');

  const filteredRecords = history.records.filter((record) => {
    const matchesSearch =
      !search ||
      record.title.toLowerCase().includes(search.toLowerCase()) ||
      record.url.toLowerCase().includes(search.toLowerCase()) ||
      siteLabel(record.site).toLowerCase().includes(search.toLowerCase());

    const audio = isAudioRecord(record);
    const matchesFilter =
      filter === 'all' ||
      (filter === 'video' && !audio) ||
      (filter === 'audio' && audio) ||
      (filter === 'failed' && record.status === 'failed');

    return matchesSearch && matchesFilter;
  });

  const handleClear = () => {
    if (confirm(t('history.clearConfirm'))) {
      history.clearHistory();
    }
  };

  const handleDelete = (id: string) => {
    history.removeRecord(id);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t('history.justNow');
    if (minutes < 60) return t('history.minutes', { n: minutes });
    if (hours < 24) return t('history.hours', { n: hours });
    if (days < 7) return t('history.days', { n: days });
    return date.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US');
  };

  return (
    <div className="history">
      <div className="history-card">
        <div className="history-header">
          <h2>{t('history.title')}</h2>
          <div className="history-actions">
            <input
              type="text"
              className="search-input"
              placeholder={t('history.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              className="ghost"
              onClick={handleClear}
              disabled={history.records.length === 0}
            >
              {t('history.clear')}
            </button>
          </div>
        </div>

        <div className="history-filters">
          <button
            type="button"
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            {t('history.all', { n: history.records.length })}
          </button>
          <button
            type="button"
            className={`filter-btn ${filter === 'video' ? 'active' : ''}`}
            onClick={() => setFilter('video')}
          >
            {t('history.video')}
          </button>
          <button
            type="button"
            className={`filter-btn ${filter === 'audio' ? 'active' : ''}`}
            onClick={() => setFilter('audio')}
          >
            {t('history.audio')}
          </button>
          <button
            type="button"
            className={`filter-btn ${filter === 'failed' ? 'active' : ''}`}
            onClick={() => setFilter('failed')}
          >
            {t('history.failed')}
          </button>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="history-empty">
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              opacity="0.3"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
              <path
                d="M12 7V12L15 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <p>{search || filter !== 'all' ? t('history.notFound') : t('history.empty')}</p>
            <p className="history-hint">
              {search || filter !== 'all' ? t('history.changeFilters') : t('history.emptyHint')}
            </p>
          </div>
        ) : (
          <div className="history-list">
            {filteredRecords.map((record) => (
              <div key={record.id} className={`history-item status-${record.status}`}>
                <div className="history-item-info">
                  <div className="history-item-title">{record.title}</div>
                  <div className="history-item-meta">
                    <span className="history-item-site">{siteLabel(record.site)}</span>
                    <span className="history-item-format">
                      {record.formatLabel || record.format}
                    </span>
                    <span className="history-item-time">{formatDate(record.timestamp)}</span>
                  </div>
                  {record.error && <div className="history-item-error">{record.error}</div>}
                </div>
                <div className="history-item-actions">
                  {record.status === 'completed' && (
                    <span className="badge ok">
                      <span className="dot" />
                      {t('history.done')}
                    </span>
                  )}
                  {record.status === 'failed' && (
                    <span className="badge err">
                      <span className="dot" />
                      {t('history.error')}
                    </span>
                  )}
                  {record.status === 'downloading' && (
                    <span className="badge warn">
                      <span className="dot" />
                      {t('history.downloading')}
                    </span>
                  )}
                  {/* активную не удаляем: по завершении её статус и путь некуда было бы записать */}
                  {record.status !== 'downloading' && (
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => handleDelete(record.id)}
                      title={t('history.remove')}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
