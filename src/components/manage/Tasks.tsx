import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { StepResult } from "../../lib/types";

interface CronJobInfo {
  id: string;
  agent_id: string;
  name: string;
  enabled: boolean;
  schedule_kind: string;
  schedule_expr: string;
  last_run_at_ms: number | null;
  next_run_at_ms: number | null;
  last_run_status: string;
  last_duration_ms: number | null;
  consecutive_errors: number;
}

interface SessionSummary {
  session_key: string;
  agent_id: string;
  agent_name: string;
  status: string;
  last_active_ms: number | null;
  last_channel: string;
  session_id: string;
}

function relativeTime(ms: number | null): string {
  if (!ms) return "—";
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function StatusBadge({ status, size = "sm" }: { status: string; size?: "sm" | "xs" }) {
  const textSize = size === "xs" ? "text-xs" : "text-xs";
  const padSize = size === "xs" ? "px-1.5 py-0.5" : "px-2 py-0.5";

  const variants: Record<string, string> = {
    ok: "bg-green-100 text-green-700",
    success: "bg-green-100 text-green-700",
    active: "bg-green-100 text-green-700",
    idle: "bg-yellow-100 text-yellow-700",
    error: "bg-red-100 text-red-700",
    offline: "bg-gray-100 text-gray-500",
    unknown: "bg-gray-100 text-gray-500",
  };
  const cls = variants[status] ?? "bg-gray-100 text-gray-500";
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${textSize} ${padSize} ${cls}`}>
      {status}
    </span>
  );
}

export function Tasks() {
  const [tab, setTab] = useState<"cron" | "sessions">("cron");
  const [jobs, setJobs] = useState<CronJobInfo[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [triggerMsg, setTriggerMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "cron") {
        const j = await invoke<CronJobInfo[]>("list_cron_jobs");
        setJobs(j);
      } else {
        const s = await invoke<SessionSummary[]>("list_all_sessions");
        setSessions(s);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const handleTrigger = async (job: CronJobInfo) => {
    setTriggering(job.id);
    setTriggerMsg(null);
    try {
      const result = await invoke<StepResult>("trigger_cron_job", { jobId: job.id });
      setTriggerMsg({ id: job.id, ok: result.success, text: result.message || (result.success ? "已触发" : "触发失败") });
      if (result.success) setTimeout(load, 1500);
    } catch (e) {
      setTriggerMsg({ id: job.id, ok: false, text: `${e}` });
    }
    setTriggering(null);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">任务</h2>
        <button
          onClick={load}
          className="text-sm text-indigo-600 hover:text-indigo-800 px-3 py-1.5 rounded border border-indigo-200 hover:bg-indigo-50"
        >
          刷新
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {(["cron", "sessions"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "cron" ? "🕐 定时任务" : "💬 活跃会话"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      ) : tab === "cron" ? (
        /* Cron jobs table */
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {jobs.length === 0 ? (
            <p className="p-6 text-sm text-gray-400 text-center">暂无定时任务</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-6" />
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">任务名称</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Agent</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Schedule</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">上次执行</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">下次执行</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">状态</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">耗时</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className={`w-2 h-2 rounded-full ${job.enabled ? "bg-green-400" : "bg-gray-300"}`} />
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-xs">
                      <div className="truncate">{job.name}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{job.agent_id}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                        {job.schedule_expr || job.schedule_kind}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{relativeTime(job.last_run_at_ms)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{relativeTime(job.next_run_at_ms)}</td>
                    <td className="px-4 py-3">
                      {job.consecutive_errors > 0 ? (
                        <StatusBadge status="error" />
                      ) : (
                        <StatusBadge status={job.last_run_status} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{formatDuration(job.last_duration_ms)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {triggerMsg?.id === job.id && (
                          <span className={`text-xs ${triggerMsg.ok ? "text-green-600" : "text-red-500"}`}>
                            {triggerMsg.text}
                          </span>
                        )}
                        <button
                          onClick={() => handleTrigger(job)}
                          disabled={triggering === job.id}
                          className="text-xs px-2.5 py-1 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 whitespace-nowrap"
                        >
                          {triggering === job.id ? "触发中…" : "▶ 触发"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        /* Sessions list */
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {sessions.length === 0 ? (
            <p className="p-6 text-sm text-gray-400 text-center">暂无会话记录</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Agent</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Session Key</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">渠道</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">最后活跃</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.map((s) => (
                  <>
                    <tr
                      key={s.session_key}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedSession(expandedSession === s.session_key ? null : s.session_key)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{s.agent_name}</td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-500 max-w-xs">
                        <div className="truncate">{s.session_key}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{s.last_channel}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{relativeTime(s.last_active_ms)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.status} />
                      </td>
                    </tr>
                    {expandedSession === s.session_key && (
                      <tr key={`${s.session_key}-detail`} className="bg-indigo-50">
                        <td colSpan={5} className="px-4 py-3">
                          <div className="text-xs space-y-1 text-gray-700">
                            <div><span className="font-semibold">Session ID:</span> <span className="font-mono">{s.session_id || "—"}</span></div>
                            <div><span className="font-semibold">Agent ID:</span> <span className="font-mono">{s.agent_id}</span></div>
                            <div><span className="font-semibold">Session Key:</span> <span className="font-mono break-all">{s.session_key}</span></div>
                            <div><span className="font-semibold">最后活跃:</span> {s.last_active_ms ? new Date(s.last_active_ms).toLocaleString("zh-CN") : "—"}</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
