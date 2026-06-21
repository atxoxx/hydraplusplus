# Hydra++ Launcher — Project Knowledge

## What this is

Hydra++ is an open-source gaming platform (Electron desktop app) for managing your game library — downloading, launching, achievements, cloud saves, and social features. Written in **TypeScript, React, Python, and Rust**.

- **Repo**: https://github.com/atxoxx/hydraplusplus

## Quickstart

```bash
# Prerequisites: Node.js + Yarn, Python 3.9+, Rust toolchain
yarn install          # installs deps + builds Rust native addon (postinstall)
yarn dev              # start dev mode (electron-vite dev)
yarn dev:big-picture  # start Big Picture mode only (vite)
```

### Key commands

| Command                 | Description                                      |
| ----------------------- | ------------------------------------------------ |
| `yarn dev`              | Electron dev mode with HMR                       |
| `yarn start`            | Preview production build                         |
| `yarn build`            | Typecheck + production build                     |
| `yarn test`             | Run tests (node --test with ts-node)             |
| `yarn lint`             | ESLint + auto-fix                                |
| `yarn typecheck`        | Full typecheck (node + web tsconfigs)            |
| `yarn typecheck:node`   | Typecheck main/preload/shared only               |
| `yarn typecheck:web`    | Typecheck renderer/big-picture only              |
| `yarn format`           | Prettier format all files                        |
| `yarn format-check`     | Prettier check only                              |
| `yarn build:win`        | Build Windows installer (NSIS + portable)        |
| `yarn build:mac`        | Build macOS DMG                                  |
| `yarn build:linux`      | Build Linux (AppImage, snap, deb, rpm)           |
| `yarn build:unpack`     | Build unpacked for local testing                 |
| `yarn build:native`     | Build Rust native addon only                     |
| `yarn build:python-rpc` | Build Python RPC (cx_Freeze)                     |
| `yarn protoc`           | Generate protobuf TypeScript from `.proto` files |

## Architecture

```
src/
├── main/              # Electron main process
│   ├── index.ts       # App entry, window management, deep links
│   ├── main.ts        # State bootstrapping (loadState)
│   ├── level/         # LevelDB database + sublevels
│   ├── services/      # Core backend services
│   │   ├── download/  #   Download manager (JS HTTP + Python RPC for torrents)
│   │   ├── hydra-api.ts  # Hydra Cloud API client
│   │   ├── steam.ts      # Steam integration
│   │   ├── window-manager.ts
│   │   ├── process-watcher.ts  # Game process monitoring
│   │   ├── ludusavi.ts         # Save backup integration
│   │   ├── cloud-sync.ts       # Hydra Cloud save sync
│   │   ├── game-files-manager.ts
│   │   ├── python-rpc.ts       # Python subprocess bridge
│   │   ├── wine.ts / umu.ts    # Linux/Wine compatibility
│   │   └── ...
│   ├── helpers/        # Game launching, download helpers
│   ├── events/         # IPC event registration
│   ├── generated/      # Protobuf-generated code
│   └── constants.ts
├── renderer/           # Electron renderer (React + Redux)
│   └── src/
│       ├── app.tsx     # Root component + routing
│       └── store.ts    # Redux store (10 slices)
├── preload/            # Electron preload (context bridge)
├── big-picture/        # Big Picture mode (separate Vite build, React)
├── shared/             # Shared between main + renderer
│   └── index.ts        #   formatBytes, formatName, downloader routing, date utils
├── types/              # TypeScript type definitions
├── locales/            # i18n translations (~40 languages)
├── python_rpc/         # Python torrent/download RPC (libtorrent)
├── native/             # Rust native addon (hydra-native)
├── scripts/            # Build/postinstall helper scripts
├── binaries/           # Bundled binaries (7zip, umu-run)
└── resources/          # App resources (icon, sounds)
```

### Data storage

- **LevelDB** (`classic-level`) at the user data path. Main sublevels: games, downloads, user preferences, etc.
- Game save backups via **Ludusavi** (bundled binary).
- Hydra Cloud sync for saves/achievements via REST + WebSocket (`hydra-api.ts`, `ws/`).

### Aliases (defined in tsconfig + vite config)

| Alias         | Path                   |
| ------------- | ---------------------- |
| `@main/*`     | `src/main/*`           |
| `@renderer/*` | `src/renderer/src/*`   |
| `@locales`    | `src/locales/index.ts` |
| `@shared`     | `src/shared/index.ts`  |
| `@types`      | `src/types/index.ts`   |
| `@resources`  | `resources/`           |

## Conventions

### Formatting & Linting

- **Prettier**: semicolons: `true`, singleQuote: `false`, trailingComma: `"es5"`, tabWidth: 2
- **ESLint**: Extends `@electron-toolkit/eslint-config-ts/recommended` + React + jsx-a11y + prettier
- `@typescript-eslint/no-explicit-any`: **warning** (not error)
- Unused vars prefixed with `_` are allowed (e.g. `_event`, `_game`)
- `@typescript-eslint/explicit-function-return-type`: **off**
- **Commitlint**: conventional commits (`@commitlint/config-conventional`)

### Patterns

- **Package manager**: Always `yarn` (not npm). Enforced in `package.json` engines.
- **Module system**: ESM (`"type": "module"` in package.json). Use `import`/`export`, not `require`.
- **State**: Redux Toolkit for renderer state, Zustand for some hook-level state.
- **IPC**: Use the event registration pattern from `src/main/events/`.
- **Database access**: Through the `levelKeys` factory (`src/main/level/`). Use sublevels for typed access.
- **Route aliases**: Use `@main/`, `@renderer/`, `@locales`, `@shared`, `@types` instead of relative paths.
- **i18n**: `react-i18next` + `i18next`. Translation keys are nested JSON. Always include `ns` when using `t()` outside components.
- **SCSS**: Uses `sass-embedded` with `api: "modern"`.

### Gotchas

- **Rust toolchain required** for `hydra-native`. Postinstall builds it automatically.
- **Python 3.9+ required**. Install deps with `pip install -r requirements.txt`.
- **7zip binaries** are bundled per-platform in `binaries/`.
- Only **1 test file** exists: `src/main/services/download/download-completion.test.ts`. Tests run via Node's built-in test runner (`node --test`).
- **linux-only**: `--no-sandbox` is NOT appended on Linux.
- **macOS**: Window stays open when all windows close (standard macOS behavior).
- **Deep links**: `hydralauncher://run`, `hydralauncher://install-source`, `hydralauncher://profile`, `hydralauncher://install-theme`.
- **Custom protocols**: `local:` (file access), `gradient:` (SVG gradient generation).
- **Build targets**: Windows (NSIS + portable), macOS (DMG), Linux (AppImage + snap + deb + rpm).
