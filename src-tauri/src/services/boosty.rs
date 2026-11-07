use crate::models::{
    BoostyAuth, BoostyList, BoostyMedia, BoostyPostDetail, BoostyPostSummary, BoostyQuality,
};
use boosty_api::api_client::ApiClient;
use boosty_api::error::ApiError;
use boosty_api::model::{AudioData, MediaData, OkVideoData, Post, PlayerUrl};
use boosty_api::traits::HasTitle;
use crate::i18n::tr;
use crate::t;
use percent_encoding::{percent_decode_str, utf8_percent_encode, NON_ALPHANUMERIC};
use serde::Deserialize;
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const API_URL: &str = "https://api.boosty.to";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BoostyUrl {
    Blog(String),
    Post { blog: String, post_id: String },
    Bundle { blog: String, bundle_id: String },
}

pub fn parse_url(url: &str) -> Result<BoostyUrl, String> {
    let parsed = tauri::Url::parse(url.trim())
        .map_err(|_| tr("Некорректная ссылка Boosty", "Invalid Boosty link"))?;
    let host = parsed
        .host_str()
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| tr("В ссылке нет хоста", "The link has no host"))?;
    if host != "boosty.to" && host != "www.boosty.to" {
        return Err(tr("Это не ссылка Boosty", "This is not a Boosty link"));
    }
    let segments: Vec<&str> = parsed
        .path_segments()
        .map(|parts| parts.filter(|part| !part.is_empty()).collect())
        .unwrap_or_default();
    segments
        .first()
        .copied()
        .filter(|name| !matches!(*name, "app" | "api" | "oauth" | "static"))
        .ok_or_else(|| tr("В ссылке Boosty нет имени канала", "The Boosty link has no channel name"))?;
    match segments.as_slice() {
        [blog] => Ok(BoostyUrl::Blog((*blog).to_string())),
        [blog, "posts", post_id] if !post_id.is_empty() => Ok(BoostyUrl::Post {
            blog: (*blog).to_string(),
            post_id: (*post_id).to_string(),
        }),
        [blog, "bundle", bundle_id] if !bundle_id.is_empty() => Ok(BoostyUrl::Bundle {
            blog: (*blog).to_string(),
            bundle_id: (*bundle_id).to_string(),
        }),
        _ => Err(tr("Поддерживаются ссылки на канал, пост или бандл Boosty", "Supported: Boosty channel, post or bundle links")),
    }
}

#[derive(Debug, Deserialize)]
struct AuthCookieJson {
    #[serde(rename = "accessToken", alias = "access_token")]
    access_token: Option<String>,
    #[serde(rename = "refreshToken", alias = "refresh_token")]
    refresh_token: Option<String>,
    #[serde(rename = "expiresAt", alias = "expires_at")]
    expires_at: Option<serde_json::Value>,
    #[serde(rename = "deviceId", alias = "device_id")]
    device_id: Option<String>,
}

pub fn parse_auth_cookie(content: &str) -> Result<BoostyAuth, String> {
    let mut auth = BoostyAuth::default();
    let mut saw_auth = false;
    for raw_line in content.lines() {
        let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
        if line.is_empty() || (line.starts_with('#') && !line.starts_with("#HttpOnly_")) {
            continue;
        }
        let line = line.strip_prefix("#HttpOnly_").unwrap_or(line);
        let mut fields = line.splitn(7, '\t');
        let Some(domain) = fields.next() else { continue };
        let _flag = fields.next();
        let _path = fields.next();
        let _secure = fields.next();
        let _expiry = fields.next();
        let Some(name) = fields.next() else { continue };
        let Some(value) = fields.next() else { continue };
        let domain = domain.trim_start_matches('.').to_ascii_lowercase();
        if domain != "boosty.to" && !domain.ends_with(".boosty.to") {
            continue;
        }
        let value = percent_decode_str(value)
            .decode_utf8()
            .map_err(|_| tr("Cookie Boosty не является UTF-8", "Boosty cookie is not UTF-8"))?;
        match name {
            "auth" => {
                saw_auth = true;
                auth = parse_auth_value(&value)?;
            }
            "_clientId" | "device_id" | "deviceId" => {
                if !value.trim().is_empty() {
                    auth.device_id = Some(value.trim().to_string());
                }
            }
            _ => {}
        }
    }
    if saw_auth && auth.access_token.is_none() && auth.refresh_token.is_none() {
        return Err(tr("В cookies Boosty нет accessToken — экспортируйте cookies заново", "Boosty cookies have no accessToken — export cookies again"));
    }
    Ok(auth)
}

fn parse_auth_value(value: &str) -> Result<BoostyAuth, String> {
    let value = value.trim();
    if value.is_empty() {
        return Err(tr("Пустая auth cookie Boosty", "Boosty auth cookie is empty"));
    }
    let parsed: AuthCookieJson = match serde_json::from_str(value) {
        Ok(parsed) => parsed,
        // Some exports put the bearer token itself here, not JSON.
        Err(_) => {
            return Ok(BoostyAuth {
                access_token: Some(value.to_string()),
                ..BoostyAuth::default()
            })
        }
    };
    let access_token = parsed.access_token.filter(|token| !token.trim().is_empty());
    let refresh_token = parsed.refresh_token.filter(|token| !token.trim().is_empty());
    if access_token.is_none() && refresh_token.is_none() {
        return Err(tr("В auth cookie Boosty нет accessToken", "Boosty auth cookie has no accessToken"));
    }
    Ok(BoostyAuth {
        access_token,
        refresh_token,
        device_id: parsed.device_id.filter(|value| !value.trim().is_empty()),
        expires_at: normalize_expiry(parsed.expires_at),
    })
}

fn normalize_expiry(value: Option<serde_json::Value>) -> Option<i64> {
    let value = value?;
    let number = value
        .as_i64()
        .or_else(|| value.as_f64().map(|number| number as i64))?;
    if number <= 0 {
        return None;
    }
    // The cookie holds both seconds and milliseconds.
    Some(if number > 1_000_000_000_000 {
        number
    } else {
        number * 1000
    })
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn http_client() -> Result<reqwest::Client, String> {
    // One client per process: in the feed loop every command opened a new pool and
    // redid the TLS handshake with api.boosty.to. Cloning is cheap (Arc inside).
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    if let Some(client) = CLIENT.get() {
        return Ok(client.clone());
    }
    let client = reqwest::Client::builder()
        .http1_only()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| t!("Не удалось создать HTTP-клиент Boosty: {}", "Failed to create Boosty HTTP client: {}", error))?;
    Ok(CLIENT.get_or_init(|| client).clone())
}

/// API client with the owner's authorization. Lives for one command; tokens stay in memory,
/// and reach the disk only encrypted (persist_tokens).
struct Session {
    client: ApiClient,
    http: reqwest::Client,
    auth: BoostyAuth,
    /// Plaintext of the master file: needed to rewrite the auth cookie in it after a refresh.
    content: Option<String>,
    refreshed: bool,
}

impl Session {
    async fn open(cookies: Option<&str>) -> Result<Self, String> {
        let content = match cookies {
            Some(path) => Some(crate::services::cookies::read_cookies_path(Path::new(path))?),
            None => None,
        };
        let auth = match content.as_deref() {
            Some(text) => parse_auth_text(text)?,
            None => BoostyAuth::default(),
        };
        let http = http_client()?;
        let mut session = Session {
            client: ApiClient::new(http.clone(), API_URL),
            http,
            auth,
            content,
            refreshed: false,
        };
        if session.auth.is_expired(now_ms()) {
            session.refresh().await?;
        } else if let Some(token) = session.auth.access_token.clone() {
            session.apply_token(&token).await?;
        }
        Ok(session)
    }

    fn has_auth(&self) -> bool {
        self.auth.access_token.is_some() || self.auth.refresh_token.is_some()
    }

    async fn apply_token(&self, token: &str) -> Result<(), String> {
        self.client
            .set_bearer_token(token)
            .await
            .map_err(|error| t!("Не удалось применить токен Boosty: {}", "Failed to apply Boosty token: {}", error))
    }

    /// Refreshes the access token from the refresh token and deviceId (_clientId) and saves
    /// the new pair to the store: otherwise yt-dlp would get the old token when downloading.
    async fn refresh(&mut self) -> Result<(), String> {
        if self.refreshed {
            return Err(expired_message());
        }
        self.refreshed = true;
        let (Some(refresh), Some(device)) = (self.auth.refresh_token.clone(), self.auth.device_id.clone()) else {
            return Err(expired_message());
        };
        let refresher = ApiClient::new(self.http.clone(), API_URL);
        refresher
            .set_refresh_token_and_device_id(&refresh, &device)
            .await
            .map_err(|_| expired_message())?;
        let pair = with_retry(|| async { refresher.refresh_tokens().await.map_err(ApiError::from) })
            .await
            .map_err(|_| expired_message())?;
        self.auth.access_token = Some(pair.access_token.clone());
        self.auth.refresh_token = Some(pair.refresh_token);
        self.auth.expires_at = Some(now_ms() + pair.expires_in.max(0) * 1000);
        // Disk first: a cancellation at the await below would lose the rotated refresh token
        self.persist_tokens();
        self.apply_token(&pair.access_token).await?;
        Ok(())
    }

    fn persist_tokens(&mut self) {
        let Some(content) = self.content.as_deref() else { return };
        let updated = replace_auth_cookie(content, &self.auth);
        // A write failure does not affect the current command: the token is already in memory; we will refresh again next time.
        if crate::services::cookies::save_cookies("boosty", &updated).is_ok() {
            self.content = Some(updated);
        }
    }

    /// API call with network/5xx retry and a single refresh on 401.
    async fn call<T, F, Fut>(&mut self, request: F) -> Result<T, String>
    where
        F: Fn(ApiClient) -> Fut,
        Fut: std::future::Future<Output = Result<T, ApiError>>,
    {
        match with_retry(|| request(self.client.clone())).await {
            Err(ApiError::Unauthorized) if self.has_auth() && !self.refreshed => {
                self.refresh().await?;
                with_retry(|| request(self.client.clone()))
                    .await
                    .map_err(|error| map_api_error(error, true))
            }
            result => result.map_err(|error| map_api_error(error, self.has_auth())),
        }
    }
}

fn parse_auth_text(content: &str) -> Result<BoostyAuth, String> {
    // Old and hand-made exports may be bare JSON without the Netscape wrapper.
    if content.trim_start_matches('\u{feff}').trim_start().starts_with('{') {
        return parse_auth_value(content.trim());
    }
    parse_auth_cookie(content)
}

/// Rewrites the `auth` cookie value with the new token pair in the format that
/// the site itself writes and yt-dlp reads (URL-encoded JSON).
fn replace_auth_cookie(content: &str, auth: &BoostyAuth) -> String {
    let json = serde_json::json!({
        "accessToken": auth.access_token,
        "refreshToken": auth.refresh_token,
        "expiresAt": auth.expires_at,
    })
    .to_string();
    if content.trim_start().starts_with('{') {
        let mut raw: serde_json::Value = serde_json::from_str(content.trim()).unwrap_or_default();
        if let Some(object) = raw.as_object_mut() {
            object.insert("accessToken".into(), auth.access_token.clone().into());
            object.insert("refreshToken".into(), auth.refresh_token.clone().into());
            object.insert("expiresAt".into(), auth.expires_at.into());
            return raw.to_string();
        }
        return json;
    }
    let encoded = utf8_percent_encode(&json, NON_ALPHANUMERIC).to_string();
    let mut out = String::with_capacity(content.len() + encoded.len());
    for raw_line in content.lines() {
        let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
        let record = line.strip_prefix("#HttpOnly_").unwrap_or(line);
        let fields: Vec<&str> = record.splitn(7, '\t').collect();
        let is_auth = fields.len() == 7
            && fields[5] == "auth"
            && fields[0].trim_start_matches('.').to_ascii_lowercase().ends_with("boosty.to");
        if is_auth {
            // The expiry column must not lag behind the token: yt-dlp will not send a cookie
            // expired by its column even though the API already holds a fresh pair. 0 is a session cookie, leave it.
            let expiry = match (fields[4].trim().parse::<i64>(), auth.expires_at) {
                (Ok(old), Some(ms)) if old > 0 && ms / 1000 > old => (ms / 1000).to_string(),
                _ => fields[4].to_string(),
            };
            out.push_str(&line[..line.len() - record.len()]);
            out.push_str(&[fields[0], fields[1], fields[2], fields[3], &expiry, fields[5], &encoded].join("\t"));
        } else {
            out.push_str(line);
        }
        out.push('\n');
    }
    out
}

const RETRY_ATTEMPTS: u32 = 4;

fn retryable(error: &ApiError) -> bool {
    match error {
        ApiError::HttpRequest(_) => true,
        ApiError::HttpStatus { status, .. } => status.is_server_error() || status.as_u16() == 429,
        ApiError::Auth(boosty_api::error::AuthError::HttpRequest(_)) => true,
        _ => false,
    }
}

/// Retries network failures and 5xx/429 with a 1, 2, 4 s backoff. Command cancellation is
/// handled by select! in the calling command: the sleep here is interrupted with the future.
async fn with_retry<T, F, Fut>(request: F) -> Result<T, ApiError>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T, ApiError>>,
{
    let mut attempt = 0;
    loop {
        match request().await {
            Err(error) if retryable(&error) && attempt + 1 < RETRY_ATTEMPTS => {
                tokio::time::sleep(Duration::from_secs(1 << attempt)).await;
                attempt += 1;
            }
            result => return result,
        }
    }
}

fn expired_message() -> String {
    tr(
        "Cookies Boosty истекли. Войдите на boosty.to в браузере и импортируйте cookies заново (Настройки → Boosty).",
        "Boosty cookies have expired. Sign in to boosty.to in your browser and import cookies again (Settings → Boosty).",
    )
}

fn login_required_message() -> String {
    tr(
        "Это платный пост. Импортируйте cookies Boosty из браузера или файла (Настройки → Boosty).",
        "This is a paid post. Import Boosty cookies from your browser or a file (Settings → Boosty).",
    )
}

fn no_access_message(price: f64) -> String {
    if price > 0.0 {
        t!(
            "Нет доступа: пост открыт подписчикам уровня от {} ₽, у вашего аккаунта такой подписки нет.",
            "No access: the post is for subscribers from {} ₽, and your account has no such subscription.",
            price
        )
    } else {
        tr(
            "Нет доступа: пост открыт только подписчикам, у вашего аккаунта нет подходящей подписки.",
            "No access: the post is for subscribers only, and your account has no matching subscription.",
        )
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoostyAccount {
    pub logged_in: bool,
    pub expires_at: Option<i64>,
    pub can_refresh: bool,
    pub subscriptions: Vec<BoostySubscription>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoostySubscription {
    pub blog: String,
    pub title: String,
    pub level: String,
}

/// Live cookies check: the subscriptions request requires authorization, so
/// expired cookies give 401 → a clear error instead of an empty list.
pub async fn account(cookies: Option<&str>) -> Result<BoostyAccount, String> {
    let mut session = Session::open(cookies).await?;
    if !session.has_auth() {
        return Ok(BoostyAccount { logged_in: false, expires_at: None, can_refresh: false, subscriptions: Vec::new() });
    }
    let raw = match fetch_subscriptions(&session).await {
        Err(ApiError::Unauthorized) => {
            session.refresh().await?;
            fetch_subscriptions(&session).await
        }
        other => other,
    }
    .map_err(|error| map_api_error(error, true))?;
    let subscriptions = raw
        .get("data")
        .and_then(|data| data.as_array())
        .map(|items| {
            items
                .iter()
                .map(|item| BoostySubscription {
                    blog: json_str(item, &["blog", "blogUrl"]),
                    title: json_str(item, &["blog", "title"]),
                    level: json_str(item, &["name"]),
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(BoostyAccount {
        logged_in: true,
        expires_at: session.auth.expires_at,
        can_refresh: session.auth.refresh_token.is_some() && session.auth.device_id.is_some(),
        subscriptions,
    })
}

// Subscriptions are read as raw JSON: the strict boosty_api model fails on any new API field.
async fn fetch_subscriptions(session: &Session) -> Result<serde_json::Value, ApiError> {
    let token = session.auth.access_token.clone().unwrap_or_default();
    with_retry(|| {
        let token = token.clone();
        async move {
            let response = session
                .http
                .get(format!("{API_URL}/v1/user/subscriptions"))
                .query(&[("limit", "100"), ("with_follow", "false")])
                .bearer_auth(token)
                .send()
                .await?;
            let status = response.status();
            if status.as_u16() == 401 {
                return Err(ApiError::Unauthorized);
            }
            if !status.is_success() {
                return Err(ApiError::HttpStatus { status, endpoint: "user/subscriptions".into() });
            }
            response.json().await.map_err(ApiError::JsonParse)
        }
    })
    .await
}

fn json_str(value: &serde_json::Value, path: &[&str]) -> String {
    path.iter()
        .try_fold(value, |node, key| node.get(key))
        .and_then(|node| node.as_str())
        .unwrap_or_default()
        .to_string()
}

pub async fn list(
    url: &str,
    limit: usize,
    accessible_only: bool,
    cookies: Option<&str>,
) -> Result<BoostyList, String> {
    let (blog, kind, bundle_id) = match parse_url(url)? {
        BoostyUrl::Blog(blog) => (blog, "blog", None),
        BoostyUrl::Bundle { blog, bundle_id } => (blog, "bundle", Some(bundle_id)),
        BoostyUrl::Post { .. } => {
            return Err(tr(
                "Это ссылка на пост Boosty — используйте разбор поста",
                "This is a Boosty post link — use post analysis",
            ))
        }
    };
    // 5000 posts is the whole feed of any real author; more is a guard against endless pagination.
    let limit = limit.clamp(1, 5000);
    let mut session = Session::open(cookies).await?;
    let posts = match kind {
        "blog" => {
            session
                .call(|client| {
                    let blog = blog.clone();
                    async move { client.get_posts(&blog, limit, Some(20), None).await }
                })
                .await?
        }
        _ => {
            let bundle_id = bundle_id.unwrap_or_default();
            session
                .call(|client| {
                    let blog = blog.clone();
                    let bundle_id = bundle_id.clone();
                    async move { client.get_bundle_posts(&blog, &bundle_id, limit, Some(20)).await }
                })
                .await?
        }
    };
    Ok(BoostyList {
        blog,
        kind: kind.to_string(),
        posts: posts
            .iter()
            .filter(|post| !accessible_only || post.has_access)
            .map(map_summary)
            .collect(),
    })
}

pub async fn get_post(url: &str, cookies: Option<&str>) -> Result<BoostyPostDetail, String> {
    let (blog, post_id) = match parse_url(url)? {
        BoostyUrl::Post { blog, post_id } => (blog, post_id),
        _ => return Err(tr("Нужна ссылка на пост Boosty", "A Boosty post link is required")),
    };
    let mut session = Session::open(cookies).await?;
    let post = session
        .call(|client| {
            let (blog, post_id) = (blog.clone(), post_id.clone());
            async move { client.get_post(&blog, &post_id).await }
        })
        .await?;
    if !post.has_access {
        return Err(if session.has_auth() {
            no_access_message(post.price)
        } else {
            login_required_message()
        });
    }
    Ok(map_detail(&post))
}

fn map_api_error(error: ApiError, had_auth: bool) -> String {
    match error {
        ApiError::Unauthorized if had_auth => expired_message(),
        ApiError::Unauthorized => login_required_message(),
        ApiError::HttpStatus { status, .. } if status.as_u16() == 403 => {
            if had_auth { no_access_message(0.0) } else { login_required_message() }
        }
        ApiError::HttpStatus { status, .. } if status.as_u16() == 404 => {
            tr("Boosty: пост или канал не найден.", "Boosty: post or channel not found.")
        }
        ApiError::HttpStatus { status, .. } => t!("Boosty API вернул HTTP {}.", "Boosty API returned HTTP {}.", status),
        ApiError::HttpRequest(error) => t!(
            "Boosty недоступен после {} попыток ({}).",
            "Boosty is unreachable after {} attempts ({}).",
            RETRY_ATTEMPTS,
            error
        ),
        other => format!("Boosty API: {other}"),
    }
}

fn map_summary(post: &Post) -> BoostyPostSummary {
    summary_from(post, &collect_media(post))
}

fn summary_from(post: &Post, media: &[BoostyMedia]) -> BoostyPostSummary {
    let video_count = media.iter().filter(|item| item.kind != "audio").count() as u32;
    let audio_count = media.iter().filter(|item| item.kind == "audio").count() as u32;
    BoostyPostSummary {
        id: post.id.clone(),
        title: post.safe_title(),
        created_at: post.created_at,
        updated_at: post.updated_at,
        price: post.price,
        has_access: post.has_access,
        video_count,
        audio_count,
        thumbnail: media.iter().find_map(|item| item.thumbnail.clone()),
    }
}

fn map_detail(post: &Post) -> BoostyPostDetail {
    // Walk the media tree once: the summary and the list need the same result
    let media = collect_media(post);
    BoostyPostDetail { summary: summary_from(post, &media), media }
}

fn collect_media(post: &Post) -> Vec<BoostyMedia> {
    let mut media = Vec::new();
    let mut playlist_index = 0usize;
    let post_title = post.safe_title();
    for item in &post.data {
        match item {
            MediaData::OkVideo(video) => {
                media.push(map_ok_video(
                    video,
                    Some(playlist_index),
                    &post_title,
                    &post.signed_query,
                ));
                playlist_index += 1;
            }
            MediaData::Video(video) => {
                media.push(map_external(&video.url, &post_title));
                playlist_index += 1;
            }
            MediaData::Audio(audio) => media.push(map_audio(audio, &post.signed_query)),
            MediaData::List(list) => {
                for group in &list.items {
                    collect_items(&group.data, &post_title, &post.signed_query, &mut media);
                    for nested in &group.items {
                        collect_items(&nested.data, &post_title, &post.signed_query, &mut media);
                    }
                }
            }
            _ => {}
        }
    }
    media
}

// yt-dlp walks only the top level of post.data. Nested lists
// are handed out as direct best-quality links — without muxing audio.
fn collect_items(
    items: &[MediaData],
    post_title: &str,
    signed_query: &str,
    media: &mut Vec<BoostyMedia>,
) {
    for item in items {
        match item {
            MediaData::OkVideo(video) => {
                media.push(map_ok_video(video, None, post_title, signed_query))
            }
            MediaData::Video(video) => media.push(map_external(&video.url, post_title)),
            MediaData::Audio(audio) => media.push(map_audio(audio, signed_query)),
            MediaData::List(list) => {
                for group in &list.items {
                    collect_items(&group.data, post_title, signed_query, media);
                    for nested in &group.items {
                        collect_items(&nested.data, post_title, signed_query, media);
                    }
                }
            }
            _ => {}
        }
    }
}

const QUALITY_TYPES: &[(&str, &str, u32)] = &[
    ("ultra_hd", "4K", 2160),
    ("quad_hd", "2K", 1440),
    ("full_hd", "1080p", 1080),
    ("high", "720p", 720),
    ("medium", "480p", 480),
    ("low", "360p", 360),
    ("lowest", "240p", 240),
    ("tiny", "144p", 144),
];

fn quality_options(player_urls: &[PlayerUrl]) -> Vec<BoostyQuality> {
    let mut qualities = Vec::new();
    for (id, label, height) in QUALITY_TYPES {
        if player_urls
            .iter()
            .any(|url| url.type_ == *id && !url.url.is_empty())
        {
            qualities.push(BoostyQuality {
                id: (*id).to_string(),
                label: (*label).to_string(),
                height: Some(*height),
            });
        }
    }
    qualities
}

fn best_quality_url(player_urls: &[PlayerUrl]) -> Option<String> {
    for (id, _, _) in QUALITY_TYPES {
        if let Some(url) = player_urls
            .iter()
            .find(|url| url.type_ == *id && !url.url.is_empty())
        {
            return Some(url.url.clone());
        }
    }
    player_urls
        .iter()
        .find(|url| !url.url.is_empty())
        .map(|url| url.url.clone())
}

fn map_ok_video(
    video: &OkVideoData,
    index: Option<usize>,
    fallback_title: &str,
    signed_query: &str,
) -> BoostyMedia {
    let title = if video.title.trim().is_empty() {
        fallback_title.to_string()
    } else {
        video.title.clone()
    };
    let thumbnail = first_non_empty([&video.default_preview, &video.preview]);
    BoostyMedia {
        id: if video.id.is_empty() {
            video.vid.clone()
        } else {
            video.id.clone()
        },
        kind: "video".to_string(),
        title,
        duration: Some(video.duration),
        thumbnail,
        index,
        // yt-dlp does not walk nested lists; for them we hand out a direct URL.
        url: index
            .is_none()
            .then(|| best_quality_url(&video.player_urls).map(|url| append_signed(&url, signed_query)))
            .flatten(),
        qualities: quality_options(&video.player_urls),
    }
}

fn append_signed(url: &str, signed_query: &str) -> String {
    let query = signed_query.trim().trim_start_matches('?');
    if query.is_empty() {
        return url.to_string();
    }
    let separator = if url.contains('?') { '&' } else { '?' };
    format!("{url}{separator}{query}")
}

fn map_external(url: &str, post_title: &str) -> BoostyMedia {
    BoostyMedia {
        id: url.to_string(),
        kind: "external".to_string(),
        title: post_title.to_string(),
        duration: None,
        thumbnail: None,
        index: None,
        url: Some(url.to_string()),
        qualities: Vec::new(),
    }
}

fn map_audio(audio: &AudioData, signed_query: &str) -> BoostyMedia {
    BoostyMedia {
        id: audio.id.clone(),
        kind: "audio".to_string(),
        title: if audio.title.trim().is_empty() {
            tr("Аудио", "Audio")
        } else {
            audio.title.clone()
        },
        duration: audio.duration,
        thumbnail: None,
        index: None,
        url: Some(append_signed(&audio.url, signed_query)),
        qualities: Vec::new(),
    }
}

fn first_non_empty(values: [&String; 2]) -> Option<String> {
    values
        .into_iter()
        .find(|value| !value.trim().is_empty())
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Post {
        serde_json::from_str(include_str!("../../tests/fixtures/boosty_post.json"))
            .expect("fixture должен разбираться моделью boosty_api")
    }

    #[test]
    fn parses_blog_post_and_bundle_urls() {
        assert_eq!(
            parse_url("https://boosty.to/kuplinov").unwrap(),
            BoostyUrl::Blog("kuplinov".into())
        );
        assert_eq!(
            parse_url("https://www.boosty.to/kuplinov/posts/e55d050c-e3bb-4873-a7db-ac7a49b40c38?x=1")
                .unwrap(),
            BoostyUrl::Post {
                blog: "kuplinov".into(),
                post_id: "e55d050c-e3bb-4873-a7db-ac7a49b40c38".into()
            }
        );
        assert_eq!(
            parse_url("https://boosty.to/kuplinov/bundle/abc").unwrap(),
            BoostyUrl::Bundle {
                blog: "kuplinov".into(),
                bundle_id: "abc".into()
            }
        );
    }

    #[test]
    fn rejects_non_boosty_and_unknown_paths() {
        for url in [
            "https://example.com/kuplinov",
            "https://boosty.to/app/settings",
            "https://boosty.to/kuplinov/posts",
            "file:///cookies.txt",
        ] {
            assert!(parse_url(url).is_err(), "{url}");
        }
    }

    #[test]
    fn auth_cookie_is_url_decoded_and_normalized() {
        let content = "# Netscape HTTP Cookie File\n.boosty.to\tTRUE\t/\tTRUE\t2000000000\tauth\t%7B%22accessToken%22%3A%22tok%22%2C%22refreshToken%22%3A%22ref%22%2C%22expiresAt%22%3A1700000000%7D\n.boosty.to\tTRUE\t/\tTRUE\t2000000000\t_clientId\tdevice-1\n";
        let auth = parse_auth_cookie(content).unwrap();
        assert_eq!(auth.access_token.as_deref(), Some("tok"));
        assert_eq!(auth.refresh_token.as_deref(), Some("ref"));
        assert_eq!(auth.device_id.as_deref(), Some("device-1"));
        assert_eq!(auth.expires_at, Some(1_700_000_000_000));
    }

    #[test]
    fn plain_auth_token_is_accepted() {
        let content = ".boosty.to\tTRUE\t/\tTRUE\t0\tauth\tplain-token\n";
        assert_eq!(
            parse_auth_cookie(content).unwrap().access_token.as_deref(),
            Some("plain-token")
        );
    }

    #[test]
    fn raw_json_auth_is_accepted_for_old_exports() {
        let auth = parse_auth_value(
            r#"{"accessToken":"tok","refreshToken":"ref","deviceId":"dev","expiresAt":1700000000}"#,
        )
        .unwrap();
        assert_eq!(auth.access_token.as_deref(), Some("tok"));
        assert_eq!(auth.refresh_token.as_deref(), Some("ref"));
        assert_eq!(auth.device_id.as_deref(), Some("dev"));
        assert_eq!(auth.expires_at, Some(1_700_000_000_000));
    }

    #[test]
    fn signed_query_keeps_existing_question_mark() {
        assert_eq!(
            append_signed("https://cdn/video.mp4", "sig=abc"),
            "https://cdn/video.mp4?sig=abc"
        );
        assert_eq!(
            append_signed("https://cdn/video.mp4?x=1", "?sig=abc"),
            "https://cdn/video.mp4?x=1&sig=abc"
        );
        assert_eq!(append_signed("https://cdn/video.mp4", ""), "https://cdn/video.mp4");
    }

    #[test]
    fn missing_auth_is_not_an_error() {
        assert_eq!(
            parse_auth_cookie("# Netscape HTTP Cookie File\n").unwrap(),
            BoostyAuth::default()
        );
    }

    #[test]
    fn maps_public_post_with_video_and_audio_counts() {
        let detail = map_detail(&fixture());
        assert_eq!(detail.summary.video_count, 1);
        assert_eq!(detail.summary.audio_count, 0);
        assert_eq!(detail.media.len(), 1);
        assert_eq!(detail.media[0].kind, "video");
        assert_eq!(detail.media[0].index, Some(0));
        assert!(detail.media[0].url.is_none());
        assert!(!detail.media[0].qualities.is_empty());
        assert!(detail.summary.thumbnail.is_some());
    }

    #[tokio::test]
    #[ignore = "ходит в живой Boosty API; запускать вручную"]
    async fn live_public_post_and_blog_are_mapped() {
        let detail = get_post(
            "https://boosty.to/kuplinov/posts/e55d050c-e3bb-4873-a7db-ac7a49b40c38",
            None,
        )
        .await
        .unwrap();
        assert!(!detail.media.is_empty());
        assert!(detail.media.iter().any(|item| item.kind == "video"));

        let feed = list("https://boosty.to/maddyson", 5, false, None).await.unwrap();
        assert!(!feed.posts.is_empty());
        assert_eq!(feed.kind, "blog");
    }

    #[test]
    fn refreshed_tokens_replace_only_the_auth_cookie() {
        let content = "# Netscape HTTP Cookie File
.boosty.to	TRUE	/	TRUE	2000000000	auth	%7B%22accessToken%22%3A%22old%22%7D
.boosty.to	TRUE	/	TRUE	2000000000	_clientId	device-1
";
        let auth = BoostyAuth {
            access_token: Some("new".into()),
            refresh_token: Some("ref2".into()),
            device_id: Some("device-1".into()),
            expires_at: Some(1_800_000_000_000),
        };
        let updated = replace_auth_cookie(content, &auth);
        let parsed = parse_auth_cookie(&updated).unwrap();
        assert_eq!(parsed, auth);
        assert!(updated.contains("	_clientId	device-1
"));
        assert!(!updated.contains("old"));
        assert!(updated.contains("\t2000000000\tauth\t"));

        let stale = content.replacen("2000000000\tauth", "1000000000\tauth", 1);
        assert!(replace_auth_cookie(&stale, &auth).contains("\t1800000000\tauth\t"));
        let session = content.replacen("2000000000\tauth", "0\tauth", 1);
        assert!(replace_auth_cookie(&session, &auth).contains("\t0\tauth\t"));

        let raw =replace_auth_cookie(r#"{"accessToken":"old","deviceId":"device-1"}"#, &auth);
        assert_eq!(parse_auth_text(&raw).unwrap(), auth);
    }

    #[test]
    fn quality_options_keep_known_types_only() {
        let urls = vec![
            PlayerUrl {
                type_: "full_hd".into(),
                url: "https://example.com/1080.mp4".into(),
            },
            PlayerUrl {
                type_: "high".into(),
                url: "https://example.com/720.mp4".into(),
            },
            PlayerUrl {
                type_: "hls".into(),
                url: "https://example.com/master.m3u8".into(),
            },
        ];
        let qualities = quality_options(&urls);
        assert_eq!(qualities.len(), 2);
        assert_eq!(qualities[0].id, "full_hd");
        assert_eq!(qualities[1].id, "high");
        assert_eq!(
            best_quality_url(&urls).as_deref(),
            Some("https://example.com/1080.mp4")
        );
    }
}
