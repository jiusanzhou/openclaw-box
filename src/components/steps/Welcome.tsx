import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";
import type { SystemInfo } from "../../lib/types";
import type { RemoteConfig } from "../../lib/api";

interface WelcomeProps {
  remoteConfig: RemoteConfig;
  onNext: () => void;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

export function Welcome({ remoteConfig, onNext }: WelcomeProps) {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    invoke<SystemInfo>("check_system")
      .then(setSystemInfo)
      .catch(console.error)
      .finally(() => setChecking(false));
  }, []);

  const nodeOk = systemInfo?.node_version
    ? compareVersions(
        systemInfo.node_version.replace("v", ""),
        remoteConfig.node_version,
      ) >= 0
    : false;

  const isWindows = systemInfo?.os === "windows";

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex-1">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          欢迎使用 OpenClaw Box
        </h2>
        <p className="text-gray-500 mb-8">
          安装、配置、管理你的 OpenClaw 智能助手。
        </p>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h3 className="font-semibold text-gray-800">系统环境检测</h3>

          {checking ? (
            <div className="flex items-center gap-2 text-gray-500">
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              正在检测系统环境...
            </div>
          ) : systemInfo ? (
            <div className="space-y-3">
              <InfoRow
                label="操作系统"
                value={`${systemInfo.os} (${systemInfo.arch})`}
                ok
              />
              <InfoRow
                label="Node.js"
                value={
                  systemInfo.node_version
                    ? `${systemInfo.node_version}${nodeOk ? "" : ` (需要 ≥${remoteConfig.node_version})`}`
                    : `未安装 (将自动安装 v${remoteConfig.node_version})`
                }
                ok={nodeOk}
                warn={!!systemInfo.node_version && !nodeOk}
              />
              {systemInfo.npm_version && (
                <InfoRow label="npm" value={systemInfo.npm_version} ok />
              )}
              <InfoRow
                label="网络连接"
                value={systemInfo.network_ok ? "正常" : "无法连接镜像站"}
                ok={systemInfo.network_ok}
              />
              {systemInfo.has_openclaw && (
                <InfoRow
                  label="OpenClaw"
                  value={systemInfo.openclaw_version || "已安装"}
                  ok
                />
              )}
              {isWindows && systemInfo.has_wsl && (
                <InfoRow
                  label="WSL2"
                  value={`已安装 (${systemInfo.wsl_distros.join(", ")})`}
                  ok
                />
              )}
            </div>
          ) : (
            <p className="text-red-500">系统检测失败，请重试。</p>
          )}
        </div>

        {!checking && systemInfo && isWindows && (
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            <p className="font-medium mb-1">Windows 安装说明</p>
            {systemInfo.has_wsl ? (
              <p>
                检测到 WSL2 环境，推荐在 WSL2 中安装以获得更好的兼容性。
              </p>
            ) : (
              <p>
                将使用原生 Windows 方式安装。如需更好的兼容性，建议先安装
                WSL2。
              </p>
            )}
          </div>
        )}

        {!checking && systemInfo && !systemInfo.node_version && (
          <div className="mt-4 bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-sm text-indigo-800">
            未检测到 Node.js，安装过程中将自动从镜像站下载并安装 Node.js v
            {remoteConfig.node_version}。
          </div>
        )}
      </div>

      <div className="flex justify-end pt-6">
        <Button onClick={onNext} disabled={checking}>
          开始配置
        </Button>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  ok,
  warn,
}: {
  label: string;
  value: string;
  ok: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-gray-600 text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-900">{value}</span>
        <span
          className={`w-2 h-2 rounded-full ${
            ok ? "bg-green-500" : warn ? "bg-amber-500" : "bg-red-500"
          }`}
        />
      </div>
    </div>
  );
}
