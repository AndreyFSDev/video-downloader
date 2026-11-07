import { Download, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useT } from '@/lib/i18n';
import { toolsReady, useTools } from '@/lib/tools';

export function ToolsBanner() {
  const t = useT();
  const { status, installing, progress, error, refresh, install } = useTools();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!status || toolsReady(status)) return null;

  return (
    <div className="tools-banner" role="status">
      <span className="tools-banner-text">
        {installing ? progress || t('settings.tools.install') : error || t('download.toolsMissing')}
      </span>
      <button
        type="button"
        className="solid-btn"
        onClick={() => void install()}
        disabled={installing}
      >
        {installing ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
        {t('download.toolsInstall')}
      </button>
    </div>
  );
}
