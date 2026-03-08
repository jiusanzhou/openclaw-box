import { useEffect, useState } from "react";
import { StepWizard } from "./components/StepWizard";
import {
  loadAllConfig,
  buildFreePublicProvider,
  type RemoteConfig,
} from "./lib/api";

export default function App() {
  const [remoteConfig, setRemoteConfig] = useState<RemoteConfig | null>(null);

  useEffect(() => {
    loadAllConfig().then(({ config, freeEndpoints }) => {
      const freeProvider = buildFreePublicProvider(freeEndpoints);
      setRemoteConfig({
        ...config,
        providers: [freeProvider, ...config.providers],
      });
    });
  }, []);

  if (!remoteConfig) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-gray-500">正在加载配置...</p>
        </div>
      </div>
    );
  }

  return <StepWizard remoteConfig={remoteConfig} />;
}
