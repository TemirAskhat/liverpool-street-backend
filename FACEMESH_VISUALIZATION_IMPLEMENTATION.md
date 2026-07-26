# Face Mesh Visualization — Live Camera Implementation Guide

This file describes how the current facemesh visualization is implemented in this repo, with enough detail to port it into another project.

Primary implementation file:
- `app/components/FaceMeshView.tsx`
- `app/globals.css` (overlay + stage styling)
- `app/components/LiveMeshSection.tsx` (wires status into the right-side panel)

If you have a parallel `skin-front` app in the repo, the same component exists there with equivalent logic.

## 1) Big picture

The UI runs on a browser-only React client component.  
The app:
1. Loads MediaPipe `@mediapipe/tasks-vision` from CDN at runtime.
2. Initializes a `FaceLandmarker` with `runningMode: "VIDEO"`.
3. Opens webcam stream (`getUserMedia`), draws video frames to a `<video>` element and overlays an animated canvas (`<canvas>`).
4. Runs `detectForVideo(video, timestamp)` each animation frame.
5. Uses returned landmarks to:
   - gate visual activation (face alignment/close checks),
   - draw animated tessellation for the full mesh,
   - draw feature-specific connectors (eyes, brows, lips, face oval, irises) with fixed colors.

## 2) Key runtime pieces

### 2.1 Dynamic module loading + cache

`loadFaceLandmarkerModule()` does a browser-only dynamic import:
- CDN module URL is `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${CDN_VERSION}`
- Caches module instance on `window.__mediapipe_face_landmarker__`
- avoids re-fetch/re-init on re-renders.

### 2.2 React lifecycle state that controls UX

Important state (`useState`):
- `isReady`: model loaded and usable.
- `isCameraOn`: whether stream + render loop is active.
- `hasAnimationStarted`: whether face alignment threshold has unlocked the mesh animation.
- `statusMessage` / `errorMessage`: user feedback.
- `capturedImageUrl`, `uploadStatus`, `isUploading`: snapshot/upload workflow.

Important mutable refs (`useRef`) keep frame-time values:
- `videoRef`, `canvasRef`, `captureCanvasRef`
- `requestIdRef`, `processingPromiseRef`
- `bundleRef` (module + landmarker instance)
- `streamRef`, `isCameraOnRef`
- landmark continuity refs for robust handling (`lastLandmarksRef`, miss/disengage counters, etc.)

The component is marked `"use client"` because all APIs are browser-only.

## 3) MediaPipe setup and detection loop

`useEffect` on mount:
1. `loadFaceLandmarkerModule()`
2. `FilesetResolver.forVisionTasks(".../wasm")`
3. `FaceLandmarker.createFromOptions(...)`:
   - `baseOptions.modelAssetPath`: Google-hosted float16 task model
   - `delegate: "GPU"`
   - `numFaces: 1`
   - `runningMode: "VIDEO"`
   - `outputFaceBlendshapes: false`
4. store `{ module, landmarker }` in `bundleRef`
5. cleanup: stop camera + `landmarker.close()`.

### 3.1 Render loop

`renderLoop` is `requestAnimationFrame` driven:
- guard that video/canvas/landmarker are all available.
- wait until video metadata is ready.
- sync canvas to `video.videoWidth / video.videoHeight`.
- call `detectForVideo(video, performance.now())`.
- update face state + auto/counter logic (below).
- clear canvas and render overlay only when `hasAnimationStarted`.

Frame loop is canceled on unmount or when camera stops.

## 4) Landmark normalization and animated tessellation

### 4.1 Helpers

- `normalizeConnectorList(connectors)`: accepts various shapes of connector definitions and normalizes to `[startIndex, endIndex][]`.
- `evaluateAlignment(landmarks)`:
  - computes min/max x/y of all points,
  - derives width/height + center,
  - returns:
    - `isClose`: face is large enough (near camera),
    - `isAligned`: face centered in frame within tolerance.
- `getAnimatedColor(x, y, elapsedSeconds)`: generates time-varying HSL based on landmark midpoint + time, producing a moving neon gradient look.

### 4.2 Draw functions

- `drawAnimatedTessellation(...)`:
  - iterates normalized tessellation connectors,
  - converts normalized landmark coordinates to pixel coords (`x * canvas.width`, `y * canvas.height`),
  - computes animated color per edge,
  - computes wave-modulated line width,
  - draws all edges to the canvas with rounded caps/join.

Then feature connectors are drawn with MediaPipe `DrawingUtils.drawConnectors(...)`:
- `FACE_LANDMARKS_RIGHT_EYE` / left eye (`#f472b6`, `#34d399`)
- brows, lips, face oval, irises.

## 5) Unlock logic (the “wow” effect trigger)

The animation is intentionally gated until alignment conditions are satisfied.

State machine behavior:
- Initial state: no animation.
- If `isClose` becomes true for enough consecutive frames (or face is fully aligned), `hasAnimationStarted` flips true.
- Once active:
  - overlay prompt disappears.
  - mesh is drawn continuously.
  - if the face drifts away beyond threshold for too long, it auto-resets with a guide message.

This prevents flickery overlays and avoids showing an unstable mesh on partial detections.

## 6) Capturing snapshots

`captureScreenshot()`:
- creates/uses `captureCanvasRef`,
- mirrors the current frame (`scale(-1,1)` to match mirrored video),
- converts to PNG `Blob`,
- stores metadata in `SavedImage`,
- stores local preview and optional local metadata in `localStorage`,
- optionally calls `uploadToBackend()` (auto capture path) or manual `sendSnapshotToBackend()`.

`sendSnapshotToBackend` sends via project API service as `FormData` with key `image`.

## 7) Styling side

`app/globals.css`:
- `.face-mesh-stage`, `.stage-video`, `.stage-canvas`: mirror the video/canvas with `scaleX(-1)`.
- `.alignment-overlay`: SVG oval guide + guide text.
- `.alignment-ready`: visual state while close/aligned.
- `.face-mesh-footer`: controls and status lines.

The draw effect itself is canvas-first; CSS provides visual framing and UX messaging.

## 8) Porting plan for another project

If you’re reusing this in another app, move these units first:
- Live media setup (`startCamera`, `stopCamera`, `renderLoop`)
- Landmark extraction + state gating (`evaluateAlignment`, miss/disengage counters)
- Render layer (`drawAnimatedTessellation`, `DrawingUtils` feature draws)
- Capture utility

### 8.1 For attached image input (static mode)

You currently have a live-video path only. To add an image upload path cleanly:
1. Add file input and decode selected image into an `HTMLImageElement`.
2. Create/ensure `FaceLandmarker` in `runningMode: "IMAGE"` (or instantiate a second landmarker configured for image).
3. Call `detectForImage(imageElement)` and reuse returned landmarks.
4. Use the same `drawAnimatedTessellation(...)` + `DrawingUtils.drawConnectors(...)` on a static canvas.
5. Skip `requestAnimationFrame` for this path; render once per image, plus optional re-render for toggles/settings.
6. Reuse alignment threshold logic as a pre-pass to decide whether to show a "try a closer image" hint.

## 9) Known caveats

- External model URLs and WASM assets are loaded from public CDNs.
- `console.error` is temporarily silenced only around model inference to prevent noisy internal logs.
- `align` thresholds are tuned for this specific camera/card layout and may need recalibration on other UIs.
- No native static image route exists yet in this component, so added support requires a small new control flow branch.
