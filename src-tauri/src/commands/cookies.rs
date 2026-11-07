use crate::services::{
    delete_cookies, detect_site, get_cookies_file, list_cookies, load_cookies, save_cookies,
};

#[tauri::command]
pub fn save_site_cookies(site: String, content: String) -> Result<String, String> {
    let path = save_cookies(&site, &content)?;
    Ok(path.to_string_lossy().to_string())
}

// Path to the cookies file if it is already saved, None otherwise.
#[tauri::command]
pub fn get_site_cookies_path(site: String) -> Option<String> {
    get_cookies_file(&site).map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_site_cookies(site: String) -> Result<Option<String>, String> {
    load_cookies(&site)
}

#[tauri::command]
pub fn get_cookies_list() -> Result<Vec<String>, String> {
    list_cookies()
}

#[tauri::command]
pub fn remove_site_cookies(site: String) -> Result<(), String> {
    delete_cookies(&site)
}

#[tauri::command]
pub fn detect_site_from_url(url: String) -> Option<String> {
    detect_site(&url)
}
