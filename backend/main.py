from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from pathlib import Path
import shutil
from typing import List

app = FastAPI()

# Configure upload directory
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Allowed image extensions
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

def validate_image(file: UploadFile) -> bool:
    """Validate if the uploaded file is an image"""
    file_ext = Path(file.filename).suffix.lower()
    return file_ext in ALLOWED_EXTENSIONS

@app.post("/upload/single")
async def upload_single_image(file: UploadFile = File(...)):
    """Upload a single image"""
    
    # Validate file type
    if not validate_image(file):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Save the file
    file_path = UPLOAD_DIR / file.filename
    
    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    finally:
        await file.close()
    
    return JSONResponse(
        content={
            "message": "Image uploaded successfully",
            "filename": file.filename,
            "path": str(file_path),
            "size": file_path.stat().st_size
        },
        status_code=200
    )

@app.post("/upload/multiple")
async def upload_multiple_images(files: List[UploadFile] = File(...)):
    """Upload multiple images"""
    
    uploaded_files = []
    errors = []
    
    for file in files:
        # Validate file type
        if not validate_image(file):
            errors.append({
                "filename": file.filename,
                "error": "Invalid file type"
            })
            continue
        
        # Save the file
        file_path = UPLOAD_DIR / file.filename
        
        try:
            with file_path.open("wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            uploaded_files.append({
                "filename": file.filename,
                "path": str(file_path),
                "size": file_path.stat().st_size
            })
        except Exception as e:
            errors.append({
                "filename": file.filename,
                "error": str(e)
            })
        finally:
            await file.close()
    
    return JSONResponse(
        content={
            "message": f"Uploaded {len(uploaded_files)} file(s)",
            "uploaded": uploaded_files,
            "errors": errors
        },
        status_code=200
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)