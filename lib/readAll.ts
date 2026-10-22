import { supabase } from "./supabase";

// PostgREST returns at most this many rows per request, silently, so a bare
// select("*") on a growing table quietly drops the rest.
export const READ_PAGE = 1000;

// Minimal shape of the Supabase client that readAll uses, so tests can pass a fake.
interface PagedClient {
  from(table: string): {
    select(columns: string): {
      order(column: string): {
        range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>;
      };
    };
  };
}

/**
 * Reads every row of a table, a page at a time, ordered by id so pages don't
 * overlap. Throws a generic error (and logs the driver message server-side)
 * when any page fails: callers that build a calendar from the rows must not
 * proceed on a partial list.
 */
export async function readAll<T>(table: string, columns = "*", client: PagedClient = supabase as unknown as PagedClient): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += READ_PAGE) {
    const { data, error } = await client.from(table).select(columns).order("id").range(from, from + READ_PAGE - 1);
    if (error) {
      console.error(`reading ${table} failed:`, error.message);
      throw new Error("Could not read the calendar. Please try again.");
    }
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < READ_PAGE) return rows;
  }
}
