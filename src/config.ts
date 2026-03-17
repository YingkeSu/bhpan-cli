import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { DEFAULT_PUBKEY, MISSING_CERT_PEM } from "./constants.ts";
import type { AppConfig } from "./types.ts";

const APP_NAME = "bhpan";
const CURRENT_REVISION = 1;

function getConfigRoot(): string {
  if (process.platform === "win32") {
    return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
}

function getDataRoot(): string {
  if (process.platform === "win32") {
    return process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
}

export function getConfigDir(): string {
  const dir = path.join(getConfigRoot(), APP_NAME);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDataDir(): string {
  const dir = path.join(getDataRoot(), APP_NAME);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getConfigFile(): string {
  return path.join(getConfigDir(), "config.json");
}

export function getCertFile(): string {
  const certFile = path.join(getDataDir(), "missing_cert.pem");
  if (!fs.existsSync(certFile)) {
    fs.writeFileSync(certFile, MISSING_CERT_PEM, "utf8");
  }
  return certFile;
}

export function defaultConfig(): AppConfig {
  return {
    revision: CURRENT_REVISION,
    host: "bhpan.buaa.edu.cn",
    pubkey: DEFAULT_PUBKEY,
    username: null,
    encrypted: null,
    storePassword: true,
    cachedToken: {
      token: "",
      expires: 0,
    },
  };
}

export function loadConfig(): AppConfig {
  const configFile = getConfigFile();
  if (!fs.existsSync(configFile)) {
    return defaultConfig();
  }
  const raw = JSON.parse(fs.readFileSync(configFile, "utf8")) as Partial<AppConfig> & {
    store_password?: boolean;
    cached_token?: { token?: string; expires?: number };
  };
  return {
    ...defaultConfig(),
    ...raw,
    storePassword: raw.storePassword ?? raw.store_password ?? true,
    cachedToken: {
      ...defaultConfig().cachedToken,
      ...(raw.cachedToken || raw.cached_token || {}),
    },
    revision: CURRENT_REVISION,
  };
}

export function saveConfig(config: AppConfig): void {
  fs.writeFileSync(getConfigFile(), JSON.stringify(config, null, 2), "utf8");
}
