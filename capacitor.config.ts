import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "es.ximosai.estudiocar",
  appName: "XIMOSAI Estudio Car",
  webDir: "dist/client",
  android: {
    allowMixedContent: false,
  },
};

export default config;
