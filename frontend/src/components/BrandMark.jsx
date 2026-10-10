import React, { useEffect, useId, useRef, useState } from 'react';

/**
 * TemanNetra brand mark with the pixel2motion draw-on choreography.
 *
 * Geometry is the QA-verified `public/logo.svg` (same actor ids, same final
 * transform: identity). Choreography: container arrives with anticipation and a
 * back-out settle -> note pops -> lens overshoots -> pupils follow through ->
 * guide line draws under the mark. It plays once, then holds the final frame.
 *
 * Accessibility: the announcement is carried by the surrounding text, so the
 * mark itself is decorative. Replays on tap/click/hover. `prefers-reduced-motion`
 * renders the finished logo immediately.
 */

const EASE = {
  linear: (t) => t,
  in3: (t) => t * t * t,
  out3: (t) => 1 - Math.pow(1 - t, 3),
  inout: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t, s = 1.9) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
};

// [[time, value, easing used to reach this key], ...]
const sample = (keys, t) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e1] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      const p = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * EASE[e1 || 'linear'](p);
    }
  }
  return keys[keys.length - 1][1];
};

const T = (px, py, { x = 0, y = 0, sx = 1, sy = 1 } = {}) =>
  `translate(${px + x} ${py + y}) scale(${sx} ${sy}) translate(${-px} ${-py})`;

const DURATION = 1300;

const phase = (t) =>
  t < 150 ? 0 : t < 360 ? 1 : t < 620 ? 2 : t < 1000 ? 3 : t < DURATION ? 4 : 5;

export default function BrandMark({
  size = 64,
  className = '',
  replayOnInteract = true,
  animate = true,
  onComplete,
  style,
  ...rest
}) {
  const svgRef = useRef(null);
  const [phaseIndex, setPhaseIndex] = useState(0);
  // Two marks can be mounted at once (splash + header): SVG ids must not collide,
  // and `url(#gradient)` would otherwise resolve across instances.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (name) => `tn-${name}-${uid}`;
  const cardGrad = id('card-grad');
  const accentGrad = id('accent-grad');
  const reduced =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  // Latest callback without re-running the animation when the parent re-renders.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;

    const el = (id) => svg.querySelector(`#${id}`);
    const parts = {
      card: { node: el(id('card')), px: 64, py: 64 },
      note: { node: el(id('note')), px: 64, py: 56 },
      coin: { node: el(id('coin')), px: 64, py: 56 },
      pupil: { node: el(id('pupil')), px: 64, py: 56 },
      glint: { node: el(id('glint')), px: 56, py: 49 },
    };
    const draws = {
      rayC: el(id('ray-c')),
      rayR: el(id('ray-r')),
      rayL: el(id('ray-l')),
      line1: el(id('line-1')),
      line2: el(id('line-2')),
      line3: el(id('line-3')),
    };

    const renderAt = (t) => {
      const s = (keys) => sample(keys, t);
      const setT = (p, sx, sy = sx) =>
        p.node && p.node.setAttribute('transform', T(p.px, p.py, { sx, sy }));
      const setOp = (p, v) => p.node && p.node.style.setProperty('opacity', v);
      const dash = (node, v) => node && node.style.setProperty('stroke-dashoffset', String(v));

      const cs = s([
        [0, 0.86],
        [140, 0.82, 'in3'],
        [330, 1, 'back'],
      ]);
      setT(parts.card, cs);
      setOp(parts.card, s([[0, 0], [150, 0.5], [300, 1, 'out3']]));

      const ns = s([
        [360, 0.3],
        [580, 1, 'back'],
      ]);
      setT(parts.note, ns);
      setOp(parts.note, s([[360, 0], [430, 1, 'out3']]));

      const cos = s([
        [500, 0],
        [660, 1.16, 'back'],
        [745, 1, 'out3'],
      ]);
      setT(parts.coin, cos);
      setOp(parts.coin, s([[500, 0], [565, 1, 'out3']]));

      const ps = s([
        [590, 0],
        [720, 1, 'back'],
      ]);
      setT(parts.pupil, ps);
      setOp(parts.pupil, s([[590, 0], [655, 1, 'out3']]));

      dash(draws.rayC, s([[620, 1], [790, 0, 'inout']]));
      dash(draws.rayR, s([[700, 1], [870, 0, 'inout']]));
      dash(draws.rayL, s([[780, 1], [950, 0, 'inout']]));
      dash(draws.line1, s([[830, 1], [990, 0, 'inout']]));
      dash(draws.line2, s([[900, 1], [1060, 0, 'inout']]));
      dash(draws.line3, s([[970, 1], [1130, 0, 'inout']]));

      const gs = s([
        [1020, 0],
        [1120, 1.3, 'out3'],
        [1260, 1, 'inout'],
        [1300, 1],
      ]);
      setT(parts.glint, gs);
      setOp(parts.glint, s([[1020, 0], [1090, 0.9, 'out3']]));
    };

    if (reduced || !animate) {
      renderAt(DURATION);
      setPhaseIndex(5);
      onCompleteRef.current?.();
      return undefined;
    }

    let raf = 0;
    let start = 0;
    const step = (now) => {
      if (!start) start = now;
      const t = now - start;
      renderAt(Math.min(t, DURATION));
      setPhaseIndex(phase(t));
      if (t < DURATION) raf = requestAnimationFrame(step);
      else onCompleteRef.current?.();
    };
    renderAt(0);
    raf = requestAnimationFrame(step);

    if (replayOnInteract) {
      const replay = () => {
        cancelAnimationFrame(raf);
        start = 0;
        renderAt(0);
        raf = requestAnimationFrame(step);
      };
      svg.addEventListener('click', replay);
      svg.addEventListener('keydown', replay);
      svg.addEventListener('mouseenter', replay);
      return () => {
        cancelAnimationFrame(raf);
        svg.removeEventListener('click', replay);
        svg.removeEventListener('keydown', replay);
        svg.removeEventListener('mouseenter', replay);
      };
    }
    return () => cancelAnimationFrame(raf);
  }, [reduced, replayOnInteract, animate]);

  return (
    <svg
      ref={svgRef}
      className={className}
      width={size}
      height={size}
      viewBox="0 0 128 128"
      role="img"
      aria-label="TemanNetra"
      data-phase={phaseIndex}
      shapeRendering="geometricPrecision"
      style={{ display: 'block', overflow: 'visible', ...style }}
      {...rest}
    >
      <defs>
        <linearGradient id={cardGrad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0d9488" />
          <stop offset="100%" stopColor="#0f766e" />
        </linearGradient>
        <linearGradient id={accentGrad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
      </defs>

      <g>
        <rect id={id('card')} x="8" y="8" width="112" height="112" rx="24" fill={`url(#${cardGrad})`} />
        <ellipse id={id('note')} cx="64" cy="56" rx="30" ry="20" fill="#fff" />
        <circle id={id('coin')} cx="64" cy="56" r="14" fill={`url(#${accentGrad})`} />
        <circle id={id('pupil')} cx="64" cy="56" r="7" fill="#1e293b" />
        <g fill="none" stroke={`url(#${accentGrad})`} strokeLinecap="round" strokeWidth="2" opacity="0.6">
          <path id={id('ray-c')} pathLength="1" d="M64 40V30" />
          <path id={id('ray-r')} pathLength="1" d="M64 40q8-14 16-14" />
          <path id={id('ray-l')} pathLength="1" d="M64 40q-8-14-16-14" />
        </g>
        <g fill="none" stroke={`url(#${accentGrad})`} strokeLinecap="round" strokeWidth="3">
          <path id={id('line-1')} pathLength="1" d="M42 91.5H70" opacity="1" />
          <path id={id('line-2')} pathLength="1" d="M42 97.5H86" opacity="0.7" />
          <path id={id('line-3')} pathLength="1" d="M42 103.5H62" opacity="0.5" />
        </g>
        <circle id={id('glint')} cx="56" cy="49" r="3.5" fill="#fff" opacity="0.9" />
      </g>
    </svg>
  );
}
