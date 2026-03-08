import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import type { InstallerConfig, StepResult } from "../../lib/types";
import type { RemoteConfig } from "../../lib/api";

interface ConfigureModelProps {
  config: InstallerConfig;
  remoteConfig: RemoteConfig;
  onChange: (config: InstallerConfig) => void;
  onNext: () => void;
  onBack: () => void;
  onChangeProvider: () => void;
}

export function ConfigureModel({
  config,
  remoteConfig,
  onChange,
  onNext,
  onBack,
  onChangeProvider,
}: ConfigureModelProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const selectedProvider = remoteConfig.providers.find(
    (p) => p.id === config.provider,
  );
  const isCustom = config.provider === "custom";

  const sortedModels = useMemo(() => {
    if (!selectedProvider) return [];
    return [...selectedProvider.models].sort((a, b) => {
      const af = a.free ? 1 : 0;
      const bf = b.free ? 1 : 0;
      return bf - af;
    });
  }, [selectedProvider]);

  const selectedModel = selectedProvider?.models.find(
    (m) => m.id === config.model,
  );
  const allFree =
    selectedProvider != null &&
    selectedProvider.models.length > 0 &&
    selectedProvider.models.every((m) => m.free);

  const hasApiKey = isCustom || config.apiKey.trim().length > 0;
  const hasCustomUrl = !isCustom || config.customBaseUrl.trim().length > 0;
  const hasCustomModel = !isCustom || config.customModel.trim().length > 0;
  const canProceed = hasApiKey && hasCustomUrl && hasCustomModel;

  const baseUrl = isCustom
    ? config.customBaseUrl
    : (selectedProvider?.base_url || "");

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await invoke<StepResult>("test_api_connection", {
        baseUrl,
        apiKey: config.apiKey,
      });
      setTestResult({ success: result.success, message: result.message });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestResult({ success: false, message: msg });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex-1 overflow-auto">
        <div className="flex items-baseline gap-3 mb-2">
          <h2 className="text-2xl font-bold text-gray-900">配置模型</h2>
          <span className="text-sm text-gray-500">
            {selectedProvider?.name || "自定义"}
          </span>
          <button
            type="button"
            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
            onClick={onChangeProvider}
          >
            更换
          </button>
        </div>
        <p className="text-gray-500 mb-8">
          配置模型和 API Key 以连接服务商。
        </p>

        <div className="space-y-5 max-w-lg">
          {isCustom ? (
            <>
              <Input
                label="接口地址 (Base URL)"
                placeholder="https://api.example.com/v1"
                value={config.customBaseUrl}
                onChange={(e) =>
                  onChange({ ...config, customBaseUrl: e.target.value })
                }
              />
              <Input
                label="模型名称"
                placeholder="模型 ID，如 gpt-4o"
                value={config.customModel}
                onChange={(e) =>
                  onChange({ ...config, customModel: e.target.value })
                }
              />
            </>
          ) : (
            selectedProvider &&
            selectedProvider.models.length > 0 && (
              <Select
                label="模型"
                value={config.model}
                options={sortedModels.map((m) => ({
                  id: m.id,
                  name: m.free ? `${m.name}（免费）` : m.name,
                }))}
                onChange={(v) => onChange({ ...config, model: v })}
              />
            )
          )}

          {!isCustom && selectedModel?.free && (
            <div className="text-sm px-3 py-2 rounded-lg bg-green-50 text-green-700 border border-green-200">
              当前选择的模型可免费使用
            </div>
          )}

          {!isCustom && selectedProvider?.free_tier && (
            <p className="text-xs text-gray-500">
              {selectedProvider.free_tier}
            </p>
          )}

          <div>
            <Input
              label="API Key"
              type="password"
              placeholder="请输入 API Key"
              value={config.apiKey}
              onChange={(e) => onChange({ ...config, apiKey: e.target.value })}
            />
            {!isCustom && allFree && (
              <p className="mt-1 text-xs text-gray-500">
                需要注册获取 API Key（免费）
              </p>
            )}
          </div>

          {/* Test connection */}
          <div>
            <button
              type="button"
              disabled={testing || !config.apiKey.trim() || (isCustom && !config.customBaseUrl.trim())}
              onClick={handleTestConnection}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {testing && (
                <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              )}
              {testing ? "测试中..." : "测试连接"}
            </button>

            {testResult && (
              <div
                className={`mt-2 text-sm px-3 py-2 rounded-lg ${
                  testResult.success
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {testResult.success ? "连接成功" : testResult.message}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-6">
        <Button variant="secondary" onClick={onBack}>
          上一步
        </Button>
        <Button onClick={onNext} disabled={!canProceed}>
          下一步
        </Button>
      </div>
    </div>
  );
}
