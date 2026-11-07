use crate::services::tools::{self, ToolsProgress, ToolsStatus};
use tauri::{AppHandle, Emitter};

/// IPC thread. The backend error language and the tray menu follow the UI selection.
#[tauri::command]
pub fn set_language(app: AppHandle, language: String) {
    crate::i18n::set_english(language == "en");
    crate::tray::relabel(&app);
}

#[tauri::command]
pub fn tools_status() -> ToolsStatus {
    tools::status()
}

/// Tauri tokio runtime; progress is emitted as the `tools-progress` event.
#[tauri::command]
pub async fn install_tools(app: AppHandle) -> Result<ToolsStatus, String> {
    tools::install(move |progress: ToolsProgress| {
        let _ = app.emit("tools-progress", progress);
    })
    .await
}
