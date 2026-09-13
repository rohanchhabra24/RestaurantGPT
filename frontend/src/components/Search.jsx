import { useEffect, useRef, useState } from "react";

/* ══ Seek ═════════════════════════════════════════════════
   A search icon that becomes a search field.
   Ported from bencho.dev's Search.tsx (MIT — bencho.dev/licence),
   types stripped for this project's plain-JSX codebase. Sized down
   from the showcase defaults (SHUT 64 / WIDE 320) to fit this app's
   34px control scale and a 240px sidebar rather than a standalone card
   — see the `width`/`corner` defaults below.

   ONE OBJECT, NOT TWO. Everything here follows from that. The
   obvious build is an icon that fades out and an input that
   fades in, and it is obvious because it is easy — but two
   things swapping is never mistaken for one thing changing,
   however well the crossfade is tuned. So there is a single
   box whose WIDTH is the state, and the icon and the field
   are both inside it the whole time.

   Which turns the interesting problems into geometry rather
   than choreography:

   · The lens never moves relative to the box. It sits at a
     fixed inset from the left edge, and at the closed width
     that inset happens to centre it — (SHUT - LENS) / 2 is the
     same number as the field's own left padding. So one number
     is both "centred in a circle" and "aligned in a field", and
     the lens travelling leftward across the page is not an
     animation anybody wrote. It is the box growing around a
     mark that stayed put.

   · The box grows from its middle, so the composition stays
     centred at every frame. Growing from the left would pin
     the lens and throw the field off-centre; growing from the
     right would slide the lens across the page. Neither is
     the object transforming, and both are what you get by
     accident.

   · Height never changes and the corner is fully round at
     every width, so the SHAPE is one rule rather than a tween
     with two ends. At SHUT it is a circle and at the open width
     a pill, and those are the same statement.

   The press is a real beat. A click compresses the object for
   a moment before it expands, because a thing that yields
   before it moves reads as having been pushed, and a thing
   that only moves reads as having been triggered. */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* The closed object: a circle, so the width IS the height. This app's
   controls (buttons, avatar) sit at 34px, so that's SHUT here rather
   than the showcase's 64 — this is meant to sit among them, not stand
   alone on a card. */
const SHUT = 34;
const LENS = 15;
const INSET = (SHUT - LENS) / 2;
const CORNER = 17;
const WIDE = 216;
const SNUG = 216;

/* ── one spring, for everything that settles ───────────────
   Frames, not milliseconds. `dt` is expressed in sixtieths of
   a second and the damping is RAISED to it rather than
   multiplied by it, so a dropped frame decays the same amount
   of energy as the two frames it replaced. */
const springOf = (tune) => ({
  k: 0.08 + (tune / 100) * 0.16,
  d: 0.62 + (tune / 100) * 0.2,
});

function useSpring(target, tune = 50, instant = false) {
  const [at, setAt] = useState(target);
  const cur = useRef(target);
  const vel = useRef(0);
  const raf = useRef(0);

  useEffect(() => {
    if (instant) {
      cur.current = target;
      vel.current = 0;
      setAt(target);
      return;
    }
    const { k, d } = springOf(tune);
    let prev = 0;
    const tick = (t) => {
      const dt = prev ? clamp((t - prev) / 16.67, 0, 2.5) : 1;
      prev = t;
      vel.current += (target - cur.current) * k * dt;
      vel.current *= Math.pow(d, dt);
      cur.current += vel.current * dt;
      if (Math.abs(target - cur.current) < 0.02 && Math.abs(vel.current) < 0.02) {
        cur.current = target;
        vel.current = 0;
        setAt(target);
        raf.current = 0;
        return;
      }
      setAt(cur.current);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, [target, tune, instant]);

  return at;
}

const stillness = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function Search({
  give = 50,
  spring = 50,
  width,
  corner = CORNER,
  value: controlledValue,
  onChange,
  placeholder = "Search",
}) {
  const [snug, setSnug] = useState(
    () => typeof window !== "undefined"
      && window.matchMedia("(max-width: 760px)").matches,
  );
  const [touch, setTouch] = useState(
    () => typeof window !== "undefined"
      && window.matchMedia("(pointer: coarse)").matches,
  );
  useEffect(() => {
    const room = window.matchMedia("(max-width: 760px)");
    const coarse = window.matchMedia("(pointer: coarse)");
    const read = () => { setSnug(room.matches); setTouch(coarse.matches); };
    room.addEventListener("change", read);
    coarse.addEventListener("change", read);
    return () => {
      room.removeEventListener("change", read);
      coarse.removeEventListener("change", read);
    };
  }, []);
  const span = width ?? (snug ? SNUG : WIDE);

  const frame = useRef(null);
  const field = useRef(null);
  const beat = useRef(0);
  const rest = useRef(0);

  const [open, setOpen] = useState(false);
  const [press, setPress] = useState(false);
  const [innerValue, setInnerValue] = useState("");
  const value = controlledValue ?? innerValue;
  const [busy, setBusy] = useState(false);
  const [lean, setLean] = useState({ x: 0, y: 0 });
  const still = stillness();

  useEffect(() => () => {
    window.clearTimeout(beat.current);
    window.clearTimeout(rest.current);
  }, []);

  const target = open ? Math.max(SHUT, span) : SHUT;
  const w = useSpring(target, clamp(spring, 0, 100), still);
  const p = clamp((w - SHUT) / Math.max(1, Math.max(SHUT, span) - SHUT), 0, 1);

  /* ── the magnet ── measured from the FRAME, which never moves */
  useEffect(() => {
    const el = frame.current;
    if (!el || open || still) return;
    let raf = 0;
    let at = { x: 0, y: 0 };
    const publish = () => { raf = 0; setLean(at); };
    const read = (e) => {
      const b = el.getBoundingClientRect();
      const k = b.width / (el.offsetWidth || b.width) || 1;
      const dx = (e.clientX - (b.left + b.width / 2)) / k;
      const dy = (e.clientY - (b.top + b.height / 2)) / k;
      const d = Math.hypot(dx, dy);
      const R = 90;
      if (d > R) {
        if (at.x || at.y) { at = { x: 0, y: 0 }; if (!raf) raf = requestAnimationFrame(publish); }
        return;
      }
      const pull = (1 - d / R) ** 1.4 * (2 + (give / 100) * 5);
      at = { x: (dx / (d || 1)) * pull, y: (dy / (d || 1)) * pull };
      if (!raf) raf = requestAnimationFrame(publish);
    };
    const gone = () => { at = { x: 0, y: 0 }; if (!raf) raf = requestAnimationFrame(publish); };
    document.addEventListener("pointermove", read, { passive: true });
    document.addEventListener("pointerleave", gone);
    return () => {
      document.removeEventListener("pointermove", read);
      document.removeEventListener("pointerleave", gone);
      cancelAnimationFrame(raf);
    };
  }, [open, give, still]);

  const start = () => {
    if (open) return;
    setPress(true);
    window.clearTimeout(beat.current);
    beat.current = window.setTimeout(() => {
      setPress(false);
      setOpen(true);
      field.current?.focus();
    }, still ? 0 : 90);
  };

  const away = () => {
    if (value.trim()) return;
    setOpen(false);
  };

  const tapped = () => {
    if (!busy) setBusy(true);
    window.clearTimeout(rest.current);
    rest.current = window.setTimeout(() => setBusy(false), 340);
  };

  function handleChange(e) {
    if (onChange) onChange(e.target.value);
    else setInnerValue(e.target.value);
    tapped();
  }

  function clearAndClose() {
    if (onChange) onChange("");
    else setInnerValue("");
    setOpen(false);
    field.current?.blur();
  }

  return (
    <div className="sek-wrap">
      <div
        className="sek"
        ref={frame}
        data-open={open}
        data-press={press}
        data-busy={busy}
        data-flat={still || undefined}
        style={{
          "--sek-r": `${clamp(corner, 0, CORNER)}px`,
          "--w": `${w.toFixed(2)}px`,
          "--p": p.toFixed(3),
          "--say": clamp((p - 0.55) / 0.45, 0, 1).toFixed(3),
          "--lx": `${lean.x.toFixed(2)}px`,
          "--ly": `${lean.y.toFixed(2)}px`,
          "--inset": `${INSET}px`,
          "--lens": `${LENS}px`,
          "--shut": `${SHUT}px`,
          "--frame": `${Math.max(SHUT, span)}px`,
          "--frameh": `${SHUT}px`,
        }}
      >
        <div className="sek-skin">
          <svg className="sek-lens" viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="7.6" cy="7.6" r="5.4" />
            <path d="M11.6 11.6 L15.4 15.4" />
          </svg>

          <input
            ref={field}
            className="sek-field"
            type="text"
            value={value}
            placeholder={placeholder}
            aria-label={placeholder}
            inputMode={touch ? "none" : undefined}
            tabIndex={open ? 0 : -1}
            onChange={handleChange}
            onBlur={away}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              e.preventDefault();
              clearAndClose();
            }}
          />

          {!open && (
            <button className="sek-hit" aria-label={placeholder} onClick={start} type="button" />
          )}
        </div>
      </div>
    </div>
  );
}
