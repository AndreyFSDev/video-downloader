use crate::i18n::tr;
use crate::models::{Format, VideoInfo};
use crate::t;
use serde_json::Value;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncRead};
use tokio::process::{Child, Command};
use tokio::sync::mpsc::Sender;
use tokio::sync::oneshot;

const PROGRESS_TEMPLATE: &str = "download:@%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s|%(progress.fragment_index)s|%(progress.fragment_count)s|%(info.format_id)s";

pub struct YtDlp {
    binary_path: String,
    ffmpeg_path: Option<String>,
}

impl YtDlp {
    pub fn new(binary_path: String, ffmpeg_path: Option<String>) -> Self {
        Self {
            binary_path,
            ffmpeg_path,
        }
    }

    fn auth_args<'a>(&'a self, cookies: Option<&'a str>) -> Vec<&'a str> {
        match cookies {
            Some(path) => vec!["--cookies", path],
            None => vec![],
        }
    }

    pub async fn get_video_info(
        &self,
        url: &str,
        cookies: Option<&str>,
        mut cancel: oneshot::Receiver<()>,
    ) -> Result<VideoInfo, String> {
        validate_url(url)?;
        // --no-playlist: a URL like watch?v=...&list=... otherwise returns JSON
        // for every playlist item, and parsing fails.
        let mut args = vec![
            "--dump-json",
            "--no-download",
            "--no-warnings",
            "--no-playlist",
            "--playlist-items", "1",
            "--ignore-config",
            "--socket-timeout", "30",
        ];
        args.extend(self.auth_args(cookies));
        args.extend(["--", url]);

        // Metadata does not take minutes: without a timeout a stalled network
        // would spin the analysis spinner forever.
        let output = tokio::select! {
            biased;
            _ = &mut cancel => return Err(tr("Загрузка отменена", "Download cancelled")),
            result = async {
                let (child, _tree) = super::process::spawn(Command::new(&self.binary_path).args(&args).env("PYTHONUTF8", "1")).await?;
                tokio::time::timeout(Duration::from_secs(120), child.wait_with_output()).await
                    .map_err(|_| tr("Анализ ссылки прерван: yt-dlp не ответил за 120 секунд", "Link analysis aborted: yt-dlp did not respond within 120 seconds"))?
                    .map_err(|e| t!("Не удалось прочитать ответ yt-dlp: {}", "Failed to read yt-dlp output: {}", e))
            } => result?,
        };

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let msg = if stderr.trim().is_empty() {
                t!("yt-dlp завершился с кодом {}", "yt-dlp exited with code {}", output.status.code().unwrap_or(-1))
            } else {
                humanize_error(&stderr)
            };
            return Err(msg);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        self.parse_video_info(first_json_line(&stdout))
    }

    fn parse_video_info(&self, json: &str) -> Result<VideoInfo, String> {
        let value: Value =
            serde_json::from_str(json).map_err(|e| t!("Не удалось разобрать ответ: {}", "Failed to parse the response: {}", e))?;

        let formats = value
            .get("formats")
            .and_then(|f| f.as_array())
            .map(|arr| arr.iter().filter_map(|f| self.parse_format(f)).collect())
            .unwrap_or_default();

        let thumbnail = value
            .get("thumbnail")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());

        Ok(VideoInfo {
            id: value
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string(),
            title: value
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or(if crate::i18n::is_en() { "Untitled" } else { "Без названия" })
                .to_string(),
            thumbnail,
            duration: value.get("duration").and_then(|v| v.as_f64()),
            uploader: value
                .get("uploader")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            webpage_url: value
                .get("webpage_url")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .unwrap_or("")
                .to_string(),
            formats,
        })
    }

    fn parse_format(&self, value: &Value) -> Option<Format> {
        let ext = value.get("ext")?.as_str()?.to_string();
        // A YouTube storyboard is not a video and only clutters the quality list.
        if ext == "mhtml" {
            return None;
        }
        let height = value
            .get("height")
            .and_then(json_i32)
            .or_else(|| height_from_resolution(value));
        Some(Format {
            format_id: value.get("format_id")?.as_str()?.to_string(),
            ext,
            width: value.get("width").and_then(json_i32),
            height,
            fps: value.get("fps").and_then(|v| v.as_f64()),
            vcodec: json_str(value, "vcodec"),
            acodec: json_str(value, "acodec"),
            video_ext: json_str(value, "video_ext"),
            audio_ext: json_str(value, "audio_ext"),
            // yt-dlp may return either an int or a float (filesize_approx).
            filesize: value
                .get("filesize")
                .and_then(json_i64)
                .or_else(|| value.get("filesize_approx").and_then(json_i64)),
            format_note: json_str(value, "format_note"),
        })
    }

    pub async fn download_video<F>(
        &self,
        url: &str,
        format_id: &str,
        output_dir: &str,
        cookies: Option<&str>,
        playlist_index: Option<usize>,
        quality: Option<&str>,
        mut cancel: oneshot::Receiver<()>,
        on_progress: F,
    ) -> Result<String, String>
    where
        F: Fn(DownloadProgress),
    {
        validate_url(url)?;
        let args = build_download_args(
            format_id,
            output_dir,
            cookies,
            self.ffmpeg_path.as_deref(),
            playlist_index,
            quality,
            url,
        );

        let mut command = Command::new(&self.binary_path);
        command.args(&args).env("PYTHONUTF8", "1");
        let (mut child, tree) = tokio::select! {
            biased;
            _ = &mut cancel => return Err(tr("Загрузка отменена", "Download cancelled")),
            result = super::process::spawn(&mut command) => result?,
        };

        let (tx, mut rx) = tokio::sync::mpsc::channel(64);
        // In this yt-dlp version progress goes to stdout and errors to stderr.
        // We read both: an unread stderr fills up and hangs the process,
        // and a progress line must not be lost if it goes to stderr.
        let stdout_task = spawn_lines(child.stdout.take(), false, tx.clone());
        let stderr_task = spawn_lines(child.stderr.take(), true, tx.clone());
        drop(tx);

        let mut stderr_tail = String::new();
        let mut cancelled = false;
        // yt-dlp downloads video and audio as two files in a row: without a track number the bar
        // dropped from 100% to 0%, and the ffmpeg merge ran "dead" seconds at 100%.
        let mut format: Option<String> = None;
        let mut part = 0u32;
        loop {
            tokio::select! {
                biased;
                _ = &mut cancel => {
                    cancelled = true;
                    break;
                }
                msg = rx.recv() => {
                    match msg {
                        Some((is_err, line)) => {
                            if let Some((progress, speed, eta, id)) = parse_progress_line(&line) {
                                if id.is_some() && format.is_some() && id != format {
                                    part += 1;
                                }
                                if id.is_some() {
                                    format = id;
                                }
                                on_progress(DownloadProgress { progress, speed, eta, part, merging: false });
                            } else if line.starts_with("[Merger]") {
                                on_progress(DownloadProgress { progress: 1.0, speed: None, eta: None, part, merging: true });
                            } else if is_err {
                                push_tail(&mut stderr_tail, &line);
                            }
                        }
                        None => break,
                    }
                }
            }
        }

        stdout_task.abort();
        stderr_task.abort();
        drop(rx);

        if cancelled {
            drop(tree);
            stop_child(&mut child).await;
            return Err(tr("Загрузка отменена", "Download cancelled"));
        }

        let status = tokio::select! {
            biased;
            _ = &mut cancel => {
                drop(tree);
                stop_child(&mut child).await;
                return Err(tr("Загрузка отменена", "Download cancelled"));
            }
            result = child.wait() => result.map_err(|e| e.to_string())?,
        };
        if !status.success() {
            let msg = if stderr_tail.trim().is_empty() {
                t!("yt-dlp завершился с кодом {}", "yt-dlp exited with code {}", status.code().unwrap_or(-1))
            } else {
                humanize_error(&stderr_tail)
            };
            return Err(msg);
        }

        Ok("Download completed".to_string())
    }
}

fn quality_height(quality: Option<&str>) -> Option<u32> {
    quality?.trim().trim_end_matches('p').parse::<u32>().ok().filter(|height| *height > 0)
}

fn selector(format_id: &str, quality: Option<&str>) -> String {
    match quality.map(str::trim).filter(|value| !value.is_empty()) {
        Some("audio") => "bestaudio/best".to_string(),
        Some("best") => "bestvideo*+bestaudio/best".to_string(),
        Some(value) => match value.trim_end_matches('p').parse::<u32>() {
            // A trailing /best without a height cap returned the maximum when no formats
            // below the threshold exist; -S sort in build_download_args picks the closest to the threshold.
            Ok(height) if height > 0 => "bv*+ba/b".to_string(),
            _ => format_id.to_string(),
        },
        None => format_id.to_string(),
    }
}

// Pulled out of download_video so the arguments can be tested without starting a process.
fn build_download_args(
    format_id: &str,
    output_dir: &str,
    cookies: Option<&str>,
    ffmpeg_path: Option<&str>,
    playlist_index: Option<usize>,
    quality: Option<&str>,
    url: &str,
) -> Vec<String> {
    let mut args = vec![
        "-f".to_string(),
        selector(format_id, quality),
    ];
    if let Some(height) = quality_height(quality) {
        // Highest not above the threshold, or if there is none — the lowest above it
        args.push("-S".to_string());
        args.push(format!("res:{height}"));
    }
    args.extend([
        "-P".to_string(),
        output_dir.to_string(),
        "-o".to_string(),
        // id in the name separates clips with the same title: otherwise the second
        // one "successfully" does not download because the file already exists.
        // format_id in the name: otherwise a retry in another format (same height, different audio,
        // video without height) finds the old file, yt-dlp exits with code 0
        // and "Done" hangs over the previous one. Height is only for readability.
        "%(title).80B [%(id)s] %(height&{}p |)s%(format_id)s.%(ext)s".to_string(),
        "--windows-filenames".to_string(),
        "--newline".to_string(),
    ]);
    // For a Boosty post with several videos yt-dlp must see a playlist
    // and take the selected item. For a regular link the behaviour is unchanged.
    if let Some(index) = playlist_index {
        args.push("--playlist-items".to_string());
        args.push(index.max(1).to_string());
    } else {
        args.push("--no-playlist".to_string());
        args.push("--playlist-items".to_string());
        args.push("1".to_string());
    }
    args.extend(
        [
            "--ignore-config",
            "--socket-timeout",
            "30",
            "--progress-delta",
            "0.5",
            "--progress-template",
            PROGRESS_TEMPLATE,
            "--sleep-requests",
            "1",
            // Boosty/YouTube CDN drops are routine: retry with exponential backoff up to 30 s.
            "--retries",
            "10",
            "--fragment-retries",
            "10",
            "--extractor-retries",
            "3",
            "--retry-sleep",
            "http:exp=1:30",
            "--retry-sleep",
            "fragment:exp=1:30",
            "--retry-sleep",
            "extractor:exp=2:30",
        ]
        .into_iter()
        .map(str::to_string),
    );
    // Muxing a video-only format with audio needs ffmpeg; if it sits next to
    // yt-dlp we pass it explicitly, otherwise yt-dlp looks for it in PATH.
    if let Some(ffmpeg) = ffmpeg_path {
        args.push("--ffmpeg-location".to_string());
        args.push(ffmpeg.to_string());
    }
    if let Some(path) = cookies {
        args.push("--cookies".to_string());
        args.push(path.to_string());
    }
    args.push("--".to_string());
    args.push(url.to_string());
    args
}

fn spawn_lines<R>(
    stream: Option<R>,
    is_err: bool,
    tx: Sender<(bool, String)>,
) -> tokio::task::JoinHandle<()>
where
    R: AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let Some(stream) = stream else { return };
        let mut reader = tokio::io::BufReader::new(stream);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf).await {
                Ok(0) => break,
                Ok(_) => {
                    let line = String::from_utf8_lossy(&buf).into_owned();
                    if tx.send((is_err, line)).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    })
}

fn validate_url(url: &str) -> Result<(), String> {
    match tauri::Url::parse(url) {
        Ok(parsed) if matches!(parsed.scheme(), "http" | "https") && parsed.host_str().is_some() => Ok(()),
        _ => Err(tr("Нужна полная ссылка, начинающаяся с http:// или https://", "A full link starting with http:// or https:// is required")),
    }
}

async fn stop_child(child: &mut Child) {
    let _ = child.start_kill();
    let _ = child.wait().await;
}

fn push_tail(buf: &mut String, line: &str) {
    buf.push_str(line);
    const MAX: usize = 16 * 1024;
    if buf.len() <= MAX {
        return;
    }
    let mut end = buf.len() - MAX;
    while end < buf.len() && !buf.is_char_boundary(end) {
        end += 1;
    }
    buf.drain(..end);
}

fn json_str(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

fn json_i32(value: &Value) -> Option<i32> {
    json_i64(value).and_then(|n| i32::try_from(n).ok())
}

fn json_i64(value: &Value) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_f64().map(|n| n as i64))
}

fn height_from_resolution(value: &Value) -> Option<i32> {
    let raw = value.get("resolution")?.as_str()?;
    let height = raw.split_once('x')?.1.trim();
    height.parse().ok()
}

// The yt-dlp log sometimes reaches stdout before the JSON. The first non-empty line
// then fails to parse, although the object lies below.
fn first_json_line(stdout: &str) -> &str {
    stdout
        .lines()
        .map(str::trim)
        .find(|line| line.starts_with('{'))
        .unwrap_or("")
}

pub struct DownloadProgress {
    pub progress: f64,
    pub speed: Option<String>,
    pub eta: Option<String>,
    /// Number of the file being downloaded: 0 — first (video), 1 — second (audio for muxing).
    pub part: u32,
    pub merging: bool,
}

fn parse_progress_line(line: &str) -> Option<(f64, Option<String>, Option<String>, Option<String>)> {
    let payload = line.trim().strip_prefix('@')?;
    let mut parts = payload.split('|');
    let downloaded = parts.next().and_then(parse_number);
    let total = parts.next().and_then(parse_number);
    let estimate = parts.next().and_then(parse_number);
    let speed = parts.next().and_then(parse_number);
    let eta_secs = parts.next().and_then(parse_number);
    let fragment = parts.next().and_then(parse_number);
    let fragment_count = parts.next().and_then(parse_number);
    let format_id = parts.next().map(str::trim).filter(|id| !id.is_empty() && *id != "NA").map(str::to_string);

    let progress = if let Some(den) = total.or(estimate).filter(|n| *n > 0.0) {
        downloaded? / den
    } else if let (Some(index), Some(count)) = (fragment, fragment_count.filter(|n| *n > 0.0)) {
        index / count
    } else {
        return None;
    };
    Some((
        progress.clamp(0.0, 1.0),
        speed.map(format_speed),
        eta_secs.map(|s| format_eta(s as u64)),
        format_id,
    ))
}

fn parse_number(s: &str) -> Option<f64> {
    let s = s.trim();
    if s.is_empty() || s.eq_ignore_ascii_case("NA") || s.eq_ignore_ascii_case("None") || s == "null" {
        return None;
    }
    s.parse::<f64>().ok().filter(|n| n.is_finite())
}

fn format_speed(bytes_per_sec: f64) -> String {
    if bytes_per_sec >= 1_048_576.0 {
        format!("{:.1} MB/s", bytes_per_sec / 1_048_576.0)
    } else if bytes_per_sec >= 1024.0 {
        format!("{:.0} KB/s", bytes_per_sec / 1024.0)
    } else {
        format!("{:.0} B/s", bytes_per_sec)
    }
}

fn format_eta(total_seconds: u64) -> String {
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;
    if hours > 0 {
        format!("{hours:02}:{minutes:02}:{seconds:02}")
    } else {
        format!("{minutes:02}:{seconds:02}")
    }
}

fn humanize_error(stderr: &str) -> String {
    let trimmed = stderr.trim();
    let relevant = trimmed
        .lines()
        .rev()
        .find(|line| line.contains("ERROR:"))
        .map(str::trim)
        .unwrap_or(trimmed);
    let text = relevant
        .split_once("ERROR:")
        .map(|(_, rest)| rest.trim())
        .unwrap_or(relevant);
    let lower = text.to_ascii_lowercase();
    if text.contains("requires a subscription") || text.contains("members-only") {
        return tr(
            "Пост доступен только по подписке. Импортируйте cookies в Настройках.",
            "The post is for subscribers only. Import cookies in Settings.",
        );
    }
    if text.contains("[boosty]") && (text.contains("HTTP Error 401") || lower.contains("unauthorized")) {
        return tr(
            "Cookies Boosty истекли. Импортируйте их заново (Настройки → Boosty).",
            "Boosty cookies have expired. Import them again (Settings → Boosty).",
        );
    }
    if text.contains("This video is private") || text.contains("Private video") {
        return tr("Приватное видео: нужны cookies автора.", "Private video: the author's cookies are required.");
    }
    if text.contains("not a bot") || text.contains("Sign in to confirm") {
        return tr(
            "Сайт запросил проверку. Обновите cookies или сам yt-dlp.",
            "The site asked for verification. Refresh cookies or yt-dlp itself.",
        );
    }
    if text.contains("HTTP Error 403") || text.contains("403: Forbidden") {
        return tr(
            "Сайт отклонил запрос (403). Для этого сайта часто нужны cookies.",
            "The site refused the request (403). This site often needs cookies.",
        );
    }
    if lower.contains("ffmpeg") {
        return tr(
            "Для этого качества нужен FFmpeg. Скачайте его в Настройках → Компоненты или выберите формат со звуком.",
            "This quality needs FFmpeg. Download it in Settings → Components or pick a format with audio.",
        );
    }
    if text.contains("Unable to extract") || text.contains("Unsupported URL") {
        return tr(
            "Ссылка не распознана. Проверьте, что это ссылка на видео или пост.",
            "The link was not recognized. Check that it points to a video or a post.",
        );
    }
    if text.contains("Video unavailable") || text.contains("This video is unavailable") {
        return tr(
            "Видео недоступно. Проверьте ссылку или загрузите cookies.",
            "The video is unavailable. Check the link or import cookies.",
        );
    }
    if text.contains("Requested format is not available") {
        return tr("Такого качества нет. Выберите другой формат.", "This quality is not available. Pick another format.");
    }
    text.chars().take(400).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_http_urls_are_passed_to_the_downloader() {
        assert!(validate_url("https://example.com/video.mp4?x=1").is_ok());
        for invalid in ["--exec=calc.exe", "file:///C:/private", "javascript:alert(1)", "not a url"] {
            assert!(validate_url(invalid).is_err());
        }
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn real_ytdlp_analysis_and_download_cancel_a_silent_socket() {
        for analyzing in [true, false] {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let url = format!("http://{}/slow.mp4", listener.local_addr().unwrap());
            let (connected, ready) = oneshot::channel();
            let server = tokio::spawn(async move {
                let (_socket, _) = listener.accept().await.unwrap();
                connected.send(()).unwrap();
                std::future::pending::<()>().await;
            });
            let binary = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries/yt-dlp.exe");
            let (cancel, receiver) = oneshot::channel();
            let output = tempfile::tempdir().unwrap();
            let output_path = output.path().to_string_lossy().into_owned();
            let operation = tokio::spawn(async move {
                let ytdlp = YtDlp::new(binary.to_string_lossy().into_owned(), None);
                if analyzing { ytdlp.get_video_info(&url, None, receiver).await.map(|_| ()) }
                else { ytdlp.download_video(&url, "best", &output_path, None, None, None, receiver, |_| {}).await.map(|_| ()) }
            });
            tokio::time::timeout(Duration::from_secs(15), ready).await.unwrap().unwrap();
            cancel.send(()).unwrap();
            let result = tokio::time::timeout(Duration::from_secs(2), operation).await;
            server.abort();
            assert!(result.expect("cancel waited for the network timeout").unwrap().unwrap_err().contains("отменена"));
        }
    }

    #[test]
    fn json_line_skips_log_prefix() {
        assert_eq!(
            first_json_line("WARNING: x\n{\"id\":\"abc\"}\n"),
            "{\"id\":\"abc\"}"
        );
    }

    #[test]
    fn parses_direct_file_without_codecs() {
        let y = YtDlp::new("yt-dlp".into(), None);
        let info = y
            .parse_video_info(
                r#"{"id":"f","title":"T","thumbnail":"","formats":[
                    {"format_id":"mp4","ext":"mp4","vcodec":null,"acodec":null,"video_ext":"mp4","audio_ext":"none","resolution":"640x360"},
                    {"format_id":"sb0","ext":"mhtml","vcodec":"none","acodec":"none"}
                ]}"#,
            )
            .unwrap();
        assert_eq!(info.formats.len(), 1);
        assert_eq!(info.formats[0].format_id, "mp4");
        assert_eq!(info.formats[0].height, Some(360));
        assert!(info.formats[0].has_video());
        assert!(!info.formats[0].has_audio());
        assert!(info.thumbnail.is_none());
    }

    #[test]
    fn parses_byte_and_fragment_progress() {
        let (progress, speed, eta, id) =
            parse_progress_line("@100|200|NA|1024|65|NA|NA|137").unwrap();
        assert_eq!(id.as_deref(), Some("137"));
        assert!((progress - 0.5).abs() < 1e-9);
        assert_eq!(speed.as_deref(), Some("1 KB/s"));
        assert_eq!(eta.as_deref(), Some("01:05"));

        let (progress, _, _, _) = parse_progress_line("@NA|NA|NA|NA|NA|1|4").unwrap();
        assert!((progress - 0.25).abs() < 1e-9);

        assert!(parse_progress_line("@1024|NA|NA|NA|NA|NA|NA").is_none());
        assert!(parse_progress_line("[download] Destination: a.mp4").is_none());

        let (_, _, eta, _) = parse_progress_line("@500|200|NA|NA|3661").unwrap();
        assert_eq!(eta.as_deref(), Some("01:01:01"));
        let (progress, _, _, _) = parse_progress_line("@500|200|NA|NA|1").unwrap();
        assert!((progress - 1.0).abs() < 1e-9);
    }

    #[test]
    fn humanize_uses_error_line_not_leading_warning() {
        let msg = humanize_error("WARNING: ffmpeg mentioned in passing\nERROR: This video is private");
        assert!(msg.contains("Приватное"));
        let bot = humanize_error("ERROR: [youtube] x: Sign in to confirm you’re not a bot");
        assert!(bot.contains("проверку"));
    }

    #[test]
    fn progress_template_has_parser_fields() {
        assert!(PROGRESS_TEMPLATE.starts_with("download:@"));
        assert!(PROGRESS_TEMPLATE.contains("%(progress.fragment_count)s"));
    }

    #[test]
    fn download_args_keep_single_video_defaults() {
        let args = build_download_args(
            "18",
            "C:\\out",
            Some("cookies.txt"),
            Some("ffmpeg.exe"),
            None,
            None,
            "https://example.com/video",
        );
        assert!(args.contains(&"--no-playlist".to_string()));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "--playlist-items" && pair[1] == "1"));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-f" && pair[1] == "18"));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "--ffmpeg-location"));
        assert_eq!(args.last().map(String::as_str), Some("https://example.com/video"));
    }

    #[test]
    fn download_args_pick_boosty_playlist_item_and_quality() {
        let args = build_download_args(
            "best",
            "C:\\out",
            None,
            None,
            Some(2),
            Some("1080p"),
            "https://boosty.to/author/posts/id",
        );
        assert!(!args.contains(&"--no-playlist".to_string()));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "--playlist-items" && pair[1] == "2"));
        assert!(args.windows(2).any(|pair| {
            pair[0] == "-f"
                && pair[1] == "bv*+ba/b"
        }));
        assert!(args.windows(2).any(|pair| pair[0] == "-S" && pair[1] == "res:1080"));
    }

    #[test]
    fn download_args_use_best_selector_for_boosty() {
        let args = build_download_args(
            "best",
            "C:\\out",
            None,
            None,
            Some(1),
            Some("best"),
            "https://boosty.to/author/posts/id",
        );
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-f" && pair[1] == "bestvideo*+bestaudio/best"));
    }
}
