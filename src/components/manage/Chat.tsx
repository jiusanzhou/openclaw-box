import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

const GATEWAY_URL = "http://localhost:18789/";

interface ChatProps {
  onNavigate: (page: string) => void;
}

export function Chat({ onNavigate }: ChatProps) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const checkAvailability = useCallback(async () => {
    try {
      const resp = await fetch(GATEWAY_URL, { mode: "no-cors" });
      // no-cors returns opaque response (status 0) on success
      if (resp.status === 0 || resp.ok) {
        setAvailable(true);
      } else {
        setAvailable(false);
      }
    } catch {
      setAvailable(false);
    }
  }, []);

  useEffect(() => {
    checkAvailability();
  }, [checkAvailability]);

  // Auto-retry every 3s when gateway is down
  useEffect(() => {
    if (available !== false) return;
    const timer = setInterval(checkAvailability, 3000);
    return () => clearInterval(timer);
  }, [available, checkAvailability]);

  const reloadIframe = () => {
    if (iframeRef.current) {
      iframeRef.current.src = GATEWAY_URL;
    }
  };

  const openInBrowser = () => {
    invoke("open_url", { url: GATEWAY_URL });
  };

  if (available === null) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <p className="text-gray-400">检测 Gateway 状态...</p>
      </div>
    );
  }

  if (!available) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <div className="text-5xl">🤖</div>
          <h2 className="text-xl font-semibold text-gray-700">智能体未启动</h2>
          <p className="text-gray-500">请先在总览页面启动 Gateway</p>
          <button
            onClick={() => onNavigate("dashboard")}
            className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
          >
            前往总览页面
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
        <h2 className="text-sm font-semibold text-gray-700">💬 智能体对话</h2>
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
      {/* Iframe */}
      <iframe
        ref={iframeRef}
        src={GATEWAY_URL}
        className="flex-1 w-full border-0"
        title="OpenClaw 对话"
      />
    </div>
  );
}
