import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AgentInfo, GatewayStatus } from "../../lib/types";

interface ChatProps {
  onNavigate: (page: string) => void;
}

export function Chat(_props: ChatProps) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [dashboardUrl, setDashboardUrl] = useState<string | null>(null);
  const [gatewayRunning, setGatewayRunning] = useState<boolean | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [agentList, url, status] = await Promise.all([
        invoke<AgentInfo[]>("list_agents"),
        invoke<string>("get_dashboard_url"),
        invoke<GatewayStatus>("get_gateway_status"),
      ]);
      setAgents(agentList);
      setDashboardUrl(url);
      setGatewayRunning(status.running);
    } catch {
      setGatewayRunning(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const reloadIframe = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  const openInBrowser = () => {
    if (dashboardUrl && selectedAgent) {
      const url = `${dashboardUrl}?session=${encodeURIComponent(selectedAgent.id)}`;
      invoke("open_url", { url });
    }
  };

  const goBack = () => setSelectedAgent(null);

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <p className="text-gray-400">加载智能体列表...</p>
      </div>
    );
  }

  // Chat session view
  if (selectedAgent && dashboardUrl) {
    const iframeSrc = `${dashboardUrl}?session=${encodeURIComponent(selectedAgent.id)}`;
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-3">
            <button
              onClick={goBack}
              className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              ← 返回列表
            </button>
            <span className="text-sm font-semibold text-gray-700">
              {selectedAgent.name || selectedAgent.id}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={reloadIframe}
              className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              刷新
            </button>
            <button
              onClick={openInBrowser}
              className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              在浏览器中打开
            </button>
          </div>
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

  // Agent list view
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-xl font-semibold text-gray-800 mb-1">
          💬 智能体对话
        </h2>
        <p className="text-sm text-gray-500 mb-6">选择一个智能体开始对话</p>

        {gatewayRunning === false && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
            <span className="text-sm text-amber-800">
              Gateway 未运行，请先启动
            </span>
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
          <div
            className={`grid gap-4 ${agents.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}
          >
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                className="text-left p-5 bg-white border border-gray-200 rounded-xl hover:border-indigo-400 hover:shadow-md transition-all group"
              >
                <div className="text-base font-semibold text-gray-800 group-hover:text-indigo-600 transition-colors">
                  {agent.name || agent.id}
                </div>
                <div className="text-xs text-gray-400 mt-1">{agent.id}</div>
                {agent.workspace && (
                  <div
                    className="text-xs text-gray-400 mt-2 truncate"
                    title={agent.workspace}
                  >
                    {agent.workspace}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
