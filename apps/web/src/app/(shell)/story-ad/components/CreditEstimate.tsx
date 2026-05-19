'use client';

import React, { useState, useEffect } from 'react';
import { StoryboardProject } from '../hooks/useStoryboardProject';
import { useStoryboardProject } from '../hooks/useStoryboardProject';
import styles from './CreditEstimate.module.css';

interface CreditEstimateProps {
  project: StoryboardProject | null;
}

const STAGE_COSTS: Record<string, { cost: number; description: string }> = {
  'initialized': { cost: 0, description: 'Category selection (Free)' },
  'script_awaiting': { cost: 0, description: 'Script generation (Free)' },
  'script_approved': { cost: 0, description: 'Storyboard generation (Free)' },
  'storyboard_awaiting': { cost: 0, description: 'Storyboard review (Free)' },
  'storyboard_approved': { cost: 25, description: 'Base image generation (25 cr)' },
  'images_approved': { cost: 3, description: 'Voice preview (3 cr)' },
  'production_in_progress': { cost: 187, description: 'Full production (187 cr)' },
  'final_awaiting': { cost: 0, description: 'Final review (Free)' },
  'completed': { cost: 0, description: 'Completed' },
};

export default function CreditEstimate({ project }: CreditEstimateProps) {
  const { getCreditEstimate } = useStoryboardProject();
  const [userCredits, setUserCredits] = useState(500); // Mock: in real app, fetch from user account
  const [nextStageCost, setNextStageCost] = useState(0);
  const [nextStageDescription, setNextStageDescription] = useState('');

  useEffect(() => {
    if (project?.workflow_state) {
      const stage = project.workflow_state.toLowerCase();

      // Determine next stage cost based on workflow state
      let cost = 0;
      let description = '';

      if (stage.includes('initialized')) {
        cost = 0;
        description = 'Script generation (Free)';
      } else if (stage.includes('script_awaiting')) {
        cost = 0;
        description = 'Storyboard generation (Free)';
      } else if (stage.includes('script_approved')) {
        cost = 0;
        description = 'Storyboard generation (Free)';
      } else if (stage.includes('storyboard_awaiting') || stage.includes('storyboard_approved')) {
        cost = 25;
        description = 'Base images for 5 scenes (5 cr × 5)';
      } else if (stage.includes('images_approved')) {
        cost = 3;
        description = 'Voice preview (3 cr)';
      } else if (stage.includes('production')) {
        cost = 187;
        description = 'Full production (videos + lipsync + TTS)';
      }

      setNextStageCost(cost);
      setNextStageDescription(description);
    }
  }, [project?.workflow_state]);

  const remainingAfter = userCredits - (project?.credits_consumed || 0) - nextStageCost;
  const canAfford = remainingAfter >= 0;
  const isFree = nextStageCost === 0;

  if (!project) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.innerContainer}>
        {/* Current Balance */}
        <div className={styles.infoSection}>
          <div className={styles.infoGroup}>
            <span className={styles.label}>Current Balance</span>
            <span className={`${styles.value} ${styles.balanceValue}`}>
              {userCredits} credits
            </span>
          </div>

          {/* Divider */}
          <div className={styles.divider}></div>

          {/* Next Step Cost */}
          <div className={styles.infoGroup}>
            <span className={styles.label}>Next Step Cost</span>
            <span className={`${styles.value} ${isFree ? styles.freeText : styles.costValue}`}>
              {nextStageDescription}
            </span>
          </div>

          {/* Divider */}
          <div className={styles.divider}></div>

          {/* After Transaction */}
          <div className={styles.infoGroup}>
            <span className={styles.label}>After Transaction</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span className={`${styles.value} ${styles.afterValue}`}>
                {remainingAfter}
              </span>
              <span className={styles.checkmark}>
                {canAfford ? '✓' : '⚠️'}
              </span>
            </div>
          </div>
        </div>

        {/* Status Message */}
        <div>
          {!canAfford && (
            <button disabled className={styles.confirmButton} style={{ background: 'hsl(var(--color-danger))' }}>
              Insufficient Credits
            </button>
          )}
          {isFree && (
            <button disabled className={styles.confirmButton} style={{ background: 'hsl(var(--color-success))', opacity: 0.7 }}>
              ✓ This Step is Free
            </button>
          )}
          {nextStageCost > 0 && canAfford && (
            <button className={styles.confirmButton}>
              Confirm & Proceed
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
