export interface ModelOption {
  id: string;
  name: string;
  free?: boolean;
}

export interface FreeEndpoint {
  id: string;
  name: string;
  description?: string;
  base_url: string;
  models: ModelOption[];
  default_model: string;
  requires_key: boolean;
  register_url?: string;
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

export interface FreeEndpointsConfig {
  version: number;
  updated_at: string;
  endpoints: FreeEndpoint[];
}

// Baked-in fallbacks: imported at build time
import DEFAULT_CONFIG from "../../config/remote.json";
import DEFAULT_FREE_ENDPOINTS from "../../config/free-endpoints.json";

// Remote config URLs — tries in order, falls back to baked-in default
const CONFIG_URLS = [
  "https://raw.githubusercontent.com/jiusanzhou/openclaw-box/main/config/remote.json",
  "https://cdn.jsdelivr.net/gh/jiusanzhou/openclaw-box@main/config/remote.json",
];

const FREE_ENDPOINTS_URLS = [
  "https://raw.githubusercontent.com/jiusanzhou/openclaw-box/main/config/free-endpoints.json",
  "https://cdn.jsdelivr.net/gh/jiusanzhou/openclaw-box@main/config/free-endpoints.json",
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
      if (data?.providers?.length && data?.channels?.length) {
        return data as RemoteConfig;
      }
    } catch {
      // try next URL
    }
  }
  return DEFAULT_CONFIG as RemoteConfig;
}

export async function fetchFreeEndpoints(): Promise<FreeEndpointsConfig> {
  for (const url of FREE_ENDPOINTS_URLS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.endpoints?.length) {
        return data as FreeEndpointsConfig;
      }
    } catch {
      // try next URL
    }
  }
  return DEFAULT_FREE_ENDPOINTS as FreeEndpointsConfig;
}

export async function loadAllConfig(): Promise<{
  config: RemoteConfig;
  freeEndpoints: FreeEndpointsConfig;
}> {
  const [config, freeEndpoints] = await Promise.all([
    fetchRemoteConfig(),
    fetchFreeEndpoints(),
  ]);
  return { config, freeEndpoints };
}

export function buildFreePublicProvider(
  freeEndpoints: FreeEndpointsConfig,
): ProviderConfig {
  // Pick models from the first no-key endpoint for the top-level fields
  const firstNoKey = freeEndpoints.endpoints.find((e) => !e.requires_key);
  return {
    id: "free-public",
    name: "免费公共模型",
    base_url: firstNoKey?.base_url ?? "",
    models: firstNoKey?.models ?? [],
    default_model: firstNoKey?.default_model ?? "",
    badge: "零配置",
    free_tier: "无需 API Key，开箱即用",
    is_free_public: true,
    endpoints: freeEndpoints.endpoints,
  };
}
