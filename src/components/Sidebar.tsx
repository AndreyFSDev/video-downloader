import { ArrowDownToLine, Clock3, Plus, Settings } from 'lucide-react';
import appIcon from '@/assets/app-icon.png';
import { type DownloadRecord, useDownloadHistory } from '@/hooks/useDownloadHistory';
import { type MessageKey, useT } from '@/lib/i18n';

export type AppPage = 'new' | 'active' | 'history' | 'settings';

const NAV: Array<{ id: AppPage; label: MessageKey; icon: typeof Plus }> = [
  { id: 'new', label: 'nav.new', icon: Plus },
  { id: 'active', label: 'nav.active', icon: ArrowDownToLine },
  { id: 'history', label: 'nav.history', icon: Clock3 },
  { id: 'settings', label: 'nav.settings', icon: Settings },
];

interface SidebarProps {
  page: AppPage;
  onPage: (page: AppPage) => void;
  onReopen: (record: DownloadRecord) => void;
  version: string;
}

export function Sidebar({ page, onPage, onReopen, version }: SidebarProps) {
  const t = useT();
  const history = useDownloadHistory();
  const active = history.records.filter((record) => record.status === 'downloading').length;
  const recent = history.records.filter((record) => record.status !== 'downloading').slice(0, 4);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand" data-tauri-drag-region>
        <img src={appIcon} alt="" className="brand-icon" draggable={false} />
        <span className="brand-copy">
          <strong data-tauri-drag-region>Viloader</strong>
        </span>
      </div>

      <nav className="sidebar-nav" aria-label={t('nav.sections')}>
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => onPage(item.id)}
            >
              <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
              <span>{t(item.label)}</span>
              {item.id === 'active' && active > 0 && <span className="nav-badge">{active}</span>}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-section">
        <div className="sidebar-section-title">{t('nav.recent')}</div>
        {recent.length === 0 ? (
          <p className="sidebar-empty">{t('nav.empty')}</p>
        ) : (
          <div className="sidebar-recent">
            {recent.map((record) => (
              <button
                key={record.id}
                type="button"
                className="recent-item"
                title={record.title}
                onClick={() => onReopen(record)}
              >
                {record.title}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <span>v{version}</span>
      </div>
    </aside>
  );
}


