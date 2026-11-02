/**
 * Browser-only vocal separation. Audio never leaves the user's device.
 *
 * The model architecture and library code are MIT; review the exact pretrained
 * weight license before enabling this publicly.
 *
 * OfflineAudioContext is used by the library to decode compressed audio.
 * It is not generally available in a Web Worker; keep orchestration on
 * the page and do not advertise background-thread execution.
 */
export type BrowserStems = { vocals: string; instrumental: string };

export async function separateBrowserAudio(
  file: File,
  onProgress?: (message: string) => void,
): Promise<BrowserStems> {
  if (typeof window === "undefined") throw new Error("Browser required");
  if (typeof OfflineAudioContext === "undefined") {
    throw new Error("This browser cannot decode audio locally. Try an updated Chrome or Edge browser.");
  }
  const { createSeparator } = await import("web-audio-separation");
  const separator = createSeparator("UVR_MDXNET_KARA_2", {
    common: {
      logLevel: "error",
      onProgress: (progress) => onProgress?.(
        progress.stage === "loading-model" ? "Loading AI model…" :
        progress.stage === "demixing" ? `Separating audio… ${Math.round(progress.fraction * 100)}%` :
        "Preparing your download…"
      ),
    },
    mdx: { executionProviders: ["webgpu", "wasm"], batchSize: 1 },
  });

  const sourceUrl = URL.createObjectURL(file);
  try {
    onProgress?.("Downloading AI model (first run only)…");
    await separator.loadModel();
    const result = await separator.separate(sourceUrl);
    // The karaoke model has instrumental as PRIMARY. The library emits
    // SECONDARY first (vocals), then PRIMARY (instrumental).
    if (result.length !== 2) throw new Error("AI separation returned incomplete stems");
    return { vocals: result[0], instrumental: result[1] };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
