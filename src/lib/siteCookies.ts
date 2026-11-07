import { getSiteCookies, getSiteCookiesPath, saveSiteCookies } from './api';
import { normalizeCookies } from './cookies';

// Old versions and manual imports could leave JSON instead of Netscape.
// Before use we convert it with the same code as the "Save" button.
export async function ensureNetscapeCookies(site: string | null): Promise<string | null> {
  if (!site) return null;
  const path = await getSiteCookiesPath(site);
  if (!path) return null;
  try {
    const content = await getSiteCookies(site);
    const trimmed = content?.trim() ?? '';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      await saveSiteCookies(site, normalizeCookies(trimmed));
    }
  } catch {
    // We leave a corrupted file alone: yt-dlp will return an error, and Settings will show the content.
  }
  return path;
}
