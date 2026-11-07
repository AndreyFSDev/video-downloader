import { Check, ExternalLink, Film, Music2, Play, ShieldAlert } from 'lucide-react';
import type { BoostyList, BoostyMedia, BoostyPostDetail } from '@/lib/api';
import { BOOSTY_LIST_PAGE, boostyPostDate, formatDuration } from '@/lib/boosty';
import { qualityOptions } from '@/lib/formats';
import { translate, useT } from '@/lib/i18n';
import { Dropdown } from './Dropdown';
import './BoostyPanels.css';

// Boosty downloads in bulk without analyzing each clip separately,
// so the quality is chosen before downloading right in the panel.
function QualityPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const t = useT();
  return (
    <div className="boosty-quality">
      <Dropdown
        value={value}
        options={qualityOptions(t('composer.quality.best'))}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

function mediaIcon(media: BoostyMedia) {
  if (media.kind === 'audio') return <Music2 size={16} />;
  if (media.kind === 'external') return <ExternalLink size={16} />;
  return <Film size={16} />;
}

function mediaKindLabel(media: BoostyMedia): string {
  if (media.kind === 'audio') return translate('common.audio');
  if (media.kind === 'external') return translate('boosty.kind.external');
  return translate('common.video');
}

interface PostPanelProps {
  post: BoostyPostDetail;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: (select: boolean) => void;
  onDownload: () => void;
  quality: string;
  onQualityChange: (quality: string) => void;
  downloading: boolean;
}

export function BoostyPostPanel({
  post,
  selected,
  onToggle,
  onSelectAll,
  onDownload,
  quality,
  onQualityChange,
  downloading,
}: PostPanelProps) {
  const t = useT();
  const available = post.media;
  const allSelected = available.length > 0 && available.every((media) => selected.has(media.id));
  const selectedCount = available.filter((media) => selected.has(media.id)).length;
  const blocked = !post.summary.hasAccess;

  return (
    <section className="boosty-panel">
      <header className="boosty-panel-head">
        <div>
          <h2>{post.summary.title}</h2>
          <p>
            {boostyPostDate(post.summary)}
            {post.summary.videoCount > 0 &&
              ` · ${t('boosty.videoCount', { n: post.summary.videoCount })}`}
            {post.summary.audioCount > 0 &&
              ` · ${t('boosty.audioCount', { n: post.summary.audioCount })}`}
          </p>
        </div>
        <button type="button" className="quiet-btn" onClick={() => onSelectAll(!allSelected)}>
          <Check size={14} />
          {allSelected ? t('common.unselectAll') : t('common.selectAll')}
        </button>
      </header>

      {blocked && (
        <div className="boosty-notice">
          <ShieldAlert size={15} />
          {t('boosty.blocked')}
        </div>
      )}

      {available.length === 0 ? (
        <div className="boosty-empty-media">
          <Play size={22} />
          <p>{blocked ? t('boosty.mediaHidden') : t('boosty.noMedia')}</p>
        </div>
      ) : (
        <div className="boosty-media-list">
          {available.map((media) => {
            const checked = selected.has(media.id);
            return (
              <label key={media.id} className={`boosty-media-row ${checked ? 'checked' : ''}`}>
                <input type="checkbox" checked={checked} onChange={() => onToggle(media.id)} />
                <span className="media-icon">{mediaIcon(media)}</span>
                <span className="media-copy">
                  <strong>{media.title || t('common.untitled')}</strong>
                  <span>
                    {mediaKindLabel(media)}
                    {media.duration ? ` · ${formatDuration(media.duration)}` : ''}
                    {media.qualities.length > 0 &&
                      ` · ${media.qualities.map((quality) => quality.label).join(' / ')}`}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      <div className="boosty-panel-footer">
        <span className="muted">{t('boosty.selected', { n: selectedCount })}</span>
        <QualityPicker value={quality} onChange={onQualityChange} disabled={downloading} />
        <button
          type="button"
          className="solid-btn"
          onClick={onDownload}
          disabled={downloading || selectedCount === 0}
        >
          {downloading ? t('common.downloading') : t('boosty.downloadSelected')}
        </button>
      </div>
    </section>
  );
}

interface ChannelPanelProps {
  list: BoostyList;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: (select: boolean) => void;
  onDownload: () => void;
  onDownloadFeed?: () => void;
  quality: string;
  onQualityChange: (quality: string) => void;
  downloading: boolean;
  progressLabel?: string;
}

// hasAccess is authoritative: a subscription-only post without a price is closed too
export function isBlocked(post: BoostyList['posts'][number]): boolean {
  return !post.hasAccess;
}

export function BoostyChannelPanel({
  list,
  selected,
  onToggle,
  onSelectAll,
  onDownload,
  onDownloadFeed,
  quality,
  onQualityChange,
  downloading,
  progressLabel,
}: ChannelPanelProps) {
  const t = useT();
  const available = list.posts.filter((post) => !isBlocked(post));
  const allSelected = available.length > 0 && available.every((post) => selected.has(post.id));
  const selectedCount = available.filter((post) => selected.has(post.id)).length;

  return (
    <section className="boosty-panel">
      <header className="boosty-panel-head">
        <div>
          <h2>{list.blog}</h2>
          <p>
            {list.kind === 'bundle' ? t('boosty.bundle') : t('boosty.channel')} ·{' '}
            {/* The page is capped: a full page means the feed may have more */}
            {t(list.posts.length >= BOOSTY_LIST_PAGE ? 'boosty.postsFirst' : 'boosty.posts', {
              n: list.posts.length,
            })}
          </p>
        </div>
        <button type="button" className="quiet-btn" onClick={() => onSelectAll(!allSelected)}>
          <Check size={14} />
          {allSelected ? t('common.unselectAll') : t('common.selectAll')}
        </button>
      </header>

      <div className="boosty-post-list">
        {list.posts.map((post) => {
          const blocked = isBlocked(post);
          const checked = selected.has(post.id);
          return (
            <label
              key={post.id}
              className={`boosty-post-row ${checked ? 'checked' : ''} ${blocked ? 'blocked' : ''}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={blocked}
                onChange={() => onToggle(post.id)}
              />
              <span className="post-date">{boostyPostDate(post)}</span>
              <span className="post-copy">
                <strong>{post.title}</strong>
                <span>
                  {post.videoCount > 0 && t('boosty.videoCount', { n: post.videoCount })}
                  {post.videoCount > 0 && post.audioCount > 0 && ' · '}
                  {post.audioCount > 0 && t('boosty.audioCount', { n: post.audioCount })}
                  {post.videoCount === 0 &&
                    post.audioCount === 0 &&
                    (post.hasAccess ? t('boosty.noMediaShort') : t('boosty.hiddenInList'))}
                </span>
              </span>
              <span className="post-badges">
                {post.price > 0 && <span className="mini-badge">{post.price} ₽</span>}
                {blocked && <span className="mini-badge danger">{t('boosty.noAccess')}</span>}
              </span>
            </label>
          );
        })}
      </div>

      <div className="boosty-panel-footer">
        <span className="muted">
          {progressLabel || t('boosty.selectedOf', { n: selectedCount, total: list.posts.length })}
        </span>
        {onDownloadFeed && list.kind === 'blog' && (
          <button
            type="button"
            className="quiet-btn"
            onClick={onDownloadFeed}
            disabled={downloading}
            title={t('boosty.downloadFeedHint')}
          >
            {t('boosty.downloadFeed')}
          </button>
        )}
        <QualityPicker value={quality} onChange={onQualityChange} disabled={downloading} />
        <button
          type="button"
          className="solid-btn"
          onClick={onDownload}
          disabled={downloading || selectedCount === 0}
        >
          {downloading
            ? t('common.downloading')
            : t('boosty.downloadSelectedN', { n: selectedCount })}
        </button>
      </div>
    </section>
  );
}
