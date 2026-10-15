# liverpool-street-backend — ARCHIVED Nov-2025 PerfectCorp / face-mesh prototype

- What survives is two guides: `BROWSER_CAMERA_IMPLEMENTATION_GUIDE.md` and
  `FACEMESH_VISUALIZATION_IMPLEMENTATION.md` (the camera capture and mesh preview in the skin sites
  were ported from here).
- SECRETS: `backend/perfectcorp_config.txt` and `backend/r2_config.txt` are committed WITH values, and
  `backend/main.py` hardcodes a presigned S3 URL. Do not run, copy or extend this backend; treat those
  keys as exposed (rotate if still valid). Never print them.
- `skin-front/` is the only runnable app (`cd skin-front && pnpm install && pnpm run dev`, :3000); the
  root `app/` is a byte-identical copy without a package.json. The CI workflow runs the server script
  instead of tests.
- Workspace map: `../CLAUDE.md`.
