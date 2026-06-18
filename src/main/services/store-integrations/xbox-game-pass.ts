import { BrowserWindow, shell } from "electron";
import axios from "axios";
import { exec } from "node:child_process";
import { BaseStore } from "./base-store";
import type { StoreGame, AuthResult, SyncResult } from "@types";

const XBOX_CLIENT_ID = "04b076bd-fd36-4b4a-b586-b48450125585";
const REDIRECT_URI = "https://login.live.com/oauth20_desktop.srf";
const SCOPE = "Xboxlive.signin Xboxlive.offline_access";

interface XblTitle {
  titleId: string;
  name: string;
  type: string;
  titleHistory: {
    lastTimePlayed: string;
  };
}

export class XboxGamePassStore extends BaseStore {
  readonly storeId = "xbox" as const;
  readonly storeName = "Xbox / PC Game Pass";
  readonly storeIcon = "xbox";
  readonly authMethod = "oauth" as const;

  async login(parentWindow: BrowserWindow): Promise<AuthResult> {
    return new Promise((resolve) => {
      const loginWindow = new BrowserWindow({
        width: 800,
        height: 700,
        parent: parentWindow,
        modal: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });

      const authUrl =
        "https://login.live.com/oauth20_authorize.srf?" +
        new URLSearchParams({
          client_id: XBOX_CLIENT_ID,
          response_type: "code",
          redirect_uri: REDIRECT_URI,
          scope: SCOPE,
          display: "touch",
          locale: "en",
        }).toString();

      let resolved = false;

      loginWindow.webContents.on(
        "did-navigate",
        async (_event: Electron.Event, url: string) => {
          if (resolved) return;

          if (!url.startsWith(REDIRECT_URI)) return;

          resolved = true;
          const urlObj = new URL(url);
          const code = urlObj.searchParams.get("code");

          if (!code) {
            loginWindow.close();
            resolve({
              success: false,
              error: "No authorization code in redirect",
            });
            return;
          }

          loginWindow.close();

          try {
            // Step 1: Exchange code for Microsoft access token
            const tokenResponse = await axios.post(
              "https://login.live.com/oauth20_token.srf",
              new URLSearchParams({
                client_id: XBOX_CLIENT_ID,
                grant_type: "authorization_code",
                code,
                redirect_uri: REDIRECT_URI,
              }),
              {
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                },
              }
            );

            const { access_token, refresh_token, expires_in } =
              tokenResponse.data;

            // Step 2: Authenticate with Xbox Live (XBL)
            const xblResponse = await axios.post(
              "https://user.auth.xboxlive.com/user/authenticate",
              {
                Properties: {
                  AuthMethod: "RPS",
                  SiteName: "user.auth.xboxlive.com",
                  RpsTicket: `d=${access_token}`,
                },
                RelyingParty: "http://auth.xboxlive.com",
                TokenType: "JWT",
              }
            );

            const xblToken = xblResponse.data.Token;
            const userHash = xblResponse.data.DisplayClaims.xui[0].uhs;

            // Step 3: Get XSTS token
            const xstsResponse = await axios.post(
              "https://xsts.auth.xboxlive.com/xsts/authorize",
              {
                Properties: {
                  SandboxId: "RETAIL",
                  UserTokens: [xblToken],
                },
                RelyingParty: "http://xboxlive.com",
                TokenType: "JWT",
              }
            );

            const xstsToken = xstsResponse.data.Token;
            const gamertag = xstsResponse.data.DisplayClaims.xui[0].gtg;
            const xuid = xstsResponse.data.DisplayClaims.xui[0].xid;

            const account = {
              storeId: this.storeId,
              displayName: gamertag,
              accountId: xuid,
              isAuthenticated: true,
              accessToken: xstsToken,
              refreshToken: refresh_token,
              tokenExpiry: Date.now() + expires_in * 1000,
              extraData: { userHash, msAccessToken: access_token },
            };

            await this.saveAccount(account);
            resolve({ success: true, account });
          } catch (error: any) {
            resolve({ success: false, error: error.message });
          }
        }
      );

      loginWindow.loadURL(authUrl);

      loginWindow.on("closed", () => {
        if (!resolved) {
          resolve({ success: false, error: "Login window closed by user" });
        }
      });
    });
  }

  async logout(): Promise<void> {
    await this.clearStoredTokens();
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
      const tokenResponse = await axios.post(
        "https://login.live.com/oauth20_token.srf",
        new URLSearchParams({
          client_id: XBOX_CLIENT_ID,
          grant_type: "refresh_token",
          refresh_token: account.refreshToken,
          redirect_uri: REDIRECT_URI,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const { access_token, refresh_token, expires_in } = tokenResponse.data;

      const xblResponse = await axios.post(
        "https://user.auth.xboxlive.com/user/authenticate",
        {
          Properties: {
            AuthMethod: "RPS",
            SiteName: "user.auth.xboxlive.com",
            RpsTicket: `d=${access_token}`,
          },
          RelyingParty: "http://auth.xboxlive.com",
          TokenType: "JWT",
        }
      );

      const xblToken = xblResponse.data.Token;

      const xstsResponse = await axios.post(
        "https://xsts.auth.xboxlive.com/xsts/authorize",
        {
          Properties: {
            SandboxId: "RETAIL",
            UserTokens: [xblToken],
          },
          RelyingParty: "http://xboxlive.com",
          TokenType: "JWT",
        }
      );

      const xstsToken = xstsResponse.data.Token;

      await this.saveAccount({
        ...account,
        accessToken: xstsToken,
        refreshToken: refresh_token,
        tokenExpiry: Date.now() + expires_in * 1000,
      });
      return true;
    } catch {
      return false;
    }
  }

  async syncLibrary(): Promise<SyncResult> {
    if (!(await this.isTokenValid())) {
      const refreshed = await this.refreshAuth();
      if (!refreshed) {
        return {
          success: false,
          gamesSynced: 0,
          error: "Xbox authentication expired. Please login again.",
        };
      }
    }

    const account = await this.loadAccount();
    if (!account) {
      return { success: false, gamesSynced: 0, error: "Not authenticated" };
    }

    try {
      // Fetch title history from Xbox Live (the user's owned/played games)
      const extra = (account.extraData ?? {}) as { userHash: string };
      const xuid = account.accountId;

      const titleHistoryResponse = await axios.get(
        `https://titlehub.xboxlive.com/users/xuid(${xuid})/titles/titlehistory/decoration/detail`,
        {
          headers: {
            Authorization: `XBL3.0 x=${extra.userHash};${account.accessToken}`,
            "x-xbl-contract-version": "2",
            "Accept-Language": "en-US",
          },
        }
      );

      const titles: XblTitle[] = titleHistoryResponse.data.titles || [];
      // Filter: only PC games
      const pcTitles = titles.filter((t) => t.type === "Game");

      const games: StoreGame[] = [];

      for (const title of pcTitles) {
        const titleId = title.titleId;
        const name = title.name || `Xbox Game ${titleId}`;

        // Fetch box art from the Microsoft Store catalog
        let coverImageUrl: string | null = null;
        let packageFamilyName: string | null = null;
        try {
          const storeResponse = await axios.get(
            `https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${titleId}&market=US&languages=en-us&MS-CV=DGU1mcuYo0WMMp+F.1`,
            { timeout: 5000 }
          );
          const product = storeResponse.data.Products?.[0];
          if (product) {
            const images = product.LocalizedProperties?.[0]?.Images || [];
            const boxArt = images.find(
              (img: any) =>
                img.ImagePurpose === "BoxArt" || img.ImagePurpose === "Poster"
            );
            if (boxArt) coverImageUrl = boxArt.Uri;
            // Store package family name for launch support
            if (product.Fulfillment?.PackageFamilyName) {
              packageFamilyName = product.Fulfillment.PackageFamilyName;
            }
          }
        } catch {
          // Non-critical, skip
        }

        games.push({
          storeGameId: titleId,
          title: name,
          coverImageUrl,
          isOwned: true,
          storeUrl: `ms-windows-store://pdp/?productid=${titleId}`,
          extraData: {
            titleId,
            titleType: title.type,
            lastPlayed: title.titleHistory?.lastTimePlayed ?? null,
            source: "owned",
            ...(packageFamilyName ? { packageFamilyName } : {}),
          },
        });
      }

      // Also fetch the GamePass catalog for subscription titles
      try {
        const gpResponse = await axios.get(
          "https://catalog.gamepass.com/v3/products?market=US&language=en-US&hydration=PCGamePassCoreCatalogProductsWithBigIds",
          {
            headers: { "MS-CV": "DGU1mcuYo0WMMp+F.1" },
            timeout: 10000,
          }
        );

        const gpProducts: any[] = gpResponse.data.Products ?? [];
        const existingIds = new Set(games.map((g) => g.storeGameId));

        for (const product of gpProducts) {
          const productId = product.ProductId;
          if (!productId || existingIds.has(productId)) continue;

          const name =
            product.LocalizedProperties?.[0]?.ProductTitle ??
            `GamePass Game ${productId}`;

          // Get box art for GamePass titles
          let gpCoverUrl: string | null = null;
          try {
            const gpStoreResponse = await axios.get(
              `https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${productId}&market=US&languages=en-us&MS-CV=DGU1mcuYo0WMMp+F.1`,
              { timeout: 5000 }
            );
            const gpProduct = gpStoreResponse.data.Products?.[0];
            if (gpProduct) {
              const images = gpProduct.LocalizedProperties?.[0]?.Images || [];
              const boxArt = images.find(
                (img: any) =>
                  img.ImagePurpose === "BoxArt" ||
                  img.ImagePurpose === "Poster"
              );
              if (boxArt) gpCoverUrl = boxArt.Uri;
            }
          } catch {
            // skip
          }

          games.push({
            storeGameId: productId,
            title: name,
            coverImageUrl: gpCoverUrl,
            isOwned: false, // GamePass titles: owned via subscription
            storeUrl: `ms-windows-store://pdp/?productid=${productId}`,
            extraData: {
              titleId: productId,
              titleType: "GamePass",
              source: "gamepass",
            },
          });
        }

        this.log(
          `Added ${gpProducts.length} GamePass catalog titles (${games.length} total)`
        );
      } catch (gpError) {
        this.logError("Failed to fetch GamePass catalog", gpError);
        // Non-fatal: still save the owned games
      }

      await this.saveGames(games);
      this.log(
        `Synced ${games.length} games from Xbox (owned + GamePass catalog)`
      );
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
      `ms-windows-store://pdp/?productid=${extraData.productId ?? gameId}`
    );
  }

  async launchGame(gameId: string): Promise<void> {
    const games = await this.getStoredGames();
    const game = games.find((g) => g.storeGameId === gameId);
    const extraData = (game?.extraData ?? {}) as any;

    if (extraData.packageFamilyName) {
      exec(`start shell:appsFolder\\${extraData.packageFamilyName}!App`);
    }
  }
}
