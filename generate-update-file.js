const { resolve } = require("path");
const { writeFileSync } = require("fs");

require("dotenv").config();

const rootDir = resolve(__dirname, "../..");

const tauriUpdateFilePath = resolve(__dirname, "tauri-update.json");
const packageFilePath = resolve(__dirname, "package.json");

const { version } = require(packageFilePath);
const now = new Date().toISOString();

const vendorVersion = process.env.VENDOR_VERSION || version;
const vendorNameLowercase = 'WoWthing.Sync';
const vendorBaseUrl = "https://github.com/calebsmithdev/wowthing-sync";

const baseUrl = `${vendorBaseUrl}/releases/download/v${vendorVersion}`;
const tauriUpdate = {
    name: `v${vendorVersion}`,
    pub_date: now,
    platforms: {
        'darwin-x86_64': {
            url: `${baseUrl}/${vendorNameLowercase}_${vendorVersion}.app.tar.gz`,
            signature: `${baseUrl}/${vendorNameLowercase}_${vendorVersion}.app.tar.gz.sig`,
        },
        'darwin-aarch64': {
            url: `${baseUrl}/${vendorNameLowercase}_${vendorVersion}.app.tar.gz`,
            signature: `${baseUrl}/${vendorNameLowercase}_${vendorVersion}.app.tar.gz.sig`,
        },
        'windows-x86_64': {
            url: `${baseUrl}/${vendorNameLowercase}_${vendorVersion}_x64_en-US.msi.zip`,
            signature: `${baseUrl}/${vendorNameLowercase}_${vendorVersion}_x64_en-US.msi.zip.sig`,
        },
    },
};

writeFileSync(tauriUpdateFilePath, JSON.stringify(tauriUpdate, null, 4), "utf-8");