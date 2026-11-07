import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import appIcon from '@/assets/app-icon.png';
import { useDownloadHistory } from '@/hooks/useDownloadHistory';
import { useSettings } from '@/hooks/useSettings';
import {
  type BoostyList,
  type BoostyPostDetail,
  boostyGetPost,
  boostyList,
  detectSiteFromUrl,
  downloadVideo,
  errorMessage,
  getFormats,
  getSiteCookiesPath,
  onProgress,
  type ProgressEvent,
  saveSiteCookies,
  taskBackend,
  type VideoInfo,
} from '@/lib/api';
import {
  BOOSTY_LIST_PAGE,
  boostyMediaSelector,
  boostyMediaUrl,
  boostyPostFolder,
  boostyQualityLabel,
  boostyUrlKind,
  formatDuration,
} from '@/lib/boosty';
import { normalizeCookies } from '@/lib/cookies';
import {
  formatChoiceLabel,
  formatKind,
  formatSelector,
  isAudioOnly,
  isVideoChoice,
  pickFormatId,
} from '@/lib/formats';
import { translate, useT } from '@/lib/i18n';
import { ensureNetscapeCookies } from '@/lib/siteCookies';
import { runTask } from '@/lib/tasks';
import { BoostyChannelPanel, BoostyPostPanel, isBlocked } from './BoostyPanels';
import { Composer, type ComposerMode } from './Composer';
import { Dropdown } from './Dropdown';
import './Download.css';

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

type Analysis =
  | { kind: 'video'; info: VideoInfo }
  | { kind: 'post'; post: BoostyPostDetail }
  | { kind: 'list'; list: BoostyList };

function wantedMedia(media: BoostyPostDetail['media'][number], mode: ComposerMode): boolean {
  if (mode === 'audio') return media.kind === 'audio';
  if (mode === 'video') return media.kind !== 'audio';
  return true;
}

function blogFromUrl(url: string): string {
  try {
    return new URL(url).pathname.split('/').filter(Boolean)[0] || 'boosty';
  } catch {
    return 'boosty';
  }
}

/** Reopening a record from "Recent": nonce distinguishes clicks on the same record. */
export interface ReopenRequest {
  url: string;
  audio: boolean;
  nonce: number;
}

export function Download({ reopen }: { reopen: ReopenRequest | null }) {
  const [url, setUrl] = useState('');
  const [analyzeUrl, setAnalyzeUrl] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selectedFormat, setSelectedFormat] = useState<string>('');
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [detectedSite, setDetectedSite] = useState<string | null>(null);
  const [siteHasCookies, setSiteHasCookies] = useState(false);
  const [showCookiesInline, setShowCookiesInline] = useState(false);
  const [inlineCookies, setInlineCookies] = useState('');
  const [mode, setMode] = useState<ComposerMode>('video');
  const [quality, setQuality] = useState('best');
  const [selectedMedia, setSelectedMedia] = useState<Set<string>>(new Set());
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
  const t = useT();
  const settings = useSettings();
  const history = useDownloadHistory();
  const pendingAnalyze = useRef<string | null>(null);
  const downloadLock = useRef(false);
  const activeTask = useRef<string | null>(null);
  const downloadAbort = useRef<AbortController | null>(null);
  const lastUrl = useRef('');
  const queryClient = useQueryClient();

  useEffect(() => {
    setQuality(settings.preferredQuality);
  }, [settings.preferredQuality]);

  // The mode is suggested from the link, but we do not override the user's manual choice
  // until they change the link itself.
  useEffect(() => {
    const trimmed = url.trim();
    if (!trimmed || lastUrl.current === trimmed) return;
    lastUrl.current = trimmed;
    const kind = boostyUrlKind(trimmed);
    if (kind === 'post') setMode('post');
    else if (kind === 'blog' || kind === 'bundle') setMode('channel');
    else setMode((current) => (current === 'post' || current === 'channel' ? 'video' : current));
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    const trimmed = url.trim();
    if (!trimmed) {
      setDetectedSite(null);
      setSiteHasCookies(false);
      return;
    }
    detectSiteFromUrl(trimmed)
      .then(async (site) => {
        if (cancelled) return;
        setDetectedSite(site);
        if (!site) {
          setSiteHasCookies(false);
          return;
        }
        const path = await getSiteCookiesPath(site);
        if (!cancelled) setSiteHasCookies(!!path);
      })
      .catch(() => {
        if (!cancelled) {
          setDetectedSite(null);
          setSiteHasCookies(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const analyzedKind = analyzeUrl ? boostyUrlKind(analyzeUrl) : null;

  const {
    data: analysis,
    isFetching,
    error,
  } = useQuery<Analysis>({
    queryKey: ['analysis', analyzeUrl, attempt, analyzedKind],
    queryFn: async ({ signal }) => {
      if (!analyzeUrl) throw new Error('нет ссылки');
      const taskId = crypto.randomUUID();
      return runTask(taskBackend, taskId, signal, async () => {
        const site = await detectSiteFromUrl(analyzeUrl);
        const cookiesPath = await ensureNetscapeCookies(site);
        signal.throwIfAborted();
        if (analyzedKind === 'post') {
          return {
            kind: 'post' as const,
            post: await boostyGetPost(taskId, analyzeUrl, cookiesPath),
          };
        }
        if (analyzedKind === 'blog' || analyzedKind === 'bundle') {
          return {
            kind: 'list' as const,
            list: await boostyList(taskId, analyzeUrl, cookiesPath, BOOSTY_LIST_PAGE),
          };
        }
        return {
          kind: 'video' as const,
          info: await getFormats(taskId, analyzeUrl, cookiesPath),
        };
      });
    },
    enabled: !!analyzeUrl,
    retry: false,
    // Without this, every return of focus to the window restarts yt-dlp.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const analyzing = !!analyzeUrl && isFetching;
  const shownAnalysis = analyzeUrl ? analysis : undefined;

  useEffect(() => {
    if (!analyzing) pendingAnalyze.current = null;
  }, [analyzing]);

  useEffect(() => {
    if (!analysis) return;
    if (analysis.kind === 'post') {
      const ids = analysis.post.media
        .filter((media) => wantedMedia(media, mode))
        .map((media) => media.id);
      setSelectedMedia(new Set(ids));
    } else if (analysis.kind === 'list') {
      // We do not select the whole channel: 50 posts by default is too expensive
      // and unexpected. The user picks the needed ones themselves.
      setSelectedPosts(new Set());
    }
  }, [analysis, mode]);

  useEffect(() => {
    if (analysis?.kind !== 'video' || downloadLock.current) return;
    const formats = analysis.info.formats;
    if (mode === 'audio') {
      setSelectedFormat(
        // The first audio-only on YouTube is the weakest (139 before 140): take the largest
        formats.filter(isAudioOnly).reduce<(typeof formats)[number] | undefined>(
          // >=: without filesize the last one wins, and yt-dlp returns formats from worst to best
          (best, f) => (!best || (f.filesize ?? 0) >= (best.filesize ?? 0) ? f : best),
          undefined,
        )?.format_id ?? pickFormatId(formats, settings.preferredQuality),
      );
      return;
    }
    setSelectedFormat(pickFormatId(formats, settings.preferredQuality));
  }, [analysis, mode, settings.preferredQuality]);

  const startAnalyze = (target: string) => {
    if (!target || pendingAnalyze.current === target) return;
    pendingAnalyze.current = target;
    setAttempt((n) => n + 1);
    setAnalyzeUrl(target);
    setProgress(null);
    setSelectedFormat('');
    setDownloadError(null);
    setBatchProgress(null);
    setSelectedMedia(new Set());
    setSelectedPosts(new Set());
  };

  const handleAnalyze = () => {
    if (downloading) return;
    const trimmed = url.trim();
    if (analyzing && trimmed === analyzeUrl) {
      void queryClient.cancelQueries({ queryKey: ['analysis', analyzeUrl, attempt] });
      pendingAnalyze.current = null;
      setAnalyzeUrl(null);
      return;
    }
    startAnalyze(trimmed);
  };

  // The link is not replaced during a download: the field and analysis stay locked until it ends.
  // biome-ignore lint/correctness/useExhaustiveDependencies: react only to a new request
  useEffect(() => {
    if (!reopen || downloadLock.current) return;
    // The mode from history takes precedence over the link suggestion: the url effect does not overwrite it
    lastUrl.current = reopen.url.trim();
    setUrl(reopen.url);
    setMode(reopen.audio ? 'audio' : 'video');
    startAnalyze(reopen.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reopen]);

  const handleDownload = async () => {
    if (
      !selectedFormat ||
      analysis?.kind !== 'video' ||
      !analyzeUrl ||
      downloading ||
      downloadLock.current
    ) {
      return;
    }
    const info = analysis.info;
    const selectedObj = info.formats.find((format) => format.format_id === selectedFormat);
    const selector = selectedObj ? formatSelector(selectedObj, info.formats) : selectedFormat;
    const kind = selectedObj ? formatKind(selectedObj) : 'video';
    const pageUrl = info.webpage_url || analyzeUrl;
    const recordId = crypto.randomUUID();

    history.addRecord({
      id: recordId,
      url: pageUrl,
      title: info.title,
      site: detectedSite || 'other',
      format: selectedFormat,
      formatLabel: selectedObj ? formatChoiceLabel(selectedObj, info.formats) : selectedFormat,
      kind,
      outputPath: settings.downloadPath,
      timestamp: Date.now(),
      status: 'downloading',
    });

    downloadLock.current = true;
    activeTask.current = recordId;
    const controller = new AbortController();
    downloadAbort.current = controller;
    setDownloading(true);
    setDownloadError(null);
    setProgress(null);
    let unlisten = () => {};
    try {
      await runTask(taskBackend, recordId, controller.signal, async () => {
        unlisten = await onProgress((event) => {
          if (event.taskId !== recordId) return;
          setProgress(event);
        });
        const site = await detectSiteFromUrl(pageUrl);
        history.updateRecord(recordId, { site: site || 'other' });
        const cookiesPath = await ensureNetscapeCookies(site);
        controller.signal.throwIfAborted();
        return downloadVideo(recordId, pageUrl, selector, settings.downloadPath, cookiesPath);
      });
      history.updateRecord(recordId, { status: 'completed' });
      setUrl('');
      setAnalyzeUrl(null);
    } catch (err) {
      const message = errorMessage(err);
      const cancelled = controller.signal.aborted;
      history.updateRecord(recordId, {
        status: 'failed',
        error: cancelled ? translate('history.cancelled') : message,
      });
      if (!cancelled) setDownloadError(message);
    } finally {
      unlisten();
      if (activeTask.current === recordId) activeTask.current = null;
      downloadAbort.current = null;
      downloadLock.current = false;
      setDownloading(false);
      setProgress(null);
    }
  };

  const downloadBoostyPost = async (
    detail: BoostyPostDetail,
    blog: string,
    media: BoostyPostDetail['media'],
    controller: AbortController,
    cookiesPath: string | null,
    errors: string[],
    label: string,
  ) => {
    if (media.length === 0) {
      errors.push(translate('download.noMedia', { title: detail.summary.title }));
      return;
    }
    const folder = boostyPostFolder(settings.downloadPath, blog, detail.summary);
    const postUrl = `https://boosty.to/${blog}/posts/${detail.summary.id}`;

    for (const item of media) {
      if (controller.signal.aborted) return;
      const selector = boostyMediaSelector(item, quality);
      const taskId = crypto.randomUUID();
      const audio = item.kind === 'audio';
      const title =
        media.length > 1 ? `${detail.summary.title} — ${item.title}` : detail.summary.title;
      history.addRecord({
        id: taskId,
        url: postUrl,
        title,
        site: 'boosty',
        format: selector.formatId,
        formatLabel: `${boostyQualityLabel(quality)} • ${translate(audio ? 'common.audio' : 'common.video')}`,
        kind: audio ? 'audio' : 'video',
        outputPath: folder,
        timestamp: Date.now(),
        status: 'downloading',
      });

      activeTask.current = taskId;
      setProgress(null);
      setBatchProgress(`${label} · ${title}`);
      try {
        await runTask(taskBackend, taskId, controller.signal, async () => {
          // An external video of the post (YouTube etc.) uses its own site's cookies, not Boosty's
          const itemCookies =
            item.kind === 'external' && item.url
              ? await ensureNetscapeCookies(await detectSiteFromUrl(item.url))
              : cookiesPath;
          return downloadVideo(
            taskId,
            boostyMediaUrl(postUrl, item),
            selector.formatId,
            folder,
            itemCookies,
            selector.playlistIndex,
            selector.quality,
          );
        });
        history.updateRecord(taskId, { status: 'completed' });
      } catch (err) {
        const cancelled = controller.signal.aborted;
        history.updateRecord(taskId, {
          status: 'failed',
          error: cancelled ? translate('history.cancelled') : errorMessage(err),
        });
        if (cancelled) return;
        errors.push(`${detail.summary.title}: ${errorMessage(err)}`);
      }
    }
  };

  const handleBoostyDownload = async (wholeFeed = false) => {
    if (!analysis || analysis.kind === 'video' || downloading || downloadLock.current) {
      return;
    }
    const controller = new AbortController();
    downloadAbort.current = controller;
    downloadLock.current = true;
    setDownloading(true);
    setDownloadError(null);
    setProgress(null);
    setBatchProgress(null);
    let unlisten = () => {};
    const errors: string[] = [];

    try {
      unlisten = await onProgress((event) => {
        if (event.taskId !== activeTask.current) return;
        setProgress(event);
      });
      const cookiesPath = await ensureNetscapeCookies('boosty');

      if (analysis.kind === 'post') {
        const blog = blogFromUrl(analyzeUrl || '');
        const media = analysis.post.media.filter((item) => selectedMedia.has(item.id));
        await downloadBoostyPost(
          analysis.post,
          blog,
          media,
          controller,
          cookiesPath,
          errors,
          translate('download.postLabel'),
        );
      } else {
        let list = analysis.list;
        let posts = list.posts.filter((post) => selectedPosts.has(post.id));
        if (wholeFeed) {
          // The whole feed unlocked by a subscription: the channel list on screen is only the first 50.
          setBatchProgress(translate('download.loadingFeed'));
          const feedTask = crypto.randomUUID();
          list = await runTask(taskBackend, feedTask, controller.signal, () =>
            boostyList(feedTask, `https://boosty.to/${list.blog}`, cookiesPath, 5000, true),
          );
          posts = list.posts;
        }
        for (let index = 0; index < posts.length; index++) {
          if (controller.signal.aborted) break;
          const summary = posts[index];
          const label = translate('download.postN', { n: index + 1, total: posts.length });
          setBatchProgress(`${label} · ${summary.title}`);
          try {
            const metaTask = crypto.randomUUID();
            const detail = await runTask(taskBackend, metaTask, controller.signal, async () => {
              return boostyGetPost(
                metaTask,
                `https://boosty.to/${list.blog}/posts/${summary.id}`,
                cookiesPath,
              );
            });
            const media = detail.media.filter((item) => wantedMedia(item, mode));
            await downloadBoostyPost(
              detail,
              list.blog,
              media,
              controller,
              cookiesPath,
              errors,
              label,
            );
          } catch (err) {
            if (controller.signal.aborted) break;
            errors.push(`${summary.title}: ${errorMessage(err)}`);
          }
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) setDownloadError(errorMessage(err));
    } finally {
      unlisten();
      downloadAbort.current = null;
      downloadLock.current = false;
      setDownloading(false);
      setProgress(null);
      setBatchProgress(null);
    }

    if (!controller.signal.aborted && errors.length > 0) {
      setDownloadError(translate('download.partial', { errors: errors.slice(0, 3).join('; ') }));
    }
  };

  const handleCancel = () => {
    downloadAbort.current?.abort();
  };

  const handleSaveInlineCookies = async () => {
    if (!detectedSite || !inlineCookies.trim()) return;
    try {
      const normalized = normalizeCookies(inlineCookies);
      await saveSiteCookies(detectedSite, normalized);
      setSiteHasCookies(true);
      setShowCookiesInline(false);
      setInlineCookies('');
      if (analyzeUrl) setAttempt((n) => n + 1);
    } catch (err) {
      setDownloadError(errorMessage(err));
    }
  };

  const analyzeError = analyzeUrl && error ? errorMessage(error) : null;
  const siteLabel = detectedSite ? SITE_LABELS[detectedSite] || detectedSite : null;

  const videoFormats =
    shownAnalysis?.kind === 'video'
      ? shownAnalysis.info.formats
          .filter(isVideoChoice)
          .sort((a, b) => (b.height || 0) - (a.height || 0) || a.ext.localeCompare(b.ext))
      : [];
  const audioFormats =
    shownAnalysis?.kind === 'video' ? shownAnalysis.info.formats.filter(isAudioOnly) : [];

  return (
    <div className="download">
      <div className="download-hero">
        <img src={appIcon} alt="" className="hero-icon" draggable={false} />
        <h1>{t('download.title')}</h1>
        <p>{t('download.subtitle')}</p>
      </div>

      <Composer
        url={url}
        onUrlChange={setUrl}
        mode={mode}
        onModeChange={setMode}
        onAnalyze={handleAnalyze}
        analyzing={analyzing}
        disabled={downloading}
        siteLabel={siteLabel}
        siteHasCookies={siteHasCookies}
        onCookies={() => setShowCookiesInline((current) => !current)}
      />

      {showCookiesInline && detectedSite && (
        <div className="cookies-inline">
          <div className="cookies-inline-head">
            <span>{t('download.cookiesFor', { site: siteLabel || '' })}</span>
            <button type="button" className="quiet-btn" onClick={() => setShowCookiesInline(false)}>
              {t('common.close')}
            </button>
          </div>
          <textarea
            className="cookies-inline-input"
            value={inlineCookies}
            onChange={(event) => setInlineCookies(event.target.value)}
            placeholder={t('download.cookiesPlaceholder', { site: siteLabel || '' })}
            rows={5}
            spellCheck={false}
          />
          <div className="cookies-inline-actions">
            <button
              type="button"
              className="solid-btn"
              onClick={handleSaveInlineCookies}
              disabled={!inlineCookies.trim()}
            >
              {t('common.save')}
            </button>
            <span className="muted">{t('download.cookiesHint')}</span>
          </div>
        </div>
      )}

      {analyzeError && (
        <div className="inline-error">
          <strong>{t('download.analyzeFailed')}</strong>
          <p>{analyzeError}</p>
        </div>
      )}

      {shownAnalysis?.kind === 'video' && (
        <section className="video-result">
          <div className="video-summary">
            {shownAnalysis.info.thumbnail && (
              <img
                src={shownAnalysis.info.thumbnail}
                alt={shownAnalysis.info.title}
                className="video-thumb"
              />
            )}
            <div className="video-copy">
              <h2>{shownAnalysis.info.title}</h2>
              <p>
                {shownAnalysis.info.uploader || t('common.source')}
                {shownAnalysis.info.duration
                  ? ` · ${formatDuration(shownAnalysis.info.duration)}`
                  : ''}
              </p>
            </div>
          </div>

          <div className="video-actions">
            <Dropdown
              className="select-control"
              value={selectedFormat}
              placeholder={t('download.chooseFormat')}
              options={[...videoFormats, ...audioFormats].map((format) => ({
                value: format.format_id,
                label: formatChoiceLabel(format, shownAnalysis.info.formats),
              }))}
              onChange={setSelectedFormat}
              disabled={downloading}
            />
            <button
              type="button"
              className="solid-btn"
              onClick={downloading ? handleCancel : handleDownload}
              disabled={!downloading && !selectedFormat}
            >
              {downloading ? t('common.cancel') : t('common.download')}
            </button>
          </div>

          {videoFormats.length === 0 && audioFormats.length === 0 && (
            <p className="muted small">{t('download.noFormats')}</p>
          )}

          {progress && (
            <div className="progress-block">
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${Math.min(100, progress.progress * 100)}%` }}
                />
              </div>
              <div className="progress-meta">
                {progress.merging ? (
                  <span>{t('download.merging')}</span>
                ) : (
                  <>
                    {!!progress.part && <span>{t('download.part', { n: progress.part + 1 })}</span>}
                    <span>{(progress.progress * 100).toFixed(1)}%</span>
                  </>
                )}
                {progress.speed && <span>{progress.speed}</span>}
                {progress.eta && <span>ETA {progress.eta}</span>}
              </div>
            </div>
          )}
        </section>
      )}

      {shownAnalysis?.kind === 'post' && (
        <BoostyPostPanel
          post={shownAnalysis.post}
          selected={selectedMedia}
          onToggle={(id) =>
            setSelectedMedia((current) => {
              const next = new Set(current);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onSelectAll={(select) =>
            setSelectedMedia(
              select ? new Set(shownAnalysis.post.media.map((media) => media.id)) : new Set(),
            )
          }
          onDownload={() => void handleBoostyDownload()}
          quality={quality}
          onQualityChange={setQuality}
          downloading={downloading}
        />
      )}

      {shownAnalysis?.kind === 'list' && (
        <BoostyChannelPanel
          list={shownAnalysis.list}
          selected={selectedPosts}
          onToggle={(id) =>
            setSelectedPosts((current) => {
              const next = new Set(current);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onSelectAll={(select) =>
            setSelectedPosts(
              select
                ? new Set(
                    shownAnalysis.list.posts
                      .filter((post) => !isBlocked(post))
                      .map((post) => post.id),
                  )
                : new Set(),
            )
          }
          onDownload={() => void handleBoostyDownload()}
          onDownloadFeed={() => void handleBoostyDownload(true)}
          quality={quality}
          onQualityChange={setQuality}
          downloading={downloading}
          progressLabel={batchProgress || undefined}
        />
      )}

      {downloading && shownAnalysis?.kind !== 'video' && (
        <div className="batch-status">
          <Loader2 size={14} className="spin" />
          <span>{batchProgress || t('download.batchDefault')}</span>
          <button type="button" className="quiet-btn" onClick={handleCancel}>
            {t('common.cancel')}
          </button>
        </div>
      )}

      {downloadError && (
        <div className="inline-error">
          <strong>{t('download.failed')}</strong>
          <p>{downloadError}</p>
        </div>
      )}
    </div>
  );
}
