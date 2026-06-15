import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  CheckboxField,
  TextField,
  Button,
  SelectField,
  DiscoveryWizardModal,
} from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector } from "@renderer/hooks";
import type { GameShop, PlatformScanConfig, PlatformGame } from "@types";
import { LinkIcon } from "@primer/octicons-react";
import "./settings-platform-import.scss";

interface PlatformInfo {
  shop: GameShop;
  labelKey: string;
  needsApiKey: boolean;
  apiKeyLabel?: string;
  apiKeyPlaceholder?: string;
  setupUrl?: string;
}

const IMPORT_PLATFORMS: PlatformInfo[] = [
  {
    shop: "steam",
    labelKey: "platform_steam",
    needsApiKey: true,
    apiKeyLabel: "steam_web_api_key",
    apiKeyPlaceholder: "steam_web_api_key_placeholder",
    setupUrl: "https://steamcommunity.com/dev/apikey",
  },
  { shop: "epic", labelKey: "platform_epic", needsApiKey: false },
  { shop: "gog", labelKey: "platform_gog", needsApiKey: false },
  { shop: "battle-net", labelKey: "platform_battle_net", needsApiKey: false },
  { shop: "amazon", labelKey: "platform_amazon", needsApiKey: false },
  { shop: "ubisoft", labelKey: "platform_ubisoft", needsApiKey: false },
  { shop: "xbox", labelKey: "platform_xbox", needsApiKey: false },
  { shop: "rockstar", labelKey: "platform_rockstar", needsApiKey: false },
  { shop: "itch-io", labelKey: "platform_itch_io", needsApiKey: false },
  { shop: "humble", labelKey: "platform_humble", needsApiKey: false },
];

export function SettingsContextPlatformImport() {
  const { t } = useTranslation("settings");
  const { updateUserPreferences } = useContext(settingsContext);

  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );

  const [enablePlatformImport, setEnablePlatformImport] = useState(false);
  const [steamApiKey, setSteamApiKey] = useState("");
  const [steamFamilyShareIds, setSteamFamilyShareIds] = useState("");
  const [scanInstalled, setScanInstalled] = useState<Record<string, boolean>>(
    {}
  );
  const [fetchOwned, setFetchOwned] = useState<Record<string, boolean>>({});
  const [importPreference, setImportPreference] = useState<"wizard" | "auto">(
    "wizard"
  );
  const [scanningStatus, setScanningStatus] = useState<string | null>(null);
  const [discoveredGames, setDiscoveredGames] = useState<PlatformGame[]>([]);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);

  // Load from user preferences
  useEffect(() => {
    if (!userPreferences) return;

    const platformConfigs = userPreferences.platformScanConfigs ?? {};
    const hasAnyEnabled = Object.values(platformConfigs).some(
      (cfg) => (cfg as Partial<PlatformScanConfig>)?.enabled
    );

    setEnablePlatformImport(hasAnyEnabled);
    setSteamApiKey(userPreferences.steamApiKey ?? "");
    setSteamFamilyShareIds(
      (userPreferences.steamFamilyShareIds ?? []).join(", ")
    );
    setImportPreference(userPreferences.importDiscoveryPreference ?? "wizard");

    const scanInstalledMap: Record<string, boolean> = {};
    const fetchOwnedMap: Record<string, boolean> = {};

    for (const platform of IMPORT_PLATFORMS) {
      const cfg = platformConfigs[platform.shop] as
        | Partial<PlatformScanConfig>
        | undefined;
      scanInstalledMap[platform.shop] = cfg?.scanInstalled ?? true;
      fetchOwnedMap[platform.shop] = cfg?.fetchOwned ?? false;
    }

    setScanInstalled(scanInstalledMap);
    setFetchOwned(fetchOwnedMap);
  }, [userPreferences]);

  const savePlatformConfigs = async (
    newEnablePlatformImport: boolean,
    newScanInstalled: Record<string, boolean>,
    newFetchOwned: Record<string, boolean>
  ) => {
    const configs: Record<string, PlatformScanConfig> = {};

    for (const platform of IMPORT_PLATFORMS) {
      configs[platform.shop] = {
        enabled: newEnablePlatformImport,
        scanPaths: [],
        scanInstalled: newScanInstalled[platform.shop] ?? true,
        fetchOwned: newFetchOwned[platform.shop] ?? false,
        apiKey: platform.shop === "steam" ? steamApiKey || null : null,
        familyShareIds:
          platform.shop === "steam"
            ? parseSteamIds(steamFamilyShareIds)
            : undefined,
      };
    }

    await updateUserPreferences({
      platformScanConfigs: configs,
    });
  };

  const handleToggleEnable = async () => {
    const next = !enablePlatformImport;
    setEnablePlatformImport(next);
    await savePlatformConfigs(next, scanInstalled, fetchOwned);
  };

  const handleToggleScanInstalled = async (shop: GameShop) => {
    const next = { ...scanInstalled, [shop]: !scanInstalled[shop] };
    setScanInstalled(next);
    await savePlatformConfigs(enablePlatformImport, next, fetchOwned);
  };

  const handleToggleFetchOwned = async (shop: GameShop) => {
    const next = { ...fetchOwned, [shop]: !fetchOwned[shop] };
    setFetchOwned(next);
    await savePlatformConfigs(enablePlatformImport, scanInstalled, next);
  };

  const handleSteamApiKeyChange = async (value: string) => {
    setSteamApiKey(value);
    await updateUserPreferences({ steamApiKey: value || null });
  };

  const handleSteamFamilyShareIdsChange = async (value: string) => {
    setSteamFamilyShareIds(value);
    const ids = parseSteamIds(value);
    await updateUserPreferences({ steamFamilyShareIds: ids });
  };

  const handleImportPreferenceChange = async (value: "wizard" | "auto") => {
    setImportPreference(value);
    await updateUserPreferences({ importDiscoveryPreference: value });
  };

  const handleScanNow = async () => {
    setScanningStatus(t("scanning_platforms"));
    try {
      const result = await window.electron.scanPlatforms();

      // Collect all games from all platform scanners
      const platformKeys: Array<keyof typeof result> = [
        "epic",
        "gog",
        "battle-net",
        "amazon",
        "ubisoft",
        "xbox",
        "rockstar",
        "itch-io",
        "humble",
      ];

      const allGames = platformKeys.flatMap((key) => result[key].games);
      const totalGames = allGames.length;

      if (totalGames > 0) {
        if (importPreference === "auto") {
          await window.electron.importPlatformGames(allGames);
          setScanningStatus(
            t("scan_games_complete_description", {
              count: totalGames,
              ns: "notifications",
            })
          );
        } else {
          setDiscoveredGames(allGames);
          setShowDiscoveryModal(true);
        }
      } else {
        setScanningStatus(
          t("scan_games_no_results_description", { ns: "notifications" })
        );
      }
    } catch (err) {
      setScanningStatus(t("scan_failed"));
    } finally {
      setTimeout(() => setScanningStatus(null), 5000);
    }
  };

  const handleDiscoveryImport = async (
    games: PlatformGame[],
    autoImportFuture: boolean
  ) => {
    await window.electron.importPlatformGames(games);

    if (autoImportFuture) {
      await updateUserPreferences({
        importDiscoveryPreference: "auto",
      });
      setImportPreference("auto");
    }
  };

  if (!userPreferences) return null;

  return (
    <div className="settings-platform-import">
      <div className="settings-context-panel__group">
        <CheckboxField
          label={t("enable_platform_import")}
          checked={enablePlatformImport}
          onChange={handleToggleEnable}
        />
        <p className="settings-platform-import__description">
          {t("platform_import_description")}
        </p>
      </div>

      {enablePlatformImport && (
        <>
          <div className="settings-context-panel__group">
            <h3 className="settings-platform-import__section-title">
              {t("config_per_platform")}
            </h3>

            {IMPORT_PLATFORMS.map((platform) => (
              <div
                key={platform.shop}
                className="settings-platform-import__platform-row"
              >
                <div className="settings-platform-import__platform-header">
                  <span className="settings-platform-import__platform-name">
                    {t(platform.labelKey)}
                  </span>
                </div>

                <div className="settings-platform-import__platform-options">
                  <CheckboxField
                    label={t("scan_installed_games")}
                    checked={scanInstalled[platform.shop] ?? true}
                    onChange={() => handleToggleScanInstalled(platform.shop)}
                  />

                  {platform.needsApiKey && (
                    <>
                      <CheckboxField
                        label={t("fetch_owned_games")}
                        checked={fetchOwned[platform.shop] ?? false}
                        onChange={() => handleToggleFetchOwned(platform.shop)}
                      />

                      {fetchOwned[platform.shop] && (
                        <div className="settings-platform-import__api-key-row">
                          <TextField
                            label={t(platform.apiKeyLabel ?? "api_key")}
                            value={steamApiKey}
                            placeholder={t(
                              platform.apiKeyPlaceholder ??
                                "api_key_placeholder"
                            )}
                            onChange={(e) =>
                              handleSteamApiKeyChange(e.target.value)
                            }
                            theme="dark"
                            type="password"
                          />
                          {platform.setupUrl && (
                            <a
                              href={platform.setupUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="settings-platform-import__setup-link"
                            >
                              <LinkIcon size={12} />
                              {t("get_api_key_at", { url: platform.setupUrl })}
                            </a>
                          )}
                        </div>
                      )}

                      {/* Steam Family Sharing */}
                      {platform.shop === "steam" && (
                        <div className="settings-platform-import__family-share">
                          <TextField
                            label={t("steam_family_share_ids")}
                            value={steamFamilyShareIds}
                            placeholder={t(
                              "steam_family_share_ids_placeholder"
                            )}
                            onChange={(e) =>
                              handleSteamFamilyShareIdsChange(e.target.value)
                            }
                            theme="dark"
                          />
                          <span className="settings-platform-import__hint">
                            {t("steam_family_share_ids_hint")}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="settings-context-panel__group">
            <h3 className="settings-platform-import__section-title">
              {t("import_preference")}
            </h3>

            <SelectField
              value={importPreference}
              onChange={(e) =>
                handleImportPreferenceChange(
                  e.target.value as "wizard" | "auto"
                )
              }
              options={[
                {
                  key: "wizard",
                  value: "wizard",
                  label: t("import_preference_wizard"),
                },
                {
                  key: "auto",
                  value: "auto",
                  label: t("import_preference_auto"),
                },
              ]}
            />
          </div>

          <div className="settings-context-panel__group">
            <h3 className="settings-platform-import__section-title">
              {t("scan_actions")}
            </h3>

            <div className="settings-platform-import__actions">
              <Button
                theme="primary"
                onClick={handleScanNow}
                disabled={scanningStatus !== null}
              >
                {scanningStatus ?? t("scan_for_games")}
              </Button>

              <Button
                theme="outline"
                onClick={async () => {
                  try {
                    const familyResult =
                      await window.electron.scanSteamFamily();
                    if (familyResult.ownGames.length > 0) {
                      await window.electron.importSteamFamilyGames(
                        familyResult.ownGames
                      );
                    }
                    if (familyResult.familyGames.length > 0) {
                      await window.electron.importSteamFamilyGames(
                        familyResult.familyGames
                      );
                    }
                    setScanningStatus(
                      t("steam_family_scan_complete", {
                        ownCount: familyResult.ownGames.length,
                        familyCount: familyResult.familyGames.length,
                      })
                    );
                  } catch {
                    setScanningStatus(t("steam_family_scan_failed"));
                  }
                  setTimeout(() => setScanningStatus(null), 5000);
                }}
                disabled={scanningStatus !== null || !steamApiKey}
              >
                {t("scan_steam_family")}
              </Button>
            </div>

            {scanningStatus && (
              <p className="settings-platform-import__status">
                {scanningStatus}
              </p>
            )}
          </div>
        </>
      )}

      <DiscoveryWizardModal
        visible={showDiscoveryModal}
        games={discoveredGames}
        onClose={() => setShowDiscoveryModal(false)}
        onImport={handleDiscoveryImport}
      />
    </div>
  );
}

function parseSteamIds(input: string): string[] {
  return input
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d{17}$/.test(s));
}
