import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Source-reading helpers for the viewer-policy tests. Everything here works on
// text, so no Supabase/Next runtime is needed.

export const ROOT = join(__dirname, "..", "..");

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "__tests__", "coverage"]);

// macOS Finder copies ("foo 2.ts") are stray duplicates, not real modules.
const isFinderCopy = (name: string) => / \d+\.[tj]sx?$/.test(name);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !isFinderCopy(name)) out.push(full);
  }
  return out;
}

export function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf8");
}

// Blanks comments but keeps string/template contents, so "https://x" survives.
export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 2;
      out += " ";
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

export function startsWithUseServer(src: string): boolean {
  return /^\s*(["'])use server\1/.test(stripComments(src));
}

// Repo-relative paths (forward slashes) of every file whose first statement is "use server".
export function listUseServerFiles(): string[] {
  return walk(ROOT)
    .filter((f) => startsWithUseServer(readFileSync(f, "utf8")))
    .map((f) => relative(ROOT, f))
    .sort();
}

// Files mentioning the directive anywhere other than as the file's first statement
// (an inline function-level "use server" would create an action outside the table).
export function listInlineUseServer(): string[] {
  return walk(ROOT)
    .map((f) => ({ f, code: stripComments(readFileSync(f, "utf8")) }))
    .filter(({ code }) => /(["'])use server\1/.test(code) && !/^\s*(["'])use server\1/.test(code))
    .map(({ f }) => relative(ROOT, f))
    .sort();
}

export function listRouteFiles(): string[] {
  return walk(join(ROOT, "app"))
    .filter((f) => /[\\/]route\.(ts|js)$/.test(f))
    .map((f) => relative(ROOT, f))
    .sort();
}

// URL paths of every page under app/export (e.g. "/export/calendar").
export function listExportPages(): string[] {
  return walk(join(ROOT, "app", "export"))
    .filter((f) => /[\\/]page\.tsx$/.test(f))
    .map((f) => "/" + relative(ROOT, f).replace(/\\/g, "/").replace(/^app\//, "").replace(/\/page\.tsx$/, ""))
    .sort();
}

// Returns the text between the braces of the body of `function <name>(...)`,
// or null if it can't be found/parsed. Expects comment-stripped source.
export function functionBody(code: string, name: string): string | null {
  const m = new RegExp(`function\\s+${name}\\s*\\(`).exec(code);
  if (!m) return null;
  let i = m.index + m[0].length;
  for (let depth = 1; i < code.length && depth > 0; i++) {
    if (code[i] === "(") depth++;
    else if (code[i] === ")") depth--;
  }
  let angle = 0;
  let brace = 0;
  for (; i < code.length; i++) {
    const c = code[i];
    if (c === "<") angle++;
    else if (c === ">" && code[i - 1] !== "=") angle--;
    else if (c === "{") {
      const prev = code.slice(0, i).trimEnd().slice(-1);
      if (angle === 0 && brace === 0 && !"|&:<,".includes(prev)) break;
      brace++;
    } else if (c === "}") brace--;
  }
  if (i >= code.length) return null;
  const start = i + 1;
  for (let depth = 1, j = start; j < code.length; j++) {
    if (code[j] === "{") depth++;
    else if (code[j] === "}" && --depth === 0) return code.slice(start, j);
  }
  return null;
}

export const squash = (s: string) => s.replace(/\s+/g, " ").trim();

// Role of a leading `await requireRole("...")` statement, only if it is the FIRST statement.
export function leadingRole(body: string | null): "viewer" | "editor" | null {
  const m = body?.match(/^\s*await\s+requireRole\(\s*(["'])(viewer|editor)\1\s*\)\s*;/);
  return m ? (m[2] as "viewer" | "editor") : null;
}

// True only when the exported wrapper is exactly
// `export async function X(...args: Parameters<typeof XImpl>) { return runAction(() => XImpl(...args)); }`
export function isExactWrapper(code: string, name: string): boolean {
  const m = new RegExp(`export\\s+async\\s+function\\s+${name}\\s*\\(([^)]*)\\)`).exec(code);
  if (!m || squash(m[1]) !== `...args: Parameters<typeof ${name}Impl>`) return false;
  return squash(functionBody(code, name) ?? "") === `return runAction(() => ${name}Impl(...args));`;
}

// Every top-level `export ...` statement in a "use server" file, classified.
// Only `export async function` (and erased type exports) are legal there.
export function exportViolations(code: string): string[] {
  const bad: string[] = [];
  for (const m of Array.from(code.matchAll(/^[ \t]*export\s+([^\n]*)/gm))) {
    const rest = m[1];
    if (/^async\s+function\s+\w+\s*\(/.test(rest)) continue;
    if (/^(type|interface)\s/.test(rest)) continue;
    bad.push(squash(`export ${rest}`).slice(0, 80));
  }
  return bad;
}

export function exportedAsyncFunctions(code: string): string[] {
  return Array.from(code.matchAll(/^[ \t]*export\s+async\s+function\s+(\w+)\s*\(/gm), (m) => m[1]).sort();
}

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export function exportedHttpMethods(code: string): string[] {
  const found = new Set<string>();
  for (const m of Array.from(code.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var)\s+(\w+)/g))) {
    if (HTTP_METHODS.includes(m[1])) found.add(m[1]);
  }
  for (const m of Array.from(code.matchAll(/export\s*\{([^}]*)\}/g))) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop() ?? "";
      if (HTTP_METHODS.includes(name)) found.add(name);
    }
  }
  return Array.from(found).sort();
}
