# TemanNetra logo motion spec

Produced with the pixel2motion workflow (Phase 1 → 3), adapted to the two facts that
differ from the skill's default case.

## Phase 1 — source and brief

**No raster source exists.** TemanNetra's mark was already vector and hand-authored, and
an actual favicon set was absent. So there is no trace/refit/IoU gate to run: Phase 2 is
a *structured re-fit of the existing vector*, not a pixel trace. Two consequences are
recorded here honestly:

- `scripts/qa/gen_favicons.py` rasterizes **from** `public/logo.svg`, so icons and the
  in-app mark cannot drift apart. There is no source raster to overlay against, hence no
  `fit_iterations/*.png` or IoU number — those artifacts would be fabricated.
- The smoothness gate was applied by inspection: the shipped mark is pure primitives
  (one `<rect rx>`, one `<ellipse>`, two `<circle>`, six 2-segment `<path>` strokes).
  Zero pixel-grid line runs, so it passes trivially, and it is kept that way on purpose.

**Semantic parts / cast of actors** (recovered from the old file and re-scoped):

| id | actor | role in the reveal |
|---|---|---|
| `#card` | teal rounded note-card | container: the anchor the whole mark lands on |
| `#note` | white ellipse | the banknote: pops in second |
| `#coin` | orange lens | the scanner: overshoots, then settles |
| `#pupil` | dark centre | follow-through partner of the lens |
| `#rays` (`#ray-c/r/l`) | 3 white-equivalent sight strokes | drawn outward *from* the lens |
| `#lines` (`#line-1/2/3`) | denomination lines | drawn left→right under the note |
| `#glint` | specular dot | secondary action / ambient life |

**Personality words:** reassuring, legible, purposeful, calm — this is assistive software
for blind and low-vision users. Motion must not be flashy, bouncy for its own sake, or
faster than the spoken announcements that carry the real information.

**Motion-ready structure changes made to `logo.svg`** (ids added, no geometry changed):

- Every semantic part is its own element with a stable id; nothing is targeted by
  positional selectors.
- The 3 rays and the 3 denomination lines each carry `pathLength="1"`, so the draw-on is
  `stroke-dashoffset: 1 → 0` regardless of true path length.
- The 3 denomination lines were `<rect height="3" rx="1.5">` (a rounded rect cannot be
  dash-drawn cleanly); they are now round-capped `<path>`s at the same x/y extents and
  stacking, with `pathLength="1"`.
- Draw directions were verified: ray paths start at the lens (`M64 40…`) and open
  outward; line paths start at `x=42` and run right. Both match the intended pen travel.
- Two gradients were renamed to `tn-card` / `tn-accent` and reused for both stroke and
  fill (one fewer gradient definition than the original).
- Dropped the unused third gradient from the old file.

## Phase 3 — choreography

One 1300 ms act, driven by an explicit JS timeline (no CSS `@keyframes` for the hero:
per the skill's literal-easing rule, timing functions inside `@keyframes` silently
degrade to linear in Chromium).

| time | beat | actor | principle |
|---|---|---|---|
| 0–140 ms | staging hold, card at 86 % and fading in | `#card` | staging, slow in |
| 140–330 ms | card dips to 82 % | `#card` | anticipation |
| 300–330 ms | card arrives at 100 % on a back-out | `#card` | squash & stretch, slow in/out |
| 360–580 ms | note pops 30 % → 100 %, opacity 0 → 1 | `#note` | overlap (not lockstep with card) |
| 500–745 ms | lens overshoots to 116 %, settles to 100 % | `#coin` | arcs, follow through, appeal |
| 590–720 ms | pupil trails the lens | `#pupil` | follow through / overlapping action |
| 620/700/780 → 790/870/950 ms | rays drawn outward, staggered 80 ms | `#rays` | slow in/out, staging |
| 830/900/970 → 990/1060/1130 ms | lines drawn left→right, staggered 70 ms | `#lines` | slow in/out |
| 1020–1260 ms | glint pulses to 130 % and settles | `#glint` | secondary action |
| 1260–1300 ms | settle / hold | all | hold on the final frame |

**Easing tokens:** `out3` `1-(1-t)^3` (admission and arrival), `in3` `t^3` (anticipation
dip), `back` `s=1.9` (pops and the lens overshoot), `inout` cubic (pen travel), `linear`
(holds). The slider drives playback **rate**, not the curve, so a slowed run shows the
same choreography.

**Overshoot bound:** the largest excursion is the lens at 1.16 of the final radius
(+16 %), inside viewBox at x 43.76–84.24. Nothing clips mid-flight — checked on the
captured frames.

## Final Frame Contract

The final frame is the QA-verified static vector, not an approximation of it: every
actor is pinned to exactly `scale(1)` with `translate(0)`, i.e. the identity transform
space of `logo.svg`. Gate result: `?t=1300` and `?static=1` captured with the same tool,
viewport and DPR differ by **0 pixels of 32400**.

## Atomic motions (showcase studies)

| atom | part(s) | principle |
|---|---|---|
| hover lift | whole mark, in a labelled box | appeal, anticipation |
| ambient pulse | whole mark | secondary action (replacement for the old `breathe` keyframe) |
| arc sway | whole mark, ±7° | arcs |
| press squash | whole mark, `scale(1.14,.88)` | squash & stretch |

Atoms share a `no-id` glyph (`#tn-glyph` + `*-b` gradients) cloned with a plain
`<use href>`, so nothing duplicates the hero's ids.

## Tunable controls

- **Putar ulang** — deterministic restart (also tap/click on the mark).
- **Lambat 0,25×** — toggles to 0.25×.
- **Kecepatan** slider — 0.10×–1.50×, default 0.50×. Applies to the *running* animation.

## Accessibility (this is the point of the product)

- The mark is decorative: `aria-hidden` in the app, and the announcement lives in the
  splash text and the fixed TTS clips. Motion never carries information on its own.
- `prefers-reduced-motion: reduce` renders the finished static logo immediately; the
  showcase also disables its atom animations.
- No new user-facing copy.

## QA evidence and how to reproduce

```bash
cd frontend
python3 scripts/qa/p2m_qa.py --all        # frames, easing probe, contract, ink sweep
python3 scripts/qa/gen_favicons.py        # rebuilds the icon set from logo.svg
```

Artifacts in `frontend/outputs/`: `motion_frames/`, `motion_strip.png`,
`arrival_strip.png`, `final_render.png`, `html_render.png`, `ink_sweep.json`,
`favicon_sheet.png`, `app_final_vs_svg.png`.

Gate results on the shipped build:

- **Easing probe** — `ray-c` dashoffset reads 0.948 / 0.000 / 0.000 and `line-3` reads
  1 / 1 / 0 at t = 660 / 790 / 1130. Different values per timestamp = the staged timeline
  is really applied (a dropped easing shows the linear window fraction everywhere).
- **Ink-delta continuity sweep** — 130 samples at 10 ms across all six handoff windows,
  no stall+pop. The only flagged window was the card arrival at t = 20–150 ms: an
  alpha-admission fade with no pen involved (the scale curve is monotone; confirmed on
  `arrival_strip.png`). The gate is therefore scoped to the stroke-handoff windows, where
  the stall+pop signature actually has meaning.
- **Final Frame Contract** — 0 px diff, same pipeline.
- **App smoke check** — reduced-motion mounts at `data-phase=5` with the card transform
  at `matrix(1,0,0,1,0,0)`; the header mark's final render vs the static `logo.svg`
  differs by max 17/255 (≈6.7 %) per channel at identical size, entirely antialiasing on
  the 40 px raster grid (see `outputs/app_final_vs_svg.png`).

## Known limits

- The favicon rasterization renders the SVG at 1× DPR through Chromium; very small
  favicon bitmaps are legacy-tab fallbacks and the SVG is the preferred icon.
- `logo_motion.html` is a review surface, not shipped app code. The shipped motion is
  `src/components/BrandMark.jsx`, which mirrors the same keyframe table.
