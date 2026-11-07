// Importing cookies from the owner's browser. Profile decryption is done by yt-dlp
// (--cookies-from-browser): it knows the Firefox and Chromium formats. The dump contains
// cookies of all sites, so it lives for seconds in a temp file, and only the domains
// of the wanted site get into the store, already encrypted.

use crate::i18n::tr;
use crate::services::cookies;
use crate::t;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::process::Command;
use tokio::sync::oneshot;

pub const BROWSERS: &[&str] = &["firefox", "chrome", "edge", "brave", "opera", "vivaldi", "yandex", "chromium"];

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub site: String,
    pub cookies: usize,
}

pub async fn import(
    ytdlp: &Path,
    browser: &str,
    site: &str,
    mut cancel: oneshot::Receiver<()>,
) -> Result<ImportResult, String> {
    if !BROWSERS.contains(&browser) {
        return Err(t!("Браузер {} не поддерживается", "Browser {} is not supported", browser));
    }
    let cookies_from_browser = browser_spec(browser)?;
    let domains = cookies::site_domains(site);

    let work = cookies::get_cookies_dir().join(".work");
    std::fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    // PID prefix: cleanup_staged_cookies removes the file if the process dies mid-import.
    let dump = tempfile::Builder::new()
        .prefix(&format!("{}-browser-", std::process::id()))
        .suffix(".txt")
        .tempfile_in(&work)
        .map_err(|e| e.to_string())?
        .into_temp_path();
    let dump_arg = dump.to_string_lossy().into_owned();

    let mut command = Command::new(ytdlp);
    command
        .args([
            "--ignore-config",
            "--no-warnings",
            "--cookies-from-browser",
            &cookies_from_browser,
            "--cookies",
            &dump_arg,
        ])
        .env("PYTHONUTF8", "1");

    // Without a URL yt-dlp fails with "a link is required", but on exit it still
    // saves the cookie jar. This way not a single network request is made, and the server
    // does not replace the _clientId the Boosty refresh token is bound to.
    let output = tokio::select! {
        biased;
        _ = &mut cancel => return Err(tr("Импорт отменён", "Import cancelled")),
        result = async {
            let (child, _tree) = super::process::spawn(&mut command).await?;
            tokio::time::timeout(Duration::from_secs(120), child.wait_with_output())
                .await
                .map_err(|_| tr("yt-dlp не ответил за 120 секунд", "yt-dlp did not respond within 120 seconds"))?
                .map_err(|e| e.to_string())
        } => result?,
    };

    let content = std::fs::read_to_string(&dump).unwrap_or_default();
    drop(dump);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let (kept, count) = cookies::filter_netscape(&content, &domains);
    if count == 0 {
        return Err(explain_failure(browser, site, &stderr));
    }
    if site == "boosty" && !has_boosty_auth(&kept) {
        return Err(t!(
            "В {} нет входа в Boosty. Войдите на boosty.to в этом браузере и повторите.",
            "{} is not signed in to Boosty. Sign in to boosty.to in that browser and retry.",
            browser_label(browser)
        ));
    }
    cookies::save_cookies(site, &kept)?;
    Ok(ImportResult { site: site.to_string(), cookies: count })
}

fn has_boosty_auth(netscape: &str) -> bool {
    netscape.lines().any(|line| {
        let record = line.strip_prefix("#HttpOnly_").unwrap_or(line);
        record.split('\t').nth(5) == Some("auth")
    })
}

fn browser_label(browser: &str) -> &str {
    match browser {
        "firefox" => "Firefox",
        "chrome" => "Chrome",
        "edge" => "Edge",
        "brave" => "Brave",
        "opera" => "Opera",
        "vivaldi" => "Vivaldi",
        "yandex" => "Yandex Browser",
        "chromium" => "Chromium",
        other => other,
    }
}

/// Yandex Browser is Chromium-based but yt-dlp has no built-in name for it.
/// Hand yt-dlp the Chromium profile path instead of a browser name.
fn browser_spec(browser: &str) -> Result<String, String> {
    if browser != "yandex" {
        return Ok(browser.to_string());
    }
    let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).ok_or_else(|| {
        t!(
            "Could not locate the Yandex Browser profile folder",
            "Could not locate the Yandex Browser profile folder"
        )
    })?;
    let profile = local.join("Yandex").join("YandexBrowser").join("User Data").join("Default");
    if !profile.is_dir() {
        return Err(t!(
            "Yandex Browser profile not found. Launch the browser at least once.",
            "Yandex Browser profile not found. Launch the browser at least once."
        ));
    }
    Ok(format!("chromium:{}", profile.display()))
}

fn explain_failure(browser: &str, site: &str, stderr: &str) -> String {
    let lower = stderr.to_ascii_lowercase();
    let name = browser_label(browser);
    if lower.contains("could not copy") || lower.contains("database is locked") || lower.contains("permission denied") {
        return t!(
            "{} держит базу cookies открытой. Закройте браузер полностью и повторите.",
            "{} keeps its cookie database locked. Close the browser completely and retry.",
            name
        );
    }
    if lower.contains("app-bound") || lower.contains("failed to decrypt") || lower.contains("dpapi") {
        return t!(
            "{} шифрует cookies (App-Bound Encryption), yt-dlp не может их прочитать. Используйте Firefox или импорт из файла.",
            "{} encrypts cookies with App-Bound Encryption, yt-dlp cannot read them. Use Firefox or import from a file.",
            name
        );
    }
    if lower.contains("could not find") || lower.contains("no such file") || lower.contains("not found") {
        return t!(
            "Профиль {} не найден. Браузер установлен и запускался хотя бы раз?",
            "{} profile not found. Is the browser installed and launched at least once?",
            name
        );
    }
    t!(
        "В {} нет cookies для {}. Войдите на сайт в этом браузере и повторите.",
        "{} has no cookies for {}. Sign in to the site in that browser and retry.",
        name,
        site
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn boosty_auth_is_detected_in_filtered_dump() {
        assert!(has_boosty_auth(".boosty.to\tTRUE\t/\tTRUE\t0\tauth\tx\n"));
        assert!(has_boosty_auth("#HttpOnly_.boosty.to\tTRUE\t/\tTRUE\t0\tauth\tx\n"));
        assert!(!has_boosty_auth(".boosty.to\tTRUE\t/\tTRUE\t0\t_clientId\tx\n"));
    }

    #[test]
    fn locked_database_and_app_bound_are_explained() {
        crate::i18n::set_english(false);
        assert!(explain_failure("chrome", "boosty", "ERROR: Could not copy Chrome cookie database").contains("Закройте"));
        assert!(explain_failure("chrome", "boosty", "ERROR: Failed to decrypt with DPAPI").contains("App-Bound"));
        assert!(explain_failure("firefox", "boosty", "").contains("нет cookies"));
    }
}
