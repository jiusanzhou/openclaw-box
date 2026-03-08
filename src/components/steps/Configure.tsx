import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { Input } from "../ui/Input";
import type { InstallerConfig } from "../../lib/types";
import type { RemoteConfig } from "../../lib/api";

interface ConfigureProps {
  config: InstallerConfig;
  remoteConfig: RemoteConfig;
  onChange: (config: InstallerConfig) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Configure({
  config,
  remoteConfig,
  onChange,
  onNext,
  onBack,
}: ConfigureProps) {
  const selectedProvider = remoteConfig.providers.find(
    (p) => p.id === config.provider,
  );
  const isCustom = config.provider === "custom";
  const selectedChannel = remoteConfig.channels.find(
    (c) => c.id === config.channel,
  );

  const hasApiKey = isCustom || config.apiKey.trim().length > 0;
  const hasCustomUrl = !isCustom || config.customBaseUrl.trim().length > 0;
  const hasCustomModel = !isCustom || config.customModel.trim().length > 0;
  const hasRequiredChannelFields = selectedChannel
    ? selectedChannel.fields
        .filter((f) => f.required)
        .every((f) => config.channelFields[f.key]?.trim())
    : true;
  const canProceed =
    hasApiKey && hasCustomUrl && hasCustomModel && hasRequiredChannelFields;

  const handleProviderChange = (providerId: string) => {
    const provider = remoteConfig.providers.find((p) => p.id === providerId);
    onChange({
      ...config,
      provider: providerId,
      model: provider?.default_model || "",
      customBaseUrl: "",
      customModel: "",
    });
  };

  const handleChannelChange = (channelId: string) => {
    onChange({
      ...config,
      channel: channelId,
      channelFields: {},
    });
  };

  const handleChannelFieldChange = (key: string, value: string) => {
    onChange({
      ...config,
      channelFields: { ...config.channelFields, [key]: value },
    });
  };

  const openExternal = (url: string) => {
    invoke("open_url", { url }).catch(console.error);
  };

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex-1 overflow-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">配置选项</h2>
        <p className="text-gray-500 mb-8">
          选择 LLM 服务商并配置接入参数。
        </p>

        <div className="space-y-6 max-w-lg">
          {/* Provider Selection */}
          <div>
            <Select
              label="LLM 服务商"
              value={config.provider}
              options={remoteConfig.providers.map((p) => ({
                id: p.id,
                name: p.name,
              }))}
              onChange={handleProviderChange}
            />
            {selectedProvider && !isCustom && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-xs text-gray-400">
                  接口地址：{selectedProvider.base_url}
                </span>
                {selectedProvider.register_url && (
                  <button
                    type="button"
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                    onClick={() => openExternal(selectedProvider.register_url!)}
                  >
                    去注册 →
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Custom Provider Fields */}
          {isCustom && (
            <>
              <Input
                label="自定义接口地址"
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
          )}

          {/* Model Selection (non-custom) */}
          {!isCustom && selectedProvider && selectedProvider.models.length > 0 && (
            <Select
              label="模型"
              value={config.model}
              options={selectedProvider.models.map((m) => ({
                id: m.id,
                name: m.name,
              }))}
              onChange={(v) => onChange({ ...config, model: v })}
            />
          )}

          {/* API Key */}
          <Input
            label="API Key"
            type="password"
            placeholder="请输入 API Key"
            value={config.apiKey}
            onChange={(e) => onChange({ ...config, apiKey: e.target.value })}
          />

          {/* Channel Section */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              接入渠道
            </h3>

            <Select
              label="渠道类型"
              value={config.channel}
              options={remoteConfig.channels.map((c) => ({
                id: c.id,
                name: c.description ? `${c.name} — ${c.description}` : c.name,
              }))}
              onChange={handleChannelChange}
            />

            {selectedChannel?.help_doc && (
              <div className="mt-1.5">
                <button
                  type="button"
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  onClick={() => openExternal(selectedChannel.help_doc!)}
                >
                  查看配置文档 →
                </button>
              </div>
            )}

            {/* Dynamic Channel Fields */}
            {selectedChannel && selectedChannel.fields.length > 0 && (
              <div className="mt-4 space-y-4">
                {selectedChannel.fields.map((field) => (
                  <Input
                    key={field.key}
                    label={`${field.label}${field.required ? " *" : ""}`}
                    type={field.type || "text"}
                    placeholder={field.placeholder || ""}
                    value={config.channelFields[field.key] || ""}
                    onChange={(e) =>
                      handleChannelFieldChange(field.key, e.target.value)
                    }
                  />
                ))}
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
