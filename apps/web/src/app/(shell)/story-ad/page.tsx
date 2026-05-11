'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useStoryboardProject, InitializeProjectInput } from './hooks/useStoryboardProject';
import { useProductionPolling } from './hooks/useProductionPolling';
import CategorySelection from './components/CategorySelection';
import CreationMethodModal from './components/CreationMethodModal';
import Step1CategoryPlatform from './components/Step1CategoryPlatform';
import Step2BusinessBrief, { BriefData } from './components/Step2BusinessBrief';
import Step3ReviewGenerate from './components/Step3ReviewGenerate';
import ScriptCheckpoint from './components/ScriptCheckpoint';
import StoryboardCheckpoint from './components/StoryboardCheckpoint';
import ImageCheckpoint from './components/ImageCheckpoint';
import VoiceSelector from './components/VoiceSelector';
import ProductionStatus from './components/ProductionStatus';
import FinalPreview from './components/FinalPreview';
import CreditEstimate from './components/CreditEstimate';

type GuidedFlowStep = 'category' | 'step1' | 'step2' | 'step3';

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
  | 'initialized'
  | 'category_selected'
  | 'script_generated'
  | 'script_approved'
  | 'storyboard_generated'
  | 'storyboard_approved'
  | 'images_generated'
  | 'images_approved'
  | 'production_in_progress'
  | 'final_video_ready'
  | 'completed';

export default function StoryAdPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectIdParam = searchParams.get('project_id');
  const initialStep = (searchParams.get('step') as GuidedFlowStep) || 'category';

  const [guidedFlowStep, setGuidedFlowStep] = useState<GuidedFlowStep>(initialStep);
  const [creationMode, setCreationMode] = useState<'avatar' | 'storyboard' | null>(null);
  const [guidedFlowData, setGuidedFlowData] = useState<{
    category?: string;
    platform?: string;
    briefData?: BriefData;
    creationMode?: 'avatar' | 'storyboard';
  }>({});
  const [showCreationMethodModal, setShowCreationMethodModal] = useState(false);
  const [localState, setLocalState] = useState<WorkflowState>('initialized');
  const [isResumingProject, setIsResumingProject] = useState(false);
  const { project, loading, error, initializeProject, getProject } = useStoryboardProject();
  const { productionStatus, isPolling, startPolling, stopPolling } = useProductionPolling(project?.id);

  // Handle project resumption from URL parameter
  useEffect(() => {
    if (projectIdParam && !isResumingProject && !project) {
      setIsResumingProject(true);
      getProject(projectIdParam)
        .then((loadedProject) => {
          if (loadedProject) {
            // Map workflow state to the appropriate UI checkpoint
            const stateCheckpointMap: Record<string, GuidedFlowStep | string> = {
              initialized: 'category',
              category_selected: 'step1',
              script_generated: 'script_generated',
              script_approved: 'storyboard_generated',
              storyboard_generated: 'storyboard_generated',
              storyboard_approved: 'images_generated',
              images_generated: 'images_generated',
              images_approved: 'production_in_progress',
              production_in_progress: 'production_in_progress',
              final_video_ready: 'final_video_ready',
              completed: 'completed',
            };
            const checkpoint = stateCheckpointMap[loadedProject.workflow_state] || 'category';
            setLocalState(loadedProject.workflow_state as WorkflowState);
            // Don't navigate away from the checkpoint UI
          }
        })
        .catch((err) => console.error('Failed to resume project:', err));
    }
  }, [projectIdParam, isResumingProject, project, getProject]);

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
    // Continue to step1 (platform selection) for both avatar and storyboard
    setShowCreationMethodModal(false);
    setGuidedFlowStep('step1');
  };

  // Handle guided flow navigation
  const handleStep1Next = (category: string, platform: string) => {
    setGuidedFlowData(prev => ({ ...prev, category, platform }));
    setGuidedFlowStep('step2');
  };

  const handleStep2Next = (briefData: BriefData) => {
    setGuidedFlowData(prev => ({ ...prev, briefData }));
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

    const input: InitializeProjectInput = {
      ad_category: guidedFlowData.category,
      business_brief: guidedFlowData.briefData.business_brief,
      platform: guidedFlowData.platform,
      language: guidedFlowData.briefData.language,
      tone: guidedFlowData.briefData.tone,
      creation_mode: creationMode, // 'avatar' or 'storyboard'
    };

    try {
      await initializeProject(input);
      // After initialization, the page will show the workflow checkpoints
    } catch (err) {
      console.error('Error initializing project:', err);
    }
  };

  const handleStep3Back = () => {
    setGuidedFlowStep('step2');
  };

  // Determine current checkpoint based on workflow state
  const getCurrentCheckpoint = () => {
    // Show loading while resuming project from URL
    if (isResumingProject && loading) {
      return (
        <div className="flex items-center justify-center min-h-[500px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 font-semibold">Resuming your project...</p>
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

      // Show step1 if step1
      if (guidedFlowStep === 'step1') {
        return <Step1CategoryPlatform onNext={handleStep1Next} />;
      } else if (guidedFlowStep === 'step2' && guidedFlowData.category) {
        return (
          <Step2BusinessBrief
            category={guidedFlowData.category}
            onNext={handleStep2Next}
            onBack={handleStep2Back}
          />
        );
      } else if (guidedFlowStep === 'step3' && guidedFlowData.category && guidedFlowData.platform && guidedFlowData.briefData) {
        return (
          <Step3ReviewGenerate
            category={guidedFlowData.category}
            platform={guidedFlowData.platform}
            briefData={guidedFlowData.briefData}
            onGenerate={handleStep3Generate}
            onBack={handleStep3Back}
            loading={loading}
            estimatedCost={50}
          />
        );
      }
    }

    if (!project) {
      return null;
    }

    const workflowState = project.workflow_state?.toLowerCase();

    // Script generation and approval checkpoint
    if (workflowState?.includes('initialized') || workflowState?.includes('script_awaiting')) {
      return <ScriptCheckpoint project={project} onApprove={() => getProject(project.id)} />;
    }

    // After script approval, generate storyboard
    if (workflowState?.includes('script_approved')) {
      return <StoryboardCheckpoint project={project} onApprove={() => getProject(project.id)} />;
    }

    if (workflowState?.includes('storyboard_awaiting') || workflowState?.includes('storyboard_approved')) {
      return <ImageCheckpoint project={project} onApprove={() => getProject(project.id)} />;
    }

    if (workflowState?.includes('images_approved')) {
      return <VoiceSelector project={project} onSelect={() => getProject(project.id)} />;
    }

    if (workflowState?.includes('production')) {
      return <ProductionStatus project={project} productionStatus={productionStatus} />;
    }

    if (workflowState?.includes('final_awaiting')) {
      return <FinalPreview project={project} onApprove={() => getProject(project.id)} />;
    }

    if (workflowState?.includes('completed')) {
      return (
        <div className="p-8 bg-green-50 border border-green-200 rounded-lg">
          <h2 className="text-2xl font-bold text-green-900">✅ Your Ad is Ready!</h2>
          <p className="text-green-700 mt-2">Your storyboard video has been successfully created.</p>
          {project.final_video_url && (
            <a
              href={project.final_video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
            >
              Download Video
            </a>
          )}
        </div>
      );
    }

    return null;
  };

  const selectedCategory = guidedFlowData.category ? CATEGORY_MAP[guidedFlowData.category] : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Storyboard Ad Creator</h1>
          <p className="text-gray-600 mt-1">
            Create multi-scene ads with AI in 5 checkpoints
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Show loading when resuming project from URL */}
        {isResumingProject && loading && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-700">
            <p className="font-semibold">📋 Resuming your project...</p>
            <p className="text-sm mt-1">Loading project details...</p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            Error: {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
              <p className="mt-4 text-gray-600">Loading your project...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Workflow Checkpoint */}
            <div className="mb-12">
              {getCurrentCheckpoint()}
            </div>

            {/* Credit Estimate Bar (sticky footer) */}
            <CreditEstimate project={project} />
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
    </div>
  );
}
