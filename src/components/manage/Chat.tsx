import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GatewayStatus } from "../../lib/types";

const GATEWAY_URLS = [
  "http://localhost:18789/openclaw/",
  "http://127.0.0.1:18789/openclaw/",
  "http://localhost:18789/",
  "http://127.0.0.1:18789/",
];

interface ChatProps {
  onNavigate: (page: string) => void;
}

export function Chat({ onNavigate }: ChatProps) {
  const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const detectGatewayUrl = useCallback(async () => {
    // First try getting URL from Rust backend
    try {
      const status: GatewayStatus = await invoke("get_gateway_status");
      if (status.running && status.url) {
        // Ensure URL ends with /openclaw/ path if not already
        let url = status.url;
        if (!url.endsWith("/")) url += "/";
        // Try the status URL first, then with /openclaw/ appended
        const candidates = [url, url + "openclaw/", ...GATEWAY_URLS];
        for (const candidate of candidates) {
          try {
            const resp = await fetch(candidate, { mode: "no-cors" });
            if (resp.status === 0 || resp.ok) {
              setGatewayUrl(candidate);
              setAvailable(true);
              return;
            }
          } catch {
            // try next
          }
        }
      }
    } catch {
      // backend call failed
    }

    // Fallback: try common URLs
    for (const url of GATEWAY_URLS) {
      try {
        const resp = await fetch(url, { mode: "no-cors" });
        if (resp.status === 0 || resp.ok) {
          setGatewayUrl(url);
          setAvailable(true);
          return;
        }
      } catch {
        // try next
      }
    }

    setAvailable(false);
  }, []);

  useEffect(() => {
    detectGatewayUrl();
  }, [detectGatewayUrl]);

  // Auto-retry every 3s when gateway is down
  useEffect(() => {
    if (available !== false) return;
    const timer = setInterval(detectGatewayUrl, 3000);
    return () => clearInterval(timer);
  }, [available, detectGatewayUrl]);

  const reloadIframe = () => {
    if (iframeRef.current && gatewayUrl) {
      iframeRef.current.src = gatewayUrl;
    }
  };

  const openInBrowser = () => {
    if (gatewayUrl) {
      invoke("open_url", { url: gatewayUrl });
    }
  };

  if (available === null) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <p className="text-gray-400">检测 Gateway 状态...</p>
      </div>
    );
  }

  if (!available || !gatewayUrl) {
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
        src={gatewayUrl}
        className="flex-1 w-full border-0"
        title="OpenClaw 对话"
      />
    </div>
  );
}
