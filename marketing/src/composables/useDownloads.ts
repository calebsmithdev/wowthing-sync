export type PlatformSlug = 'mac-silicon' | 'mac-intel' | 'windows' | 'windows-msi' | 'linux';

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface ReleaseDownloads {
  version: string;
  releaseUrl: string;
  publishedAt: string | null;
  downloads: Partial<Record<PlatformSlug, ReleaseAsset | null>>;
}

export const RELEASES_URL = 'https://github.com/calebsmithdev/wowthing-sync/releases/latest';

export function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function useDownloads() {
  const runtimeConfig = useRuntimeConfig();
  const release = JSON.parse(runtimeConfig.public.release || 'null') as ReleaseDownloads | null;

  const asset = (slug: PlatformSlug) => release?.downloads[slug] ?? null;
  // Without release data (a local build offline), send people to the Releases page.
  const link = (slug: PlatformSlug) => asset(slug)?.url ?? RELEASES_URL;

  const version = release?.version ?? null;
  const releaseUrl = release?.releaseUrl ?? RELEASES_URL;
  const publishedAt = release?.publishedAt
    ? new Date(release.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
    : null;

  // Prerendered pages can't know the visitor's OS, so detection runs after mount.
  const detected = ref<'mac' | 'windows' | 'linux' | null>(null);

  onMounted(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|android/.test(ua)) return;
    if (ua.includes('mac')) detected.value = 'mac';
    else if (ua.includes('win')) detected.value = 'windows';
    else if (ua.includes('linux')) detected.value = 'linux';
  });

  return { asset, link, version, releaseUrl, publishedAt, detected };
}
