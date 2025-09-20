<template>
  <div class="container space-y-8">
    <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-50">Debug Panel</h1>

    <UAlert
      v-if="loadError"
      color="red"
      variant="soft"
      :title="'Debug data unavailable'"
    >
      {{ loadError }}
    </UAlert>

    <template v-else>
      <UCard v-if="appInfo">
        <template #header>Application</template>
        <div class="space-y-2 text-sm">
          <div class="flex items-center justify-between gap-4">
            <span class="font-medium text-gray-500">Name</span>
            <span class="font-mono text-gray-900 dark:text-gray-100">{{ appInfo.name }}</span>
          </div>
          <div class="flex items-center justify-between gap-4">
            <span class="font-medium text-gray-500">Version</span>
            <span class="font-mono text-gray-900 dark:text-gray-100">{{ appInfo.version }}</span>
          </div>
        </div>
      </UCard>

      <UCard v-if="platformInfo">
        <template #header>Platform</template>
        <div class="grid gap-2 text-sm sm:grid-cols-2">
          <div class="flex items-center justify-between gap-4">
            <span class="font-medium text-gray-500">Type</span>
            <span class="font-mono text-gray-900 dark:text-gray-100">{{ platformInfo.type }}</span>
          </div>
          <div class="flex items-center justify-between gap-4">
            <span class="font-medium text-gray-500">Platform</span>
            <span class="font-mono text-gray-900 dark:text-gray-100">{{ platformInfo.platform }}</span>
          </div>
          <div class="flex items-center justify-between gap-4">
            <span class="font-medium text-gray-500">Version</span>
            <span class="font-mono text-gray-900 dark:text-gray-100">{{ platformInfo.version }}</span>
          </div>
          <div class="flex items-center justify-between gap-4">
            <span class="font-medium text-gray-500">Architecture</span>
            <span class="font-mono text-gray-900 dark:text-gray-100">{{ platformInfo.arch }}</span>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>Paths</template>
        <div class="space-y-4">
          <div v-for="entry in sortedPaths" :key="entry.label" class="space-y-1">
            <div class="text-sm font-medium text-gray-500">{{ entry.label }}</div>
            <pre class="overflow-x-auto rounded bg-gray-900/80 px-3 py-2 text-xs text-gray-100">
              <code>{{ entry.value }}</code>
            </pre>
            <p v-if="entry.error" class="text-xs text-red-500">{{ entry.error }}</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>Permissions</template>
        <div class="space-y-4">
          <div v-for="permission in permissionStates" :key="permission.label" class="space-y-1">
            <div class="flex items-center justify-between gap-4">
              <span class="text-sm font-medium text-gray-500">{{ permission.label }}</span>
              <UBadge :color="badgeColor(permission.status)" size="xs">{{ permission.status }}</UBadge>
            </div>
            <pre v-if="permission.raw" class="overflow-x-auto rounded bg-gray-900/80 px-3 py-2 text-xs text-gray-100">
              <code>{{ permission.raw }}</code>
            </pre>
            <p v-if="permission.error" class="text-xs text-red-500">{{ permission.error }}</p>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>

<script setup lang="ts">
import { checkPermissions, isTauri } from '@tauri-apps/api/core';
import { getName, getVersion } from '@tauri-apps/api/app';
import { arch, platform, type as osType, version as osVersion } from '@tauri-apps/plugin-os';
import {
  appCacheDir,
  appConfigDir,
  appDataDir,
  appLocalDataDir,
  appLogDir,
  cacheDir,
  configDir,
  dataDir,
  desktopDir,
  documentDir,
  downloadDir,
  homeDir,
  resourceDir,
  tempDir,
} from '@tauri-apps/api/path';
import { isPermissionGranted as isNotificationPermissionGranted } from '@tauri-apps/plugin-notification';
import { computed, ref } from 'vue';

interface AppInfo {
  name: string;
  version: string;
}

interface PlatformInfo {
  type: string;
  platform: string;
  version: string;
  arch: string;
}

interface PathEntry {
  label: string;
  value: string;
  error?: string;
}

interface PermissionEntry {
  label: string;
  plugin: string;
  status: string;
  raw?: string;
  error?: string;
}

const isDev = import.meta.dev;
const runningInTauri = isTauri();

const appInfo = ref<AppInfo | null>(null);
const platformInfo = ref<PlatformInfo | null>(null);
const paths = ref<PathEntry[]>([]);
const permissionStates = ref<PermissionEntry[]>([]);
const loadError = ref<string | null>(null);

const formatPermissionState = (value: unknown): { status: string; raw?: string } => {
  if (value === null || value === undefined) {
    return { status: 'unknown' };
  }

  if (typeof value === 'string') {
    return { status: value };
  }

  try {
    return { status: 'details', raw: JSON.stringify(value, null, 2) };
  } catch (error) {
    return {
      status: 'details',
      raw: `Unable to stringify state: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const badgeColor = (status: string): string => {
  switch (status) {
    case 'granted':
      return 'green';
    case 'denied':
    case 'error':
      return 'red';
    case 'prompt':
    case 'prompt-with-rationale':
      return 'yellow';
    case 'details':
      return 'blue';
    default:
      return 'gray';
  }
};

try {
  if (!isDev) {
    loadError.value = 'Debug panel is only available in development builds.';
  } else if (!runningInTauri) {
    loadError.value = 'Debug panel requires the Tauri runtime environment.';
  } else {
    const [name, version] = await Promise.all([getName(), getVersion()]);
    appInfo.value = { name, version };

    const [osTypeValue, osPlatform, osVersionValue, osArchValue] = await Promise.all([
      osType(),
      platform(),
      osVersion(),
      arch(),
    ]);

    platformInfo.value = {
      type: osTypeValue,
      platform: osPlatform,
      version: osVersionValue,
      arch: osArchValue,
    };

    const pathGetters: Array<[string, () => Promise<string>]> = [
      ['App Cache Dir', appCacheDir],
      ['App Config Dir', appConfigDir],
      ['App Data Dir', appDataDir],
      ['App Local Data Dir', appLocalDataDir],
      ['App Log Dir', appLogDir],
      ['Cache Dir', cacheDir],
      ['Config Dir', configDir],
      ['Data Dir', dataDir],
      ['Desktop Dir', desktopDir],
      ['Document Dir', documentDir],
      ['Download Dir', downloadDir],
      ['Home Dir', homeDir],
      ['Resource Dir', resourceDir],
      ['Temp Dir', tempDir],
    ];

    paths.value = await Promise.all(
      pathGetters.map(async ([label, getter]) => {
        try {
          const value = await getter();
          return { label, value } satisfies PathEntry;
        } catch (error) {
          return {
            label,
            value: 'Unavailable',
            error: error instanceof Error ? error.message : String(error),
          } satisfies PathEntry;
        }
      }),
    );

    const pluginPermissions = [
      { plugin: 'core', label: 'Core' },
      { plugin: 'store', label: 'Store' },
      { plugin: 'dialog', label: 'Dialog' },
      { plugin: 'process', label: 'Process' },
      { plugin: 'updater', label: 'Updater' },
      { plugin: 'os', label: 'OS' },
      { plugin: 'shell', label: 'Shell' },
      { plugin: 'autostart', label: 'Autostart' },
      { plugin: 'fs', label: 'File System' },
      { plugin: 'log', label: 'Log' },
      { plugin: 'notification', label: 'Notification (Plugin)' },
      { plugin: 'persisted-scope', label: 'Persisted Scope' },
    ] as const;

    const pluginResults = await Promise.all(
      pluginPermissions.map(async ({ plugin, label }) => {
        try {
          const state = await checkPermissions(plugin);
          const formatted = formatPermissionState(state);
          return {
            plugin,
            label,
            status: formatted.status,
            raw: formatted.raw,
          } satisfies PermissionEntry;
        } catch (error) {
          return {
            plugin,
            label,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          } satisfies PermissionEntry;
        }
      }),
    );

    const notificationGranted = await isNotificationPermissionGranted();

    permissionStates.value = [
      {
        plugin: 'notification-frontend',
        label: 'Notification (OS Permission)',
        status: notificationGranted ? 'granted' : 'denied',
      },
      ...pluginResults,
    ];
  }
} catch (error) {
  loadError.value = error instanceof Error ? error.message : String(error);
}

const sortedPaths = computed(() => [...paths.value].sort((a, b) => a.label.localeCompare(b.label)));
</script>
