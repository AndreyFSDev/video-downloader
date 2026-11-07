import {
  ArrowUp,
  Check,
  ChevronDown,
  ClipboardPaste,
  Cookie,
  FileVideo2,
  Loader2,
  Music2,
  Plus,
  Square,
  Users,
  Video,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type MessageKey, useT } from '@/lib/i18n';
import './Composer.css';

export type ComposerMode = 'video' | 'audio' | 'post' | 'channel';

const MODES: Array<{
  id: ComposerMode;
  label: MessageKey;
  hint: MessageKey;
  icon: typeof Video;
}> = [
  { id: 'video', label: 'composer.mode.video', hint: 'composer.mode.video.hint', icon: Video },
  { id: 'audio', label: 'composer.mode.audio', hint: 'composer.mode.audio.hint', icon: Music2 },
  { id: 'post', label: 'composer.mode.post', hint: 'composer.mode.post.hint', icon: FileVideo2 },
  {
    id: 'channel',
    label: 'composer.mode.channel',
    hint: 'composer.mode.channel.hint',
    icon: Users,
  },
];

interface ComposerProps {
  url: string;
  onUrlChange: (value: string) => void;
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  onAnalyze: () => void;
  analyzing: boolean;
  disabled: boolean;
  siteLabel: string | null;
  siteHasCookies: boolean;
  onCookies: () => void;
}

export function Composer({
  url,
  onUrlChange,
  mode,
  onModeChange,
  onAnalyze,
  analyzing,
  disabled,
  siteLabel,
  siteHasCookies,
  onCookies,
}: ComposerProps) {
  const t = useT();
  const [openMenu, setOpenMenu] = useState<'mode' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeMode = MODES.find((item) => item.id === mode) ?? MODES[0];
  const ModeIcon = activeMode.icon;

  useEffect(() => {
    if (!openMenu) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [openMenu]);

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) onUrlChange(text.trim());
    } catch {
      // The clipboard may be unavailable without permission — do not block input.
    }
  };

  return (
    <div className="composer">
      <textarea
        className="composer-input"
        rows={2}
        value={url}
        placeholder={t('composer.placeholder')}
        spellCheck={false}
        disabled={disabled}
        onChange={(event) => onUrlChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onAnalyze();
          }
        }}
      />

      <div className="composer-row" ref={menuRef}>
        <button
          type="button"
          className="composer-icon-btn"
          onClick={paste}
          title={t('composer.paste')}
          aria-label={t('composer.paste')}
        >
          <Plus size={18} />
        </button>

        <div className="composer-menu-wrap">
          <button
            type="button"
            className="composer-pill"
            onClick={() => setOpenMenu(openMenu === 'mode' ? null : 'mode')}
            aria-expanded={openMenu === 'mode'}
          >
            <ModeIcon size={14} />
            {t(activeMode.label)}
            <ChevronDown size={13} className="pill-chevron" />
          </button>
          {openMenu === 'mode' && (
            <div className="composer-popover mode-popover" role="menu">
              {MODES.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`mode-row ${mode === item.id ? 'selected' : ''}`}
                    onClick={() => {
                      onModeChange(item.id);
                      setOpenMenu(null);
                    }}
                  >
                    <Icon size={16} />
                    <span className="mode-copy">
                      <strong>{t(item.label)}</strong>
                      <small>{t(item.hint)}</small>
                    </span>
                    {mode === item.id && <Check size={15} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="composer-spacer" />

        {siteLabel && (
          <button
            type="button"
            className={`composer-pill cookies-pill ${siteHasCookies ? 'has-cookies' : ''}`}
            onClick={onCookies}
            title={
              siteHasCookies
                ? t('composer.cookiesSaved', { site: siteLabel })
                : t('composer.cookiesAdd', { site: siteLabel })
            }
          >
            {siteHasCookies ? <Cookie size={14} /> : <ClipboardPaste size={14} />}
            {siteHasCookies ? 'Cookies' : '+ Cookies'}
          </button>
        )}

        <button
          type="button"
          className="composer-submit"
          onClick={onAnalyze}
          disabled={disabled || (!analyzing && !url.trim())}
          title={analyzing ? t('composer.cancelAnalyze') : t('composer.analyze')}
          aria-label={analyzing ? t('composer.cancelAnalyze') : t('composer.analyze')}
        >
          {analyzing ? <Square size={14} fill="currentColor" /> : <ArrowUp size={18} />}
        </button>
      </div>

      {analyzing && (
        <div className="composer-status">
          <Loader2 size={13} className="spin" />
          {t('composer.analyzing')}
        </div>
      )}
    </div>
  );
}
