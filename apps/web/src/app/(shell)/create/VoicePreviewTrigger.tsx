'use client';

import { useState } from 'react';
import { Mic2 } from 'lucide-react';
import { VoicePreviewModal } from '@/components/ui/VoicePreviewModal';

export function VoicePreviewTrigger() {
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowVoiceModal(true)}
        className="glass-card px-4 py-2 flex items-center gap-2 text-sm mb-6 rounded-lg transition-all hover:opacity-80"
        style={{ color: 'hsl(var(--color-primary))' }}
      >
        <Mic2 size={16} />
        Try a voice preview
      </button>
      <VoicePreviewModal isOpen={showVoiceModal} onClose={() => setShowVoiceModal(false)} />
    </>
  );
}
