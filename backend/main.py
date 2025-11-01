#!/usr/bin/env python3
"""
FastAPI handler to receive image uploads and send them to Cloudflare R2.
Converts images to PNG format before uploading.
"""
from __future__ import annotations
import os
import sys
import pathlib
import tempfile
from typing import Dict

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
import boto3
from botocore.config import Config
from PIL import Image
import io


app = FastAPI()

ROOT = pathlib.Path(__file__).resolve().parent
CFG_FILE = ROOT / "r2_config.txt"


# --------------------------------------------------------------------------- #
#  Load R2 credentials & settings
# --------------------------------------------------------------------------- #
def load_cfg() -> Dict[str, str]:
    """Load configuration from r2_config.txt or environment variables"""
    cfg: Dict[str, str] = {}

    # Try loading from config file
    if CFG_FILE.exists():
        with CFG_FILE.open() as fh:
            for raw in fh:
                raw = raw.split("#", 1)[0].strip()
                if "=" in raw:
                    k, v = (s.strip() for s in raw.split("=", 1))
                    cfg[k] = v

    # Override with environment variables
    for k in (
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_KEY",
        "R2_ENDPOINT",
        "R2_BUCKET",
        "R2_PUBLIC_BASE",
    ):
        if os.getenv(k):
            cfg[k] = os.environ[k]

    # Check for required keys
    missing = [
        k
        for k in ("R2_ACCESS_KEY_ID", "R2_SECRET_KEY", "R2_ENDPOINT", "R2_BUCKET")
        if k not in cfg
    ]
    if missing:
        raise ValueError(f"Missing required configuration keys: {', '.join(missing)}")

    # Set default public base URL
    cfg.setdefault(
        "R2_PUBLIC_BASE",
        f"{cfg['R2_ENDPOINT'].rstrip('/')}/{cfg['R2_BUCKET']}",
    )
    return cfg


# Load configuration at startup
try:
    CFG = load_cfg()
except ValueError as e:
    print(f"❌ Configuration error: {e}")
    sys.exit(1)


# --------------------------------------------------------------------------- #
#  Initialize Boto3 S3 client for R2
# --------------------------------------------------------------------------- #
s3 = boto3.client(
    "s3",
    endpoint_url=CFG["R2_ENDPOINT"],
    aws_access_key_id=CFG["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=CFG["R2_SECRET_KEY"],
    config=Config(
        region_name="auto",
        signature_version="s3v4",
        s3={
            "addressing_style": "path",
            "payload_signing_enabled": False,
        },
    ),
)


# --------------------------------------------------------------------------- #
#  Allowed image extensions
# --------------------------------------------------------------------------- #
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}


def validate_image(filename: str) -> bool:
    """Validate if the uploaded file has an allowed image extension"""
    file_ext = pathlib.Path(filename).suffix.lower()
    return file_ext in ALLOWED_EXTENSIONS


# --------------------------------------------------------------------------- #
#  Upload endpoint
# --------------------------------------------------------------------------- #
@app.post("/upload/hero-image")
async def upload_hero_image(file: UploadFile = File(...)):
    """
    Receive an image upload, convert to PNG, and upload to Cloudflare R2.

    Returns the public URL of the uploaded image.
    """

    # Validate file type
    if not validate_image(file.filename):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Generate key from filename (stem only, with .png extension)
    slug = pathlib.Path(file.filename).stem
    key = f"{slug}.png"

    try:
        # Read uploaded file into memory
        contents = await file.read()

        # Open with PIL and convert to PNG
        with Image.open(io.BytesIO(contents)) as im:
            im = im.convert("RGBA")

            # Save to temporary file
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                im.save(tmp.name, format="PNG", optimize=True)

                # Get file size for response
                file_size = os.path.getsize(tmp.name)
                size_kb = file_size / 1024

                # Upload to R2
                s3.upload_file(
                    Filename=tmp.name,
                    Bucket=CFG["R2_BUCKET"],
                    Key=key,
                    ExtraArgs={"ContentType": "image/png"},
                )

                # Generate public URL
                public_url = f"https://pub-60082610708945daaa0ef2343da1c8a2.r2.dev/{file.filename}"

                # Clean up temp file
                os.unlink(tmp.name)

                return JSONResponse(
                    content={
                        "message": "Image uploaded successfully to R2",
                        "original_filename": file.filename,
                        "r2_key": key,
                        "size_kb": round(size_kb, 1),
                        "public_url": public_url,
                    },
                    status_code=200,
                )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload image: {str(e)}")
    finally:
        await file.close()


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "bucket": CFG["R2_BUCKET"]}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
