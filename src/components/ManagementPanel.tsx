import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RemoteConfig } from "../lib/api";
import { Dashboard } from "./manage/Dashboard";
import { ModelConfig } from "./manage/ModelConfig";
import { ChannelConfig } from "./manage/ChannelConfig";
import { Logs } from "./manage/Logs";
import { Update } from "./manage/Update";
import { Settings } from "./manage/Settings";

type ManagePage = "dashboard" | "model" | "channel" | "logs" | "update" | "settings";

const NAV_ITEMS: { id: ManagePage; icon: string; label: string }[] = [
  { id: "dashboard", icon: "📊", label: "总览" },
  { id: "model", icon: "🤖", label: "模型" },
  { id: "channel", icon: "💬", label: "渠道" },
  { id: "logs", icon: "📋", label: "日志" },
  { id: "update", icon: "⬆️", label: "更新" },
  { id: "settings", icon: "⚙️", label: "设置" },
];

interface ManagementPanelProps {
  remoteConfig: RemoteConfig;
  onReset: () => void;
}

export function ManagementPanel({ remoteConfig, onReset }: ManagementPanelProps) {
  const [activePage, setActivePage] = useState<ManagePage>("dashboard");

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-52 bg-indigo-950 text-white p-5 flex flex-col">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-white">OpenClaw</h1>
          <p className="text-indigo-200 text-sm mt-0.5">管理面板</p>
        </div>
        <nav className="space-y-1.5 flex-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                item.id === activePage
                  ? "bg-indigo-600 text-white font-semibold shadow-md"
                  : "text-indigo-100 hover:bg-indigo-800 hover:text-white"
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
            className="w-full text-sm text-indigo-100 hover:text-white bg-indigo-800 hover:bg-indigo-700 rounded-lg px-3 py-2.5 transition-colors text-left"
          >
            🔗 打开控制台
          </button>
          <div className="text-indigo-300 text-xs px-1">v0.1.0</div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activePage === "dashboard" && <Dashboard remoteConfig={remoteConfig} />}
        {activePage === "model" && <ModelConfig remoteConfig={remoteConfig} />}
        {activePage === "channel" && <ChannelConfig remoteConfig={remoteConfig} />}
        {activePage === "logs" && <Logs />}
        {activePage === "update" && <Update remoteConfig={remoteConfig} />}
        {activePage === "settings" && <Settings onReset={onReset} />}
      </div>
    </div>
  );
}
