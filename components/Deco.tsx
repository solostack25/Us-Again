import type { CSSProperties } from 'react';

/** Slow drifting hearts behind a screen. Deterministic so server and client render the same. */
export function Hearts({ count = 16 }: { count?: number }) {
  return (
    <div className="hearts" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 37 + 7) % 100}%`,
            animationDelay: `-${(i * 1.9) % 14}s`,
            animationDuration: `${13 + ((i * 5) % 10)}s`,
            fontSize: `${16 + ((i * 7) % 26)}px`,
          }}
        >♥</span>
      ))}
    </div>
  );
}

/** A small burst of hearts for a celebratory moment. Re-mount it (via key) to replay. */
export function Burst() {
  return (
    <span className="burst" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <i key={i} style={{ '--a': `${i * 36}deg`, '--d': `${(i % 3) * 60}ms` } as CSSProperties}>♥</i>
      ))}
    </span>
  );
}

export const tintStyle = (tint: string) => ({ '--tint': tint } as CSSProperties);
