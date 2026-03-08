import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { StepResult } from "../../lib/types";
import type { RemoteConfig } from "../../lib/api";

interface ChannelConfigProps {
  remoteConfig: RemoteConfig;
}

export function ChannelConfig({ remoteConfig }: ChannelConfigProps) {
  const [configYaml, setConfigYaml] = useState("");
  const [channelType, setChannelType] = useState("");
  const [channelFields, setChannelFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    invoke<string>("read_openclaw_config")
      .then((yaml) => {
        setConfigYaml(yaml);
        parseChannel(yaml);
      })
      .catch(() => {});
  }, []);

  const parseChannel = (yaml: string) => {
    const lines = yaml.split("\n");
    let inChannel = false;
    const fields: Record<string, string> = {};
    for (const line of lines) {
      if (line.startsWith("channel:")) {
        inChannel = true;
        continue;
      }
      if (inChannel && line.match(/^\S/)) {
        inChannel = false;
        continue;
      }
      if (inChannel) {
        const trimmed = line.trim();
        if (trimmed.startsWith("type:")) {
          setChannelType(trimmed.replace("type:", "").trim().replace(/"/g, ""));
        } else {
          const match = trimmed.match(/^(\w+):\s*"?([^"]*)"?$/);
          if (match) {
            fields[match[1]] = match[2];
          }
        }
      }
    }
    setChannelFields(fields);
  };

  const selectedChannel = remoteConfig.channels.find((c) => c.id === channelType);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      // Rebuild channel section in yaml
      let updated = configYaml;
      // Replace entire channel block
      const channelRegex = /channel:\n([\s\S]*?)(?=\n\S|\n*$)/;
      let channelBlock = `channel:\n  type: "${channelType}"\n`;
      for (const [key, value] of Object.entries(channelFields)) {
        channelBlock += `  ${key}: "${value}"\n`;
      }
      if (channelRegex.test(updated)) {
        updated = updated.replace(channelRegex, channelBlock.trimEnd());
      }
      await invoke<StepResult>("write_openclaw_config", { content: updated });
      setConfigYaml(updated);
      setMessage({ type: "success", text: "渠道配置已保存" });
    } catch (e) {
      setMessage({ type: "error", text: `保存失败: ${e}` });
    }
    setSaving(false);
  };

  return (
    <div className="p-8 space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">渠道配置</h2>

      {/* Channel Selection */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">选择渠道</h3>
        <div className="grid grid-cols-2 gap-3">
          {remoteConfig.channels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => {
                setChannelType(ch.id);
                setChannelFields({});
              }}
              className={`p-4 rounded-lg border-2 text-left transition-colors ${
                channelType === ch.id
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <p className="text-sm font-medium text-gray-900">{ch.name}</p>
              {ch.description && (
                <p className="text-xs text-gray-500 mt-1">{ch.description}</p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Channel Fields */}
      {selectedChannel && selectedChannel.fields.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">渠道参数</h3>
          {selectedChannel.fields.map((field) => (
            <Input
              key={field.key}
              label={field.label + (field.required ? " *" : "")}
              value={channelFields[field.key] || ""}
              onChange={(e) => setChannelFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
              placeholder={field.placeholder || ""}
              type={field.type || "text"}
            />
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "保存配置"}
        </Button>
      </div>

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
  );
}
