// Picks the installer for each platform from a GitHub release. Supports both the
// Tauri default names (Wowthing.Sync_1.0.7_aarch64.dmg) and the staged release
// names (wowthing-sync_1.0.8_darwin-aarch64.dmg).

export const REPOSITORY = 'calebsmithdev/wowthing-sync';

const ARM = /(?:aarch64|arm64)/i;
const X64 = /(?:x86_64|x64|amd64)/i;

/** @type {Record<string, { ext: string[], arch?: RegExp, required: boolean }>} */
export const PLATFORMS = {
  'mac-silicon': { ext: ['.dmg'], arch: ARM, required: true },
  'mac-intel': { ext: ['.dmg'], arch: X64, required: true },
  // NSIS installer first; it's what the updater uses on Windows.
  windows: { ext: ['.exe', '.msi'], arch: X64, required: true },
  'windows-msi': { ext: ['.msi'], arch: X64, required: false },
  // Only the AppImage updates itself, so .deb and .rpm packages aren't offered.
  linux: { ext: ['.AppImage'], arch: X64, required: true }
};

/**
 * @param {{ name: string, browser_download_url: string, size: number }[]} assets
 * @param {{ ext: string[], arch?: RegExp }} platform
 */
function pick(assets, platform) {
  for (const ext of platform.ext) {
    const match = assets.find(asset =>
      asset.name.endsWith(ext) &&
      (!platform.arch || platform.arch.test(asset.name)) &&
      // An x64 pattern must not accept a universal or arm build by accident.
      !(platform.arch === X64 && ARM.test(asset.name))
    );
    if (match) return { name: match.name, url: match.browser_download_url, size: match.size };
  }
  return null;
}

/**
 * @param {{ tag_name: string, html_url: string, published_at?: string, assets: { name: string, browser_download_url: string, size: number }[] }} release
 */
export function selectDownloads(release) {
  if (!release || typeof release.tag_name !== 'string' || !Array.isArray(release.assets)) {
    throw new Error('Release response is missing tag_name or assets');
  }
  const downloads = Object.fromEntries(
    Object.entries(PLATFORMS).map(([slug, platform]) => [slug, pick(release.assets, platform)])
  );
  const missing = Object.entries(PLATFORMS)
    .filter(([slug, platform]) => platform.required && !downloads[slug])
    .map(([slug]) => slug);
  return {
    version: release.tag_name.replace(/^v/, ''),
    releaseUrl: release.html_url,
    publishedAt: release.published_at ?? null,
    downloads,
    missing
  };
}

/**
 * Fetches a release (the latest one unless a tag is given) and selects its installers.
 * @param {{ tag?: string, token?: string, fetchImpl?: typeof fetch }} [options]
 */
export async function fetchDownloads({ tag, token, fetchImpl = fetch } = {}) {
  const path = tag ? `tags/${encodeURIComponent(tag)}` : 'latest';
  const response = await fetchImpl(`https://api.github.com/repos/${REPOSITORY}/releases/${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) throw new Error(`GitHub release request failed: HTTP ${response.status}`);
  return selectDownloads(await response.json());
}
