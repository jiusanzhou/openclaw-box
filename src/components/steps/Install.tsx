import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";
import type { InstallerConfig, StepResult, InstallPayload } from "../../lib/types";
import type { RemoteConfig } from "../../lib/api";

interface InstallProps {
  config: InstallerConfig;
  remoteConfig: RemoteConfig;
  onBack: () => void;
}

type SubStepStatus = "pending" | "running" | "done" | "error";

interface InstallSubStep {
  id: string;
  label: string;
  command: string;
  status: SubStepStatus;
  logs: string[];
  message: string;
}

const STEP_DEFS: { id: string; label: string; command: string }[] = [
  { id: "check", label: "检测环境", command: "install_step_check_env" },
  { id: "node", label: "安装 Node.js", command: "install_step_node" },
  { id: "openclaw", label: "安装 OpenClaw", command: "install_step_openclaw" },
  { id: "configure", label: "写入配置", command: "install_step_configure" },
  { id: "start", label: "启动服务", command: "install_step_start" },
];

function makeInitialSteps(): InstallSubStep[] {
  return STEP_DEFS.map((s) => ({
    ...s,
    status: "pending" as SubStepStatus,
    logs: [],
    message: "",
  }));
}

export function Install({ config, remoteConfig, onBack }: InstallProps) {
  const [steps, setSteps] = useState<InstallSubStep[]>(makeInitialSteps);
  const [installing, setInstalling] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gatewayUrl, setGatewayUrl] = useState("http://localhost:18789");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [steps]);

  const buildPayload = (): InstallPayload => {
    const provider = remoteConfig.providers.find(
      (p) => p.id === config.provider,
    );
    const isCustom = config.provider === "custom";
    return {
      node_download_mirror: remoteConfig.mirrors.node_download,
      npm_registry: remoteConfig.mirrors.npm_registry,
      node_version: remoteConfig.node_version,
      openclaw_version: remoteConfig.openclaw_version,
      provider_base_url: isCustom
        ? config.customBaseUrl
        : (provider?.base_url || ""),
      provider_name: isCustom ? "custom" : (provider?.name || ""),
      api_key: config.apiKey,
      model: isCustom ? config.customModel : config.model,
      channel_type: config.channel,
      channel_config: config.channelFields,
      install_mode: "native",
    };
  };

  const updateStep = (index: number, updates: Partial<InstallSubStep>) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s)),
    );
  };

  const startInstall = async () => {
    setInstalling(true);
    setError(null);
    setDone(false);
    setSteps(makeInitialSteps());

    const payload = buildPayload();

    for (let i = 0; i < STEP_DEFS.length; i++) {
      updateStep(i, { status: "running" });

      try {
        const result = await invoke<StepResult>(STEP_DEFS[i].command, {
          config: payload,
        });

        updateStep(i, {
          status: result.success ? "done" : "error",
          logs: result.logs,
          message: result.message,
        });

        if (!result.success) {
          setError(result.message);
          setInstalling(false);
          return;
        }

        if (i === STEP_DEFS.length - 1) {
          const urlMatch = result.message.match(/https?:\/\/[^\s]+/);
          if (urlMatch) setGatewayUrl(urlMatch[0]);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        updateStep(i, { status: "error", logs: [msg], message: msg });
        setError(msg);
        setInstalling(false);
        return;
      }
    }

    setDone(true);
    setInstalling(false);
  };

  const allLogs = steps.flatMap((s) => [
    ...(s.status !== "pending" ? [`--- ${s.label} ---`] : []),
    ...s.logs,
    ...(s.message && s.status === "done" ? [`✓ ${s.message}`] : []),
    ...(s.message && s.status === "error" ? [`✗ ${s.message}`] : []),
  ]);

  const doneCount = steps.filter((s) => s.status === "done").length;

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          安装 OpenClaw
        </h2>
        <p className="text-gray-500 mb-6">
          {done
            ? "安装已完成！您可以打开控制台开始使用。"
            : error
              ? "安装过程中出现错误，请检查日志。"
              : installing
                ? "正在安装，请稍候..."
                : "点击开始安装以部署 OpenClaw 到您的系统。"}
        </p>

        {/* Step indicators */}
        <div className="flex gap-1 mb-4">
          {steps.map((step) => (
            <div key={step.id} className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <StepIcon status={step.status} />
                <span
                  className={`text-xs font-medium ${
                    step.status === "running"
                      ? "text-indigo-600"
                      : step.status === "done"
                        ? "text-green-600"
                        : step.status === "error"
                          ? "text-red-600"
                          : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              <div
                className={`h-1 rounded-full ${
                  step.status === "done"
                    ? "bg-green-500"
                    : step.status === "running"
                      ? "bg-indigo-500 animate-pulse"
                      : step.status === "error"
                        ? "bg-red-500"
                        : "bg-gray-200"
                }`}
              />
            </div>
          ))}
        </div>

        {/* Progress summary */}
        <div className="flex justify-between text-xs text-gray-500 mb-2">
          <span>进度</span>
          <span>
            {doneCount}/{steps.length}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 mb-4 overflow-hidden">
          <div
            className="bg-indigo-600 h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>

        {/* Log area */}
        <div
          ref={logRef}
          className="flex-1 min-h-0 bg-gray-900 rounded-xl p-4 overflow-y-auto font-mono text-sm"
        >
          {allLogs.length === 0 ? (
            <span className="text-gray-500">等待开始安装...</span>
          ) : (
            allLogs.map((log, i) => (
              <div
                key={i}
                className={`leading-relaxed ${
                  log.startsWith("---")
                    ? "text-indigo-400 font-semibold mt-2"
                    : log.startsWith("✓")
                      ? "text-green-400"
                      : log.startsWith("✗")
                        ? "text-red-400"
                        : "text-gray-300"
                }`}
              >
                {log}
              </div>
            ))
          )}
        </div>

        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {done && (
          <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm font-medium text-green-800 mb-2">
              安装完成！
            </p>
            <p className="text-sm text-green-700">
              OpenClaw 已成功安装并启动，控制台地址：
              <span className="font-mono font-medium ml-1">{gatewayUrl}</span>
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-between pt-6">
        <Button variant="secondary" onClick={onBack} disabled={installing}>
          上一步
        </Button>
        {done ? (
          <Button onClick={() => invoke("open_url", { url: gatewayUrl })}>
            打开控制台
          </Button>
        ) : error ? (
          <Button onClick={startInstall}>重试安装</Button>
        ) : (
          <Button onClick={startInstall} disabled={installing}>
            {installing ? "安装中..." : "开始安装"}
          </Button>
        )}
      </div>
    </div>
  );
}

function StepIcon({ status }: { status: SubStepStatus }) {
  switch (status) {
    case "running":
      return (
        <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      );
    case "done":
      return (
        <div className="w-3.5 h-3.5 rounded-full bg-green-500 flex items-center justify-center">
          <svg
            className="w-2 h-2 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={4}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
      );
    case "error":
      return (
        <div className="w-3.5 h-3.5 rounded-full bg-red-500 flex items-center justify-center">
          <svg
            className="w-2 h-2 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={4}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
      );
    default:
      return <div className="w-3.5 h-3.5 rounded-full bg-gray-300" />;
  }
}
