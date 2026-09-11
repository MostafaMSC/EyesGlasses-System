FROM python:3.11-slim

WORKDIR /app

# Python fully-buffers stdout when it isn't a TTY (true for `docker compose
# up`'s log capture) — without this, log lines can sit in a buffer and
# never appear until the process exits, making "did it hang or just not
# flush yet?" impossible to tell from the logs alone.
ENV PYTHONUNBUFFERED=1

# opencv-python-headless still links against these even with no GUI/display
# support.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the segmentation model weights into the image at build time, so the
# container never needs outbound internet at startup in production — only
# once, here, when the image is built.
RUN python -c "from rembg import new_session; new_session('isnet-general-use')"

COPY . .

EXPOSE 8001

# Used by docker-compose.yml's `depends_on: condition: service_healthy` (the
# web app shouldn't start routing traffic here until it actually answers) —
# plain Python since the slim base has no curl/wget by default. Generous
# start-period/retries: onnxruntime's first inference (even with the model
# already baked into the image) can take noticeably longer than a plain
# "the process started" check under Docker Desktop/WSL2 virtualization
# overhead — a container that's actually fine but slow to warm up must not
# get marked unhealthy before it's had a real chance.
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')" || exit 1

# Binds to all interfaces *inside* the container — this is normal and safe.
# What actually keeps the service internal-only is how the container is
# run: always publish it bound to the host's loopback interface (see
# README.md / docker-compose.yml), never a bare `-p 8001:8001` (which would
# publish it on every network interface, i.e. make it public).
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
