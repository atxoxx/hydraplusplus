import fs from "node:fs";
import path from "node:path";

/**
 * Searches for a game executable within a folder tree.
 * Returns the first matching .exe/.sh/.app file found, or a specific named executable.
 * Depth-limited to avoid stack overflow.
 */
export function findExecutable(
  rootPath: string,
  maxDepth: number,
  targetName?: string
): string | null {
  if (maxDepth < 0) return null;

  try {
    const entries = fs.readdirSync(rootPath, { withFileTypes: true });

    // Check files at current level
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const nameLower = entry.name.toLowerCase();

      if (targetName) {
        if (nameLower === targetName.toLowerCase()) {
          return path.join(rootPath, entry.name);
        }
      } else if (
        nameLower.endsWith(".exe") ||
        nameLower.endsWith(".sh") ||
        nameLower.endsWith(".app")
      ) {
        return path.join(rootPath, entry.name);
      }
    }

    // Recurse into subdirectories (skip hidden/system folders)
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;

      const subExe = findExecutable(
        path.join(rootPath, entry.name),
        maxDepth - 1,
        targetName
      );
      if (subExe) return subExe;
    }
  } catch {
    // Permission errors — skip
  }

  return null;
}

/**
 * Sanitizes a game name into a usable ID: lowercase, alphanumeric with hyphens.
 */
export function sanitizeId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
