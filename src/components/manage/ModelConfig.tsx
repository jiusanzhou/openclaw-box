import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { StepResult, ModelOption } from "../../lib/types";
import type { RemoteConfig } from "../../lib/api";

interface ProviderInfo {
  name: string;
  baseUrl: string;
  modelCount: number;
  models: { id: string; name: string }[];
}

interface ModelConfigProps {
  remoteConfig: RemoteConfig;
}

export function ModelConfig({ remoteConfig }: ModelConfigProps) {
  const [configYaml, setConfigYaml] = useState("");
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [defaultModel, setDefaultModel] = useState("");
  const [loading, setLoading] = useState(true);

  // New provider form
  const [showAdd, setShowAdd] = useState(false);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [yaml, models] = await Promise.all([
          invoke<string>("read_openclaw_config"),
          invoke<ModelOption[]>("get_available_models"),
        ]);
        setConfigYaml(yaml);

        // Group models by provider
        const providerMap = new Map<string, ProviderInfo>();
        for (const m of models) {
          if (!providerMap.has(m.provider)) {
            providerMap.set(m.provider, { name: m.provider, baseUrl: "", modelCount: 0, models: [] });
          }
          const p = providerMap.get(m.provider)!;
          p.modelCount++;
          p.models.push({ id: m.full_id, name: m.display_name });
        }
        setProviders(Array.from(providerMap.values()));

        // Read default model from openclaw.json
        // Parse from models list or yaml
        const defaultMatch = yaml.match(/primary:\s*"?([^"\n]+)"?/);
        if (defaultMatch) setDefaultModel(defaultMatch[1].trim());
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, []);

  const selectedProvider = remoteConfig.providers.find((p) => p.id === provider || p.name === provider);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      let updated = configYaml;
      updated = updated.replace(/base_url:\s*"[^"]*"/, `base_url: "${baseUrl}"`);
      updated = updated.replace(/api_key:\s*"[^"]*"/, `api_key: "${apiKey}"`);
      updated = updated.replace(/model:\s*"[^"]*"/, `model: "${model}"`);
      if (updated.includes("provider:")) {
        updated = updated.replace(/provider:\s*"[^"]*"/, `provider: "${provider}"`);
      }
      await invoke<StepResult>("write_openclaw_config", { content: updated });
      setConfigYaml(updated);
      setMessage({ type: "success", text: "配置已保存" });
    } catch (e) {
      setMessage({ type: "error", text: `保存失败: ${e}` });
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const result = await invoke<StepResult>("test_api_connection", { baseUrl, apiKey });
      setMessage({ type: result.success ? "success" : "error", text: result.message });
    } catch (e) {
      setMessage({ type: "error", text: `测试失败: ${e}` });
    }
    setTesting(false);
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">模型配置</h2>
          {defaultModel && (
            <p className="text-sm text-gray-500 mt-1">默认模型: <span className="font-mono text-gray-700">{defaultModel}</span></p>
          )}
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          {showAdd ? "收起" : "+ 新增供应商"}
        </button>
      </div>

      {/* Existing providers & models */}
      {providers.length > 0 ? (
        <div className="space-y-4">
          {providers.map((p) => (
            <div key={p.name} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">{p.name}</span>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{p.modelCount} 个模型</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {p.models.map((m) => (
                  <span
                    key={m.id}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border ${
                      m.id === defaultModel
                        ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-medium"
                        : "bg-gray-50 border-gray-200 text-gray-600"
                    }`}
                    title={m.id}
                  >
                    {m.name}
                    {m.id === defaultModel && <span className="ml-1 text-indigo-400">★</span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <div className="text-4xl mb-3">🧩</div>
          <p className="text-gray-500">暂无模型供应商配置</p>
          <p className="text-xs text-gray-400 mt-1">点击「新增供应商」开始配置</p>
        </div>
      )}

      {/* Add new provider form */}
      {showAdd && (
        <>
          <div className="bg-white rounded-xl border border-indigo-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">新增供应商</h3>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {remoteConfig.providers.filter((p) => !p.is_free_public).map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setProvider(p.id);
                    setBaseUrl(p.base_url);
                    if (p.default_model) setModel(p.default_model);
                  }}
                  className={`p-3 rounded-lg border-2 text-left transition-colors ${
                    provider === p.id || provider === p.name
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900">{p.name}</p>
                  {p.badge && <span className="text-xs text-indigo-600">{p.badge}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">模型设置</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">模型</label>
              {selectedProvider && selectedProvider.models.length > 0 ? (
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                >
                  {selectedProvider.models.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}{m.free ? " (免费)" : ""}</option>
                  ))}
                </select>
              ) : (
                <Input label="" value={model} onChange={(e) => setModel(e.target.value)} placeholder="例如: deepseek-chat" />
              )}
            </div>
            <Input label="API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="输入 API Key" type="password" />
            <Input label="Base URL" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="例如: https://api.deepseek.com/v1" />
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存配置"}</Button>
              <Button variant="secondary" onClick={handleTest} disabled={testing}>{testing ? "测试中..." : "测试连接"}</Button>
            </div>
            {message && (
              <div className={`p-3 rounded-lg text-sm ${message.type === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                {message.text}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
