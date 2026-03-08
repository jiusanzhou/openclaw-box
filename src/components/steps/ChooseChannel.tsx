import { Button } from "../ui/Button";
import type { InstallerConfig } from "../../lib/types";
import type { RemoteConfig } from "../../lib/api";

interface ChooseChannelProps {
  config: InstallerConfig;
  remoteConfig: RemoteConfig;
  onChange: (config: InstallerConfig) => void;
  onNext: () => void;
  onBack: () => void;
}

const CHANNEL_ICONS: Record<string, string> = {
  web: "\uD83D\uDCBB",
  telegram: "\uD83E\uDD16",
  feishu: "\uD83D\uDC26",
  qq: "\uD83D\uDCAC",
};

const CHANNEL_DESCRIPTIONS: Record<string, string> = {
  web: "\u6700\u7B80\u5355\uFF0C\u63A8\u8350\u65B0\u624B",
  telegram: "\u901A\u8FC7 Telegram Bot \u63A5\u5165",
  feishu: "\u901A\u8FC7\u98DE\u4E66\u673A\u5668\u4EBA\u63A5\u5165",
  qq: "\u901A\u8FC7 QQ \u673A\u5668\u4EBA\u63A5\u5165",
};

export function ChooseChannel({
  config,
  remoteConfig,
  onChange,
  onNext,
  onBack,
}: ChooseChannelProps) {
  const handleSelect = (channelId: string) => {
    onChange({
      ...config,
      channel: channelId,
      channelFields: {},
    });
  };

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex-1 overflow-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          选择接入渠道
        </h2>
        <p className="text-gray-500 mb-6">
          选择你希望通过哪种方式使用智能助手。
        </p>

        <div className="grid grid-cols-2 gap-4 max-w-xl">
          {remoteConfig.channels.map((channel) => {
            const isSelected = config.channel === channel.id;
            const icon = CHANNEL_ICONS[channel.id] || "\u2699\uFE0F";
            const desc =
              channel.description || CHANNEL_DESCRIPTIONS[channel.id] || "";

            return (
              <button
                key={channel.id}
                type="button"
                onClick={() => handleSelect(channel.id)}
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

                {channel.is_default && (
                  <span className="absolute top-3 right-3 text-[10px] font-semibold bg-indigo-500 text-white px-1.5 py-0.5 rounded" style={isSelected ? { right: '2rem' } : {}}>
                    推荐
                  </span>
                )}

                <div className="text-2xl mb-2">{icon}</div>
                <div className="text-base font-semibold text-gray-900 mb-1">
                  {channel.name}
                </div>
                <p className="text-xs text-gray-500">{desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-between pt-6">
        <Button variant="secondary" onClick={onBack}>
          上一步
        </Button>
        <Button onClick={onNext} disabled={!config.channel}>
          下一步
        </Button>
      </div>
    </div>
  );
}
