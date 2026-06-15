import fs from "node:fs";
import { logger } from "./logger";

/**
 * Parses Steam's text-based VDF (Valve Data Format) files.
 * Handles nested key-value pairs delimited by curly braces.
 *
 * Format example:
 *   "libraryfolders"
 *   {
 *     "0"
 *     {
 *       "path" "C:\\Steam"
 *       "apps" { ... }
 *     }
 *   }
 *
 * @returns A nested object, where keys are strings and values are
 *          strings (for leaf key-value pairs) or nested objects.
 */
export function parseVdf(content: string): Record<string, unknown> {
  const cleaned = stripComments(content);
  const tokens = tokenize(cleaned);
  const [result] = parseTokens(tokens, 0);
  return (result as Record<string, unknown>) ?? {};
}

/** Reads and parses a VDF file from disk. Returns null if file cannot be read. */
export function parseVdfFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf-8");
    return parseVdf(content);
  } catch (err) {
    logger.error(`[VDF] Failed to parse ${filePath}:`, err);
    return null;
  }
}

function stripComments(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

type VdfToken =
  | { type: "string"; value: string }
  | { type: "open" }
  | { type: "close" };

function tokenize(text: string): VdfToken[] {
  const tokens: VdfToken[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === "{" || ch === "}") {
      tokens.push(ch === "{" ? { type: "open" } : { type: "close" });
      i++;
      continue;
    }

    if (ch === '"') {
      i++;
      let value = "";
      let escaped = false;

      while (i < text.length) {
        const inner = text[i];
        if (escaped) {
          value += inner === "n" ? "\n" : inner;
          escaped = false;
        } else if (inner === "\\") {
          escaped = true;
        } else if (inner === '"') {
          i++;
          break;
        } else {
          value += inner;
        }
        i++;
      }

      tokens.push({ type: "string", value });
      continue;
    }

    // Skip whitespace and other characters outside quotes
    i++;
  }

  return tokens;
}

function parseTokens(
  tokens: VdfToken[],
  index: number
): [Record<string, unknown>, number] {
  const result: Record<string, unknown> = {};

  while (index < tokens.length) {
    const token = tokens[index];

    if (token.type === "close") {
      return [result, index + 1];
    }

    if (token.type === "open") {
      index++;
      continue;
    }

    if (token.type !== "string") {
      index++;
      continue;
    }

    const key = token.value;
    index++;

    if (index >= tokens.length) break;

    const next = tokens[index];

    if (next.type === "open") {
      // This key opens a nested object: e.g. "apps" { ... }
      const [nested, nextIndex] = parseTokens(tokens, index + 1);
      result[key] = nested;
      index = nextIndex;
    } else if (next.type === "string") {
      // Key-value pair: e.g. "path" "C:\\Steam"
      result[key] = next.value;
      index++;
    }
    // If next is "close", skip (handled at the top of the loop)
  }

  return [result, index];
}

// --- Higher-level helpers for Steam-specific VDF files ---

export interface SteamUserInfo {
  steamId64: string;
  accountName: string;
  personaName: string;
  mostRecent: boolean;
}

/** Extracts Steam user accounts from loginusers.vdf */
export function getSteamUsersFromConfig(steamPath: string): SteamUserInfo[] {
  const vdf = parseVdfFile(`${steamPath}/config/loginusers.vdf`);
  if (!vdf?.users || typeof vdf.users !== "object") return [];

  const users = vdf.users as Record<string, unknown>;
  return Object.entries(users)
    .filter(([steamId64]) => /^\d{17}$/.test(steamId64))
    .map(([steamId64, data]) => {
      const info = data as Record<string, unknown>;
      return {
        steamId64,
        accountName: String(info.AccountName ?? ""),
        personaName: String(info.PersonaName ?? ""),
        mostRecent: String(info.MostRecent ?? "0") === "1",
      };
    });
}

export interface SteamLibraryFolder {
  path: string;
  label: string;
  totalSize: string;
}

/** Extracts Steam library folder paths from libraryfolders.vdf */
export function getSteamLibraryFolders(
  steamPath: string
): SteamLibraryFolder[] {
  const vdf = parseVdfFile(`${steamPath}/steamapps/libraryfolders.vdf`);
  if (!vdf?.libraryfolders || typeof vdf.libraryfolders !== "object") return [];

  const folders = vdf.libraryfolders as Record<string, unknown>;
  // Filter to numeric keys only (ignore "contentstatsid" etc.)
  return Object.entries(folders)
    .filter(([key]) => /^\d+$/.test(key))
    .map(([, data]) => {
      const info = data as Record<string, unknown>;
      return {
        path: String(info.path ?? ""),
        label: String(info.label ?? ""),
        totalSize: String(info.total_size ?? "0"),
      };
    })
    .filter((f) => f.path.length > 0);
}

/**
 * Attempts to extract Steam Family sharing identifiers from local config.
 * Checks sharedconfig.vdf in each userdata folder for "BaseUserAutoGrant" entries.
 * Note: Modern Steam Families stores data server-side; this is a best-effort attempt.
 */
export function getSteamFamilyMembers(
  steamPath: string
): Array<{ steamId64: string; personaName: string }> {
  const userdataPath = `${steamPath}/userdata`;
  if (!fs.existsSync(userdataPath)) return [];

  const members: Array<{ steamId64: string; personaName: string }> = [];
  const seen = new Set<string>();

  try {
    const userDirs = fs.readdirSync(userdataPath).filter((d) => {
      const stat = fs.statSync(`${userdataPath}/${d}`);
      return stat.isDirectory() && /^\d+$/.test(d);
    });

    for (const userId of userDirs) {
      const sharedConfigPath = `${userdataPath}/${userId}/config/sharedconfig.vdf`;
      const vdf = parseVdfFile(sharedConfigPath);
      if (!vdf) continue;

      // Walk the sharedconfig tree looking for SteamID64 values
      findSteamIdsInVdf(vdf, seen, members);
    }
  } catch (err) {
    logger.error("[VDF] Error scanning for family members:", err);
  }

  return members;
}

function findSteamIdsInVdf(
  obj: unknown,
  seen: Set<string>,
  members: Array<{ steamId64: string; personaName: string }>
): void {
  if (!obj || typeof obj !== "object") return;

  const record = obj as Record<string, unknown>;

  // Check if any key is a SteamID64 (17 digits)
  for (const [key, value] of Object.entries(record)) {
    if (/^\d{17}$/.test(key) && !seen.has(key)) {
      seen.add(key);
      // Try to find a display name nearby
      const personaName =
        typeof record.PersonaName === "string"
          ? record.PersonaName
          : typeof value === "object" && value !== null
            ? String(
                (value as Record<string, unknown>).PersonaName ??
                  (value as Record<string, unknown>).persona_name ??
                  ""
              )
            : "";

      members.push({
        steamId64: key,
        personaName: personaName || `Steam User ${key.slice(-4)}`,
      });
    }

    // Recurse into nested objects
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      findSteamIdsInVdf(value, seen, members);
    }
  }
}
