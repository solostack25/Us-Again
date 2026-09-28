import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function sb(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return client;
}

/** Calls one of the us_again_* database functions. Throws with the Postgres error message (e.g. "room_full"). */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** Broadcast channel for one room. Carries only signals, never answer text. */
export function roomChannel(roomId: string) {
  return sb().channel(`us-again:${roomId}`, { config: { broadcast: { self: false } } });
}
