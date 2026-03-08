import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";
import type { UpdateInfo, StepResult } from "../../lib/types";
import type { RemoteConfig } from "../../lib/api";

interface UpdateProps {
  remoteConfig: RemoteConfig;
}

export function Update({ remoteConfig }: UpdateProps) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const npmRegistry = remoteConfig.mirrors.npm_registry;

  const checkForUpdates = async () => {
    setChecking(true);
    setMessage(null);
    try {
      const info = await invoke<UpdateInfo>("check_openclaw_update", {
        npmRegistry,
      });
      setUpdateInfo(info);
      if (!info.has_update) {
        setMessage({ type: "success", text: "已是最新版本" });
      }
    } catch (e) {
      setMessage({ type: "error", text: `检查更新失败: ${e}` });
    }
    setChecking(false);
  };

  const runUpdate = async () => {
    if (!updateInfo) return;
    setUpdating(true);
    setMessage(null);
    setProgress("正在更新...");
    try {
      const result = await invoke<StepResult>("run_openclaw_update", {
        npmRegistry,
        version: updateInfo.latest_version,
      });
      if (result.success) {
        setMessage({ type: "success", text: `已更新到 ${updateInfo.latest_version}` });
        setUpdateInfo(null);
      } else {
        setMessage({ type: "error", text: result.message });
      }
    } catch (e) {
      setMessage({ type: "error", text: `更新失败: ${e}` });
    }
    setProgress("");
    setUpdating(false);
  };

  return (
    <div className="p-8 space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">更新</h2>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">当前版本</p>
            <p className="text-sm font-medium text-gray-900">
              {updateInfo?.current_version || remoteConfig.openclaw_version}
            </p>
          </div>
          {updateInfo?.latest_version && (
            <div>
              <p className="text-xs text-gray-500 mb-1">最新版本</p>
              <p className="text-sm font-medium text-gray-900">{updateInfo.latest_version}</p>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button onClick={checkForUpdates} disabled={checking || updating}>
            {checking ? "检查中..." : "检查更新"}
          </Button>
          {updateInfo?.has_update && (
            <Button onClick={runUpdate} disabled={updating}>
              {updating ? "更新中..." : `更新到 ${updateInfo.latest_version}`}
            </Button>
          )}
        </div>

        {progress && (
          <div className="flex items-center gap-2 text-sm text-indigo-600">
            <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            {progress}
          </div>
        )}

        {message && (
          <div
            className={`p-3 rounded-lg text-sm ${
              message.type === "success"
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
