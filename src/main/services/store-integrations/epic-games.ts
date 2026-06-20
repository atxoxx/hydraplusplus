import { BrowserWindow, shell } from "electron";
import axios from "axios";
import { BaseStore } from "./base-store";
import type { StoreGame, AuthResult, SyncResult } from "@types";

const EPIC_CLIENT_ID = "34a02cf8f4414e29b15921876da36f9a";
const EPIC_CLIENT_SECRET = "daafbccc737745039dffe53d94fc76cf";
const EPIC_OAUTH_URL = "https://account-public-service-prod03.ol.epicgames.com";
const EPIC_CATALOG_URL =
  "https://catalog-public-service-prod06.ol.epicgames.com";
const EPIC_LIBRARY_URL = "https://library-service.live.use1a.on.epicgames.com";
const EPIC_AUTH_HEADER = Buffer.from(
  `${EPIC_CLIENT_ID}:${EPIC_CLIENT_SECRET}`
).toString("base64");

// Epic API requires the official launcher User-Agent to return data.
// Generic UAs cause empty responses. (Lutris/Playnite pattern)
const EPIC_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) EpicGamesLauncher";

/** Shared headers used on all Epic API calls */
function epicApiHeaders(extra: Record<string, string> = {}) {
  return { "User-Agent": EPIC_USER_AGENT, ...extra };
}

/**
 * Lutris-style filter: checks enriched catalog metadata to determine if an
 * item is a non-standalone-game (DLC, soundtrack, demo, editor resource, asset, etc.)
 */
function isNonGameItem(metadata: any): boolean {
  // Audience entitlements are subscriptions/community, not owned games
  if (metadata.entitlementType === "AUDIENCE") return true;

  const categories: any[] = metadata.categories || [];
  const catPaths = categories.map((cat) =>
    typeof cat === "object" ? (cat.path ?? "") : String(cat)
  );

  // Must have "applications" category to be a game
  if (!catPaths.includes("applications")) {
    return true;
  }

  // If it has a mainGameItem (meaning it's an add-on or DLC), it must be launchable
  if (metadata.mainGameItem && !catPaths.includes("addons/launchable")) {
    return true;
  }

  // Skip digital extras, plugins, engines, assets
  if (
    catPaths.some((path) =>
      ["digitalextras", "plugins", "plugins/engine", "type/format-item"].includes(path) ||
      path.startsWith("engines") ||
      path.startsWith("asset-format")
    )
  ) {
    return true;
  }

  // customAttributes: ListingIdentifier indicates a non-game store listing
  const customAttrs: Record<string, unknown> = metadata.customAttributes || {};
  if (customAttrs["ListingIdentifier"]) return true;

  // Items that are tied to a parent game (DLCs, add-ons):
  // they have releaseInfo entries with compatibleApps pointing to the base game
  const releaseInfo: any[] = metadata.releaseInfo || [];
  for (const release of releaseInfo) {
    if (
      release &&
      typeof release === "object" &&
      release.compatibleApps &&
      Array.isArray(release.compatibleApps) &&
      release.compatibleApps.length > 0
    ) {
      return true;
    }
  }

  return false;
}

export class EpicGamesStore extends BaseStore {
  readonly storeId = "epic" as const;
  readonly storeName = "Epic Games Store";
  readonly storeIcon = "epic";
  readonly authMethod = "browser" as const;

  async login(parentWindow: BrowserWindow): Promise<AuthResult> {
    return new Promise((resolve) => {
      const loginWindow = new BrowserWindow({
        width: 800,
        height: 700,
        parent: parentWindow,
        modal: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      // Set user agent globally for all frames, sub-resources, and redirects to prevent hCaptcha blocking
      loginWindow.webContents.setUserAgent(EPIC_USER_AGENT);

      // Clear cookies and session storage to bypass hCaptcha response incorrect state
      loginWindow.webContents.session.clearStorageData({
        storages: ["cookies", "localstorage", "indexdb"],
      });

      const loginUrl = "https://www.epicgames.com/id/login?responseType=code";

      loginWindow.loadURL(loginUrl);

      let resolved = false;

      const handleRedirect = async (url: string) => {
        if (resolved) return;

        if (
          url.includes("localhost/launcher/authorized") ||
          url.includes("epicgames.com/id/api/redirect")
        ) {
          let authCode: string | null = null;
          try {
            const urlObj = new URL(url);
            authCode =
              urlObj.searchParams.get("code") ||
              urlObj.searchParams.get("authorizationCode");
          } catch {
            // Ignore URL parsing errors
          }

          if (authCode) {
            resolved = true;

            // Immediately unsubscribe to prevent further events/crashes
            loginWindow.webContents.removeAllListeners("will-navigate");
            loginWindow.webContents.removeAllListeners("did-navigate");
            loginWindow.webContents.removeAllListeners("did-redirect-navigation");
            loginWindow.webContents.removeAllListeners("will-redirect");
            loginWindow.webContents.removeAllListeners("did-finish-load");

            setImmediate(() => {
              if (!loginWindow.isDestroyed()) loginWindow.close();
            });

            try {
              const tokenResponse = await axios.post(
                `${EPIC_OAUTH_URL}/account/api/oauth/token`,
                new URLSearchParams({
                  grant_type: "authorization_code",
                  code: authCode,
                  token_type: "eg1",
                }),
                {
                  headers: epicApiHeaders({
                    Authorization: `Basic ${EPIC_AUTH_HEADER}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                  }),
                }
              );

              const {
                access_token,
                refresh_token,
                expires_in,
                account_id,
                displayName,
              } = tokenResponse.data;

              const account = {
                storeId: this.storeId,
                displayName,
                accountId: account_id,
                isAuthenticated: true,
                accessToken: access_token,
                refreshToken: refresh_token,
                tokenExpiry: Date.now() + expires_in * 1000,
              };

              await this.saveAccount(account);
              resolve({ success: true, account });
            } catch (error: any) {
              resolve({ success: false, error: error.message });
            }
          }
        }
      };

      loginWindow.webContents.on("will-navigate", (_event: Electron.Event, url: string) => {
        handleRedirect(url);
      });

      loginWindow.webContents.on("did-navigate", (_event: Electron.Event, url: string) => {
        handleRedirect(url);
      });

      loginWindow.webContents.on("did-redirect-navigation", (_event: Electron.Event, url: string) => {
        handleRedirect(url);
      });

      loginWindow.webContents.on("will-redirect", (_event: Electron.Event, url: string) => {
        handleRedirect(url);
      });

      const timeout = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        setImmediate(() => {
          if (!loginWindow.isDestroyed()) loginWindow.close();
        });
        resolve({
          success: false,
          error: "Login timed out. Please try again.",
        });
      }, 120_000);

      loginWindow.on("closed", () => {
        clearTimeout(timeout);
        if (!resolved) {
          resolve({ success: false, error: "Login window closed by user" });
        }
      });
    });
  }

  async logout(): Promise<void> {
    await this.clearStoredTokens();
    this.account = null;
  }

  async isTokenValid(): Promise<boolean> {
    const account = await this.loadAccount();
    if (!account?.tokenExpiry) return false;
    return Date.now() < account.tokenExpiry - 60_000;
  }

  async refreshAuth(): Promise<boolean> {
    const account = await this.loadAccount();
    if (!account?.refreshToken) return false;

    try {
      const response = await axios.post(
        `${EPIC_OAUTH_URL}/account/api/oauth/token`,
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: account.refreshToken,
          token_type: "eg1",
        }),
        {
          headers: epicApiHeaders({
            Authorization: `Basic ${EPIC_AUTH_HEADER}`,
            "Content-Type": "application/x-www-form-urlencoded",
          }),
        }
      );

      const { access_token, refresh_token, expires_in } = response.data;
      await this.saveAccount({
        ...account,
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiry: Date.now() + expires_in * 1000,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async getAccessToken(): Promise<string> {
    if (!(await this.isTokenValid())) {
      const refreshed = await this.refreshAuth();
      if (!refreshed)
        throw new Error(
          "Epic Games authentication expired. Please login again."
        );
    }
    const account = await this.loadAccount();
    return account!.accessToken!;
  }

  /** Verify the access token is still valid with Epic (Lutris pattern). */
  private async verifyToken(token: string): Promise<boolean> {
    try {
      const response = await axios.get(
        `${EPIC_OAUTH_URL}/account/api/oauth/verify`,
        {
          headers: epicApiHeaders({
            Authorization: `bearer ${token}`,
          }),
        }
      );
      return response.status < 500 && !response.data?.errorMessage;
    } catch {
      return false;
    }
  }

  async syncLibrary(): Promise<SyncResult> {
    try {
      const token = await this.getAccessToken();

      // Verify token is accepted by Epic before attempting library fetch
      const tokenOk = await this.verifyToken(token);
      if (!tokenOk) {
        this.log("Token verification failed — refreshing…");
        const refreshed = await this.refreshAuth();
        if (!refreshed) {
          return {
            success: false,
            gamesSynced: 0,
            error: "Epic token expired and refresh failed.",
          };
        }
        // Recurse with fresh token
        return this.syncLibrary();
      }

      const account = await this.loadAccount();
      if (!account || !account.accountId) {
        throw new Error("Epic account details not found. Please log in again.");
      }

      // Fetch all library items with cursor-based pagination (Lutris pattern).
      // Note: NO platform filter — Lutris gets ALL items and filters in code.
      const gameRecords: any[] = [];
      let nextCursor: string | null = null;
      let page = 0;

      do {
        const params: Record<string, string> = {
          includeMetadata: "true",
        };
        if (nextCursor) params.cursor = nextCursor;

        const libraryResponse = await axios.get(
          `${EPIC_LIBRARY_URL}/library/api/public/items`,
          {
            headers: epicApiHeaders({
              Authorization: `bearer ${token}`,
            }),
            params,
          }
        );

        const records: any[] = libraryResponse.data.records || [];
        gameRecords.push(...records);

        nextCursor = libraryResponse.data.responseMetadata?.nextCursor || null;
        page++;
      } while (nextCursor && page < 20);

      if (gameRecords.length === 0) {
        this.log("No library items returned by Epic API");
        await this.logSync({ success: true, gamesSynced: 0 });
        return { success: true, gamesSynced: 0 };
      }

      this.log(`Fetched ${gameRecords.length} library items (${page} page(s))`);

      // Build base StoreGame entries from library items.
      // Light pre-filter: skip obviously non-game namespaces.
      const allGames: StoreGame[] = [];

      for (const r of gameRecords) {
        if (!r.appName || !r.catalogItemId) continue;

        const ns = (r.namespace ?? "").toLowerCase();
        const appName = (r.appName ?? "").toLowerCase();
        const sandbox = (r.sandboxType ?? "").toLowerCase();

        // Skip Unreal Engine and developer listings (case-insensitive)
        if (
          ns === "ue" ||
          sandbox === "private" ||
          sandbox === "stage" ||
          appName.startsWith("ue_")
        ) {
          continue;
        }

        allGames.push({
          storeGameId: r.catalogItemId || r.appName,
          title: r.title || r.appName,
          isOwned: true,
          storeUrl: null,
          extraData: {
            namespace: r.namespace,
            appName: r.appName,
            catalogItemId: r.catalogItemId,
          },
        });
      }

      this.log(
        `Built ${allGames.length} base entries (pre-filter from ${gameRecords.length} records)`
      );

      if (allGames.length === 0) {
        this.log("No game entries after pre-filter");
        await this.logSync({ success: true, gamesSynced: 0 });
        return { success: true, gamesSynced: 0 };
      }

      // Index for O(1) enrichment lookup
      const gameByCatalogId = new Map<string, StoreGame>();
      for (const g of allGames) {
        const cid = (g.extraData as any)?.catalogItemId;
        if (cid) gameByCatalogId.set(cid, g);
      }

      // Enrich with catalog metadata & collect category info for filtering
      const batchSize = 50;
      let enriched = 0;
      // Track which catalog items are non-game (DLCs, editor resources, etc.)
      const nonGameItemIds = new Set<string>();
      // Track which catalog items are confirmed playable games
      const playableGameItemIds = new Set<string>();

      for (let i = 0; i < allGames.length; i += batchSize) {
        const batch = allGames.slice(i, i + batchSize);

        const byNamespace: Record<string, string[]> = {};
        for (const g of batch) {
          const ns = (g.extraData as any)?.namespace;
          const cid = (g.extraData as any)?.catalogItemId;
          if (!ns || !cid) continue;
          if (!byNamespace[ns]) byNamespace[ns] = [];
          byNamespace[ns].push(cid);
        }

        for (const [namespace, ids] of Object.entries(byNamespace)) {
          try {
            const catalogResponse = await axios.get(
              `${EPIC_CATALOG_URL}/catalog/api/shared/namespace/${namespace}/bulk/items`,
              {
                params: {
                  id: ids.join(","),
                  includeDLCDetails: true,
                  includeMainGameDetails: true,
                  country: "US",
                  locale: "en",
                },
                headers: epicApiHeaders({
                  Authorization: `bearer ${token}`,
                }),
                timeout: 15000,
              }
            );

            const catalogItems = catalogResponse.data;

            for (const [itemId, item] of Object.entries(catalogItems as any)) {
              const metadata = item as any;
              if (!metadata?.title) continue;

              // --- Lutris-style filtering based on enriched metadata ---
              // Filter out DLCs, soundtracks, demos, editor resources, assets.
              if (isNonGameItem(metadata)) {
                nonGameItemIds.add(itemId);
                continue;
              }

              const coverImage = metadata.keyImages?.find(
                (img: any) =>
                  img.type === "DieselGameBox" || img.type === "Thumbnail"
              );
              const backgroundImage = metadata.keyImages?.find(
                (img: any) =>
                  img.type === "DieselGameBoxTall" ||
                  img.type === "OfferImageTall"
              );

              const gameEntry = gameByCatalogId.get(itemId);
              if (gameEntry) {
                gameEntry.title = metadata.title;
                gameEntry.slug = metadata.urlSlug;
                gameEntry.coverImageUrl = coverImage?.url ?? null;
                gameEntry.backgroundImageUrl = backgroundImage?.url ?? null;
                gameEntry.description = metadata.description ?? null;
                gameEntry.developers = metadata.developer
                  ? [metadata.developer]
                  : [];
                gameEntry.releaseDate =
                  metadata.releaseInfo?.[0]?.dateAdded ?? null;
                gameEntry.storeUrl = `https://store.epicgames.com/product/${metadata.urlSlug}`;
                playableGameItemIds.add(itemId);
                enriched++;
              }
            }
          } catch (err) {
            this.logError(
              `Catalog fetch failed for namespace ${namespace} — ${ids.length} game(s) will have basic metadata`,
              err
            );
          }
        }
      }

      // Filter out non-game items.
      // If the catalog query succeeded for at least one game (enriched > 0), we only keep items
      // that are explicitly confirmed as playable games via metadata.
      // Otherwise, we keep them but filter out items marked as non-game (safe fallback).
      let filteredOut = 0;
      const games = allGames.filter((g) => {
        const cid = (g.extraData as any)?.catalogItemId;
        if (enriched > 0) {
          if (!cid || !playableGameItemIds.has(cid)) {
            filteredOut++;
            return false;
          }
          return true;
        }

        if (cid && nonGameItemIds.has(cid)) {
          filteredOut++;
          return false;
        }
        return true;
      });

      if (filteredOut > 0) {
        this.log(
          `Filtered out ${filteredOut} non-game items (DLCs, soundtracks, editor resources, etc.)`
        );
      }

      this.log(
        `Enriched ${enriched}/${allGames.length} entries; ${games.length} games after filtering`
      );

      if (games.length === 0) {
        this.log("All items filtered as non-game — skipping save");
        await this.logSync({ success: true, gamesSynced: 0 });
        return { success: true, gamesSynced: 0 };
      }

      await this.saveGames(games);
      this.log(`Synced ${games.length} games`);
      await this.logSync({ success: true, gamesSynced: games.length });
      return { success: true, gamesSynced: games.length };
    } catch (error: any) {
      await this.logSync({
        success: false,
        gamesSynced: 0,
        error: error.message,
      });
      return { success: false, gamesSynced: 0, error: error.message };
    }
  }

  async getOwnedGames(): Promise<StoreGame[]> {
    return this.getStoredGames();
  }

  async installGame(gameId: string): Promise<void> {
    const games = await this.getStoredGames();
    const game = games.find((g) => g.storeGameId === gameId);
    const extraData = (game?.extraData ?? {}) as any;

    shell.openExternal(
      `com.epicgames.launcher://apps/${extraData.appName ?? gameId}?action=install`
    );
  }

  async launchGame(gameId: string): Promise<void> {
    const games = await this.getStoredGames();
    const game = games.find((g) => g.storeGameId === gameId);
    const extraData = (game?.extraData ?? {}) as any;

    shell.openExternal(
      `com.epicgames.launcher://apps/${extraData.appName ?? gameId}?action=launch`
    );
  }
}
