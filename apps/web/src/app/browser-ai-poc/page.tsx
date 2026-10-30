
'use client';

import { useState } from 'react';
import {
  loadModel as loadBrowserModel,
  generateCommandsWithDiagnostics,
  isModelReady,
  BrowserAiValidationError,
} from '@/lib/browser-ai/webllmService';

const MODEL_ID = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

const DEFAULT_INSTRUCTION =
  'Set all images to 4 seconds each. Add the title "Welcome to RangManch" at the beginning, centered on screen, with a 1-second fade-in animation.';

type POCState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'running'
  | 'done'
  | 'error';

export default function BrowserAiPocPage() {
  const [state, setState] = useState<POCState>(
    isModelReady() ? 'ready' : 'idle'
  );

  const [status, setStatus] = useState(
    isModelReady()
      ? 'Model ready in this browser'
      : 'WebGPU has not been checked.'
  );

  const [progress, setProgress] = useState(0);
  const [modelTime, setModelTime] = useState<number | null>(null);
  const [inferenceTime, setInferenceTime] = useState<number | null>(null);
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [rawJson, setRawJson] = useState('');
  const [normalizedJson, setNormalizedJson] = useState('');

  const modelReady =
    state === 'ready' ||
    state === 'running' ||
    state === 'done' ||
    (state === 'error' && isModelReady());

  async function loadModel() {
    if (state === 'loading' || state === 'running') return;

    setError('');
    setOutput('');
    setRawJson('');
    setNormalizedJson('');
    setState('loading');
    setProgress(0);

    const started = performance.now();

    try {
      await loadBrowserModel((value, message) => {
        setProgress(value);
        setStatus(message);
      });

      setModelTime(performance.now() - started);
      setProgress(100);
      setStatus('Model ready in this browser');
      setState('ready');
    } catch (cause) {
      setState('error');
      setStatus('Model initialization failed');

      setError(
        cause instanceof Error
          ? cause.message
          : 'The model could not be initialized.'
      );
    }
  }

  async function runInstruction() {
    if (
      !modelReady ||
      !instruction.trim() ||
      state === 'running'
    ) {
      return;
    }

    setState('running');
    setError('');
    setOutput('');
    setRawJson('');
    setNormalizedJson('');
    setInferenceTime(null);

    const started = performance.now();

    try {
      const result = await generateCommandsWithDiagnostics(instruction.trim());

      setOutput(JSON.stringify({ commands: result.commands }, null, 2));
      setRawJson(result.rawJson);
      setNormalizedJson(result.normalizedJson);
      setStatus('Commands generated and validated locally');
      setState('done');
    } catch (cause) {
      setState('error');
      setStatus('Command generation failed');

      if (cause instanceof BrowserAiValidationError) {
        setRawJson(cause.rawJson ?? '');
        setNormalizedJson(cause.normalizedJson ?? '');
      }

      setError(
        cause instanceof Error
          ? cause.message
          : 'Local inference failed.'
      );
    } finally {
      setInferenceTime(performance.now() - started);
    }
  }

  return (
    <main className="min-h-screen bg-[#0A0A0F] px-5 py-12 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">
              Development proof of concept
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              Browser AI Editor Copilot
            </h1>

            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              A small language model runs locally in your desktop
              browser through WebGPU. Editing instructions are
              processed locally without a paid AI API.
            </p>
          </div>

          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-400">
            WebLLM · local only
          </span>
        </div>

        <section className="grid gap-5 md:grid-cols-[1fr_1.1fr]">
          <div className="rounded-2xl border border-white/10 bg-[#111118] p-5 shadow-2xl shadow-black/20">
            <h2 className="text-sm font-semibold text-white">
              1. Load the model
            </h2>

            <p className="mt-2 text-xs leading-5 text-slate-400">
              Model:{' '}
              <span className="font-mono text-slate-300">
                {MODEL_ID}
              </span>
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Approx. 879 MB VRAM footprint; the browser downloads
              model assets on first load.
            </p>

            <button
              type="button"
              onClick={loadModel}
              disabled={
                state === 'loading' ||
                state === 'running' ||
                modelReady
              }
              className="mt-5 min-h-11 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {modelReady
                ? 'Model loaded'
                : state === 'loading'
                  ? 'Loading model…'
                  : 'Load model'}
            </button>

            {state === 'loading' && (
              <div className="mt-4" aria-live="polite">
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-violet-500 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <p className="mt-2 text-xs text-slate-400">
                  {progress}% · {status}
                </p>
              </div>
            )}

            <div className="mt-6 border-t border-white/10 pt-4 text-xs text-slate-400">
              <p>
                WebGPU:{' '}
                <span className="text-slate-200">
                  {typeof navigator !== 'undefined' &&
                  'gpu' in navigator
                    ? 'available'
                    : 'not detected'}
                </span>
              </p>

              <p className="mt-2">
                Initialization:{' '}
                <span className="text-slate-200">
                  {modelTime == null
                    ? '—'
                    : `${(modelTime / 1000).toFixed(2)}s`}
                </span>
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111118] p-5 shadow-2xl shadow-black/20">
            <h2 className="text-sm font-semibold text-white">
              2. Run a compact edit command
            </h2>

            <label
              htmlFor="editing-instruction"
              className="mt-3 block text-xs font-medium text-slate-400"
            >
              Your editing instruction
            </label>

            <textarea
              id="editing-instruction"
              value={instruction}
              onChange={(event) =>
                setInstruction(event.target.value)
              }
              disabled={state === 'running'}
              rows={5}
              placeholder="Describe the video edits you want..."
              className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-black/20 p-3 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400 disabled:opacity-50"
            />

            <button
              type="button"
              onClick={runInstruction}
              disabled={
                !modelReady ||
                state === 'running' ||
                !instruction.trim()
              }
              className="mt-4 min-h-11 rounded-lg bg-amber-400 px-4 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {state === 'running'
                ? 'Running locally…'
                : 'Generate JSON'}
            </button>

            <p className="mt-3 text-xs text-slate-500">
              Inference:{' '}
              {inferenceTime == null
                ? '—'
                : `${(inferenceTime / 1000).toFixed(2)}s`}
              {' · '}No paid AI API request
            </p>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-xs leading-5 text-red-200"
              >
                {error}
              </p>
            )}
            {process.env.NODE_ENV !== 'production' && rawJson && (
              <details className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-100">
                <summary className="cursor-pointer font-semibold">Raw model JSON (development diagnostic)</summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-slate-300">{rawJson}</pre>
              </details>
            )}
            {process.env.NODE_ENV !== 'production' && normalizedJson && (
              <details className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-3 text-xs text-cyan-100">
                <summary className="cursor-pointer font-semibold">Normalized timing JSON (development diagnostic)</summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-slate-300">{normalizedJson}</pre>
              </details>
            )}
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-white/10 bg-[#111118] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-white">
              Generated commands
            </h2>

            <span className="text-xs text-slate-500">
              {status}
            </span>
          </div>

          <pre className="mt-4 min-h-40 overflow-auto rounded-lg bg-black/30 p-4 font-mono text-xs leading-6 text-emerald-200">
            {output ||
              '// JSON will appear here after local inference'}
          </pre>
        </section>

        <p className="mt-5 text-xs leading-5 text-slate-500">
          This page is isolated from the production editor. AI
          commands are validated before display but are not applied
          to the video timeline. The selected Llama 3.2 model is
          distributed under Meta&apos;s Llama 3.2 Community License;
          review its commercial-use terms before shipping.
        </p>
      </div>
    </main>
  );
}
