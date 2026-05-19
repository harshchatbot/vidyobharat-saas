'use client';

import React, { useState, useRef } from 'react';
import { StoryboardProject } from '../hooks/useStoryboardProject';
import { useStoryboardProject } from '../hooks/useStoryboardProject';
import { getVoicesForLanguage, PREVIEW_TEXT_BY_LANGUAGE, resolveStoryboardVoiceLanguage, STORYBOARD_ENABLED_LANGUAGES } from '../config/voiceRegistry';

interface VoiceSelectorProps {
  project: StoryboardProject;
  onSelect: () => void;
  onBackToScript?: () => void;
}

export function getVoicePreviewText(script: string): string {
  const normalized = String(script || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const sentenceChunks = normalized
    .split(/(?<=[.!?।])\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (sentenceChunks.length === 0) {
    return normalized.slice(0, 140).trim();
  }

  const selected: string[] = [];
  let currentLength = 0;
  for (const sentence of sentenceChunks) {
    if (selected.length >= 2) break;
    const tentative = currentLength + (selected.length > 0 ? 1 : 0) + sentence.length;
    if (selected.length > 0 && tentative > 160) break;
    selected.push(sentence);
    currentLength = tentative;
    if (currentLength >= 120) break;
  }

  const joined = selected.join(' ').trim();
  if (joined.length >= 80) return joined.slice(0, 160).trim();

  return normalized.slice(0, 140).trim();
}

export default function VoiceSelector({ project, onSelect, onBackToScript }: VoiceSelectorProps) {
  const { generateVoicePreview, selectVoice, startProduction, saveProductionSettings, getProductionEstimate, loading } = useStoryboardProject();
  const normalizeStoryboardKlingModel = (raw?: string | null): string => {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'kling_4k' || value === 'kling_premium') return 'kling_4k';
    if (value === 'kling_standard') return 'kling_standard';
    return 'kling_standard';
  };
  const [selectedVoice, setSelectedVoice] = useState(project.selected_tts_provider_voice_name || project.selected_voice || 'Kore');
  const [selectedLanguage, setSelectedLanguage] = useState(
    project.selected_tts_provider_language_code || resolveStoryboardVoiceLanguage(project.language || 'en'),
  );
  const [selectedModelKey, setSelectedModelKey] = useState(normalizeStoryboardKlingModel(project.selected_video_model_key));
  const [selectedDurationSeconds, setSelectedDurationSeconds] = useState<number>(Number(project.target_ad_duration_seconds || project.selected_ad_duration_seconds || 15));
  const [estimate, setEstimate] = useState<any>(project.production_credit_estimate || null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [productionBlockingError, setProductionBlockingError] = useState<string | null>(null);
  const [showAllVoices, setShowAllVoices] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [previewAudio, setPreviewAudio] = useState<string | null>(null);
  const [previewCache, setPreviewCache] = useState<Record<string, { audioUrl: string; cached: boolean; isStatic: boolean }>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewInfo, setPreviewInfo] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const voices = getVoicesForLanguage(selectedLanguage);
  const visibleVoices = showAllVoices ? voices : voices.slice(0, 6);
  const fullScript = project.tts_script || project.display_script || '';
  const fallbackPreviewText = PREVIEW_TEXT_BY_LANGUAGE[selectedLanguage] || PREVIEW_TEXT_BY_LANGUAGE['English (India)'];
  const previewText = selectedLanguage.toLowerCase().includes('english')
    ? (getVoicePreviewText(fullScript) || fallbackPreviewText)
    : fallbackPreviewText;
  const scriptLooksEnglish = /^[\x00-\x7F\s.,!?'"():;-]*$/.test(String(fullScript || ''));
  const nonEnglishSelected = !selectedLanguage.toLowerCase().includes('english');
  const creativeTargetDuration = Number(project.target_ad_duration_seconds || selectedDurationSeconds || 15);
  const scriptEstimatedDuration = Number(project.script_estimated_duration_seconds || 0);
  const productionDurationMismatch = scriptEstimatedDuration > 0
    && Math.abs(scriptEstimatedDuration - creativeTargetDuration) > Math.ceil(creativeTargetDuration * 0.2);

  const qualityCards = [
    { key: 'kling_standard', label: 'Standard', model: 'Kling', description: 'High-quality UGC video generation for realistic avatar/product ads.', badge: 'Recommended' },
    { key: 'kling_4k', label: 'Premium', model: 'Kling', description: 'Best-quality Kling generation for client-ready ad outputs.', badge: 'Highest quality' },
  ];
  const qualityCardByKey = new Map(qualityCards.map((card) => [card.key, card]));
  const selectedQualityCard = qualityCardByKey.get(selectedModelKey);
  const validModelKeys = new Set(qualityCards.map((card) => card.key));
  const modelIsValid = validModelKeys.has(selectedModelKey);
  const durationIsValid = [10, 15, 20, 30].includes(Number(selectedDurationSeconds));

  const refreshEstimate = async (modelKey: string, duration: number) => {
    setEstimateLoading(true);
    setEstimateError(null);
    try {
      const response = await getProductionEstimate(project.id, normalizeStoryboardKlingModel(modelKey), duration);
      setEstimate(response?.estimate || null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update estimate';
      setEstimateError(message);
      setEstimate(null);
    } finally {
      setEstimateLoading(false);
    }
  };

  const buildPreviewKey = (voice: string, language: string, text: string) =>
    `${voice}::${language}::${text}`;

  const replayAudio = async (audioUrl: string) => {
    setPreviewAudio(audioUrl);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        void audioRef.current.play();
      }
    }, 60);
  };

  const handleGeneratePreview = async (voice: string) => {
    console.log('storyboard_voice_preview_clicked', { projectId: project.id, voice, language: selectedLanguage });
    const previewKey = buildPreviewKey(voice, selectedLanguage, previewText);
    const cachedLocal = previewCache[previewKey];
    if (cachedLocal?.audioUrl) {
      setPreviewingVoice(voice);
      setPreviewError(null);
      setPreviewInfo(cachedLocal.isStatic ? 'Free sample' : (cachedLocal.cached ? 'Cached preview — no credits used' : '▶ Play again · Free'));
      await replayAudio(cachedLocal.audioUrl);
      return;
    }
    setPreviewingVoice(voice);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewInfo(null);
    try {
      const result = await generateVoicePreview(
        project.id,
        voice,
        selectedLanguage,
        previewText,
        `Short voice preview only. Natural delivery for ${selectedLanguage}.`,
      );
      if (result?.audio_url) {
        setPreviewAudio(result.audio_url);
        setPreviewCache((prev) => ({
          ...prev,
          [previewKey]: {
            audioUrl: result.audio_url,
            cached: Boolean(result?.cached),
            isStatic: Boolean(result?.is_static_sample),
          },
        }));
        if (result?.cached) {
          console.log('storyboard_voice_preview_cached', { projectId: project.id, voice, language: selectedLanguage });
          setPreviewInfo('▶ Cached preview · Free');
        } else if (result?.is_static_sample) {
          setPreviewInfo('▶ Free sample');
        } else {
          console.log('storyboard_voice_preview_credits_used', { projectId: project.id, credits: result?.credits_deducted || 1 });
          setPreviewInfo(`${result?.credits_deducted ?? 1} credit used for preview`);
        }
        await replayAudio(result.audio_url);
      } else {
        setPreviewError('Preview is currently unavailable. Please continue to full production voiceover.');
      }
    } catch (err) {
      console.error('Error generating preview:', err);
      const message = err instanceof Error ? err.message : 'Preview failed';
      console.error('storyboard_voice_preview_error', { projectId: project.id, error: message });
      if (message.includes('insufficient_credits') || message.includes('402')) {
        setPreviewError('Insufficient credits for preview. Add credits to generate voice preview.');
      } else if (message.toLowerCase().includes('provider failed because fal balance is exhausted')) {
        setPreviewError('Voice preview provider failed because Fal balance is exhausted. Please check provider billing.');
      } else {
        setPreviewError('Preview is currently unavailable. Please continue to full production voiceover.');
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSelectVoice = async (voice: string) => {
    setSelectedVoice(voice);
  };

  const handleConfirm = async () => {
    if (selectedVoice) {
      try {
        setProductionBlockingError(null);
        await saveProductionSettings(project.id, {
          selected_video_model_key: normalizeStoryboardKlingModel(selectedModelKey),
          selected_ad_duration_seconds: selectedDurationSeconds,
        });
        await selectVoice(project.id, selectedVoice, selectedLanguage);
        await startProduction(project.id);
        onSelect();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start production.';
        setProductionBlockingError(message);
      }
    }
  };

  React.useEffect(() => {
    void refreshEstimate(selectedModelKey, selectedDurationSeconds);
  }, [selectedModelKey, selectedDurationSeconds]);

  React.useEffect(() => {
    const normalized = normalizeStoryboardKlingModel(selectedModelKey);
    if (normalized !== selectedModelKey) {
      setSelectedModelKey(normalized);
    }
  }, [selectedModelKey]);

  const estimateVideoCredits = Number(estimate?.estimated_video_credits ?? 0);
  const estimateTtsCredits = Number(estimate?.estimated_tts_credits ?? 0);
  const estimateLipsyncCredits = Number(estimate?.estimated_lipsync_credits ?? 0);
  const estimateStitchCredits = Number(estimate?.estimated_stitching_credits ?? 0);
  const estimateQcCredits = Number(estimate?.estimated_qc_credits ?? 0);
  const estimateTotalCredits = Number(estimate?.estimated_total_credits ?? 0);
  const estimateSceneCount = Number(estimate?.scene_count ?? project.scene_count ?? 0);
  const currentBalance = Number(estimate?.available_credits ?? 0);
  const balanceAfterProduction = Number(estimate?.balance_after_estimate ?? (currentBalance - estimateTotalCredits));
  const premiumBlocked = selectedModelKey === 'kling_4k' && (
    (estimateError || '').toLowerCase().includes('disabled') ||
    (estimateError || '').toLowerCase().includes('4k')
  );
  const estimateBlockingError = Boolean(estimateError && !estimate);
  const insufficientBalance = estimate && currentBalance > 0 && estimateTotalCredits > currentBalance;
  const confirmDisabled = (
    !selectedVoice ||
    loading ||
    !modelIsValid ||
    !durationIsValid ||
    premiumBlocked ||
    estimateBlockingError ||
    !estimate ||
    insufficientBalance ||
    productionDurationMismatch
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Voice Selection</h2>
        <p className="text-gray-600">Choose the voice for your ad narration</p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-8 mb-6">
        {/* Language Info */}
        <div className="mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex justify-between items-center">
            <div>
              <p className="text-sm text-blue-900 font-medium">Selected Language</p>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="mt-1 rounded border border-blue-300 px-2 py-1 text-sm text-blue-900"
              >
                {STORYBOARD_ENABLED_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>
            <div className="text-2xl">🗣️</div>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Choose Video Quality & Duration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {qualityCards.map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={() => setSelectedModelKey(card.key)}
                className={`rounded-lg border p-3 text-left ${selectedModelKey === card.key ? 'border-green-600 bg-green-50' : 'border-gray-200'}`}
              >
                <div className="font-semibold">{card.label} • {card.model}</div>
                <div className="text-xs text-gray-600">{card.description}</div>
                <div className="text-xs mt-1 text-indigo-700">{card.badge}</div>
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            {[10, 15, 20, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  if (d !== creativeTargetDuration) {
                    setProductionBlockingError('Changing duration affects the approved script, scene plan, storyboard, and motion plan. To change duration, regenerate from Script stage.');
                    return;
                  }
                  setSelectedDurationSeconds(d);
                }}
                className={`rounded border px-3 py-1 text-sm ${selectedDurationSeconds === d ? 'border-green-600 bg-green-50' : 'border-gray-300'}`}
              >
                {d}s
              </button>
            ))}
          </div>
          <div className="mt-2 text-xs text-gray-600">
            Target creative duration is locked at {creativeTargetDuration}s at this stage.
          </div>
          {selectedModelKey === 'kling_4k' ? (
            <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Premium 4K uses significantly more credits. Use it for final client-ready exports.
            </div>
          ) : null}
        </div>

        {/* Voice Grid */}
        <div className="mb-6 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Available Voices</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleVoices.map(voice => (
              <div
                key={voice}
                className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                  selectedVoice === voice
                    ? 'border-green-600 bg-green-50'
                    : 'border-gray-200 bg-white hover:border-indigo-300'
                }`}
                onClick={() => handleSelectVoice(voice)}
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-900">{voice}</h4>
                  {selectedVoice === voice && (
                    <span className="text-green-600 text-xl">✓</span>
                  )}
                </div>

                <p className="text-sm text-gray-600 mb-4">
                  Click to select, then preview
                </p>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleGeneratePreview(voice);
                  }}
                  disabled={!previewText || (previewLoading && previewingVoice === voice) || (currentBalance > 0 && currentBalance < 1 && !previewCache[buildPreviewKey(voice, selectedLanguage, previewText)])}
                  className="w-full px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-sm hover:bg-indigo-100 disabled:opacity-50 font-medium"
                >
                  {!previewText
                    ? '🎧 Preview unavailable'
                    : previewLoading && previewingVoice === voice
                    ? '🎵 Generating...'
                    : previewCache[buildPreviewKey(voice, selectedLanguage, previewText)]?.isStatic
                    ? '▶ Free sample'
                    : previewCache[buildPreviewKey(voice, selectedLanguage, previewText)]
                    ? '▶ Play again · Free'
                    : '🎧 Generate preview · 1 credit'}
                </button>

                {previewingVoice === voice && previewAudio && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="text-xs text-gray-500 mb-2">{previewPlaying ? 'Preview playing...' : 'Preview ready'}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-3 text-xs text-indigo-700 underline"
            onClick={() => setShowAllVoices((v) => !v)}
          >
            {showAllVoices ? 'Show recommended voices' : 'Show all voices'}
          </button>
        </div>

        {/* Hidden Audio Player */}
        {previewAudio && (
          <audio
            ref={audioRef}
            src={previewAudio}
            className="hidden"
            onPlay={() => setPreviewPlaying(true)}
            onPause={() => setPreviewPlaying(false)}
            onEnded={() => setPreviewPlaying(false)}
          />
        )}
        {previewError ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {previewError}
          </div>
        ) : null}
        {previewInfo ? (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {previewInfo}
          </div>
        ) : null}

        {/* Script Preview with Voice */}
        {selectedVoice && (
          <div className="mb-6 pt-6 border-t border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Preview sample (with {selectedVoice})</h3>
            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
              <p className="text-gray-900 leading-relaxed whitespace-pre-wrap text-sm">
                {previewText || 'Script not available'}
              </p>
            </div>
            <div className="mt-3 text-xs text-gray-500">
              Full voiceover uses the complete approved script during production.
            </div>
          </div>
        )}

        {/* Credit Info */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-orange-900">
            <strong>⚡ Note:</strong> Preview costs 1 credit when generating a new sample. Replaying cached previews is free.
          </p>
        </div>
        {nonEnglishSelected && scriptLooksEnglish ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-sm text-amber-900">
            Voice language should match your script language for best results. Translation support can be added later.
          </div>
        ) : null}
        {productionDurationMismatch ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-800">
            Duration mismatch: approved script is estimated at {scriptEstimatedDuration}s but target duration is {creativeTargetDuration}s.
            Regenerate from Script stage before starting production.
          </div>
        ) : null}
        {productionBlockingError ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-800">
            {productionBlockingError}
            {onBackToScript ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={onBackToScript}
                  className="rounded border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700"
                >
                  Go back to Script
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6">
          <h4 className="font-semibold text-slate-900 mb-2">Estimated production cost</h4>
          <div className="text-sm text-slate-700">
            Video Quality: {selectedQualityCard?.label || 'Unknown'} ({selectedQualityCard?.model || selectedModelKey})
          </div>
          <div className="text-sm text-slate-700">
            Duration: {selectedDurationSeconds}s • Language: {selectedLanguage} • Voice: {selectedVoice || 'Not selected'} • Scene count: {estimateSceneCount || '...'}
          </div>
          <div className="text-xs text-slate-600 mt-1">
            Target creative duration: {creativeTargetDuration}s • Script estimated duration: {scriptEstimatedDuration || '—'}s • Production duration: {selectedDurationSeconds}s
          </div>
          {estimateLoading ? (
            <div className="mt-2 text-sm text-slate-600">Updating estimate...</div>
          ) : null}
          {estimateBlockingError ? (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {estimateError}
            </div>
          ) : null}
          <div className="mt-3 rounded border border-slate-200 bg-white p-3 text-sm text-slate-800">
            <div className="flex items-center justify-between"><span>Scene video generation credits</span><span>{estimateVideoCredits || 0}</span></div>
            <div className="flex items-center justify-between"><span>TTS credits</span><span>{estimateTtsCredits || 0}</span></div>
            <div className="flex items-center justify-between"><span>Lipsync credits</span><span>{estimateLipsyncCredits || 0}</span></div>
            <div className="flex items-center justify-between"><span>Stitching credits</span><span>{estimateStitchCredits || 0}</span></div>
            <div className="flex items-center justify-between"><span>QC/scoring credits</span><span>{estimateQcCredits || 0}</span></div>
            <div className="mt-2 border-t pt-2 flex items-center justify-between font-semibold text-slate-900">
              <span>Total estimated credits</span><span>{estimateTotalCredits || 0}</span>
            </div>
          </div>
          <div className="mt-3 rounded border border-slate-200 bg-white p-3 text-sm text-slate-800">
            <div className="flex items-center justify-between"><span>Current balance</span><span>{currentBalance || 0}</span></div>
            <div className="flex items-center justify-between"><span>Estimated cost</span><span>{estimateTotalCredits || 0}</span></div>
            <div className={`flex items-center justify-between font-medium ${insufficientBalance ? 'text-red-700' : 'text-slate-900'}`}>
              <span>Balance after production</span><span>{balanceAfterProduction}</span>
            </div>
          </div>
          {selectedModelKey === 'kling_4k' ? (
            <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Premium 4K uses significantly more credits. Use it for final client-ready exports.
            </div>
          ) : null}
          {Array.isArray(estimate?.warnings) && estimate.warnings.length > 0 ? (
            <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {estimate.warnings.join(' ')}
            </div>
          ) : null}
          {premiumBlocked ? (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              Premium 4K generation is currently disabled.
            </div>
          ) : null}
          {insufficientBalance ? (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              Insufficient balance for this production estimate.
            </div>
          ) : null}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-6 border-t border-gray-200">
          <button
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all"
          >
            {loading ? 'Processing...' : '✓ Confirm & Start Production'}
          </button>
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>💡 Tip:</strong> Preview different voices to find the best match for your brand. You can listen to voice samples before final selection.
        </p>
      </div>
    </div>
  );
}
