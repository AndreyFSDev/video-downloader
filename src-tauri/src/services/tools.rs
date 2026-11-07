// yt-dlp and FFmpeg are not bundled into the exe: on first launch they are downloaded into `tools\`
// next to the program (or into %LOCALAPPDATA% if the program folder is read-only).
// Versions and SHA-256 are pinned: a swapped file on a mirror will not pass the check.

use crate::i18n::tr;
use crate::t;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const YTDLP_VERSION: &str = "2026.10.26";
pub const FFMPEG_VERSION: &str = "9.0.1";

const YTDLP_URL: &str = "https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp.exe";
const YTDLP_SHA256: &str = "f5389d3698ecde4ef06f4e6b1ce0294fe9ac1396228c8990b8d3416d6d177a7d";

const FFMPEG_ZIP_URL: &str =
    "https://github.com/GyanD/codexffmpeg/releases/download/9.0.1/ffmpeg-9.0.1-essentials_build.zip";
const FFMPEG_ZIP_SHA256: &str = "fec81ae03971d9dd4be3ebe02e263bd2ec1d789483f931bdba5f5715e65da2e9";
const FFMPEG_ENTRIES: &[(&str, &str)] = &[
    ("ffmpeg.exe", "72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3"),
    ("ffprobe.exe", "19202b23c0043f15ad1b7bce2344f406fd52bd6efd8f995ce02e7392a1cec52f"),
];

const ATTEMPTS: u32 = 4;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolsStatus {
    pub dir: String,
    pub ytdlp: bool,
    pub ffmpeg: bool,
    pub ytdlp_version: &'static str,
    pub ffmpeg_version: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolsProgress {
    pub tool: &'static str,
    pub downloaded: u64,
    pub total: Option<u64>,
    /// download | verify | extract | retry
    pub stage: &'static str,
}

fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe().ok()?.parent().map(Path::to_path_buf)
}

fn writable(dir: &Path) -> bool {
    if std::fs::create_dir_all(dir).is_err() {
        return false;
    }
    tempfile::tempfile_in(dir).is_ok()
}

/// Tools folder. The decision is cached: the write check creates a file on disk.
pub fn tools_dir() -> PathBuf {
    static DIR: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();
    DIR.get_or_init(|| {
        if let Some(dir) = exe_dir().map(|d| d.join("tools")) {
            if writable(&dir) {
                return dir;
            }
        }
        let fallback = dirs::data_local_dir()
            .unwrap_or_else(std::env::temp_dir)
            .join("video-downloader")
            .join("tools");
        let _ = std::fs::create_dir_all(&fallback);
        fallback
    })
    .clone()
}

fn find(name: &str) -> Option<PathBuf> {
    let installed = tools_dir().join(name);
    if installed.is_file() {
        return Some(installed);
    }
    // dev build: binaries prepared in src-tauri/binaries, so they are not downloaded into target.
    #[cfg(debug_assertions)]
    {
        let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries").join(name);
        if dev.is_file() {
            return Some(dev);
        }
    }
    None
}

pub fn ytdlp_path() -> Result<PathBuf, String> {
    find("yt-dlp.exe").ok_or_else(|| {
        tr(
            "yt-dlp ещё не скачан. Откройте Настройки → Компоненты и нажмите «Скачать».",
            "yt-dlp is not downloaded yet. Open Settings → Components and press “Download”.",
        )
    })
}

pub fn ffmpeg_path() -> Option<PathBuf> {
    find("ffmpeg.exe")
}

pub fn status() -> ToolsStatus {
    ToolsStatus {
        dir: tools_dir().to_string_lossy().into_owned(),
        ytdlp: find("yt-dlp.exe").is_some(),
        ffmpeg: find("ffmpeg.exe").is_some() && find("ffprobe.exe").is_some(),
        ytdlp_version: YTDLP_VERSION,
        ffmpeg_version: FFMPEG_VERSION,
    }
}

// One install at a time: a double click must not download 110 MB twice into the same file.
static INSTALL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Runs on the Tauri tokio runtime; blocking hashing/extraction happens in spawn_blocking.
pub async fn install<F>(on_progress: F) -> Result<ToolsStatus, String>
where
    F: Fn(ToolsProgress) + Send + Sync + 'static,
{
    let _guard = INSTALL.lock().await;
    let dir = tools_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|e| t!("Не удалось создать папку {}: {}", "Failed to create folder {}: {}", dir.display(), e))?;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(60))
        .user_agent(concat!("video-downloader/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    let on_progress = std::sync::Arc::new(on_progress);

    if find("yt-dlp.exe").is_none() {
        let target = dir.join("yt-dlp.exe");
        let staged = download_verified(&client, "yt-dlp", YTDLP_URL, YTDLP_SHA256, &dir, on_progress.clone()).await?;
        staged.persist(&target).map_err(|e| e.error.to_string())?;
    }

    if find("ffmpeg.exe").is_none() || find("ffprobe.exe").is_none() {
        let archive = download_verified(&client, "ffmpeg", FFMPEG_ZIP_URL, FFMPEG_ZIP_SHA256, &dir, on_progress.clone()).await?;
        on_progress(ToolsProgress { tool: "ffmpeg", downloaded: 0, total: None, stage: "extract" });
        let dir_for_task = dir.clone();
        tokio::task::spawn_blocking(move || extract_ffmpeg(archive.path(), &dir_for_task))
            .await
            .map_err(|e| e.to_string())??;
    }
    Ok(status())
}

async fn download_verified<F>(
    client: &reqwest::Client,
    tool: &'static str,
    url: &str,
    sha256: &str,
    dir: &Path,
    on_progress: std::sync::Arc<F>,
) -> Result<tempfile::NamedTempFile, String>
where
    F: Fn(ToolsProgress) + Send + Sync + 'static,
{
    let mut last_error = String::new();
    for attempt in 0..ATTEMPTS {
        if attempt > 0 {
            // Exponential backoff 2, 4, 8 s: the GitHub CDN sometimes drops long downloads.
            on_progress(ToolsProgress { tool, downloaded: 0, total: None, stage: "retry" });
            tokio::time::sleep(Duration::from_secs(1 << attempt)).await;
        }
        match download_once(client, tool, url, sha256, dir, &*on_progress).await {
            Ok(file) => return Ok(file),
            Err(DownloadError::Fatal(error)) => return Err(error),
            Err(DownloadError::Retryable(error)) => last_error = error,
        }
    }
    Err(t!(
        "Не удалось скачать {} после {} попыток: {}",
        "Failed to download {} after {} attempts: {}",
        tool,
        ATTEMPTS,
        last_error
    ))
}

enum DownloadError {
    Retryable(String),
    Fatal(String),
}

async fn download_once<F>(
    client: &reqwest::Client,
    tool: &'static str,
    url: &str,
    sha256: &str,
    dir: &Path,
    on_progress: &F,
) -> Result<tempfile::NamedTempFile, DownloadError>
where
    F: Fn(ToolsProgress),
{
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|e| DownloadError::Retryable(e.to_string()))?;
    let status = response.status();
    if !status.is_success() {
        let error = format!("HTTP {status}");
        return Err(if status.is_server_error() || status.as_u16() == 429 {
            DownloadError::Retryable(error)
        } else {
            DownloadError::Fatal(error)
        });
    }
    let total = response.content_length();
    let mut file = tempfile::Builder::new()
        .prefix(".partial-")
        .tempfile_in(dir)
        .map_err(|e| DownloadError::Fatal(e.to_string()))?;
    let mut hasher = Sha256::new();
    let mut downloaded = 0u64;
    let mut last_report = 0u64;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| DownloadError::Retryable(e.to_string()))?
    {
        hasher.update(&chunk);
        file.write_all(&chunk).map_err(|e| DownloadError::Fatal(e.to_string()))?;
        downloaded += chunk.len() as u64;
        if downloaded - last_report >= 512 * 1024 {
            last_report = downloaded;
            on_progress(ToolsProgress { tool, downloaded, total, stage: "download" });
        }
    }
    on_progress(ToolsProgress { tool, downloaded, total, stage: "verify" });
    let actual = hex(&hasher.finalize());
    if !actual.eq_ignore_ascii_case(sha256) {
        // Corrupted or swapped file: a retry can only help after a drop, not after a swap,
        // but they cannot be told apart, so try again; the temp file is removed on drop.
        return Err(DownloadError::Retryable(t!(
            "SHA-256 не совпал (ожидался {}, получен {})",
            "SHA-256 mismatch (expected {}, got {})",
            sha256,
            actual
        )));
    }
    file.as_file().sync_all().map_err(|e| DownloadError::Fatal(e.to_string()))?;
    Ok(file)
}

fn extract_ffmpeg(archive: &Path, dir: &Path) -> Result<(), String> {
    let file = std::fs::File::open(archive).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for (name, sha256) in FFMPEG_ENTRIES {
        let index = (0..zip.len())
            .find(|&i| {
                zip.name_for_index(i)
                    .is_some_and(|entry| entry.ends_with(&format!("/bin/{name}")))
            })
            .ok_or_else(|| t!("В архиве FFmpeg нет {}", "FFmpeg archive has no {}", name))?;
        let mut entry = zip.by_index(index).map_err(|e| e.to_string())?;
        let mut staged = tempfile::Builder::new()
            .prefix(".partial-")
            .tempfile_in(dir)
            .map_err(|e| e.to_string())?;
        let mut hasher = Sha256::new();
        let mut buf = vec![0u8; 256 * 1024];
        loop {
            let read = entry.read(&mut buf).map_err(|e| e.to_string())?;
            if read == 0 {
                break;
            }
            hasher.update(&buf[..read]);
            staged.write_all(&buf[..read]).map_err(|e| e.to_string())?;
        }
        let actual = hex(&hasher.finalize());
        if !actual.eq_ignore_ascii_case(sha256) {
            return Err(t!("SHA-256 {} не совпал", "SHA-256 of {} does not match", name));
        }
        staged.as_file().sync_all().map_err(|e| e.to_string())?;
        staged.persist(dir.join(name)).map_err(|e| e.error.to_string())?;
    }
    Ok(())
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Leftovers of an interrupted install (exit in the middle of a download).
pub fn cleanup_partials() {
    let Ok(entries) = std::fs::read_dir(tools_dir()) else { return };
    for entry in entries.flatten() {
        if entry.file_name().to_string_lossy().starts_with(".partial-") {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_is_lowercase_sha256() {
        assert_eq!(
            hex(&Sha256::digest(b"abc")),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn pinned_hashes_are_well_formed() {
        for hash in [YTDLP_SHA256, FFMPEG_ZIP_SHA256, FFMPEG_ENTRIES[0].1, FFMPEG_ENTRIES[1].1] {
            assert_eq!(hash.len(), 64);
            assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
        }
    }

    #[tokio::test]
    #[ignore = "качает 110 МБ с GitHub; запускать вручную"]
    async fn live_install_verifies_hashes() {
        let status = install(|_| {}).await.unwrap();
        assert!(status.ytdlp && status.ffmpeg);
    }
}

