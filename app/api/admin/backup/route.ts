import { requireRoleRoute } from "@/lib/authRoute";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { BACKUP_TABLES, backupOrderColumns } from "@/lib/backupTables";

export const dynamic = "force-dynamic";

// Full data export — every row from every table, as one JSON object keyed
// by table name. This is a developer-restorable safety net (RLS is "allow
// all", so a bad bulk edit/mass-delete has no recovery path beyond the
// session-local Undo history) — not a polished feature. See PROJECT
// decision, CLAUDE.md/ONBOARDING.md context on the passcode gate being a
// deterrent only.
export async function GET() {
  const denied = await requireRoleRoute("editor");
  if (denied) return denied;

  const backup: Record<string, unknown> = { generated_at: new Date().toISOString() };
  // A table that doesn't exist yet (unapplied migration) or errors is skipped
  // with a generic note instead of failing the whole backup. Raw DB error text
  // is only logged, never put in the downloadable file.
  const skipped: Record<string, string> = {};

  await Promise.all(
    BACKUP_TABLES.map(async (table) => {
      try {
        const rows: unknown[] = [];
        // PostgREST caps a response at 1000 rows, so page through.
        for (let from = 0; ; from += 1000) {
          // Stable ORDER BY, or pages can skip/duplicate rows past 1000.
          let query = supabase.from(table).select("*");
          for (const col of backupOrderColumns(table)) query = query.order(col, { ascending: true });
          const { data, error } = await query.range(from, from + 999);
          if (error) throw error;
          rows.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }
        backup[table] = rows;
      } catch (err) {
        console.error(`Backup: table "${table}" skipped`, err);
        backup[table] = [];
        skipped[table] = "query failed";
      }
    }),
  );
  backup.skipped = skipped;
  // True when any table is missing from this file, so it is not a full backup.
  backup.partial = Object.keys(skipped).length > 0;

  const today = new Date().toISOString().slice(0, 10);
  const json = JSON.stringify(backup, null, 2);

  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="evo-backup-${today}.json"`,
    },
  });
}
