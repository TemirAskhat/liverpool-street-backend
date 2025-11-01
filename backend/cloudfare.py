#!/usr/bin/env python3
"""
upload_to_r2_hero_images.py
----------------------------
Convert every image in ./hero-photos/ to PNG and upload to Cloudflare R2
WITHOUT any file size restrictions (removed 40KB limit).

Configuration is read exactly the same way as upload_to_r2.py:
  • from r2_config.txt (key=value, no spaces)
  • or from environment variables

Based on upload_to_r2.py but for hero images with no size limit.
"""
from __future__ import annotations
import os, sys, pathlib, tempfile
from typing import Dict

import boto3
from botocore.config import Config
from PIL import Image


ROOT = pathlib.Path(__file__).resolve().parent
CFG_FILE = ROOT / "r2_config.txt"
SRC_DIR = ROOT.parent / "hero-photos"  # ../hero-photos/ directory
# NO MAX_BYTES restriction for hero images


# --------------------------------------------------------------------------- #
#  Load R2 credentials & settings
# --------------------------------------------------------------------------- #
def load_cfg() -> Dict[str, str]:
    cfg: Dict[str, str] = {}
    if CFG_FILE.exists():
        with CFG_FILE.open() as fh:
            for raw in fh:
                raw = raw.split("#", 1)[0].strip()
                if "=" in raw:
                    k, v = (s.strip() for s in raw.split("=", 1))
                    cfg[k] = v

    for k in (
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_KEY",
        "R2_ENDPOINT",
        "R2_BUCKET",
        "R2_PUBLIC_BASE",
    ):
        if os.getenv(k):
            cfg[k] = os.environ[k]

    missing = [
        k
        for k in ("R2_ACCESS_KEY_ID", "R2_SECRET_KEY", "R2_ENDPOINT", "R2_BUCKET")
        if k not in cfg
    ]
    if missing:
        sys.exit(f"❌  missing keys: {', '.join(missing)}")

    cfg.setdefault(
        "R2_PUBLIC_BASE",
        f"{cfg['R2_ENDPOINT'].rstrip('/')}/{cfg['R2_BUCKET']}",
    )
    return cfg


CFG = load_cfg()

# --------------------------------------------------------------------------- #
#  Boto3 client
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
#  Walk / convert / upload
# --------------------------------------------------------------------------- #
print(f"▶︎ scanning hero images in «{SRC_DIR}» …")

if not SRC_DIR.exists():
    sys.exit(f"❌  directory {SRC_DIR} does not exist")

uploaded_count = 0
error_count = 0

for src in sorted(SRC_DIR.glob("*")):
    if not src.is_file():
        continue

    slug = src.stem
    key = f"{slug}.png"

    try:
        with Image.open(src) as im:
            im = im.convert("RGBA")
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                im.save(tmp.name, format="PNG", optimize=True)

                # Get file size for logging
                file_size = os.path.getsize(tmp.name)
                size_kb = file_size / 1024

                # Upload (no ACL header, no size restrictions)
                s3.upload_file(
                    Filename=tmp.name,
                    Bucket=CFG["R2_BUCKET"],
                    Key=key,
                    ExtraArgs={"ContentType": "image/png"},
                )
                public = f"{CFG['R2_PUBLIC_BASE'].rstrip('/')}/{key}"
                print(f"✅  {key:30} → {size_kb:6.1f}KB → {public}")
                uploaded_count += 1
                os.unlink(tmp.name)

    except Exception as exc:
        print(f"⚠️  {key:30} error – {exc}")
        error_count += 1

print(f"\n🎉  done. Uploaded {uploaded_count} hero images, {error_count} errors.")
