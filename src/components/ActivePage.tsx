import { Loader2 } from 'lucide-react';
import { useDownloadHistory } from '@/hooks/useDownloadHistory';
import { useT } from '@/lib/i18n';
import './ActivePage.css';

export function ActivePage() {
  const t = useT();
  const history = useDownloadHistory();
  const active = history.records.filter((record) => record.status === 'downloading');

  return (
    <div className="active-page">
      <div className="active-card">
        <div className="active-header">
          <h2>{t('active.title')}</h2>
          <span className="active-count">{active.length}</span>
        </div>

        {active.length === 0 ? (
          <div className="active-empty">
            <p>{t('active.empty')}</p>
            <span>{t('active.emptyHint')}</span>
          </div>
        ) : (
          <div className="active-list">
            {active.map((record) => (
              <div key={record.id} className="active-row">
                <Loader2 size={15} className="spin" />
                <div className="active-info">
                  <strong>{record.title}</strong>
                  <span>
                    {record.site} · {record.formatLabel || record.format}
                  </span>
                </div>
                <div className="active-track">
                  <div className="active-track-fill" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
