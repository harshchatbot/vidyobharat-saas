export type ScriptQualitySeverity = 'info' | 'warning';

export type ScriptQualityFinding = {
  id: string;
  severity: ScriptQualitySeverity;
  title: string;
  detail: string;
};

export type ScriptQualityReport = {
  score: number;
  summary: string;
  findings: ScriptQualityFinding[];
  strengths: string[];
};

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function estimateWordBudget(durationSeconds: number): { min: number; max: number } {
  const duration = Math.max(5, Math.min(durationSeconds || 12, 60));
  return {
    min: Math.max(24, duration * 4),
    max: Math.max(32, duration * 6),
  };
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function evaluateScriptQuality({
  script,
  durationSeconds,
  structuredPreferred,
}: {
  script: string;
  durationSeconds: number;
  structuredPreferred: boolean;
}): ScriptQualityReport {
  const trimmed = script.trim();
  if (!trimmed) {
    return {
      score: 0,
      summary: 'Add a script to evaluate hook strength, pacing, and ending quality.',
      findings: [
        {
          id: 'empty',
          severity: 'warning',
          title: 'Script is empty',
          detail: 'Write a topic or draft first so we can check structure, pacing, and CTA quality.',
        },
      ],
      strengths: [],
    };
  }

  const normalized = trimmed.toLowerCase();
  const findings: ScriptQualityFinding[] = [];
  const strengths: string[] = [];
  let score = 100;
  const budget = estimateWordBudget(durationSeconds);
  const words = wordCount(trimmed);
  const lineCount = trimmed.split('\n').filter((line) => line.trim()).length;

  const hasOpeningShot = /\[opening shot:/i.test(trimmed);
  const hasClosingShot = /\[closing shot:/i.test(trimmed);
  const hasSceneBlocks = /\[scene 1:/i.test(trimmed) && /\[scene 2:/i.test(trimmed);
  const hasVisualCue = /visual cue:/i.test(trimmed);
  const hasCameraCue = /camera cue:/i.test(trimmed);
  const hasMoodCue = /mood cue:/i.test(trimmed);
  const hasOpeningGuidance = includesAny(normalized, [/opening cue:/, /fade-?in/, /gentle/, /smooth/, /settle-?in/, /hook/]);
  const hasEndingGuidance = includesAny(normalized, [/ending cue:/, /ease-?out/, /held final frame/, /hold the final/, /not abrupt/, /no abrupt/, /clean ending/]);
  const hasCta = includesAny(normalized, [/\bfollow\b/, /\bshop\b/, /\bbook\b/, /\bdownload\b/, /\bsubscribe\b/, /\bstart\b/, /\btry\b/, /\blearn more\b/, /\bcta\b/]);

  if (structuredPreferred && (!hasOpeningShot || !hasSceneBlocks || !hasClosingShot)) {
    findings.push({
      id: 'structure',
      severity: 'warning',
      title: 'Scene structure is weak',
      detail: 'Use Opening shot, Scene blocks, and Closing shot so the script is easier to direct and render consistently.',
    });
    score -= 18;
  } else if (hasOpeningShot && hasSceneBlocks && hasClosingShot) {
    strengths.push('Scene structure is clear and production-friendly.');
  }

  if (structuredPreferred && (!hasVisualCue || !hasCameraCue || !hasMoodCue)) {
    findings.push({
      id: 'direction',
      severity: 'warning',
      title: 'Directorial cues are missing',
      detail: 'Add visual, camera, and mood cues so the generator has better scene intent, motion, and tone guidance.',
    });
    score -= 14;
  } else if (hasVisualCue && hasCameraCue) {
    strengths.push('Visual and camera cues are helping the script feel more directable.');
  }

  if (!hasOpeningGuidance) {
    findings.push({
      id: 'opening',
      severity: 'warning',
      title: 'Opening could feel abrupt',
      detail: 'Add a hook line or opening cue that asks for a gentle lead-in, smooth first beat, or non-abrupt start.',
    });
    score -= 12;
  } else {
    strengths.push('Opening guidance is present.');
  }

  if (!hasEndingGuidance) {
    findings.push({
      id: 'ending',
      severity: 'warning',
      title: 'Ending may stop too hard',
      detail: 'Add an ending cue like ease-out, held final frame, or smooth branded close so the outro does not feel chopped.',
    });
    score -= 12;
  } else {
    strengths.push('Ending guidance supports a smoother outro.');
  }

  if (!hasCta) {
    findings.push({
      id: 'cta',
      severity: 'warning',
      title: 'CTA is unclear',
      detail: 'End with one specific next action so the script has a stronger close and clearer conversion intent.',
    });
    score -= 10;
  } else {
    strengths.push('There is a clear CTA signal in the script.');
  }

  if (words < budget.min) {
    findings.push({
      id: 'too-short',
      severity: 'info',
      title: 'Script may be too thin for the target duration',
      detail: `Current draft is about ${words} words. For ${durationSeconds}s, aim roughly for ${budget.min}-${budget.max} words.`,
    });
    score -= 8;
  } else if (words > budget.max) {
    findings.push({
      id: 'too-long',
      severity: 'warning',
      title: 'Script may be too dense for the target duration',
      detail: `Current draft is about ${words} words. For ${durationSeconds}s, aim roughly for ${budget.min}-${budget.max} words so narration and visuals can breathe.`,
    });
    score -= 10;
  } else {
    strengths.push(`Word count looks reasonable for a ${durationSeconds}s render.`);
  }

  if (lineCount < 4) {
    findings.push({
      id: 'line-count',
      severity: 'info',
      title: 'Could use more scene separation',
      detail: 'Break the draft into clearer beats so the pacing, visuals, and transitions are easier to control.',
    });
    score -= 6;
  }

  score = Math.max(0, Math.min(100, score));
  const summary =
    score >= 85
      ? 'Strong draft. It is close to production-ready.'
      : score >= 70
        ? 'Good base. A few adjustments will make the script more render-ready.'
        : score >= 50
          ? 'Usable draft, but it needs stronger structure and smoother pacing.'
          : 'This draft needs work before render for reliable output quality.';

  return {
    score,
    summary,
    findings,
    strengths,
  };
}
