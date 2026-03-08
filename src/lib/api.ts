export interface ModelOption {
  id: string;
  name: string;
  free?: boolean;
}

export interface FreeEndpoint {
  id: string;
  name: string;
  base_url: string;
  models: ModelOption[];
  default_model: string;
  requires_key: boolean;
}

export interface ProviderConfig {
  id: string;
  name: string;
  base_url: string;
  models: ModelOption[];
  default_model: string;
  register_url?: string;
  help_doc?: string;
  free_tier?: string;
  badge?: string;
  is_free_public?: boolean;
  endpoints?: FreeEndpoint[];
}

export interface ChannelField {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "password";
  required?: boolean;
}

export interface ChannelConfig {
  id: string;
  name: string;
  description?: string;
  fields: ChannelField[];
  help_doc?: string;
  is_default?: boolean;
}

export interface RemoteConfig {
  mirrors: {
    node_download: string;
    npm_registry: string;
  };
  node_version: string;
  openclaw_version: string;
  providers: ProviderConfig[];
  channels: ChannelConfig[];
  announcement?: string;
}

// Baked-in fallback: imported at build time from config/remote.json
import DEFAULT_CONFIG from "../../config/remote.json";

// Remote config URLs — tries in order, falls back to baked-in default
const CONFIG_URLS = [
  // GitHub raw (main branch) — you push JSON, users get updates instantly
  "https://raw.githubusercontent.com/jiusanzhou/openclaw-box/main/config/remote.json",
  // CDN mirror (jsdelivr wraps GitHub, better for China)
  "https://cdn.jsdelivr.net/gh/jiusanzhou/openclaw-box@main/config/remote.json",
];

export async function fetchRemoteConfig(): Promise<RemoteConfig> {
  for (const url of CONFIG_URLS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const data = await res.json();
      // Basic validation: must have providers and channels
      if (data?.providers?.length && data?.channels?.length) {
        return data as RemoteConfig;
      }
    } catch {
      // try next URL
    }
  }
  // All remote sources failed, use baked-in fallback
  return DEFAULT_CONFIG as RemoteConfig;
}
