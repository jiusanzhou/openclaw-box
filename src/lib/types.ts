export type InstallStep = "welcome" | "choose-provider" | "configure-model" | "choose-channel" | "configure-channel" | "install";

export interface InstallerConfig {
  provider: string;
  apiKey: string;
  model: string;
  customBaseUrl: string;
  customModel: string;
  channel: string;
  channelFields: Record<string, string>;
  selectedEndpoint?: string;
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

export interface GatewayStatus {
  running: boolean;
  version: string | null;
  port: number | null;
  url: string | null;
  pid: number | null;
}

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  has_update: boolean;
}

export interface AgentInfo {
  id: string;
  name: string | null;
  workspace: string | null;
}

export interface DayUsage {
  date: string;
  tokens: number;
}

export interface ContextPressure {
  session_key: string;
  agent_id: string;
  ratio: number;
  context_window: number;
  estimated_tokens: number;
}

export interface UsageStats {
  available: boolean;
  today_input: number;
  today_output: number;
  today_total: number;
  daily: DayUsage[];
  hot_sessions: ContextPressure[];
}

export interface AgentStatus {
  id: string;
  name: string;
  emoji: string;
  status: "working" | "idle" | "offline";
  last_active_ms: number | null;
  last_session_key: string;
  minutes_ago: number | null;
}
