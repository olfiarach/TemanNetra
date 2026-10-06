# TemanNetra Render Free-Tier Deployment Design

- **Date:** 2026-10-06
- **Status:** Proposed; implementation requires written-spec approval
- **Audience:** Public academic demo

## Intent and success criteria

TemanNetra should be reachable from a phone through one public HTTPS URL. A visitor must be able to grant camera permission, scan a banknote, and receive a response from the existing FastAPI/YOLO backend without configuring a local network or separate API URL.

This is a prototype deployment, not a production assistive-technology service. The UI and README must continue to state that recognition accuracy, latency, and phone support are not independently validated.

Success means:

1. The built React application loads from the public Render URL.
2. `/health` and `/predict` use the same origin and work from a phone over HTTPS.
3. The backend loads the compatible `models/best.pt` artifact before reporting model readiness.
4. After an idle shutdown, the first request communicates that the server is starting instead of appearing permanently broken.
5. Oversized uploads, invalid images, and unavailable model state remain rejected by the existing backend safeguards.
6. No camera frames or user wallet data are persisted by the deployment.

## Chosen architecture

Use one Render **Web Service** backed by one Docker image:

```text
Phone browser
    |
    | HTTPS, same origin
    v
Render Web Service
    |
    +-- FastAPI serves the built Vite files
    +-- /health
    +-- /predict
    +-- /tts
    +-- YOLO model loaded once per process
```

The frontend must call relative paths only. The production container must not use the Vite development proxy or a hard-coded `127.0.0.1` address.

FastAPI serves the frontend build because this keeps the deployment to one service and avoids CORS, cross-service failure modes, and a second public API endpoint. Render supplies TLS and the public hostname.

## Free-tier behavior

Render free services sleep after 15 minutes without incoming traffic. The next request wakes the service; it does not require a 15-minute wait. The first request can take approximately a minute while the container starts and loads PyTorch and the model. Warm requests do not incur that startup delay.

The frontend should treat a failed or slow initial health check as a recoverable **server starting/unreachable** state and retry with bounded backoff. It must not start camera scanning until health confirms `model_ready: true`.

Do not add a keep-alive job. It defeats scale-to-zero, is unreliable, and is unnecessary for an academic demo.

## Container shape

Add a production Dockerfile at the repository root with these stages:

1. **Frontend build stage:** install from `frontend/package-lock.json`, run `npm run build`.
2. **Python runtime stage:** install `backend/requirements.txt`, copy the backend, model artifact, and frontend `dist` output.
3. **Runtime command:** start Uvicorn on `0.0.0.0` and the port supplied by Render (`$PORT`).

The image must not include the local macOS virtual environment, frontend `node_modules`, test caches, training data, or generic `yolov8n.pt` as a detector fallback. Add a `.dockerignore` covering those paths.

The existing startup model validation remains authoritative: a missing or incompatible `best.pt` must produce `model_unavailable`, not a false ready state.

## Model artifact delivery

`models/best.pt` is currently ignored by Git and is not available to a clean checkout. The deployment cannot be reproducible until the artifact has a documented source.

Use one explicit build-time model source:

- Prefer a versioned public release asset or model registry URL supplied through Render configuration.
- Download it during the image build only when the configured source is present.
- Verify the downloaded file with a documented SHA-256 checksum.
- Fail the build when the artifact is absent or its checksum is wrong.

Do not silently download a generic YOLO model or train during deployment. Do not put private credentials in the image or repository; use Render secrets if the chosen artifact source is private.

The deployment README must record the artifact source, checksum, model class names, and date of the deployed artifact.

## Runtime and request controls

Keep the existing upload limits: 5 MB compressed input and 25 megapixels decoded image size. Preserve `503` for unavailable model state and `400`/`413` for invalid or oversized input.

Configure one Render service with a single process and conservative concurrency. The model is CPU-bound and the free instance is shared by public visitors; serial inference is safer than allowing unbounded concurrent prediction requests. The exact memory and timeout values must be verified against Render's current service limits during deployment rather than guessed in code.

Because the service is public and has no user authentication, add a small in-process request limiter for prediction requests if the existing code has no equivalent. It should fail closed with `429` after a modest per-client burst and use bounded memory. This is abuse reduction, not security isolation; multiple Render instances would have independent counters.

Do not add persistence, accounts, analytics, or a database for this deployment.

## Frontend behavior during cold start

The existing status model should expose a distinct Indonesian message for the startup/unreachable condition, for example:

> Server sedang memulai. Tunggu sebentar lalu coba lagi.

Health polling must stop when the page is hidden or the component is unmounted. Once health reports a ready model, the user can start scanning. If health later fails, scanning stops and the last confirmed result remains visible.

No result may be announced merely because the service returned from sleep. Recognition and speech behavior remain governed by the existing confirmation rules.

## Security and privacy

- HTTPS is provided by Render and is required for phone camera access.
- Serve frontend and API from the same origin; do not add wildcard CORS.
- Do not log uploaded image contents, raw request bodies, or speech text beyond what is required for operational errors.
- Keep upload size and decoded-pixel limits enforced before inference.
- Keep model and frontend assets public only to the extent required by the chosen deployment repository; never commit secrets.
- Add an explicit public-demo disclaimer that results are experimental and must not be used as financial verification.

## Verification plan

Before calling the deployment complete:

1. Run the existing backend unit tests.
2. Run the existing frontend tests and production build.
3. Build the production container from a clean checkout with the documented model artifact.
4. Start the container locally with a non-default `PORT`; verify `/health`, frontend loading, and `/predict` using the checked-in sample images.
5. Deploy to Render and verify the public HTTPS page from a phone.
6. Verify camera permission, health readiness, one known-note prediction, denied camera permission, invalid upload, and model-unavailable behavior.
7. Leave the service idle for at least 15 minutes, then load it again and verify the cold-start message and eventual recovery.
8. Record observed cold-start time, prediction latency, and any device/browser limitation without presenting them as accuracy measurements.

## Explicit non-goals

- No production uptime guarantee.
- No on-device inference or offline mode.
- No wallet persistence.
- No multi-note or counterfeit detection.
- No claims of recognition accuracy without a held-out evaluation set.
- No keep-alive workaround for Render sleeping.
- No separate frontend/API services unless the single-container approach fails a measured deployment constraint.

## Rollback

Render rollback is a previous successful deployment. Keep the model artifact checksum and container revision associated with each deployment so a known-good image can be selected without changing application behavior.
