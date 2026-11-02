# Browser-only Rangmanch Music Studio (preview)

All three modes run locally in the browser. The existing production FastAPI + PostgreSQL music worker remains unchanged and is **not** used by this page.

- **Create Karaoke:** UVR MDX browser model separates the uploaded file into vocals and instrumental; user previews/downloads the instrumental WAV without uploading the source.
- **One Recording / vocals + guitar or keyboard:** browser separation, then browser mixing/peak-normalization.
- **One Recording / vocals only or instrumental only:** browser processing, no model required.
- **Two separate tracks:** browser mixing/peak-normalization, no model required.

Browser music mixing uses `OfflineAudioContext`, basic vocal high-pass/clarity/warmth EQ, dynamics compression, adjustable wet reverb/delay, instrumental balance, and 16-bit 44.1 kHz WAV export. **It is an MVP port and does not match the existing Python DSP exactly.** Specifically, EBU R128 two-pass LUFS normalization, true-peak limiting, stereo width, de-essing, noise reduction, and MP3 export are not yet implemented in the browser. Do not claim that their controls are effective until implemented.

AI separation remains disabled by default. For **local and Vercel preview builds only**, set `NEXT_PUBLIC_BROWSER_SEPARATION_ENABLED=true` and restart/redeploy. The browser library decodes MP3 via `OfflineAudioContext` on the page, not in a dedicated Web Worker. Browser support, performance, and low-memory devices must be checked.

## Model and licenses
- Separation library: [incidentist/web-audio-separation](https://github.com/incidentist/web-audio-separation), MIT.
- Runtime: [ONNX Runtime Web](https://github.com/microsoft/onnxruntime), MIT.
- Model: `UVR_MDXNET_KARA_2.onnx`, from [Ultimate Vocal Remover](https://github.com/Anjok07/ultimatevocalremovergui) ecosystem, hosted at [AI4future/RVC](https://huggingface.co/AI4future/RVC/blob/main/UVR_MDXNET_KARA_2.onnx). Check the exact weight license and give UVR contributor credit before public rollout.
- These software licenses do not grant users rights to reproduce or publicly perform commercial songs.

## Release gate
1. `cd apps/web && npm ci && npm run build` on the latest feature branch.
2. Test locally on Mac with the browser flag enabled; ensure **no request to /api/music-studio/jobs** occurs in any mode.
3. Test a permitted short mixed track and download its instrumental WAV.
4. Test Two Tracks and vocals-only/instrument-only mixes, and compare with the old server's masters. Check balance, clipping and export.
5. Test iPhone Safari and Android Chrome: model download, browser memory, and output quality. Fail gracefully on unsupported browsers.
6. Decide whether to ship the basic WAV MVP, or finish LUFS mastering, de-essing, noise reduction, stereo width and MP3 output first. Current UI still exposes some advanced controls that the browser engine does not implement.
7. Merge PR only after completing the release gate. Do not enable a new AWS worker or migrate DB for the browser-only path.
