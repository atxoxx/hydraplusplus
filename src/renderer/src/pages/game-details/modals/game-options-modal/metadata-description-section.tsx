import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@renderer/components";
import type { LibraryGame, ShopDetails } from "@types";
import { useToast } from "@renderer/hooks";
import { logger } from "@renderer/logger";
import "./metadata-description-section.scss";

export interface MetadataDescriptionSectionProps {
  game: LibraryGame;
  shopDetails?: ShopDetails | null;
  onSaved: () => void;
}

function getDescription(
  game: LibraryGame,
  shopDetails?: ShopDetails | null
): string {
  if (game.description !== undefined && game.description !== null) {
    return game.description;
  }
  return (
    shopDetails?.short_description || shopDetails?.detailed_description || ""
  );
}

export function MetadataDescriptionSection({
  game,
  shopDetails,
  onSaved,
}: Readonly<MetadataDescriptionSectionProps>) {
  const { t } = useTranslation("game_details");
  const { showSuccessToast, showErrorToast } = useToast();

  const [description, setDescription] = useState(() =>
    getDescription(game, shopDetails)
  );
  const [saving, setSaving] = useState(false);

  // Reset state when the game changes or its description is updated externally
  // (e.g. via the metadata search modal). Explicitly key on description field
  // to avoid stale state when the reference is the same object with new values.
  useEffect(() => {
    setDescription(getDescription(game, shopDetails));
  }, [game, game.description, shopDetails]);

  const hasChanges = useMemo(() => {
    return description !== getDescription(game, shopDetails);
  }, [description, game, shopDetails]);

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    try {
      const result = await window.electron.saveGameMetadata({
        shop: game.shop,
        objectId: game.objectId,
        metadata: {
          description: description || null,
        },
      });

      if (result.ok) {
        showSuccessToast(t("metadata_changes_saved"));
        onSaved();
      } else {
        showErrorToast(result.error || t("edit_game_modal_failed"));
      }
    } catch (err) {
      logger.error("Failed to save description:", err);
      showErrorToast(t("edit_game_modal_failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="metadata-description-section">
      <div className="metadata-description-section__field">
        <label className="metadata-description-section__label">
          {t("metadata_field_description", "Description")}
        </label>
        <textarea
          className="metadata-description-section__textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("metadata_field_description", "Description")}
          disabled={saving}
          rows={15}
        />
      </div>

      <div className="metadata-description-section__actions">
        <Button
          theme="primary"
          onClick={handleSave}
          disabled={!hasChanges || saving}
        >
          {saving
            ? t("saving", "Saving...")
            : t("save_changes", "Save Changes")}
        </Button>
      </div>
    </div>
  );
}
