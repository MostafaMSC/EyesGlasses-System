"""
FastAPI service for frame photo processing (background removal + geometry).

Bound to 127.0.0.1 only — see the Next.js proxy routes under
app/api/frame/*, which are the only intended callers. Run with:

    uvicorn main:app --host 127.0.0.1 --port 8001
"""

import json
import logging

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

import processing

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("frame-processor")

app = FastAPI(title="frame-processor")


@app.on_event("startup")
def _warm_up_model() -> None:
    logger.info("Warming up rembg session...")
    processing.warm_up()
    logger.info("rembg session ready.")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/prepare-front")
async def prepare_front(file: UploadFile = File(...), manualSeeds: str | None = Form(None)) -> JSONResponse:
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file.")

    seeds = None
    if manualSeeds:
        try:
            seeds = json.loads(manualSeeds)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="manualSeeds must be valid JSON.") from exc

    try:
        result = processing.prepare_front(image_bytes, seeds)
    except Exception:
        logger.exception("prepare_front failed")
        raise HTTPException(status_code=500, detail="Could not process the image.")
    return JSONResponse(result)


@app.post("/finalize-front")
async def finalize_front(request: Request) -> JSONResponse:
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Request body must be valid JSON.") from exc

    working = payload.get("working")
    box = payload.get("box")
    if not working or not box:
        raise HTTPException(status_code=400, detail="Request must include 'working' and 'box'.")

    try:
        result = processing.finalize_front(working, box)
    except Exception:
        logger.exception("finalize_front failed")
        raise HTTPException(status_code=500, detail="Could not finalize the crop.")
    return JSONResponse(result)


@app.post("/process-side")
async def process_side(file: UploadFile = File(...)) -> JSONResponse:
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file.")

    try:
        result = processing.process_side(image_bytes)
    except Exception:
        logger.exception("process_side failed")
        raise HTTPException(status_code=500, detail="Could not process the image.")
    return JSONResponse(result)
