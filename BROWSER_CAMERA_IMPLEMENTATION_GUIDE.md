# Browser Camera Implementation Guide
## Complete Guide to Capturing Images from Browser Camera

> **Project Context**: This guide documents browser camera implementation patterns, based on real-world implementation for face analysis and skin diagnostics applications. It covers everything from basic camera access to production-ready implementations with security best practices.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [When to Use What](#when-to-use-what)
3. [Understanding Browser Camera APIs](#understanding-browser-camera-apis)
4. [Implementation Guide](#implementation-guide)
5. [Real-World Implementation Patterns](#real-world-implementation-patterns)
6. [Security & Privacy](#security-privacy)
7. [Browser Compatibility](#browser-compatibility)
8. [Production Checklist](#production-checklist)
9. [Troubleshooting](#troubleshooting)
10. [Advanced Topics](#advanced-topics)

---

## Quick Start

### Minimal Working Example (< 5 minutes)

```html
<!DOCTYPE html>
<html>
<head>
    <title>Camera Capture</title>
</head>
<body>
    <video id="video" autoplay playsinline style="width: 640px"></video>
    <button id="capture">Capture Photo</button>
    <canvas id="canvas" style="display: none"></canvas>
    <img id="photo" style="display: none; width: 640px">

    <script>
        const video = document.getElementById('video');
        const canvas = document.getElementById('canvas');
        const photo = document.getElementById('photo');
        const captureBtn = document.getElementById('capture');

        // Step 1: Request camera access
        navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 960 } }
        })
        .then(stream => {
            video.srcObject = stream;
        })
        .catch(err => {
            console.error('Camera error:', err);
            alert('Unable to access camera: ' + err.message);
        });

        // Step 2: Capture image when button clicked
        captureBtn.addEventListener('click', () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);

            canvas.toBlob(blob => {
                // Option 1: Display locally
                photo.src = URL.createObjectURL(blob);
                photo.style.display = 'block';

                // Option 2: Upload to server
                const formData = new FormData();
                formData.append('image', blob, 'capture.png');

                fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                })
                .then(response => response.json())
                .then(data => console.log('Upload success:', data))
                .catch(err => console.error('Upload error:', err));
            }, 'image/png');
        });
    </script>
</body>
</html>
```

**Key Points:**
- `getUserMedia()` requests camera permission
- Video element displays live preview
- Canvas captures a single frame
- `toBlob()` converts to uploadable format

---

## When to Use What

### Decision Matrix

| Approach | Use When | Pros | Cons | Complexity |
|----------|----------|------|------|------------|
| **getUserMedia + Canvas** | Need live preview, facial detection, video analysis | Full control, multiple captures, filters | More code, HTTPS required | ⭐⭐⭐ |
| **`<input type="file" capture>`** | Simple photo capture, no preview needed | 1-line implementation, native UI | No preview, limited control | ⭐ |
| **Progressive Enhancement** | Supporting all users | Works everywhere, graceful degradation | Maintain two code paths | ⭐⭐ |
| **WebRTC + MediaRecorder** | Video recording, streaming | Video capture, broadcasting | Larger implementation | ⭐⭐⭐⭐ |

### Recommendation Flow

```
Do you need live video preview?
    ├─ YES → getUserMedia (this guide's focus)
    │        ├─ Need face detection? → Add MediaPipe/TensorFlow.js
    │        ├─ Need filters/effects? → Canvas manipulation
    │        └─ Just capture? → Canvas.toBlob()
    │
    └─ NO → Simple file input
             └─ <input type="file" accept="image/*" capture="user">
```

---

## Understanding Browser Camera APIs

### The Media Capture Pipeline

```
┌─────────────────────┐
│  Physical Camera    │
└──────────┬──────────┘
           │
           │ MediaDevices API
           ▼
┌─────────────────────┐
│  MediaStream        │ ← getUserMedia() returns this
│  (live video data)  │
└──────────┬──────────┘
           │
           │ HTMLMediaElement
           ▼
┌─────────────────────┐
│  <video> Element    │ ← Display to user
│  (srcObject)        │
└──────────┬──────────┘
           │
           │ Canvas API
           ▼
┌─────────────────────┐
│  Canvas             │ ← Capture frame
│  (drawImage)        │
└──────────┬──────────┘
           │
           │ Blob API
           ▼
┌─────────────────────┐
│  Blob/File          │ ← Upload to server
│  (toBlob/toDataURL) │
└─────────────────────┘
```

### Key APIs

#### 1. **MediaDevices.getUserMedia()**
Requests access to camera/microphone.

```javascript
navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => { /* use stream */ })
    .catch(error => { /* handle error */ });
```

**Constraints Object:**
```javascript
{
    video: {
        facingMode: "user",          // "user" (front) or "environment" (back)
        width: { ideal: 1920 },      // Preferred width
        height: { ideal: 1080 },     // Preferred height
        frameRate: { ideal: 30 },    // FPS
        aspectRatio: { exact: 16/9 } // Aspect ratio
    },
    audio: false // Usually false for image capture
}
```

#### 2. **MediaStream**
Represents live audio/video data.

```javascript
stream.getTracks()         // Get all tracks (audio + video)
stream.getVideoTracks()    // Get only video tracks
track.stop()               // Stop the track (turns off camera)
track.getSettings()        // Get actual camera settings
```

#### 3. **Canvas API**
Captures a frame from video.

```javascript
const ctx = canvas.getContext('2d');
ctx.drawImage(videoElement, 0, 0, width, height);
```

#### 4. **Blob API**
Converts canvas to uploadable format.

```javascript
canvas.toBlob(blob => {
    // blob is a File-like object
}, 'image/png', 0.95); // format, quality (0-1)
```

---

## Implementation Guide

### Approach A: getUserMedia with Live Preview (Recommended)

This is the approach used in professional applications like video conferencing, facial recognition, and AR filters.

#### Step 1: HTML Structure

```html
<div class="camera-container">
    <!-- Video preview -->
    <video
        id="video"
        autoplay
        playsinline
        muted
        style="width: 100%; max-width: 640px; transform: scaleX(-1);">
    </video>

    <!-- Overlay canvas for effects/guides -->
    <canvas id="overlay" style="position: absolute; top: 0; left: 0;"></canvas>

    <!-- Capture canvas (hidden) -->
    <canvas id="capture-canvas" style="display: none;"></canvas>

    <!-- Controls -->
    <div class="controls">
        <button id="start-camera">Start Camera</button>
        <button id="capture-photo" disabled>Capture Photo</button>
        <button id="stop-camera" disabled>Stop Camera</button>
        <select id="camera-select"></select>
    </div>

    <!-- Status messages -->
    <div id="status"></div>
    <div id="error" style="color: red;"></div>
</div>
```

**Important Attributes:**
- `autoplay`: Starts playing video automatically when stream is attached
- `playsinline`: Prevents fullscreen on iOS
- `muted`: Required for autoplay in some browsers
- `transform: scaleX(-1)`: Mirrors front camera (users expect this)

#### Step 2: Request Camera Access

```javascript
let currentStream = null;
let videoElement = null;

async function startCamera() {
    try {
        // Check browser support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Camera API not supported in this browser');
        }

        // Define constraints
        const constraints = {
            video: {
                facingMode: 'user',      // Front camera
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };

        // Request camera access
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);

        // Attach to video element
        videoElement = document.getElementById('video');
        videoElement.srcObject = currentStream;

        // Wait for video to be ready
        await new Promise((resolve) => {
            videoElement.onloadedmetadata = resolve;
        });

        // Update UI
        document.getElementById('start-camera').disabled = true;
        document.getElementById('capture-photo').disabled = false;
        document.getElementById('stop-camera').disabled = false;
        updateStatus('Camera started successfully');

    } catch (error) {
        handleCameraError(error);
    }
}

function handleCameraError(error) {
    let message = 'Unable to access camera: ';

    switch (error.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
            message += 'Permission denied. Please allow camera access in browser settings.';
            break;
        case 'NotFoundError':
        case 'DevicesNotFoundError':
            message += 'No camera found on this device.';
            break;
        case 'NotReadableError':
        case 'TrackStartError':
            message += 'Camera is in use by another application.';
            break;
        case 'OverconstrainedError':
            message += 'No camera matches the requested settings.';
            break;
        case 'SecurityError':
            message += 'Camera access requires HTTPS (not available on HTTP).';
            break;
        default:
            message += error.message || 'Unknown error';
    }

    document.getElementById('error').textContent = message;
    console.error('Camera error:', error);
}

function updateStatus(message) {
    document.getElementById('status').textContent = message;
}
```

#### Step 3: Capture Image from Video Stream

```javascript
function capturePhoto() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('capture-canvas');

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');

    // Mirror the image (if front camera)
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();

    // Convert to blob for upload
    canvas.toBlob(async (blob) => {
        if (!blob) {
            console.error('Failed to create blob from canvas');
            return;
        }

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `capture_${timestamp}.png`;

        // Show preview
        displayPreview(blob);

        // Upload to server
        await uploadImage(blob, filename);

    }, 'image/png', 0.95); // Format: PNG, Quality: 95%
}

function displayPreview(blob) {
    const url = URL.createObjectURL(blob);
    const img = document.createElement('img');
    img.src = url;
    img.style.width = '200px';
    document.body.appendChild(img);

    // Clean up object URL after use
    img.onload = () => URL.revokeObjectURL(url);
}

async function uploadImage(blob, filename) {
    const formData = new FormData();
    formData.append('image', blob, filename);
    formData.append('timestamp', new Date().toISOString());

    try {
        updateStatus('Uploading image...');

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
            // Note: Don't set Content-Type header - browser sets it automatically with boundary
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        updateStatus(`Upload successful! Image ID: ${result.id}`);
        console.log('Upload response:', result);

    } catch (error) {
        document.getElementById('error').textContent = `Upload failed: ${error.message}`;
        console.error('Upload error:', error);
    }
}
```

#### Step 4: Stop Camera (Critical for Privacy & Performance)

```javascript
function stopCamera() {
    // Stop all tracks in the stream
    if (currentStream) {
        currentStream.getTracks().forEach(track => {
            track.stop();
            console.log('Track stopped:', track.kind, track.label);
        });
        currentStream = null;
    }

    // Clear video element
    if (videoElement) {
        videoElement.srcObject = null;
    }

    // Update UI
    document.getElementById('start-camera').disabled = false;
    document.getElementById('capture-photo').disabled = true;
    document.getElementById('stop-camera').disabled = true;
    updateStatus('Camera stopped');
}

// Clean up when page unloads
window.addEventListener('beforeunload', stopCamera);
```

**Why This Matters:**
- Camera LED stays on if tracks aren't stopped
- Memory leaks on some browsers
- Battery drain on mobile
- Privacy concern (user thinks camera is off)

#### Step 5: Multi-Camera Support

```javascript
async function enumerateCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        const select = document.getElementById('camera-select');
        select.innerHTML = '';

        videoDevices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Camera ${index + 1}`;
            select.appendChild(option);
        });

        // Listen for camera selection changes
        select.addEventListener('change', async (e) => {
            stopCamera();
            await startCamera(e.target.value);
        });

    } catch (error) {
        console.error('Error enumerating devices:', error);
    }
}

async function startCamera(deviceId = null) {
    const constraints = {
        video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: 'user' },
        audio: false
    };

    // ... rest of startCamera implementation
}

// Call after first camera access (labels only available after permission granted)
startCamera().then(() => enumerateCameras());
```

---

### Approach B: Simple File Input (Fallback/Alternative)

For simple use cases or as a fallback when getUserMedia isn't available:

```html
<input
    type="file"
    accept="image/*"
    capture="user"
    id="camera-input"
    onchange="handleFileSelect(event)">

<script>
function handleFileSelect(event) {
    const file = event.target.files[0];

    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
    }

    // Validate file size (e.g., max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
        alert('File too large. Maximum size is 10MB');
        return;
    }

    // Option 1: Display preview
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = document.createElement('img');
        img.src = e.target.result;
        document.body.appendChild(img);
    };
    reader.readAsDataURL(file);

    // Option 2: Upload directly
    const formData = new FormData();
    formData.append('image', file);

    fetch('/api/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => console.log('Success:', data))
    .catch(error => console.error('Error:', error));
}
</script>
```

**Attributes:**
- `accept="image/*"`: Filters to image files only
- `capture="user"`: Suggests front camera on mobile (also: `capture="environment"` for back camera)
- **Note**: `capture` attribute is not standardized and behaves differently across browsers

---

## Real-World Implementation Patterns

### Pattern 1: Face Detection Integration (Liverpool Street Project)

This pattern is used in the actual codebase for facial analysis and skin diagnostics.

#### Architecture Overview

```
User Browser (React/Next.js)
    ↓
1. getUserMedia() - Request camera access
    ↓
2. Video element - Live preview
    ↓
3. requestAnimationFrame() - 30fps processing loop
    ↓
4. MediaPipe FaceLandmarker - Detect 478 face landmarks
    ↓
5. Canvas overlay - Draw guide/feedback
    ↓
6. Auto-capture trigger - When face is aligned
    ↓
7. Canvas.toBlob() - Convert to PNG
    ↓
8. FormData upload - Send to backend
    ↓
Backend (FastAPI Python)
    ↓
9. PIL/Pillow - Image processing
    ↓
10. PerfectCorp API - Skin analysis
    ↓
11. Overlay generation - Composite results
    ↓
12. Return analysis - JSON response
```

#### Key Implementation Details

**File: `app/components/FaceMeshView.tsx`** (Primary camera component)

##### Camera Initialization (Lines 575-619)

```typescript
const startCamera = useCallback(async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user",
                width: { ideal: 960 }
            }
        });

        const video = videoRef.current;
        if (!video) throw new Error("Video element not found");

        video.srcObject = stream;
        streamRef.current = stream;

        await new Promise<void>((resolve) => {
            video.onloadedmetadata = () => {
                video.play();
                resolve();
            };
        });

        setIsCameraOn(true);
        isCameraOnRef.current = true;

        // Start processing loop
        renderLoop();

    } catch (error) {
        console.error("Unable to start webcam", error);
        setErrorMessage("We couldn't access your webcam. Please check browser permissions.");
    }
}, [renderLoop]);
```

**Key Points:**
- Waits for `onloadedmetadata` before considering camera ready
- Uses `useCallback` to prevent unnecessary re-renders
- Stores stream in ref for later cleanup

##### Video Processing Loop (Lines 358-573)

```typescript
const renderLoop = useCallback(async () => {
    if (!isCameraOnRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !bundle) return;

    let results;
    try {
        // Suppress MediaPipe internal console errors
        const originalConsoleError = console.error;
        console.error = () => {};

        // Detect faces in current video frame
        results = bundle.landmarker.detectForVideo(
            video,
            performance.now()
        );

        console.error = originalConsoleError;
    } catch (error) {
        // Continue to next frame even on error
    }

    // Process face landmarks
    if (results?.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];

        // Calculate face metrics (distance, angle, etc.)
        const faceMetrics = analyzeFaceLandmarks(landmarks);

        // Draw overlay guide
        drawFaceGuide(canvas, faceMetrics);

        // Auto-capture when aligned
        if (shouldAutoCapture(faceMetrics)) {
            captureScreenshot(true); // true = auto-upload
        }
    }

    // Schedule next frame
    requestIdRef.current = requestAnimationFrame(() => {
        processingPromiseRef.current = renderLoop();
    });
}, [bundle, captureScreenshot]);
```

**Key Points:**
- Runs at ~30fps (requestAnimationFrame)
- Non-blocking error handling (continues on face detection failure)
- Ref-based state to avoid stale closures
- Uses performance.now() for accurate timing

##### Image Capture (Lines 661-768)

```typescript
const captureScreenshot = useCallback(
    async (autoUpload = false) => {
        const video = videoRef.current;
        if (!video) return;

        const captureCanvas = document.createElement("canvas");
        captureCanvas.width = video.videoWidth;
        captureCanvas.height = video.videoHeight;

        const ctx = captureCanvas.getContext("2d");
        if (!ctx) return;

        // Mirror transform for front camera
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-captureCanvas.width, 0);
        ctx.drawImage(video, 0, 0);
        ctx.restore();

        captureCanvas.toBlob(
            async (blob) => {
                if (!blob) {
                    console.error("Failed to create blob");
                    return;
                }

                const filename = `face_capture_${Date.now()}.png`;

                // Save locally via Next.js API route
                await saveLocally(blob, filename);

                // Optionally upload to backend
                if (autoUpload) {
                    await sendToBackend(blob, filename);
                }
            },
            "image/png",
            0.95 // Quality: 95%
        );
    },
    []
);

async function saveLocally(blob: Blob, filename: string) {
    const formData = new FormData();
    formData.append("file", blob, filename);
    formData.append("filename", filename);

    try {
        const response = await fetch("/api/save-image", {
            method: "POST",
            body: formData,
        });

        if (!response.ok) throw new Error("Local save failed");

        const data = await response.json();
        console.log("Saved locally:", data.path);

    } catch (error) {
        console.error("Error saving locally:", error);
    }
}

async function sendToBackend(blob: Blob, filename: string) {
    const formData = new FormData();
    formData.append("file", blob, filename);

    try {
        const response = await fetch(
            "http://localhost:8080/upload/hero-image",
            {
                method: "POST",
                body: formData,
            }
        );

        if (!response.ok) throw new Error("Backend upload failed");

        const data = await response.json();
        console.log("Backend response:", data);

    } catch (error) {
        console.error("Error uploading to backend:", error);
    }
}
```

**Key Points:**
- Uses temporary canvas for capture (not the overlay canvas)
- Mirrors image to match preview
- Dual upload: local filesystem + remote backend
- Error handling doesn't block UI

##### Camera Cleanup (Lines 298-356)

```typescript
const stopCamera = useCallback(async () => {
    isCameraOnRef.current = false;
    setIsCameraOn(false);

    // Cancel animation frame
    if (requestIdRef.current !== null) {
        cancelAnimationFrame(requestIdRef.current);
        requestIdRef.current = null;
    }

    // Wait for pending processing
    if (processingPromiseRef.current) {
        try {
            await processingPromiseRef.current;
        } catch (e) {
            console.error("Error during cleanup:", e);
        }
        processingPromiseRef.current = null;
    }

    // Stop video playback
    const video = videoRef.current;
    if (video) {
        video.pause();
        video.srcObject = null;
    }

    // Stop all media tracks
    if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
            track.stop();
        });
        streamRef.current = null;
    }

    // Reset state
    missCountRef.current = 0;
    lastLandmarksRef.current = null;
}, []);

// Cleanup on unmount
useEffect(() => {
    return () => {
        stopCamera();
    };
}, [stopCamera]);
```

**Critical Pattern:**
1. Set camera off flag FIRST (stops new frames)
2. Cancel animation frame
3. Await pending processing
4. Pause video
5. Stop all tracks
6. Null all refs
7. Reset state

**Common Mistake:** Stopping tracks before clearing video.srcObject can cause issues in some browsers.

---

### Pattern 2: Backend Upload Handler (FastAPI)

**File: `backend/main.py`** (Lines 273-370)

```python
from fastapi import FastAPI, UploadFile, File, HTTPException
from PIL import Image
import io

app = FastAPI()

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

@app.post("/upload/hero-image")
async def upload_hero_image(file: UploadFile = File(...)):
    try:
        # Validate filename
        if not file.filename:
            raise HTTPException(
                status_code=400,
                detail="Filename is required"
            )

        # Read file contents
        contents = await file.read()

        # Validate file size
        if len(contents) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size is 10MB"
            )

        # Convert to PIL Image (validates it's actually an image)
        try:
            image = Image.open(io.BytesIO(contents))
            image = image.convert("RGBA")
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid image file: {str(e)}"
            )

        # Generate unique file ID
        file_id = str(uuid.uuid4())

        # Save to filesystem
        output_path = f"uploads/{file_id}.png"
        os.makedirs("uploads", exist_ok=True)
        image.save(output_path, format="PNG")

        # Process with external API (PerfectCorp skin analysis)
        analysis_result = await process_skin_analysis(file_id, image)

        return {
            "success": True,
            "file_id": file_id,
            "path": output_path,
            "analysis": analysis_result
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error during upload"
        )
```

**Security Considerations:**
- ✅ File size validation
- ✅ Image format validation (via PIL)
- ✅ UUID for filenames (prevents path traversal)
- ⚠️ Missing: Authentication, rate limiting, MIME type validation

---

### Pattern 3: React Hook Pattern (Complete Implementation)

```typescript
import { useState, useRef, useCallback, useEffect } from 'react';

interface UseCameraOptions {
    facingMode?: 'user' | 'environment';
    width?: number;
    height?: number;
    onError?: (error: Error) => void;
}

interface UseCameraReturn {
    videoRef: React.RefObject<HTMLVideoElement>;
    isActive: boolean;
    error: string | null;
    startCamera: () => Promise<void>;
    stopCamera: () => void;
    captureImage: () => Promise<Blob | null>;
    switchCamera: () => Promise<void>;
}

export function useCamera(options: UseCameraOptions = {}): UseCameraReturn {
    const {
        facingMode = 'user',
        width = 1280,
        height = 720,
        onError
    } = options;

    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [isActive, setIsActive] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentFacingMode, setCurrentFacingMode] = useState(facingMode);

    const startCamera = useCallback(async () => {
        try {
            setError(null);

            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error('Camera API not supported');
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: currentFacingMode,
                    width: { ideal: width },
                    height: { ideal: height }
                },
                audio: false
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }

            streamRef.current = stream;
            setIsActive(true);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMessage);
            onError?.(err instanceof Error ? err : new Error(errorMessage));
            setIsActive(false);
        }
    }, [currentFacingMode, width, height, onError]);

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }

        setIsActive(false);
    }, []);

    const captureImage = useCallback(async (): Promise<Blob | null> => {
        if (!videoRef.current || !isActive) return null;

        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.drawImage(videoRef.current, 0, 0);

        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95);
        });
    }, [isActive]);

    const switchCamera = useCallback(async () => {
        stopCamera();
        setCurrentFacingMode(prev => prev === 'user' ? 'environment' : 'user');
        await startCamera();
    }, [stopCamera, startCamera]);

    // Cleanup on unmount
    useEffect(() => {
        return () => stopCamera();
    }, [stopCamera]);

    return {
        videoRef,
        isActive,
        error,
        startCamera,
        stopCamera,
        captureImage,
        switchCamera
    };
}

// Usage in component:
function CameraComponent() {
    const {
        videoRef,
        isActive,
        error,
        startCamera,
        stopCamera,
        captureImage
    } = useCamera({
        onError: (err) => console.error('Camera error:', err)
    });

    const handleCapture = async () => {
        const blob = await captureImage();
        if (blob) {
            // Upload or process blob
        }
    };

    return (
        <div>
            <video ref={videoRef} autoPlay playsInline muted />
            {error && <div style={{ color: 'red' }}>{error}</div>}
            <button onClick={startCamera} disabled={isActive}>
                Start Camera
            </button>
            <button onClick={stopCamera} disabled={!isActive}>
                Stop Camera
            </button>
            <button onClick={handleCapture} disabled={!isActive}>
                Capture
            </button>
        </div>
    );
}
```

---

## Security & Privacy

### Critical Security Issues Found in Real Implementation

#### ⚠️ CRITICAL: Hardcoded API Keys

**Issue:** API keys committed to repository.

```python
# ❌ NEVER DO THIS
PERFECTCORP_API_KEY = "sk-PqzWbE9NakYiOzQLN0OtHOGYVvAUw4wzIrj1igtjMWvPYbG9iZDqmNyG7-wU23EH"

# ✅ CORRECT APPROACH
import os
PERFECTCORP_API_KEY = os.environ.get("PERFECTCORP_API_KEY")
if not PERFECTCORP_API_KEY:
    raise ValueError("PERFECTCORP_API_KEY environment variable not set")
```

**Fix:**
1. Rotate ALL exposed keys immediately
2. Use environment variables
3. Add `*_config.txt`, `.env` to `.gitignore`
4. Use git-secrets or similar tools

#### ⚠️ CRITICAL: Path Traversal Vulnerability

**Issue:** User-controlled filenames used in file operations.

```typescript
// ❌ VULNERABLE
const filename = formData.get('filename') as string;
const filePath = path.join(publicDir, filename); // Can be ../../etc/passwd
await fs.writeFile(filePath, buffer);

// ✅ SECURE
import path from 'path';

function sanitizeFilename(filename: string): string {
    // Remove path components
    const basename = path.basename(filename);

    // Remove special characters
    const safe = basename.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Validate format
    if (!/^[a-zA-Z0-9._-]{1,255}$/.test(safe)) {
        throw new Error('Invalid filename format');
    }

    return safe;
}

const safeFilename = sanitizeFilename(formData.get('filename') as string);
const filePath = path.join(publicDir, safeFilename);

// Verify path is within public directory
const resolvedPath = path.resolve(filePath);
const resolvedPublicDir = path.resolve(publicDir);
if (!resolvedPath.startsWith(resolvedPublicDir)) {
    throw new Error('Path traversal attempt detected');
}

await fs.writeFile(resolvedPath, buffer);
```

#### ⚠️ CRITICAL: Missing Authentication

**Issue:** No authentication on upload endpoints.

```python
# ❌ UNSECURED
@app.post("/upload/hero-image")
async def upload_hero_image(file: UploadFile = File(...)):
    # Anyone can upload

# ✅ SECURED
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

async def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> str:
    """Verify JWT token and return user ID"""
    try:
        payload = jwt.decode(
            credentials.credentials,
            SECRET_KEY,
            algorithms=["HS256"]
        )
        return payload["user_id"]
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token"
        )

@app.post("/upload/hero-image")
async def upload_hero_image(
    file: UploadFile = File(...),
    user_id: str = Depends(verify_token)
):
    # Associate upload with authenticated user
    # Implement rate limiting per user
```

### Privacy Best Practices

#### 1. Camera Permission Handling

```javascript
async function requestCameraPermission() {
    try {
        // Request permission
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });

        // Check permission status
        const permission = await navigator.permissions.query({ name: 'camera' });

        console.log('Camera permission:', permission.state);
        // 'granted', 'denied', or 'prompt'

        // Listen for permission changes
        permission.addEventListener('change', () => {
            console.log('Permission changed to:', permission.state);
        });

        return stream;

    } catch (error) {
        if (error.name === 'NotAllowedError') {
            // Show instructions to enable camera
            showPermissionInstructions();
        }
        throw error;
    }
}

function showPermissionInstructions() {
    const instructions = `
        To enable camera access:

        Chrome: Click the camera icon in address bar
        Firefox: Click the lock icon → Permissions → Camera
        Safari: Safari menu → Settings → Websites → Camera
    `;
    alert(instructions);
}
```

#### 2. User Consent for Capture

**⚠️ Issue in Real Implementation:** Auto-capture without explicit consent.

```typescript
// ❌ AUTO-CAPTURES WITHOUT CONSENT
if (!hasAutoCapturedRef.current && frameCount >= 60) {
    captureScreenshot(true); // Uploads automatically!
}

// ✅ REQUIRES USER CONSENT
const [autoCapture Enabled, setAutoCaptureEnabled] = useState(false);

// In UI
<label>
    <input
        type="checkbox"
        checked={autoCaptureEnabled}
        onChange={(e) => setAutoCaptureEnabled(e.target.checked)}
    />
    Enable auto-capture and upload when face is aligned
</label>

// In capture logic
if (autoCaptureEnabled && frameCount >= 60) {
    captureScreenshot(true);
}
```

#### 3. Secure Data Storage

**⚠️ Issue:** Facial images in localStorage accessible to any script.

```typescript
// ❌ INSECURE - Stores sensitive images in localStorage
localStorage.setItem('capturedImages', JSON.stringify({
    dataUrl: canvas.toDataURL(), // Full image data!
    timestamp: Date.now()
}));

// ✅ SECURE - Don't store facial data locally
// Option 1: Don't store at all
sessionStorage.setItem('lastCapture', JSON.stringify({
    timestamp: Date.now()
    // No image data
}));

// Option 2: Use IndexedDB with expiration (if needed)
async function storeImageTemporarily(blob: Blob) {
    const db = await openDB('SecureImages', 1);
    await db.put('images', {
        blob,
        expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
    });

    // Auto-cleanup expired images
    const all = await db.getAll('images');
    for (const img of all) {
        if (img.expiresAt < Date.now()) {
            await db.delete('images', img.id);
        }
    }
}
```

#### 4. HTTPS Enforcement

```javascript
// Check for secure context
if (!window.isSecureContext) {
    throw new Error(
        'Camera access requires HTTPS. ' +
        'This page must be accessed via https:// or http://localhost'
    );
}

// In production, redirect to HTTPS
if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    location.replace(`https://${location.host}${location.pathname}`);
}
```

#### 5. Content Security Policy

```javascript
// next.config.js or HTTP headers
const securityHeaders = {
    'Content-Security-Policy': `
        default-src 'self';
        script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net;
        style-src 'self' 'unsafe-inline';
        img-src 'self' data: blob:;
        media-src 'self' blob:;
        connect-src 'self' ${process.env.BACKEND_URL};
        worker-src 'self' blob:;
    `,
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()'
};
```

#### 6. Rate Limiting

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@app.post("/upload/hero-image")
@limiter.limit("5/minute")  # 5 uploads per minute per IP
async def upload_hero_image(request: Request, file: UploadFile):
    # Implementation
```

---

## Browser Compatibility

### Support Matrix

| Browser | getUserMedia | Canvas Capture | File Input | Notes |
|---------|-------------|----------------|------------|-------|
| **Chrome 88+** | ✅ Full | ✅ | ✅ | Best support |
| **Firefox 85+** | ✅ Full | ✅ | ✅ | Blocks camera in private mode |
| **Safari 14+** | ⚠️ Limited | ✅ | ✅ | Requires user gesture, iOS quirks |
| **Edge 88+** | ✅ Full | ✅ | ✅ | Chromium-based, same as Chrome |
| **iOS Safari** | ⚠️ Limited | ✅ | ✅ | Fullscreen issues, needs playsInline |
| **Samsung Internet** | ✅ Full | ✅ | ✅ | Android default browser |
| **IE 11** | ❌ No | ✅ | ⚠️ Partial | No getUserMedia, use file input |

### Browser-Specific Issues

#### Safari/iOS

```javascript
// Issue 1: Requires user gesture for getUserMedia
document.getElementById('start-camera').addEventListener('click', async () => {
    // Must be in click handler
    await navigator.mediaDevices.getUserMedia({ video: true });
});

// Issue 2: Fullscreen behavior
// Add playsInline attribute
<video autoplay playsInline muted></video>

// Issue 3: Orientation changes
window.addEventListener('orientationchange', () => {
    // Restart camera to adjust to new dimensions
    stopCamera();
    setTimeout(startCamera, 500);
});
```

#### Firefox Private Mode

```javascript
// Firefox blocks camera access in private browsing
try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
} catch (error) {
    if (error.name === 'NotAllowedError') {
        // Could be private mode or user denial
        alert('Camera access blocked. If using private mode, try normal mode.');
    }
}
```

#### Mobile Browser Detection

```javascript
function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    );
}

function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// Adjust constraints for mobile
const constraints = {
    video: {
        facingMode: isMobile() ? 'environment' : 'user', // Back camera on mobile
        width: { ideal: isMobile() ? 1920 : 1280 },
        height: { ideal: isMobile() ? 1080 : 720 }
    }
};
```

### Progressive Enhancement

```javascript
async function initializeCamera() {
    // Check for getUserMedia support
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        // Modern approach
        try {
            await startCameraWithGetUserMedia();
            return;
        } catch (error) {
            console.warn('getUserMedia failed, falling back to file input', error);
        }
    }

    // Fallback to file input
    showFileInputFallback();
}

function showFileInputFallback() {
    const container = document.getElementById('camera-container');
    container.innerHTML = `
        <p>Your browser doesn't support live camera access.</p>
        <p>Please upload a photo instead:</p>
        <input type="file" accept="image/*" capture="user">
    `;
}
```

### Feature Detection

```javascript
const support = {
    getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    enumerateDevices: !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices),
    canvas: !!document.createElement('canvas').getContext,
    webWorkers: !!window.Worker,
    indexedDB: !!window.indexedDB,
    serviceWorker: 'serviceWorker' in navigator,
    webRTC: !!(window.RTCPeerConnection || window.webkitRTCPeerConnection)
};

console.table(support);

if (!support.getUserMedia) {
    alert('Camera API not supported. Please use a modern browser.');
}
```

---

## Production Checklist

### Before Going Live

#### ✅ Security
- [ ] All API keys moved to environment variables
- [ ] `.gitignore` includes config files
- [ ] Authentication implemented on all endpoints
- [ ] Rate limiting configured (uploads, API calls)
- [ ] File size limits enforced
- [ ] File type validation (magic bytes, not just extension)
- [ ] Path traversal protection (sanitize filenames)
- [ ] HTTPS enforced (no HTTP in production)
- [ ] CSP headers configured
- [ ] CORS properly configured (specific origins, not "*")

#### ✅ Privacy
- [ ] User consent required before capture
- [ ] Privacy policy displayed
- [ ] Camera permission clearly explained
- [ ] Data retention policy implemented
- [ ] No sensitive data in localStorage
- [ ] Auto-capture is opt-in (not default)
- [ ] Clear camera indicator visible when active
- [ ] GDPR compliance (if applicable)

#### ✅ Performance
- [ ] Image compression before upload
- [ ] Lazy loading of heavy libraries (MediaPipe, TensorFlow)
- [ ] Processing runs in Web Worker (if CPU-intensive)
- [ ] Camera stream properly cleaned up
- [ ] No memory leaks (check with DevTools)
- [ ] Frame rate adapts to device performance
- [ ] Bundle size optimized (<1MB initial load)

#### ✅ UX/Accessibility
- [ ] Loading states for camera initialization
- [ ] Clear error messages with recovery steps
- [ ] Keyboard navigation works (Tab, Enter, Space)
- [ ] Screen reader support (ARIA labels)
- [ ] Focus indicators visible
- [ ] Works in portrait and landscape
- [ ] Touch targets ≥44px (mobile)
- [ ] Fallback to file input if camera fails

#### ✅ Browser Compatibility
- [ ] Tested on Chrome, Firefox, Safari, Edge
- [ ] Tested on iOS Safari (iPhone and iPad)
- [ ] Tested on Android Chrome
- [ ] Polyfills included if needed
- [ ] Graceful degradation for old browsers
- [ ] No console errors in any browser

#### ✅ Testing
- [ ] Unit tests for core functions
- [ ] Integration tests for upload flow
- [ ] E2E tests for complete user journey
- [ ] Performance testing (Lighthouse score >90)
- [ ] Security testing (OWASP top 10)
- [ ] Load testing (concurrent uploads)
- [ ] Cross-device testing (real devices)

#### ✅ Monitoring
- [ ] Error tracking (Sentry, LogRocket, etc.)
- [ ] Analytics (capture success rate, errors)
- [ ] Performance monitoring (upload times)
- [ ] Server logs (upload failures, validation errors)
- [ ] Alerts for high error rates

#### ✅ Documentation
- [ ] API documentation (upload format, response)
- [ ] User guide (how to enable camera)
- [ ] Troubleshooting guide (common errors)
- [ ] Privacy policy (data handling)
- [ ] Browser support page

---

## Troubleshooting

### Common Issues & Solutions

#### 1. Camera Not Starting

**Symptom:** Black video element, no camera LED.

**Possible Causes:**

```javascript
// Check 1: HTTPS requirement
if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    console.error('getUserMedia requires HTTPS in production');
}

// Check 2: Browser support
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.error('getUserMedia not supported');
}

// Check 3: Permission denied
try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
} catch (error) {
    console.error('Permission error:', error.name, error.message);
    // NotAllowedError = user denied or browser blocked
}

// Check 4: Camera in use
// Error: NotReadableError or TrackStartError
// Solution: Close other apps/tabs using camera
```

#### 2. Video Element Shows Black Screen

```javascript
// Solution 1: Wait for metadata
video.onloadedmetadata = () => {
    video.play(); // Must call play() after stream attached
};

// Solution 2: Check video dimensions
console.log('Video dimensions:', video.videoWidth, video.videoHeight);
// If 0x0, video isn't ready yet

// Solution 3: Autoplay policy
video.muted = true; // Required for autoplay in some browsers
video.playsInline = true; // Required on iOS
```

#### 3. Camera LED Stays On After Stop

```javascript
// Issue: Tracks not properly stopped
function stopCamera() {
    if (streamRef.current) {
        // Must stop ALL tracks
        streamRef.current.getTracks().forEach(track => {
            console.log('Stopping track:', track.kind, track.readyState);
            track.stop();

            // Verify it stopped
            if (track.readyState !== 'ended') {
                console.error('Track did not stop properly');
            }
        });

        // Clear the stream
        streamRef.current = null;
    }

    // Also clear video element
    if (video.srcObject) {
        video.srcObject = null;
    }
}
```

#### 4. Canvas toBlob Returns Null

```javascript
// Issue: Canvas context not available
const ctx = canvas.getContext('2d');
if (!ctx) {
    console.error('Failed to get 2D context');
    return;
}

// Issue: Video not ready
if (video.readyState < 2) {
    console.error('Video not ready yet');
    return;
}

// Issue: Canvas dimensions not set
canvas.width = video.videoWidth || 1280;
canvas.height = video.videoHeight || 720;

// Issue: Corrupted image data
canvas.toBlob((blob) => {
    if (!blob) {
        console.error('toBlob returned null');
        // Try alternative: canvas.toDataURL()
        const dataUrl = canvas.toDataURL('image/png');
        const blob = dataURLToBlob(dataUrl);
    }
}, 'image/png', 0.95);

function dataURLToBlob(dataUrl) {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}
```

#### 5. Upload Fails with 413 or 400 Error

```javascript
// 413 Payload Too Large
// Solution: Compress before upload
async function compressImage(blob, maxSizeKB = 500) {
    const img = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');

    // Calculate scaled dimensions
    let { width, height } = img;
    const maxDimension = 1920;

    if (width > maxDimension || height > maxDimension) {
        if (width > height) {
            height = (height / width) * maxDimension;
            width = maxDimension;
        } else {
            width = (width / height) * maxDimension;
            height = maxDimension;
        }
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    // Binary search for optimal quality
    let quality = 0.9;
    let compressed = await canvasToBlob(canvas, quality);

    while (compressed.size > maxSizeKB * 1024 && quality > 0.1) {
        quality -= 0.1;
        compressed = await canvasToBlob(canvas, quality);
    }

    return compressed;
}

function canvasToBlob(canvas, quality) {
    return new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', quality);
    });
}
```

#### 6. CORS Error on Upload

```javascript
// Error: "No 'Access-Control-Allow-Origin' header is present"

// Frontend: Check endpoint URL
const UPLOAD_URL = process.env.NEXT_PUBLIC_UPLOAD_URL || 'http://localhost:8080';

// Backend: Configure CORS
// FastAPI
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://yourdomain.com"
    ],
    allow_credentials=True,
    allow_methods=["POST"],
    allow_headers=["*"],
)

// Express.js
const cors = require('cors');
app.use(cors({
    origin: ['http://localhost:3000', 'https://yourdomain.com'],
    methods: ['POST'],
    credentials: true
}));
```

#### 7. iOS Safari Issues

```javascript
// Issue 1: Fullscreen on video play
// Solution: Add playsInline
<video autoplay playsInline muted></video>

// Issue 2: getUserMedia requires user gesture
// Solution: Call in click handler
<button onclick="startCamera()">Start Camera</button>

// Issue 3: Orientation change breaks video
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        // Restart camera with new dimensions
        stopCamera();
        startCamera();
    }, 500); // Delay for orientation animation
});

// Issue 4: Memory pressure on older devices
// Solution: Reduce resolution
const constraints = {
    video: {
        facingMode: 'user',
        width: { ideal: 640 },  // Lower for iOS
        height: { ideal: 480 },
        frameRate: { ideal: 15 } // Lower FPS
    }
};
```

#### 8. Performance Issues / High CPU Usage

```javascript
// Issue: Processing every frame at 60fps
// Solution: Throttle processing

let lastProcessTime = 0;
const PROCESS_INTERVAL = 100; // Process every 100ms (10fps)

function renderLoop() {
    const now = performance.now();

    if (now - lastProcessTime > PROCESS_INTERVAL) {
        // Do expensive processing
        processFrame();
        lastProcessTime = now;
    }

    // Always render preview (cheap)
    renderPreview();

    requestAnimationFrame(renderLoop);
}

// Solution: Use Web Worker for heavy processing
// main.js
const worker = new Worker('process-worker.js');

worker.postMessage({ imageData: ctx.getImageData(0, 0, w, h) });

worker.onmessage = (e) => {
    const result = e.data;
    // Update UI with result
};

// process-worker.js
self.onmessage = (e) => {
    const { imageData } = e.data;

    // Do heavy processing here
    const result = expensiveProcessing(imageData);

    self.postMessage(result);
};
```

---

## Advanced Topics

### 1. Multi-Camera Selection

```javascript
async function getCameraList() {
    // Must request permission first for device labels to appear
    await navigator.mediaDevices.getUserMedia({ video: true });

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(device => device.kind === 'videoinput');

    return cameras.map(camera => ({
        id: camera.deviceId,
        label: camera.label || `Camera ${cameras.indexOf(camera) + 1}`,
        facingMode: camera.label.toLowerCase().includes('front') ? 'user' : 'environment'
    }));
}

async function selectCamera(deviceId) {
    const constraints = {
        video: {
            deviceId: { exact: deviceId }
        }
    };

    return await navigator.mediaDevices.getUserMedia(constraints);
}

// UI
const cameraList = await getCameraList();
const select = document.getElementById('camera-select');

cameraList.forEach(camera => {
    const option = document.createElement('option');
    option.value = camera.id;
    option.textContent = camera.label;
    select.appendChild(option);
});

select.addEventListener('change', async (e) => {
    stopCamera();
    const stream = await selectCamera(e.target.value);
    video.srcObject = stream;
});
```

### 2. Real-Time Filters & Effects

```javascript
// Apply filter to video stream via canvas
function renderWithFilter() {
    const canvas = document.getElementById('canvas');
    const video = document.getElementById('video');
    const ctx = canvas.getContext('2d');

    function loop() {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Apply filter (e.g., grayscale)
        for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            data[i] = avg;     // Red
            data[i + 1] = avg; // Green
            data[i + 2] = avg; // Blue
            // data[i + 3] is alpha (don't change)
        }

        // Put filtered data back
        ctx.putImageData(imageData, 0, 0);

        requestAnimationFrame(loop);
    }

    loop();
}

// CSS Filters (simpler, GPU-accelerated)
video.style.filter = 'grayscale(100%)';
video.style.filter = 'sepia(100%)';
video.style.filter = 'brightness(1.2) contrast(1.1)';
```

### 3. Face Detection with TensorFlow.js

```javascript
import * as faceapi from '@vladmandic/face-api';

async function loadModels() {
    await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
}

async function detectFaces(video) {
    const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

    return detections;
}

// Render loop with face detection
async function renderLoop() {
    const detections = await detectFaces(video);

    // Draw face boxes
    const canvas = document.getElementById('overlay');
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detections.forEach(detection => {
        const box = detection.detection.box;
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        // Draw landmarks
        const landmarks = detection.landmarks.positions;
        ctx.fillStyle = '#ff0000';
        landmarks.forEach(point => {
            ctx.fillRect(point.x - 2, point.y - 2, 4, 4);
        });
    });

    requestAnimationFrame(renderLoop);
}
```

### 4. Video Recording

```javascript
let mediaRecorder;
let recordedChunks = [];

async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });

    mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 2500000 // 2.5 Mbps
    });

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        recordedChunks = [];

        // Download video
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'recording.webm';
        a.click();
    };

    mediaRecorder.start(1000); // Collect data every 1s
}

function stopRecording() {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
}
```

### 5. Background Blur/Replacement

```javascript
// Using @tensorflow-models/body-segmentation
import * as bodySegmentation from '@tensorflow-models/body-segmentation';

const segmenter = await bodySegmentation.createSegmenter(
    bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation,
    {
        runtime: 'mediapipe',
        modelType: 'general'
    }
);

async function blurBackground() {
    const segmentation = await segmenter.segmentPeople(video);

    // Draw original video
    ctx.drawImage(video, 0, 0);

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const mask = segmentation[0].mask.toCanvasImageSource();

    // Apply blur to background pixels
    // (Person pixels have mask value 1, background has 0)
    // Implementation depends on body-segmentation API
}
```

### 6. QR Code Scanner

```javascript
import jsQR from 'jsqr';

function scanForQRCode() {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, canvas.width, canvas.height);

    if (code) {
        console.log('QR Code detected:', code.data);

        // Draw box around QR code
        const overlayCtx = overlayCanvas.getContext('2d');
        overlayCtx.strokeStyle = '#00ff00';
        overlayCtx.lineWidth = 4;
        overlayCtx.strokeRect(
            code.location.topLeftCorner.x,
            code.location.topLeftCorner.y,
            code.location.bottomRightCorner.x - code.location.topLeftCorner.x,
            code.location.bottomRightCorner.y - code.location.topLeftCorner.y
        );

        return code.data;
    }

    return null;
}

// Continuous scanning
function scanLoop() {
    const qrData = scanForQRCode();
    if (qrData) {
        alert('QR Code: ' + qrData);
    }
    requestAnimationFrame(scanLoop);
}
```

---

## Conclusion

This guide covers the complete implementation of browser camera capture, from basic usage to production-ready systems. Key takeaways:

### ✅ Always Do:
- Request camera permission explicitly
- Clean up streams properly (stop all tracks)
- Validate file types and sizes
- Use HTTPS in production
- Handle errors gracefully
- Provide fallbacks for unsupported browsers
- Get user consent before capture
- Secure your endpoints with authentication

### ❌ Never Do:
- Hardcode API keys in code
- Store facial images in localStorage
- Use user-provided filenames directly
- Auto-capture without consent
- Suppress console errors silently
- Forget to stop camera on unmount
- Trust client-side validation alone
- Deploy without rate limiting

### 🔒 Security Priorities:
1. Move secrets to environment variables
2. Implement authentication
3. Sanitize all user inputs
4. Enable HTTPS only
5. Configure CORS properly
6. Add rate limiting
7. Validate file contents (not just extensions)
8. Implement CSP headers

### 📚 Resources:
- [MDN: getUserMedia()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [MDN: Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [MediaPipe Face Landmarker](https://developers.google.com/mediapipe/solutions/vision/face_landmarker)
- [TensorFlow.js](https://www.tensorflow.org/js)
- [Can I Use: getUserMedia](https://caniuse.com/stream)
- [Web.dev: Media Capabilities](https://web.dev/media-capabilities/)

---

**Last Updated:** February 2026
**Based On:** Liverpool Street Backend implementation (Face analysis & skin diagnostics)
**License:** MIT (adapt as needed for your project)
