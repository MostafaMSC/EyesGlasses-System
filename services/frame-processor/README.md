# frame-processor

Python microservice for the admin panel's frame-photo pipeline (background
removal via `rembg`'s `isnet-general-use` model with alpha matting, plus the
lens-detection/front-rim-crop geometry ported from the app's original
client-side TypeScript implementation). Called only by the Next.js app's
`app/api/frame/*` proxy routes — never exposed publicly.

## Option A: Docker (recommended)

No local Python/venv needed at all — the image bundles everything,
including the model weights (baked in at build time, so the container
never needs outbound internet at startup).

```bash
cd services/frame-processor
docker compose up -d --build
```

That's it — it builds, starts, and (via `restart: unless-stopped` in
`docker-compose.yml`) comes back up on its own after a reboot or crash,
without needing a separate systemd/pm2 entry.

`docker-compose.yml` publishes the container's port bound to the host's
loopback interface only (`127.0.0.1:8001:8001`) — reachable from the
Next.js app on the same machine, not from outside it. **Don't change this
to a bare `8001:8001`** — that publishes it on every network interface,
making it public.

To update after pulling new code: `docker compose up -d --build` again.
To check logs: `docker compose logs -f`.

## Option B: plain Python (venv)

```bash
cd services/frame-processor
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
./venv/bin/uvicorn main:app --host 127.0.0.1 --port 8001
```

First startup downloads `rembg`'s model weights (~100–200MB) — needs
outbound internet access once. After that it's cached locally
(`~/.rembg` by default).

Keep it alive the same way the Next.js process already is.

**systemd** — `/etc/systemd/system/frame-processor.service`:

```ini
[Unit]
Description=frame-processor (Python image pipeline)
After=network.target

[Service]
WorkingDirectory=/path/to/abu-thar-eyewear/services/frame-processor
ExecStart=/path/to/abu-thar-eyewear/services/frame-processor/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8001
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now frame-processor
```

**pm2** (if that's what's already managing the Next.js process):

```bash
pm2 start venv/bin/uvicorn --name frame-processor --interpreter none -- main:app --host 127.0.0.1 --port 8001
pm2 save
```

## Configuration

The Next.js app finds this service via the `FRAME_PROCESSOR_URL` env var
(default `http://127.0.0.1:8001`, see `lib/frameProcessorProxy.ts`) — only
needs setting if you run it on a different port or host.

## Health check

```bash
curl http://127.0.0.1:8001/health
```
