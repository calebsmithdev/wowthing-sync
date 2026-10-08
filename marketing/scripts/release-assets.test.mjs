import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchDownloads, selectDownloads } from './release-assets.mjs';

const asset = name => ({ name, browser_download_url: `https://example.test/${name}`, size: 1024 });

const legacy = {
  tag_name: 'v1.0.7',
  html_url: 'https://github.com/calebsmithdev/wowthing-sync/releases/tag/v1.0.7',
  assets: [
    'latest.json',
    'Wowthing.Sync-1.0.7-1.x86_64.rpm',
    'Wowthing.Sync_1.0.7_aarch64.dmg',
    'Wowthing.Sync_1.0.7_amd64.AppImage',
    'Wowthing.Sync_1.0.7_amd64.AppImage.sig',
    'Wowthing.Sync_1.0.7_amd64.AppImage.tar.gz',
    'Wowthing.Sync_1.0.7_amd64.deb',
    'Wowthing.Sync_1.0.7_x64-setup.exe',
    'Wowthing.Sync_1.0.7_x64-setup.exe.sig',
    'Wowthing.Sync_1.0.7_x64-setup.nsis.zip',
    'Wowthing.Sync_1.0.7_x64.dmg',
    'Wowthing.Sync_1.0.7_x64_en-US.msi',
    'Wowthing.Sync_1.0.7_x64_en-US.msi.zip',
    'Wowthing.Sync_aarch64.app.tar.gz',
    'Wowthing.Sync_x64.app.tar.gz'
  ].map(asset)
};

const names = result => Object.fromEntries(Object.entries(result.downloads).map(([key, value]) => [key, value?.name ?? null]));

test('selects installers from Tauri default asset names', () => {
  const result = selectDownloads(legacy);
  assert.equal(result.version, '1.0.7');
  assert.deepEqual(result.missing, []);
  assert.deepEqual(names(result), {
    'mac-silicon': 'Wowthing.Sync_1.0.7_aarch64.dmg',
    'mac-intel': 'Wowthing.Sync_1.0.7_x64.dmg',
    windows: 'Wowthing.Sync_1.0.7_x64-setup.exe',
    'windows-msi': 'Wowthing.Sync_1.0.7_x64_en-US.msi',
    linux: 'Wowthing.Sync_1.0.7_amd64.AppImage'
  });
});

test('selects installers from staged release asset names', () => {
  const keys = ['darwin-aarch64', 'darwin-x86_64', 'linux-x86_64', 'windows-x86_64'];
  const exts = { 'darwin-aarch64': ['.dmg', '.app.tar.gz'], 'darwin-x86_64': ['.dmg', '.app.tar.gz'], 'linux-x86_64': ['.AppImage', '.AppImage.sig', '.deb', '.rpm'], 'windows-x86_64': ['.exe', '.exe.sig', '.msi', '.nsis.zip'] };
  const result = selectDownloads({
    tag_name: 'v1.0.8',
    html_url: 'https://example.test/v1.0.8',
    assets: keys.flatMap(key => exts[key].map(ext => asset(`wowthing-sync_1.0.8_${key}${ext}`)))
  });
  assert.deepEqual(result.missing, []);
  assert.deepEqual(names(result), {
    'mac-silicon': 'wowthing-sync_1.0.8_darwin-aarch64.dmg',
    'mac-intel': 'wowthing-sync_1.0.8_darwin-x86_64.dmg',
    windows: 'wowthing-sync_1.0.8_windows-x86_64.exe',
    'windows-msi': 'wowthing-sync_1.0.8_windows-x86_64.msi',
    linux: 'wowthing-sync_1.0.8_linux-x86_64.AppImage'
  });
});

test('falls back to the MSI and reports missing required installers', () => {
  const result = selectDownloads({
    tag_name: 'v2.0.0',
    html_url: 'https://example.test',
    assets: [asset('App_2.0.0_x64_en-US.msi'), asset('App_2.0.0_aarch64.dmg')]
  });
  assert.equal(result.downloads.windows?.name, 'App_2.0.0_x64_en-US.msi');
  assert.equal(result.downloads['mac-intel'], null, 'an arm DMG is never offered to Intel Macs');
  assert.deepEqual(result.missing, ['mac-intel', 'linux']);
});

test('selects the portable AppImage filename without a linux suffix', () => {
  const image = 'wowthing-sync_1.1.1_x86_64.AppImage';
  const result = selectDownloads({
    ...legacy,
    assets: [...legacy.assets.filter(value => !value.name.endsWith('.AppImage')), asset(image)]
  });
  assert.equal(result.downloads.linux.name, image);
  assert.deepEqual(result.missing, []);
});

test('rejects malformed release responses', () => {
  assert.throws(() => selectDownloads({ message: 'Not Found' }), /missing tag_name/);
});

test('requests the tagged release with a token, or the latest without one', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: init.headers.authorization });
    return { ok: true, json: async () => legacy };
  };
  await fetchDownloads({ tag: 'v1.0.7', token: 'secret', fetchImpl });
  await fetchDownloads({ fetchImpl });
  assert.deepEqual(calls, [
    { url: 'https://api.github.com/repos/calebsmithdev/wowthing-sync/releases/tags/v1.0.7', auth: 'Bearer secret' },
    { url: 'https://api.github.com/repos/calebsmithdev/wowthing-sync/releases/latest', auth: undefined }
  ]);
  await assert.rejects(fetchDownloads({ fetchImpl: async () => ({ ok: false, status: 404 }) }), /HTTP 404/);
});
