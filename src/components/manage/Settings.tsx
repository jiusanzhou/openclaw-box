import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { StepResult } from "../../lib/types";

interface SettingsProps {
  onReset: () => void;
}

export function Settings({ onReset }: SettingsProps) {
  const [configYaml, setConfigYaml] = useState("");
  const [npmRegistry, setNpmRegistry] = useState("https://registry.npmmirror.com");
  const [gatewayPort, setGatewayPort] = useState("18789");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    invoke<string>("read_openclaw_config")
      .then((yaml) => {
        setConfigYaml(yaml);
        const portMatch = yaml.match(/port:\s*(\d+)/);
        if (portMatch) setGatewayPort(portMatch[1]);
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      let updated = configYaml;
      const portNum = parseInt(gatewayPort, 10);
      if (!isNaN(portNum)) {
        updated = updated.replace(/port:\s*\d+/, `port: ${portNum}`);
      }
      await invoke<StepResult>("write_openclaw_config", { content: updated });
      setConfigYaml(updated);
      setMessage({ type: "success", text: "设置已保存" });
    } catch (e) {
      setMessage({ type: "error", text: `保存失败: ${e}` });
    }
    setSaving(false);
  };

  const handleOpenConfig = async () => {
    try {
      const home = await invoke<string>("read_openclaw_config");
      // Just open the config file directory; we use open_url to open it
      // We know the config is at ~/.openclaw/config.yaml
      void home;
      await invoke("open_url", { url: "file://" + getConfigPath() });
    } catch {
      // Try common paths
      await invoke("open_url", { url: "file://" + getConfigPath() }).catch(() => {});
    }
  };

  const getConfigPath = () => {
    // Best effort: use HOME or USERPROFILE
    const sep = navigator.platform.startsWith("Win") ? "\\" : "/";
    const home = navigator.platform.startsWith("Win") ? "%USERPROFILE%" : "~";
    return `${home}${sep}.openclaw${sep}config.yaml`;
  };

  return (
    <div className="p-8 space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">设置</h2>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">基本设置</h3>

        <Input
          label="npm 镜像源"
          value={npmRegistry}
          onChange={(e) => setNpmRegistry(e.target.value)}
          placeholder="https://registry.npmmirror.com"
        />

        <Input
          label="Gateway 端口"
          value={gatewayPort}
          onChange={(e) => setGatewayPort(e.target.value)}
          placeholder="18789"
        />

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存设置"}
          </Button>
          <Button variant="secondary" onClick={handleOpenConfig}>
            打开配置文件
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

      {/* Danger Zone */}
      <div className="bg-white rounded-xl border border-red-200 p-6">
        <h3 className="text-lg font-semibold text-red-600 mb-2">重置</h3>
        <p className="text-sm text-gray-600 mb-4">
          重新进入安装向导，重新配置 OpenClaw。
        </p>
        <Button
          variant="secondary"
          onClick={onReset}
        >
          重置为安装向导
        </Button>
      </div>
    </div>
  );
}
