export type InstallStep = "welcome" | "choose-provider" | "configure-model" | "choose-channel" | "configure-channel" | "install";

export interface InstallerConfig {
  provider: string;
  apiKey: string;
  model: string;
  customBaseUrl: string;
  customModel: string;
  channel: string;
  channelFields: Record<string, string>;
}

export interface SystemInfo {
  os: string;
  arch: string;
  node_version: string | null;
  node_path: string | null;
  npm_version: string | null;
  network_ok: boolean;
  has_wsl: boolean;
  wsl_distros: string[];
  has_openclaw: boolean;
  openclaw_version: string | null;
}

export interface StepResult {
  success: boolean;
  message: string;
  logs: string[];
}

export interface InstallPayload {
  node_download_mirror: string;
  npm_registry: string;
  node_version: string;
  openclaw_version: string;
  provider_base_url: string;
  provider_name: string;
  api_key: string;
  model: string;
  channel_type: string;
  channel_config: Record<string, string>;
  install_mode: string;
}
