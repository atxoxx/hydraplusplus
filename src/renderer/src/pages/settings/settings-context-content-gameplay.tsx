import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { CheckboxField, SelectField } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector } from "@renderer/hooks";
import { QuestionIcon } from "@primer/octicons-react";

import "./settings-behavior.scss";

export function SettingsContextContentGameplay() {
  const { t } = useTranslation("settings");
  const { updateUserPreferences } = useContext(settingsContext);

  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );

  const [form, setForm] = useState({
    autoplayGameTrailers: true,
    disableNsfwAlert: false,
    showHiddenAchievementsDescription: false,
    enableSteamAchievements: false,
    enableNewDownloadOptionsBadges: true,
    hideClassicsBookmark: false,
    classicsUseHeroLayout: false,
  });

  const [hwConfig, setHwConfig] = useState({
    enabled: false,
    pollingIntervalMs: 5000,
    alertsEnabled: false,
  });

  useEffect(() => {
    window.electron
      .getHardwareMonitorConfig()
      .then((config) => {
        setHwConfig({
          enabled: config.enabled,
          pollingIntervalMs: config.pollingIntervalMs,
          alertsEnabled: config.alertsEnabled,
        });
      })
      .catch(() => {});
  }, []);

  const updateHwConfig = useCallback(
    (patch: Partial<typeof hwConfig>) => {
      const updated = { ...hwConfig, ...patch };
      setHwConfig(updated);
      window.electron.updateHardwareMonitorConfig(updated).catch(() => {});
    },
    [hwConfig]
  );

  useEffect(() => {
    if (!userPreferences) return;

    setForm({
      autoplayGameTrailers: userPreferences.autoplayGameTrailers ?? true,
      disableNsfwAlert: userPreferences.disableNsfwAlert ?? false,
      showHiddenAchievementsDescription:
        userPreferences.showHiddenAchievementsDescription ?? false,
      enableSteamAchievements: userPreferences.enableSteamAchievements ?? false,
      enableNewDownloadOptionsBadges:
        userPreferences.enableNewDownloadOptionsBadges ?? true,
      hideClassicsBookmark: userPreferences.hideClassicsBookmark ?? false,
      classicsUseHeroLayout: userPreferences.classicsUseHeroLayout ?? false,
    });
  }, [userPreferences]);

  const handleChange = (values: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...values }));
    updateUserPreferences(values);
  };

  return (
    <div className="settings-context-panel">
      <div className="settings-context-panel__group">
        <h3>{t("content_preferences")}</h3>

        <CheckboxField
          label={t("autoplay_trailers_on_game_page")}
          checked={form.autoplayGameTrailers}
          onChange={() =>
            handleChange({
              autoplayGameTrailers: !form.autoplayGameTrailers,
            })
          }
        />

        <CheckboxField
          label={t("disable_nsfw_alert")}
          checked={form.disableNsfwAlert}
          onChange={() =>
            handleChange({ disableNsfwAlert: !form.disableNsfwAlert })
          }
        />

        <CheckboxField
          label={t("show_hidden_achievement_description")}
          checked={form.showHiddenAchievementsDescription}
          onChange={() =>
            handleChange({
              showHiddenAchievementsDescription:
                !form.showHiddenAchievementsDescription,
            })
          }
        />
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("gameplay_metadata")}</h3>

        <div className={`settings-behavior__checkbox-container--with-tooltip`}>
          <CheckboxField
            label={t("enable_steam_achievements")}
            checked={form.enableSteamAchievements}
            onChange={() =>
              handleChange({
                enableSteamAchievements: !form.enableSteamAchievements,
              })
            }
          />

          <small
            className="settings-behavior__checkbox-container--tooltip"
            data-open-article="steam-achievements"
          >
            <QuestionIcon size={12} />
          </small>
        </div>

        <CheckboxField
          label={t("enable_new_download_options_badges")}
          checked={form.enableNewDownloadOptionsBadges}
          onChange={() =>
            handleChange({
              enableNewDownloadOptionsBadges:
                !form.enableNewDownloadOptionsBadges,
            })
          }
        />
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("game_activity")}</h3>

        <CheckboxField
          label={t("enable_hardware_monitoring")}
          checked={hwConfig.enabled}
          onChange={() => updateHwConfig({ enabled: !hwConfig.enabled })}
        />

        <div style={{ marginLeft: 28 }}>
          <SelectField
            label={t("polling_interval")}
            value={String(hwConfig.pollingIntervalMs)}
            onChange={(e) =>
              updateHwConfig({
                pollingIntervalMs: Number(e.target.value),
              })
            }
            options={[
              { key: "1000", value: "1000", label: "1s" },
              { key: "5000", value: "5000", label: "5s" },
              { key: "10000", value: "10000", label: "10s" },
              { key: "30000", value: "30000", label: "30s" },
            ]}
          />
        </div>

        <CheckboxField
          label={t("enable_performance_alerts")}
          checked={hwConfig.alertsEnabled}
          onChange={() =>
            updateHwConfig({ alertsEnabled: !hwConfig.alertsEnabled })
          }
        />
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("classics_appearance")}</h3>

        <CheckboxField
          label={t("hide_classics_bookmark")}
          checked={form.hideClassicsBookmark}
          onChange={() =>
            handleChange({
              hideClassicsBookmark: !form.hideClassicsBookmark,
            })
          }
        />

        <CheckboxField
          label={t("classics_use_hero_layout")}
          checked={form.classicsUseHeroLayout}
          onChange={() =>
            handleChange({
              classicsUseHeroLayout: !form.classicsUseHeroLayout,
            })
          }
        />
      </div>
    </div>
  );
}
