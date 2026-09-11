# frame-processor

Python microservice for the admin panel's frame-photo pipeline (background
removal via `rembg`'s `isnet-general-use` model with alpha matting, plus the
lens-detection/front-rim-crop geometry ported from the app's original
client-side TypeScript implementation). Called only by the Next.js app's
`app/api/frame/*` proxy routes — never exposed publicly.

## Local setup

```bash
cd services/frame-processor
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
./venv/bin/uvicorn main:app --host 127.0.0.1 --port 8001
```

First startup downloads `rembg`'s model weights (~100–200MB) — needs
outbound internet access once. After that it's cached locally
(`~/.u2net` by default).

Set `FRAME_PROCESSOR_PORT` in the Next.js app's environment if you need a
port other than 8001 (see `app/api/frame/*/route.ts`).

## Production (same server as the Next.js app)

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

## Health check

```bash
curl http://127.0.0.1:8001/health
```
