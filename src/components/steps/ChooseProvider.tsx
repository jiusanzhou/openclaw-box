import { useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";
import type { InstallerConfig } from "../../lib/types";
import type { RemoteConfig, ProviderConfig } from "../../lib/api";

function badgeStyle(badge: string): string {
  if (badge === "推荐新手") return "bg-green-100 text-green-700";
  if (badge === "免费额度" || badge === "有免费模型")
    return "bg-orange-100 text-orange-700";
  return "bg-blue-100 text-blue-700";
}

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
  const freePublicProvider = useMemo(
    () => remoteConfig.providers.find((p) => p.is_free_public),
    [remoteConfig.providers],
  );

  const sortedProviders = useMemo(() => {
    return [...remoteConfig.providers]
      .filter((p) => !p.is_free_public)
      .sort((a: ProviderConfig, b: ProviderConfig) => {
        const aHas = a.badge ? 1 : 0;
        const bHas = b.badge ? 1 : 0;
        return bHas - aHas;
      });
  }, [remoteConfig.providers]);

  const handleSelect = (providerId: string) => {
    const provider = remoteConfig.providers.find((p) => p.id === providerId);
    if (provider?.is_free_public) {
      const firstEndpoint = provider.endpoints?.[0];
      onChange({
        ...config,
        provider: providerId,
        selectedEndpoint: firstEndpoint?.id || "",
        model: firstEndpoint?.default_model || "",
        customBaseUrl: "",
        customModel: "",
      });
    } else {
      onChange({
        ...config,
        provider: providerId,
        selectedEndpoint: undefined,
        model: provider?.default_model || "",
        customBaseUrl: "",
        customModel: "",
      });
    }
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
          {freePublicProvider && (() => {
            const isSelected = config.provider === freePublicProvider.id;
            return (
              <button
                key={freePublicProvider.id}
                type="button"
                onClick={() => handleSelect(freePublicProvider.id)}
                className={`col-span-2 relative text-left p-5 rounded-xl border-2 transition-all duration-200 hover:shadow-lg hover:scale-[1.01] ${
                  isSelected
                    ? "border-purple-400 bg-gradient-to-r from-purple-600 to-indigo-600"
                    : "border-purple-200 bg-gradient-to-br from-purple-50 via-indigo-50 to-blue-50 hover:border-purple-300 hover:shadow-purple-100"
                }`}
              >
                {freePublicProvider.badge && !isSelected && (
                  <span className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-300">
                    {freePublicProvider.badge}
                  </span>
                )}

                {isSelected && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-white flex items-center justify-center">
                    <svg
                      className="w-3 h-3 text-purple-600"
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

                <div
                  className={`text-lg font-bold mb-1 ${
                    isSelected ? "text-white" : "text-gray-900"
                  }`}
                >
                  🚀 免费体验
                </div>
                {freePublicProvider.free_tier && (
                  <p
                    className={`text-sm ${
                      isSelected ? "text-purple-100" : "text-purple-600"
                    }`}
                  >
                    {freePublicProvider.free_tier}
                  </p>
                )}
              </button>
            );
          })()}

          {sortedProviders.map((provider) => {
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
                    : provider.free_tier
                      ? "border-gray-200 bg-gradient-to-br from-white to-green-50/50 hover:border-green-300"
                      : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                {provider.badge && !isSelected && (
                  <span
                    className={`absolute top-2 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badgeStyle(provider.badge)}`}
                  >
                    {provider.badge}
                  </span>
                )}

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

                <div className="text-base font-semibold text-gray-900 mb-0.5">
                  {provider.name}
                </div>

                {provider.free_tier && (
                  <p className="text-[11px] text-green-600 mb-1.5 leading-snug">
                    {provider.free_tier}
                  </p>
                )}

                {isCustom ? (
                  <p className="text-xs text-gray-500 leading-relaxed">
                    使用任意 OpenAI 兼容接口
                  </p>
                ) : (
                  <>
                    {!provider.free_tier && (
                      <p className="text-xs text-gray-400 truncate mb-2">
                        {provider.base_url}
                      </p>
                    )}
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
