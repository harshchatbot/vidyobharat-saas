# RangManchAI — Codex Project Guide

## Stack
- Frontend: Next.js 15, React 19, TypeScript, Tailwind CSS
- Backend: FastAPI Python 3.11, SQLAlchemy, PostgreSQL, Redis, Celery
- Storage: Firebase Storage + Firestore
- Video: FAL API, Kling O3, Seedance v1 Lite, LTX 2.3
- TTS: Gemini Flash TTS primary, Sarvam fallback, Edge TTS fallback
- Lipsync: fal-ai/sync-lipsync/v2
- Image: Gemini, Recraft, Together Flux tiered

## Project Structure
- Frontend: apps/web
- Backend: apps/api
- Backend services: apps/api/app/services
- Backend workers: apps/api/app/workers
- Backend recipes: apps/api/app/recipes
- Backend routers: apps/api/app/api/routers
- Shared config: shared/config

# =========================================
# Critical Safety Rules
# =========================================

- Do not modify avatar_product recipe or existing avatar_product pipeline unless explicitly requested.
- Keep storyboard/UGC pipeline isolated from avatar_product.
- Never auto-trigger expensive generation steps.
- Always show credit estimate before deduction.
- Deduct credits only after explicit user confirmation.
- Refund credits on generation failure wherever supported.
- Never apply lipsync unless category lipsync_required is true.
- Never exceed 30 second video or 66 word script limit for storyboard ads.
- Audio duration should drive final timing; do not hardcode final video duration.
- Never commit API keys, tokens, secrets, or .env contents.
- Do not add large endpoint handlers directly to routes.py.
- Prefer dedicated router files under apps/api/app/api/routers.
- Only modify route registration minimally when needed.
- For SQLAlchemy/PostgreSQL model changes, create Alembic migrations.
- For Firestore-only collections, no SQL migration is needed.

# =========================================
# Frontend Rules
# =========================================

- Use TypeScript strict patterns.
- Avoid `any` unless absolutely necessary.
- Normalize backend snake_case fields when needed.
- Backend workflow_state is usually lowercase snake_case.
- Frontend should accept both workflow_state and workflowState where needed.
- Never rely only on local loading state for async generation.
- Use backend state as source of truth.
- Expensive actions must require explicit click/confirmation.
- Use loading skeletons and clear error states.
- Keep mobile responsive at 375px width.

# =========================================
# Backend Rules
# =========================================

- Use async/await for external API calls where supported.
- Add structured logs at start and end of major operations.
- Use typed exceptions where practical.
- Celery tasks should update state at start and end.
- Scene-level failures should not fail the entire storyboard project.
- Use idempotency keys for credit-deducting tasks.
- Error responses should include:
  - error
  - message
  - recoverable
  - retry_action when relevant

# =========================================
# Storyboard Pipeline Rules
# =========================================

The storyboard pipeline is a parallel pipeline, not a replacement for avatar_product.

Follow checkpoint-based workflow:

INITIALIZED
SCRIPT_GENERATING
SCRIPT_AWAITING_APPROVAL
STORYBOARD_GENERATING
STORYBOARD_AWAITING_APPROVAL
IMAGES_GENERATING
IMAGES_AWAITING_APPROVAL
MOTION_PLANNING
AUDIO_GENERATING
VIDEO_GENERATING
STITCHING
FINAL_AWAITING_APPROVAL
COMPLETED

## Storyboard Workflow Rules

- User approval is required between major stages.
- Never auto-trigger storyboard/image/video generation without explicit confirmation.
- Scene-level regeneration should regenerate only rejected scenes.
- Approved scenes should stay locked unless explicitly edited.
- Back navigation must preserve generated state.
- Never clear generated scenes/images on remount.
- Always hydrate from backend state.

## Script Rules

- Duration is selected BEFORE script generation.
- Script generation must target:
  - 10s → 20–28 words
  - 15s → 35–45 words
  - 20s → 45–60 words
  - 30s → 70–85 words

- Script approval must be blocked if estimated duration mismatches target duration.
- Manual script edits must persist to backend immediately.
- TTS should always use latest edited canonical script fields.

## Scene Planning Rules

- Scene planning must normalize scene durations to exact target duration.
- Example:
  - 10s + 2 scenes → 5s + 5s
  - 15s + 3 scenes → 5s + 5s + 5s

Persist:
- duration_seconds
- normalized_scene_duration_seconds
- original_llm_duration_seconds
- target_duration_seconds

## Scene Editing Rules

Scene edits must persist to backend.

Canonical scene text fields:
- spoken_line
- dialogue
- voice_line
- tts_text
- script_line

When editing spoken line:
- sync all canonical fields

Visual Storyboard, TTS, Motion, and Production must all use updated canonical text.

# =========================================
# Creative UI/UX System Rules
# =========================================

## Product Positioning

RangManchAI is NOT merely:
- AI video generator

It should feel like:
- AI Creative Operating System
- AI Ad Studio
- AI Storyboard + Production Suite
- Cinematic Creative Workflow Tool

The UI should resemble:
- premium creative agency software
- storyboard production systems
- cinematic production dashboards
- visual pitch deck systems
- Canva + Figma + Runway hybrid

Avoid making the UI feel:
- like internal admin tooling
- like CRUD dashboards
- like stacked enterprise forms
- like raw prompt engineering interfaces

# =========================================
# Core UX Philosophy
# =========================================

Optimize for:
- visual clarity
- storytelling flow
- cinematic presentation
- creator confidence
- production trust
- premium feel
- client-shareable experiences

Avoid:
- dense text walls
- debug-heavy layouts
- excessive equal-weight sections
- vertically stacked repetitive cards

# =========================================
# Storyboard UX Rules
# =========================================

Storyboard is NOT:
- image generation only
- simple scene cards

Storyboard IS:
- visual production board
- cinematic sequencing system
- client approval workflow
- continuity planning system

## Storyboard UI must support:
- board/grid layouts
- cinematic sequencing
- visual storytelling progression
- continuity visualization
- scene timing visibility
- client preview mode
- premium presentation layouts

# =========================================
# Visual Storyboard Board View Rules
# =========================================

Visual Storyboard should support:
- Review View
- Board View

## Review View
Used for:
- approve/reject
- regenerate
- editing
- workflow control

## Board View
Used for:
- cinematic presentation
- client approval
- visual storytelling
- production planning

Board View should resemble:
- ad-agency pitch boards
- Netflix previsualization boards
- cinematic contact sheets
- campaign presentation decks

# =========================================
# Storyboard Tile Design Rules
# =========================================

Each storyboard tile should prioritize:

1. Generated frame
2. Spoken line
3. Duration
4. Camera metadata
5. Mood/action
6. Approval state

Each tile should include:
- Scene number
- Duration chip
- Generated frame
- Spoken line
- Camera/shot type
- Mood
- Setting
- Action
- Approval status

Use:
- premium spacing
- rounded cards
- cinematic typography
- subtle gradients
- modern hover states
- visual hierarchy

Avoid:
- enterprise table layouts
- raw text-heavy cards
- tiny action buttons
- flat generic dashboards

# =========================================
# Creative Continuity Rules
# =========================================

UI should visually communicate:
- face continuity
- outfit continuity
- lighting continuity
- environment continuity
- product continuity

Add continuity indicators where possible:
- Face Locked
- Outfit Locked
- Product Locked
- Lighting Locked

# =========================================
# Client Preview Rules
# =========================================

Client Preview mode should:
- hide debug panels
- hide prompts
- hide technical metadata
- hide internal controls

Show only:
- storyboard frames
- dialogue
- duration
- cinematic flow
- visual direction

# =========================================
# Motion & Production UX Rules
# =========================================

Motion stages should feel:
- cinematic
- production-oriented
- timeline-driven

Prefer:
- stage progression
- animated pipeline states
- cinematic transitions
- scene-level rendering indicators

Examples:
- Scene 1 Rendering
- Motion Pass
- Lipsync Pass
- Final Composite
- Audio Alignment

Avoid:
- plain loading bars only
- static waiting screens

# =========================================
# Premium UI Design System
# =========================================

Preferred qualities:
- cinematic dark mode
- luxury minimalism
- soft gradients
- layered cards
- large visual surfaces
- subtle animations
- smooth transitions
- presentation-quality typography

Use:
- Tailwind CSS
- shadcn/ui
- Framer Motion

Use glassmorphism lightly.

Avoid:
- visually crowded dashboards
- bootstrap-feeling layouts
- excessive borders
- generic admin aesthetics

# =========================================
# External UI Inspiration & Component Rules
# =========================================

Approved inspiration sources:
- https://21st.dev/community/components
- Dribbble
- Awwwards
- Godly
- Mobbin
- modern cinematic SaaS products
- creative agency presentation tools

## 21st.dev Rules

Before implementing major UI:
- inspect similar premium components on 21st.dev
- adapt patterns rather than building primitive layouts from scratch

Especially for:
- storyboard boards
- cinematic cards
- dashboard shells
- timeline interfaces
- creative review systems
- motion-heavy interfaces

Do NOT blindly copy.

Adapt patterns while preserving:
- RangManch workflow logic
- backend integrations
- mobile responsiveness
- performance

# =========================================
# Motion & Animation Rules
# =========================================

Use Framer Motion for:
- storyboard transitions
- image reveals
- scene hover states
- cinematic fades
- stage progression
- board view transitions

Animation should feel:
- smooth
- subtle
- premium
- cinematic

Avoid:
- distracting gimmicky animation
- excessive bouncing

# =========================================
# UI State Management Rules
# =========================================

Never accidentally clear:
- approved scenes
- generated frames
- approvals
- edits
- generated outputs

Always hydrate from backend state on:
- remount
- refresh
- back navigation

Backend state is source of truth.

# =========================================
# AI Creative Workflow Philosophy
# =========================================

Do NOT optimize only for:
- generation speed

Optimize for:
- controllability
- creative confidence
- revision flow
- approval flow
- cinematic continuity
- storytelling quality

RangManch should feel like:
- Creative Director Assistant

NOT:
- prompt-to-video vending machine

# =========================================
# Current Important Debug Context
# =========================================

Backend may return:
- workflow_state: "script_awaiting_approval"
- display_script: "..."

Frontend must:
- render ScriptCheckpoint when display_script exists
- avoid stale prop rendering
- avoid infinite loading when data exists

Loader "Generating script..." should show only when:
- generating_script
- script_generating
AND no display_script exists.

# =========================================
# Testing Commands
# =========================================

## Frontend type check
cd apps/web && npm run typecheck

or

cd apps/web && npx tsc --noEmit

## Backend tests
cd apps/api && pytest

## Backend server
cd apps/api && source venv/bin/activate && uvicorn app.main:app --reload --port 8000

## Frontend server
cd apps/web && npm run dev

# =========================================
# Codex Working Rules
# =========================================

- First inspect existing files before creating similar services.
- Prefer minimal targeted patches.
- Explain files changed and why.
- Do not rewrite large files unnecessarily.
- Do not touch unrelated pipelines.
- When fixing bugs, add short QA checklist.
- When changing async workflows:
  - verify request payload
  - verify response shape
  - verify state updates
  - verify polling
  - verify UI hydration
  - verify back navigation

## UI/UX Behavior Rules

When improving UI:
- prioritize visual hierarchy first
- improve spacing before adding features
- make creative outputs focal point
- reduce clutter
- optimize for cinematic feel
- think like a creative director

Always ask:
"Would this feel believable in a real creative agency workflow?"