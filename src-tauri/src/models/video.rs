use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoInfo {
    pub id: String,
    pub title: String,
    pub thumbnail: Option<String>,
    pub duration: Option<f64>,
    pub uploader: Option<String>,
    pub webpage_url: String,
    pub formats: Vec<Format>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Format {
    pub format_id: String,
    pub ext: String,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub fps: Option<f64>,
    pub vcodec: Option<String>,
    pub acodec: Option<String>,
    /// Video track container from yt-dlp. For direct files vcodec is often null,
    /// while video_ext already says this is a video.
    pub video_ext: Option<String>,
    pub audio_ext: Option<String>,
    pub filesize: Option<i64>,
    pub format_note: Option<String>,
}

impl Format {
    pub fn quality_label(&self) -> String {
        match self.height {
            Some(h) if h >= 2160 => "4K".to_string(),
            Some(h) if h >= 1440 => "2K".to_string(),
            Some(h) if h >= 1080 => "1080p".to_string(),
            Some(h) if h >= 720 => "720p".to_string(),
            Some(h) if h >= 480 => "480p".to_string(),
            Some(h) if h >= 360 => "360p".to_string(),
            Some(h) => format!("{}p", h),
            None => self.ext.clone(),
        }
    }

    pub fn has_video(&self) -> bool {
        codec_present(self.vcodec.as_deref()) || codec_present(self.video_ext.as_deref())
    }

    pub fn has_audio(&self) -> bool {
        codec_present(self.acodec.as_deref()) || codec_present(self.audio_ext.as_deref())
    }
}

fn codec_present(value: Option<&str>) -> bool {
    matches!(value, Some(c) if !c.is_empty() && c != "none")
}
