import { useState } from "react";
import { Welcome } from "./steps/Welcome";
import { ChooseProvider } from "./steps/ChooseProvider";
import { ConfigureModel } from "./steps/ConfigureModel";
import { ChooseChannel } from "./steps/ChooseChannel";
import { ConfigureChannel } from "./steps/ConfigureChannel";
import { Install } from "./steps/Install";
import type { InstallStep, InstallerConfig } from "../lib/types";
import type { RemoteConfig } from "../lib/api";

const STEPS: { id: InstallStep; label: string }[] = [
  { id: "welcome", label: "欢迎" },
  { id: "choose-provider", label: "服务商" },
  { id: "configure-model", label: "模型" },
  { id: "choose-channel", label: "渠道" },
  { id: "configure-channel", label: "渠道配置" },
  { id: "install", label: "安装" },
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
      <div className="w-48 bg-indigo-900 text-white p-4 flex flex-col">
        <div className="mb-6">
          <h1 className="text-lg font-bold">OpenClaw</h1>
          <p className="text-indigo-300 text-sm">Box</p>
        </div>
        <nav className="space-y-1 flex-1">
          {STEPS.map((step, i) => (
            <div
              key={step.id}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors ${
                step.id === currentStep
                  ? "bg-indigo-700 text-white"
                  : i < currentIndex
                    ? "text-indigo-300"
                    : "text-indigo-400"
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                  i < currentIndex
                    ? "bg-green-500 text-white"
                    : step.id === currentStep
                      ? "bg-white text-indigo-900"
                      : "bg-indigo-800 text-indigo-400"
                }`}
              >
                {i < currentIndex ? (
                  <svg
                    className="w-3 h-3"
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
                ) : (
                  i + 1
                )}
              </div>
              <span className="text-xs font-medium">{step.label}</span>
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
              onNext={() => setCurrentStep("choose-provider")}
            />
          )}
          {currentStep === "choose-provider" && (
            <ChooseProvider
              config={config}
              remoteConfig={remoteConfig}
              onChange={setConfig}
              onNext={() => setCurrentStep("configure-model")}
              onBack={() => setCurrentStep("welcome")}
            />
          )}
          {currentStep === "configure-model" && (
            <ConfigureModel
              config={config}
              remoteConfig={remoteConfig}
              onChange={setConfig}
              onNext={() => setCurrentStep("choose-channel")}
              onBack={() => setCurrentStep("choose-provider")}
              onChangeProvider={() => setCurrentStep("choose-provider")}
            />
          )}
          {currentStep === "choose-channel" && (
            <ChooseChannel
              config={config}
              remoteConfig={remoteConfig}
              onChange={setConfig}
              onNext={() => setCurrentStep("configure-channel")}
              onBack={() => setCurrentStep("configure-model")}
            />
          )}
          {currentStep === "configure-channel" && (
            <ConfigureChannel
              config={config}
              remoteConfig={remoteConfig}
              onChange={setConfig}
              onNext={() => setCurrentStep("install")}
              onBack={() => setCurrentStep("choose-channel")}
            />
          )}
          {currentStep === "install" && (
            <Install
              config={config}
              remoteConfig={remoteConfig}
              onBack={() => setCurrentStep("configure-channel")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
