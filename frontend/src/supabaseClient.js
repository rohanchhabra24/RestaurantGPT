import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — auth will not work until frontend/.env is configured.");
}

// createClient(undefined, undefined) throws synchronously, which would
// crash the whole app at module load with no error boundary to catch it —
// a permanent blank screen with the reason visible only in devtools. App.jsx
// checks isSupabaseConfigured and shows a real error screen instead of ever
// rendering anything that would touch this null client.
export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null;
