import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { StepResult } from "../../lib/types";

interface HealthItem {
  key: string;
  label: string;
  status: "ok" | "warn" | "error";
  value: string;
  suggestion: string;
}

const STATUS_ICON: Record<string, string> = {
  ok: "✅",
  warn: "⚠️",
  error: "❌",
};

const STATUS_CLS: Record<string, string> = {
  ok: "text-green-700 bg-green-50 border-green-200",
  warn: "text-yellow-700 bg-yellow-50 border-yellow-200",
  error: "text-red-700 bg-red-50 border-red-200",
};

interface SettingsProps {
  onReset: () => void;
}

export function Settings({ onReset }: SettingsProps) {
  const [configYaml, setConfigYaml] = useState("");
  const [npmRegistry, setNpmRegistry] = useState("https://registry.npmmirror.com");
  const [gatewayPort, setGatewayPort] = useState("18789");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [healthItems, setHealthItems] = useState<HealthItem[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [confirmEdit, setConfirmEdit] = useState(false);

  const [backupLoading, setBackupLoading] = useState(false);
  const [restorePreview, setRestorePreview] = useState<{ success: boolean; message: string; config_yaml_diff: string; openclaw_json_diff: string } | null>(null);
  const [restoreContent, setRestoreContent] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    invoke<string>("read_openclaw_config")
      .then((yaml) => {
        setConfigYaml(yaml);
        const portMatch = yaml.match(/port:\s*(\d+)/);
        if (portMatch) setGatewayPort(portMatch[1]);
      })
      .catch(() => {});
  }, []);

  const runHealthCheck = useCallback(async () => {
    setHealthLoading(true);
    try {
      const items = await invoke<HealthItem[]>("health_check");
      setHealthItems(items);
    } catch {
      setHealthItems([]);
    }
    setHealthLoading(false);
  }, []);

  useEffect(() => {
    runHealthCheck();
  }, [runHealthCheck]);

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
      setEditMode(false);
    } catch (e) {
      setMessage({ type: "error", text: `保存失败: ${e}` });
    }
    setSaving(false);
  };

  const handleOpenConfig = async () => {
    try {
      const home = await invoke<string>("read_openclaw_config");
      void home;
      await invoke("open_url", { url: "file://" + getConfigPath() });
    } catch {
      await invoke("open_url", { url: "file://" + getConfigPath() }).catch(() => {});
    }
  };

  const getConfigPath = () => {
    const sep = navigator.platform.startsWith("Win") ? "\\" : "/";
    const home = navigator.platform.startsWith("Win") ? "%USERPROFILE%" : "~";
    return `${home}${sep}.openclaw${sep}config.yaml`;
  };

  const handleExport = async () => {
    setBackupLoading(true);
    try {
      const json = await invoke<string>("backup_config");
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `openclaw-backup-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setRestoreMsg({ type: "error", text: `导出失败: ${e}` });
    }
    setBackupLoading(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreMsg(null);
    try {
      const text = await file.text();
      setRestoreContent(text);
      const preview = await invoke<{ success: boolean; message: string; config_yaml_diff: string; openclaw_json_diff: string }>(
        "preview_restore", { backupJson: text }
      );
      setRestorePreview(preview);
    } catch (e) {
      setRestoreMsg({ type: "error", text: `读取文件失败: ${e}` });
    }
  };

  const handleRestore = async () => {
    if (!restoreContent) return;
    setRestoring(true);
    setRestoreMsg(null);
    try {
      const result = await invoke<StepResult>("restore_config", { backupJson: restoreContent });
      if (result.success) {
        setRestoreMsg({ type: "success", text: result.message });
        setRestorePreview(null);
        setRestoreContent("");
        setEditMode(false);
      } else {
        setRestoreMsg({ type: "error", text: result.message });
      }
    } catch (e) {
      setRestoreMsg({ type: "error", text: `恢复失败: ${e}` });
    }
    setRestoring(false);
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">设置</h2>
        {editMode ? (
          <span className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            编辑模式
            <button
              onClick={() => setEditMode(false)}
              className="ml-1 text-amber-500 hover:text-amber-700 font-bold"
            >✕</button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmEdit(true)}
            className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
          >
            开启编辑模式
          </button>
        )}
      </div>

      {confirmEdit && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-amber-700">编辑模式下可修改配置，操作不可撤销，请谨慎。确认开启？</p>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => { setEditMode(true); setConfirmEdit(false); }}
              className="text-sm px-3 py-1.5 rounded bg-amber-500 text-white hover:bg-amber-600"
            >确认开启</button>
            <button
              onClick={() => setConfirmEdit(false)}
              className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
            >取消</button>
          </div>
        </div>
      )}

      <div className={`bg-white rounded-xl border p-6 space-y-4 transition-colors ${editMode ? "border-amber-200" : "border-gray-200"}`}>
        <h3 className="text-lg font-semibold text-gray-900">基本设置</h3>

        <Input
          label="npm 镜像源"
          value={npmRegistry}
          onChange={(e) => setNpmRegistry(e.target.value)}
          placeholder="https://registry.npmmirror.com"
          disabled={!editMode}
        />

        <Input
          label="Gateway 端口"
          value={gatewayPort}
          onChange={(e) => setGatewayPort(e.target.value)}
          placeholder="18789"
          disabled={!editMode}
        />

        {editMode && (
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存设置"}
          </Button>
          <Button variant="secondary" onClick={handleOpenConfig}>
            打开配置文件
          </Button>
        </div>
        )}

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

      {/* System Health Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">系统健康状态</h3>
          <button
            onClick={runHealthCheck}
            disabled={healthLoading}
            className="text-sm text-indigo-600 hover:text-indigo-800 px-3 py-1.5 rounded border border-indigo-200 hover:bg-indigo-50 disabled:opacity-50"
          >
            {healthLoading ? "检测中…" : "🔄 重新检测"}
          </button>
        </div>

        {healthLoading && healthItems.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
            <span>检测中…</span>
          </div>
        ) : (
          <div className="space-y-2">
            {healthItems.map((item) => (
              <div
                key={item.key}
                className={`flex items-start gap-3 p-3 rounded-lg border ${STATUS_CLS[item.status] ?? "bg-gray-50 border-gray-200 text-gray-700"}`}
              >
                <span className="text-base flex-shrink-0 mt-0.5">{STATUS_ICON[item.status] ?? "❓"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{item.label}</span>
                    <span className="text-sm opacity-75 truncate">{item.value}</span>
                  </div>
                  {item.suggestion && (
                    <p className="text-xs mt-0.5 opacity-80">{item.suggestion}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`bg-white rounded-xl border p-6 space-y-4 transition-colors ${editMode ? "border-amber-200" : "border-gray-200"}`}>
        <h3 className="text-lg font-semibold text-gray-900">备份与恢复</h3>

        <div className="flex gap-2 items-center">
          <Button onClick={handleExport} disabled={backupLoading}>
            {backupLoading ? "导出中..." : "导出配置"}
          </Button>
          {editMode && (
          <label className="cursor-pointer text-sm text-indigo-600 hover:text-indigo-800 px-3 py-1.5 rounded border border-indigo-200 hover:bg-indigo-50">
            导入备份
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileSelect}
            />
          </label>
          )}
        </div>

        {restorePreview && (
          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-700">预览变更：</div>
            {restorePreview.config_yaml_diff && (
              <div>
                <div className="text-xs text-gray-500 mb-1">config.yaml</div>
                <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-x-auto whitespace-pre-wrap">{restorePreview.config_yaml_diff}</pre>
              </div>
            )}
            {restorePreview.openclaw_json_diff && (
              <div>
                <div className="text-xs text-gray-500 mb-1">openclaw.json</div>
                <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-x-auto whitespace-pre-wrap">{restorePreview.openclaw_json_diff}</pre>
              </div>
            )}
            <Button onClick={handleRestore} disabled={restoring}>
              {restoring ? "恢复中..." : "确认恢复"}
            </Button>
          </div>
        )}

        {restoreMsg && (
          <div
            className={`p-3 rounded-lg text-sm ${
              restoreMsg.type === "success"
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {restoreMsg.text}
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className={`bg-white rounded-xl border p-6 transition-colors ${editMode ? "border-red-300" : "border-red-200"}`}>
        <h3 className="text-lg font-semibold text-red-600 mb-2">重置</h3>
        <p className="text-sm text-gray-600 mb-4">
          重新进入安装向导，重新配置 OpenClaw。
        </p>
        <Button
          variant="secondary"
          onClick={onReset}
          disabled={!editMode}
        >
          重置为安装向导
        </Button>
      </div>
    </div>
  );
}
