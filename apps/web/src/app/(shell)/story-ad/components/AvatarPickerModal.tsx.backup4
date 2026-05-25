'use client';

import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { AvatarOption } from '../hooks/useAvatarLibrary';

interface AvatarPickerModalProps {
  open: boolean;
  avatars: AvatarOption[];
  loading: boolean;
  error: string | null;
  selectedAvatarId?: string;
  onSelectAvatar: (avatar: AvatarOption) => void;
  onClose: () => void;
}

export default function AvatarPickerModal({
  open,
  avatars,
  loading,
  error,
  selectedAvatarId,
  onSelectAvatar,
  onClose,
}: AvatarPickerModalProps) {
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [previewModal, setPreviewModal] = useState<AvatarOption | null>(null);

  const activePreview = activePreviewId
    ? avatars.find((a) => a.personaId === activePreviewId)
    : null;

  const publicAvatars = avatars.filter((a) => a.source === 'preset');
  const savedAvatars = avatars.filter((a) => a.source === 'saved');

  return (
    <Modal open={open} onClose={onClose} size="xl">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">AI Avatar</p>
            <h3 className="mt-1 text-xl font-semibold text-text">Choose your spokesperson</h3>
            <p className="mt-1 text-sm text-muted">
              Preview the avatar first, then use it for your ad scenes.
            </p>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-10 text-center text-sm text-muted">Loading avatars...</div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_340px]">
            {/* Avatar Grid */}
            <div className="space-y-5">
              {error && (
                <div className="rounded-[16px] border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  Failed to load avatars. Please try again.
                </div>
              )}

              {/* Public Avatars */}
              {publicAvatars.length > 0 && (
                <section className="space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Public Avatars</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {publicAvatars.map((avatar) => {
                      const isFocused = activePreviewId === avatar.personaId;
                      const isSelected = selectedAvatarId === avatar.personaId;
                      return (
                        <div
                          key={avatar.personaId}
                          className={`rounded-[20px] border p-3 transition ${
                            isFocused
                              ? 'border-indigo-500/45 bg-indigo-500/8'
                              : 'border-border/74 bg-surface/72'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActivePreviewId(avatar.personaId);
                              setPreviewModal(avatar);
                            }}
                            className="w-full text-left"
                          >
                            <div className="overflow-hidden rounded-[16px] bg-surface/70">
                              {avatar.imageUrl ? (
                                <img
                                  src={avatar.imageUrl}
                                  alt={avatar.name}
                                  className="h-36 w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-36 items-center justify-center text-sm text-muted">No image</div>
                              )}
                            </div>
                            <div className="mt-3 flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-text">{avatar.name}</p>
                                <p className="mt-1 text-xs text-muted">{avatar.styleLabel || avatar.sourceLabel}</p>
                              </div>
                              <span className="rounded-full border border-border/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                                {avatar.sourceLabel}
                              </span>
                            </div>
                          </button>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => setActivePreviewId(avatar.personaId)}
                              className="flex-1 rounded-[12px] border border-border/74 px-3 py-2 text-xs font-semibold text-text transition hover:border-indigo-500/35"
                            >
                              Preview
                            </button>
                            <button
                              type="button"
                              onClick={() => onSelectAvatar(avatar)}
                              className={`flex-1 rounded-[12px] px-3 py-2 text-xs font-semibold transition ${
                                isSelected
                                  ? 'bg-indigo-500/18 text-text'
                                  : 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:opacity-95'
                              }`}
                            >
                              {isSelected ? '✓ Selected' : 'Use'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Saved Avatars */}
              {savedAvatars.length > 0 && (
                <section className="space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Saved Avatars</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {savedAvatars.map((avatar) => {
                      const isFocused = activePreviewId === avatar.personaId;
                      const isSelected = selectedAvatarId === avatar.personaId;
                      return (
                        <div
                          key={avatar.personaId}
                          className={`rounded-[20px] border p-3 transition ${
                            isFocused
                              ? 'border-indigo-500/45 bg-indigo-500/8'
                              : 'border-border/74 bg-surface/72'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActivePreviewId(avatar.personaId);
                              setPreviewModal(avatar);
                            }}
                            className="w-full text-left"
                          >
                            <div className="overflow-hidden rounded-[16px] bg-surface/70">
                              {avatar.imageUrl ? (
                                <img
                                  src={avatar.imageUrl}
                                  alt={avatar.name}
                                  className="h-36 w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-36 items-center justify-center text-sm text-muted">No image</div>
                              )}
                            </div>
                            <div className="mt-3 flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-text">{avatar.name}</p>
                                <p className="mt-1 text-xs text-muted">{avatar.styleLabel || avatar.sourceLabel}</p>
                              </div>
                              <span className="rounded-full border border-border/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                                {avatar.sourceLabel}
                              </span>
                            </div>
                          </button>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => setActivePreviewId(avatar.personaId)}
                              className="flex-1 rounded-[12px] border border-border/74 px-3 py-2 text-xs font-semibold text-text transition hover:border-indigo-500/35"
                            >
                              Preview
                            </button>
                            <button
                              type="button"
                              onClick={() => onSelectAvatar(avatar)}
                              className={`flex-1 rounded-[12px] px-3 py-2 text-xs font-semibold transition ${
                                isSelected
                                  ? 'bg-indigo-500/18 text-text'
                                  : 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:opacity-95'
                              }`}
                            >
                              {isSelected ? '✓ Selected' : 'Use'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {avatars.length === 0 && !loading && (
                <div className="rounded-[20px] border border-dashed border-border/74 p-6 text-sm text-muted">
                  No avatars available. Create or import avatars from the main Create page.
                </div>
              )}
            </div>

            {/* Preview Panel */}
            <aside className="rounded-[24px] border border-border/74 bg-surface/74 p-4 xl:sticky xl:top-0">
              {activePreview ? (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-[20px] bg-bg/72">
                    {activePreview.imageUrl ? (
                      <img
                        src={activePreview.imageUrl}
                        alt={activePreview.name}
                        className="h-[280px] w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-[280px] items-center justify-center text-sm text-muted">No preview</div>
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-lg font-semibold text-text">{activePreview.name}</h4>
                      <span className="rounded-full border border-border/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                        {activePreview.sourceLabel}
                      </span>
                    </div>
                    {activePreview.styleLabel && (
                      <p className="mt-1 text-sm text-muted">{activePreview.styleLabel}</p>
                    )}
                  </div>
                  {activePreview.description && (
                    <p className="text-sm leading-6 text-muted">{activePreview.description}</p>
                  )}
                  <div className="grid gap-2">
                    {activePreview.languageInfo && (
                      <div className="rounded-[14px] border border-border/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Language</p>
                        <p className="mt-1 text-sm text-text">{activePreview.languageInfo}</p>
                      </div>
                    )}
                    {activePreview.voiceInfo && (
                      <div className="rounded-[14px] border border-border/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Voice</p>
                        <p className="mt-1 text-sm text-text">{activePreview.voiceInfo}</p>
                      </div>
                    )}
                  </div>
                  {activePreview.previewVideoUrl ? (
                    <video
                      className="w-full rounded-[16px]"
                      controls
                      src={activePreview.previewVideoUrl}
                    />
                  ) : (
                    <div className="rounded-[16px] border border-dashed border-border/74 px-4 py-3 text-sm text-muted">
                      Preview video will appear here. You can still use the image preview.
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => onSelectAvatar(activePreview)}
                    className="w-full rounded-[14px] bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-95"
                  >
                    Use this avatar
                  </button>
                </div>
              ) : (
                <div className="flex h-full min-h-[320px] items-center justify-center rounded-[20px] border border-dashed border-border/74 p-6 text-center text-sm text-muted">
                  Pick an avatar to see the preview.
                </div>
              )}
            </aside>
          </div>
        )}

        {/* Preview Modal */}
        <Modal open={Boolean(previewModal)} onClose={() => setPreviewModal(null)}>
          {previewModal && (
            <div className="mx-auto max-w-[420px] space-y-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Avatar Preview</p>
                <h3 className="mt-1 text-lg font-semibold text-text">{previewModal.name}</h3>
              </div>
              {previewModal.previewVideoUrl ? (
                <video
                  className="w-full rounded-[16px]"
                  autoPlay
                  controls
                  src={previewModal.previewVideoUrl}
                />
              ) : previewModal.imageUrl ? (
                <img
                  src={previewModal.imageUrl}
                  alt={previewModal.name}
                  className="w-full rounded-[16px]"
                />
              ) : (
                <div className="rounded-[16px] border border-dashed border-border/74 py-12 text-center text-sm text-muted">
                  No preview available
                </div>
              )}
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="w-full rounded-[12px] border border-border/74 px-4 py-2 text-sm font-semibold text-text transition hover:bg-surface/50"
              >
                Close
              </button>
            </div>
          )}
        </Modal>
      </div>
    </Modal>
  );
}
