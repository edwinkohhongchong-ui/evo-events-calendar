import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// This is a live, mutable calendar — reads must never be served from Next.js's
// fetch cache (it defaults to caching indefinitely by URL+params, which means
// a revisited ?year=&month= page can silently serve pre-write data even after
// a successful mutation). Forcing `cache: "no-store"` here is more robust than
// relying on route segment config, since it holds regardless of where this
// client is called from.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
  },
});
