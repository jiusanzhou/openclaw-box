import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";
import type { InstallerConfig } from "../../lib/types";
import type { RemoteConfig } from "../../lib/api";

interface ChooseProviderProps {
  config: InstallerConfig;
  remoteConfig: RemoteConfig;
  onChange: (config: InstallerConfig) => void;
  onNext: () => void;
  onBack: () => void;
}

export function ChooseProvider({
  config,
  remoteConfig,
  onChange,
  onNext,
  onBack,
}: ChooseProviderProps) {
  const handleSelect = (providerId: string) => {
    const provider = remoteConfig.providers.find((p) => p.id === providerId);
    onChange({
      ...config,
      provider: providerId,
      model: provider?.default_model || "",
      customBaseUrl: "",
      customModel: "",
    });
  };

  const openExternal = (url: string) => {
    invoke("open_url", { url }).catch(console.error);
  };

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex-1 overflow-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          选择 LLM 服务商
        </h2>
        <p className="text-gray-500 mb-6">
          选择一个 AI 模型服务商，用于驱动你的智能助手。
        </p>

        <div className="grid grid-cols-2 gap-4 max-w-xl">
          {remoteConfig.providers.map((provider) => {
            const isSelected = config.provider === provider.id;
            const isCustom = provider.id === "custom";

            return (
              <button
                key={provider.id}
                type="button"
                onClick={() => handleSelect(provider.id)}
                className={`relative text-left p-4 rounded-xl border-2 transition-all duration-200 hover:shadow-md hover:scale-[1.02] ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                    <svg
                      className="w-3 h-3 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}

                <div className="text-base font-semibold text-gray-900 mb-1">
                  {provider.name}
                </div>

                {isCustom ? (
                  <p className="text-xs text-gray-500 leading-relaxed">
                    使用任意 OpenAI 兼容接口
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-gray-400 truncate mb-2">
                      {provider.base_url}
                    </p>
                    {provider.register_url && (
                      <span
                        role="button"
                        tabIndex={0}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                        onClick={(e) => {
                          e.stopPropagation();
                          openExternal(provider.register_url!);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.stopPropagation();
                            openExternal(provider.register_url!);
                          }
                        }}
                      >
                        去注册 →
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-between pt-6">
        <Button variant="secondary" onClick={onBack}>
          上一步
        </Button>
        <Button onClick={onNext} disabled={!config.provider}>
          下一步
        </Button>
      </div>
    </div>
  );
}
