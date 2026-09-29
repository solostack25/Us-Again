'use client';

import { useEffect, useState } from 'react';
import { phoneBus, useBus } from '@/lib/bus';

const IN_GAME = ['write', 'reveal', 'mapReveal', 'draft', 'play'];

/** Small "Menu" button on phones during any game, with a confirm step. */
export function QuitGame() {
  const bus = useBus(phoneBus);
  const [sure, setSure] = useState(false);
  const phase = bus.view?.state.phase;
  const v = bus.view?.state.v;
  useEffect(() => { setSure(false); }, [phase]);
  if (!bus.room || !phase || !IN_GAME.includes(phase)) return null;
  const quit = () => { phoneBus.send('action', { a: { type: 'menu' }, v }); setSure(false); };
  return (
    <div className="quit">
      {sure ? (
        <div className="quit-confirm" role="dialog" aria-label="Quit this game">
          <span>Quit this game for both of you?</span>
          <button className="tool" onClick={() => setSure(false)}>Keep playing</button>
          <button className="tool danger" onClick={quit}>Quit to menu</button>
        </div>
      ) : (
        <button className="quit-btn" onClick={() => setSure(true)}>☰ Menu</button>
      )}
    </div>
  );
}
