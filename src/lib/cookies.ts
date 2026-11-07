import { translate } from './messages.ts';
export type CookiesKind = 'boosty-tokens' | 'json-array';

interface JsonCookie {
  domain?: string;
  name?: string;
  value?: string;
  path?: string;
  expirationDate?: number;
  expires?: number;
  secure?: boolean;
  hostOnly?: boolean;
}

const NETSCAPE_HEADER = [
  '# Netscape HTTP Cookie File',
  '# https://curl.haxx.se/rfc/cookie_spec.html',
  '# This is a generated file! Do not edit.',
  '',
];

function futureExpiry(): number {
  return Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
}

// cookiejar treats 0 and an empty value as already expired and silently drops them.
// A session cookie is kept for a year. Millisecond timestamps are converted to seconds.
export function cookieExpiry(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return futureExpiry();
  const seconds = raw > 1e12 ? Math.floor(raw / 1000) : Math.floor(raw);
  return seconds > 0 ? seconds : futureExpiry();
}

function hasBrokenField(value: string): boolean {
  return /[\t\r\n]/.test(value);
}

function netscapeCookie(cookie: JsonCookie): string | null {
  if (!cookie.domain || !cookie.name || cookie.value == null) return null;
  if (
    hasBrokenField(cookie.domain) ||
    hasBrokenField(cookie.name) ||
    hasBrokenField(cookie.value)
  ) {
    return null;
  }
  let domain = cookie.domain.trim();
  if (cookie.hostOnly) {
    domain = domain.replace(/^\./, '');
  } else if (!domain.startsWith('.')) {
    domain = `.${domain}`;
  }
  if (!domain || domain === '.') return null;
  const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
  const path = cookie.path && !hasBrokenField(cookie.path) ? cookie.path : '/';
  const secure = cookie.secure ? 'TRUE' : 'FALSE';
  const expiry = cookieExpiry(cookie.expirationDate ?? cookie.expires);
  return [domain, flag, path, secure, String(expiry), cookie.name, cookie.value].join('\t');
}

function tryParseJsonCookies(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as { cookies?: JsonCookie[] } | JsonCookie[];
    const cookies: JsonCookie[] = Array.isArray(parsed) ? parsed : parsed.cookies || [];
    if (!cookies.length) return null;
    const lines = [...NETSCAPE_HEADER];
    for (const cookie of cookies) {
      const line = netscapeCookie(cookie);
      if (line) lines.push(line);
    }
    return lines.length > NETSCAPE_HEADER.length ? lines.join('\n') : null;
  } catch {
    return null;
  }
}

function tryParseBoostyTokens(text: string): string | null {
  try {
    const obj = JSON.parse(text) as {
      accessToken?: string;
      access_token?: string;
      refreshToken?: string;
      refresh_token?: string;
      deviceId?: string;
      device_id?: string;
      expiresAt?: number;
      expires_at?: number;
    };
    if (!obj || Array.isArray(obj)) return null;
    const token = obj.accessToken || obj.access_token;
    if (typeof token !== 'string' || !token || hasBrokenField(token)) return null;
    const refresh = obj.refreshToken || obj.refresh_token || '';
    if (typeof refresh !== 'string' || hasBrokenField(refresh)) return null;
    const deviceId = obj.deviceId || obj.device_id || '';
    if (typeof deviceId !== 'string' || hasBrokenField(deviceId)) return null;
    const expiry = cookieExpiry(typeof obj.expiresAt === 'number' ? obj.expiresAt : obj.expires_at);
    const auth = encodeURIComponent(
      JSON.stringify({ accessToken: token, ...(refresh ? { refreshToken: refresh } : {}) }),
    );
    const lines = [...NETSCAPE_HEADER, `.boosty.to\tTRUE\t/\tTRUE\t${expiry}\tauth\t${auth}`];
    // _clientId is only needed for the refresh token; yt-dlp ignores this cookie.
    if (deviceId) {
      lines.push(
        `.boosty.to\tTRUE\t/\tTRUE\t${expiry}\t_clientId\t${encodeURIComponent(deviceId)}`,
      );
    }
    return lines.join('\n');
  } catch {
    return null;
  }
}

export function detectCookiesKind(text: string): CookiesKind | null {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return null;
  if (tryParseBoostyTokens(trimmed)) return 'boosty-tokens';
  if (tryParseJsonCookies(trimmed)) return 'json-array';
  return null;
}

// yt-dlp reads only Netscape. JSON and Boosty tokens are converted here,
// so the "Save" button does not write a file the engine silently ignores.
export function normalizeCookies(text: string): string {
  const trimmed = text.replace(/^\uFEFF/, '').replace(/^[\r\n]+|[\r\n]+$/g, '');
  if (!trimmed) throw new Error(translate('cookies.empty'));
  const converted = tryParseBoostyTokens(trimmed) ?? tryParseJsonCookies(trimmed);
  if (converted) return converted;
  const lines = trimmed
    .split(/\r?\n/)
    .filter((line) => line && (!line.startsWith('#') || line.startsWith('#HttpOnly_')));
  if (
    !lines.length ||
    lines.some((line) => {
      const fields = line.split('\t');
      return (
        fields.length !== 7 ||
        !fields[0] ||
        !['TRUE', 'FALSE'].includes(fields[1]) ||
        fields[0].replace(/^#HttpOnly_/, '').startsWith('.') !== (fields[1] === 'TRUE') ||
        !fields[2].startsWith('/') ||
        !['TRUE', 'FALSE'].includes(fields[3]) ||
        !/^(\d+(\.\d+)?)?$/.test(fields[4]) ||
        !fields[5]
      );
    })
  )
    throw new Error(translate('cookies.unknownFormat'));
  return /^#(?: Netscape)? HTTP Cookie File/.test(trimmed)
    ? trimmed
    : `# Netscape HTTP Cookie File\n${trimmed}`;
}
