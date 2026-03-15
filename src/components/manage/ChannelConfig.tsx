import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { StepResult, ChannelTypeInfo } from "../../lib/types";

// Helper to safely check extra props
function extraBool(extra: Record<string, unknown>, key: string): boolean | undefined {
  return key in extra ? Boolean(extra[key]) : undefined;
}
function extraStr(extra: Record<string, unknown>, key: string): string | undefined {
  return key in extra ? String(extra[key]) : undefined;
}
import type { RemoteConfig } from "../../lib/api";

interface ChannelConfigProps {
  remoteConfig: RemoteConfig;
}

export function ChannelConfig({ remoteConfig }: ChannelConfigProps) {
  const [channels, setChannels] = useState<ChannelTypeInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // New channel form
  const [showAdd, setShowAdd] = useState(false);
  const [configYaml, setConfigYaml] = useState("");
  const [channelType, setChannelType] = useState("");
  const [channelFields, setChannelFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadChannels = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<ChannelTypeInfo[]>("get_channels_config");
      setChannels(data);
    } catch {
      setChannels([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadChannels();
    invoke<string>("read_openclaw_config").then(setConfigYaml).catch(() => {});
  }, [loadChannels]);

  const selectedChannel = remoteConfig.channels.find((c) => c.id === channelType);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const channelConfig = Object.entries(channelFields)
        .filter(([, v]) => v.trim())
        .map(([k, v]) => `    ${k}: "${v}"`)
        .join("\n");
      const newYaml = `${configYaml}\nchannel:\n  type: "${channelType}"\n${channelConfig}`;
      await invoke<StepResult>("write_openclaw_config", { content: newYaml });
      setConfigYaml(newYaml);
      setMessage({ type: "success", text: "渠道配置已保存，需重启 Gateway 生效" });
      loadChannels();
    } catch (e) {
      setMessage({ type: "error", text: `保存失败: ${e}` });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">渠道配置</h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          {showAdd ? "收起" : "+ 新增渠道"}
        </button>
      </div>

      {/* Existing channels */}
      {channels.length > 0 ? (
        <div className="space-y-4">
          {channels.map((ch) => (
            <div key={ch.channel_type} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800 capitalize">{ch.channel_type}</span>
                  {extraBool(ch.extra, "enabled") !== undefined && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      extraBool(ch.extra, "enabled") ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {extraBool(ch.extra, "enabled") ? "已启用" : "已禁用"}
                    </span>
                  )}
                  {ch.accounts.length > 0 && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {ch.accounts.length} 个账号
                    </span>
                  )}
                </div>
              </div>

              {/* Bindings */}
              {ch.bindings.length > 0 && (
                <div className="space-y-1.5">
                  {ch.bindings.map((b, idx) => (
                    <div key={`${b.agent_id}-${idx}`} className="flex items-center gap-2 text-xs">
                      <span className="text-green-600">●</span>
                      <span className="font-medium text-gray-700">{b.agent_id}</span>
                      <span className="text-gray-400">→</span>
                      <span className="text-gray-500">{b.match_details}</span>
                    </div>
                  ))}
                </div>
              )}

              {ch.bindings.length === 0 && (
                <p className="text-xs text-gray-400">未绑定任何智能体</p>
              )}

              {/* Extra config info */}
              {(extraStr(ch.extra, "httpUrl") || extraStr(ch.extra, "wsUrl")) && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex gap-4">
                  {extraStr(ch.extra, "httpUrl") && (
                    <span className="text-xs text-gray-400 font-mono">{extraStr(ch.extra, "httpUrl")}</span>
                  )}
                  {extraStr(ch.extra, "wsUrl") && (
                    <span className="text-xs text-gray-400 font-mono">{extraStr(ch.extra, "wsUrl")}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <div className="text-4xl mb-3">🔗</div>
          <p className="text-gray-500">暂无渠道配置</p>
          <p className="text-xs text-gray-400 mt-1">点击「新增渠道」开始配置</p>
        </div>
      )}

      {/* Add new channel form */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-indigo-200 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">新增渠道</h3>

          <div className="grid grid-cols-3 gap-3">
            {remoteConfig.channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => {
                  setChannelType(ch.id);
                  setChannelFields({});
                }}
                className={`p-3 rounded-lg border-2 text-left transition-colors ${
                  channelType === ch.id
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <p className="text-sm font-medium text-gray-900">{ch.name}</p>
                {ch.description && <p className="text-xs text-gray-500 mt-0.5">{ch.description}</p>}
              </button>
            ))}
          </div>

          {selectedChannel && (
            <div className="space-y-3 pt-2">
              {selectedChannel.fields.map((f) => (
                <Input
                  key={f.key}
                  label={f.label}
                  value={channelFields[f.key] || ""}
                  onChange={(e) => setChannelFields({ ...channelFields, [f.key]: e.target.value })}
                  placeholder={f.placeholder || ""}
                  type={f.type === "password" ? "password" : "text"}
                />
              ))}

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "保存中..." : "保存渠道"}
                </Button>
              </div>
            </div>
          )}

          {message && (
            <div className={`p-3 rounded-lg text-sm ${
              message.type === "success"
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}>
              {message.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
