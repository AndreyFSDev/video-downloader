use std::sync::atomic::{AtomicBool, Ordering};

// Language of backend errors and the tray menu. Set by the frontend (set_language);
// before the first call it comes from the system locale. Atomic: read by all IPC and tokio threads.
static ENGLISH: AtomicBool = AtomicBool::new(false);

pub fn init_from_system() {
    let russian = sys_locale::get_locale()
        .map(|locale| locale.to_ascii_lowercase().starts_with("ru"))
        .unwrap_or(false);
    ENGLISH.store(!russian, Ordering::Relaxed);
}

pub fn set_english(english: bool) {
    ENGLISH.store(english, Ordering::Relaxed);
}

pub fn is_en() -> bool {
    ENGLISH.load(Ordering::Relaxed)
}

pub fn tr(ru: &'static str, en: &'static str) -> String {
    if is_en() { en } else { ru }.to_string()
}

/// `t!("ru {}", "en {}", arg)` is a string in the current language. Arguments are positional:
/// implicit variable capture in format! does not work from a macro.
#[macro_export]
macro_rules! t {
    ($ru:literal, $en:literal $(, $arg:expr)* $(,)?) => {
        if $crate::i18n::is_en() { format!($en $(, $arg)*) } else { format!($ru $(, $arg)*) }
    };
}
