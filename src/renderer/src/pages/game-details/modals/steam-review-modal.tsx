import { useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SteamReviewAnalysis, SteamReviewSummary } from "@types";
import { gameDetailsContext } from "@renderer/context";
import { useFormat } from "@renderer/hooks";
import { Modal } from "@renderer/components";
import Skeleton from "react-loading-skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import "./steam-review-modal.scss";

interface SteamReviewModalProps {
  visible: boolean;
  onClose: () => void;
}

function getSteamScoreColor(descriptor: string): string {
  const desc = descriptor.toLowerCase();
  if (
    desc.includes("overwhelmingly positive") ||
    desc.includes("very positive") ||
    desc.includes("positive") ||
    desc.includes("mostly positive")
  ) {
    return "#66c0f4";
  }
  if (desc.includes("mixed")) return "#b9a074";
  if (
    desc.includes("mostly negative") ||
    desc.includes("negative") ||
    desc.includes("very negative") ||
    desc.includes("overwhelmingly negative")
  ) {
    return "#a34c25";
  }
  return "#d0d1d7";
}

type ModalTab = "overview" | "players" | "languages";

export function SteamReviewModal({
  visible,
  onClose,
}: Readonly<SteamReviewModalProps>) {
  const { objectId, shop, gameTitle, game } = useContext(gameDetailsContext);
  const { t } = useTranslation("game_details");
  const { numberFormatter } = useFormat();

  const [analysisData, setAnalysisData] =
    useState<SteamReviewAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [activeTab, setActiveTab] = useState<ModalTab>("overview");

  const displayTitle = game?.title ?? gameTitle;

  useEffect(() => {
    if (!visible) return;

    setAnalysisData(null);
    setIsLoading(true);
    setHasError(false);
    setActiveTab("overview");

    if (!objectId || !shop) {
      setIsLoading(false);
      setHasError(true);
      return;
    }

    let cancelled = false;

    window.electron
      .getSteamReviewAnalysis(shop, objectId, gameTitle)
      .then((result) => {
        if (!cancelled) {
          if (result) {
            setAnalysisData(result);
          } else {
            setHasError(true);
          }
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasError(true);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [visible, objectId, shop, gameTitle]);

  const summary: SteamReviewSummary | null = analysisData?.summary ?? null;
  const scoreColor = summary
    ? getSteamScoreColor(summary.reviewScoreDescriptor)
    : "#d0d1d7";

  const tabs: { id: ModalTab; label: string }[] = [
    { id: "overview", label: t("reviews_overview") },
    { id: "players", label: t("player_count_history") },
    { id: "languages", label: t("language_breakdown") },
  ];

  const chartTheme = {
    grid: "rgba(255, 255, 255, 0.05)",
    text: "#d0d1d7",
    blue: "#66c0f4",
    red: "#a34c25",
    teal: "#16b195",
  };

  return (
    <Modal
      visible={visible}
      title={displayTitle
        ? `${displayTitle} — ${t("steam_review_analysis")}`
        : t("steam_review_analysis")}
      onClose={onClose}
      large
    >
      <div className="steam-review-modal">
        {isLoading && (
          <div className="steam-review-modal__loading">
            <Skeleton height={300} />
            <Skeleton height={20} width="60%" />
            <Skeleton height={20} width="40%" />
          </div>
        )}

        {hasError && !isLoading && (
          <div className="steam-review-modal__error">
            <p>{t("data_unavailable")}</p>
          </div>
        )}

        {analysisData && !isLoading && (
          <>
            <div className="steam-review-modal__tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`steam-review-modal__tab ${
                    activeTab === tab.id
                      ? "steam-review-modal__tab--active"
                      : ""
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="steam-review-modal__content">
              {activeTab === "overview" && summary && (
                <OverviewTab
                  summary={summary}
                  scoreColor={scoreColor}
                  numberFormatter={numberFormatter}
                  chartTheme={chartTheme}
                  t={t}
                />
              )}

              {activeTab === "players" && (
                <PlayersTab
                  playerHistory={analysisData.playerHistory}
                  numberFormatter={numberFormatter}
                  chartTheme={chartTheme}
                  t={t}
                />
              )}

              {activeTab === "languages" && (
                <LanguagesTab
                  languageBreakdown={analysisData.languageBreakdown}
                  chartTheme={chartTheme}
                  t={t}
                />
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// --- Sub-components ---

function OverviewTab({
  summary,
  scoreColor,
  numberFormatter,
  chartTheme,
  t,
}: {
  summary: SteamReviewSummary;
  scoreColor: string;
  numberFormatter: Intl.NumberFormat;
  chartTheme: {
    grid: string;
    text: string;
    blue: string;
    red: string;
    teal: string;
  };
  t: (key: string) => string;
}) {
  const barData = useMemo(
    () => [
      { name: t("positive"), value: summary.totalPositive, fill: chartTheme.blue },
      { name: t("negative"), value: summary.totalNegative, fill: chartTheme.red },
    ],
    [summary, chartTheme, t]
  );

  const hasRecentData = summary.recentTotal !== null;

  return (
    <div className="steam-review-modal__overview">
      <div className="steam-review-modal__score-card">
        <span
          className="steam-review-modal__big-descriptor"
          style={{ color: scoreColor }}
        >
          {summary.reviewScoreDescriptor}
        </span>
        <span
          className="steam-review-modal__big-score"
          style={{ color: scoreColor }}
        >
          {summary.reviewScore}%
        </span>
        <span className="steam-review-modal__total-count">
          {numberFormatter.format(summary.totalReviews)}{" "}
          {t("total_reviews").toLowerCase()}
        </span>
      </div>

      {hasRecentData && (
        <div className="steam-review-modal__recent-card">
          <p className="steam-review-modal__section-label">
            {t("recent_reviews")}
          </p>
          <span
            className="steam-review-modal__recent-descriptor"
            style={{
              color: getSteamScoreColor(
                summary.recentReviewScoreDescriptor ?? ""
              ),
            }}
          >
            {summary.recentReviewScoreDescriptor}
          </span>
          <span>
            {summary.recentReviewScore}% —{" "}
            {numberFormatter.format(summary.recentTotal ?? 0)} {t("review_count").toLowerCase()}
          </span>
        </div>
      )}

      <div className="steam-review-modal__chart-section">
        <p className="steam-review-modal__section-label">
          {t("positive")} / {t("negative")} {t("review_count")}
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis type="number" stroke={chartTheme.text} fontSize={12} />
            <YAxis
              type="category"
              dataKey="name"
              stroke={chartTheme.text}
              fontSize={12}
            />
            <RechartsTooltip
              cursor={{ fill: "rgba(255,255,255,0.05)" }}
              contentStyle={{
                backgroundColor: "#1a1a1a",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "4px",
              }}
              labelStyle={{ color: chartTheme.text }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PlayersTab({
  playerHistory,
  numberFormatter,
  chartTheme,
  t,
}: {
  playerHistory: SteamReviewAnalysis["playerHistory"];
  numberFormatter: Intl.NumberFormat;
  chartTheme: {
    grid: string;
    text: string;
    blue: string;
    red: string;
    teal: string;
  };
  t: (key: string) => string;
}) {
  if (playerHistory.length === 0) {
    return (
      <div className="steam-review-modal__empty">
        <p>{t("data_unavailable")}</p>
      </div>
    );
  }

  return (
    <div className="steam-review-modal__chart-section">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={playerHistory}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
          <XAxis
            dataKey="date"
            stroke={chartTheme.text}
            fontSize={12}
            tickFormatter={(d: string) => {
              const date = new Date(d);
              return `${date.getMonth() + 1}/${date.getFullYear()}`;
            }}
          />
          <YAxis
            stroke={chartTheme.text}
            fontSize={12}
            tickFormatter={(v: number) => numberFormatter.format(v)}
          />
          <RechartsTooltip
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
            contentStyle={{
              backgroundColor: "#1a1a1a",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "4px",
            }}
            labelStyle={{ color: chartTheme.text }}
          />
          <Line
            type="monotone"
            dataKey="players"
            stroke={chartTheme.teal}
            strokeWidth={2}
            dot={false}
            name={t("player_count_history")}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function LanguagesTab({
  languageBreakdown,
  chartTheme,
  t,
}: {
  languageBreakdown: SteamReviewAnalysis["languageBreakdown"];
  chartTheme: {
    grid: string;
    text: string;
    blue: string;
    red: string;
    teal: string;
  };
  t: (key: string) => string;
}) {
  if (languageBreakdown.length === 0) {
    return (
      <div className="steam-review-modal__empty">
        <p>{t("data_unavailable")}</p>
      </div>
    );
  }

  return (
    <div className="steam-review-modal__chart-section">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={languageBreakdown.slice(0, 10)}
          layout="vertical"
          margin={{ left: 40 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
          <XAxis type="number" stroke={chartTheme.text} fontSize={12} />
          <YAxis
            type="category"
            dataKey="language"
            stroke={chartTheme.text}
            fontSize={12}
          />
          <RechartsTooltip
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
            contentStyle={{
              backgroundColor: "#1a1a1a",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "4px",
            }}
            labelStyle={{ color: chartTheme.text }}
          />
          <Bar dataKey="count" fill={chartTheme.blue} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
