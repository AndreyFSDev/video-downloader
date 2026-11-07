use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoostyQuality {
    pub id: String,
    pub label: String,
    pub height: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoostyMedia {
    pub id: String,
    /// video — ok_video inside a post, audio — audio_file, external — YouTube/Vimeo.
    pub kind: String,
    pub title: String,
    pub duration: Option<u32>,
    pub thumbnail: Option<String>,
    /// Item number in the post playlist for yt-dlp --playlist-items. None — download by url.
    pub index: Option<usize>,
    pub url: Option<String>,
    pub qualities: Vec<BoostyQuality>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoostyPostSummary {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub price: f64,
    pub has_access: bool,
    pub video_count: u32,
    pub audio_count: u32,
    pub thumbnail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoostyPostDetail {
    pub summary: BoostyPostSummary,
    pub media: Vec<BoostyMedia>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoostyList {
    pub blog: String,
    /// blog — a regular feed, bundle — a selection of posts.
    pub kind: String,
    pub posts: Vec<BoostyPostSummary>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BoostyAuth {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub device_id: Option<String>,
    /// Unix milliseconds, as in the cookie expiresAt.
    pub expires_at: Option<i64>,
}

impl BoostyAuth {
    pub fn is_expired(&self, now_ms: i64) -> bool {
        self.expires_at.is_some_and(|expires| expires <= now_ms)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expiry_is_compared_in_milliseconds() {
        let auth = BoostyAuth {
            expires_at: Some(1_700_000_000_000),
            ..BoostyAuth::default()
        };
        assert!(!auth.is_expired(1_699_999_999_999));
        assert!(auth.is_expired(1_700_000_000_000));
        assert!(!BoostyAuth::default().is_expired(i64::MAX));
    }
}
