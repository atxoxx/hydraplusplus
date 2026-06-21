# Hydra++ Rebrand Spec

## Summary

Rebrand the Hydra Launcher application to **Hydra++** (hydraplusplus). Change the output executable/installer names, update the package identity, and update all user-facing naming — while preserving backward compatibility for deep links, database paths, internal binary names, and the "Hydra Cloud" service brand.

## Key Decisions

| Area | Current | New |
|---|---|---|
| App ID | `gg.hydralauncher.hydra` | `gg.hydralauncher.hydraplusplus` |
| Package name | `hydralauncher` | `hydraplusplus` |
| Product/executable name | `Hydra` | `Hydra++` |
| Window title (main) | `Hydra Launcher` | `Hydra++` |
| Window title (big picture) | `Hydra Big Picture` | `Hydra++ Big Picture` |
| Deep link protocol | `hydralauncher://` | **unchanged** |
| LevelDB database path | `hydra-db` | **unchanged** |
| "Hydra Cloud" branding | `Hydra Cloud` | **unchanged** |
| Internal binary names | `hydra-native`, `hydra-python-rpc` | **unchanged** |
| Code enums/constants | `Downloader.Hydra`, `NotCachedOnHydra`, etc. | **unchanged** |
| Repo URL | `github.com/atxoxx/hydra` | `github.com/atxoxx/hydraplusplus` |
| Auto-updater owner/repo | `atxoxx/hydra` | `atxoxx/hydraplusplus` |
| Tray tooltip | `Hydra Launcher` | **unchanged** |
| NSIS installer cleanup path | `hydralauncher-updater` | **unchanged** |
| Localization | Change all 40+ locales | **English only**; other locales unchanged |
| Documentation (spec files) | Various spec files | **unchanged** |

## Files to Change

### 1. `electron-builder.yml`

```yaml
# Line 1: appId
appId: gg.hydralauncher.hydraplusplus   # was: gg.hydralauncher.hydra

# Line 2: productName
productName: Hydra++                     # was: Hydra

# Line 27: executableName (win)
executableName: Hydra++                  # was: Hydra

# Line 75-77: publish repo
publish:
  provider: github
  owner: atxoxx
  repo: hydraplusplus                    # was: hydra
```

**Note**: `extraResources` references to `hydra-python-rpc` and `hydra-native` remain **unchanged**.

### 2. `package.json`

```json
{
  "name": "hydraplusplus",              // was: "hydralauncher"
  "description": "Hydra++",             // was: "Hydra"
  "repository": {
    "url": "https://github.com/atxoxx/hydraplusplus.git"  // was: hydra.git
  }
}
```

### 3. `src/main/index.ts`

```typescript
// Line 26-28: autoUpdater repo
autoUpdater.setFeedURL({
  provider: "github",
  owner: "atxoxx",
  repo: "hydraplusplus",               // was: "hydra"
});

// Line 69: setAppUserModelId
electronApp.setAppUserModelId("gg.hydralauncher.hydraplusplus");  // was: gg.hydralauncher.hydra

// NOTE: PROTOCOL constant and all deep link handling stays as "hydralauncher"
```

### 4. `src/renderer/index.html`

```html
<title>Hydra++</title>                  <!-- was: Hydra Launcher -->
```

### 5. `src/big-picture/index.html`

```html
<title>Hydra++ Big Picture</title>      <!-- was: Hydra Big Picture -->
```

### 6. `src/main/constants.ts`

**No changes needed** — `hydra-db`, `HYDRA_DECKY_PLUGIN_LOCATION`, and other constants stay as-is per decision.

### 7. `src/shared/constants.ts`

**No changes needed** — `Downloader.Hydra`, `DownloadError.NotCachedOnHydra`, and other enums stay as-is per decision.

### 8. `src/main/env-config.ts`

**No changes needed** — external API URLs (`hydralauncher.gg`, etc.) are external services and stay as-is.

### 9. `src/locales/en/translation.json`

Update all English UI strings containing "Hydra" to use "Hydra++" instead, **except**:
- Strings containing "Hydra Cloud" — these stay as-is (e.g., `"settings_category_hydra_cloud": "Hydra Cloud"`)
- Strings referencing the Decky plugin ("Hydra Decky Plugin") — these stay as-is
- Strings referencing "Hydra Sources" — change to "Hydra++ Sources"
- Strings referencing "Hydra needs to remain open" — change to "Hydra++ needs to remain open"
- Strings with "Open Hydra" — change to "Open Hydra++"
- Strings with "Launch Hydra" — change to "Launch Hydra++"
- Strings with "Don't hide Hydra" — change to "Don't hide Hydra++"
- Strings with "Activate Hydra" — change to "Activate Hydra++"

**Specific i18n keys to update** (English only):

| Key path | Old | New |
|---|---|---|
| `game_details.hydra_sources` | "Hydra Sources" | "Hydra++ Sources" |
| `game_details.hydra_needs_to_remain_open` | "For this download, Hydra needs..." | "For this download, Hydra++ needs..." |
| `game_details.danger_zone_section_description` | "...downloaded by Hydra" | "...downloaded by Hydra++" |
| `game_details.proton_switch_confirmation_description` | "...Hydra will delete..." | "...Hydra++ will delete..." |
| `downloads.no_downloads_description` | "...downloaded anything with Hydra..." | "...downloaded anything with Hydra++..." |
| `downloads.extraction_failed_description` | "Hydra could not extract..." | "Hydra++ could not extract..." |
| `settings.quit_app_instead_hiding` | "Don't hide Hydra when closing" | "Don't hide Hydra++ when closing" |
| `settings.launch_with_system` | "Launch Hydra on system start-up" | "Launch Hydra++ on system start-up" |
| `settings.download_sources_description` | "Hydra will fetch the download..." | "Hydra++ will fetch the download..." |
| `settings.launch_minimized` | "Launch Hydra minimized" | "Launch Hydra++ minimized" |
| `settings.launch_hydra_in_library_page` | "Launch Hydra in the Library page" | "Launch Hydra++ in the Library page" |
| `settings.launch_hydra_in_big_picture` | "Launch Hydra in Big Picture mode" | "Launch Hydra++ in Big Picture mode" |
| `settings.hide_to_tray_on_game_start` | "Hide Hydra to tray..." | "Hide Hydra++ to tray..." |
| `settings.create_theme_modal_description` | "...customize Hydra's appearance" | "...customize Hydra++'s appearance" |
| `settings.emulation_disclaimer` | "Hydra never downloads..." | "Hydra++ never downloads..." |
| `settings.hide_classics_bookmark` | "Hide the Hydra Classics bookmark" | "Hide the Hydra++ Classics bookmark" |
| `activation.title` | "Activate Hydra" | "Activate Hydra++" |
| `transfer.db_update_failed` | "...Hydra could not update..." | "...Hydra++ could not update..." |
| `system_tray.open` | "Open Hydra" | "Open Hydra++" |
| `notifications.restart_to_install_update` | "Restart Hydra to install..." | "Restart Hydra++ to install..." |
| `classics_onboarding.title` | "Welcome to Hydra Classics" | "Welcome to Hydra++ Classics" |
| `classics_onboarding.step1_heading` | "Meet Hydra Classics" | "Meet Hydra++ Classics" |
| `classics_onboarding.step2_body` | "Hydra doesn't host..." | "Hydra++ doesn't host..." |
| `classics_onboarding.step3_body` | "Hydra Classics works with..." | "Hydra++ Classics works with..." |

**Keys that must NOT change** (Hydra Cloud branding preserved):
- `settings_category_hydra_cloud` and `settings_category_hydra_cloud_description`
- All keys under `hydra_cloud` section
- `metadata_source_hydra`
- `decky_plugin_*` keys referencing "Hydra Decky Plugin"
- `download_error_not_cached_on_hydra` (enum-backed)

### 10. `build/installer.nsh`

**No changes needed** — the `hydralauncher-updater` cleanup path stays as-is.

### 11. `python_rpc/setup.py`

**No changes needed** — internal binary names stay as-is.

### 12. `native/hydra-native/Cargo.toml`

**No changes needed** — internal crate name stays as-is.

### 13. `scripts/build-native-addon.cjs`

**No changes needed** — internal references stay as-is.

### 14. GitHub Workflows

#### `.github/workflows/build-renderer.yml`

```yaml
# Line 53: project name
--project-name="hydraplusplus"          # was: "hydra"
```

#### `.github/workflows/update-aur.yml`

```yaml
# Line 57: AUR repo clone
git clone ssh://aur@aur.archlinux.org/hydraplusplus-launcher-bin.git  # was: hydra-launcher-bin

# All subsequent references to hydra-launcher-bin directory → hydraplusplus-launcher-bin
# Line 81: grep
CURRENT_VERSION=$(grep '^pkgver=' hydraplusplus-launcher-bin/PKGBUILD | cut -d'=' -f2)

# Line 101, 122: cd
cd hydraplusplus-launcher-bin
```

### 15. `knowledge.md`

Update project description and key references:
- Title: `Hydra++ Launcher` → `Hydra++ Launcher`
- Description: Update to reference Hydra++
- Repo URL: Update to `github.com/atxoxx/hydraplusplus`

### 16. `.github/pull-request-template.md`

Update documentation link if needed (likely unchanged since docs URL is external).

## Files Explicitly NOT Changed

| File | Reason |
|---|---|
| `src/locales/*/translation.json` (except `en/`) | Non-English locales left for community/contributors |
| `src/main/env-config.ts` | External API URLs unchanged |
| `src/main/constants.ts` | DB path, constants unchanged |
| `src/shared/constants.ts` | Enum values unchanged |
| `src/main/services/window-manager.ts` | Tray tooltip unchanged |
| `src/main/services/hydra-api.ts` | Internal service name unchanged |
| `build/installer.nsh` | Updater cleanup path unchanged |
| `python_rpc/*` | Internal binary names unchanged |
| `native/*` | Internal crate/dir names unchanged |
| `scripts/*` | Internal references unchanged |
| `docs/*.md` (spec files) | Historical spec files unchanged |
| `resources/*` | App icons/resources unchanged |
| `build/*` (except installer.nsh) | Build configs unchanged |
| `README.md` | Not changed (documentation updated later) |

## Build Output Artifact Names

With `package.json` name changed to `hydraplusplus` and `electron-builder.yml` `productName` set to `Hydra++`, the output artifacts will be:

| Platform | Artifact |
|---|---|
| Windows (NSIS) | `hydraplusplus-{version}-setup.exe` |
| Windows (portable) | `hydraplusplus-{version}-portable.exe` |
| macOS (DMG) | `hydraplusplus-{version}.dmg` |
| Linux (AppImage) | `hydraplusplus-{version}.AppImage` |
| Linux (deb) | `hydraplusplus_{version}_amd64.deb` |
| Linux (rpm) | `hydraplusplus-{version}.x86_64.rpm` |

The Windows executable name will be `Hydra++` (from `executableName`).

## What's Preserved (Backward Compatibility)

- **Deep links** (`hydralauncher://run`, `hydralauncher://install-source`, etc.) continue to work
- **LevelDB database** at `hydra-db` — no data migration needed
- **Hydra Cloud** service brand unchanged
- **Internal code constants** and enum values unchanged
- **Tray tooltip** unchanged
- **Installer cleanup path** for old updater unchanged
- **Non-English locales** unchanged (community can update)

## Implementation Order

1. `package.json` — name and repo URL
2. `electron-builder.yml` — appId, productName, executableName, repo
3. `src/main/index.ts` — autoUpdater repo and setAppUserModelId
4. `src/renderer/index.html` — window title
5. `src/big-picture/index.html` — window title
6. `src/locales/en/translation.json` — English UI strings
7. GitHub workflows — build-renderer.yml and update-aur.yml
8. `knowledge.md` — project description updates
9. Typecheck and verify
