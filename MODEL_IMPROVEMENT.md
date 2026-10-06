# TemanNetra: model improvement plan

For model quality, prioritize **data and decision safety before architecture**. A faster wrong announcement is worse UX for a blind user.

## Highest-impact improvements

### 1. Build a real dataset around usage conditions

Collect images and videos of all seven denominations with:

- Different lighting: daylight, indoor, backlight, shadows, and low light.
- Different distances and angles.
- Wrinkled, folded, worn, dirty, and partially occluded notes.
- Different backgrounds: tables, hands, clothing, wallets, and clutter.
- Notes near frame edges and partially outside the frame.
- Different camera phones and resolutions.
- No-note scenes and visually similar objects.

Split by **physical banknote and capture session**, not random frames. Randomly splitting video frames leaks nearly identical images into training and validation.

Recommended initial target:

- Several hundred diverse examples per denomination.
- A separate held-out set containing no images or videos from training sessions.
- Hard-negative examples deliberately added after every evaluation round.

### 2. Remove label ambiguity completely

The model must output canonical denominations directly:

```text
1000
2000
5000
10000
20000
50000
100000
```

Do not infer denomination from class index or alphabetical order.

At startup:

- Read the model's class names.
- Require an exact supported mapping.
- Reject duplicate, missing, or unknown denominations.
- Expose `model unavailable` when validation fails.

A model that detects a note but maps it to the wrong denomination is worse than one that reports uncertainty.

### 3. Add an explicit unknown/no-usable-note outcome

Do not force every detected object into one of seven denominations.

The system needs at least these outcomes:

```text
no_note
uncertain
known_denomination
invalid_model
```

Train and evaluate against:

- Empty scenes.
- Hands without notes.
- Wallets.
- Paper resembling banknotes.
- Screens displaying banknotes.
- Coins and receipts.
- Partially visible notes.

The correct behavior for uncertain input is silence or a short retry prompt—not a guessed denomination.

### 4. Calibrate confidence per denomination

Raw YOLO confidence is not automatically a reliable probability.

Measure on the held-out set:

- Correct detection rate per denomination.
- Wrong-denomination rate.
- False-announcement rate in no-note scenes.
- Miss rate.
- Confidence distributions for correct and incorrect predictions.
- Detection-to-speech latency.

Use per-class thresholds if needed. A visually difficult denomination may require stronger evidence than an easy one.

Optimize for:

```text
false spoken denomination
```

as the primary safety metric, not only mAP.

### 5. Use temporal evidence

For a camera stream, aggregate predictions over several frames instead of trusting one frame.

A safe first policy:

- Require the same denomination across 3–5 usable frames.
- Require a minimum confidence on every contributing frame.
- Require the bounding box to remain reasonably stable.
- Reset confirmation when the note disappears or the denomination changes.
- Announce once per physical appearance.
- Require a new appearance before announcing the same stationary note again.

This is partly application logic, but it improves effective model reliability more than changing architectures prematurely.

### 6. Improve speed with measurement, not guesswork

Benchmark these combinations on the target phone/host:

- Input sizes such as `320`, `416`, and `640`.
- YOLO model sizes such as nano/small.
- FP32 versus FP16.
- ONNX or another supported optimized runtime.
- JPEG quality and image dimensions.
- Inference every frame versus every second or third frame.

Measure:

```text
capture → upload → inference → confirmation → audible speech
```

For blind UX, perceived latency matters more than maximum FPS. A stable 5–10 FPS with dependable confirmation may be better than inconsistent high FPS.

### 7. Crop intelligently after first detection

A two-stage approach may improve accuracy:

1. A lightweight detector finds the banknote.
2. Crop the detected note.
3. A small classifier identifies the denomination.

This can outperform a single detector when notes occupy a small part of the frame, or when backgrounds are complex.

Do not add this until a single detector has been measured. It adds latency and another failure mode.

### 8. Use realistic augmentation

Useful augmentations:

- Brightness and contrast changes.
- Shadows and glare.
- Blur from hand movement.
- Small rotations and perspective changes.
- Scale variation.
- Partial occlusion.
- JPEG compression.

Avoid unrealistic transformations that damage identifying features. Excessive hue shifts can create banknotes that do not exist in reality and teach the model the wrong color cues.

### 9. Do not depend on color alone

Color filtering is fragile under:

- Warm indoor lighting.
- Camera white-balance changes.
- Faded or dirty notes.
- Shadows.
- Different phone cameras.

Use color only as supporting evidence. Shape, printed denomination details, layout, and learned visual features should carry the decision.

### 10. Evaluate UX-specific model behavior

Create an acceptance table like this:

| Scenario | Required behavior |
| --- | --- |
| Clear single note | Speak correct denomination once |
| Note moved briefly | Wait for stable confirmation |
| No note | Never speak denomination |
| Ambiguous note | Say retry/uncertain, never guess |
| Wrong high-confidence prediction | Must not pass confirmation |
| Same note remains still | Do not repeat automatically |
| Note removed and reinserted | Speak once after reconfirmation |
| Two notes visible | Stay uncertain until explicitly supported |
| Note partly outside frame | Guidance or uncertainty, not guessing |

## Recommended order

1. Dataset and held-out evaluation set.
2. Exact class-name validation.
3. Unknown/no-note handling.
4. Temporal confirmation.
5. Per-class threshold calibration.
6. Input-size and runtime benchmarking.
7. Only then test a larger model or two-stage detector.

The biggest likely gain is not a newer architecture. It is **better representative data, hard negatives, calibrated rejection, and temporal confirmation**.

## Model acceptance criterion

> No denomination is spoken unless the held-out evaluation shows stable repeated evidence, and the measured false-announcement rate on no-note and ambiguous scenes is acceptably low.

## Deferred scope

Counterfeit detection, multi-note counting, and on-device model redesign should wait until the one-note task has measured evidence.
