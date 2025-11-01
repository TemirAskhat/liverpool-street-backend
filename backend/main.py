"""
FastAPI handler to receive image uploads and send them to PerfectCorp.
Converts images to PNG format before uploading.
"""

from __future__ import annotations
import os
import io
import perfect
import os
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Set
import json
import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from PIL import Image, UnidentifiedImageError
import s3

import overlay
import recommendations_file

app = FastAPI()

ROOT = Path(__file__).resolve().parent
CFG_FILE = ROOT / "r2_config.txt"

file_ids_to_url = {
    "rovndWs7BQocFloquovDHKRnh1lq/GUxiuNbzC3071ULbKfeLEmuXUa9yH4wuc2K": "https://yce-us.s3-accelerate.amazonaws.com/ttl30/387352418477671816/92409102910/v2/aeMNNB0KmUIP8rnQ996tC5Q/fd878e92-af45-4077-b0f7-d64a3c32be0f.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20251101T131148Z&X-Amz-SignedHeaders=host&X-Amz-Expires=7200&X-Amz-Credential=AKIARB77EV5Y5D7DAE3S%2F20251101%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Signature=8128e09907e07fce12e72736830fe2a163c5f0b65ab33b8032b8381e9b327645"
}


# --------------------------------------------------------------------------- #
#  Configuration
# --------------------------------------------------------------------------- #
@dataclass
class PerfectCorpConfig:
    """Configuration for PerfectCorp API"""

    api_key: str
    api_endpoint: str
    timeout: int = 30

    @classmethod
    def from_file_and_env(cls, config_path: Path) -> PerfectCorpConfig:
        """Load configuration from file and environment variables"""
        cfg = {}

        # Load from config file if it exists
        if config_path.exists():
            with config_path.open() as fh:
                for line in fh:
                    line = line.split("#", 1)[0].strip()
                    if "=" in line:
                        key, value = (s.strip() for s in line.split("=", 1))
                        cfg[key] = value

        # Environment variables take precedence
        env_keys = {
            "PERFECTCORP_API_KEY": "api_key",
            "PERFECTCORP_ENDPOINT": "api_endpoint",
            "PERFECTCORP_TIMEOUT": "timeout",
        }

        for env_key, cfg_key in env_keys.items():
            if value := os.getenv(env_key):
                cfg[env_key] = value

        # Validate required keys
        required = ["PERFECTCORP_API_KEY", "PERFECTCORP_ENDPOINT"]
        missing = [k for k in required if k not in cfg]
        if missing:
            raise ValueError(f"Missing required configuration: {', '.join(missing)}")

        return cls(
            api_key=cfg["PERFECTCORP_API_KEY"],
            api_endpoint=cfg["PERFECTCORP_ENDPOINT"],
            timeout=int(cfg.get("PERFECTCORP_TIMEOUT", 30)),
        )


# --------------------------------------------------------------------------- #
#  Image Processing
# --------------------------------------------------------------------------- #
class ImageProcessor:
    """Handles image validation and conversion"""

    ALLOWED_EXTENSIONS: Set[str] = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB

    @classmethod
    def validate_filename(cls, filename: str) -> None:
        """Validate image file extension"""
        ext = Path(filename).suffix.lower()
        if ext not in cls.ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file type. Allowed: {', '.join(cls.ALLOWED_EXTENSIONS)}",
            )

    @classmethod
    def convert_to_png(cls, image_bytes: bytes) -> bytes:
        """Convert image to PNG format"""
        try:
            with Image.open(io.BytesIO(image_bytes)) as img:
                # Convert to RGBA for transparency support
                img = img.convert("RGBA")

                # Save to bytes buffer
                output = io.BytesIO()
                img.save(output, format="PNG", optimize=True)
                output.seek(0)
                return output.read()

        except UnidentifiedImageError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File is not a valid image",
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Image processing failed: {str(e)}",
            )


# --------------------------------------------------------------------------- #
#  PerfectCorp Upload Service
# --------------------------------------------------------------------------- #
class PerfectCorpService:
    """Handles interactions with PerfectCorp API"""

    def __init__(self, config: PerfectCorpConfig):
        self.config = config
        self.client = httpx.AsyncClient(timeout=config.timeout)

    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()

    async def upload_image(self, filename: str, image_data: bytes) -> dict:
        """
        Upload image to PerfectCorp and return response.

        NOTE: This is a placeholder implementation. Update with actual PerfectCorp API details:
        - Correct endpoint URL
        - Required headers (authentication, content-type, etc.)
        - Request format (multipart/form-data, JSON with base64, etc.)
        - Response parsing based on actual API response
        """
        try:
            # Prepare headers
            headers = {
                "Authorization": f"Bearer {self.config.api_key}",
                # Add other required headers based on PerfectCorp API documentation
            }

            # Prepare the file for upload
            files = {"file": (filename, image_data, "image/png")}

            # Additional form data if required by PerfectCorp API
            data = {
                # Add any required fields here
                # "description": "Hero image upload",
                # "category": "hero",
            }

            # Make the upload request
            response = await self.client.post(
                self.config.api_endpoint,
                headers=headers,
                files=files,
                data=data,
            )

            # Check response status
            if response.status_code not in (200, 201):
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"PerfectCorp API error [{response.status_code}]: {response.text}",
                )

            # Parse response
            result = response.json()

            # Extract relevant information from response
            # Update this based on actual PerfectCorp API response format
            return {
                "image_id": result.get("id"),
                "image_url": result.get("url"),
                "status": result.get("status"),
                "raw_response": result,
            }

        except httpx.TimeoutException:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Upload request timed out",
            )
        except httpx.HTTPError as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"HTTP error during upload: {str(e)}",
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Upload failed: {str(e)}",
            )

    async def health_check(self) -> bool:
        """Verify connection to PerfectCorp API"""
        try:
            # Adjust this based on whether PerfectCorp has a health/ping endpoint
            headers = {
                "Authorization": f"Bearer {self.config.api_key}",
            }

            response = await self.client.get(
                self.config.api_endpoint.rstrip("/")
                + "/health",  # Update with actual health endpoint
                headers=headers,
                timeout=5,
            )
            return response.status_code == 200
        except Exception:
            return False


# --------------------------------------------------------------------------- #
#  Application Setup
# --------------------------------------------------------------------------- #
ROOT = Path(__file__).resolve().parent
CONFIG_FILE = ROOT / "perfectcorp_config.txt"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    try:
        app.state.config = PerfectCorpConfig.from_file_and_env(CONFIG_FILE)
        app.state.service = PerfectCorpService(app.state.config)
        print(f"✅ Connected to PerfectCorp API: {app.state.config.api_endpoint}")
    except Exception as e:
        print(f"❌ Startup failed: {e}")
        raise

    yield

    # Shutdown
    await app.state.service.close()
    print("👋 Shutting down...")


app = FastAPI(
    title="PerfectCorp Image Upload Service",
    description="Upload and convert images to PerfectCorp",
    version="1.0.0",
    lifespan=lifespan,
)


# --------------------------------------------------------------------------- #
#  API Endpoints
# --------------------------------------------------------------------------- #
from typing import Optional
from fastapi import Query


@app.post("/upload/hero-image")
async def upload_hero_image(
    file: UploadFile = File(...), file_id_param: Optional[str] = Query(None)
) -> JSONResponse:
    """
    Upload an image, convert to PNG, and store in PerfectCorp.

    Args:
        file: Image file to upload

    Returns:
        JSON response with upload details and image URL
    """
<<<<<<< HEAD
    if not file_id_param:
        # Validate filename
        if not file.filename:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Filename is required",
            )

        ImageProcessor.validate_filename(file.filename)

        # Read and validate file size
        contents = await file.read()
        if len(contents) > ImageProcessor.MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large. Max size: {ImageProcessor.MAX_FILE_SIZE / 1024 / 1024}MB",
            )

        # Convert image to PNG
        png_data = ImageProcessor.convert_to_png(contents)

        # Generate filename
        slug = Path(file.filename).stem
        png_filename = f"{slug}.png"

        # Upload to PerfectCorp
        # upload_result = await app.state.service.upload_image(png_filename, png_data)

        upload_url_data = perfect.upload_file(
            file_name=png_filename, file_size=len(png_data)
        )

        print("upload_url_data", upload_url_data)

        file_id = upload_url_data["result"]["files"][0]["file_id"]
        upload_url = upload_url_data["result"]["files"][0]["requests"][0]["url"]
        headers = upload_url_data["result"]["files"][0]["requests"][0]["headers"]

        perfect.upload_file_bytes(
            file=png_data, presigned_url=upload_url, headers=headers
        )

        directory = f"extracted_files/{file_id}/skinanalysisResult"
        if not os.path.exists(directory):
            os.makedirs(directory)

        with open(f"{directory}/original.png", "wb") as f:
            f.write(png_data)
    else:
        file_id = file_id_param

    print("file_id", file_id)

    if file_id in file_ids_to_url:
        url = file_ids_to_url[file_id]
        print(f"[upload_hero_image] file_id: {file_id}")
        print(f"[upload_hero_image] url: {url}")
        return JSONResponse(
            content={"file_id": file_id, "url": url},
            status_code=status.HTTP_200_OK,
        )

    payload = perfect.get_perfect_data(file_id)
    data = json.loads(payload)
    url = data["data"]["results"]["url"]

    overlay_folder = s3.load_file_from_s3_url(file_id, url)
    overlay_folder += "/skinanalysisResult"

    overlay.overlay_multiple(png_data, overlay_folder)

    print(f"[upload_hero_image] file_id: {file_id}")
    print(f"[upload_hero_image] url: {url}")
    file_ids_to_url[file_id] = url
=======
    # Hardcoded response as requested
>>>>>>> 46e54d2 (saving local changes)
    return JSONResponse(
        content={
            "file_id": "2gp2517EQO+QIJzahzBZvP5GMGk43J4l3tdK9zN9mNkLbKfeLEmuXUa9yH4wuc2K",
            "url": "https://yce-us.s3-accelerate.amazonaws.com/ttl30/387352072867022160/92422264758/v2/aeMNNB0KmUIP8rnQ996tC5Q/d4eebf7a-1838-45b4-a8c4-084a2b538563.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20251101T165110Z&X-Amz-SignedHeaders=host&X-Amz-Expires=7200&X-Amz-Credential=AKIARB77EV5Y5D7DAE3S%2F20251101%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Signature=695f84e88e9ac218def129dd2fc5180b63b5ed451191b9c928dd85e250bcc037"
        },
        status_code=status.HTTP_200_OK,
    )


@app.get("/recommendations")
async def recommendations(file_id: str):
    print("file_id", file_id)
    overlay_folder = f"extracted_files/{file_id}/skinanalysisResult"

    with open(f"{overlay_folder}/original.png", "rb") as f:
        png_data = f.read()

    with open(f"{overlay_folder}/overlayed.png", "rb") as f:
        overlayed_data = f.read()

    openai_response = recommendations_file.get_recommendations(png_data, overlayed_data)
    return openai_response


@app.get("/health")
async def health_check():
    """Health check endpoint with PerfectCorp API connection status"""
    api_healthy = await app.state.service.health_check()


@app.get("/test")
async def test_route():
    data = perfect.get_perfect_data("test_file_id")
    return JSONResponse(
        content={
            "status": "healthy" if api_healthy else "degraded",
            "api_endpoint": app.state.config.api_endpoint,
            "api_connection": "ok" if api_healthy else "error",
        },
        status_code=(
            status.HTTP_200_OK if api_healthy else status.HTTP_503_SERVICE_UNAVAILABLE
        ),
    )


@app.get("/test2")
async def test_route2():
    data = perfect.upload_file()
    return JSONResponse(
        content={
            "message": "Got perfect payload",
            "payload": data,
        },
        status_code=200,
    )


# --------------------------------------------------------------------------- #
#  Entry Point
# --------------------------------------------------------------------------- #
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
