#!/usr/bin/env node
// Read-only schema check: confirms every table the app uses exists and that
// columns added by migrations are present, via PostgREST `select ... limit 0`.
// Never writes. Usage: npm run check:schema
// (reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY from the
// environment, falling back to .env.local).
import { readFileSync, existsSync } from "node:fs";

function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (env or .env.local).");
  process.exit(2);
}

// Keep in sync with lib/backupTables.ts (a unit test keeps that list in sync
// with the code). [table, migration that created it ("initial" = base schema)]
const TABLES = [
  ["events", "initial"],
  ["holidays", "initial"],
  ["seasons", "initial"],
  ["checklist", "initial"],
  ["month_focus", "initial"],
  ["general_notes", "009"],
  ["levels", "006"],
  ["event_overrides", "002"],
  ["event_exceptions", "007"],
  ["note_comments", "011"],
  ["day_notes", "015"],
  ["reminder_templates", "017"],
  ["checklist_templates", "018"],
  ["checklist_template_items", "018"],
  ["season_source_dates", "021"],
  ["activity_log", "023"],
  ["event_checklist_items", "024"],
];

// [table, column, migration that adds it]
const COLUMNS = [
  ["events", "end_time", "003"],
  ["events", "end_date", "010"],
  ["events", "location", "019"],
  ["events", "updated_at", "020"],
  ["events", "owner", "025"],
  ["seasons", "color", "004"],
  ["checklist", "auto_check_type", "022"],
  ["event_checklist_items", "owner", "025"],
  ["checklist_template_items", "weeks_before", "024"],
  ["day_notes", "details", "027"],
  ["holidays", "details", "027"],
];

async function probe(select, table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=0`, {
    method: "GET",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return res.ok ? "OK" : "MISSING";
}

const rows = [];
for (const [table, mig] of TABLES) rows.push([table, `migration ${mig}`, await probe("*", table)]);
for (const [table, col, mig] of COLUMNS) rows.push([`${table}.${col}`, `migration ${mig}`, await probe(col, table)]);
rows.push(["seasons.color custom hex", "migration 026", "NOT CHECKABLE read-only (check constraint)"]);

const w = Math.max(...rows.map((r) => r[0].length));
for (const [name, mig, status] of rows) console.log(`${name.padEnd(w)}  ${mig.padEnd(14)}  ${status}`);
const missing = rows.filter((r) => r[2] === "MISSING").length;
console.log(missing ? `\n${missing} item(s) MISSING — see MIGRATIONS_APPLIED.md.` : "\nAll checkable items present.");
process.exit(missing ? 1 : 0);
