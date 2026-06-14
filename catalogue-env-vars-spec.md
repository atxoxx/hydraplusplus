# Spec: Fix Catalogue / API Calls Failing in Production Builds Due to Missing Environment Variables

## Problem Summary

After fixing the startup crash (`isStaging` reading `.includes()` on `undefined`), the app now launches successfully in production builds. However, the catalogue page shows skeleton loading forever, and **all API-dependent features are completely broken** (home page, game details, catalogue, achievements, cloud, auth, etc.).

## Root Cause

When building with `yarn build:win` without setting environment variables, all `MAIN_VITE_*` and `RENDERER_VITE_*` variables resolve to `undefined` in the built app. The Hydra docs at [docs.hydralauncher.gg/getting-started](https://docs.hydralauncher.gg/getting-started) **already document** that a `.env` file is required, but:

1. There is **no `.env.example` file** in the repository (the docs reference one that doesn't exist)
2. There are **no code-level fallbacks** — when env vars are `undefined`, the app silently fails instead of warning the user
3. Local builders who don't read the docs hit this silently

### Actual Production URLs (from official docs)

| Variable | Production URL |
|---|---|
| `MAIN_VITE_API_URL` | `https://hydra-api-us-east-1.losbroxas.org` |
| `MAIN_VITE_AUTH_URL` | `https://auth.hydralauncher.gg` |
| `MAIN_VITE_WS_URL` | `wss://ws.hydralauncher.gg` |
| `MAIN_VITE_CHECKOUT_URL` | `https://checkout.hydralauncher.gg` |
| `MAIN_VITE_EXTERNAL_RESOURCES_URL` | `https://assets.hydralauncher.gg` |
| `RENDERER_VITE_EXTERNAL_RESOURCES_URL` | `https://assets.hydralauncher.gg` |
| `MAIN_VITE_NIMBUS_API_URL` | (not in docs — GitHub vars only) |
| `MAIN_VITE_LAUNCHER_SUBDOMAIN` | (not in docs — release-only) |

### How the Failure Manifests

**For `MAIN_VITE_API_URL` (critical):**
```ts
// src/main/services/hydra-api.ts:134
this.instance = axios.create({
  baseURL: import.meta.env.MAIN_VITE_API_URL,  // undefined without .env
});
```
`axios.create({ baseURL: undefined })` doesn't crash — it makes requests to the current origin, which fails in Electron's main process. The renderer receives errors silently and stays in loading state.

**For `RENDERER_VITE_EXTERNAL_RESOURCES_URL`:**
```ts
// src/renderer/src/hooks/use-catalogue.ts:9
export const externalResourcesInstance = axios.create({
  baseURL: import.meta.env.RENDERER_VITE_EXTERNAL_RESOURCES_URL,  // undefined
});
```
Filter metadata (genres, tags, publishers, developers) never loads.

## User's Design Decisions

From the interview (3 rounds, 8 questions answered):
- **Scope:** Full fix — code-level defenses + `.env.example`
- **Missing env vars behavior:** Warn at startup (via console warnings) but don't block the app from running
- **Defaults:** Use production API URLs as hardcoded fallback values
- **Platform:** Windows (but fix applies cross-platform)
- **Build:** `yarn build:win`

## Implementation Plan

### Step 1: Create centralized env config (`src/main/env-config.ts`)

Create a single source of truth for all environment variables with fallback values and warnings:

```ts
// src/main/env-config.ts
import { logger } from "./services/logger";

const PRODUCTION_DEFAULTS = {
  MAIN_VITE_API_URL: "https://hydra-api-us-east-1.losbroxas.org",
  MAIN_VITE_AUTH_URL: "https://auth.hydralauncher.gg",
  MAIN_VITE_WS_URL: "wss://ws.hydralauncher.gg",
  MAIN_VITE_CHECKOUT_URL: "https://checkout.hydralauncher.gg",
  MAIN_VITE_EXTERNAL_RESOURCES_URL: "https://assets.hydralauncher.gg",
  MAIN_VITE_NIMBUS_API_URL: "",
  MAIN_VITE_LAUNCHER_SUBDOMAIN: "",
} as const;

function getEnvVar(key: string): string {
  const value = (import.meta.env as Record<string, string>)[key];
  if (value) return value;
  
  const fallback = (PRODUCTION_DEFAULTS as Record<string, string>)[key] ?? "";
  if (fallback) {
    logger.warn(`Env var ${key} not set, using production fallback: ${fallback}`);
  } else {
    logger.warn(`Env var ${key} not set and no fallback available`);
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
```

### Step 2: Replace all `import.meta.env.MAIN_VITE_*` with `envConfig`

**Files to update (main process):**

| File | Current Usage | Replace With |
|---|---|---|
| `src/main/constants.ts:7` | `import.meta.env.MAIN_VITE_API_URL?.includes("staging")` | `envConfig.apiUrl.includes("staging")` |
| `src/main/services/hydra-api.ts:134` | `baseURL: import.meta.env.MAIN_VITE_API_URL` | `baseURL: envConfig.apiUrl` |
| `src/main/services/ws/ws-client.ts:24` | `new WebSocket(import.meta.env.MAIN_VITE_WS_URL, ...)` | `new WebSocket(envConfig.wsUrl, ...)` |
| `src/main/services/window-manager.ts:72-76` | `import.meta.env.MAIN_VITE_LAUNCHER_SUBDOMAIN` | `envConfig.launcherSubdomain` |
| `src/main/services/window-manager.ts:483` | `import.meta.env.MAIN_VITE_AUTH_URL` | `envConfig.authUrl` |
| `src/main/services/hosters/vikingfile.ts:12` | `import.meta.env.MAIN_VITE_NIMBUS_API_URL` | `envConfig.nimbusApiUrl` |
| `src/main/events/index.ts:32` | `import.meta.env.MAIN_VITE_CHECKOUT_URL` | `envConfig.checkoutUrl` |
| `src/main/services/process-watcher.ts:88` | `import.meta.env.MAIN_VITE_EXTERNAL_RESOURCES_URL` | `envConfig.externalResourcesUrl` |

### Step 3: Create centralized renderer env config

Create `src/shared/env-config.ts` (accessible from both renderer and Big Picture):

```ts
const RENDERER_PRODUCTION_DEFAULTS = {
  RENDERER_VITE_EXTERNAL_RESOURCES_URL: "https://assets.hydralauncher.gg",
  RENDERER_VITE_SENTRY_DSN: "",
  RENDERER_VITE_REAL_DEBRID_REFERRAL_ID: "",
  RENDERER_VITE_TORBOX_REFERRAL_CODE: "",
} as const;
```

**Files to update (renderer):**

| File | Current Usage |
|---|---|
| `src/renderer/src/hooks/use-catalogue.ts:9` | `import.meta.env.RENDERER_VITE_EXTERNAL_RESOURCES_URL` |
| `src/renderer/src/app.tsx:263` | `import.meta.env.RENDERER_VITE_EXTERNAL_RESOURCES_URL` |
| `src/renderer/src/main.tsx:54` | `import.meta.env.RENDERER_VITE_SENTRY_DSN` |
| `src/renderer/src/pages/settings/settings-torbox.tsx:12` | `import.meta.env.RENDERER_VITE_TORBOX_REFERRAL_CODE` |
| `src/renderer/src/pages/settings/settings-real-debrid.tsx:12-13` | `import.meta.env.RENDERER_VITE_REAL_DEBRID_REFERRAL_ID` |
| `src/big-picture/src/pages/catalogue/use-catalogue-data.ts:191` | `import.meta.env.RENDERER_VITE_EXTERNAL_RESOURCES_URL` |

### Step 4: Create `.env.example`

```
# Hydra Launcher Environment Variables
# Copy this file to .env and fill in the values.
# See https://docs.hydralauncher.gg/getting-started for details.

# --- Required: Hydra API ---
MAIN_VITE_API_URL=https://hydra-api-us-east-1.losbroxas.org
MAIN_VITE_AUTH_URL=https://auth.hydralauncher.gg
MAIN_VITE_WS_URL=wss://ws.hydralauncher.gg
MAIN_VITE_CHECKOUT_URL=https://checkout.hydralauncher.gg
MAIN_VITE_EXTERNAL_RESOURCES_URL=https://assets.hydralauncher.gg
RENDERER_VITE_EXTERNAL_RESOURCES_URL=https://assets.hydralauncher.gg

# --- Optional ---
# MAIN_VITE_NIMBUS_API_URL=
# MAIN_VITE_LAUNCHER_SUBDOMAIN=
# RENDERER_VITE_SENTRY_DSN=
# RENDERER_VITE_REAL_DEBRID_REFERRAL_ID=
# RENDERER_VITE_TORBOX_REFERRAL_CODE=
```

## Out of Scope / Future Considerations

- `MAIN_VITE_ANALYTICS_API_URL` — not used in codebase currently
- `MAIN_VITE_NIMBUS_API_URL` — not documented publicly, GitHub vars only; leave empty fallback
- `MAIN_VITE_LAUNCHER_SUBDOMAIN` — release-only feature; empty fallback is fine (falls through to local file loading)
- `RENDERER_VITE_SENTRY_DSN` — Sentry handles undefined DSN gracefully (just won't report)
- `RENDERER_VITE_REAL_DEBRID_REFERRAL_ID` / `RENDERER_VITE_TORBOX_REFERRAL_CODE` — optional, empty string fallback works (links just go to base URLs)

## Files Changed Summary

| File | Change |
|---|---|
| `src/main/env-config.ts` | **NEW** — centralized env var access with production fallbacks and warnings |
| `src/main/constants.ts` | Use `envConfig.apiUrl` instead of `import.meta.env.MAIN_VITE_API_URL` |
| `src/main/services/hydra-api.ts` | Use `envConfig.apiUrl` |
| `src/main/services/ws/ws-client.ts` | Use `envConfig.wsUrl` |
| `src/main/services/window-manager.ts` | Use `envConfig.authUrl`, `envConfig.launcherSubdomain` |
| `src/main/events/index.ts` | Use `envConfig.checkoutUrl` (already has null guard) |
| `src/main/services/hosters/vikingfile.ts` | Use `envConfig.nimbusApiUrl` |
| `src/main/services/process-watcher.ts` | Use `envConfig.externalResourcesUrl` |
| `src/shared/env-config.ts` | **NEW** — centralized renderer env var access |
| `src/renderer/src/hooks/use-catalogue.ts` | Use shared env config |
| `src/renderer/src/app.tsx` | Use shared env config |
| `src/renderer/src/main.tsx` | Use shared env config |
| `src/renderer/src/pages/settings/settings-torbox.tsx` | Use shared env config |
| `src/renderer/src/pages/settings/settings-real-debrid.tsx` | Use shared env config |
| `src/big-picture/src/pages/catalogue/use-catalogue-data.ts` | Use shared env config |
| `.env.example` | **NEW** — documented env vars template |
