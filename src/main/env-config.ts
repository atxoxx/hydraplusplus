const PRODUCTION_DEFAULTS: Record<string, string> = {
  MAIN_VITE_API_URL: "https://hydra-api-us-east-1.losbroxas.org",
  MAIN_VITE_AUTH_URL: "https://auth.hydralauncher.gg",
  MAIN_VITE_WS_URL: "wss://ws.hydralauncher.gg",
  MAIN_VITE_CHECKOUT_URL: "https://checkout.hydralauncher.gg",
  MAIN_VITE_EXTERNAL_RESOURCES_URL: "https://assets.hydralauncher.gg",
  MAIN_VITE_NIMBUS_API_URL: "",
  MAIN_VITE_LAUNCHER_SUBDOMAIN: "",
};

function getEnvVar(key: string): string {
  const value = (import.meta.env as Record<string, string>)[key];

  if (value) return value;

  const fallback = PRODUCTION_DEFAULTS[key] ?? "";

  if (fallback) {
    console.warn(
      `Environment variable ${key} is not set, using production fallback: ${fallback}`
    );
  } else {
    console.warn(
      `Environment variable ${key} is not set and no fallback is available`
    );
  }

  return fallback;
}

export const envConfig = {
  apiUrl: getEnvVar("MAIN_VITE_API_URL"),
  authUrl: getEnvVar("MAIN_VITE_AUTH_URL"),
  wsUrl: getEnvVar("MAIN_VITE_WS_URL"),
  checkoutUrl: getEnvVar("MAIN_VITE_CHECKOUT_URL"),
  externalResourcesUrl: getEnvVar("MAIN_VITE_EXTERNAL_RESOURCES_URL"),
  nimbusApiUrl: getEnvVar("MAIN_VITE_NIMBUS_API_URL"),
  launcherSubdomain: getEnvVar("MAIN_VITE_LAUNCHER_SUBDOMAIN"),
};
