# syntax=docker/dockerfile:1
# Built with the REPO ROOT as build context (see docker-compose.yml), not
# python-service/ itself — main.py resolves its model paths relative to its
# own parent.parent (see REPO_ROOT in main.py), so this layout mirrors that:
# /app/python-service/main.py next to /app/public/mediapipe/face_landmarker.task.

FROM python:3.11-slim
WORKDIR /app/python-service

# mediapipe's native library links against OpenGL/EGL even though it never
# renders anything visible here — without these, FaceLandmarker.create_from_options
# fails with "libEGL.so.1: cannot open shared object file" on a minimal image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libegl1 libgles2 curl \
    && rm -rf /var/lib/apt/lists/*

COPY python-service/requirements.txt .
# mediapipe pulls in opencv-contrib-python transitively (~80MB wheel) — on a
# slow connection a single stalled read can exceed pip's default timeout and
# kill the whole install. --timeout/--retries make that more tolerant, and
# the cache mount means a retry after a genuine failure only re-fetches the
# wheel that actually failed instead of starting over (this cache lives in
# the build cache only, never in the final image, so it doesn't bloat it).
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --timeout=100 --retries=5 -r requirements.txt

COPY python-service/ .
COPY public/mediapipe/face_landmarker.task /app/public/mediapipe/face_landmarker.task

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s \
    CMD curl -sf http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
