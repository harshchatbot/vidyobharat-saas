'use client'

import { useState, useRef } from 'react'
import { Upload, X, Check, Loader2, User } from 'lucide-react'
import { getCurrentUserId } from '@/lib/authUser'

interface CustomAvatarCreatorProps {
  onCreated: (avatar: { id: string; name: string; referenceImages: string[] }) => void
  onCancel: () => void
  userId?: string | null
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Legacy Sarvam Voices (backend-validated)
const VOICE_OPTIONS = [
  { value: 'auto', label: 'Auto (Recommended)', gender: 'any' },
  // Female voices
  { value: 'Priya', label: 'Priya — Bright', gender: 'female' },
  { value: 'Ritu', label: 'Ritu — Clear', gender: 'female' },
  { value: 'Neha', label: 'Neha — Friendly', gender: 'female' },
  { value: 'Pooja', label: 'Pooja — Balanced', gender: 'female' },
  { value: 'Simran', label: 'Simran — Expressive', gender: 'female' },
  { value: 'Kavya', label: 'Kavya — Soft', gender: 'female' },
  { value: 'Ishita', label: 'Ishita — Calm', gender: 'female' },
  { value: 'Shreya', label: 'Shreya — Polished', gender: 'female' },
  { value: 'Suhani', label: 'Suhani — Gentle', gender: 'female' },
  { value: 'Tanya', label: 'Tanya — Modern', gender: 'female' },
  // Male voices
  { value: 'Shubh', label: 'Shubh — Balanced', gender: 'male' },
  { value: 'Aditya', label: 'Aditya — Confident', gender: 'male' },
  { value: 'Rahul', label: 'Rahul — Warm', gender: 'male' },
  { value: 'Rohan', label: 'Rohan — Polished', gender: 'male' },
  { value: 'Varun', label: 'Varun — Young', gender: 'male' },
  { value: 'Kabir', label: 'Kabir — Broadcast', gender: 'male' },
  { value: 'Dev', label: 'Dev — Deep', gender: 'male' },
  { value: 'Sunny', label: 'Sunny — Energetic', gender: 'male' },
  { value: 'Tarun', label: 'Tarun — Friendly', gender: 'male' },
]

// All 12 Indian Regional Languages
const INDIAN_LANGUAGES = [
  { value: 'en-IN', label: 'English (India)' },
  { value: 'hi-IN', label: 'Hindi' },
  { value: 'hi-IN-x-hinglish', label: 'Hinglish' },
  { value: 'bn-IN', label: 'Bengali' },
  { value: 'gu-IN', label: 'Gujarati' },
  { value: 'kn-IN', label: 'Kannada' },
  { value: 'ml-IN', label: 'Malayalam' },
  { value: 'mr-IN', label: 'Marathi' },
  { value: 'pa-IN', label: 'Punjabi' },
  { value: 'ta-IN', label: 'Tamil' },
  { value: 'te-IN', label: 'Telugu' },
  { value: 'od-IN', label: 'Odia' },
]

export function CustomAvatarCreator({ onCreated, onCancel, userId: propUserId }: CustomAvatarCreatorProps) {
  const [step, setStep] = useState<'photos' | 'details'>('photos')
  const [frontPhoto, setFrontPhoto] = useState<File | null>(null)
  const [additionalPhotos, setAdditionalPhotos] = useState<(File | null)[]>([null, null, null])
  const [avatarName, setAvatarName] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | 'neutral'>('female')
  const [selectedVoice, setSelectedVoice] = useState('auto')
  const [language, setLanguage] = useState('en-IN')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const additionalFileRefs = useRef<(HTMLInputElement | null)[]>([null, null, null])

  const triggerConfetti = () => {
    const colors = ['#7C3AED', '#EC4899', '#F59E0B', '#06B6D4', '#10B981']
    const styleEl = document.createElement('style')
    styleEl.textContent = `@keyframes confetti-fall {
      0% { transform: translateY(0) rotate(0deg); opacity: 1; }
      100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
    }`
    document.head.appendChild(styleEl)
    for (let i = 0; i < 80; i++) {
      const el = document.createElement('div')
      el.style.cssText = `
        position: fixed;
        width: ${Math.random() * 10 + 5}px;
        height: ${Math.random() * 10 + 5}px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        left: ${Math.random() * 100}vw;
        top: -20px;
        z-index: 99999;
        pointer-events: none;
        animation: confetti-fall ${Math.random() * 2 + 2}s ease-in forwards;
        animation-delay: ${Math.random() * 1.5}s;
      `
      document.body.appendChild(el)
      setTimeout(() => el.remove(), 5000)
    }
    setTimeout(() => styleEl.remove(), 6000)
  }

  const handlePhotoSelect = (file: File | null, index: number = -1) => {
    if (index === -1) {
      setFrontPhoto(file)
    } else {
      const newPhotos = [...additionalPhotos]
      newPhotos[index] = file
      setAdditionalPhotos(newPhotos)
    }
  }

  const canContinue = step === 'photos' && frontPhoto !== null
  const canCreate = avatarName.trim().length > 0 && frontPhoto !== null

  // Filter voices based on selected gender
  const getAvailableVoices = () => {
    if (gender === 'neutral') return VOICE_OPTIONS
    return VOICE_OPTIONS.filter(v => v.gender === gender || v.value === 'auto')
  }

  const handleCreate = async () => {
    if (!canCreate) return

    setLoading(true)
    setError(null)

    try {
      // Get user ID from prop or auth
      const userIdStr = propUserId || getCurrentUserId()
      if (!userIdStr) {
        throw new Error('User not authenticated')
      }

      const formData = new FormData()

      // Add images
      if (frontPhoto) {
        formData.append('ref_front', frontPhoto)
      }
      additionalPhotos.forEach((photo, i) => {
        if (photo) {
          formData.append('ref_alt', photo)
        }
      })
      formData.append('thumb', frontPhoto!)

      // Add metadata
      formData.append('name', avatarName)
      formData.append('gender', gender)
      // Map selected voice to recommended voice (auto selects based on gender)
      let recommendedVoice = selectedVoice
      if (selectedVoice === 'auto') {
        if (gender === 'male') {
          recommendedVoice = 'Shubh'
        } else if (gender === 'female') {
          recommendedVoice = 'Priya'
        } else {
          recommendedVoice = 'Priya' // neutral defaults to Priya
        }
      }
      formData.append('recommended_voice', recommendedVoice)
      formData.append('language_support', language)
      formData.append('category', 'custom_avatar')
      formData.append('scope', 'own')
      formData.append('tags', 'custom,creator')
      formData.append('prompt_template', `${avatarName} presenting the product naturally and authentically`)
      formData.append('negative_prompt', 'distorted face, unnatural pose, bad lighting, blurry')

      console.log('Calling actors/create with:', {
        name: avatarName,
        gender,
        voice: selectedVoice,
        language,
        hasFrontPhoto: !!frontPhoto,
      })

      const res = await fetch(`${API_BASE}/api/actors/create`, {
        method: 'POST',
        headers: {
          'X-User-ID': userIdStr,
        },
        body: formData,
      })

      console.log('Actor create response status:', res.status)
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to create avatar')
      }

      const data = await res.json()
      console.log('Actor create response data:', data)

      // Show success celebration
      setShowSuccess(true)
      triggerConfetti()

      // Wait 2.5 seconds then call onCreated
      setTimeout(() => {
        onCreated({
          id: data.actor_id || data.id,
          name: avatarName,
          referenceImages: data.reference_images || [],
        })
      }, 2500)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create avatar'
      setError(message)
      console.error('Avatar creation error:', err)
    } finally {
      setLoading(false)
    }
  }

  const frontPhotoPreview = frontPhoto ? URL.createObjectURL(frontPhoto) : null

  if (showSuccess) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        gap: '16px',
        textAlign: 'center',
        padding: '40px',
      }}>
        <style>{`
          @keyframes success-pop {
            0% { transform: scale(0); opacity: 0; }
            60% { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes success-fade-in {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes progress-flow {
            0% { width: 100%; }
            100% { width: 0%; }
          }
        `}</style>

        {/* Animated checkmark circle */}
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, hsl(var(--color-success)), hsl(var(--color-accent-cyan)))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '36px',
          animation: 'success-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
          boxShadow: '0 0 40px hsl(var(--color-success) / 0.4)',
        }}>
          ✓
        </div>

        {/* Title */}
        <p style={{
          fontSize: '24px',
          fontWeight: '700',
          background: 'linear-gradient(135deg, hsl(var(--color-primary)), hsl(var(--color-accent-pink)))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          animation: 'success-fade-in 0.4s ease-out 0.3s both',
        }}>
          Avatar Created! 🎉
        </p>

        {/* Subtitle */}
        <p style={{
          fontSize: '15px',
          color: 'hsl(var(--color-text-secondary))',
          animation: 'success-fade-in 0.4s ease-out 0.5s both',
        }}>
          <strong style={{ color: 'hsl(var(--color-text))' }}>{avatarName}</strong> is ready to use
        </p>

        {/* Progress bar auto-dismiss indicator */}
        <div style={{
          width: '200px',
          height: '3px',
          background: 'hsl(var(--glass-border))',
          borderRadius: '999px',
          overflow: 'hidden',
          marginTop: '8px',
          animation: 'success-fade-in 0.4s ease-out 0.7s both',
        }}>
          <div style={{
            height: '100%',
            background: 'linear-gradient(90deg, hsl(var(--color-primary)), hsl(var(--color-accent-pink)))',
            borderRadius: '999px',
            animation: 'progress-flow 2.5s ease-out forwards',
          }} />
        </div>

        <p style={{
          fontSize: '11px',
          color: 'hsl(var(--color-muted))',
          animation: 'success-fade-in 0.4s ease-out 0.9s both',
        }}>
          Returning to avatar selection...
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 overflow-y-auto max-h-[85vh]">
      {/* Step 1: Upload Photos */}
      {step === 'photos' && (
        <div className="space-y-6">
          <div>
            <h4
              className="text-sm font-semibold"
              style={{ color: 'hsl(var(--color-text))' }}
            >
              Upload Your Photos
            </h4>
            <p
              className="mt-1 text-xs"
              style={{ color: 'hsl(var(--color-text-secondary))' }}
            >
              Front-facing photo required. Add more angles for better accuracy.
            </p>
          </div>

          {/* Main photo upload */}
          <div>
            <label
              className="block text-xs font-semibold mb-2"
              style={{ color: 'hsl(var(--color-text))' }}
            >
              Front Facing Photo <span style={{ color: 'hsl(var(--color-error))' }}>*</span>
            </label>
            <div
              className="relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer transition"
              style={{
                borderColor: 'hsl(var(--color-primary) / 0.4)',
                background: 'hsl(var(--color-primary) / 0.05)',
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              {frontPhotoPreview ? (
                <div className="relative w-full max-w-[160px]">
                  <img
                    src={frontPhotoPreview}
                    alt="Front photo"
                    className="w-full h-auto rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setFrontPhoto(null)
                    }}
                    className="absolute -top-2 -right-2 rounded-full p-1 transition"
                    style={{
                      background: 'hsl(var(--color-error))',
                      color: 'white',
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full"
                    style={{ background: 'hsl(var(--color-primary) / 0.15)' }}
                  >
                    <User className="h-5 w-5" style={{ color: 'hsl(var(--color-primary))' }} />
                  </div>
                  <p
                    className="text-xs font-semibold"
                    style={{ color: 'hsl(var(--color-text))' }}
                  >
                    Front facing photo
                  </p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoSelect(e.target.files?.[0] || null)}
                className="hidden"
              />
            </div>
          </div>

          {/* Additional angles */}
          <div>
            <label
              className="block text-xs font-semibold mb-2"
              style={{ color: 'hsl(var(--color-text))' }}
            >
              Add More Angles (optional — improves accuracy)
            </label>
            <div className="grid grid-cols-3 gap-3">
              {['Left side', 'Right side', '3/4 angle'].map((label, idx) => (
                <div
                  key={idx}
                  className="flex flex-col items-center"
                >
                  <div
                    className="relative w-full flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-3 cursor-pointer transition"
                    style={{
                      height: '120px',
                      borderColor: 'hsl(var(--color-primary) / 0.3)',
                      background: 'hsl(var(--color-primary) / 0.03)',
                    }}
                    onClick={() => additionalFileRefs.current[idx]?.click()}
                  >
                    {additionalPhotos[idx] ? (
                      <div className="relative w-full h-full">
                        <img
                          src={URL.createObjectURL(additionalPhotos[idx]!)}
                          alt={label}
                          className="w-full h-full object-cover rounded"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handlePhotoSelect(null, idx)
                          }}
                          className="absolute -top-1.5 -right-1.5 rounded-full p-0.5 transition"
                          style={{
                            background: 'hsl(var(--color-error))',
                            color: 'white',
                          }}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-4 w-4" style={{ color: 'hsl(var(--color-muted))' }} />
                        <p className="text-[10px] text-center" style={{ color: 'hsl(var(--color-muted))' }}>
                          {label}
                        </p>
                      </div>
                    )}
                    <input
                      ref={(el) => {
                        additionalFileRefs.current[idx] = el
                      }}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handlePhotoSelect(e.target.files?.[0] || null, idx)}
                      className="hidden"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div
              className="rounded-lg border px-3 py-2 text-xs"
              style={{
                borderColor: 'hsl(var(--color-error) / 0.3)',
                background: 'hsl(var(--color-error) / 0.1)',
                color: 'hsl(var(--color-error))',
              }}
            >
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition"
              style={{
                borderColor: 'hsl(var(--color-border))',
                color: 'hsl(var(--color-text))',
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => setStep('details')}
              disabled={!canContinue}
              title={!canContinue ? 'Upload front photo to continue' : ''}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white transition ${
                canContinue ? 'glow-button' : 'opacity-50 cursor-not-allowed'
              }`}
              style={{
                background: canContinue
                  ? 'linear-gradient(135deg, hsl(var(--color-primary)) 0%, hsl(var(--color-primary) / 0.85) 100%)'
                  : 'hsl(var(--color-muted))',
                boxShadow: canContinue ? '0 0 20px hsl(var(--color-primary) / 0.3)' : 'none',
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Avatar Details */}
      {step === 'details' && (
        <div className="space-y-4">
          <div>
            <label
              className="block text-xs font-semibold mb-2"
              style={{ color: 'hsl(var(--color-text))' }}
            >
              Avatar Name
            </label>
            <input
              type="text"
              placeholder="e.g., My Creator Avatar"
              value={avatarName}
              onChange={(e) => setAvatarName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm transition focus:outline-none"
              style={{
                borderColor: 'hsl(var(--color-border))',
                background: 'hsl(var(--color-surface))',
                color: 'hsl(var(--color-text))',
              }}
            />
          </div>

          <div>
            <label
              className="block text-xs font-semibold mb-2"
              style={{ color: 'hsl(var(--color-text))' }}
            >
              Gender
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'female', label: 'Female' },
                { key: 'male', label: 'Male' },
                { key: 'neutral', label: 'Neutral' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setGender(opt.key as typeof gender)}
                  className="rounded-lg border px-3 py-2 text-xs font-semibold transition"
                  style={{
                    borderColor:
                      gender === opt.key
                        ? 'hsl(var(--color-primary))'
                        : 'hsl(var(--color-border))',
                    background:
                      gender === opt.key
                        ? 'hsl(var(--color-primary) / 0.1)'
                        : 'hsl(var(--color-surface))',
                    color: 'hsl(var(--color-text))',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              className="block text-xs font-semibold mb-2"
              style={{ color: 'hsl(var(--color-text))' }}
            >
              Preferred Voice
            </label>
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm transition"
              style={{
                borderColor: 'hsl(var(--color-border))',
                background: 'hsl(var(--color-surface))',
                color: 'hsl(var(--color-text))',
              }}
            >
              <option value="auto">Auto (Recommended)</option>
              {getAvailableVoices().map((voice) => (
                <option key={voice.value} value={voice.value}>
                  {voice.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className="block text-xs font-semibold mb-2"
              style={{ color: 'hsl(var(--color-text))' }}
            >
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm transition"
              style={{
                borderColor: 'hsl(var(--color-border))',
                background: 'hsl(var(--color-surface))',
                color: 'hsl(var(--color-text))',
              }}
            >
              {INDIAN_LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div
              className="rounded-lg border px-3 py-2 text-xs"
              style={{
                borderColor: 'hsl(var(--color-error) / 0.3)',
                background: 'hsl(var(--color-error) / 0.1)',
                color: 'hsl(var(--color-error))',
              }}
            >
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setStep('photos')}
              disabled={loading}
              className="flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition"
              style={{
                borderColor: 'hsl(var(--color-border))',
                color: 'hsl(var(--color-text))',
              }}
            >
              Back
            </button>
            <button
              onClick={handleCreate}
              disabled={!canCreate || loading}
              className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              style={{
                background: canCreate && !loading ? 'hsl(var(--color-primary))' : 'hsl(var(--color-muted))',
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="h-3 w-3" />
                  Create Avatar
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
