'use client';

import { useEffect, useState, useCallback } from 'react';
import { getCurrentUserIdOrThrow } from '@/lib/authUser';

function getUserId(): string {
  return getCurrentUserIdOrThrow('Storyboard API request');
}

// Backend API base URL
const API_BASE_URL = 'http://localhost:8000';
const STORY_AD_REAL_SMOKE = process.env.NEXT_PUBLIC_STORY_AD_REAL_SMOKE === 'true';



function normalizeWorkflowState(state?: string | null): string {
  return String(state || '')
    .trim()
    .toLowerCase()
    .replaceAll('-', '_');
}

function normalizeProject(raw: any): StoryboardProject {
  const projectData = raw.project || raw;

  return {
    ...projectData,
    id: projectData.id || projectData.project_id,
    workflow_state: normalizeWorkflowState(
      projectData.workflow_state || projectData.workflowState
    ),
    display_script:
      projectData.display_script ||
      projectData.displayScript ||
      projectData.script ||
      projectData.script_text ||
      projectData.generated_script ||
      projectData.narration_script ||
      '',
    tts_script:
      projectData.tts_script ||
      projectData.ttsScript ||
      '',
    product_reference_images: Array.isArray(projectData.product_reference_images)
      ? projectData.product_reference_images
      : [],
    avatar_reference_images: Array.isArray(projectData.avatar_reference_images)
      ? projectData.avatar_reference_images
      : [],
    character_reference_sheet_url: projectData.character_reference_sheet_url || undefined,
    character_reference_sheet_prompt: projectData.character_reference_sheet_prompt || undefined,
  };
}

function hasGeneratedScript(project?: StoryboardProject | null): boolean {
  return Boolean(project?.display_script && project.display_script.trim().length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// TOW (Table of Work) Master Prompt System — Type Definitions
// Semantic order: Brief → PSP → Foundation → Format → Script → Character Lock
//                 → Scene Breakdown → Images → Video Prompts → Voice
//                 → Production → QC → Final Packaging → Completed
// ─────────────────────────────────────────────────────────────────────────────

// ── Stage 1: Brand Brief ──────────────────────────────────────────────────
// Structured input captured from the user before any generation begins.
export interface BriefData {
  brand_name: string;
  product_name: string;
  target_audience: string;
  problem_being_solved: string;
  desired_outcome: string;
  call_to_action: string;
  trust_points: string[];       // Social proof, stats, testimonials
  must_include: string[];       // Non-negotiables (logo, price, claim, etc.)
  must_avoid: string[];         // Brand safety rules
}

// ── Stage 2: Project State Pack ───────────────────────────────────────────
// NOT brand-intelligence extraction.
// This is the project's memory / save-file.
// It stores the LATEST APPROVED context for every stage,
// so any stage can be regenerated with full awareness of prior decisions.
export interface ProjectStatePack {
  // Approved context fields (null = stage not yet reached)
  brand: string;
  offer: string;
  audience: string;
  angle: string | null;
  format: string | null;          // e.g. "UGC Direct-to-Camera"
  script_draft: string | null;
  character_lock_summary: string | null;
  scene_breakdown_summary: string | null;
  base_images_summary: string | null;
  voice_direction: string | null;
  static_creative_direction: string | null;
  // Navigation meta
  current_stage: string;
  next_step: string;
  missing_inputs: string[];
  assumptions: string[];
}

// ── Stage 3: Foundation ───────────────────────────────────────────────────
// STRATEGY ONLY. Does NOT generate the script or scene breakdown.
// Outputs: AD DNA, Customer Avatar, Campaign Role, Message Map,
//          Main Marketing Angle, Final Strategic Summary.
export interface CustomerAvatar {
  name: string;
  age_range: string;
  occupation: string;
  daily_struggle: string;
  desired_transformation: string;
  what_they_have_tried: string;
  what_they_truly_want: string;
}

export interface MessageMap {
  primary_message: string;
  supporting_points: string[];
  emotional_trigger: string;
}

export interface Foundation {
  ad_dna: string;                   // Core strategic essence in 1-2 sentences
  customer_avatar: CustomerAvatar;
  campaign_role: string;            // Awareness / Consideration / Conversion / Retention
  message_map: MessageMap;
  main_marketing_angle: string;     // The single sharpest hook
  final_strategic_summary: string;  // One-paragraph synthesis
}

// ── Stage 4: Format Decision ──────────────────────────────────────────────
// Compares 6 ad format types. Chooses one. Determines narrative path.
export type AdFormat =
  | 'ugc_direct_to_camera'
  | 'ugc_lifestyle_mixed'
  | 'cinematic_broll_voiceover'
  | 'founder_talking_head'
  | 'product_led_visual'
  | 'ui_screen_demo';

export type NarrativePath = 'ugc' | 'cinematic';

export interface FormatOption {
  format: AdFormat;
  label: string;
  description: string;
  narrative_structure: string;
  lipsync_required: boolean;
  requires_avatar: boolean;
  recommended_for: string[];
  pros: string[];
  cons: string[];
}

export interface FormatDecision {
  selected_format: AdFormat;
  selected_path: NarrativePath;     // drives script template selection
  narrative_structure: string;      // Hook → Problem → Shift → Proof → CTA (UGC)
                                    // Hook → Tension → Shift → Proof → CTA (Cinematic)
  lipsync_required: boolean;
  requires_avatar: boolean;
  recommended_tone: string;
}

// ── Stage 6: Character / Face Lock ────────────────────────────────────────
// Creates ONE consistent character identity used across all scenes.
// Outputs realism rules, face-lock block, headshot prompt, skin-enhancer prompt.
export interface FaceDetails {
  age_range: string;
  eye_color: string;
  facial_structure: string;
  notable_features: string;
}

export interface SkinDetails {
  tone: string;
  texture: string;
  notes: string;
}

export interface HairDetails {
  length: string;
  color: string;
  style: string;
}

export interface OutfitDetails {
  style: string;
  colors: string;
  accessories: string;
}

export interface CharacterLock {
  character_overview: string;
  face_details: FaceDetails;
  skin: SkinDetails;
  hair: HairDetails;
  outfit: OutfitDetails;
  vibe_environment: string;
  realism_rules: string[];
  face_lock_block: string;          // Prompt fragment added to every image/video prompt
  headshot_image_prompt: string;    // Single reference shot
  skin_enhancer_prompt: string;
  // Legacy passthrough fields
  avatar_id?: string;
  avatar_name?: string;
}

// ── Stage 9: Video Prompts ────────────────────────────────────────────────
// Motion prompts derived FROM approved base images.
// Does NOT create new image prompts.
// Covers: camera behavior, subject movement, environment movement,
//         continuity rules, negative motion rules.
export interface SceneVideoPrompt {
  scene_number: number;
  camera_behavior: string;       // Static / pan-left / slow push-in / tracking shot
  subject_movement: string;      // How avatar/product moves during the clip
  environment_movement: string;  // Background / light / ambient motion
  continuity_rules: string[];    // What MUST remain consistent with base image
  negative_motion_rules: string[];// What AI must NOT do (artifacts, face drift, etc.)
  lipsync_required: boolean;
  reference_mood: string;
  duration_seconds: number;
}

// ── QC Report ────────────────────────────────────────────────────────────
export interface QCChecklistItem {
  label: string;
  passed: boolean;
  note?: string;
}

export interface QCReport {
  // Numeric scores (0–10)
  visual_consistency: number;
  audio_sync: number;
  lipsync_accuracy: number;
  brand_alignment: number;
  platform_readiness: number;
  overall: number;
  // Semantic checklist
  checklist: QCChecklistItem[];
  issues: string[];
  passed: boolean;
}

export interface StoryboardProject {
  id: string;
  user_id: string;
  ad_category: string;
  creation_mode?: 'avatar' | 'storyboard';
  // production_path mirrors creation_mode — prefer production_path for new code
  production_path?: 'ai_avatar' | 'storyboard';
  workflow_state: string;
  business_brief: string;
  platform: string;
  language: string;
  tone: string;
  avatar_id?: string;
  avatar_name?: string;     // Display name of the selected avatar (e.g. "Chitrakala")
  avatar_reference_images?: string[];
  product_reference_images?: string[];
  character_reference_sheet_url?: string;
  character_reference_sheet_prompt?: string;
  character_reference_sheet_status?: string;
  character_reference_sheet_fallback_to_golden_refs?: boolean;
  product_image_url?: string;
  display_script?: string;
  tts_script?: string;
  selected_voice?: string;
  selected_tts_language_code?: string;
  selected_tts_language_label?: string;
  selected_tts_provider_language_code?: string;
  selected_tts_voice_id?: string;
  selected_tts_voice_name?: string;
  selected_tts_provider_voice_name?: string;
  selected_video_quality_label?: string;
  selected_video_model_key?: string;
  selected_ad_duration_seconds?: number;
  target_ad_duration_seconds?: number;
  selected_duration_label?: string;
  requested_ad_duration_seconds?: number;
  actual_estimated_output_duration_seconds?: number;
  production_credit_estimate?: Record<string, unknown>;
  production_estimated_time_label?: string;
  script_word_count?: number;
  script_estimated_duration_seconds?: number;
  script_duration_status?: 'fits' | 'too_long' | 'too_short' | string;

  // ── TOW fields (semantic order) ──────────────────────────────────────────
  brief_data?: BriefData;                // Stage 1: Structured brand brief
  project_state_pack?: ProjectStatePack; // Stage 2: Project memory / save-file
  foundation?: Foundation;               // Stage 3: Strategy (AD DNA, Avatar, Angle)
  format_decision?: FormatDecision;      // Stage 4: Ad format & narrative path
  // Stage 5: Script lives in display_script / tts_script (existing fields)
  character_lock?: CharacterLock;        // Stage 6: Character identity + face lock
  // Stage 7: Scene breakdown lives in scenes (fetched separately)
  // Stage 8: Base images live in scenes
  video_prompts?: SceneVideoPrompt[];    // Stage 9: Motion prompts per scene
  // Stage 10: Voice lives in selected_voice
  // Stage 11: Production tracked by workflow_state
  qc_report?: QCReport;                 // Stage 12: QC checklist + scores

  script_score?: {
    hook_strength: number;
    clarity: number;
    emotional_pull: number;
    word_count_ok: boolean;
    category_fit: number;
    overall: number;
    improvement_suggestions: string[];
  };
  storyboard_score?: {
    visual_clarity: number;
    scene_purpose: number;
    flow: number;
    overall: number;
    improvement_suggestions: string[];
  };
  final_score?: {
    visual_consistency: number;
    audio_sync: number;
    lipsync_accuracy?: number;
    production_quality: number;
    platform_ready: number;
    overall: number;
    improvement_suggestions: string[];
  };
  credits_estimated: number;
  credits_consumed: number;
  final_video_url?: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  scene_count?: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface InitializeProjectInput {
  ad_category: string;
  business_brief: string;
  platform: string;
  language: string;
  tone: string;
  avatar_id?: string;
  avatar_name?: string;
  product_image_url?: string;
  product_reference_images?: string[];
  avatar_reference_images?: string[];
  creation_mode?: 'avatar' | 'storyboard';
  production_path?: 'ai_avatar' | 'storyboard';
  target_ad_duration_seconds?: number;
}

export interface SceneApprovalInput {
  user_approved: boolean;
  user_feedback?: string;
}

export interface ApprovalCheckpointInput {
  confirmation: boolean;
}

export function useStoryboardProject() {
  const [project, setProject] = useState<StoryboardProject | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getProject = useCallback(async (projectId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}`, {
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch project: ${response.statusText}`);
      }
      const data = await response.json();
      console.log('[getProject] Received full response:', data);

      const normalizedProject = normalizeProject(data);

      console.log('[getProject] Normalized project:', {
        id: normalizedProject.id,
        workflow_state: normalizedProject.workflow_state,
        display_script_exists: Boolean(normalizedProject.display_script),
        test_mode: STORY_AD_REAL_SMOKE ? 'real_smoke' : 'normal',
      });

      setProject(normalizedProject);
      return normalizedProject;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error fetching project:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const initializeProject = useCallback(async (input: InitializeProjectInput) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_BASE_URL + '/api/storyboard/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(`Failed to initialize project: ${response.statusText}`);
      }
      const data = await response.json();
      console.log('[initializeProject]', {
        project_id: data.project_id || data.id,
        workflow_state: data.workflow_state || 'initialized',
        test_mode: STORY_AD_REAL_SMOKE ? 'real_smoke' : 'normal',
      });

      // Normalize the response: backend returns project_id, but interface expects id
      const normalizedProject: StoryboardProject = {
        id: data.project_id || data.id,
        user_id: '',
        ad_category: data.ad_category || input.ad_category,
        workflow_state: data.workflow_state || 'initialized',
        business_brief: input.business_brief,
        platform: input.platform,
        language: input.language,
        tone: input.tone,
        avatar_id: input.avatar_id,
        avatar_name: input.avatar_name,
        product_image_url: input.product_image_url,
        product_reference_images: input.product_reference_images || [],
        avatar_reference_images: input.avatar_reference_images || [],
        credits_estimated: data.credits_estimated || 0,
        credits_consumed: data.credits_consumed || 0,
        created_at: data.created_at || new Date().toISOString(),
        updated_at: data.updated_at || new Date().toISOString(),
      };

      setProject(normalizedProject);
      return normalizedProject;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error initializing project:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const generateScript = useCallback(async (projectId: string) => {
    setLoading(true);
    setError(null);
    try {
      console.log(`Generating script for project: ${projectId}`);
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/generate-script`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
      });

      const responseText = await response.text();
      console.log('Backend response:', responseText);

      if (!response.ok) {
        console.error(`HTTP ${response.status}: ${responseText}`);
        throw new Error(`Failed to generate script: ${response.statusText} - ${responseText}`);
      }

      const data = JSON.parse(responseText);
      console.log('Script generation response:', data);

      // Poll until backend has saved script content and state transition
      const readyProject = await pollUntilScriptReady(projectId);
      return {
        ...data,
        ready_project: readyProject ?? null,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error generating script:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [getProject]);

  const pollUntilScriptReady = useCallback(
    async (projectId: string, maxAttempts = 20, delayMs = 1500) => {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const latestProject = await getProject(projectId);
  
        const workflowState = normalizeWorkflowState(latestProject?.workflow_state);
        const scriptReady = hasGeneratedScript(latestProject);
  
        console.log('[pollUntilScriptReady]', {
          attempt,
          workflowState,
          scriptReady,
          test_mode: STORY_AD_REAL_SMOKE ? 'real_smoke' : 'normal',
        });
  
        if (
          scriptReady ||
          workflowState === 'script_awaiting_approval' ||
          workflowState === 'script_failed'
        ) {
          return latestProject;
        }
  
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
  
      throw new Error('Script generation timed out. Please refresh and try again.');
    },
    [getProject]
  );


  const approveScript = useCallback(async (projectId: string, confirmation: boolean = true) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/approve-script`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
        body: JSON.stringify({ confirmation }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Failed to approve script: ${response.statusText}${detail ? ` (${detail})` : ''}`);
      }
      const data = await response.json();
      await getProject(projectId);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error approving script:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [getProject]);

  const regenerateScript = useCallback(async (projectId: string, targetDurationSeconds?: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/regenerate-script`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
        body: JSON.stringify({
          target_ad_duration_seconds: targetDurationSeconds,
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Failed to regenerate script: ${response.statusText}${detail ? ` (${detail})` : ''}`);
      }
      const data = await response.json();
      await getProject(projectId);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error regenerating script:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [getProject]);

  const updateScript = useCallback(async (projectId: string, updatedScript: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/script`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
        body: JSON.stringify({ script_text: updatedScript, source: 'manual_edit' }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Failed to update script: ${response.statusText}${detail ? ` (${detail})` : ''}`);
      }
      const data = await response.json();
      const refreshed = await getProject(projectId);
      return (data?.result || data || refreshed);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error updating script:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [getProject]);

  const generateStoryboard = useCallback(async (projectId: string, confirmation: boolean = true) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/generate-storyboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
        body: JSON.stringify({ confirmation }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Failed to generate storyboard: ${response.statusText}${detail ? ` (${detail})` : ''}`);
      }
      const data = await response.json();
      await getProject(projectId);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error generating storyboard:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [getProject]);

  const approveStoryboard = useCallback(async (projectId: string, confirmation: boolean = true) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/approve-storyboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
        body: JSON.stringify({ confirmation }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Failed to approve storyboard: ${response.statusText}${detail ? ` (${detail})` : ''}`);
      }
      const data = await response.json();
      await getProject(projectId);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error approving storyboard:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [getProject]);

  const approveSceneImage = useCallback(async (projectId: string, sceneId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/scenes/${sceneId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
        body: JSON.stringify({ user_approved: true }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Failed to approve scene: ${response.statusText}${detail ? ` (${detail})` : ''}`);
      }
      await getProject(projectId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error approving scene:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [getProject]);

  const rejectSceneImage = useCallback(async (projectId: string, sceneId: string, feedback: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/scenes/${sceneId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
        body: JSON.stringify({ user_approved: false, user_feedback: feedback }),
      });
      if (!response.ok) {
        throw new Error(`Failed to reject scene: ${response.statusText}`);
      }
      await getProject(projectId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error rejecting scene:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [getProject]);

  const updateScene = useCallback(async (
    projectId: string,
    sceneId: string,
    payload: {
      dialogue?: string;
      voice_line?: string;
      tts_text?: string;
      script_line?: string;
      narration?: string;
      spoken_line?: string;
      duration_seconds?: number;
      visual_description?: string;
      shot_type?: string;
      mood?: string;
      environment?: string;
      avatar_action?: string;
    },
  ) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/scenes/${sceneId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(`Failed to update scene: ${response.statusText}${data?.detail ? ` (${JSON.stringify(data.detail)})` : ''}`);
      }
      await getProject(projectId);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error updating scene:', errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getProject]);

  const regenerateSceneImage = useCallback(async (projectId: string, sceneId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/scenes/${sceneId}/regenerate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Failed to regenerate scene image: ${response.statusText}${detail ? ` (${detail})` : ''}`);
      }
      const data = await response.json();
      await getProject(projectId);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error regenerating scene image:', errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getProject]);

  const generateVoicePreview = useCallback(async (
    projectId: string,
    voice: string,
    language: string,
    previewText?: string,
    styleInstructions?: string,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/voice-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
        body: JSON.stringify({
          voice,
          language_code: language,
          prompt: previewText,
          preview_text: previewText,
          style_instructions: styleInstructions,
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Failed to generate voice preview: ${response.status} ${response.statusText}${detail ? ` (${detail})` : ''}`);
      }
      const data = await response.json();
      return data?.result || data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error generating voice preview:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const selectVoice = useCallback(async (projectId: string, voice: string, language: string) => {
    setLoading(true);
    setError(null);
    try {
      console.log('storyboard_voice_confirm_clicked', { projectId, voice, language });
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/select-voice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
        body: JSON.stringify({ voice, language_code: language }),
      });
      if (!response.ok) {
        throw new Error(`Failed to select voice: ${response.statusText}`);
      }
      const payload = await response.json();
      console.log('storyboard_voice_saved', { projectId, payload });
      await getProject(projectId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error selecting voice:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [getProject]);

  const saveProductionSettings = useCallback(async (
    projectId: string,
    settings: { selected_video_model_key: string; selected_ad_duration_seconds: number },
  ) => {
    const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/production/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': getUserId(),
      },
      body: JSON.stringify(settings),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Failed to save production settings: ${response.statusText}${payload?.detail ? ` (${payload.detail})` : ''}`);
    }
    await getProject(projectId);
    return payload;
  }, [getProject]);

  const getProductionEstimate = useCallback(async (
    projectId: string,
    modelKey: string,
    durationSeconds: number,
  ) => {
    const query = new URLSearchParams({
      model_key: modelKey,
      duration_seconds: String(durationSeconds),
    });
    const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/production/estimate?${query.toString()}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': getUserId(),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Failed to get production estimate: ${response.statusText}${payload?.detail ? ` (${payload.detail})` : ''}`);
    }
    return payload;
  }, []);

  const startProduction = useCallback(async (projectId: string) => {
    setLoading(true);
    setError(null);
    try {
      console.log('storyboard_production_retry_clicked', { projectId });
      console.log('storyboard_start_production_api_called', { projectId, reason: 'manual_retry' });
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/production/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('storyboard_start_production_api_failed', { projectId, status: response.status, payload });
        throw new Error(`Failed to start production: ${response.statusText}${payload?.detail ? ` (${payload.detail})` : ''}`);
      }
      console.log('storyboard_start_production_api_response', { projectId, payload });
      await getProject(projectId);
      return payload;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getProject]);

  const generateImages = useCallback(async (projectId: string, confirmation: boolean = true) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/generate-images`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
        body: JSON.stringify({ confirmation }),
      });

      const responseText = await response.text();
      console.log('[generateImages] Response status:', response.status);
      console.log('[generateImages] Response body:', responseText);

      if (!response.ok) {
        const detail = responseText ? ` - ${responseText}` : '';
        throw new Error(`Failed to generate images: ${response.statusText}${detail}`);
      }

      const data = JSON.parse(responseText);
      await getProject(projectId);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error generating images:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [getProject]);

  const approveImages = useCallback(async (projectId: string, confirmation: boolean = true) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/approve-images`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
        body: JSON.stringify({ confirmation }),
      });
      if (!response.ok) {
        throw new Error(`Failed to approve images: ${response.statusText}`);
      }
      const data = await response.json();
      await getProject(projectId);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error approving images:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [getProject]);

  const generateVideos = useCallback(async (projectId: string, confirmation: boolean = true) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/generate-videos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
        body: JSON.stringify({ confirmation }),
      });
      if (!response.ok) {
        throw new Error(`Failed to generate videos: ${response.statusText}`);
      }
      const data = await response.json();
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error generating videos:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const generateFinalVideo = useCallback(async (projectId: string, confirmation: boolean = true) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/generate-final-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
        body: JSON.stringify({ confirmation }),
      });
      if (!response.ok) {
        throw new Error(`Failed to generate final video: ${response.statusText}`);
      }
      const data = await response.json();
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error generating final video:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const approveFinalVideo = useCallback(async (projectId: string, confirmation: boolean = true) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/approve-final-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
        body: JSON.stringify({ confirmation }),
      });
      if (!response.ok) {
        throw new Error(`Failed to approve final video: ${response.statusText}`);
      }
      await getProject(projectId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error approving final video:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [getProject]);

  const getCreditEstimate = useCallback(async (projectId: string, stage: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${projectId}/credit-estimate?stage=${stage}`, {
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getUserId(),
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to get credit estimate: ${response.statusText}`);
      }
      const data = await response.json();
      return data;
    } catch (err) {
      console.error('Error getting credit estimate:', err);
      return null;
    }
  }, []);

  return {
    project,
    loading,
    error,
    getProject,
    initializeProject,
    generateScript,
    approveScript,
    regenerateScript,
    updateScript,
    generateStoryboard,
    approveStoryboard,
    approveSceneImage,
    rejectSceneImage,
    updateScene,
    regenerateSceneImage,
    generateImages,
    approveImages,
    generateVoicePreview,
    selectVoice,
    saveProductionSettings,
    getProductionEstimate,
    startProduction,
    generateVideos,
    generateFinalVideo,
    approveFinalVideo,
    getCreditEstimate,
  };
}
