from __future__ import annotations

import base64
import hmac
import os

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from src.pipeline import process_image
from src.reconstruction import encode_png


MAX_IMAGE_BYTES = 12 * 1024 * 1024
SERVICE_TOKEN = os.environ.get("SERVICE_TOKEN", "")

app = FastAPI(title="Festholic QR Reconstructor", docs_url=None, redoc_url=None)


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/reconstruct")
async def reconstruct(request: Request) -> JSONResponse:
    supplied_token = request.headers.get("x-service-token", "")
    if not SERVICE_TOKEN or not hmac.compare_digest(supplied_token, SERVICE_TOKEN):
        raise HTTPException(status_code=401, detail="Unauthorized")

    raw = await request.body()
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="La imagen está vacía o supera 12 MB")

    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="El archivo no es una imagen válida")

    result = process_image(image)
    payload: dict[str, object] = {
        "success": result.success,
        "message": result.message,
        "decoded_text": result.decoded_text,
        "validation_text": result.validation_text,
        "validated": result.validated,
        "method": result.method,
    }
    if result.matrix is not None:
        payload["dimension"] = int(result.matrix.shape[0])
    if result.clean is not None:
        payload["clean_png_base64"] = base64.b64encode(encode_png(result.clean)).decode("ascii")

    return JSONResponse(payload, status_code=200 if result.success else 422)
