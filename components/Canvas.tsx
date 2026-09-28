'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export type Pt = [number, number];
export interface Stroke { id: string; c: string; w: number; pts: Pt[] }
export type StrokeEvent =
  | { type: 'chunk'; id: string; c: string; w: number; pts: Pt[] }
  | { type: 'undo' }
  | { type: 'clear' };

export const INKS = ['#3A1F3D', '#D93A72', '#F5B041', '#23998C', '#3B8FD6', '#8A63D2'];
const SIZES = [0.008, 0.018, 0.04];

/** Paints strokes (coordinates 0..1) onto a square canvas of `size` px. */
export function paint(ctx: CanvasRenderingContext2D, strokes: Stroke[], size: number) {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    if (!s.pts.length) continue;
    ctx.strokeStyle = s.c;
    ctx.lineWidth = Math.max(1, s.w * size);
    ctx.beginPath();
    ctx.moveTo(s.pts[0][0] * size, s.pts[0][1] * size);
    if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] * size + 0.1, s.pts[0][1] * size);
    for (const [x, y] of s.pts.slice(1)) ctx.lineTo(x * size, y * size);
    ctx.stroke();
  }
}

/** Applies a live stroke event to a list of strokes (used by the TV mirror). */
export function applyStrokeEvent(list: Stroke[], e: StrokeEvent): Stroke[] {
  if (e.type === 'clear') return [];
  if (e.type === 'undo') return list.slice(0, -1);
  const i = list.findIndex((s) => s.id === e.id);
  if (i < 0) return [...list, { id: e.id, c: e.c, w: e.w, pts: e.pts }];
  const copy = list.slice();
  copy[i] = { ...copy[i], pts: [...copy[i].pts, ...e.pts] };
  return copy;
}

export interface DrawPadHandle { exportImage: () => string; isEmpty: () => boolean }

/** Finger drawing pad. Streams stroke chunks through onEvent so the TV can draw along live. */
export const DrawPad = forwardRef<DrawPadHandle, { onEvent?: (e: StrokeEvent) => void; disabled?: boolean }>(
  function DrawPad({ onEvent, disabled }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const strokes = useRef<Stroke[]>([]);
    const current = useRef<Stroke | null>(null);
    const pending = useRef<Pt[]>([]);
    const lastSent = useRef(0);
    const [ink, setInk] = useState(INKS[0]);
    const [size, setSize] = useState(1);
    const [, force] = useState(0);

    const redraw = () => {
      const cv = canvasRef.current; if (!cv) return;
      const ctx = cv.getContext('2d'); if (!ctx) return;
      const px = cv.width;
      paint(ctx, strokes.current, px);
    };

    useEffect(() => {
      const resize = () => {
        const cv = canvasRef.current, wrap = wrapRef.current; if (!cv || !wrap) return;
        const w = wrap.clientWidth;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr);
        cv.style.width = `${w}px`; cv.style.height = `${w}px`;
        redraw();
      };
      resize();
      window.addEventListener('resize', resize);
      return () => window.removeEventListener('resize', resize);
    }, []);

    useImperativeHandle(ref, () => ({
      isEmpty: () => strokes.current.length === 0,
      exportImage: () => {
        const out = document.createElement('canvas');
        out.width = 480; out.height = 480;
        const ctx = out.getContext('2d');
        if (ctx) paint(ctx, strokes.current, 480);
        return out.toDataURL('image/png');
      },
    }));

    const toPt = (e: React.PointerEvent): Pt => {
      const r = canvasRef.current!.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      return [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];
    };
    const flush = () => {
      const s = current.current;
      if (!s || !pending.current.length) return;
      onEvent?.({ type: 'chunk', id: s.id, c: s.c, w: s.w, pts: pending.current });
      pending.current = [];
      lastSent.current = Date.now();
    };

    const down = (e: React.PointerEvent) => {
      if (disabled) return;
      (e.target as Element).setPointerCapture(e.pointerId);
      const pt = toPt(e);
      const s: Stroke = { id: Math.random().toString(36).slice(2, 9), c: ink, w: SIZES[size], pts: [pt] };
      current.current = s;
      strokes.current.push(s);
      pending.current = [pt];
      redraw();
    };
    const move = (e: React.PointerEvent) => {
      const s = current.current; if (!s || disabled) return;
      const pt = toPt(e);
      s.pts.push(pt);
      pending.current.push(pt);
      redraw();
      if (Date.now() - lastSent.current > 90) {
        const tail = pending.current[pending.current.length - 1];
        flush();
        pending.current = [tail]; // keep continuity between chunks
      }
    };
    const up = () => {
      flush();
      current.current = null;
      pending.current = [];
      force((x) => x + 1);
    };

    return (
      <div className="drawpad">
        <div ref={wrapRef} className="drawpad-canvas">
          <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            aria-label="Drawing area" role="img" />
        </div>
        <div className="drawpad-tools">
          <div className="inks">
            {INKS.map((c) => (
              <button key={c} className={`ink ${ink === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Color ${c}`} onClick={() => setInk(c)} />
            ))}
          </div>
          <div className="inks">
            {SIZES.map((_, i) => (
              <button key={i} className={`size ${size === i ? 'on' : ''}`} aria-label={['Thin', 'Medium', 'Thick'][i]} onClick={() => setSize(i)}>
                <i style={{ width: 6 + i * 6, height: 6 + i * 6 }} />
              </button>
            ))}
            <button className="tool" onClick={() => { strokes.current.pop(); redraw(); onEvent?.({ type: 'undo' }); force((x) => x + 1); }}>Undo</button>
            <button className="tool" onClick={() => { strokes.current = []; redraw(); onEvent?.({ type: 'clear' }); force((x) => x + 1); }}>Clear</button>
          </div>
        </div>
      </div>
    );
  }
);

/** Read-only view of strokes, redrawn whenever they change. */
export function StrokeView({ strokes, className }: { strokes: Stroke[]; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    paint(ctx, strokes, cv.width);
  }, [strokes]);
  return <canvas ref={ref} width={900} height={900} className={className} aria-label="Live drawing" role="img" />;
}
