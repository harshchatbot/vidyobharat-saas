/**
 * TOW (Table of Work) Master Prompt Templates
 *
 * Each prompt template is injected with runtime variables at generation time.
 * Variables are wrapped in {{double_braces}} in documentation; actual injection
 * is done by the generate() function for each stage.
 *
 * TOW Semantic Order:
 *   Stage 1:  Brief Collecting         — structured user input form (no AI)
 *   Stage 2:  Project State Pack       — project memory / save-file (AI generates initial snapshot)
 *   Stage 3:  Foundation               — strategy ONLY (AD DNA, Avatar, Campaign Role, Message Map, Angle)
 *   Stage 4:  Format Decision          — user selects from 6 ad format types (no AI prompt needed)
 *   Stage 5:  Script Generation        — script using chosen narrative template
 *   Stage 6:  Character / Face Lock    — consistent character identity + face-lock block
 *   Stage 7:  Scene Breakdown          — scenes derived AFTER character lock
 *   Stage 8:  Base Image Prompts       — one image prompt per scene
 *   Stage 9:  Video Motion Prompts     — motion only, derived FROM approved base images
 *   Stage 10: Voice Selection          — user selects voice (no AI prompt needed)
 *   Stage 11: Production               — image gen + video gen + lipsync (backend tasks)
 *   Stage 12: Quality Control          — 11-point checklist + numeric scores
 *   Stage 13: Final Packaging          — deliverables list, folder structure (no AI prompt)
 *
 * Usage:
 *   import { towPrompts } from '@/app/(shell)/story-ad/config/towPromptTemplates';
 *   const prompt = towPrompts.projectStatePack.generate(vars);
 */

// ── Input Variable Types ───────────────────────────────────────────────────

/** Stage 2: Project State Pack */
export interface PSPPromptVars {
  brand_name: string;
  product_name: string;
  target_audience: string;
  problem_being_solved: string;
  desired_outcome: string;
  call_to_action: string;
  trust_points: string[];
  must_include: string[];
  must_avoid: string[];
  platform: string;
  language: string;
  tone: string;
}

/** Stage 3: Foundation (strategy only — no script) */
export interface FoundationPromptVars {
  project_state_pack_json: string; // JSON snapshot of approved PSP
  ad_category: string;
  platform: string;
  language: string;
  tone: string;
}

/** Stage 5: Script Generation */
export interface ScriptPromptVars {
  foundation_json: string;          // JSON of approved Foundation
  selected_format: string;          // Ad format chosen in Stage 4
  narrative_path: 'ugc' | 'cinematic';
  narrative_structure: string;      // e.g. "Hook → Problem → Shift → Proof → CTA"
  platform: string;
  language: string;
  tone: string;
  target_duration_seconds: number;
}

/** Stage 6: Character / Face Lock */
export interface CharacterLockPromptVars {
  foundation_json: string;
  brand_name: string;
  product_name: string;
  target_audience: string;
  ad_category: string;
  avatar_id?: string;
  avatar_description?: string;
}

/** Stage 7: Scene Breakdown */
export interface SceneBreakdownPromptVars {
  approved_script: string;
  foundation_json: string;
  character_lock_summary: string;   // Character name, overview and face-lock block
  selected_format: string;
  narrative_structure: string;
  platform: string;
  scene_duration_seconds: number;
}

/** Stage 8: Base Image Prompt (per scene) */
export interface ImagePromptVars {
  scene_number: number;
  scene_type: string;
  visual_description: string;
  shot_type: string;
  mood: string;
  environment: string;
  avatar_description?: string;
  face_lock_block: string;          // Must be appended to every image prompt
  skin_enhancer_prompt: string;     // Skin quality override
}

/** Stage 9: Video Motion Prompt (per scene — derived FROM approved base images, NO new image prompts) */
export interface VideoMotionPromptVars {
  scene_number: number;
  approved_base_image_description: string; // What the approved image looks like
  spoken_line: string;
  mood: string;
  duration_seconds: number;
  lipsync_required: boolean;
  face_lock_block: string;          // Appended to prevent face drift
}

/** Stage 12: Quality Control */
export interface QCPromptVars {
  ad_category: string;
  platform: string;
  scene_count: number;
  total_duration_seconds: number;
  lipsync_used: boolean;
  final_video_url?: string;
}

// ── Template Definitions ───────────────────────────────────────────────────

export const towPrompts = {

  /**
   * STAGE 2 — Project State Pack
   * Generates the initial project memory / save-file from the structured brief.
   * This is NOT brand extraction — it is a structured snapshot of approved context
   * that every subsequent stage reads before generating.
   */
  projectStatePack: {
    systemPrompt: `You are a senior ad production coordinator.
Your role is to create a Project State Pack (PSP) — the project's memory / save-file.
The PSP is the single source of truth that all subsequent AI stages will read before generating.
It captures the APPROVED context at this moment: brand, offer, audience, and navigation meta.

Return ONLY valid JSON matching this schema:
{
  "brand": string,           // Brand identity in one sentence
  "offer": string,           // Product name + core offer + price if known
  "audience": string,        // Target audience in one sentence
  "angle": null,             // Always null at Stage 2 (set after Foundation)
  "format": null,            // Always null at Stage 2 (set after Format Decision)
  "script_draft": null,      // Always null at Stage 2 (set after Script)
  "character_lock_summary": null,
  "scene_breakdown_summary": null,
  "base_images_summary": null,
  "voice_direction": null,
  "static_creative_direction": null,
  "current_stage": "Stage 2 — Project State Pack",
  "next_step": string,       // What happens next (Foundation analysis)
  "missing_inputs": string[], // Any info that is unclear or missing from the brief
  "assumptions": string[]    // What the system is assuming (platform, tone, language, etc.)
}`,

    generate: (vars: PSPPromptVars): string => `
Create a Project State Pack (project memory / save-file) from this structured brief.

BRIEF INPUTS:
- Brand: ${vars.brand_name}
- Product: ${vars.product_name}
- Target Audience: ${vars.target_audience}
- Problem Being Solved: ${vars.problem_being_solved}
- Desired Outcome: ${vars.desired_outcome}
- Call to Action: ${vars.call_to_action}
- Trust Points: ${vars.trust_points.join(' | ')}
- Must Include: ${vars.must_include.join(' | ')}
- Must Avoid: ${vars.must_avoid.join(' | ')}

PLATFORM / DELIVERY CONTEXT:
- Platform: ${vars.platform}
- Language: ${vars.language}
- Tone: ${vars.tone}

Instructions:
1. Synthesise "brand", "offer", and "audience" from the inputs above into clear one-sentence summaries.
2. Set angle, format, script_draft, character_lock_summary, scene_breakdown_summary, base_images_summary, voice_direction, static_creative_direction to null (not yet generated).
3. Set next_step to describe Foundation analysis (Stage 3).
4. List any missing_inputs — pieces of info that would help but are absent from the brief.
5. List assumptions the system is making (e.g. aspect ratio, language defaults, duration).

Return valid JSON only — no markdown, no explanation.
`.trim(),
  },

  /**
   * STAGE 3 — Foundation (STRATEGY ONLY)
   * Generates AD DNA, Customer Avatar, Campaign Role, Message Map, and Marketing Angle.
   * Does NOT generate the script. Does NOT generate scene breakdowns.
   * Script is generated separately in Stage 5, using the format chosen in Stage 4.
   */
  foundation: {
    systemPrompt: `You are a senior brand strategist and performance marketing director.
Your task is to build the STRATEGIC FOUNDATION for a short-form video ad.

IMPORTANT: You do NOT write the script here. You do NOT create scenes.
The Foundation is strategy-only — it feeds into Format Decision (Stage 4) and Script Writing (Stage 5).

Return ONLY valid JSON matching this schema:
{
  "ad_dna": string,                    // Core strategic essence in 1-2 sentences
  "customer_avatar": {
    "name": string,                    // A persona name (e.g. "Priya Sharma")
    "age_range": string,               // e.g. "28-36"
    "occupation": string,
    "daily_struggle": string,          // The specific pain this product solves
    "desired_transformation": string,  // What life looks like after using the product
    "what_they_have_tried": string,    // Previous solutions that failed
    "what_they_truly_want": string     // Deeper emotional desire beyond the product
  },
  "campaign_role": string,             // Awareness / Consideration / Conversion / Retention
  "message_map": {
    "primary_message": string,         // The one thing the viewer must remember
    "supporting_points": string[],     // 2-4 proof points that back the primary message
    "emotional_trigger": string        // The core emotion that drives purchase
  },
  "main_marketing_angle": string,      // The sharpest single hook in one sentence
  "final_strategic_summary": string    // One paragraph synthesis of the above for briefing creatives
}`,

    generate: (vars: FoundationPromptVars): string => `
Build the strategic foundation for a ${vars.ad_category} ad.

APPROVED PROJECT STATE PACK:
${vars.project_state_pack_json}

DELIVERY CONTEXT:
- Platform: ${vars.platform}
- Language: ${vars.language}
- Tone: ${vars.tone}
- Ad Category: ${vars.ad_category}

Instructions:
1. Extract the customer avatar from the PSP audience field — give them a name and a vivid daily struggle.
2. Identify the sharpest marketing angle (not a generic benefit — a specific, surprising, or counterintuitive hook).
3. Define the campaign role (Awareness / Consideration / Conversion / Retention).
4. Build a message map with one primary message and 2–4 supporting proof points.
5. Write the AD DNA — one to two sentences that capture the strategic soul of this ad.
6. Summarise everything in final_strategic_summary for a creative team briefing.

Do NOT write any script lines. Do NOT create scene descriptions. That happens in Stage 5.
Return valid JSON only.
`.trim(),
  },

  /**
   * STAGE 5 — Script Generation
   * Writes the ad script using the Foundation's strategy + the Format Decision's narrative template.
   * Script comes AFTER Format Decision so the narrative structure (UGC vs Cinematic) is known.
   */
  script: {
    systemPrompt: `You are a senior ad copywriter specialised in short-form video.
Write a complete ad script using the approved Foundation strategy and the chosen narrative template.

Return ONLY valid JSON matching:
{
  "display_script": string,   // Clean spoken script, no emotion tags, for user review
  "tts_script": string,       // Emotion-tagged version for TTS generation (e.g. [WARM] text [/WARM])
  "word_count": number,
  "estimated_duration_seconds": number,
  "hook_line": string         // First sentence / opening line
}`,

    generate: (vars: ScriptPromptVars): string => `
Write a complete ad script using the approved strategy and format.

APPROVED FOUNDATION:
${vars.foundation_json}

FORMAT DECISION:
- Selected Format: ${vars.selected_format}
- Narrative Path: ${vars.narrative_path === 'ugc' ? 'UGC' : 'Cinematic'}
- Narrative Structure: ${vars.narrative_structure}

CONSTRAINTS:
- Platform: ${vars.platform}
- Language: ${vars.language}
- Tone: ${vars.tone}
- Target duration: ${vars.target_duration_seconds}s maximum
- Speaking pace: ~130 words per minute
- Max words: ${Math.round((vars.target_duration_seconds / 60) * 130)}

Narrative structure to follow:
${vars.narrative_structure.split('→').map((s, i) => `  Step ${i + 1}: ${s.trim()}`).join('\n')}

Instructions:
1. Follow the narrative structure step by step.
2. Hook (first 2 seconds) must stop the scroll — no generic openers.
3. CTA must be specific and action-oriented.
4. Write for the SPOKEN word — not for reading. Use natural contractions.
5. Emotion tags in tts_script: [WARM], [EXCITED], [CONFIDENT], [URGENT], [CURIOUS]. Tag ~30-40% only.

Return valid JSON only.
`.trim(),
  },

  /**
   * STAGE 6 — Character / Face Lock
   * Creates ONE consistent character identity used across all scenes.
   * Outputs face-lock block that is appended to EVERY subsequent image and video prompt.
   */
  characterLock: {
    systemPrompt: `You are a character director and AI visual consistency specialist.
Create a detailed character identity that will be used across ALL scenes of this ad.
The face-lock block you create will be appended to every image and video generation prompt
to prevent face drift and ensure visual consistency.

Return ONLY valid JSON matching:
{
  "character_overview": string,
  "face_details": {
    "age_range": string,
    "eye_color": string,
    "facial_structure": string,
    "notable_features": string
  },
  "skin": {
    "tone": string,
    "texture": string,
    "notes": string
  },
  "hair": {
    "length": string,
    "color": string,
    "style": string
  },
  "outfit": {
    "style": string,
    "colors": string,
    "accessories": string
  },
  "vibe_environment": string,
  "realism_rules": string[],
  "face_lock_block": string,          // Short prompt fragment for ALL image/video calls
  "headshot_image_prompt": string,    // Full prompt for generating reference headshot
  "skin_enhancer_prompt": string      // Append to any prompt to improve skin quality
}`,

    generate: (vars: CharacterLockPromptVars): string => `
Create a character identity and face-lock system for this ad campaign.

APPROVED FOUNDATION:
${vars.foundation_json}

CAMPAIGN CONTEXT:
- Brand: ${vars.brand_name}
- Product: ${vars.product_name}
- Target Audience: ${vars.target_audience}
- Ad Category: ${vars.ad_category}
${vars.avatar_description ? `- Avatar Reference: ${vars.avatar_description}` : ''}

Instructions:
1. Design a character who IS the target audience — their face proves the product works.
2. Be hyper-specific: name exact skin tone codes (e.g. NC30), hair length in inches, eye color shades.
3. The face_lock_block must be SHORT (under 50 words) — it will be appended to EVERY generation prompt.
4. The headshot_image_prompt must be complete and self-contained — a photographer could execute it.
5. Realism rules must be unambiguous — list exactly what AI must maintain across ALL scenes.
6. skin_enhancer_prompt: 20-30 words that improve photorealistic skin rendering.

Return valid JSON only.
`.trim(),
  },

  /**
   * STAGE 7 — Scene Breakdown
   * Breaks the approved script into producible scenes AFTER character lock.
   * Each scene gets: scene_type, spoken_line, visual_description, shot_type,
   * avatar_action, avatar_position, environment, mood, product_visibility, duration_seconds.
   */
  sceneBreakdown: {
    systemPrompt: `You are a storyboard director translating an approved script into producible scenes.
Each scene is a self-contained shot that will be generated as a separate image and video clip.

Return ONLY valid JSON matching:
{
  "scenes": [
    {
      "scene_number": number,
      "scene_type": "hook_talking|problem_talking|solution_scene|benefit_demo|social_proof|cta",
      "spoken_line": string,
      "visual_description": string,  // What the camera sees — no script, no VO text
      "shot_type": "close-up|medium|wide|overhead|pov",
      "avatar_action": string,       // What the character physically does
      "avatar_position": string,     // center|left|right|background|off-screen
      "environment": string,         // Room, setting, background description
      "mood": string,
      "product_visibility": "prominent|subtle|none",
      "duration_seconds": number,    // Default 5; can be 3–10
      "lipsync_this_scene": boolean
    }
  ],
  "total_duration_seconds": number
}`,

    generate: (vars: SceneBreakdownPromptVars): string => `
Break this approved script into producible scenes.

APPROVED SCRIPT:
"${vars.approved_script}"

APPROVED FOUNDATION:
${vars.foundation_json}

CHARACTER LOCK SUMMARY:
${vars.character_lock_summary}

FORMAT:
- Selected Format: ${vars.selected_format}
- Narrative Structure: ${vars.narrative_structure}
- Platform: ${vars.platform}
- Default scene duration: ${vars.scene_duration_seconds}s

Instructions:
1. Split the script into 3–6 scenes following the narrative structure.
2. Each scene spoken_line = exact words spoken in that scene.
3. Visual description = what the camera sees (NOT what is said).
4. Avatar action = specific physical movement (e.g. "lifts product bottle with right hand at 2s").
5. Mark lipsync_this_scene=true only for scenes where character speaks on camera.
6. Product must appear in at least 2 scenes with prominence specified.
7. Total duration must not exceed 30 seconds.

Return valid JSON only.
`.trim(),
  },

  /**
   * STAGE 8 — Base Image Prompt (per scene)
   * Generates photorealistic image prompts for each scene.
   * IMPORTANT: The face_lock_block MUST be appended to every prompt.
   */
  sceneImage: {
    systemPrompt: `You are a professional AI image prompt engineer specialised in ad creative.
Generate highly detailed image prompts optimised for photorealistic AI image generation.
The face-lock block MUST be included verbatim at the end of every prompt.`,

    generate: (vars: ImagePromptVars): string => `
Generate a base image prompt for scene ${vars.scene_number} of the ad.

SCENE DETAILS:
- Type: ${vars.scene_type}
- Shot: ${vars.shot_type}
- Mood: ${vars.mood}
- Visual description: ${vars.visual_description}
- Environment: ${vars.environment}
${vars.avatar_description ? `- Avatar/Character: ${vars.avatar_description}` : ''}

Write a single, dense image prompt (no bullet points, no headers).
Include: lighting, composition, camera angle, depth of field, colour grading, quality modifiers.
Append VERBATIM at the end: "${vars.face_lock_block}"
Then append: "${vars.skin_enhancer_prompt}"
End with: "photorealistic, 8K, professional commercial photography, award-winning ad creative"
`.trim(),
  },

  /**
   * STAGE 9 — Video Motion Prompt (per scene)
   * MOTION ONLY — derived FROM approved base images.
   * Does NOT create new image prompts.
   * Describes: camera_behavior, subject_movement, environment_movement,
   *             continuity_rules, negative_motion_rules.
   */
  sceneVideoMotion: {
    systemPrompt: `You are a professional AI video prompt engineer specialised in motion direction.
You are creating MOTION-ONLY prompts derived from APPROVED BASE IMAGES.
You are NOT creating new image prompts — you are describing how the existing approved image should animate.
The face-lock block must be referenced in continuity rules.

Return ONLY valid JSON matching:
{
  "camera_behavior": string,         // Static / pan-left / slow push-in / tracking — include timing
  "subject_movement": string,        // How avatar/product moves during the clip
  "environment_movement": string,    // Background / ambient / light motion
  "continuity_rules": string[],      // What MUST remain consistent with the base image
  "negative_motion_rules": string[]  // What AI must NOT do (face drift, artifacts, repositioning)
}`,

    generate: (vars: VideoMotionPromptVars): string => `
Create motion directives for scene ${vars.scene_number} — derived FROM the approved base image.

APPROVED BASE IMAGE DESCRIPTION:
${vars.approved_base_image_description}

SCENE CONTEXT:
- Spoken line: "${vars.spoken_line}"
- Mood: ${vars.mood}
- Duration: ${vars.duration_seconds}s
- Lipsync required: ${vars.lipsync_required ? 'YES — avatar mouth must sync to spoken line' : 'NO — VO only, avatar does not lip-sync'}

FACE-LOCK (append to continuity rules):
${vars.face_lock_block}

Instructions:
1. camera_behavior: describe the camera move precisely (e.g. "slow push-in from medium to close-up over 5 seconds").
2. subject_movement: describe exactly how the character/product moves (natural micro-movements, breathing, gestures).
3. environment_movement: subtle background motion only — nothing that distracts from subject.
4. continuity_rules: list 4–5 things that MUST match the base image exactly.
5. negative_motion_rules: list 4–6 explicit prohibitions (face drift, artifacts, teleporting, etc.).

Return valid JSON only.
`.trim(),
  },

  /**
   * STAGE 7 — Emotion-Tagged TTS Script
   * Applies SSML-style emotion tags to the spoken script for TTS generation.
   */
  emotionTagging: {
    systemPrompt: `You are a TTS (text-to-speech) specialist.
Apply emotion tags to a clean script to guide natural-sounding AI voice generation.
Use the format: [EMOTION] text [/EMOTION] for key phrases.
Available tags: [WARM], [EXCITED], [CONFIDENT], [CALM], [URGENT], [CURIOUS], [HAPPY], [SERIOUS]`,

    generate: (script: string, _tone: string, _category: string): string => `
Apply emotion tags to this ad script for natural TTS generation:

SCRIPT:
"${script}"

Rules:
- Only tag 30–40% of the text (overtagging sounds robotic)
- Hook line = [EXCITED] or [CURIOUS]
- Benefit statements = [CONFIDENT] or [WARM]
- CTA = [URGENT] or [EXCITED]
- Keep all punctuation intact
- Return only the tagged script, no explanation
`.trim(),
  },

  /**
   * STAGE 12 — Quality Control
   * Evaluates the generated video against an 11-point checklist + numeric scores.
   */
  qualityControl: {
    systemPrompt: `You are a senior ad quality control reviewer.
Evaluate a generated video ad against production standards.
Return a structured QC report with an 11-point semantic checklist AND numeric scores.

Return ONLY valid JSON matching:
{
  "visual_consistency": number,     // 0-10
  "audio_sync": number,             // 0-10
  "lipsync_accuracy": number,       // 0-10
  "brand_alignment": number,        // 0-10
  "platform_readiness": number,     // 0-10
  "overall": number,                // 0-10 (average of above)
  "checklist": [
    { "label": "Script Clarity",         "passed": boolean, "note": string },
    { "label": "Conversion Strength",    "passed": boolean, "note": string },
    { "label": "Visual Continuity",      "passed": boolean, "note": string },
    { "label": "Realism Quality",        "passed": boolean, "note": string },
    { "label": "Face Consistency",       "passed": boolean, "note": string },
    { "label": "Product Lock",           "passed": boolean, "note": string },
    { "label": "Lighting Consistency",   "passed": boolean, "note": string },
    { "label": "Voice Quality",          "passed": boolean, "note": string },
    { "label": "Platform Fit",           "passed": boolean, "note": string },
    { "label": "Editing Readiness",      "passed": boolean, "note": string },
    { "label": "Lipsync Quality",        "passed": boolean, "note": string }
  ],
  "issues": string[],
  "passed": boolean
}`,

    generate: (vars: QCPromptVars): string => `
Evaluate this ad production for quality control.

PRODUCTION DETAILS:
- Category: ${vars.ad_category}
- Platform: ${vars.platform}
- Scene count: ${vars.scene_count}
- Total duration: ${vars.total_duration_seconds}s
- Lipsync used: ${vars.lipsync_used ? 'Yes' : 'No'}
${vars.final_video_url ? `- Video URL: ${vars.final_video_url}` : ''}

QC CHECKLIST — evaluate each of the 11 items:
1. Script Clarity — Is each line immediately understandable on first listen?
2. Conversion Strength — Is there a strong hook, clear benefit, and specific CTA?
3. Visual Continuity — Are background, lighting, and framing consistent across scenes?
4. Realism Quality — Are there any AI artifacts (melted edges, extra fingers, texture smearing)?
5. Face Consistency — Does the character face match the face-lock block across all scenes?
6. Product Lock — Is the product visible and correctly represented in every scene it appears?
7. Lighting Consistency — Is the lighting temperature and direction consistent across scenes?
8. Voice Quality — Is the voiceover clear, paced correctly, and emotionally aligned to each scene?
9. Platform Fit — Does the ad meet the platform's format, ratio, and thumb-stop requirements?
10. Editing Readiness — Are all clips clean and ready for stitching without mid-clip issues?
11. Lipsync Quality — If lipsync was used, is the audio-to-video sync accurate (within 0.1s)?

Mark passed=true if overall score >= 7.5 AND no more than 2 checklist items fail.
List specific issues in the issues array (empty array if none).
Return valid JSON only.
`.trim(),
  },

} as const;

// ── Category-Specific Lipsync Rules ───────────────────────────────────────

export const LIPSYNC_REQUIRED_FORMATS = [
  'ugc_direct_to_camera',
  'founder_talking_head',
  'ugc_lifestyle_mixed',
] as const;

export const VOICEOVER_ONLY_FORMATS = [
  'cinematic_broll_voiceover',
  'product_led_visual',
  'ui_screen_demo',
] as const;

/** @deprecated Use LIPSYNC_REQUIRED_FORMATS. Kept for backwards compatibility. */
export const LIPSYNC_REQUIRED_CATEGORIES = [
  'ugc_testimonial',
  'founder_talking_head',
  'inner_monologue',
  'problem_solution',
] as const;

export const PRODUCT_DEMO_CATEGORIES = [
  'product_demo_lifestyle',
] as const;

export const BROLL_CATEGORIES = [
  'cinematic_narration',
  'cinematic_broll',
] as const;

export function requiresLipsync(category: string): boolean {
  return (LIPSYNC_REQUIRED_CATEGORIES as readonly string[]).includes(category)
    || (LIPSYNC_REQUIRED_FORMATS as readonly string[]).includes(category);
}

// ── Duration Rules ─────────────────────────────────────────────────────────

export const DURATION_RULES = {
  ideal_seconds: 20,
  max_seconds: 30,
  scene_duration_seconds: 5,
  min_scenes: 3,
  max_scenes: 6,
  words_per_minute: 130,
} as const;

export function estimateDuration(wordCount: number): number {
  return Math.round((wordCount / DURATION_RULES.words_per_minute) * 60);
}

export function estimateWordCount(targetSeconds: number): number {
  return Math.round((targetSeconds / 60) * DURATION_RULES.words_per_minute);
}

// ── Credit Cost Map ────────────────────────────────────────────────────────

export const CREDIT_COSTS = {
  project_state_pack: 0,        // Free (Gemini Flash)
  foundation: 0,                // Free (Gemini Flash)
  format_decision: 0,           // Free (user selection — no AI)
  script: 0,                    // Free (Gemini Flash)
  character_lock: 0,            // Free (Gemini Flash)
  scene_breakdown: 0,           // Free (Gemini Flash)
  base_image_per_scene: 5,      // Flux / SD image generation
  video_prompts: 0,             // Free (Gemini Flash — motion only)
  voice_preview: 3,             // Short TTS clip (first 2 lines)
  voice_full: 8,                // Full script TTS
  video_per_scene_standard: 25, // Kling standard
  video_per_scene_premium: 40,  // Kling Pro / Seedance
  lipsync_per_scene: 15,        // EchoMimic / Hedra
  final_stitch: 5,              // FFmpeg / cloud render
  qc_analysis: 2,               // Gemini Vision
} as const;

export function estimateTotalCredits(
  sceneCount: number,
  requiresLipsync_: boolean,
  videoTier: 'standard' | 'premium' = 'standard'
): number {
  const imageCredits = sceneCount * CREDIT_COSTS.base_image_per_scene;
  const voiceCredits = CREDIT_COSTS.voice_full;
  const videoCredits = sceneCount * (
    videoTier === 'premium'
      ? CREDIT_COSTS.video_per_scene_premium
      : CREDIT_COSTS.video_per_scene_standard
  );
  const lipsyncCredits = requiresLipsync_ ? sceneCount * CREDIT_COSTS.lipsync_per_scene : 0;
  const stitchCredits = CREDIT_COSTS.final_stitch;
  const qcCredits = CREDIT_COSTS.qc_analysis;

  return imageCredits + voiceCredits + videoCredits + lipsyncCredits + stitchCredits + qcCredits;
}

// ── Platform Aspect Ratio Map ──────────────────────────────────────────────

export const PLATFORM_ASPECT_RATIOS: Record<string, '9:16' | '1:1' | '16:9'> = {
  instagram_reels: '9:16',
  tiktok: '9:16',
  youtube_shorts: '9:16',
  instagram_feed: '1:1',
  facebook_feed: '1:1',
  youtube: '16:9',
  linkedin: '16:9',
  facebook_video: '16:9',
};

export function getAspectRatioForPlatform(platform: string): '9:16' | '1:1' | '16:9' {
  return PLATFORM_ASPECT_RATIOS[platform] ?? '9:16';
}
