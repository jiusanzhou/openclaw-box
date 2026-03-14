import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AgentInfo, StepResult } from "../../lib/types";

interface MemoryFileInfo {
  path: string;
  name: string;
  size: number;
  last_modified: number | null;
  available: boolean;
}

function relativeTime(ts: number | null): string {
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

// Simple markdown → HTML renderer (headings, bold, italic, inline code, lists)
function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks
  html = html.replace(/```[\s\S]*?```/g, (m) => {
    const inner = m.slice(3, -3).replace(/^[^\n]*\n?/, "");
    return `<pre class="bg-gray-100 rounded p-2 text-xs overflow-x-auto my-2"><code>${inner}</code></pre>`;
  });
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 rounded px-1 text-xs font-mono">$1</code>');
  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-4 mb-1 border-b pb-1">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>');
  // Bold & italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Horizontal rule
  html = html.replace(/^---+$/gm, '<hr class="my-3 border-gray-300"/>');
  // Unordered list items
  html = html.replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>');
  // Paragraphs / newlines
  html = html.replace(/\n\n/g, '</p><p class="mb-2">');
  html = `<p class="mb-2">${html}</p>`;

  return html;
}

export function Memory() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [memFiles, setMemFiles] = useState<MemoryFileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<MemoryFileInfo | null>(null);
  const [content, setContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    invoke<AgentInfo[]>("list_agents")
      .then((list) => {
        const active = list.filter((a) => a.workspace);
        setAgents(active);
        if (active.length > 0) setSelectedAgent(active[0]);
      })
      .catch(() => {});
  }, []);

  const loadFiles = useCallback(async (agent: AgentInfo) => {
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
      // Auto-select MEMORY.md if available
      const main = files.find((f) => f.name === "MEMORY.md" && f.available);
      if (main) setSelectedFile(main);
    } catch {
      setMemFiles([]);
    }
    setLoadingFiles(false);
  }, []);

  useEffect(() => {
    if (selectedAgent) loadFiles(selectedAgent);
  }, [selectedAgent, loadFiles]);

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
        // Refresh file list to update size/mtime
        if (selectedAgent) loadFiles(selectedAgent);
      } else {
        setMessage({ type: "error", text: result.message });
      }
    } catch (e) {
      setMessage({ type: "error", text: `${e}` });
    }
    setSaving(false);
  };

  const handleCancelEdit = () => {
    setEditContent(content);
    setEditing(false);
    setMessage(null);
  };

  return (
    <div className="flex h-full">
      {/* Agent list */}
      <div className="w-48 border-r border-gray-200 bg-gray-50 overflow-y-auto flex-shrink-0">
        <div className="p-3 border-b border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Agent</p>
        </div>
        {agents.length === 0 ? (
          <p className="p-3 text-xs text-gray-400">无活跃 Agent</p>
        ) : (
          agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedAgent(agent)}
              className={`w-full text-left px-3 py-2.5 text-sm border-b border-gray-100 transition-colors ${
                selectedAgent?.id === agent.id
                  ? "bg-indigo-50 text-indigo-700 font-medium"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <div className="font-medium truncate">{agent.name || agent.id}</div>
              <div className="text-xs text-gray-400 truncate mt-0.5">{agent.id.slice(0, 8)}…</div>
            </button>
          ))
        )}
      </div>

      {/* File list */}
      <div className="w-52 border-r border-gray-200 bg-white overflow-y-auto flex-shrink-0">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">记忆文件</p>
          {selectedAgent && (
            <button
              onClick={() => loadFiles(selectedAgent)}
              className="text-xs text-indigo-500 hover:text-indigo-700"
            >
              刷新
            </button>
          )}
        </div>
        {loadingFiles ? (
          <div className="flex justify-center p-4">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          </div>
        ) : memFiles.length === 0 ? (
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
                {f.available ? `${formatSize(f.size)} · ${relativeTime(f.last_modified)}` : "不存在"}
              </div>
            </button>
          ))
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedFile ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            选择一个记忆文件
          </div>
        ) : (
          <>
            {/* Toolbar */}
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
                      onClick={handleCancelEdit}
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

            {/* Content */}
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
