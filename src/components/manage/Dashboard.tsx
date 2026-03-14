import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";
import type { GatewayStatus, StepResult, UsageStats, AgentStatus } from "../../lib/types";
import type { RemoteConfig } from "../../lib/api";

interface DashboardProps {
  remoteConfig: RemoteConfig;
}

export function Dashboard({ remoteConfig }: DashboardProps) {
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [configYaml, setConfigYaml] = useState("");
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([]);

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
    invoke<UsageStats>("get_usage_stats").then(setUsageStats).catch(() => {});
    invoke<AgentStatus[]>("get_agent_statuses").then(setAgentStatuses).catch(() => {});
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

      {/* Agent Status */}
      {agentStatuses.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Agent 状态</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {agentStatuses.map((agent) => (
              <div
                key={agent.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors cursor-pointer"
                onClick={() => invoke("open_url", { url: `http://localhost:18789/openclaw/#/sessions/${encodeURIComponent(agent.last_session_key)}` })}
              >
                <div className="relative mt-0.5 flex-shrink-0">
                  <span className="text-xl leading-none">{agent.emoji}</span>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                      agent.status === "working"
                        ? "bg-green-500 animate-pulse"
                        : agent.status === "idle"
                        ? "bg-amber-400"
                        : "bg-gray-300"
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{agent.name}</p>
                  <p className={`text-xs ${
                    agent.status === "working" ? "text-green-600" : agent.status === "idle" ? "text-amber-600" : "text-gray-400"
                  }`}>
                    {agent.status === "working" ? "工作中" : agent.status === "idle" ? "待命" : "离线"}
                    {agent.minutes_ago != null && agent.minutes_ago > 0 && (
                      <span className="text-gray-400 ml-1">· {fmtMinutes(agent.minutes_ago)}</span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Token Usage Today */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">今日 Token 用量</h3>
        {!usageStats || !usageStats.available ? (
          <div className="flex items-center gap-2 text-gray-400">
            <div className="w-2 h-2 rounded-full bg-gray-300" />
            <span className="text-sm">未连接 — 无法读取用量数据</span>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">总计</p>
              <p className="text-2xl font-bold text-gray-900">{fmtTokens(usageStats.today_total)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">输入</p>
              <p className="text-xl font-semibold text-blue-600">{fmtTokens(usageStats.today_input)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">输出</p>
              <p className="text-xl font-semibold text-violet-600">{fmtTokens(usageStats.today_output)}</p>
            </div>
          </div>
        )}
      </div>

      {/* 7-Day Trend */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">近 7 日趋势</h3>
        {!usageStats || !usageStats.available ? (
          <div className="flex items-center gap-2 text-gray-400">
            <div className="w-2 h-2 rounded-full bg-gray-300" />
            <span className="text-sm">未连接 — 无法读取用量数据</span>
          </div>
        ) : (
          <UsageTrendChart daily={usageStats.daily} />
        )}
      </div>

      {/* Context Pressure */}
      {usageStats?.available && usageStats.hot_sessions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">上下文压力</h3>
          <div className="space-y-3">
            {usageStats.hot_sessions.map((s) => (
              <div key={s.session_key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600 truncate max-w-xs" title={s.session_key}>
                    {s.session_key.split(":").slice(1).join(":")}
                  </span>
                  <span className={`text-xs font-medium ml-2 ${s.ratio > 0.85 ? "text-red-600" : s.ratio > 0.7 ? "text-amber-600" : "text-gray-500"}`}>
                    {Math.round(s.ratio * 100)}%
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${s.ratio > 0.85 ? "bg-red-500" : s.ratio > 0.7 ? "bg-amber-400" : "bg-indigo-400"}`}
                    style={{ width: `${Math.round(s.ratio * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtMinutes(mins: number): string {
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ago`;
}

function UsageTrendChart({ daily }: { daily: { date: string; tokens: number }[] }) {
  const max = Math.max(...daily.map((d) => d.tokens), 1);
  const chartH = 64;
  const barW = 24;
  const gap = 8;
  const totalW = daily.length * (barW + gap) - gap;

  return (
    <div className="overflow-x-auto">
      <svg width={totalW} height={chartH + 24} className="overflow-visible">
        {daily.map((d, i) => {
          const barH = Math.max((d.tokens / max) * chartH, d.tokens > 0 ? 2 : 0);
          const x = i * (barW + gap);
          const y = chartH - barH;
          const isToday = i === daily.length - 1;
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={3}
                className={isToday ? "fill-indigo-500" : "fill-indigo-200"}
              />
              <text
                x={x + barW / 2}
                y={chartH + 16}
                textAnchor="middle"
                className="fill-gray-400"
                style={{ fontSize: 10 }}
              >
                {d.date.slice(5)}
              </text>
              {d.tokens > 0 && (
                <title>{`${d.date}: ${fmtTokens(d.tokens)} tokens`}</title>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
