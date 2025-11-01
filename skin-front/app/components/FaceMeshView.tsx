"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  generateImageFilename,
  blobToFile,
  saveImageMetadata,
  downloadImage,
  type SavedImage
} from "../utils/imageHandler";
import { analyzeSkinImage } from "../services/skinAnalysisApi";

const CDN_VERSION = "0.10.3";
const MAX_MISS_COUNT = 45;
const TESSELLATION_LINE_WIDTH = 0.2;
const FEATURE_LINE_WIDTH = 0.25;
const BACKEND_ENDPOINT = process.env.NEXT_PUBLIC_SKIN_BACKEND_URL ?? "";
const DISENGAGE_FRAME_LIMIT = 12;
const CLOSE_UNLOCK_FRAMES = 6;
const ALIGNMENT_TARGET = {
  minWidth: 0.34,
  minHeight: 0.44,
  nearWidth: 0.3,
  nearHeight: 0.36,
  centerToleranceX: 0.12,
  centerToleranceY: 0.12,
  targetCenterY: 0.5,
};

type NormalizedLandmark = { x: number; y: number };

type FaceLandmarkerModule = {
  FaceLandmarker: any;
  FilesetResolver: any;
  DrawingUtils: any;
};

type LandmarkerBundle = {
  module: FaceLandmarkerModule;
  landmarker: any;
};

type FaceMeshViewProps = {
  onAnalysisStateChange?: (state: {
    isCameraOn: boolean;
    hasAnimationStarted: boolean;
    statusMessage: string;
  }) => void;
};

const loadFaceLandmarkerModule = async (): Promise<FaceLandmarkerModule> => {
  const cacheKey = "__mediapipe_face_landmarker__";

  if (typeof window === "undefined") {
    throw new Error("Face landmarker can only run in the browser.");
  }

  const cached = (window as any)[cacheKey] as FaceLandmarkerModule | undefined;
  if (cached) {
    return cached;
  }

  // Ensure the remote ESM import stays untouched for the browser.
  // @ts-ignore
  const module = await import(
    /* webpackIgnore: true */
    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${CDN_VERSION}`
  );

  (window as any)[cacheKey] = module;
  return module;
};

const wrapToUnitInterval = (value: number) => {
  const fractional = value - Math.floor(value);
  return fractional < 0 ? fractional + 1 : fractional;
};

const getAnimatedColor = (x: number, y: number, elapsedSeconds: number) => {
  const horizontalPhase = wrapToUnitInterval(x + elapsedSeconds * 0.18);
  const verticalPhase = wrapToUnitInterval(y + elapsedSeconds * 0.24);
  const hue = (horizontalPhase * 360 + verticalPhase * 120 + elapsedSeconds * 40) % 360;
  const saturation = 75 + Math.sin((horizontalPhase + verticalPhase) * Math.PI * 2 + elapsedSeconds) * 15;
  const lightness = 55 + Math.cos(verticalPhase * Math.PI * 2 + elapsedSeconds * 1.6) * 12;

  return `hsl(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%)`;
};

const normalizeConnectorList = (connectors: unknown): Array<[number, number]> => {
  if (!connectors) {
    return [];
  }

  const isPairArray = (value: unknown): value is [number, number] =>
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(Number(value[0])) &&
    Number.isFinite(Number(value[1]));

  if (Array.isArray(connectors)) {
    if (connectors.length && isPairArray(connectors[0])) {
      return connectors as Array<[number, number]>;
    }

    const normalized: Array<[number, number]> = [];

    for (const entry of connectors) {
      if (isPairArray(entry)) {
        normalized.push([Number(entry[0]), Number(entry[1])]);
        continue;
      }

      if (entry && typeof entry === "object" && "start" in entry && "end" in entry) {
        const start = Number((entry as { start: number }).start);
        const end = Number((entry as { end: number }).end);
        if (Number.isFinite(start) && Number.isFinite(end)) {
          normalized.push([start, end]);
        }
      }
    }

    if (normalized.length) {
      return normalized;
    }
  }

  if (typeof connectors === "object" && connectors !== null && "length" in connectors) {
    const arrayLike = connectors as ArrayLike<number>;
    const normalized: Array<[number, number]> = [];

    for (let i = 0; i + 1 < arrayLike.length; i += 2) {
      const start = Number(arrayLike[i]);
      const end = Number(arrayLike[i + 1]);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        normalized.push([start, end]);
      }
    }

    if (normalized.length) {
      return normalized;
    }
  }

  return [];
};

const evaluateAlignment = (landmarks: Array<NormalizedLandmark>) => {
  if (!landmarks?.length) {
    return { isAligned: false, isClose: false };
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of landmarks) {
    if (typeof point?.x !== "number" || typeof point?.y !== "number") {
      continue;
    }

    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return { isAligned: false, isClose: false };
  }

  const width = Math.max(0, maxX - minX);
  const height = Math.max(0, maxY - minY);
  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;

  const isClose = width >= ALIGNMENT_TARGET.nearWidth && height >= ALIGNMENT_TARGET.nearHeight;

  const isAligned =
    width >= ALIGNMENT_TARGET.minWidth &&
    height >= ALIGNMENT_TARGET.minHeight &&
    Math.abs(centerX - 0.5) <= ALIGNMENT_TARGET.centerToleranceX &&
    Math.abs(centerY - ALIGNMENT_TARGET.targetCenterY) <= ALIGNMENT_TARGET.centerToleranceY;

  return { isAligned, isClose };
};

const drawAnimatedTessellation = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  landmarks: Array<{ x: number; y: number }>,
  connectors: unknown,
  elapsedSeconds: number
) => {
  if (!landmarks?.length || !connectors) {
    return;
  }

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.95;

  const normalizedConnectors = normalizeConnectorList(connectors);

  for (const [startIndex, endIndex] of normalizedConnectors) {
    const start = landmarks[startIndex];
    const end = landmarks[endIndex];

    if (!start || !end) {
      continue;
    }

    const startX = start.x * canvas.width;
    const startY = start.y * canvas.height;
    const endX = end.x * canvas.width;
    const endY = end.y * canvas.height;

    const midX = (start.x + end.x) * 0.5;
    const midY = (start.y + end.y) * 0.5;
    const color = getAnimatedColor(midX, midY, elapsedSeconds);

    const wave = Math.sin((midX + midY + elapsedSeconds) * Math.PI * 2);
    const lineWidth = Math.max(0.8, TESSELLATION_LINE_WIDTH * 6 + wave * 0.6);

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  ctx.restore();
};

export const FaceMeshView = ({ onAnalysisStateChange }: FaceMeshViewProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestIdRef = useRef<number | null>(null);
  const processingPromiseRef = useRef<Promise<void> | null>(null);

  const bundleRef = useRef<LandmarkerBundle | null>(null);
  const runningModeRef = useRef<"IMAGE" | "VIDEO">("IMAGE");
  const streamRef = useRef<MediaStream | null>(null);
  const isCameraOnRef = useRef(false);
  const lastLandmarksRef = useRef<any[] | null>(null);
  const missCountRef = useRef(0);
  const capturedBlobRef = useRef<Blob | null>(null);
  const capturedImageRef = useRef<SavedImage | null>(null);
  const animationStartRef = useRef<number | null>(null);
  const disengageCountRef = useRef(0);
  const closeFrameCountRef = useRef(0);
  const hasAnimationStartedRef = useRef(false);
  const guideHighlightedRef = useRef(false);
  const hasAutoCapturedRef = useRef(false);
  const autoCaptureFrameCountRef = useRef(0);

  const [isReady, setIsReady] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Loading face mesh...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [hasAnimationStarted, setHasAnimationStarted] = useState(false);
  const [isGuideHighlighted, setIsGuideHighlighted] = useState(false);

  useEffect(() => {
    onAnalysisStateChange?.({
      isCameraOn,
      hasAnimationStarted,
      statusMessage,
    });
  }, [hasAnimationStarted, isCameraOn, onAnalysisStateChange, statusMessage]);

  const revertToGuide = useCallback((message?: string) => {
    if (!hasAnimationStartedRef.current) {
      if (message) {
        setStatusMessage(message);
      }
      return;
    }

    hasAnimationStartedRef.current = false;
    setHasAnimationStarted(false);
    animationStartRef.current = null;
    disengageCountRef.current = 0;
    closeFrameCountRef.current = 0;
    lastLandmarksRef.current = null;
    missCountRef.current = 0;
    guideHighlightedRef.current = false;
    setIsGuideHighlighted(false);
    setStatusMessage(message ?? "Line up your face with the outline to begin.");
  }, []);
  const stopCamera = useCallback(async () => {
    if (!isCameraOnRef.current && !streamRef.current) {
      setStatusMessage("Camera disabled.");
      return;
    }

    isCameraOnRef.current = false;
    setIsCameraOn(false);

    if (requestIdRef.current !== null) {
      cancelAnimationFrame(requestIdRef.current);
      requestIdRef.current = null;
    }

    const pending = processingPromiseRef.current;
    if (pending) {
      try {
        await pending;
      } catch {
        // ignore processing errors during shutdown
      }
      processingPromiseRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }

    missCountRef.current = 0;
    lastLandmarksRef.current = null;
    capturedBlobRef.current = null;
    capturedImageRef.current = null;
    animationStartRef.current = null;
    disengageCountRef.current = 0;
    closeFrameCountRef.current = 0;
    hasAnimationStartedRef.current = false;
    guideHighlightedRef.current = false;
    hasAutoCapturedRef.current = false;
    autoCaptureFrameCountRef.current = 0;
    setCapturedImageUrl(null);
    setUploadStatus(null);
    setHasAnimationStarted(false);
    setIsGuideHighlighted(false);

    // Skip the setOptions call - MediaPipe handles mode internally
    // Just reset our tracking state
    if (runningModeRef.current !== "IMAGE") {
      runningModeRef.current = "IMAGE";
    }

    setStatusMessage("Camera disabled.");
  }, []);

  const renderLoop = useCallback(async () => {
    if (!isCameraOnRef.current) {
      processingPromiseRef.current = null;
      return;
    }

    const bundle = bundleRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!bundle || !video || !canvas) {
      processingPromiseRef.current = null;
      if (isCameraOnRef.current) {
        requestIdRef.current = requestAnimationFrame(() => {
          processingPromiseRef.current = renderLoop();
        });
      }
      return;
    }

    if (video.readyState < 2) {
      requestIdRef.current = requestAnimationFrame(() => {
        processingPromiseRef.current = renderLoop();
      });
      return;
    }

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      requestIdRef.current = requestAnimationFrame(() => {
        processingPromiseRef.current = renderLoop();
      });
      return;
    }

    const now = performance.now();
    if (animationStartRef.current === null) {
      animationStartRef.current = now;
    }

    // Skip the setOptions call - MediaPipe handles mode internally
    // Just mark that we're now in VIDEO mode for our tracking
    if (runningModeRef.current !== "VIDEO") {
      runningModeRef.current = "VIDEO";
    }

    let results: any;
    try {
      // Temporarily suppress console.error to avoid MediaPipe internal logs
      const originalConsoleError = console.error;
      console.error = () => {};

      results = bundle.landmarker.detectForVideo(video, performance.now());

      // Restore console.error
      console.error = originalConsoleError;
    } catch (error) {
      // Silently handle the error - MediaPipe internal errors don't affect functionality
      // Just continue to the next frame
      requestIdRef.current = requestAnimationFrame(() => {
        processingPromiseRef.current = renderLoop();
      });
      return;
    }

    if (results?.faceLandmarks?.length) {
      lastLandmarksRef.current = results.faceLandmarks;
      missCountRef.current = 0;

      const [primaryFace] = results.faceLandmarks as Array<Array<NormalizedLandmark>>;
      if (primaryFace) {
        const { isAligned, isClose } = evaluateAlignment(primaryFace);

        if (!hasAnimationStartedRef.current) {
          disengageCountRef.current = 0;

          if (guideHighlightedRef.current !== isClose) {
            guideHighlightedRef.current = isClose;
            setIsGuideHighlighted(isClose);
            setStatusMessage(
              isClose
                ? "Hold still — we're about to unlock the mesh."
                : "Move closer and line up with the outline to begin."
            );
          }

          if (isClose) {
            closeFrameCountRef.current += 1;
          } else {
            closeFrameCountRef.current = 0;
          }

          if (isAligned || closeFrameCountRef.current >= CLOSE_UNLOCK_FRAMES) {
            hasAnimationStartedRef.current = true;
            setHasAnimationStarted(true);
            guideHighlightedRef.current = false;
            setIsGuideHighlighted(false);
            animationStartRef.current = now;
            disengageCountRef.current = 0;
            closeFrameCountRef.current = 0;
            setStatusMessage("Mesh unlocked — move around to explore.");
          }
        } else {
          if (isClose) {
            disengageCountRef.current = 0;
            closeFrameCountRef.current = 0;

            // Auto-capture logic: capture once when face is close during animation
            if (!hasAutoCapturedRef.current) {
              autoCaptureFrameCountRef.current += 1;

              // Capture after 60 frames (about 2 seconds) of being close
              // This gives time for the user to look directly at the camera
              if (autoCaptureFrameCountRef.current >= 60) {
                hasAutoCapturedRef.current = true;
                // Trigger automatic capture with auto-upload
                captureScreenshot(true);
                setStatusMessage("Auto-capturing and uploading your face...");
              }
            }
          } else {
            disengageCountRef.current += 1;
            autoCaptureFrameCountRef.current = 0; // Reset if face moves away
            if (disengageCountRef.current > DISENGAGE_FRAME_LIMIT) {
              revertToGuide("You're too far away — move into the outline to relaunch the mesh.");
            }
          }
        }
      } else if (hasAnimationStartedRef.current) {
        disengageCountRef.current += 1;
        if (disengageCountRef.current > DISENGAGE_FRAME_LIMIT) {
          revertToGuide("Tracking lost — step into the outline to start again.");
        }
      }
    } else if (lastLandmarksRef.current) {
      missCountRef.current += 1;
      if (hasAnimationStartedRef.current) {
        disengageCountRef.current += 1;
        if (disengageCountRef.current > DISENGAGE_FRAME_LIMIT) {
          revertToGuide("Tracking lost — step into the outline to start again.");
        }
      }
      if (missCountRef.current > MAX_MISS_COUNT) {
        lastLandmarksRef.current = null;
      }
    } else if (!hasAnimationStartedRef.current && guideHighlightedRef.current) {
      guideHighlightedRef.current = false;
      setIsGuideHighlighted(false);
      setStatusMessage("Move closer and line up with the outline to begin.");
      closeFrameCountRef.current = 0;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const elapsedSeconds =
      animationStartRef.current !== null ? (now - animationStartRef.current) / 1000 : 0;

    const facesToDraw = lastLandmarksRef.current;
    if (facesToDraw?.length && hasAnimationStartedRef.current) {
      const drawingUtils = new bundle.module.DrawingUtils(ctx);
      for (const landmarks of facesToDraw) {
        drawAnimatedTessellation(
          ctx,
          canvas,
          landmarks,
          bundle.module.FaceLandmarker.FACE_LANDMARKS_TESSELATION,
          elapsedSeconds
        );
        drawingUtils.drawConnectors(landmarks, bundle.module.FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, {
          color: "#f472b6",
          lineWidth: FEATURE_LINE_WIDTH,
        });
        drawingUtils.drawConnectors(landmarks, bundle.module.FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW, {
          color: "#f472b6",
          lineWidth: FEATURE_LINE_WIDTH,
        });
        drawingUtils.drawConnectors(landmarks, bundle.module.FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, {
          color: "#34d399",
          lineWidth: FEATURE_LINE_WIDTH,
        });
        drawingUtils.drawConnectors(landmarks, bundle.module.FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW, {
          color: "#34d399",
          lineWidth: FEATURE_LINE_WIDTH,
        });
        drawingUtils.drawConnectors(landmarks, bundle.module.FaceLandmarker.FACE_LANDMARKS_LIPS, {
          color: "#fde047",
          lineWidth: FEATURE_LINE_WIDTH,
        });
        drawingUtils.drawConnectors(landmarks, bundle.module.FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, {
          color: "#e2e8f0",
          lineWidth: FEATURE_LINE_WIDTH,
        });
        drawingUtils.drawConnectors(landmarks, bundle.module.FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS, {
          color: "#38bdf8",
          lineWidth: FEATURE_LINE_WIDTH,
        });
        drawingUtils.drawConnectors(landmarks, bundle.module.FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS, {
          color: "#38bdf8",
          lineWidth: FEATURE_LINE_WIDTH,
        });
      }
    }

    if (isCameraOnRef.current) {
      requestIdRef.current = requestAnimationFrame(() => {
        processingPromiseRef.current = renderLoop();
      });
    } else {
      processingPromiseRef.current = null;
    }
  }, [revertToGuide]);

  const startCamera = useCallback(async () => {
    if (!isReady || !bundleRef.current) {
      return;
    }

    try {
      setErrorMessage(null);
      setStatusMessage("Starting camera...");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 } },
      });

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();

      lastLandmarksRef.current = null;
      missCountRef.current = 0;
      isCameraOnRef.current = true;
      hasAnimationStartedRef.current = false;
      guideHighlightedRef.current = false;
      hasAutoCapturedRef.current = false;
      autoCaptureFrameCountRef.current = 0;
      disengageCountRef.current = 0;
      closeFrameCountRef.current = 0;
      animationStartRef.current = null;
      setIsCameraOn(true);
      setHasAnimationStarted(false);
      setIsGuideHighlighted(false);
      setStatusMessage("Line up your face with the outline to begin.");

      processingPromiseRef.current = renderLoop();
    } catch (error) {
      console.error("Unable to start webcam", error);
      setErrorMessage("We couldn't access your webcam. Please check browser permissions and try again.");
      await stopCamera();
    }
  }, [isReady, renderLoop, stopCamera]);

  const toggleCamera = useCallback(async () => {
    if (isCameraOnRef.current) {
      await stopCamera();
    } else {
      await startCamera();
    }
  }, [startCamera, stopCamera]);

  const uploadToBackend = async (blob: Blob, filename: string) => {
    try {
      const formData = new FormData();
      formData.append('file', blob, filename);

      const response = await fetch('http://localhost:8080/upload/hero-image', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Upload successful:', result);
        setUploadStatus(`✓ Image uploaded successfully! File ID: ${result.file_id?.substring(0, 20)}...`);

        // Log the full response for debugging
        console.log('Backend response:', {
          file_id: result.file_id,
          url: result.url
        });

        return result;
      } else {
        throw new Error(`Upload failed with status: ${response.status}`);
      }
    } catch (error) {
      console.error('Upload to backend failed:', error);
      setUploadStatus(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  };

  const captureScreenshot = useCallback(async (autoUpload: boolean = false) => {
    const video = videoRef.current;

    if (!video || !isCameraOnRef.current || video.videoWidth === 0 || video.videoHeight === 0) {
      setUploadStatus("Switch on the camera before capturing a snapshot.");
      return;
    }

    if (!captureCanvasRef.current) {
      captureCanvasRef.current = document.createElement("canvas");
    }

    const captureCanvas = captureCanvasRef.current;
    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;

    const ctx = captureCanvas.getContext("2d");
    if (!ctx) {
      setUploadStatus("Unable to create a canvas for the snapshot.");
      return;
    }

    try {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -captureCanvas.width, 0, captureCanvas.width, captureCanvas.height);
      ctx.restore();

      const blob = await new Promise<Blob>((resolve, reject) => {
        captureCanvas.toBlob((value) => {
          if (value) {
            resolve(value);
          } else {
            reject(new Error("Snapshot creation failed."));
          }
        }, "image/png");
      });

      // Generate a unique filename
      const filename = generateImageFilename();
      const dataUrl = captureCanvas.toDataURL("image/png");

      // Create a SavedImage object with all the metadata
      const savedImage: SavedImage = {
        filename,
        path: `/captured-images/${filename}`,
        blob,
        dataUrl,
        timestamp: Date.now()
      };

      // Store references for later use
      capturedBlobRef.current = blob;
      capturedImageRef.current = savedImage;
      setCapturedImageUrl(dataUrl);

      // Save metadata to localStorage (optional)
      saveImageMetadata(savedImage);

      // Automatically save the image to disk via API route
      const saveToFileSystem = async () => {
        try {
          const formData = new FormData();
          formData.append('image', blob, filename);
          formData.append('filename', filename);

          const saveResponse = await fetch('/api/save-image', {
            method: 'POST',
            body: formData,
          });

          if (saveResponse.ok) {
            const result = await saveResponse.json();
            console.log('Image saved to filesystem:', result);
            setUploadStatus(`✓ Snapshot saved as "${filename}" in public/captured-images/ — ready to send to your backend.`);
          } else {
            console.error('Failed to save image to disk');
            setUploadStatus(`Snapshot captured as "${filename}" (in memory) — ready to send to your backend.`);
          }
        } catch (error) {
          console.error('Error saving to filesystem:', error);
          setUploadStatus(`Snapshot captured as "${filename}" (in memory) — ready to send to your backend.`);
        }
      };

      // Save to filesystem in the background
      saveToFileSystem();

      console.log('Image captured:', {
        filename,
        size: `${(blob.size / 1024).toFixed(2)} KB`,
        dimensions: `${captureCanvas.width}x${captureCanvas.height}`
      });

      // If this is an auto-capture, automatically upload to backend
      if (autoUpload) {
        console.log('Auto-uploading captured image to backend...');
        try {
          await uploadToBackend(blob, filename);
        } catch (error) {
          console.error('Auto-upload failed, but image was still captured locally');
        }
      }
    } catch (error) {
      console.error("Failed to capture snapshot", error);
      setUploadStatus("Capturing the snapshot failed. Please try again.");
    }
  }, []);

  const sendSnapshotToBackend = useCallback(async () => {
    if (!capturedImageRef.current) {
      setUploadStatus("Capture a snapshot before sending it to the backend.");
      return;
    }

    if (!BACKEND_ENDPOINT) {
      setUploadStatus("Set NEXT_PUBLIC_SKIN_BACKEND_URL to your backend endpoint before uploading.");
      console.info(
        "Define NEXT_PUBLIC_SKIN_BACKEND_URL in your environment (e.g. http://localhost:4000) to enable uploads."
      );
      return;
    }

    setIsUploading(true);
    setUploadStatus(`Uploading "${capturedImageRef.current.filename}" to backend...`);

    try {
      // Convert blob to File with the generated filename
      const imageFile = blobToFile(
        capturedImageRef.current.blob,
        capturedImageRef.current.filename
      );

      // Use the new API service to send the image
      const response = await analyzeSkinImage({
        image: imageFile,
        userId: 'user-123', // You can get this from user context/auth
        metadata: {
          captureTime: capturedImageRef.current.timestamp,
          deviceInfo: navigator.userAgent,
          imageResolution: {
            width: videoRef.current?.videoWidth,
            height: videoRef.current?.videoHeight
          }
        }
      });

      if (response.success) {
        console.log("Skin analysis response:", response);
        setUploadStatus(
          `✓ Image "${capturedImageRef.current.filename}" sent successfully!` +
          (response.analysisId ? ` Analysis ID: ${response.analysisId}` : '')
        );

        // Optionally show results
        if (response.results) {
          console.log('Analysis results:', response.results);
        }
      } else {
        throw new Error(response.error || 'Upload failed');
      }
    } catch (error) {
      console.error("Snapshot upload failed", error);
      setUploadStatus(
        `Upload failed — ${error instanceof Error ? error.message : 'Unknown error'}. ` +
        `Ensure your backend is running at ${BACKEND_ENDPOINT}`
      );
    } finally {
      setIsUploading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      try {
        const module = await loadFaceLandmarkerModule();
        const filesetResolver = await module.FilesetResolver.forVisionTasks(
          `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${CDN_VERSION}/wasm`
        );
        const landmarker = await module.FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          numFaces: 1,
          runningMode: "VIDEO",
          outputFaceBlendshapes: false,
        });

        if (cancelled) {
          landmarker.close();
          return;
        }

        bundleRef.current = { module, landmarker };
        runningModeRef.current = "VIDEO";
        setIsReady(true);
        setStatusMessage("Face mesh ready — enable your camera to begin.");
      } catch (error) {
        console.error("Failed to initialise face landmarker", error);
        setErrorMessage("Unable to load the face mesh model. Please refresh and try again.");
      }
    };

    setup();

    return () => {
      cancelled = true;
      void (async () => {
        await stopCamera();
        if (bundleRef.current) {
          bundleRef.current.landmarker.close();
          bundleRef.current = null;
        }
      })();
    };
  }, [stopCamera]);

  return (
    <div className="face-mesh-card">
      <div className="face-mesh-header">
        <h2>Live Face Mesh</h2>
        <p>Enable your camera to see the grid overlay generated from real-time face landmarks.</p>
      </div>

      <div className={`face-mesh-stage ${isCameraOn ? "stage-active" : ""}`}>
        <video ref={videoRef} className="stage-video" autoPlay playsInline muted />
        <canvas ref={canvasRef} className="stage-canvas" />
        {isCameraOn && !hasAnimationStarted && (
          <div className={`alignment-overlay ${isGuideHighlighted ? "alignment-ready" : ""}`}>
            <svg className="alignment-outline" viewBox="0 0 220 300" role="presentation">
              <path
                className="alignment-outline-face"
                d="M110 12C159 12 198 66 198 130C198 190 160 252 110 288C60 252 22 190 22 130C22 66 61 12 110 12Z"
              />
              <path className="alignment-outline-nose" d="M110 94C110 134 110 170 110 214" />
              <path className="alignment-outline-brow" d="M60 110C78 96 96 96 110 96C124 96 142 96 160 110" />
            </svg>
            <p className="alignment-text">
              {isGuideHighlighted ? "Hold still — mesh unlocking..." : "Move closer and fit your face inside the outline"}
            </p>
          </div>
        )}
        {!isCameraOn && (
          <div className="stage-overlay">
            <span className="stage-badge">Camera paused</span>
          </div>
        )}
      </div>

      <div className="face-mesh-footer">
        <button
          className="toggle-button"
          disabled={!isReady}
          onClick={() => {
            void toggleCamera();
          }}
          type="button"
        >
          {isCameraOn ? "Disable camera" : "Enable camera"}
        </button>
        <div className="capture-controls">
          <button
            className="capture-button"
            disabled={!isReady || !isCameraOn}
            onClick={() => {
              void captureScreenshot(false);
            }}
            type="button"
          >
            Capture snapshot
          </button>
          <button
            className="upload-button"
            disabled={!capturedImageUrl || isUploading}
            onClick={() => {
              void sendSnapshotToBackend();
            }}
            type="button"
          >
            {isUploading ? "Sending..." : "Send to backend"}
          </button>
          <button
            className="download-button"
            disabled={!capturedImageRef.current}
            onClick={() => {
              if (capturedImageRef.current) {
                downloadImage(
                  capturedImageRef.current.dataUrl,
                  capturedImageRef.current.filename
                );
                setUploadStatus(`Downloaded "${capturedImageRef.current.filename}" to your device.`);
              }
            }}
            type="button"
            style={{
              marginLeft: '8px',
              opacity: capturedImageRef.current ? 1 : 0.5
            }}
          >
            Download image
          </button>
        </div>
        {capturedImageUrl && (
          <div className="capture-preview">
            <img alt="Captured face snapshot" src={capturedImageUrl} />
            <span>This preview uses the same PNG we will send via FormData.</span>
          </div>
        )}
        <div className="status">
          {errorMessage ? <span className="status-error">{errorMessage}</span> : <span>{statusMessage}</span>}
        </div>
        {uploadStatus && (
          <div className="status">
            <span>{uploadStatus}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default FaceMeshView;
