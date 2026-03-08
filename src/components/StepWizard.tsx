import { useState } from "react";
import { Welcome } from "./steps/Welcome";
import { Configure } from "./steps/Configure";
import { Install } from "./steps/Install";
import type { InstallStep, InstallerConfig } from "../lib/types";
import type { RemoteConfig } from "../lib/api";

const STEPS: { id: InstallStep; label: string; number: number }[] = [
  { id: "welcome", label: "欢迎", number: 1 },
  { id: "configure", label: "配置", number: 2 },
  { id: "install", label: "安装", number: 3 },
];

interface StepWizardProps {
  remoteConfig: RemoteConfig;
}

export function StepWizard({ remoteConfig }: StepWizardProps) {
  const [currentStep, setCurrentStep] = useState<InstallStep>("welcome");

  const defaultChannel =
    remoteConfig.channels.find((c) => c.is_default)?.id ||
    remoteConfig.channels[0]?.id ||
    "web";
  const defaultProvider = remoteConfig.providers[0]?.id || "deepseek";
  const defaultModel = remoteConfig.providers[0]?.default_model || "";

  const [config, setConfig] = useState<InstallerConfig>({
    provider: defaultProvider,
    apiKey: "",
    model: defaultModel,
    customBaseUrl: "",
    customModel: "",
    channel: defaultChannel,
    channelFields: {},
  });

  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-56 bg-indigo-900 text-white p-6 flex flex-col">
        <div className="mb-8">
          <h1 className="text-lg font-bold">OpenClaw</h1>
          <p className="text-indigo-300 text-sm">Box</p>
        </div>
        <nav className="space-y-2 flex-1">
          {STEPS.map((step, i) => (
            <div
              key={step.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                step.id === currentStep
                  ? "bg-indigo-700 text-white"
                  : i < currentIndex
                    ? "text-indigo-300"
                    : "text-indigo-400"
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium ${
                  i < currentIndex
                    ? "bg-indigo-500 text-white"
                    : step.id === currentStep
                      ? "bg-white text-indigo-900"
                      : "bg-indigo-800 text-indigo-400"
                }`}
              >
                {i < currentIndex ? "✓" : step.number}
              </div>
              <span className="text-sm font-medium">{step.label}</span>
            </div>
          ))}
        </nav>
        <div className="text-indigo-400 text-xs">v0.1.0</div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto flex flex-col">
        {remoteConfig.announcement && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-sm text-amber-800">
            {remoteConfig.announcement}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {currentStep === "welcome" && (
            <Welcome
              remoteConfig={remoteConfig}
              onNext={() => setCurrentStep("configure")}
            />
          )}
          {currentStep === "configure" && (
            <Configure
              config={config}
              remoteConfig={remoteConfig}
              onChange={setConfig}
              onNext={() => setCurrentStep("install")}
              onBack={() => setCurrentStep("welcome")}
            />
          )}
          {currentStep === "install" && (
            <Install
              config={config}
              remoteConfig={remoteConfig}
              onBack={() => setCurrentStep("configure")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
