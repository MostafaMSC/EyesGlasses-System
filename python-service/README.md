# ML microservice (optional)

Small FastAPI service providing two endpoints the rest of this app can't do
in-browser at the same quality:

| Endpoint | Purpose | Used by |
| --- | --- | --- |
| `POST /segment` | Frame-photo background removal (full u2net + alpha matting) | `/admin` photo upload, via `lib/segmentFrameServer.ts` |
| `POST /landmarks` | Face landmark detection on a single still image | Offline/one-shot use only — **not** wired into the live camera try-on (see `main.py`'s module docstring for why) |

The Next.js app works fully without this service — `/admin` photo upload
falls back to the in-browser `onnxruntime-web` model, then to the
colour-heuristic pipeline, if this service isn't running or isn't reachable.
Run it when you want sharper cutouts on real product photos (thin wire rims,
gradient-tinted lenses).

## Run it

```bash
cd python-service
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Then, in the Next.js app's environment (e.g. `.env.local`):

```
PYTHON_SERVICE_URL=http://localhost:8000
```

If unset, the Next.js API routes default to `http://localhost:8000` already,
so this is only needed if you run the service somewhere else.

## Notes

- On a minimal/headless Linux box, `/landmarks` needs OpenGL/EGL shared
  libraries that mediapipe's native library links against even though it
  isn't rendering anything visible. If `create_from_options` fails with
  `OSError: libEGL.so.1` or `libGLESv2.so.2: cannot open shared object
  file`, install them (Debian/Ubuntu): `apt-get install -y libegl1 libgles2`.
  Not needed on macOS/Windows or a normal desktop Linux install.
- `/segment` uses [`rembg`](https://github.com/danielgatis/rembg)'s `u2net`
  model, which it downloads and caches (~176 MB, under `~/.u2net/`) on first
  use — that first request needs internet access once, after which it's
  fully offline. This is a **different, larger** model than
  `public/models/u2netp.onnx` (the one the browser runs), which is why the
  server path tends to produce cleaner edges.
- `/landmarks` reuses `public/mediapipe/face_landmarker.task` directly — no
  extra download, same model the live browser try-on already self-hosts.
- Both models are lazily loaded on first request and cached in memory for
  the life of the process.
