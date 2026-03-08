import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { StepWizard } from "./components/StepWizard";
import { ManagementPanel } from "./components/ManagementPanel";
import {
  loadAllConfig,
  buildFreePublicProvider,
  type RemoteConfig,
} from "./lib/api";
import type { SystemInfo } from "./lib/types";

type AppMode = "loading" | "setup" | "manage";

export default function App() {
  const [remoteConfig, setRemoteConfig] = useState<RemoteConfig | null>(null);
  const [mode, setMode] = useState<AppMode>("loading");

  useEffect(() => {
    Promise.all([
      loadAllConfig(),
      invoke<SystemInfo>("check_system"),
    ]).then(([{ config, freeEndpoints }, systemInfo]) => {
      const freeProvider = buildFreePublicProvider(freeEndpoints);
      setRemoteConfig({
        ...config,
        providers: [freeProvider, ...config.providers],
      });
      setMode(systemInfo.has_openclaw ? "manage" : "setup");
    });
  }, []);

  if (!remoteConfig || mode === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-gray-500">正在加载配置...</p>
        </div>
      </div>
    );
  }

  if (mode === "manage") {
    return (
      <ManagementPanel
        remoteConfig={remoteConfig}
        onReset={() => setMode("setup")}
      />
    );
  }

  return (
    <StepWizard
      remoteConfig={remoteConfig}
      onComplete={() => setMode("manage")}
    />
  );
}
