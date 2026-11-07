use crate::i18n::tr;
use crate::models::VideoInfo;
use crate::services::{tasks, tools, YtDlp};
use crate::t;
use std::path::{Path, PathBuf};
use tauri::Emitter;
static STAGING_EXIT: std::sync::Mutex<bool> = std::sync::Mutex::new(false);

// Both commands run on the Tauri tokio runtime (async commands).
fn ytdlp() -> Result<YtDlp, String> {
    let binary = tools::ytdlp_path()?;
    Ok(YtDlp::new(
        binary.to_string_lossy().into_owned(),
        tools::ffmpeg_path().map(|p| p.to_string_lossy().into_owned()),
    ))
}

fn expand_path(path: &str) -> PathBuf {
    let expanded = if path == "~" {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from(path))
    } else if path.starts_with("~/") || path.starts_with("~\\") {
        match dirs::home_dir() {
            Some(home) => {
                let mut p = home;
                p.push(&path[2..]);
                p
            }
            None => PathBuf::from(&path[2..]),
        }
    } else {
        PathBuf::from(path)
    };
    expanded
}

// On exit yt-dlp rewrites the file passed via --cookies (issue #5977).
// We hand out a copy and leave the master file alone.
#[derive(Debug)]
struct CookiesGuard {
    path: Option<PathBuf>,
    arg: Option<String>,
}

impl CookiesGuard {
    fn stage(src: Option<&str>) -> Result<Self, String> {
        let Some(src) = src.map(str::trim).filter(|s| !s.is_empty()) else {
            return Ok(Self {
                path: None,
                arg: None,
            });
        };
        let source = Path::new(src);
        if !source.is_file() {
            return Err(tr("Файл cookies не найден", "Cookies file not found"));
        }
        let exiting = STAGING_EXIT.lock().unwrap_or_else(|e| e.into_inner());
        if *exiting { return Err(tr("Приложение закрывается", "The application is closing")); }
        // The master file is encrypted; yt-dlp needs a plaintext Netscape file, which lives until the process ends.
        let plain = crate::services::cookies::read_cookies_path(source)?;
        let work = crate::services::cookies::get_cookies_dir().join(".work");
        std::fs::create_dir_all(&work).map_err(|e| t!("Не удалось создать папку временных cookies: {}", "Failed to create temporary cookies folder: {}", e))?;
        let mut pending = tempfile::Builder::new().prefix(&format!("{}-", std::process::id())).suffix(".txt").tempfile_in(work)
            .map_err(|e| t!("Не удалось подготовить cookies: {}", "Failed to prepare cookies: {}", e))?;
        std::io::Write::write_all(&mut pending, plain.as_bytes())
            .map_err(|e| t!("Не удалось подготовить cookies: {}", "Failed to prepare cookies: {}", e))?;
        let dest = pending.into_temp_path().keep().map_err(|e| t!("Не удалось подготовить cookies: {}", "Failed to prepare cookies: {}", e))?;
        let arg = dest.to_string_lossy().into_owned();
        Ok(Self {
            path: Some(dest),
            arg: Some(arg),
        })
    }

    fn as_str(&self) -> Option<&str> {
        self.arg.as_deref()
    }
}

impl Drop for CookiesGuard {
    fn drop(&mut self) {
        if let Some(path) = self.path.take() {
            let _ = std::fs::remove_file(path);
        }
    }
}

// Startup and exit. We do not touch copies of a live second instance.
pub fn cleanup_staged_cookies(exiting: bool) {
    let mut stopping = STAGING_EXIT.lock().unwrap_or_else(|e| e.into_inner());
    if exiting { *stopping = true; }
    let root = crate::services::cookies::get_cookies_dir().join(".work");
    let Ok(entries) = std::fs::read_dir(root) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Some(pid) = name.split('-').next().and_then(|pid| pid.parse::<u32>().ok()) else { continue };
        if pid == std::process::id() || (!exiting && !crate::services::process::is_alive(pid)) {
            if let Err(error) = std::fs::remove_file(entry.path()) {
                if error.kind() != std::io::ErrorKind::NotFound { eprintln!("Unable to remove staged cookies: {}", error.kind()); }
            }
        }
    }
}

#[tauri::command]
pub async fn get_formats(
    task_id: String,
    url: String,
    cookies_path: Option<String>,
) -> Result<VideoInfo, String> {
    let rx = tasks::claim(&task_id)?;
    let _registration = tasks::Registration(task_id);
    let ytdlp = ytdlp()?;
    let cookies = CookiesGuard::stage(cookies_path.as_deref())?;
    ytdlp.get_video_info(&url, cookies.as_str(), rx).await
}

#[tauri::command]
pub async fn download_video(
    app: tauri::AppHandle,
    task_id: String,
    url: String,
    format_id: String,
    output_dir: String,
    cookies_path: Option<String>,
    playlist_index: Option<usize>,
    quality: Option<String>,
) -> Result<String, String> {
    let rx = tasks::claim(&task_id)?;
    let _registration = tasks::Registration(task_id.clone());
    if output_dir.trim().is_empty() {
        return Err(tr("Укажите папку загрузок в настройках", "Set the download folder in Settings"));
    }
    let ytdlp = ytdlp()?;

    let expanded = expand_path(&output_dir);
    std::fs::create_dir_all(&expanded)
        .map_err(|e| t!("Не удалось создать папку {}: {}", "Failed to create folder {}: {}", expanded.display(), e))?;
    let output_dir_str = expanded.to_string_lossy().to_string();

    let cookies = CookiesGuard::stage(cookies_path.as_deref())?;

    ytdlp
        .download_video(
            &url,
            &format_id,
            &output_dir_str,
            cookies.as_str(),
            playlist_index,
            quality.as_deref(),
            rx,
            |event| {
                let _ = app.emit(
                    "download-progress",
                    serde_json::json!({
                        "taskId": task_id,
                        "progress": event.progress,
                        "speed": event.speed,
                        "eta": event.eta,
                        "part": event.part,
                        "merging": event.merging,
                    }),
                );
            },
        )
        .await
}

#[tauri::command]
pub fn cancel_download(task_id: String) -> Result<(), String> {
    tasks::cancel(&task_id);
    Ok(())
}

// Tauri IPC threads; the registry mutex is not held across await.
#[tauri::command]
pub fn prepare_task(task_id: String) -> Result<(), String> { tasks::prepare(&task_id) }

#[tauri::command]
pub fn release_task(task_id: String) { tasks::release(&task_id); }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tilde_expands_to_home_and_absolute_path_stays() {
        let home = dirs::home_dir().expect("home");
        assert_eq!(expand_path("~/Viloader"), home.join("Viloader"));
        assert_eq!(expand_path("~"), home);
        assert_eq!(expand_path("C:\\Videos"), PathBuf::from("C:\\Videos"));
    }

    #[test]
    fn cookies_copy_is_removed_with_the_guard() {
        let dir = std::env::temp_dir().join(format!("vd-src-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("cookies.vdc");
        std::fs::write(&src, crate::services::secure::protect(b"ok").unwrap()).unwrap();
        let staged = CookiesGuard::stage(Some(src.to_str().unwrap())).unwrap();
        let copied = staged.path.clone().unwrap();
        assert!(copied.exists());
        assert_ne!(copied, src);
        assert_eq!(std::fs::read_to_string(&copied).unwrap(), "ok");
        drop(staged);
        assert!(!copied.exists());
        assert!(src.exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn missing_cookies_file_is_an_error() {
        let missing = std::env::temp_dir().join(format!("vd-missing-{}.txt", uuid::Uuid::new_v4()));
        let err = CookiesGuard::stage(Some(missing.to_str().unwrap())).unwrap_err();
        assert!(err.contains("не найден"));
        assert!(CookiesGuard::stage(None).unwrap().as_str().is_none());
    }

    #[test]
    fn cancel_without_task_is_noop() {
        assert!(cancel_download("no-such-task".into()).is_ok());
    }
}


