FROM node:20-slim AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 OMP_NUM_THREADS=1 MALLOC_ARENA_MAX=2
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 curl \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt backend/
# CPU-only torch keeps the image ~2 GB smaller
RUN pip install --extra-index-url https://download.pytorch.org/whl/cpu -r backend/requirements.txt

# Model artifact: required, checksum-verified. No generic fallback.
ARG MODEL_URL
ARG MODEL_SHA256
RUN test -n "$MODEL_URL" -a -n "$MODEL_SHA256" || (echo "MODEL_URL and MODEL_SHA256 are required" && exit 1); \
    mkdir -p models && curl -fsSL "$MODEL_URL" -o models/best.pt \
    && echo "$MODEL_SHA256  models/best.pt" | sha256sum -c -
COPY models/thresholds.json models/
COPY backend/ backend/
COPY --from=web /app/frontend/dist frontend/dist

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --proxy-headers --forwarded-allow-ips='*'"]
