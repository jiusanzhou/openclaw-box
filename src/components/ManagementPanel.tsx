import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RemoteConfig } from "../lib/api";
import { Dashboard } from "./manage/Dashboard";
import { ModelConfig } from "./manage/ModelConfig";
import { ChannelConfig } from "./manage/ChannelConfig";
import { Logs } from "./manage/Logs";
import { Settings } from "./manage/Settings";
import { Agents } from "./manage/Agents";

type ManagePage = "dashboard" | "agents" | "model" | "channel" | "logs" | "settings";

const NAV_ITEMS: { id: ManagePage; icon: string; label: string }[] = [
  { id: "dashboard", icon: "📊", label: "总览" },
  { id: "agents", icon: "🤖", label: "智能体" },
  { id: "model", icon: "🧩", label: "模型" },
  { id: "channel", icon: "🔗", label: "渠道" },
  { id: "logs", icon: "📋", label: "日志" },
  { id: "settings", icon: "🔧", label: "设置" },
];

interface ManagementPanelProps {
  remoteConfig: RemoteConfig;
  onReset: () => void;
}

export function ManagementPanel({ remoteConfig, onReset }: ManagementPanelProps) {
  const [activePage, setActivePage] = useState<ManagePage>("dashboard");

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-52 bg-white/80 backdrop-blur-xl border-r border-gray-200 p-5 flex flex-col">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-gray-800">OpenClaw</h1>
          <p className="text-gray-400 text-sm mt-0.5">管理面板</p>
        </div>
        <nav className="space-y-1 flex-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
                item.id === activePage
                  ? "bg-indigo-50 text-indigo-700 font-semibold"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="space-y-2">
          <button
            onClick={() => invoke("open_url", { url: "http://localhost:18789" })}
            className="w-full text-sm text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2.5 transition-colors text-left"
          >
            🔗 打开控制台
          </button>
          <div className="text-gray-400 text-xs px-1">v{__APP_VERSION__}</div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activePage === "dashboard" && <Dashboard remoteConfig={remoteConfig} />}
        {activePage === "agents" && <Agents />}
        {activePage === "model" && <ModelConfig remoteConfig={remoteConfig} />}
        {activePage === "channel" && <ChannelConfig remoteConfig={remoteConfig} />}
        {activePage === "logs" && <Logs />}
        {activePage === "settings" && <Settings onReset={onReset} remoteConfig={remoteConfig} />}
      </div>
    </div>
  );
}
