import { useSyncExternalStore } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { RoomView } from './game';

/** Tiny shared store so side features (the music player) can see the room without threading props everywhere. */
export interface BusState { room?: string; token?: string; slot?: number; ch?: RealtimeChannel | null; view?: RoomView | null }
type EventFn = (event: string, payload: Record<string, unknown>) => void;

function createBus() {
  let state: BusState = {};
  const subs = new Set<() => void>();
  const evs = new Set<EventFn>();
  return {
    get: () => state,
    set(patch: BusState) { state = { ...state, ...patch }; subs.forEach((f) => f()); },
    subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
    emit(event: string, payload: Record<string, unknown>) { evs.forEach((f) => f(event, payload)); },
    onEvent(f: EventFn) { evs.add(f); return () => { evs.delete(f); }; },
    send(event: string, payload: Record<string, unknown>) { state.ch?.send({ type: 'broadcast', event, payload }); },
  };
}
export type Bus = ReturnType<typeof createBus>;
export const tvBus = createBus();
export const phoneBus = createBus();
export function useBus(bus: Bus) { return useSyncExternalStore(bus.subscribe, bus.get, bus.get); }
