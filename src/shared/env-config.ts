const PRODUCTION_DEFAULTS: Record<string, string> = {
  RENDERER_VITE_EXTERNAL_RESOURCES_URL: "https://assets.hydralauncher.gg",
  RENDERER_VITE_SENTRY_DSN: "",
  RENDERER_VITE_REAL_DEBRID_REFERRAL_ID: "",
  RENDERER_VITE_TORBOX_REFERRAL_CODE: "",
};

export function getRendererEnv(key: string): string {
  return (import.meta.env as Record<string, string>)[key] ?? PRODUCTION_DEFAULTS[key] ?? "";
}
