"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// A browser Supabase client used ONLY for Realtime (live updates). It connects
// with the PUBLIC anon key — which is safe to expose — and is used purely as a
// pub/sub signal ("this meeting changed"); the actual content is always fetched
// through our authenticated API, never read directly with this key.
//
// If the public env vars aren't set, this returns null and features that use it
// degrade gracefully (no live updates, everything else works).

let _client: SupabaseClient | null | undefined;

export function getBrowserSupabase(): SupabaseClient | null {
  if (_client !== undefined) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    _client = null;
    return null;
  }
  _client = createClient(url, anon, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return _client;
}
