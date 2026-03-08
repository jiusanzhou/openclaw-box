import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";
import type { GatewayStatus, StepResult } from "../../lib/types";
import type { RemoteConfig } from "../../lib/api";

interface DashboardProps {
  remoteConfig: RemoteConfig;
}

export function Dashboard({ remoteConfig }: DashboardProps) {
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [configYaml, setConfigYaml] = useState("");

  const refreshStatus = useCallback(async () => {
    try {
      const s = await invoke<GatewayStatus>("get_gateway_status");
      setStatus(s);
    } catch {
      setStatus({ running: false, version: null, port: 18789, url: "http://localhost:18789", pid: null });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshStatus();
    invoke<string>("read_openclaw_config").then(setConfigYaml).catch(() => {});
  }, [refreshStatus]);

  const handleAction = async (action: "gateway_start" | "gateway_stop" | "gateway_restart") => {
    setActionLoading(true);
    try {
      await invoke<StepResult>(action);
      await new Promise((r) => setTimeout(r, 1500));
      await refreshStatus();
    } catch {
      // ignore
    }
    setActionLoading(false);
  };

  const parseConfigSummary = () => {
    const lines = configYaml.split("\n");
    let provider = "";
    let model = "";
    let channel = "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("provider:")) provider = trimmed.replace("provider:", "").trim().replace(/"/g, "");
      if (trimmed.startsWith("model:")) model = trimmed.replace("model:", "").trim().replace(/"/g, "");
      if (trimmed.startsWith("type:") && !channel) channel = trimmed.replace("type:", "").trim().replace(/"/g, "");
    }
    return { provider, model, channel };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  const summary = parseConfigSummary();
  const gatewayUrl = status?.url || "http://localhost:18789";

  return (
    <div className="p-8 space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">总览</h2>

      {/* Gateway Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900">Gateway 状态</h3>
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  status?.running ? "bg-green-500 animate-pulse" : "bg-red-500"
                }`}
              />
              <span className={`text-sm font-medium ${status?.running ? "text-green-600" : "text-red-600"}`}>
                {status?.running ? "运行中" : "已停止"}
              </span>
            </div>
          </div>
          {status?.pid && (
            <span className="text-xs text-gray-400">PID: {status.pid}</span>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => handleAction("gateway_start")}
            disabled={actionLoading || !!status?.running}
          >
            启动
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleAction("gateway_stop")}
            disabled={actionLoading || !status?.running}
          >
            停止
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleAction("gateway_restart")}
            disabled={actionLoading || !status?.running}
          >
            重启
          </Button>
        </div>
      </div>

      {/* Config Summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">配置摘要</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">服务商</p>
            <p className="text-sm font-medium text-gray-900">{summary.provider || "未配置"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">模型</p>
            <p className="text-sm font-medium text-gray-900">{summary.model || "未配置"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">渠道</p>
            <p className="text-sm font-medium text-gray-900">{summary.channel || "未配置"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">OpenClaw 版本</p>
            <p className="text-sm font-medium text-gray-900">{status?.version || remoteConfig.openclaw_version}</p>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">快速操作</h3>
        <div className="flex items-center gap-3">
          <Button onClick={() => invoke("open_url", { url: gatewayUrl })}>
            打开控制台
          </Button>
          <span className="text-sm text-gray-500 font-mono">{gatewayUrl}</span>
        </div>
      </div>
    </div>
  );
}
