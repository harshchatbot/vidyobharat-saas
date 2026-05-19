'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useStoryboardProject, InitializeProjectInput } from './hooks/useStoryboardProject';
import { useProductionPolling } from './hooks/useProductionPolling';
import CategorySelection from './components/CategorySelection';
import StoryAdForm from './StoryAdForm';
import CreationMethodModal from './components/CreationMethodModal';
import AvatarPickerModal from './components/AvatarPickerModal';
import type { BriefData } from './StoryAdForm';
import { useAvatarLibrary } from './hooks/useAvatarLibrary';
import ScriptCheckpoint from './components/ScriptCheckpoint';
import StoryboardCheckpoint from './components/StoryboardCheckpoint';
import ImageCheckpoint from './components/ImageCheckpoint';
import VoiceSelector from './components/VoiceSelector';
import ProductionStatus from './components/ProductionStatus';
import ProductionStartingCheckpoint from './components/ProductionStartingCheckpoint';
import FinalPreview from './components/FinalPreview';
import CreditEstimate from './components/CreditEstimate';
import TestModeSelector from './components/TestModeSelector';
// ── TOW Checkpoint Components ─────────────────────────────────────────────
import BriefCheckpoint from './components/BriefCheckpoint';
import ProjectStatePackCheckpoint from './components/ProjectStatePackCheckpoint';
import FoundationCheckpoint from './components/FoundationCheckpoint';
import FormatDecisionCheckpoint from './components/FormatDecisionCheckpoint';
import CharacterLockCheckpoint from './components/CharacterLockCheckpoint';
import VideoPromptCheckpoint from './components/VideoPromptCheckpoint';
import QCCheckpoint from './components/QCCheckpoint';
import FinalPackagingCheckpoint from './components/FinalPackagingCheckpoint';
import { getCurrentUserId } from '@/lib/authUser';
import { API_URL } from '@/lib/env';
import { markOnboardingComplete } from '@/components/ui/OnboardingChecklist';

type GuidedFlowStep = 'category' | 'avatar-selection' | 'step1' | 'step2' | 'step3';
type TestMode = 'real' | 'mock' | null;

const CATEGORY_MAP: Record<string, { name: string; requiresAvatar: 'required' | 'optional' | 'not_needed' }> = {
  ugc_testimonial: { name: 'UGC Testimonial', requiresAvatar: 'optional' },
  founder_talking_head: { name: 'Founder Talking Head', requiresAvatar: 'required' },
  problem_solution: { name: 'Problem-Solution', requiresAvatar: 'optional' },
  product_demo_lifestyle: { name: 'Product Demo & Lifestyle', requiresAvatar: 'optional' },
  inner_monologue: { name: 'Inner Monologue', requiresAvatar: 'required' },
  cinematic_narration: { name: 'Cinematic Narration', requiresAvatar: 'not_needed' },
  cinematic_broll: { name: 'Cinematic B-Roll', requiresAvatar: 'not_needed' },
};

type WorkflowState =
  // ── TOW Stage 1: Brand Brief ───────────────────────────────────────────
  | 'brief_collecting'
  | 'brief_approved'
  // ── Legacy states (kept for backward compat) ──────────────────────────
  | 'initialized'
  | 'category_selected'
  | 'script_generating'
  | 'script_awaiting_approval'
  | 'script_generated'
  | 'script_approved'
  | 'storyboard_generating'
  | 'storyboard_awaiting_approval'
  | 'storyboard_generated'
  | 'storyboard_approved'
  | 'images_generating'
  | 'images_awaiting_approval'
  | 'images_generated'
  | 'images_approved'
  | 'production_starting'
  | 'production_in_progress'
  | 'production_failed'
  | 'final_video_ready'
  | 'final_awaiting_approval'
  | 'completed'
  // ── TOW Phase 1: Project State Pack ───────────────────────────────────
  | 'project_state_pack_generating'
  | 'project_state_pack_awaiting_approval'
  | 'project_state_pack_approved'
  // ── TOW Phase 2: Foundation (Script + Storyboard combined) ────────────
  | 'foundation_generating'
  | 'foundation_awaiting_approval'
  | 'foundation_approved'
  // ── TOW Phase 3: Format Decision ──────────────────────────────────────
  | 'format_selecting'
  | 'format_approved'
  // ── TOW Phase 4: Character Lock ───────────────────────────────────────
  | 'character_lock_selecting'
  | 'character_lock_approved'
  // ── TOW Phase 5: Video Prompts ────────────────────────────────────────
  | 'video_prompts_generating'
  | 'video_prompts_awaiting_approval'
  | 'video_prompts_approved'
  // ── TOW Phase 6: Voice + Production ──────────────────────────────────
  | 'voice_approved'
  | 'voice_confirmed'
  | 'production_completed'
  // ── TOW Phase 7: QC ──────────────────────────────────────────────────
  | 'qc_in_progress'
  | 'qc_awaiting_approval'
  | 'qc_approved'
  // ── TOW Phase 8: Final Packaging ──────────────────────────────────────
  | 'final_packaging';

const STORAGE_KEY = 'storyboard_project_id';

export default function StoryAdPage() {
  const normalizeApiMediaUrl = (url?: string | null): string | null => {
    const raw = String(url || '').trim();
    if (!raw) return null;
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw.startsWith('/api/')) return `${API_URL}${raw}`;
    const normalized = raw.replace(/\\/g, '/');
    if (normalized.includes('/data/renders/')) {
      const filename = normalized.split('/').pop();
      if (filename) return `${API_URL}/api/renders/${filename}`;
    }
    return raw;
  };
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectIdParam = searchParams.get('project_id');
  const initialStep = (searchParams.get('step') as GuidedFlowStep) || 'category';

  const [guidedFlowStep, setGuidedFlowStep] = useState<GuidedFlowStep>(initialStep);
  const [creationMode, setCreationMode] = useState<'avatar' | 'storyboard' | null>(null);
  const [testMode, setTestMode] = useState<TestMode>(null);
  const [showTestModeSelector, setShowTestModeSelector] = useState(false);
  const [guidedFlowData, setGuidedFlowData] = useState<{
    category?: string;
    platform?: string;
    briefData?: BriefData;
    targetAdDurationSeconds?: number;
    creationMode?: 'avatar' | 'storyboard';
    avatarId?: string;
    avatarName?: string;
    avatarReferenceImages?: string[];
  }>({});

  // Derived: is setup wizard data sufficient to skip Brand Brief in TOW?
  const hasSetupBrief = Boolean(
    guidedFlowData.briefData?.business_brief?.trim()
  );
  const [showCreationMethodModal, setShowCreationMethodModal] = useState(false);
  const [localState, setLocalState] = useState<WorkflowState>('initialized');
  const [isResumingProject, setIsResumingProject] = useState(false);
  const [lastResumeAttemptId, setLastResumeAttemptId] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const { project, loading, error, initializeProject, getProject, startProduction } = useStoryboardProject();
  const { productionStatus, isPolling, startPolling, stopPolling } = useProductionPolling(project?.id);
  const { avatars, loading: avatarLoading, error: avatarError, loadAvatarLibrary } = useAvatarLibrary(userId);

  useEffect(() => {
    if (!project?.id) return;
    const state = String(project.workflow_state || '').toLowerCase();
    if (!(state === 'production_starting' || state === 'production_in_progress')) return;
    const timer = setInterval(() => {
      console.log('[page.tsx] storyboard_production_poll_tick', { projectId: project.id, workflowState: state });
      void getProject(project.id);
    }, 4000);
    return () => clearInterval(timer);
  }, [project?.id, project?.workflow_state, getProject]);

  useEffect(() => {
    console.log('[StoryAdPage] state_snapshot', {
      projectId: project?.id ?? null,
      workflowState: project?.workflow_state ?? null,
      isResumingProject,
      loading,
      localState,
      guidedFlowStep,
      testMode,
    });
  }, [project?.id, project?.workflow_state, isResumingProject, loading, localState, guidedFlowStep, testMode]);

  // Initialize client-side flag and get userId
  useEffect(() => {
    setIsClient(true);
    const storedUserId = getCurrentUserId();
    if (storedUserId) {
      setUserId(storedUserId);
    }
  }, []);

  // Save project ID to localStorage when project is created/updated
  useEffect(() => {
    if (project?.id && isClient) {
      localStorage.setItem(STORAGE_KEY, project.id);
    }
  }, [project?.id, isClient]);

  // Handle project resumption from URL parameter or localStorage
  useEffect(() => {
    if (!isClient) return;

    const projectIdToResume = projectIdParam || localStorage.getItem(STORAGE_KEY);

    if (!projectIdToResume) {
      return;
    }

    // If the URL/localStorage project is already hydrated, clear resume mode.
    if (project?.id === projectIdToResume) {
      if (isResumingProject) {
        setIsResumingProject(false);
      }
      return;
    }

    // Avoid duplicate fetch loops for the same project id.
    if (isResumingProject || lastResumeAttemptId === projectIdToResume) {
      return;
    }

    setIsResumingProject(true);
    setLastResumeAttemptId(projectIdToResume);

    getProject(projectIdToResume)
      .then((loadedProject) => {
        if (loadedProject) {
          setLocalState(loadedProject.workflow_state as WorkflowState);
        }
      })
      .catch((err) => console.error('Failed to resume project:', err))
      .finally(() => {
        setIsResumingProject(false);
      });
  }, [projectIdParam, isResumingProject, project?.id, getProject, isClient, lastResumeAttemptId]);

  // Handle category selection
  const handleCategorySelect = (categoryId: string) => {
    setGuidedFlowData(prev => ({ ...prev, category: categoryId }));
    setShowCreationMethodModal(true);
  };

  // Handle creation method selection
  const handleCreationMethodSelect = (method: 'avatar' | 'storyboard') => {
    // Set the creation mode for the entire flow
    setCreationMode(method);
    setGuidedFlowData(prev => ({ ...prev, creationMode: method }));
    // For avatar mode, show avatar picker; for storyboard, go directly to step1
    setShowCreationMethodModal(false);
    if (method === 'avatar') {
      setGuidedFlowStep('avatar-selection');
      // Load avatars when showing avatar picker
      loadAvatarLibrary();
    } else {
      setGuidedFlowStep('step1');
    }
  };

  // Handle avatar selection
  const handleAvatarSelected = (avatarId: string, avatarName: string, avatarReferenceImages: string[] = []) => {
    setGuidedFlowData(prev => ({ ...prev, avatarId, avatarName, avatarReferenceImages }));
    // Move to step1 (platform selection)
    setGuidedFlowStep('step1');
  };

  // Handle guided flow navigation
  const handleStep1Next = (_category: string, platform: string, durationSeconds: number) => {
    // Category is already set from CategorySelection — Step1 only captures platform.
    setGuidedFlowData(prev => ({ ...prev, platform, targetAdDurationSeconds: durationSeconds }));
    setGuidedFlowStep('step2');
  };

  const handleStep2Next = (briefData: BriefData) => {
    setGuidedFlowData(prev => ({
      ...prev,
      briefData: {
        ...briefData,
        target_ad_duration_seconds: prev.targetAdDurationSeconds || 15,
      } as BriefData,
    }));
    setGuidedFlowStep('step3');
  };

  const handleStep2Back = () => {
    setGuidedFlowStep('step1');
  };

  const handleStep3Generate = async () => {
    if (!guidedFlowData.category || !guidedFlowData.platform || !guidedFlowData.briefData || !creationMode) {
      alert('Missing form data');
      return;
    }

    // Show test mode selector
    setShowTestModeSelector(true);
  };

  const handleTestModeSelected = async (mode: 'real' | 'mock') => {
    console.log('HANDLE TEST MODE SELECTED FIRED', mode);
    setTestMode(mode);
    // When setup wizard has already collected a brief, skip TOW Stage 1 (Brand Brief)
    // and start directly at Stage 2 (Project State Pack).
    // Only show brief_collecting when there is no setup data.
    const startState = hasSetupBrief
    ? 'project_state_pack_generating'
    : 'brief_collecting';
    setLocalState(startState);
    setShowTestModeSelector(false);

    // Store test mode in session storage for use in components
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('testMode', mode);
      console.log('[StoryAd] selected mode:', mode);
      console.log('[StoryAd] stored mode:', sessionStorage.getItem('testMode'));
    }

    if (!guidedFlowData.category || !guidedFlowData.platform || !guidedFlowData.briefData || !creationMode) {
      alert('Missing form data');
      return;
    }
    const requiresProductReference = creationMode === 'avatar' || guidedFlowData.category === 'product_demo_lifestyle';
    if (mode === 'real' && requiresProductReference && !guidedFlowData.briefData.product_image_url) {
      alert('Upload a product reference image before starting real generation.');
      return;
    }

    const input: InitializeProjectInput = {
      ad_category: guidedFlowData.category,
      business_brief: guidedFlowData.briefData.business_brief,
      platform: guidedFlowData.platform,
      tone: guidedFlowData.briefData.tone,
      language: 'en',
      creation_mode: creationMode,
      production_path: creationMode === 'avatar' ? 'ai_avatar' : 'storyboard',
      avatar_id: guidedFlowData.avatarId,
      avatar_name: guidedFlowData.avatarName,
      product_image_url: guidedFlowData.briefData.product_image_url,
      product_reference_images: guidedFlowData.briefData.product_reference_images || [],
      avatar_reference_images: guidedFlowData.avatarReferenceImages || [],
      target_ad_duration_seconds: guidedFlowData.targetAdDurationSeconds || 15,
    };
    console.log('[StoryAdPage] initialize payload avatar context', {
      avatar_id: input.avatar_id,
      avatar_name: input.avatar_name,
      avatar_reference_images_count: input.avatar_reference_images?.length || 0,
      production_path: input.production_path,
      creation_mode: input.creation_mode,
    });

    try {
      await initializeProject(input);
      markOnboardingComplete('create_ugc_ad');
      // After initialization, the page will show the workflow checkpoints
    } catch (err) {
      console.error('Error initializing project:', err);
    }
  };

  const handleStep3Back = () => {
    setGuidedFlowStep('step2');
  };

  // Clear project and restart workflow
  const handleRestartWorkflow = () => {
    localStorage.removeItem(STORAGE_KEY);
    setGuidedFlowStep('category');
    setCreationMode(null);
    setGuidedFlowData({
      // Reset all guided flow data
    });
    setShowCreationMethodModal(false);
    setLocalState('initialized');
    setIsResumingProject(false);
    // Also clear the project state
    window.location.href = '/story-ad?step=category';
  };

  // Start fresh (clear localStorage and restart)
  const handleStartFresh = () => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.href = '/story-ad?step=category';
  };

  // Handle checkpoint approvals with proper async refresh
  const handleScriptApprove = async () => {
    console.log('[page.tsx] Script approved → Character Lock');
    // TOW: script → character lock → scene breakdown → images
    if (isMockMode) { setLocalState('character_lock_selecting'); return; }
    if (!project?.id) return;
    const updated = await getProject(project.id);
    console.log('[page.tsx] Project refreshed after script approval:', updated?.workflow_state);
    if (updated?.workflow_state) setLocalState(updated.workflow_state as WorkflowState);
  };

  const handleStoryboardApprove = async () => {
    console.log('[page.tsx] Scene Breakdown approved → Image generation');
    // TOW: scene breakdown (storyboard) → base images
    if (isMockMode) { setLocalState('images_awaiting_approval'); return; }
    if (!project?.id) return;
    const updated = await getProject(project.id);
    console.log('[page.tsx] Project refreshed after storyboard approval:', updated?.workflow_state);
    if (updated?.workflow_state) setLocalState(updated.workflow_state as WorkflowState);
  };

  const handleImageApprove = async () => {
    console.log('[page.tsx] images approved');

    if (isMockMode) {
      // TOW flow: images → video_prompts (not directly to production)
      setLocalState('video_prompts_generating');
      return;
    }

    if (!project?.id) return;

    const updated = await getProject(project.id);
    console.log('[page.tsx] Project refreshed after image approval:', updated?.workflow_state);

    if (updated?.workflow_state) {
      const nextState = updated.workflow_state as WorkflowState;
      if (nextState === 'images_approved') {
        console.log('[page.tsx] motion generation started', { projectId: project.id });
        setLocalState('video_prompts_generating');
        return;
      }
      setLocalState(nextState);
    }
  };

  const handleVoiceSelect = async () => {
    console.log('[page.tsx] storyboard_voice_confirm_clicked', {
      projectId: project?.id || null,
      workflowState: project?.workflow_state || null,
    });
    if (isMockMode) {
      // TOW: voice → production → (auto) → QC
      setLocalState('production_in_progress');
      setTimeout(() => setLocalState('qc_awaiting_approval'), 2500);
      return;
    }
    if (!project?.id) return;
    console.log('[page.tsx] storyboard_production_start_requested', { projectId: project.id });
    const updated = await getProject(project?.id || '');
    console.log('[page.tsx] storyboard_production_start_response', {
      projectId: project.id,
      workflowState: updated?.workflow_state || null,
    });
    console.log('[page.tsx] storyboard_project_status_after_voice_confirm', {
      projectId: project.id,
      workflowState: updated?.workflow_state || null,
    });
    if (updated?.workflow_state) setLocalState(updated.workflow_state as WorkflowState);
  };

  // ── TOW Handlers (correct semantic order) ────────────────────────────────
  //
  // TOW Flow:
  //   brief_collecting → [PSP generating] → PSP awaiting → [Foundation gen]
  //   → Foundation awaiting → Format selecting → [Script gen after format locked]
  //   → Script awaiting → Character Lock → [Scene Breakdown gen]
  //   → Scene Breakdown awaiting → [Images gen] → Images awaiting
  //   → [Video Prompts gen] → Video Prompts awaiting → Voice selection
  //   → Production → QC → Final Packaging → Completed

  const handleBriefApprove = async (_briefData: import('./hooks/useStoryboardProject').BriefData) => {
    console.log('[page.tsx] Brief approved → generating Project State Pack');
    if (isMockMode) { setLocalState('project_state_pack_awaiting_approval'); return; }
    if (!project?.id) return;
    const updated = await getProject(project.id);
    if (updated?.workflow_state) setLocalState(updated.workflow_state as WorkflowState);
  };

  const handleProjectStatePackApprove = async () => {
    console.log('[page.tsx] PSP confirmed → generating Foundation');
    if (isMockMode) { setLocalState('foundation_awaiting_approval'); return; }
    if (!project?.id) return;
    const updated = await getProject(project.id);
    if (updated?.workflow_state) setLocalState(updated.workflow_state as WorkflowState);
  };

  const handleFoundationApprove = async () => {
    console.log('[page.tsx] Foundation approved → Format Decision');
    if (isMockMode) { setLocalState('format_selecting'); return; }
    if (!project?.id) return;
    const updated = await getProject(project.id);
    if (updated?.workflow_state) setLocalState(updated.workflow_state as WorkflowState);
  };

  const handleFormatApprove = async (_decision: import('./hooks/useStoryboardProject').FormatDecision) => {
    console.log('[page.tsx] Format locked → generating Script');
    // After format is locked, we generate the script using the chosen path template
    if (isMockMode) { setLocalState('script_awaiting_approval'); return; }
    if (!project?.id) return;
    const updated = await getProject(project.id);
    if (updated?.workflow_state) setLocalState(updated.workflow_state as WorkflowState);
  };

  const handleCharacterLockApprove = async () => {
    console.log('[page.tsx] Character locked → generating Scene Breakdown');
    // After character lock, scene breakdown (storyboard) is generated
    if (isMockMode) { setLocalState('storyboard_awaiting_approval'); return; }
    if (!project?.id) return;
    const updated = await getProject(project.id);
    const nextState = updated?.workflow_state as WorkflowState | undefined;
    if (nextState) {
      // Safety fallback: if backend has not advanced this stage yet,
      // allow user to proceed to storyboard checkpoint in real mode.
      if (nextState === 'character_lock_selecting' || nextState === 'script_approved') {
        console.warn('[page.tsx] Character lock approve did not advance backend state; applying UI fallback to storyboard_awaiting_approval', {
          nextState,
          projectId: project.id,
        });
        setLocalState('storyboard_awaiting_approval');
        return;
      }

      setLocalState(nextState);
    } else {
      setLocalState('storyboard_awaiting_approval');
    }
  };

  const handleVideoPromptsApprove = async () => {
    console.log('[page.tsx] motion plan approved');
    if (isMockMode) { setLocalState('video_prompts_approved'); return; }
    if (!project?.id) return;
    const updated = await getProject(project.id);
    const nextState = updated?.workflow_state as WorkflowState | undefined;
    if (nextState === 'video_prompts_approved' || nextState === 'voice_approved' || nextState === 'production_in_progress') {
      setLocalState(nextState);
      console.log('[page.tsx] motion plan approved resulting state', {
        localState: nextState,
        workflowState: updated?.workflow_state,
      });
      return;
    }
    // Backend may not yet persist a dedicated Stage 9 state; force forward UI transition.
    setLocalState('video_prompts_approved');
    console.log('[page.tsx] motion plan approved resulting state', {
      localState: 'video_prompts_approved',
      workflowState: updated?.workflow_state || null,
    });
  };

  const handleQCApprove = async () => {
    console.log('[page.tsx] QC approved → Final Packaging');
    if (isMockMode) { setLocalState('final_packaging'); return; }
    if (!project?.id) return;
    const updated = await getProject(project.id);
    if (updated?.workflow_state) setLocalState(updated.workflow_state as WorkflowState);
  };

  const handleFinalPackagingApprove = async () => {
    console.log('[page.tsx] Final Packaging approved → Completed');
    if (isMockMode) { setLocalState('completed'); return; }
    if (!project?.id) return;
    const updated = await getProject(project.id);
    if (updated?.workflow_state) setLocalState(updated.workflow_state as WorkflowState);
  };

  // Handle back navigation in workflow
  const handleBackToScript = async () => {
    console.log('[page.tsx] Back to script clicked');
  
    if (isMockMode) {
      setLocalState('script_awaiting_approval');
      return;
    }
  
    if (project?.id) {
      setLocalState('script_awaiting_approval');
    }
  };

  const handleBackToStoryboard = async () => {
    console.log('[page.tsx] Back to storyboard clicked');
  
    if (isMockMode) {
      setLocalState('storyboard_awaiting_approval');
      return;
    }
  
    if (project?.id) {
      console.log('[page.tsx] storyboard_back_to_scene_plan_clicked', { projectId: project.id });
      const refreshed = await getProject(project.id);
      const sceneCount = Array.isArray((refreshed as any)?.scenes) ? (refreshed as any).scenes.length : 0;
      console.log('[page.tsx] storyboard_back_to_scene_plan_project_scene_count', {
        projectId: project.id,
        sceneCount,
      });
      console.log('[page.tsx] storyboard_back_to_scene_plan_workflow_state', {
        projectId: project.id,
        workflowState: (refreshed as any)?.workflow_state || project.workflow_state,
      });
      setLocalState('storyboard_awaiting_approval');
    }
  };

  // Determine current checkpoint based on workflow state
  const getCurrentCheckpoint = () => {
    // Show loading while resuming project from URL
    if (isResumingProject && loading) {
      return (
        <div className="flex items-center justify-center min-h-[500px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: `hsl(var(--color-primary))` }}></div>
            <p className="font-semibold" style={{ color: `hsl(var(--color-muted))` }}>Resuming your project...</p>
          </div>
        </div>
      );
    }

    // Show guided flow if no project created yet
    if (!project) {
      // Show category selection if at category step
      if (guidedFlowStep === 'category') {
        return <CategorySelection onSelectCategory={handleCategorySelect} />;
      }

      // Show avatar picker if at avatar-selection step
      if (guidedFlowStep === 'avatar-selection') {
        return (
          <div className="flex items-center justify-center min-h-[500px]">
            {/* Avatar picker modal will be shown via Modal overlay */}
          </div>
        );
      }

      // Show StoryAdForm for the unified 3-step workflow
      if (guidedFlowStep === 'step1' || guidedFlowStep === 'step2' || guidedFlowStep === 'step3') {
        const handleStoryAdFormComplete = async (formData: any) => {
          setGuidedFlowData(prev => ({
            ...prev,
            category: formData.category,
            platform: formData.platform,
            targetAdDurationSeconds: formData.targetAdDurationSeconds,
            briefData: formData.briefData,
            creationMode: formData.creationMode,
          }));
          // Show test mode selector
          setShowTestModeSelector(true);
        };

        return (
          <StoryAdForm
            preselectedCategory={guidedFlowData.category ?? 'ugc_testimonial'}
            onComplete={handleStoryAdFormComplete}
            estimatedCost={50}
          />
        );
      }
    }

    if (!project) {
      return null;
    }

    const projectWorkflowState = (project.workflow_state || '').toLowerCase();
    const localWorkflowState = (localState || '').toLowerCase();
    const workflowState = isMockMode
      ? localWorkflowState
      : (
          localWorkflowState &&
          localWorkflowState !== 'initialized' &&
          localWorkflowState !== projectWorkflowState
            ? localWorkflowState
            : projectWorkflowState
        );

    // In mock mode: enrich the project with setup-wizard data so every checkpoint
    // has access to avatar name, ad category, platform, tone, language, brief text,
    // and production path — without needing to re-ask the user.
    const checkpointProject = isMockMode
      ? {
          ...project,
          workflow_state: workflowState,
          // Setup-wizard overrides (prefer local state over project defaults)
          ad_category: guidedFlowData.category ?? project.ad_category,
          platform: guidedFlowData.platform ?? project.platform,
          tone: guidedFlowData.briefData?.tone ?? project.tone,
          language: project.language,
          business_brief: guidedFlowData.briefData?.business_brief ?? project.business_brief,
          product_image_url: guidedFlowData.briefData?.product_image_url ?? project.product_image_url,
          product_reference_images: guidedFlowData.briefData?.product_reference_images ?? project.product_reference_images,
          avatar_id: guidedFlowData.avatarId ?? project.avatar_id,
          avatar_name: guidedFlowData.avatarName ?? project.avatar_name,
          avatar_reference_images: guidedFlowData.avatarReferenceImages ?? project.avatar_reference_images,
          creation_mode: (guidedFlowData.creationMode ?? project.creation_mode) as 'avatar' | 'storyboard' | undefined,
          production_path: guidedFlowData.creationMode === 'avatar' ? 'ai_avatar' : 'storyboard' as 'ai_avatar' | 'storyboard',
        }
      : project;

    // ─────────────────────────────────────────────────────────────────────
    // TOW Routing — Correct Semantic Order:
    //
    //  Stage 1:  brief_collecting          → BriefCheckpoint
    //  Stage 2:  project_state_pack_*      → ProjectStatePackCheckpoint
    //  Stage 3:  foundation_*              → FoundationCheckpoint (strategy only)
    //  Stage 4:  format_selecting          → FormatDecisionCheckpoint (format confirmation)
    //  Stage 5:  script_awaiting_approval  → ScriptCheckpoint  ← AFTER format
    //  Stage 6:  character_lock_*          → CharacterLockCheckpoint ← AFTER script
    //  Stage 7:  storyboard_*              → StoryboardCheckpoint ("Scene Breakdown" — text-only)
    //  Stage 8:  images_*                  → ImageCheckpoint ("Visual Storyboard" — image frames)
    //  Stage 9:  video_prompts_*           → VideoPromptCheckpoint ("Motion Planning" — no video yet)
    //  Stage 10: video_prompts_approved    → VoiceSelector
    //  Stage 11: production_*              → ProductionStatus
    //  Stage 12: qc_*                      → QCCheckpoint
    //  Stage 13: final_packaging / qc_approved → FinalPackagingCheckpoint
    // ─────────────────────────────────────────────────────────────────────

    // Stage 1: Brand Brief
    if (workflowState === 'brief_collecting' || workflowState === 'brief_approved') {
      return (
        <BriefCheckpoint
          project={checkpointProject}
          onApprove={handleBriefApprove}
        />
      );
    }

    // Stage 2: Project State Pack (memory/save-file — NOT brand extraction)
    if (
      workflowState === 'project_state_pack_generating' ||
      workflowState === 'project_state_pack_awaiting_approval'
    ) {
      return (
        <ProjectStatePackCheckpoint
          project={checkpointProject}
          onApprove={handleProjectStatePackApprove}
          // Back goes to brief only if we actually showed brief (no setup data means brief was shown)
          onBack={hasSetupBrief ? undefined : () => setLocalState('brief_collecting')}
        />
      );
    }

    // Stage 3: Foundation (strategy only — AD DNA, Avatar, Angle, Summary)
    if (
      workflowState === 'project_state_pack_approved' ||
      workflowState === 'foundation_generating' ||
      workflowState === 'foundation_awaiting_approval'
    ) {
      return (
        <FoundationCheckpoint
          project={checkpointProject}
          onApprove={handleFoundationApprove}
          onBack={() => setLocalState('project_state_pack_awaiting_approval')}
        />
      );
    }

    // Stage 4: Format Decision (6 ad format types → select one → determines script template)
    if (workflowState === 'foundation_approved' || workflowState === 'format_selecting') {
      return (
        <FormatDecisionCheckpoint
          project={checkpointProject}
          onApprove={handleFormatApprove}
          onBack={() => setLocalState('foundation_awaiting_approval')}
        />
      );
    }

    // Stage 5: Script — AFTER format decision, uses chosen narrative path template
    // (format_approved transitions immediately to script_awaiting_approval in handlers)
    if (
      workflowState === 'format_approved' ||
      workflowState === 'initialized' ||           // legacy / real-mode entry point
      workflowState === 'script_generating' ||
      workflowState === 'script_awaiting_approval'
    ) {
      return (
        <ScriptCheckpoint
          project={checkpointProject}
          onApprove={handleScriptApprove}
          canGoBack={workflowState !== 'initialized'}
          onBack={() => setLocalState('format_selecting')}
        />
      );
    }

    // Stage 6: Character / Face Lock — AFTER script, BEFORE scene breakdown
    if (
      workflowState === 'script_approved' ||
      workflowState === 'character_lock_selecting'
    ) {
      return (
        <CharacterLockCheckpoint
          project={checkpointProject}
          onApprove={handleCharacterLockApprove}
          onBack={handleBackToScript}
        />
      );
    }

    // Stage 7: Scene Breakdown (StoryboardCheckpoint) — AFTER character lock
    if (
      workflowState === 'character_lock_approved' ||
      workflowState === 'storyboard_generating' ||
      workflowState === 'storyboard_awaiting_approval'
    ) {
      return (
        <StoryboardCheckpoint
          project={checkpointProject}
          onApprove={handleStoryboardApprove}
          onBack={() => setLocalState('character_lock_selecting')}
          canGoBack={true}
        />
      );
    }

    // Stage 8: Base Image generation and approval
    if (
      workflowState === 'storyboard_approved' ||
      workflowState === 'images_generating' ||
      workflowState === 'images_awaiting_approval' ||
      workflowState === 'images_generated'
    ) {
      return (
        <ImageCheckpoint
          project={checkpointProject}
          onApprove={handleImageApprove}
          onBack={handleBackToStoryboard}
          canGoBack={true}
        />
      );
    }

    // Stage 9: Video Motion Prompts — AFTER images, derived from approved base images
    if (
      workflowState === 'images_approved' ||
      workflowState === 'video_prompts_generating' ||
      workflowState === 'video_prompts_awaiting_approval'
    ) {
      return (
        <VideoPromptCheckpoint
          project={checkpointProject}
          onApprove={handleVideoPromptsApprove}
          onBack={() => setLocalState('images_awaiting_approval')}
        />
      );
    }

    // Stage 10: Voice Selection — AFTER video prompts, BEFORE production
    if (workflowState === 'video_prompts_approved' || workflowState === 'voice_approved' || workflowState === 'voice_confirmed') {
      return (
        <VoiceSelector
          project={checkpointProject}
          onSelect={handleVoiceSelect}
          onBackToScript={() => setLocalState('script_awaiting_approval')}
        />
      );
    }

    // Stage 11A: Production starting (explicit visible state, never blank)
    if (workflowState === 'production_starting' || workflowState === 'production_failed') {
      const updatedAtMs = Date.parse(String(checkpointProject.updated_at || ''));
      const staleWarning = Number.isFinite(updatedAtMs) ? (Date.now() - updatedAtMs) > (3 * 60 * 1000) : false;
      return (
        <ProductionStartingCheckpoint
          project={checkpointProject}
          staleWarning={staleWarning}
          productionError={(checkpointProject as any).production_error || null}
          onRefresh={async () => {
            if (!project?.id) return;
            console.log('[page.tsx] storyboard_production_poll_tick', { projectId: project.id, stage: 'production_starting_refresh' });
            const updated = await getProject(project.id);
            if (updated?.workflow_state) setLocalState(updated.workflow_state as WorkflowState);
          }}
          onBackToVoice={async () => {
            if (!project?.id) {
              setLocalState('video_prompts_approved');
              return;
            }
            const refreshed = await getProject(project.id);
            const state = String(refreshed?.workflow_state || '').toLowerCase();
            if (state === 'production_starting') {
              setLocalState('video_prompts_approved');
            }
          }}
          onTryAgain={async () => {
            if (!project?.id) return;
            console.log('[page.tsx] storyboard_production_retry_clicked', { projectId: project.id });
            await startProduction(project.id);
            const updated = await getProject(project.id);
            if (updated?.workflow_state) setLocalState(updated.workflow_state as WorkflowState);
          }}
        />
      );
    }

    // Stage 11: Production
    if (
      workflowState === 'production_in_progress' ||
      workflowState === 'production_completed'
    ) {
      return <ProductionStatus project={checkpointProject} productionStatus={productionStatus} />;
    }

    // Stage 12: QC — AFTER production
    if (workflowState === 'qc_in_progress' || workflowState === 'qc_awaiting_approval') {
      return (
        <QCCheckpoint
          project={checkpointProject}
          onApprove={handleQCApprove}
          onBack={() => setLocalState('production_in_progress')}
        />
      );
    }

    // Stage 13: Final Packaging — AFTER QC
    if (workflowState === 'qc_approved' || workflowState === 'final_packaging') {
      return (
        <FinalPackagingCheckpoint
          project={checkpointProject}
          onApprove={handleFinalPackagingApprove}
          onStartNewProject={handleRestartWorkflow}
        />
      );
    }

    // Legacy final states
    if (workflowState === 'final_awaiting_approval' || workflowState === 'final_video_ready') {
      return (
        <FinalPreview
          project={checkpointProject}
          onApprove={() => getProject(project.id)}
          onStartNewProject={handleRestartWorkflow}
        />
      );
    }

    if (workflowState === 'completed') {
      return (
        <div className="space-y-6">
          <div className="p-8 rounded-2xl border" style={{ backgroundColor: `hsl(var(--color-success) / 0.08)`, borderColor: `hsl(var(--color-success) / 0.3)` }}>
            <h2 className="text-2xl font-bold" style={{ color: `hsl(var(--color-success))` }}>🎉 Your Ad is Complete!</h2>
            <p className="mt-2" style={{ color: `hsl(var(--color-success))` }}>All 13 TOW stages completed. Your ad has been packaged and delivered.</p>
            <div className="mt-6 flex gap-3">
              {project.final_video_url && (
                <a
                  href={normalizeApiMediaUrl(project.final_video_url) || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-6 py-2 rounded-lg font-medium text-white transition" style={{ backgroundColor: `hsl(var(--color-success))` }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `hsl(var(--color-success) / 0.85)`} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = `hsl(var(--color-success))`}
                >
                  ⬇️ Download Video
                </a>
              )}
              <button
                onClick={handleRestartWorkflow}
                className="inline-block text-white px-6 py-2 rounded-lg font-medium transition" style={{ backgroundColor: `hsl(var(--color-primary))` }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `hsl(var(--color-primary) / 0.85)`} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = `hsl(var(--color-primary))`}
              >
                ✨ Create Another Ad
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-3xl mx-auto rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h3 className="text-lg font-semibold text-amber-900">Unsupported storyboard status</h3>
        <p className="mt-2 text-sm text-amber-800">Current status: {workflowState || 'unknown'}</p>
        <p className="mt-1 text-xs text-amber-700">Project ID: {checkpointProject.id}</p>
        <div className="mt-4 flex gap-3">
          <button
            className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
            onClick={() => { if (project?.id) void getProject(project.id); }}
          >
            Refresh
          </button>
          <button
            className="px-4 py-2 rounded-lg border border-amber-400 text-amber-900 text-sm font-medium hover:bg-amber-100"
            onClick={handleStartFresh}
          >
            Start Over
          </button>
        </div>
      </div>
    );
  };

  const isMockMode = testMode === 'mock';

  const selectedCategory = guidedFlowData.category ? CATEGORY_MAP[guidedFlowData.category] : null;

  const activeProjectForUi = project
  ? {
      ...project,
      workflow_state: isMockMode
        ? localState.toLowerCase()
        : project.workflow_state || 'initialized',
    }
  : null;
  const hideCreditEstimateDuringProduction = Boolean(
    activeProjectForUi &&
    ['production_starting', 'production_in_progress', 'production_completed', 'qc_ready', 'package_ready'].includes(
      String(activeProjectForUi.workflow_state || '').toLowerCase(),
    ),
  );


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Test Mode Selector Modal */}
      <TestModeSelector
        open={showTestModeSelector}
        onSelectMode={handleTestModeSelected}
      />

      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold" style={{ color: `hsl(var(--color-text))` }}>Storyboard Ad Creator</h1>
              <p className="mt-1" style={{ color: `hsl(var(--color-muted))` }}>
                Create multi-scene ads with AI in 5 checkpoints
              </p>
            </div>
            <div className="flex gap-2">
              {(isResumingProject || project) && (
                <button
                  onClick={handleStartFresh}
                  className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors" style={{ backgroundColor: `hsl(var(--color-error))` }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `hsl(var(--color-error) / 0.85)`} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = `hsl(var(--color-error))`}
                  title="Clear saved project and start fresh"
                >
                  🗑️ Start Fresh
                </button>
              )}
              {project && (
                <button
                  onClick={handleRestartWorkflow}
                  className="px-4 py-2 text-sm font-medium rounded-lg transition-colors" style={{ color: `hsl(var(--color-text))`, backgroundColor: `hsl(var(--color-surface))` }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `hsl(var(--color-elevated))`} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = `hsl(var(--color-surface))`}
                >
                  ↻ Start Over
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Workflow Progress Indicator */}
        {project && (
          <div className="mb-8 rounded-lg shadow-sm p-4 border glass-card">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { label: 'PSP', states: ['project_state_pack'] },
                  { label: 'Foundation', states: ['foundation'] },
                  { label: 'Format', states: ['format_select', 'format_approv'] },
                  { label: 'Script', states: ['script'] },
                  { label: 'Char Lock', states: ['character_lock'] },
                  { label: 'Scene Plan', states: ['storyboard_await'] },
                  { label: 'Storyboard', states: ['storyboard_approv', 'images'] },
                  { label: 'Motion', states: ['video_prompts_generating', 'video_prompts_awaiting_approval', 'video_prompts_approved', 'voice_approved', 'voice_confirmed', 'production_starting', 'production_in_progress'] },
                  { label: 'Voice', states: ['voice', 'video_prompts_approved', 'voice_approved', 'voice_confirmed', 'production_starting', 'production_in_progress'] },
                  { label: 'Production', states: ['production_starting', 'production_in_progress', 'production_completed'] },
                  { label: 'QC', states: ['qc'] },
                  { label: 'Package', states: ['final_packag', 'qc_approv'] },
                ].map(({ label, states }) => {
                  const stateStr = localState ?? '';
                  const isActive = states.some((s) => stateStr.includes(s));
                  const isMotionDone = [
                    'video_prompts_approved',
                    'voice_approved',
                    'voice_confirmed',
                    'production_starting',
                    'production_in_progress',
                    'production_completed',
                    'qc_in_progress',
                    'qc_awaiting_approval',
                    'qc_approved',
                    'final_packaging',
                    'completed',
                  ].some((s) => stateStr.includes(s));
                  const isVoiceDone = [
                    'voice_confirmed',
                    'production_starting',
                    'production_in_progress',
                    'production_completed',
                    'qc_in_progress',
                    'qc_awaiting_approval',
                    'qc_approved',
                    'final_packaging',
                    'completed',
                  ].some((s) => stateStr.includes(s));
                  const stateOrder = ['project_state_pack', 'foundation', 'format', 'script', 'character_lock', 'storyboard', 'images', 'video_prompts', 'voice', 'production', 'qc', 'final_packag', 'qc_approv', 'completed'];
                  const currentIdx = stateOrder.findIndex((s) => stateStr.includes(s));
                  const myIdx = stateOrder.findIndex((s) => states.some((ms) => s.includes(ms.replace('_await', '').replace('_approv', '').replace('_select', ''))));
                  let isDone = myIdx >= 0 && currentIdx > myIdx;
                  if (label === 'Motion') isDone = isMotionDone && !isActive;
                  if (label === 'Voice') isDone = isVoiceDone && !isActive;
                  if (label === 'Motion') {
                    const motionDoneStates = ['video_prompts_approved', 'voice_approved', 'voice_confirmed', 'production_starting', 'production_in_progress', 'production_completed', 'qc_', 'final_packag', 'completed'];
                    const motionActiveStates = ['video_prompts_generating', 'video_prompts_awaiting_approval'];
                    const motionDone = motionDoneStates.some((s) => stateStr.includes(s));
                    const motionActive = motionActiveStates.some((s) => stateStr.includes(s));
                    isDone = motionDone;
                    if (motionDone) {
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    }
                    if (motionDone && !motionActive) {
                      // active should be false once approved and voice/production begins
                    }
                  }
                  let overrideActive = isActive;
                  if (label === 'Motion') {
                    overrideActive = ['video_prompts_generating', 'video_prompts_awaiting_approval'].some((s) => stateStr.includes(s));
                    if (['video_prompts_approved', 'voice_approved', 'voice_confirmed', 'production_starting', 'production_in_progress', 'production_completed', 'qc_', 'final_packag', 'completed'].some((s) => stateStr.includes(s))) {
                      isDone = true;
                      overrideActive = false;
                    }
                  }
                  if (label === 'Voice') {
                    overrideActive = ['video_prompts_approved', 'voice_approved', 'voice_confirmed'].some((s) => stateStr.includes(s));
                    if (['production_starting', 'production_in_progress', 'production_completed', 'qc_', 'final_packag', 'completed'].some((s) => stateStr.includes(s))) {
                      isDone = true;
                      overrideActive = false;
                    }
                  }
                  if (label === 'Production') {
                    overrideActive = ['production_starting', 'production_in_progress'].some((s) => stateStr.includes(s));
                    if (['production_completed', 'qc_', 'final_packag', 'completed'].some((s) => stateStr.includes(s))) {
                      isDone = true;
                      overrideActive = false;
                    }
                  }
                  let bgColor, textColor;
                  if (overrideActive) {
                    bgColor = `hsl(var(--color-primary) / 0.1)`;
                    textColor = `hsl(var(--color-primary))`;
                  } else if (isDone) {
                    bgColor = `hsl(var(--color-success) / 0.1)`;
                    textColor = `hsl(var(--color-success))`;
                  } else {
                    bgColor = `hsl(var(--color-surface))`;
                    textColor = `hsl(var(--color-muted))`;
                  }
                  return (
                    <span key={label} className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: bgColor, color: textColor }}>
                      {isDone ? '✓ ' : overrideActive ? '● ' : '○ '}{label}
                    </span>
                  );
                })}
              </div>
              <span className="text-xs font-medium tabular-nums" style={{ color: `hsl(var(--color-text-secondary))` }}>
                {isMockMode ? localState : project.workflow_state}
              </span>
            </div>
          </div>
        )}

        {/* Show loading when resuming project from URL */}
        {isResumingProject && loading && (
          <div className="mb-6 p-4 rounded-lg border" style={{ backgroundColor: `hsl(var(--color-primary) / 0.08)`, borderColor: `hsl(var(--color-primary) / 0.3)`, color: `hsl(var(--color-primary))` }}>
            <p className="font-semibold">📋 Resuming your project...</p>
            <p className="text-sm mt-1">Loading project details...</p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-lg border" style={{ backgroundColor: `hsl(var(--color-error) / 0.08)`, borderColor: `hsl(var(--color-error) / 0.3)`, color: `hsl(var(--color-error))` }}>
            Error: {error}
          </div>
        )}

        {loading && (!project || isResumingProject) ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: `hsl(var(--color-primary))` }}></div>
              <p className="mt-4" style={{ color: `hsl(var(--color-muted))` }}>Loading your project...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Workflow Checkpoint */}
            <div className="mb-12">
              {getCurrentCheckpoint()}
            </div>

            {/* Credit Estimate Bar (sticky footer) */}
            {activeProjectForUi && !hideCreditEstimateDuringProduction ? (
              <CreditEstimate project={activeProjectForUi} />
            ) : null}
          </>
        )}
      </div>

      {/* Creation Method Modal */}
      {selectedCategory && (
        <CreationMethodModal
          open={showCreationMethodModal}
          categoryName={selectedCategory.name}
          requiresAvatar={selectedCategory.requiresAvatar}
          onSelectAvatar={() => handleCreationMethodSelect('avatar')}
          onSelectStoryboard={() => handleCreationMethodSelect('storyboard')}
          onClose={() => {
            setShowCreationMethodModal(false);
            setGuidedFlowData(prev => ({ ...prev, category: undefined }));
          }}
        />
      )}
      

      {/* Avatar Picker Modal */}
      <AvatarPickerModal
        open={guidedFlowStep === 'avatar-selection'}
        avatars={avatars}
        loading={avatarLoading}
        error={avatarError}
        selectedAvatarId={guidedFlowData.avatarId}
        onSelectAvatar={(avatar) => handleAvatarSelected(avatar.id, avatar.name, avatar.referenceImages || [])}
        onClose={() => {
          setGuidedFlowStep('category');
          setGuidedFlowData(prev => ({ ...prev, category: undefined, creationMode: undefined }));
          setCreationMode(null);
        }}
      />
    </div>
  );
}
