# Rangmanch browser karaoke separation (opt-in preview)

## What is wired up

- **Create Karaoke:** client-side source separation, WAV preview and download, no audio upload to our API.
- **One Recording / mixed:** client-side source separation, then upload WAV stems to the existing server-side mix/master worker.
- **One Recording / vocals-only or instrumental-only:** upload single file to existing lightweight job worker (requires deploying backend PR changes).
- **Two Separate Tracks:** unchanged existing processing pipeline.
- Browser separation is disabled unless `NEXT_PUBLIC_BROWSER_SEPARATION_ENABLED=true` is set at **build** time.
- The server-side separation feature is independently disabled unless `MUSIC_STUDIO_SEPARATION_ENABLED=true`. Keep that **false** for the existing 2 GiB EC2; the public browser workflow does not need the Demucs worker.

## License and attribution

- Browser JavaScript library: [incidentist/web-audio-separation](https://github.com/incidentist/web-audio-separation), MIT.
- ONNX inference: [Microsoft ONNX Runtime Web](https://github.com/microsoft/onnxruntime), MIT.
- Model: `UVR_MDXNET_KARA_2.onnx`; upstream model release: [TRvlvr/model_repo](https://github.com/TRvlvr/model_repo/releases/tag/all_public_uvr_models); hosted at [AI4future/RVC](https://huggingface.co/AI4future/RVC/blob/main/UVR_MDXNET_KARA_2.onnx), repository marked MIT.
- Model developers/project credit: [Ultimate Vocal Remover](https://github.com/Anjok07/ultimatevocalremovergui). UVR's README specifically asks third-party application authors to honor MIT and credit UVR developers.
- Weight provenance and license review: [musetric's UVR Kara2 lineage document](https://huggingface.co/musetric/uvr-mdxnet-kara2-onnx). Keep this attribution available in the production site before public rollout.

Model/license review is distinct from rights to user-uploaded commercial songs or to publicly perform derivative karaoke recordings.

## Before merging PR

1. From the project repository root: `cd apps/web && npm install && npm run build` (this also refreshes `apps/web/package-lock.json`; commit the updated lockfile).
2. Test the feature flag on a **preview deployment**, not production: `NEXT_PUBLIC_BROWSER_SEPARATION_ENABLED=true`.
3. Use a permitted short fully mixed recording, check browser model download, separation progress, local preview and WAV download.
4. Verify Chrome Android, Safari iOS, and Mac browsers. First run downloads roughly a 53 MB model. Browser performance and memory are not guaranteed.
5. Test the mixed One Recording case and check that each resulting WAV file is within the server's 25 MB/file cap.
6. Keep the production env flag false until those tests pass.
7. Do not activate the optional Demucs CPU worker on the current EC2. Browser separation requires no new GPU worker.

## Known limitations

- This browser library decodes with `OfflineAudioContext`, which is not supported consistently inside Web Workers. The preview uses main-thread orchestration, so UI responsiveness on slow devices needs assessment.
- Download is WAV; browser MP3 export and karaoke pitch/tempo are not implemented.
- The Karaoke 2 model removes lead vocals and may preserve some backing vocals. Audio artifacts are expected.
- No server usage fees for karaoke inference, but initial model downloads consume bandwidth from the model host.
