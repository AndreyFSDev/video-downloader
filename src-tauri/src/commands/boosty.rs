use crate::i18n::tr;
use crate::models::{BoostyList, BoostyPostDetail};
use crate::services::boosty::{self, BoostyAccount};
use crate::services::browser_cookies::{self, ImportResult};
use crate::services::{tasks, tools};

// Commands run on the Tauri tokio runtime. List/post only read
// cookies, so the master file is not copied: only token refresh changes it.
#[tauri::command]
pub async fn boosty_list(
    task_id: String,
    url: String,
    cookies_path: Option<String>,
    limit: Option<usize>,
    accessible_only: Option<bool>,
) -> Result<BoostyList, String> {
    let cancel = tasks::claim(&task_id)?;
    let _registration = tasks::Registration(task_id);
    tokio::select! {
        biased;
        _ = cancel => Err(tr("Загрузка отменена", "Download cancelled")),
        result = boosty::list(&url, limit.unwrap_or(50), accessible_only.unwrap_or(false), cookies_path.as_deref()) => result,
    }
}

#[tauri::command]
pub async fn boosty_get_post(
    task_id: String,
    url: String,
    cookies_path: Option<String>,
) -> Result<BoostyPostDetail, String> {
    let cancel = tasks::claim(&task_id)?;
    let _registration = tasks::Registration(task_id);
    tokio::select! {
        biased;
        _ = cancel => Err(tr("Загрузка отменена", "Download cancelled")),
        result = boosty::get_post(&url, cookies_path.as_deref()) => result,
    }
}

/// Live sign-in check: the account subscriptions. Cookies are taken from the store itself.
#[tauri::command]
pub async fn boosty_account() -> Result<BoostyAccount, String> {
    let path = crate::services::cookies::get_cookies_file("boosty")
        .map(|p| p.to_string_lossy().into_owned());
    boosty::account(path.as_deref()).await
}

#[tauri::command]
pub async fn import_browser_cookies(
    task_id: String,
    browser: String,
    site: String,
) -> Result<ImportResult, String> {
    let cancel = tasks::claim(&task_id)?;
    let _registration = tasks::Registration(task_id);
    let ytdlp = tools::ytdlp_path()?;
    browser_cookies::import(&ytdlp, &browser, &site, cancel).await
}
