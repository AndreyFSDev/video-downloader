use super::secure;
use crate::i18n::tr;
use crate::t;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

pub fn get_cookies_dir() -> PathBuf {
    let dir = dirs::data_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("video-downloader")
        .join("cookies");
    fs::create_dir_all(&dir).ok();
    dir
}

fn sanitize_site(site: &str) -> String {
    let mut safe = String::new();
    for byte in site.to_lowercase().bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.') { safe.push(byte as char); }
        else { safe.push_str(&format!("%{byte:02x}")); }
    }
    if safe.is_empty() { return "site".into(); }
    let stem = safe.split('.').next().unwrap_or("");
    if matches!(stem, "con" | "prn" | "aux" | "nul" | "com1" | "com2" | "com3" | "com4" | "com5" | "com6" | "com7" | "com8" | "com9" | "lpt1" | "lpt2" | "lpt3" | "lpt4" | "lpt5" | "lpt6" | "lpt7" | "lpt8" | "lpt9") {
        safe = format!("%{:02x}{}", safe.as_bytes()[0], &safe[1..]);
    }
    safe
}

// The site name comes from the frontend, so clamp it to a safe file name
// so a path like "../../x" cannot escape the cookies folder.
fn cookies_file(site: &str) -> PathBuf {
    get_cookies_dir().join(format!("{}.{ENCRYPTED_EXT}", sanitize_site(site)))
}

fn legacy_file(site: &str) -> PathBuf {
    get_cookies_dir().join(format!("{}.txt", sanitize_site(site)))
}

// Master cookie files are DPAPI-encrypted; plaintext lives only
// in a one-off copy for yt-dlp (CookiesGuard) and is deleted right after the process.
const ENCRYPTED_EXT: &str = "vdc";

pub fn save_cookies(site: &str, content: &str) -> Result<PathBuf, String> {
    let content = content.strip_prefix('\u{feff}').unwrap_or(content);
    if content.trim().is_empty() {
        return Err(tr("Пустой файл cookies", "Cookies file is empty"));
    }
    let path = cookies_file(site);
    let sealed = secure::protect(content.as_bytes())?;
    write_atomic(&path, &sealed)
        .map_err(|e| t!("Не удалось сохранить cookies: {}", "Failed to save cookies: {}", e))?;
    let _ = fs::remove_file(legacy_file(site));
    Ok(path)
}

// Same-folder replacement: a reader sees either the old file or a complete new one.
fn write_atomic(path: &Path, content: &[u8]) -> std::io::Result<()> {
    let mut pending = tempfile::NamedTempFile::new_in(path.parent().unwrap())?;
    pending.write_all(content)?;
    pending.as_file().sync_all()?;
    pending.persist(path).map_err(|e| e.error)?;
    Ok(())
}

/// Plaintext of the master file at the path returned by get_cookies_file.
pub fn read_cookies_path(path: &Path) -> Result<String, String> {
    let data = fs::read(path)
        .map_err(|e| t!("Не удалось прочитать cookies: {}", "Failed to read cookies: {}", e))?;
    let plain = secure::unprotect(&data)?;
    String::from_utf8(plain).map_err(|_| tr("Файл cookies не в UTF-8", "Cookies file is not UTF-8"))
}

/// Re-encrypts plaintext cookie files left over from versions before 0.2.0.
pub fn migrate_plaintext() {
    let Ok(entries) = fs::read_dir(get_cookies_dir()) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("txt") {
            continue;
        }
        let Some(site) = path.file_stem().and_then(|n| n.to_str()).and_then(decode_site) else { continue };
        if let Ok(content) = read_cookies_path(&path) {
            if save_cookies(&site, &content).is_ok() {
                let _ = fs::remove_file(&path);
            }
        }
    }
}

// Path to an existing cookies file without reading its content: it is enough
// for the frontend to pass it back to the backend commands.
pub fn get_cookies_file(site: &str) -> Option<PathBuf> {
    let path = cookies_file(site);
    path.exists().then_some(path)
}

pub fn load_cookies(site: &str) -> Result<Option<String>, String> {
    match get_cookies_file(site) {
        Some(path) => read_cookies_path(&path).map(Some),
        None => Ok(None),
    }
}

pub fn list_cookies() -> Result<Vec<String>, String> {
    let dir = get_cookies_dir();
    let entries = fs::read_dir(&dir)
        .map_err(|e| t!("Не удалось прочитать папку: {}", "Failed to read folder: {}", e))?;
    let mut sites = vec![];
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some(ENCRYPTED_EXT) {
            // Raw file name: cookies_file looks up by the same rule,
            // any transformation breaks the round-trip.
            if let Some(site) = path.file_stem().and_then(|n| n.to_str()).and_then(decode_site) {
                sites.push(site);
            }
        }
    }
    Ok(sites)
}

fn decode_site(name: &str) -> Option<String> {
    let bytes = name.as_bytes();
    let mut decoded = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hex = std::str::from_utf8(bytes.get(index + 1..index + 3)?).ok()?;
            decoded.push(u8::from_str_radix(hex, 16).ok()?);
            index += 3;
        } else { decoded.push(bytes[index]); index += 1; }
    }
    String::from_utf8(decoded).ok()
}

pub fn delete_cookies(site: &str) -> Result<(), String> {
    for path in [cookies_file(site), legacy_file(site)] {
        match fs::remove_file(&path) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(t!("Не удалось удалить cookies: {}", "Failed to delete cookies: {}", e)),
        }
    }
    Ok(())
}

/// Domains whose cookies the site needs. For an unknown site — the host itself.
pub fn site_domains(site: &str) -> Vec<String> {
    let known: &[&str] = match site {
        "boosty" => &["boosty.to"],
        "youtube" => &["youtube.com", "google.com"],
        "vimeo" => &["vimeo.com"],
        "tiktok" => &["tiktok.com"],
        "twitter" => &["twitter.com", "x.com"],
        "instagram" => &["instagram.com"],
        "facebook" => &["facebook.com"],
        "twitch" => &["twitch.tv"],
        "dailymotion" => &["dailymotion.com"],
        "rutube" => &["rutube.ru"],
        other => return vec![other.to_string()],
    };
    known.iter().map(|d| d.to_string()).collect()
}

/// Keeps only the cookies of the wanted domains in a Netscape file: a browser dump
/// contains sessions of all sites, while we only need to store our own.
pub fn filter_netscape(content: &str, domains: &[String]) -> (String, usize) {
    let mut out = String::from("# Netscape HTTP Cookie File\n");
    let mut kept = 0;
    for line in content.lines() {
        let line = line.strip_suffix('\r').unwrap_or(line);
        let record = line.strip_prefix("#HttpOnly_").unwrap_or(line);
        if record.is_empty() || record.starts_with('#') {
            continue;
        }
        let Some(domain) = record.split('\t').next() else { continue };
        let domain = domain.trim_start_matches('.').to_ascii_lowercase();
        if domains.iter().any(|d| host_is(&domain, d)) {
            out.push_str(line);
            out.push('\n');
            kept += 1;
        }
    }
    (out, kept)
}

pub fn detect_site(url: &str) -> Option<String> {
    // Host, not substring: "x.com" is contained in netflix.com, dropbox.com and xbox.com.
    let host = url_host(url)?;
    if host_is(&host, "boosty.to") {
        Some("boosty".to_string())
    } else if host_is(&host, "youtube.com")
        || host_is(&host, "youtu.be")
        || host_is(&host, "youtube-nocookie.com") {
        Some("youtube".to_string())
    } else if host_is(&host, "vimeo.com") {
        Some("vimeo".to_string())
    } else if host_is(&host, "tiktok.com") {
        Some("tiktok".to_string())
    } else if host_is(&host, "twitter.com") || host_is(&host, "x.com") {
        Some("twitter".to_string())
    } else if host_is(&host, "instagram.com") {
        Some("instagram".to_string())
    } else if host_is(&host, "facebook.com") || host_is(&host, "fb.watch") {
        Some("facebook".to_string())
    } else if host_is(&host, "twitch.tv") {
        Some("twitch".to_string())
    } else if host_is(&host, "dailymotion.com") {
        Some("dailymotion".to_string())
    } else if host_is(&host, "rutube.ru") {
        Some("rutube".to_string())
    } else {
        Some(host.strip_prefix("www.").unwrap_or(&host).to_string())
    }
}

fn host_is(host: &str, domain: &str) -> bool {
    host == domain || host.ends_with(&format!(".{domain}"))
}

fn url_host(url: &str) -> Option<String> {
    let parsed = tauri::Url::parse(url.trim()).ok()?;
    if !matches!(parsed.scheme(), "http" | "https") { return None; }
    let host = parsed.host_str()?.trim_end_matches('.').to_lowercase();
    if host.is_empty() { None } else { Some(host) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn site_is_the_host_not_a_substring() {
        assert_eq!(detect_site("https://www.youtube.com/watch?v=abc").as_deref(), Some("youtube"));
        assert_eq!(detect_site("https://youtu.be/abc").as_deref(), Some("youtube"));
        assert_eq!(detect_site("https://music.youtube.com/watch?v=abc").as_deref(), Some("youtube"));
        assert_eq!(detect_site("https://www.youtube-nocookie.com/embed/abc").as_deref(), Some("youtube"));
        assert_eq!(detect_site("https://x.com/user").as_deref(), Some("twitter"));
        assert_eq!(detect_site("https://mobile.twitter.com/a").as_deref(), Some("twitter"));
        assert_eq!(detect_site("https://vm.tiktok.com/abc").as_deref(), Some("tiktok"));
        assert_eq!(detect_site("https://boosty.to/name").as_deref(), Some("boosty"));
        assert_eq!(detect_site("https://fb.watch/abc").as_deref(), Some("facebook"));
        assert_eq!(detect_site("https://www.instagram.com/reel/x").as_deref(), Some("instagram"));
        assert_eq!(detect_site("https://m.twitch.tv/videos/1").as_deref(), Some("twitch"));
        assert_eq!(detect_site("https://www.netflix.com/watch/1").as_deref(), Some("netflix.com"));
        assert_eq!(detect_site("https://www.dropbox.com/s/abc").as_deref(), Some("dropbox.com"));
        assert_eq!(detect_site("https://xbox.com/game").as_deref(), Some("xbox.com"));
        assert_eq!(detect_site("https://example.com/?next=https://x.com").as_deref(), Some("example.com"));
        assert_eq!(detect_site("https://notboosty.to/x").as_deref(), Some("notboosty.to"));
        assert_eq!(detect_site("file:///cookies.txt"), None);
    }

    #[test]
    fn site_name_cannot_escape_the_cookies_dir() {
        assert_eq!(sanitize_site("../../etc/passwd"), "..%2f..%2fetc%2fpasswd");
        assert_eq!(sanitize_site("..\\..\\Windows"), "..%5c..%5cwindows");
        assert_eq!(sanitize_site("Boosty"), "boosty");
        assert_eq!(sanitize_site(""), "site");
        assert_eq!(cookies_file("boosty").file_name().unwrap(), "boosty.vdc");
        assert_ne!(sanitize_site("a.bc"), sanitize_site("ab.c"));
        assert_ne!(sanitize_site("../x"), sanitize_site("..%2fx"));
        for site in ["con.example.com", "[::1]", "a.bc", "../x", "..%2fx"] {
            assert_eq!(decode_site(&sanitize_site(site)).as_deref(), Some(site));
        }
    }

    #[test]
    fn browser_export_keeps_only_site_domains() {
        let dump = "# Netscape HTTP Cookie File\n.boosty.to\tTRUE\t/\tTRUE\t0\tauth\tx\n#HttpOnly_api.boosty.to\tFALSE\t/\tTRUE\t0\ts\ty\n.mail.example.com\tTRUE\t/\tTRUE\t0\tsid\tsecret\n.notboosty.to\tTRUE\t/\tTRUE\t0\tz\tz\n";
        let (kept, count) = filter_netscape(dump, &site_domains("boosty"));
        assert_eq!(count, 2);
        assert!(kept.contains("\tauth\tx"));
        assert!(kept.contains("#HttpOnly_api.boosty.to"));
        assert!(!kept.contains("secret"));
        assert!(!kept.contains("notboosty"));
    }

    #[test]
    fn atomic_cookie_write_replaces_and_cleans_failed_staging() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("site.txt");
        fs::write(&path, "before").unwrap();
        write_atomic(&path, b"after").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "after");
        let folder = root.path().join("folder");
        fs::create_dir(&folder).unwrap();
        assert!(write_atomic(&folder, b"rejected").is_err());
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 2);
    }
}

