const { resolve } = require("path");
const { writeFileSync } = require("fs");

require("dotenv").config();

const rootDir = resolve(__dirname, "../..");

const tauriUpdateFilePath = resolve(__dirname, "tauri-update.json");
const packageFilePath = resolve(__dirname, "package.json");

const { version } = require(packageFilePath);
const now = new Date().toISOString();

const vendorVersion = process.env.PL_VENDOR_VERSION || version;
const vendorNameLowercase = 'wowthing-sync';
const vendorBaseUrl = "https://github.com/calebsmithdev/wowthing-sync";

const baseUrl = `${vendorBaseUrl}/releases/download/v${vendorVersion}`;
const tauriUpdate = {
    name: `v${vendorVersion}`,
    pub_date: now,
    platforms: {
        darwin: {
            url: `${baseUrl}/${vendorNameLowercase}_${vendorVersion}_macos_tauri_x86_64.app.tar.gz`,
            signature: `${baseUrl}/${vendorNameLowercase}_${vendorVersion}_macos_tauri_x86_64.app.tar.gz.sig`,
        },
        linux: {
            url: `${baseUrl}/${vendorNameLowercase}_${vendorVersion}_linux_tauri_amd64.AppImage.tar.gz`,
            signature: `${baseUrl}/${vendorNameLowercase}_${vendorVersion}_linux_tauri_amd64.AppImage.tar.gz.sig`,
        },
        win64: {
            url: `${baseUrl}/${vendorNameLowercase}_${vendorVersion}_windows_tauri_x64.msi.zip`,
            signature: `${baseUrl}/${vendorNameLowercase}_${vendorVersion}_windows_tauri_x64.msi.zip.sig`,
        },
    },
};

writeFileSync(tauriUpdateFilePath, JSON.stringify(tauriUpdate, null, 4), "utf-8");

export {}