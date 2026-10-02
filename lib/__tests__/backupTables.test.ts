import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { BACKUP_TABLES, backupOrderColumns } from "../backupTables";

const ROOT = join(__dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "__tests__" || name === "node_modules" ? [] : sourceFiles(full);
    }
    // Skip " 2" duplicate files and non-source.
    if (/ 2\.[tj]sx?$/.test(name) || !/\.[tj]sx?$/.test(name)) return [];
    return [full];
  });
}

describe("backup table coverage", () => {
  it("backs up every table used via .from(\"...\") in lib/ and app/", () => {
    const used = new Set<string>();
    for (const f of [...sourceFiles(join(ROOT, "lib")), ...sourceFiles(join(ROOT, "app"))]) {
      const re = /\.from\(\s*["']([a-z_]+)["']/g;
      const src = readFileSync(f, "utf8");
      for (let m = re.exec(src); m; m = re.exec(src)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(10); // guards against the scan silently finding nothing
    const missing = Array.from(used).filter((t) => !(BACKUP_TABLES as readonly string[]).includes(t));
    expect(missing).toEqual([]);
  });

  it("gives every table a non-empty deterministic order key", () => {
    for (const t of BACKUP_TABLES) {
      const cols = backupOrderColumns(t);
      expect(cols.length).toBeGreaterThan(0);
      expect(cols.every((c) => /^[a-z_]+$/.test(c))).toBe(true);
    }
  });

  it("route orders every page and never leaks raw error text", () => {
    const src = readFileSync(join(ROOT, "app", "api", "admin", "backup", "route.ts"), "utf8");
    expect(src).toMatch(/\.order\(/);
    expect(src).not.toMatch(/skipped\[table\]\s*=\s*err/);
    expect(src).toMatch(/partial/);
  });
});
