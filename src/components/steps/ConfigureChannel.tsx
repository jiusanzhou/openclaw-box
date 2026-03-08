import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { InstallerConfig } from "../../lib/types";
import type { RemoteConfig } from "../../lib/api";

interface ConfigureChannelProps {
  config: InstallerConfig;
  remoteConfig: RemoteConfig;
  onChange: (config: InstallerConfig) => void;
  onNext: () => void;
  onBack: () => void;
}

export function ConfigureChannel({
  config,
  remoteConfig,
  onChange,
  onNext,
  onBack,
}: ConfigureChannelProps) {
  const selectedChannel = remoteConfig.channels.find(
    (c) => c.id === config.channel,
  );

  const hasFields = selectedChannel && selectedChannel.fields.length > 0;

  const hasRequiredChannelFields = selectedChannel
    ? selectedChannel.fields
        .filter((f) => f.required)
        .every((f) => config.channelFields[f.key]?.trim())
    : true;

  const canProceed = !hasFields || hasRequiredChannelFields;

  const handleFieldChange = (key: string, value: string) => {
    onChange({
      ...config,
      channelFields: { ...config.channelFields, [key]: value },
    });
  };

  const openExternal = (url: string) => {
    invoke("open_url", { url }).catch(console.error);
  };

  // No fields needed — show success message
  if (!hasFields) {
    return (
      <div className="p-8 h-full flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-6xl mb-4">&#x2705;</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            无需额外配置
          </h2>
          <p className="text-gray-500 text-center">
            Web 界面开箱即用，安装完成后即可通过浏览器访问。
          </p>
        </div>

        <div className="flex justify-between pt-6">
          <Button variant="secondary" onClick={onBack}>
            上一步
          </Button>
          <Button onClick={onNext}>下一步</Button>
        </div>
      </div>
    );
  }

  // Has fields — render dynamic form
  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex-1 overflow-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          配置{selectedChannel?.name || "渠道"}
        </h2>
        <p className="text-gray-500 mb-8">
          填写接入渠道所需的配置信息。
        </p>

        <div className="space-y-5 max-w-lg">
          {selectedChannel?.fields.map((field) => (
            <Input
              key={field.key}
              label={`${field.label}${field.required ? " *" : ""}`}
              type={field.type || "text"}
              placeholder={field.placeholder || ""}
              value={config.channelFields[field.key] || ""}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
            />
          ))}

          {selectedChannel?.help_doc && (
            <button
              type="button"
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              onClick={() => openExternal(selectedChannel.help_doc!)}
            >
              查看配置教程 →
            </button>
          )}
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
