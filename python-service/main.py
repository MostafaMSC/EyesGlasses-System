"""
Optional Python ML microservice for the eyeglasses try-on system.

The rest of the app runs entirely client-side (see README.md's "How the
cutout is actually made"). This service exists for the two things that
benefit from real Python ML libraries instead of the browser's WASM/JS
constraints:

  - POST /segment    Frame-photo background removal for admin product
                      uploads. Runs rembg's full u2net model (native
                      onnxruntime, multi-threaded, with alpha-matting edge
                      refinement) instead of the quantized u2netp that
                      lib/segmentFrame.ts runs single-threaded under
                      onnxruntime-web/WASM — same model family, meant to
                      produce cleaner edges on thin wire rims and gradient
                      lenses. The Next.js app tries this service first (see
                      lib/segmentFrameServer.ts) and falls back to the
                      in-browser model, then the colour-heuristic pipeline,
                      if it's unreachable — this service is an optional
                      accuracy upgrade, not a hard dependency.

  - POST /landmarks  Face landmark detection on a single still image, using
                      the same face_landmarker.task model already self-hosted
                      for the live browser try-on (public/mediapipe/). This
                      is NOT wired into the live camera loop: round-tripping
                      every video frame through HTTP would add real per-frame
                      network latency and make the live overlay visibly
                      laggy, where lib/useFaceLandmarker.ts running in-browser
                      has none. It's for one-shot/offline use instead — e.g.
                      an accuracy check or calibration tool run against a
                      captured photo.

Run with:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000
"""

import io
import os
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image

app = FastAPI(title="EyesGlasses-System ML service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["POST"],
    allow_headers=["*"],
)

REPO_ROOT = Path(__file__).resolve().parent.parent
LANDMARKER_MODEL_PATH = REPO_ROOT / "public" / "mediapipe" / "face_landmarker.task"

_rembg_session = None
_landmarker = None


def _read_image(upload: UploadFile) -> Image.Image:
    data = upload.file.read()
    try:
        return Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as exc:  # noqa: BLE001 - reported to the caller as 400
        raise HTTPException(status_code=400, detail="Could not read that image file.") from exc


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/segment")
async def segment(file: UploadFile = File(...)):
    """
    Returns a grayscale PNG (mode "L"), same size as the input: the per-pixel
    foreground alpha. Same contract as lib/segmentFrame.ts's segmentAlpha, so
    lib/segmentFrameServer.ts can drop it straight into the existing pipeline
    (lens detection, cropping, etc. in lib/processFrameImage.ts stay
    unchanged either way).
    """
    from rembg import new_session, remove

    global _rembg_session
    if _rembg_session is None:
        _rembg_session = new_session("u2net")

    image = _read_image(file)
    mask = remove(
        image,
        session=_rembg_session,
        only_mask=True,
        alpha_matting=True,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=10,
        alpha_matting_erode_size=5,
    )

    buf = io.BytesIO()
    mask.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")


@app.post("/landmarks")
async def landmarks(file: UploadFile = File(...)):
    """
    Runs the face_landmarker.task model on a single still image and returns
    its normalized landmarks as JSON, in the same {x, y, z} shape
    lib/faceGeometry.ts's NormalizedPoint expects — so a JSON response from
    here can be fed straight into computeFacePose for an offline accuracy
    check against the live browser tracking.
    """
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions, RunningMode

    if not LANDMARKER_MODEL_PATH.exists():
        raise HTTPException(
            status_code=500,
            detail=(
                f"Model not found at {LANDMARKER_MODEL_PATH} — see this repo's README.md "
                "'Updating the MediaPipe assets' section."
            ),
        )

    global _landmarker
    if _landmarker is None:
        options = FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(LANDMARKER_MODEL_PATH)),
            running_mode=RunningMode.IMAGE,
            num_faces=1,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
        )
        _landmarker = FaceLandmarker.create_from_options(options)

    image = _read_image(file)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(image))
    result = _landmarker.detect(mp_image)

    if not result.face_landmarks:
        return {"landmarks": None}

    points: list[dict[str, Optional[float]]] = [
        {"x": p.x, "y": p.y, "z": p.z} for p in result.face_landmarks[0]
    ]
    return {"landmarks": points}
