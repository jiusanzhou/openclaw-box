import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  AgentInfo,
  AgentStatus,
  GatewayStatus,
  UsageStats,
  StepResult,
  ChannelTypeInfo,
  ModelOption,
} from "../../lib/types";

// ── Types local to this module ──────────────────────────────────────────────

interface MemoryFileInfo {
  path: string;
  name: string;
  size: number;
  last_modified: number | null;
  available: boolean;
}

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

type AgentTab = "chat" | "cron" | "memory" | "channels" | "usage" | "config";

const TABS: { id: AgentTab; icon: string; label: string }[] = [
  { id: "chat", icon: "💬", label: "对话" },
  { id: "cron", icon: "⏰", label: "定时任务" },
  { id: "memory", icon: "🧠", label: "记忆" },
  { id: "channels", icon: "📡", label: "渠道" },
  { id: "usage", icon: "📊", label: "用量" },
  { id: "config", icon: "⚙️", label: "配置" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(ms: number | null): string {
  if (!ms) return "—";
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

function relativeTimeFromSec(ts: number | null): string {
  if (!ts) return "—";
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  html = html.replace(/```[\s\S]*?```/g, (m) => {
    const inner = m.slice(3, -3).replace(/^[^\n]*\n?/, "");
    return `<pre class="bg-gray-100 rounded p-2 text-xs overflow-x-auto my-2"><code>${inner}</code></pre>`;
  });
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 rounded px-1 text-xs font-mono">$1</code>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-4 mb-1 border-b pb-1">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>');
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/^---+$/gm, '<hr class="my-3 border-gray-300"/>');
  html = html.replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>');
  html = html.replace(/\n\n/g, '</p><p class="mb-2">');
  html = `<p class="mb-2">${html}</p>`;
  return html;
}

// ── Status dot ──────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: "working" | "idle" | "offline" }) {
  if (status === "working") {
    return (
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
      </span>
    );
  }
  if (status === "idle") {
    return <span className="inline-flex rounded-full h-2.5 w-2.5 bg-gray-400" />;
  }
  return <span className="inline-flex rounded-full h-2.5 w-2.5 bg-red-400" />;
}

function StatusBadge({ status }: { status: "working" | "idle" | "offline" }) {
  const cls =
    status === "working"
      ? "bg-green-100 text-green-700"
      : status === "idle"
        ? "bg-gray-100 text-gray-600"
        : "bg-red-100 text-red-700";
  const label = status === "working" ? "运行中" : status === "idle" ? "空闲" : "离线";
  return (
    <span className={`inline-flex items-center rounded-full text-xs font-medium px-2 py-0.5 ${cls}`}>
      {label}
    </span>
  );
}

function CronStatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    ok: "bg-green-100 text-green-700",
    success: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
  };
  const cls = variants[status] ?? "bg-gray-100 text-gray-500";
  return (
    <span className={`inline-flex items-center rounded-full text-xs font-medium px-2 py-0.5 ${cls}`}>
      {status}
    </span>
  );
}

// ── Merged agent info ───────────────────────────────────────────────────────

interface MergedAgent extends AgentInfo {
  status: "working" | "idle" | "offline";
  emoji: string;
  last_active_ms: number | null;
  minutes_ago: number | null;
}

function mergeAgents(agents: AgentInfo[], statuses: AgentStatus[]): MergedAgent[] {
  const statusMap = new Map(statuses.map((s) => [s.id, s]));
  return agents.map((a) => {
    const s = statusMap.get(a.id);
    return {
      ...a,
      status: s?.status ?? "offline",
      emoji: s?.emoji ?? "🤖",
      last_active_ms: s?.last_active_ms ?? null,
      minutes_ago: s?.minutes_ago ?? null,
    };
  });
}

// ── Sub-tab: Chat ───────────────────────────────────────────────────────────

function ChatTab({ agent, dashboardUrl }: { agent: MergedAgent; dashboardUrl: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeSrc = `${dashboardUrl}?session=${encodeURIComponent(agent.id)}`;

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center justify-end px-4 py-2 border-b border-gray-100 bg-gray-50">
        <button
          onClick={() => iframeRef.current && (iframeRef.current.src = iframeRef.current.src)}
          className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 bg-white hover:bg-gray-100 rounded-md border border-gray-200 transition-colors"
        >
          刷新
        </button>
      </div>
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        className="flex-1 w-full border-0"
        title="OpenClaw 对话"
      />
    </div>
  );
}

// ── Sub-tab: Cron ───────────────────────────────────────────────────────────

function CronTab({ agent }: { agent: MergedAgent }) {
  const [jobs, setJobs] = useState<CronJobInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [triggerMsg, setTriggerMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await invoke<CronJobInfo[]>("list_cron_jobs");
      setJobs(all.filter((j) => j.agent_id === agent.id));
    } catch {
      setJobs([]);
    }
    setLoading(false);
  }, [agent.id]);

  useEffect(() => { load(); }, [load]);

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

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return <p className="p-6 text-sm text-gray-400 text-center">该 Agent 暂无定时任务</p>;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-6" />
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">任务名称</th>
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
              <td className="px-4 py-3">
                <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                  {job.schedule_expr || job.schedule_kind}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs">{relativeTime(job.last_run_at_ms)}</td>
              <td className="px-4 py-3 text-gray-500 text-xs">{relativeTime(job.next_run_at_ms)}</td>
              <td className="px-4 py-3">
                {job.consecutive_errors > 0 ? (
                  <CronStatusBadge status="error" />
                ) : (
                  <CronStatusBadge status={job.last_run_status} />
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
    </div>
  );
}

// ── Sub-tab: Memory ─────────────────────────────────────────────────────────

function MemoryTab({ agent }: { agent: MergedAgent }) {
  const [memFiles, setMemFiles] = useState<MemoryFileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<MemoryFileInfo | null>(null);
  const [content, setContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadFiles = useCallback(async () => {
    if (!agent.workspace) return;
    setLoadingFiles(true);
    setSelectedFile(null);
    setContent("");
    setEditContent("");
    setEditing(false);
    try {
      const files = await invoke<MemoryFileInfo[]>("list_agent_memory_files", {
        workspace: agent.workspace,
      });
      setMemFiles(files);
      const main = files.find((f) => f.name === "MEMORY.md" && f.available);
      if (main) setSelectedFile(main);
    } catch {
      setMemFiles([]);
    }
    setLoadingFiles(false);
  }, [agent.workspace]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  useEffect(() => {
    if (!selectedFile?.available) {
      setContent("");
      setEditContent("");
      return;
    }
    setLoadingContent(true);
    invoke<string>("read_memory_file", { path: selectedFile.path })
      .then((text) => {
        setContent(text);
        setEditContent(text);
      })
      .catch((e) => {
        setContent(`读取失败: ${e}`);
        setEditContent("");
      })
      .finally(() => setLoadingContent(false));
  }, [selectedFile]);

  const handleSave = async () => {
    if (!selectedFile) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await invoke<StepResult>("write_memory_file", {
        path: selectedFile.path,
        content: editContent,
      });
      if (result.success) {
        setContent(editContent);
        setEditing(false);
        setMessage({ type: "success", text: "已保存" });
        loadFiles();
      } else {
        setMessage({ type: "error", text: result.message });
      }
    } catch (e) {
      setMessage({ type: "error", text: `${e}` });
    }
    setSaving(false);
  };

  if (!agent.workspace) {
    return <p className="p-6 text-sm text-gray-400 text-center">该 Agent 没有工作区目录</p>;
  }

  if (loadingFiles) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* File list */}
      <div className="w-52 border-r border-gray-200 bg-white overflow-y-auto flex-shrink-0">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">记忆文件</p>
          <button onClick={loadFiles} className="text-xs text-indigo-500 hover:text-indigo-700">
            刷新
          </button>
        </div>
        {memFiles.length === 0 ? (
          <p className="p-3 text-xs text-gray-400">无记忆文件</p>
        ) : (
          memFiles.map((f) => (
            <button
              key={f.path}
              onClick={() => { setSelectedFile(f); setEditing(false); setMessage(null); }}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-100 transition-colors ${
                selectedFile?.path === f.path
                  ? "bg-indigo-50 border-l-2 border-l-indigo-500"
                  : "hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`text-xs ${f.available ? "text-green-500" : "text-gray-300"}`}>
                  {f.available ? "●" : "○"}
                </span>
                <span className="text-sm text-gray-800 font-mono truncate">{f.name}</span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5 pl-4">
                {f.available ? `${formatSize(f.size)} · ${relativeTimeFromSec(f.last_modified)}` : "不存在"}
              </div>
            </button>
          ))
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedFile ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            选择一个记忆文件
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-white flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-semibold text-gray-700">{selectedFile.name}</span>
                {selectedFile.available && (
                  <span className="text-xs text-gray-400">{formatSize(selectedFile.size)}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {message && (
                  <span className={`text-xs ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
                    {message.text}
                  </span>
                )}
                {editing ? (
                  <>
                    <button
                      onClick={() => { setEditContent(content); setEditing(false); setMessage(null); }}
                      className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {saving ? "保存中…" : "保存"}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { setEditing(true); setMessage(null); }}
                    disabled={!selectedFile.available}
                    className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    编辑
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {loadingContent ? (
                <div className="flex justify-center p-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                </div>
              ) : !selectedFile.available ? (
                <div className="p-6 text-gray-400 text-sm">文件不存在</div>
              ) : editing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-full p-4 font-mono text-sm resize-none focus:outline-none border-0"
                  spellCheck={false}
                />
              ) : (
                <div
                  className="p-6 prose prose-sm max-w-none text-sm text-gray-800 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-tab: Channels ────────────────────────────────────────────────────

function ChannelsTab({ agent }: { agent: MergedAgent }) {
  const [channels, setChannels] = useState<ChannelTypeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [operating, setOperating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<ChannelTypeInfo[]>("get_channels_config");
      setChannels(data);
    } catch {
      setChannels([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const boundChannels = channels.filter((ch) =>
    ch.accounts.some((a) => a.account_key === agent.id)
  );

  const unboundChannels = channels.filter((ch) =>
    ch.accounts.length > 0 && !ch.accounts.some((a) => a.account_key === agent.id)
  );

  const handleUnbind = async (channelType: string) => {
    setOperating(true);
    setMessage(null);
    try {
      const result = await invoke<StepResult>("update_agent_channel_binding", {
        agentId: agent.id,
        channelType,
        accountKey: agent.id,
        action: "unbind",
      });
      setMessage({ type: result.success ? "success" : "error", text: result.message });
      if (result.success) load();
    } catch (e) {
      setMessage({ type: "error", text: `${e}` });
    }
    setOperating(false);
  };

  const handleBind = async (channelType: string, accountKey: string) => {
    setOperating(true);
    setMessage(null);
    try {
      const result = await invoke<StepResult>("update_agent_channel_binding", {
        agentId: agent.id,
        channelType,
        accountKey,
        action: "bind",
      });
      setMessage({ type: result.success ? "success" : "error", text: result.message });
      if (result.success) load();
    } catch (e) {
      setMessage({ type: "error", text: `${e}` });
    }
    setOperating(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.type === "success"
            ? "bg-green-50 border border-green-200 text-green-700"
            : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {message.text}
        </div>
      )}

      {/* Bound channels */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">已绑定渠道</h3>
        {boundChannels.length === 0 ? (
          <p className="text-sm text-gray-400">暂无绑定渠道</p>
        ) : (
          <div className="space-y-2">
            {boundChannels.map((ch) => {
              const acct = ch.accounts.find((a) => a.account_key === agent.id);
              return (
                <div key={ch.channel_type} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{ch.channel_type}</span>
                    {acct?.bot_token_preview && (
                      <span className="ml-2 text-xs text-gray-400 font-mono">{acct.bot_token_preview}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleUnbind(ch.channel_type)}
                    disabled={operating}
                    className="text-xs px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    解绑
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Available channels to bind */}
      {unboundChannels.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">可绑定渠道</h3>
          <div className="space-y-2">
            {unboundChannels.map((ch) => (
              <div key={ch.channel_type} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-800">{ch.channel_type}</span>
                </div>
                <div className="space-y-1">
                  {ch.accounts.map((acct) => (
                    <div key={acct.account_key} className="flex items-center justify-between pl-3">
                      <span className="text-xs text-gray-600">
                        {acct.account_key}
                        {acct.bot_token_preview && (
                          <span className="ml-1 text-gray-400 font-mono">{acct.bot_token_preview}</span>
                        )}
                      </span>
                      <button
                        onClick={() => handleBind(ch.channel_type, acct.account_key)}
                        disabled={operating}
                        className="text-xs px-2.5 py-1 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                      >
                        绑定到此 Agent
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {channels.length === 0 && (
        <p className="text-sm text-gray-400 text-center">尚未配置任何渠道</p>
      )}
    </div>
  );
}

// ── Sub-tab: Usage ──────────────────────────────────────────────────────────

function UsageTab({ agent }: { agent: MergedAgent }) {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<UsageStats>("get_agent_usage_stats", { agentId: agent.id })
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agent.id]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (!stats?.available) {
    return <p className="p-6 text-sm text-gray-400 text-center">用量数据不可用</p>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">今日输入</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatTokens(stats.today_input)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">今日输出</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatTokens(stats.today_output)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">今日总计</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">{formatTokens(stats.today_total)}</p>
        </div>
      </div>

      {stats.daily.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <p className="text-sm font-semibold text-gray-700">每日用量</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">日期</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tokens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.daily.map((d) => (
                <tr key={d.date} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-700">{d.date}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-600">{formatTokens(d.tokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Sub-tab: Config ─────────────────────────────────────────────────────────

function ConfigTab({ agent }: { agent: MergedAgent }) {
  const [configYaml, setConfigYaml] = useState("");
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [currentModel, setCurrentModel] = useState("");
  const [defaultModel] = useState("");
  const [modelSaving, setModelSaving] = useState(false);
  const [modelMessage, setModelMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [yaml, modelList] = await Promise.all([
          invoke<string>("read_openclaw_config"),
          invoke<ModelOption[]>("get_available_models"),
        ]);
        setConfigYaml(yaml);
        setModels(modelList);
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, []);

  // Read agent's current model from openclaw.json
  useEffect(() => {
    const readModel = async () => {
      try {
        const raw = await invoke<string>("read_openclaw_config");
        // config.yaml is not JSON, read openclaw.json via read_memory_file workaround
        // Actually, we can parse from the JSON config by checking agents
        // For now, try to extract from Agents component's data
        void raw;
        
        // Use invoke to get the JSON config value
        const agentList = await invoke<AgentInfo[]>("list_agents");
        void agentList;
        // The AgentInfo doesn't contain model. We need to check openclaw.json directly.
        // We'll rely on Rust side: get_available_models returns the models, 
        // and the current model is stored in the agent config.
        // Let's read it via a dedicated call or parse the JSON.
      } catch { /* ignore */ }
    };
    readModel();
  }, [agent.id]);

  const handleModelChange = async (fullModelId: string) => {
    setModelSaving(true);
    setModelMessage(null);
    try {
      const result = await invoke<StepResult>("update_agent_model", {
        agentId: agent.id,
        modelId: fullModelId,
      });
      setModelMessage({ type: result.success ? "success" : "error", text: result.message });
      if (result.success) {
        setCurrentModel(fullModelId);
      }
    } catch (e) {
      setModelMessage({ type: "error", text: `${e}` });
    }
    setModelSaving(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Agent 信息</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500">名称</p>
            <p className="text-gray-800 font-medium">{agent.name || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">ID</p>
            <p className="text-gray-800 font-mono text-xs">{agent.id}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">状态</p>
            <StatusBadge status={agent.status} />
          </div>
          <div>
            <p className="text-xs text-gray-500">工作区</p>
            <p className="text-gray-800 font-mono text-xs truncate" title={agent.workspace || "—"}>
              {agent.workspace || "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Model selector */}
      {models.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">模型</h3>
          <div className="flex items-center gap-3">
            <select
              value={currentModel || defaultModel}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={modelSaving}
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
            >
              <option value="">使用默认模型{defaultModel ? ` (${defaultModel})` : ""}</option>
              {models.map((m) => (
                <option key={m.full_id} value={m.full_id}>
                  {m.display_name} ({m.full_id})
                </option>
              ))}
            </select>
            {modelSaving && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent flex-shrink-0" />
            )}
          </div>
          {modelMessage && (
            <div className={`p-2.5 rounded-lg text-xs ${
              modelMessage.type === "success"
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}>
              {modelMessage.text}
            </div>
          )}
          <p className="text-xs text-gray-400">修改后需重启 Gateway 生效</p>
        </div>
      )}

      {configYaml && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <p className="text-sm font-semibold text-gray-700">OpenClaw 配置</p>
          </div>
          <pre className="p-4 text-xs font-mono text-gray-700 overflow-auto max-h-96 bg-gray-50">
            {configYaml}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Main Agents component ───────────────────────────────────────────────────

export function Agents() {
  const [agents, setAgents] = useState<MergedAgent[]>([]);
  const [dashboardUrl, setDashboardUrl] = useState<string | null>(null);
  const [gatewayRunning, setGatewayRunning] = useState<boolean | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<MergedAgent | null>(null);
  const [activeTab, setActiveTab] = useState<AgentTab>("chat");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ id: "", name: "", emoji: "🤖", workspace: "" });
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const selectedAgentRef = useRef<MergedAgent | null>(null);
  selectedAgentRef.current = selectedAgent;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [agentList, statuses, url, status] = await Promise.all([
        invoke<AgentInfo[]>("list_agents"),
        invoke<AgentStatus[]>("get_agent_statuses"),
        invoke<string>("get_dashboard_url"),
        invoke<GatewayStatus>("get_gateway_status"),
      ]);
      const merged = mergeAgents(agentList, statuses);
      setAgents(merged);
      setDashboardUrl(url);
      setGatewayRunning(status.running);
      // Update selected agent reference if still selected
      const current = selectedAgentRef.current;
      if (current) {
        const updated = merged.find((a) => a.id === current.id);
        if (updated) setSelectedAgent(updated);
      }
    } catch {
      setGatewayRunning(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectAgent = (agent: MergedAgent) => {
    setSelectedAgent(agent);
    setActiveTab("chat");
  };

  const handleCreateAgent = async () => {
    if (!createForm.id || !createForm.name) return;
    setCreating(true);
    setCreateMsg(null);
    try {
      const result = await invoke<StepResult>("create_agent", {
        id: createForm.id,
        name: createForm.name,
        emoji: createForm.emoji || "🤖",
        workspace: createForm.workspace || `~/.openclaw/workspace-${createForm.id}`,
      });
      setCreateMsg({ type: result.success ? "success" : "error", text: result.message });
      if (result.success) {
        setCreateForm({ id: "", name: "", emoji: "🤖", workspace: "" });
        setShowCreate(false);
        loadData();
      }
    } catch (e) {
      setCreateMsg({ type: "error", text: `${e}` });
    }
    setCreating(false);
  };

  const goBack = () => {
    setSelectedAgent(null);
  };

  const openInBrowser = () => {
    if (dashboardUrl && selectedAgent) {
      const url = `${dashboardUrl}?session=${encodeURIComponent(selectedAgent.id)}`;
      invoke("open_url", { url });
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <p className="text-gray-400">加载智能体列表...</p>
      </div>
    );
  }

  // ── Agent detail view ───────────────────────────────────────────────────
  if (selectedAgent) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-3">
            <button
              onClick={goBack}
              className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              ← 返回列表
            </button>
            <span className="text-lg">{selectedAgent.emoji}</span>
            <span className="text-sm font-semibold text-gray-700">
              {selectedAgent.name || selectedAgent.id}
            </span>
            <StatusBadge status={selectedAgent.status} />
          </div>
          <button
            onClick={openInBrowser}
            className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            在浏览器中打开
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 border-b border-gray-200 bg-white px-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto bg-gray-50">
          {activeTab === "chat" && dashboardUrl && (
            <ChatTab agent={selectedAgent} dashboardUrl={dashboardUrl} />
          )}
          {activeTab === "chat" && !dashboardUrl && (
            <p className="p-6 text-sm text-gray-400 text-center">Dashboard URL 不可用</p>
          )}
          {activeTab === "cron" && <CronTab agent={selectedAgent} />}
          {activeTab === "memory" && <MemoryTab agent={selectedAgent} />}
          {activeTab === "channels" && <ChannelsTab agent={selectedAgent} />}
          {activeTab === "usage" && <UsageTab agent={selectedAgent} />}
          {activeTab === "config" && <ConfigTab agent={selectedAgent} />}
        </div>
      </div>
    );
  }

  // ── Agent list view ─────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-semibold text-gray-800">🤖 智能体</h2>
          <button
            onClick={() => { setShowCreate(true); setCreateMsg(null); }}
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            + 创建智能体
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-6">管理和监控所有 Agent</p>

        {/* Create agent form */}
        {showCreate && (
          <div className="mb-6 bg-white border border-indigo-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">创建新智能体</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">ID（英文，必填）</label>
                <input
                  value={createForm.id}
                  onChange={(e) => setCreateForm({ ...createForm, id: e.target.value.replace(/[^a-z0-9-_]/g, "") })}
                  placeholder="my-agent"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">名称（必填）</label>
                <input
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="我的助手"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Emoji</label>
                <input
                  value={createForm.emoji}
                  onChange={(e) => setCreateForm({ ...createForm, emoji: e.target.value })}
                  placeholder="🤖"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">工作目录（可选）</label>
                <input
                  value={createForm.workspace}
                  onChange={(e) => setCreateForm({ ...createForm, workspace: e.target.value })}
                  placeholder={`~/.openclaw/workspace-${createForm.id || "agent"}`}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
            {createMsg && (
              <div className={`p-2.5 rounded-lg text-xs ${
                createMsg.type === "success"
                  ? "bg-green-50 border border-green-200 text-green-700"
                  : "bg-red-50 border border-red-200 text-red-700"
              }`}>
                {createMsg.text}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleCreateAgent}
                disabled={creating || !createForm.id || !createForm.name}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {creating ? "创建中..." : "创建"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {gatewayRunning === false && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
            <span className="text-sm text-amber-800">Gateway 未运行，请先启动</span>
            <button
              onClick={async () => {
                await invoke("gateway_start");
                loadData();
              }}
              className="px-3 py-1.5 text-xs text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors"
            >
              启动 Gateway
            </button>
          </div>
        )}

        {agents.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🤖</div>
            <p className="text-gray-500">暂无智能体配置</p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => handleSelectAgent(agent)}
                className="text-left p-5 bg-white border border-gray-200 rounded-xl hover:border-indigo-400 hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">{agent.emoji}</span>
                  <StatusDot status={agent.status} />
                </div>
                <div className="text-base font-semibold text-gray-800 group-hover:text-indigo-600 transition-colors">
                  {agent.name || agent.id}
                </div>
                <div className="text-xs text-gray-400 mt-1 font-mono">{agent.id}</div>
                <div className="text-xs text-gray-400 mt-2">
                  {agent.minutes_ago !== null
                    ? agent.minutes_ago === 0
                      ? "刚刚活跃"
                      : `${agent.minutes_ago} 分钟前活跃`
                    : "未知"}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
