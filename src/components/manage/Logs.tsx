import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";

export function Logs() {
  const [logs, setLogs] = useState<string[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<string[]>("get_gateway_logs");
      setLogs(result);
    } catch {
      setLogs(["无法获取日志"]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900">日志</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            自动刷新
          </label>
          <Button variant="secondary" onClick={fetchLogs} disabled={loading}>
            {loading ? "加载中..." : "刷新"}
          </Button>
          <Button variant="secondary" onClick={() => setLogs([])}>
            清空
          </Button>
        </div>
      </div>

      <div
        ref={logRef}
        className="flex-1 min-h-0 bg-gray-900 rounded-xl p-4 overflow-y-auto font-mono text-sm"
      >
        {logs.length === 0 ? (
          <span className="text-gray-500">暂无日志</span>
        ) : (
          logs.map((line, i) => (
            <div key={i} className="text-gray-300 leading-relaxed">
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
