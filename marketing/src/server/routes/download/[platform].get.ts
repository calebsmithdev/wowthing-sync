import { createError, defineEventHandler, getRouterParam, sendRedirect } from 'h3'

const RELEASE_MANIFEST_URL = 'https://github.com/calebsmithdev/wowthing-sync/releases/latest/download/latest.json'

const PLATFORM_MAP = {
  'mac-intel': 'darwin-x86_64',
  'mac-silicon': 'darwin-aarch64',
  windows: 'windows-x86_64',
  linux: 'linux-x86_64'
} as const

type PlatformSlug = keyof typeof PLATFORM_MAP

interface ReleaseManifest {
  platforms: Record<string, { url: string }>
}

export default defineEventHandler(async (event) => {
  const platformSlug = getRouterParam(event, 'platform') as PlatformSlug | undefined
  if (!platformSlug) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown download platform' })
  }

  const manifestKey = PLATFORM_MAP[platformSlug]
  if (!manifestKey) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown download platform' })
  }

  let manifest: ReleaseManifest

  try {
    manifest = await $fetch<ReleaseManifest>(RELEASE_MANIFEST_URL, { responseType: 'json' })
  } catch (error) {
    throw createError({ statusCode: 502, statusMessage: 'Unable to load latest release info' })
  }

  const downloadUrl = manifest.platforms?.[manifestKey]?.url
  if (!downloadUrl) {
    throw createError({ statusCode: 404, statusMessage: 'Download not available' })
  }

  return sendRedirect(event, downloadUrl, 302)
})
