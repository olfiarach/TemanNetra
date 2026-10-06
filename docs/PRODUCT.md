# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Two primary audiences, weighted equally:
- **Blind users** on a phone with a screen reader (TalkBack/VoiceOver) on. They operate the UI entirely without sight.
- **Low-vision users** without a screen reader, who rely on large, high-contrast visuals as much as on audio.

Job: hold one Indonesian Rupiah banknote up to the phone camera and learn its denomination, typically while paying or receiving change.

## Product Purpose
A camera-based reader that tells the user, in Indonesian, which Rupiah banknote they are holding. Success means a correct, confirmed denomination spoken fast enough to use at a counter, and never a wrong announcement.

Status: academic/competition prototype, judged on the concept and a working demo. Recognition accuracy, speech latency and phone support are not measured (see `IMPROVEMENT_STRATEGY.md`).

## Positioning
It announces a note only after 3 consecutive matching single-note frames. Multiple notes or conflicting denominations count as "Nominal belum pasti, coba lagi" ("amount not certain yet, try again") and are never spoken or counted. It favors silence over a wrong number.

## Operating Context
- Phone held in one hand and the note in the other, at shops and markets, in varied and often poor light.
- Frames are captured about every 750 ms while scanning. Speech uses the browser's `SpeechSynthesis` with an Indonesian voice, plus optional vibration.
- Same-origin React/Vite frontend and FastAPI/YOLO backend (`/health`, `/predict`).

## Capabilities and Constraints
- Denominations: Rp1.000, 2.000, 5.000, 10.000, 20.000, 50.000, 100.000.
- Required states: camera permission denied, camera unavailable, insecure context, server unreachable, model unavailable, audio unavailable. Scanning is disabled unless the camera, server and model are ready.
- Controls: start/stop scan, switch camera, **Uji Suara** (test audio), **Ulangi** (repeat last result). The last confirmed result stays visible. Optional bounding-box overlay.
- Must stay a browser web app, with no native build.
- **Open:** the wallet tally is secondary and not a commitment, so a redesign may drop it.

## Brand Commitments
- Name: **TemanNetra**.
- All UI copy and speech are in Bahasa Indonesia only.

## Evidence on Hand
- No held-out evaluation set, no accuracy or latency numbers, and no user testing. `models/best.pt` has undocumented provenance and the dataset is not in the repo. Do not claim accuracy, speed or validation.

## Product Principles
1. Silence beats a wrong answer: only confirmed results are announced or shown as results.
2. Audio and screen-reader output come first. The visual layer must carry the same information for low-vision users.
3. One note, one action: the scan loop is the product, and everything else is secondary.
4. Every failure state names the problem and the fix, in Indonesian.
5. Honest about prototype status: no invented claims.

## Accessibility & Inclusion
- Fully operable with TalkBack and VoiceOver. Confirmed results go to an `aria-live` region without duplicating the spoken output.
- Low vision: very large result text, WCAG AA contrast at minimum (aim for AAA on the result), large touch targets, and no information carried by color alone.
- Visible keyboard/switch focus. Respect `prefers-reduced-motion`. Do not block text selection or zoom.
