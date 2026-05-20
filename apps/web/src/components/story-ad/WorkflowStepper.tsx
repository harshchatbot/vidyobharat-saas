'use client';

import {
  Stepper,
  StepperNav,
  StepperItem,
  StepperTrigger,
  StepperIndicator,
  StepperSeparator,
  StepperTitle,
} from '@/components/ui/Stepper';
import { Check, Loader2 } from 'lucide-react';

// Map workflow states to step numbers
const WORKFLOW_STEPS = [
  {
    step: 1,
    label: 'Brief',
    states: ['initialized', 'brief_collecting', 'brief_approved', 'category_selected'],
  },
  {
    step: 2,
    label: 'Foundation',
    states: [
      'project_state_pack_generating',
      'project_state_pack_awaiting_approval',
      'project_state_pack_approved',
      'foundation_generating',
      'foundation_awaiting_approval',
      'foundation_approved',
    ],
  },
  {
    step: 3,
    label: 'Format',
    states: ['format_selecting', 'format_approved'],
  },
  {
    step: 4,
    label: 'Script',
    states: ['script_generating', 'script_awaiting_approval', 'script_generated', 'script_approved'],
  },
  {
    step: 5,
    label: 'Character',
    states: ['character_lock_selecting', 'character_lock_approved'],
  },
  {
    step: 6,
    label: 'Storyboard',
    states: [
      'storyboard_generating',
      'storyboard_awaiting_approval',
      'storyboard_generated',
      'storyboard_approved',
    ],
  },
  {
    step: 7,
    label: 'Images',
    states: ['images_generating', 'images_awaiting_approval', 'images_generated', 'images_approved'],
  },
  {
    step: 8,
    label: 'Video',
    states: [
      'video_prompts_generating',
      'video_prompts_awaiting_approval',
      'video_prompts_approved',
    ],
  },
  {
    step: 9,
    label: 'Voice',
    states: ['voice_approved', 'voice_confirmed'],
  },
  {
    step: 10,
    label: 'Production',
    states: ['production_starting', 'production_in_progress', 'production_completed'],
  },
  {
    step: 11,
    label: 'QC',
    states: ['qc_in_progress', 'qc_awaiting_approval', 'qc_approved'],
  },
  {
    step: 12,
    label: 'Done',
    states: ['final_packaging', 'completed', 'final_video_ready'],
  },
];

function getActiveStep(workflowState: string): number {
  const normalizedState = String(workflowState || '').toLowerCase();
  for (const step of WORKFLOW_STEPS) {
    if (step.states.some((s) => normalizedState.includes(s))) {
      return step.step;
    }
  }
  return 1;
}

function isStepLoading(stepNum: number, workflowState: string): boolean {
  const generatingStates = ['generating', 'in_progress', 'starting'];
  const currentStep = getActiveStep(workflowState);
  if (currentStep !== stepNum) return false;
  return generatingStates.some((s) => String(workflowState || '').includes(s));
}

export function WorkflowStepper({ workflowState }: { workflowState: string }) {
  const activeStep = getActiveStep(workflowState);

  return (
    <div
      className="glass-card px-4 py-3 mb-4 overflow-x-auto"
      data-slot="workflow-stepper"
    >
      <Stepper value={activeStep} orientation="horizontal" className="w-full">
        <StepperNav className="gap-0 w-full">
          {WORKFLOW_STEPS.map((step, index) => (
            <StepperItem
              key={step.step}
              step={step.step}
              completed={activeStep > step.step}
              loading={isStepLoading(step.step, workflowState)}
              className="flex-1"
            >
              <StepperTrigger asChild>
                <div className="flex flex-col items-center gap-1 cursor-default w-full">
                  <StepperIndicator
                    className="size-6 text-[10px] font-semibold flex items-center justify-center"
                    style={{
                      background:
                        activeStep > step.step
                          ? 'hsl(var(--color-success))'
                          : activeStep === step.step
                            ? 'hsl(var(--color-primary))'
                            : 'hsl(var(--glass-bg-medium))',
                      border:
                        activeStep === step.step
                          ? '2px solid hsl(var(--color-primary))'
                          : '1px solid hsl(var(--glass-border))',
                      color: activeStep >= step.step ? 'white' : 'hsl(var(--color-muted))',
                    }}
                  >
                    {activeStep > step.step ? (
                      <Check className="size-3" />
                    ) : isStepLoading(step.step, workflowState) ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      step.step
                    )}
                  </StepperIndicator>
                  <StepperTitle
                    className="text-[9px] whitespace-nowrap hidden sm:block"
                    style={{
                      color:
                        activeStep >= step.step
                          ? 'hsl(var(--color-text))'
                          : 'hsl(var(--color-muted))',
                      fontWeight: activeStep === step.step ? '600' : '400',
                    }}
                  >
                    {step.label}
                  </StepperTitle>
                </div>
              </StepperTrigger>
              {index < WORKFLOW_STEPS.length - 1 && (
                <StepperSeparator
                  style={{
                    background:
                      activeStep > step.step
                        ? 'hsl(var(--color-primary))'
                        : 'hsl(var(--glass-border))',
                    height: '2px',
                    margin: '0 4px',
                    marginBottom: '16px',
                    minWidth: '8px',
                  }}
                />
              )}
            </StepperItem>
          ))}
        </StepperNav>
      </Stepper>

      <p
        className="text-[10px] text-center mt-2"
        style={{ color: 'hsl(var(--color-muted))' }}
      >
        Step {activeStep} of {WORKFLOW_STEPS.length} · {String(workflowState).replace(/_/g, ' ')}
      </p>
    </div>
  );
}
