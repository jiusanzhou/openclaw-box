import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { StepResult } from "../../lib/types";
import type { RemoteConfig } from "../../lib/api";

interface ModelConfigProps {
  remoteConfig: RemoteConfig;
}

export function ModelConfig({ remoteConfig }: ModelConfigProps) {
  const [configYaml, setConfigYaml] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    invoke<string>("read_openclaw_config")
      .then((yaml) => {
        setConfigYaml(yaml);
        parseYaml(yaml);
      })
      .catch(() => {});
  }, []);

  const parseYaml = (yaml: string) => {
    const lines = yaml.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("provider:")) setProvider(trimmed.replace("provider:", "").trim().replace(/"/g, ""));
      if (trimmed.startsWith("model:")) setModel(trimmed.replace("model:", "").trim().replace(/"/g, ""));
      if (trimmed.startsWith("api_key:")) setApiKey(trimmed.replace("api_key:", "").trim().replace(/"/g, ""));
      if (trimmed.startsWith("base_url:")) setBaseUrl(trimmed.replace("base_url:", "").trim().replace(/"/g, ""));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      // Replace values in yaml
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
      const result = await invoke<StepResult>("test_api_connection", {
        baseUrl,
        apiKey,
      });
      setMessage({
        type: result.success ? "success" : "error",
        text: result.message,
      });
    } catch (e) {
      setMessage({ type: "error", text: `测试失败: ${e}` });
    }
    setTesting(false);
  };

  const selectedProvider = remoteConfig.providers.find((p) => p.id === provider || p.name === provider);

  return (
    <div className="p-8 space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">模型配置</h2>

      {/* Provider Selection */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">服务商</h3>
        <div className="grid grid-cols-3 gap-3">
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
              {p.badge && (
                <span className="text-xs text-indigo-600">{p.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Model & API Key */}
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
                <option key={m.id} value={m.id}>
                  {m.name}{m.free ? " (免费)" : ""}
                </option>
              ))}
            </select>
          ) : (
            <Input
              label=""
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="例如: deepseek-chat"
            />
          )}
        </div>

        <Input
          label="API Key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="输入 API Key"
          type="password"
        />

        <Input
          label="Base URL"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="例如: https://api.deepseek.com/v1"
        />

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存配置"}
          </Button>
          <Button variant="secondary" onClick={handleTest} disabled={testing}>
            {testing ? "测试中..." : "测试连接"}
          </Button>
        </div>

        {message && (
          <div
            className={`p-3 rounded-lg text-sm ${
              message.type === "success"
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
