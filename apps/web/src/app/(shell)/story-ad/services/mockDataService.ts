// Mock data service for testing without consuming credits.
// Covers both the legacy flow and the full TOW (Table of Work) flow.
//
// TOW semantic order:
//   Stage 1:  BriefData        — structured user input
//   Stage 2:  ProjectStatePack — project memory / save-file (NOT brand extraction)
//   Stage 3:  Foundation       — strategy only (AD DNA, Avatar, Campaign Role, Message Map, Angle, Summary)
//   Stage 4:  FormatDecision   — 6 ad format types → choose one path
//   Stage 5:  Script           — separate from foundation, uses chosen narrative template
//   Stage 6:  CharacterLock    — character identity + face-lock block
//   Stage 7:  Scene Breakdown  — scenes derived AFTER character lock
//   Stage 8:  Base Images      — one per scene
//   Stage 9:  VideoPrompts     — motion only, derived FROM approved images
//   Stage 10: Voice Selection
//   Stage 11: Production
//   Stage 12: QC Report        — 11-point checklist + numeric scores
//   Stage 13: Final Packaging

import type {
  BriefData,
  ProjectStatePack,
  Foundation,
  CustomerAvatar,
  MessageMap,
  FormatDecision,
  CharacterLock,
  FaceDetails,
  SkinDetails,
  HairDetails,
  OutfitDetails,
  SceneVideoPrompt,
  QCReport,
  QCChecklistItem,
} from '../hooks/useStoryboardProject';

export interface MockScene {
  id: string;
  scene_number: number;
  scene_type: string;
  spoken_line: string;
  visual_description: string;
  shot_type: string;
  mood?: string;
  environment?: string;
  avatar_action?: string;
  product_visibility?: string;
  duration_seconds: number;
  user_approved?: boolean | null;
  state?: string;
  base_image_url?: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const MOCK_SCRIPTS = [
  `Hi, I'm Chitrakala. If you're a busy professional, you know how often you miss calls, messages, or fitness goals during the day. This stylish smart watch keeps everything on your wrist — notifications, calls, activity tracking, and a premium look that fits your office style. It is not just a gadget, it is a smarter way to manage your workday. Explore the collection and upgrade your everyday style.`,
];

const MOCK_IMAGES = [
  'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1495521821757-a1efb6729352?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1524634126288-917f7d995c5c?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1492707892657-8d71f6099fc6?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1535639066936-f8bfc85fddbb?w=400&h=300&fit=crop',
];

const MOCK_VOICES = [
  { name: 'Emma', language: 'English (India)', description: 'Warm and friendly' },
  { name: 'Kore', language: 'English (India)', description: 'Professional and clear' },
  { name: 'Priya', language: 'Hindi', description: 'Natural and engaging' },
  { name: 'Arjun', language: 'Hindi', description: 'Deep and confident' },
];

const SCENE_TYPES = ['hook', 'benefit', 'social-proof', 'product-demo', 'cta'];
const SHOT_TYPES = ['close-up', 'medium', 'wide', 'pov'];
const MOODS = ['Curious and engaging', 'Confident and informative', 'Excited and persuasive', 'Warm and trusting', 'Energetic'];

// ── Legacy generators ──────────────────────────────────────────────────────

export function generateMockScript(_category: string): string {
  return MOCK_SCRIPTS[Math.floor(Math.random() * MOCK_SCRIPTS.length)];
}

export function generateMockScenes(
  count = 4,
  setup?: {
    business_brief?: string;
    avatar_name?: string;
    ad_style?: string;
    platform?: string;
    tone?: string;
    language?: string;
  }
): MockScene[] {
  const businessBrief = setup?.business_brief || 'your product';
  const avatarName = setup?.avatar_name || 'the creator';

  const lowerBrief = businessBrief.toLowerCase();

  const isSmartWatch =
    lowerBrief.includes('watch') ||
    lowerBrief.includes('smartwatch') ||
    lowerBrief.includes('smart watch') ||
    lowerBrief.includes('wearable');

  if (isSmartWatch) {
    const scenes: MockScene[] = [
      {
        id: 'mock-scene-1',
        scene_number: 1,
        scene_type: 'hook',
        spoken_line: 'Still checking your phone in every meeting?',
        visual_description: `${avatarName} sits at a clean office desk wearing a stylish smart watch, glancing at a notification on her wrist instead of picking up her phone.`,
        shot_type: 'medium close-up',
        mood: 'Relatable and curious',
        environment: 'Modern office desk with laptop, notebook, coffee cup, and clean professional background',
        avatar_action: 'Raises wrist naturally, notices the alert, then looks toward camera with a confident expression',
        product_visibility: 'Smart watch clearly visible on wrist',
        duration_seconds: 5,
        user_approved: null,
        state: 'awaiting_approval',
        base_image_url: 'https://images.unsplash.com/photo-1492707892657-8d71f6099fc6?w=600&h=400&fit=crop',
      },
      {
        id: 'mock-scene-2',
        scene_number: 2,
        scene_type: 'problem',
        spoken_line: 'As a professional, staying connected without looking distracted is not easy.',
        visual_description: `${avatarName} is in a workday setup with phone face-down while the smart watch quietly shows calls and messages.`,
        shot_type: 'medium shot',
        mood: 'Practical and workday-focused',
        environment: 'Meeting prep setting with laptop, documents, and soft office lighting',
        avatar_action: 'Checks the watch discreetly while staying focused and composed',
        product_visibility: 'Smart watch visible during the wrist-check moment',
        duration_seconds: 5,
        user_approved: null,
        state: 'awaiting_approval',
        base_image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&h=400&fit=crop',
      },
      {
        id: 'mock-scene-3',
        scene_number: 3,
        scene_type: 'proof',
        spoken_line: 'This watch keeps calls, notifications, fitness, and daily updates right on your wrist.',
        visual_description: `Close-up of the stylish smart watch on ${avatarName}'s wrist with a premium workday lifestyle context: laptop, coffee, and notebook nearby.`,
        shot_type: 'product close-up',
        mood: 'Useful, premium, and convincing',
        environment: 'Clean desk setup with warm natural light and professional lifestyle props',
        avatar_action: 'Taps the watch screen and naturally turns wrist toward camera',
        product_visibility: 'Smart watch is the hero object in frame',
        duration_seconds: 5,
        user_approved: null,
        state: 'awaiting_approval',
        base_image_url: 'https://images.unsplash.com/photo-1535639066936-f8bfc85fddbb?w=600&h=400&fit=crop',
      },
      {
        id: 'mock-scene-4',
        scene_number: 4,
        scene_type: 'cta',
        spoken_line: 'Explore the collection and upgrade your everyday style.',
        visual_description: `${avatarName} walks confidently in a smart casual outfit with the watch visible, transitioning from office to lifestyle moment.`,
        shot_type: 'wide / medium shot',
        mood: 'Aspirational, stylish, and confident',
        environment: 'Modern office hallway or clean lifestyle background with premium professional feel',
        avatar_action: 'Looks to camera, gives a subtle smile, and keeps wrist naturally visible',
        product_visibility: 'Smart watch visible as part of the outfit and final CTA moment',
        duration_seconds: 5,
        user_approved: null,
        state: 'awaiting_approval',
        base_image_url: 'https://images.unsplash.com/photo-1524634126288-917f7d995c5c?w=600&h=400&fit=crop',
      },
    ];

    return scenes.slice(0, count);
  }

  return Array.from({ length: count }, (_, i) => ({
    id: `mock-scene-${i + 1}`,
    scene_number: i + 1,
    scene_type: i === 0 ? 'hook' : i === count - 1 ? 'cta' : 'body',
    spoken_line:
      i === 0
        ? `Here is why ${businessBrief} matters.`
        : i === count - 1
          ? `Explore ${businessBrief} and see if it fits your needs.`
          : `${businessBrief} is shown in a clear, practical, and believable way.`,
    visual_description: `${avatarName} presents ${businessBrief} in a realistic lifestyle setting that matches the approved ad strategy.`,
    shot_type: i === 0 ? 'medium close-up' : i === count - 1 ? 'wide / medium shot' : 'medium shot',
    mood: i === 0 ? 'Curious and engaging' : i === count - 1 ? 'Confident and action-oriented' : 'Clear and informative',
    environment: 'Clean lifestyle setup aligned with the selected product and ad style',
    avatar_action: i === 0 ? 'Looks toward camera with a relatable expression' : 'Demonstrates or explains the product naturally',
    product_visibility: 'Product visible when relevant',
    duration_seconds: 5,
    user_approved: null,
    state: 'awaiting_approval',
    base_image_url: MOCK_IMAGES[i % MOCK_IMAGES.length],
  }));
}

export function getRandomMockImage(): string {
  return MOCK_IMAGES[Math.floor(Math.random() * MOCK_IMAGES.length)];
}

export function getMockVoices() {
  return MOCK_VOICES;
}

export function getDefaultMockVoice() {
  return MOCK_VOICES[0]; // Emma
}

export function generateMockVideoUrl(): string {
  return 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAACKmmdWRhdAAAAARtZGF0';
}

export function simulateDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── TOW Stage 1: Brand Brief ───────────────────────────────────────────────
// Structured user input — captured before any generation begins.

export function generateMockBriefData(
  setup?: {
    business_brief?: string;
    ad_style?: string;
    production_path?: string;
    avatar_name?: string;
    platform?: string;
    aspect_ratio?: string;
    tone?: string;
    language?: string;
  }
): BriefData {
  const businessBrief = setup?.business_brief || 'Sample product for busy customers';

  return {
    brand_name: businessBrief,
    product_name: businessBrief,
    target_audience: businessBrief.toLowerCase().includes('professional')
      ? 'Working professionals who want practical, stylish, and useful products for daily life'
      : 'Target customers who need a practical and trustworthy solution',
    problem_being_solved: businessBrief.toLowerCase().includes('watch')
      ? 'They want to stay connected, productive, and stylish without constantly checking their phone'
      : 'They need a clear, trustworthy reason to try the product',
    desired_outcome: businessBrief.toLowerCase().includes('watch')
      ? 'They feel more organized, stylish, and in control throughout the day'
      : 'They understand the product value and feel confident taking action',
    call_to_action: 'Explore the collection',
    trust_points: [],
    must_include: [],
    must_avoid: [],
  };
}

// ── TOW Stage 2: Project State Pack ───────────────────────────────────────
// Project memory / save-file — NOT brand-intelligence extraction.
// Stores the LATEST APPROVED context for every stage so any stage
// can be regenerated with full awareness of prior decisions.

export interface SetupContext {
  avatar_name?: string;
  platform?: string;
  tone?: string;
  language?: string;
  production_path?: 'ai_avatar' | 'storyboard';
}

export function generateMockProjectStatePack(
  category?: string,
  briefData?: BriefData | null,
  businessBrief?: string,
  setup?: SetupContext
): ProjectStatePack {
  // Use real data from setup wizard when available
  const brand = briefData?.brand_name
    ? `${briefData.brand_name} — ${briefData.product_name ?? 'premium product'}`
    : businessBrief
    ? businessBrief.trim().slice(0, 60)
    : 'VidyoBharat — premium brand';

  const offer = briefData?.product_name
    ? `${briefData.product_name} — ${briefData.call_to_action ?? 'see offer'}`
    : businessBrief ?? 'Product details from brief';

  const audience = briefData?.target_audience ?? 'Audience details from brief';

  const platformLabel: Record<string, string> = {
    instagram_reels: 'Instagram Reels (9:16, max 30s)',
    youtube_shorts: 'YouTube Shorts (9:16, max 60s)',
    tiktok: 'TikTok (9:16, max 30s)',
    facebook_feed: 'Facebook Feed (4:5)',
    linkedin: 'LinkedIn (16:9)',
  };

  const categoryLabel: Record<string, string> = {
    ugc_testimonial: 'UGC Testimonial',
    founder_talking_head: 'Founder Talking Head',
    problem_solution: 'Problem-Solution',
    product_demo_lifestyle: 'Product Demo & Lifestyle',
    inner_monologue: 'Inner Monologue',
    cinematic_narration: 'Cinematic Narration',
    cinematic_broll: 'Cinematic B-Roll',
  };

  const assumptions: string[] = [
    `Platform: ${platformLabel[setup?.platform ?? ''] ?? setup?.platform ?? 'Instagram Reels (9:16, max 30s)'}`,
    `Tone: ${setup?.tone ?? 'casual'}`,
    `Language: ${setup?.language ?? 'English'}`,
    `Ad Style: ${categoryLabel[category ?? ''] ?? category ?? 'UGC Testimonial'}`,
    `Production Path: ${setup?.production_path === 'ai_avatar' ? 'AI Avatar' : 'Storyboard'}`,
    ...(setup?.avatar_name ? [`Avatar: ${setup.avatar_name}`] : []),
  ];

  const missingInputs: string[] = [
    'Marketing angle (generated in Stage 3 — Foundation)',
    'Ad format narrative path (confirmed in Stage 4)',
    ...(!(briefData?.brand_name) ? ['Brand name — not specified in brief'] : []),
    ...(!(briefData?.target_audience) ? ['Target audience details — inferred from brief'] : []),
  ];

  return {
    brand,
    offer,
    audience,
    angle: null,
    format: null,
    script_draft: null,
    character_lock_summary: null,
    scene_breakdown_summary: null,
    base_images_summary: null,
    voice_direction: null,
    static_creative_direction: null,
    current_stage: 'Stage 2 — Project State Pack',
    next_step: 'Run Foundation analysis to extract AD DNA, Customer Avatar, and Marketing Angle',
    missing_inputs: missingInputs,
    assumptions,
  };
}

// ── TOW Stage 3: Foundation ────────────────────────────────────────────────
// STRATEGY ONLY. Does NOT generate the script or scene breakdown.
// Outputs: AD DNA, Customer Avatar (7 fields), Campaign Role,
//          Message Map, Main Marketing Angle, Final Strategic Summary.

export function generateMockFoundation(
  category?: string,
  briefData?: BriefData,
  businessBrief?: string,
  setup?: {
    avatar_name?: string;
    platform?: string;
    tone?: string;
    language?: string;
    production_path?: string;
  }
): Foundation {
  const rawBrief =
    businessBrief ||
    briefData?.product_name ||
    briefData?.brand_name ||
    'your product';

  const productName =
    briefData?.product_name ||
    rawBrief;

  const lowerBrief = rawBrief.toLowerCase();

  const isSmartWatch =
    lowerBrief.includes('watch') ||
    lowerBrief.includes('smartwatch') ||
    lowerBrief.includes('smart watch') ||
    lowerBrief.includes('wearable');

  const isProfessional =
    lowerBrief.includes('professional') ||
    lowerBrief.includes('office') ||
    lowerBrief.includes('corporate') ||
    lowerBrief.includes('work');

  const platform = setup?.platform || 'Instagram Reels';
  const tone = setup?.tone || 'casual';
  const adStyle = category || 'ugc_testimonial';

  const audience =
    briefData?.target_audience ||
    (isSmartWatch && isProfessional
      ? 'Working professionals aged 24–40 who want a stylish smart wearable for office, fitness, and daily productivity'
      : isSmartWatch
        ? 'Style-conscious consumers who want a smart wearable that looks good and supports daily life'
        : 'Potential buyers who want a practical, trustworthy solution');

  const problem =
    briefData?.problem_being_solved ||
    (isSmartWatch
      ? 'They want to stay connected, track their day, and look polished without wearing a bulky or overly sporty gadget'
      : `They are interested in ${productName} but need a clear reason to trust it and take action`);

  const desiredOutcome =
    briefData?.desired_outcome ||
    (isSmartWatch
      ? 'Feel more organized, stylish, and in control throughout the workday without constantly checking their phone'
      : `Feel confident that ${productName} is useful, credible, and worth trying`);

  const cta =
    briefData?.call_to_action ||
    (isSmartWatch ? 'Explore the collection / Shop now' : 'Learn more / Shop now');

  const proofPoints =
    briefData?.trust_points?.length
      ? briefData.trust_points
      : isSmartWatch
        ? [
            'Premium-looking design suitable for office and lifestyle use',
            'Smart features for calls, notifications, fitness, and daily productivity',
            'Comfortable everyday wearable that pairs with professional outfits',
          ]
        : [
            'Clear product benefit',
            'Simple buying decision',
            'Designed for everyday use',
          ];

  const customerAvatar: CustomerAvatar = {
    name: isSmartWatch ? 'Aarav Mehta' : 'Target Buyer',
    age_range: isProfessional ? '24–40' : '22–40',
    occupation: isProfessional
      ? 'Working professional / corporate employee / entrepreneur'
      : 'Style-conscious buyer',
    daily_struggle: problem,
    desired_transformation: desiredOutcome,
    what_they_have_tried: isSmartWatch
      ? 'Basic watches, fitness bands, and phone notifications — but none felt stylish and professional enough for daily office use'
      : `Other options similar to ${productName}, but they still need clarity, trust, and a strong reason to choose this one`,
    what_they_truly_want: isSmartWatch
      ? 'A smart watch that looks premium, supports productivity, and fits naturally into work and lifestyle moments'
      : `A simple, believable reason to choose ${productName} without confusion or overthinking`,
  };

  const messageMap: MessageMap = {
    primary_message: isSmartWatch
      ? `${productName} helps professionals look stylish, stay connected, and manage the day smarter — without pulling out their phone every few minutes.`
      : `${productName} gives the viewer a clear, practical reason to take action.`,
    supporting_points: proofPoints,
    emotional_trigger: isSmartWatch
      ? 'The desire to look polished, feel productive, and avoid missing important updates during a busy day'
      : 'The desire to make a confident purchase without feeling confused or misled',
  };

  const mainAngle = isSmartWatch
    ? 'Style meets productivity — a smart watch that fits your workday and your personality'
    : `Make ${productName} feel simple, useful, and worth trying`;

  return {
    ad_dna: isSmartWatch
      ? `A ${tone} ${adStyle.replaceAll('_', ' ')} ad for ${platform}, speaking to busy professionals who want a smart watch that looks stylish, feels premium, and supports everyday productivity.`
      : `A ${tone} ${adStyle.replaceAll('_', ' ')} ad for ${platform}, focused on making ${productName} feel clear, useful, and trustworthy.`,
    customer_avatar: customerAvatar,
    campaign_role: `Conversion — help viewers understand the product quickly and move toward ${cta}`,
    message_map: messageMap,
    main_marketing_angle: mainAngle,
    final_strategic_summary: isSmartWatch
      ? `This ad targets working professionals who want a smart wearable that does not look cheap, bulky, or purely fitness-focused. The strategy is to show how ${productName} fits into real professional life: office meetings, notifications, productivity, fitness tracking, and style. The tone should feel ${tone}, practical, and aspirational without sounding like a hard sell. The creative should make the watch feel like both a style upgrade and a productivity companion.`
      : `This ad should make ${productName} easy to understand and easy to trust. The strategy is to open with the viewer's practical need, show the product's value clearly, and close with a simple call to action. The tone should feel ${tone}, direct, and believable.`,
  };
}

// ── TOW Stage 4: Format Decision ──────────────────────────────────────────
// Compares 6 ad format types. Chooses one. Determines narrative path.
// The FormatDecisionCheckpoint builds its own option cards;
// this function provides the resolved decision after user selection.

export function generateMockFormatDecision(): FormatDecision {
  return {
    selected_format: 'ugc_direct_to_camera',
    selected_path: 'ugc',
    narrative_structure: 'Hook → Problem → Shift → Proof → CTA',
    lipsync_required: true,
    requires_avatar: true,
    recommended_tone: 'Authentic, warm, conversational — feels like a trusted friend sharing a discovery',
  };
}

// ── TOW Stage 6: Character / Face Lock ────────────────────────────────────
// Creates ONE consistent character identity used across ALL scenes.
// Face-Lock Block is appended to every image and video prompt.

export function generateMockCharacterLock(
  avatarId?: string,
  _category?: string,
  briefData?: BriefData,
  setup?: {
    avatar_name?: string;
    avatar_image_url?: string;
    business_brief?: string;
    production_path?: string;
    platform?: string;
    tone?: string;
    language?: string;
  }
): CharacterLock {
  const avatarName =
    setup?.avatar_name ||
    avatarId ||
    'Selected AI Avatar';

  const businessBrief =
    setup?.business_brief ||
    briefData?.product_name ||
    briefData?.brand_name ||
    'your product';

  const lowerBrief = businessBrief.toLowerCase();

  const isSmartWatch =
    lowerBrief.includes('watch') ||
    lowerBrief.includes('smartwatch') ||
    lowerBrief.includes('smart watch') ||
    lowerBrief.includes('wearable');

  const productContext = isSmartWatch
    ? 'stylish smart watches for professionals'
    : businessBrief;

  const characterOverview = `${avatarName} — selected AI avatar/spokesperson for a UGC testimonial about ${productContext}. The character should feel relatable, confident, and credible, like a creator explaining a useful workday upgrade.`;

  const faceLockBlock = `[FACE-LOCK: ${avatarName}] Preserve the selected avatar identity exactly across all frames. Same face, same facial proportions, same skin tone, same hairstyle, same age impression, same overall identity. Do not replace the avatar with a different person. Do not create a new model face. Photorealistic, natural human texture, consistent lighting, no face drift.`;

  const headshotPrompt = `Single realistic headshot reference of ${avatarName}, the selected AI avatar/spokesperson for a ${productContext} ad. Chest-up framing, looking naturally toward camera, confident and approachable expression, clean modern background, professional creator-style look, natural lighting, photorealistic detail. ${faceLockBlock}`;

  return {
    character_overview: characterOverview,

    face_details: {
      age_range: 'Late 20s to early 30s',
      eye_color: 'Preserve selected avatar eye color',
      facial_structure: 'Preserve selected avatar facial structure exactly',
      notable_features: 'Preserve selected avatar’s unique facial identity, expression style, and natural creator look',
    },

    skin: {
      tone: 'Preserve selected avatar skin tone',
      texture: 'Natural human skin texture with realistic detail',
      notes: 'No artificial beauty filter, no plastic skin, no identity drift',
    },

    hair: {
      length: 'Preserve selected avatar hair length',
      color: 'Preserve selected avatar hair color',
      style: 'Preserve selected avatar hairstyle unless user explicitly changes it',
    },

    outfit: {
      style: isSmartWatch
        ? 'Smart casual / professional creator outfit suitable for office, meetings, commute, and lifestyle content'
        : 'Clean creator-style outfit suitable for the selected product and ad format',
      colors: 'Neutral, premium, and non-distracting colors',
      accessories: isSmartWatch
        ? 'The smart watch may be visible on wrist when relevant; avoid distracting accessories'
        : 'Minimal accessories that do not distract from the product',
    },

    vibe_environment: isSmartWatch
      ? 'Modern workday lifestyle setting — office desk, meeting prep, commute, coffee table, laptop setup, or clean professional background. The environment should communicate productivity, style, and everyday professional life.'
      : 'Clean, realistic lifestyle environment aligned with the selected product and ad format.',

    realism_rules: [
      `Preserve ${avatarName}'s selected avatar identity across all scenes`,
      'Do not replace the selected avatar with another face or random model',
      isSmartWatch
        ? 'Smart watch must remain visually consistent whenever shown'
        : 'Product must remain visually consistent whenever shown',
      isSmartWatch
        ? 'No skincare products, serum bottles, bathroom vanity, beauty routine, or skin transformation scenes'
        : 'No unrelated product category objects or visual cues',
      'Keep environment aligned with the business brief, platform, and ad style',
      'No AI artifacts: no extra fingers, melted edges, distorted accessories, or face drift',
    ],

    face_lock_block: faceLockBlock,

    headshot_image_prompt: headshotPrompt,

    skin_enhancer_prompt:
      'Photorealistic human skin with natural texture, visible pores, realistic lighting, subtle imperfections, no plastic smoothing, no waxy finish, no over-retouching. Preserve selected avatar identity exactly.',
  };
}

// ── TOW Stage 9: Video Motion Prompts ─────────────────────────────────────
// Motion prompts derived FROM approved base images.
// Does NOT create new image prompts — only motion directives for video generation.
// Per scene: camera_behavior, subject_movement, environment_movement,
//             continuity_rules, negative_motion_rules.

export function generateMockVideoPrompts(sceneCount: number = 3): SceneVideoPrompt[] {
  const sceneMotions = [
    {
      camera_behavior: 'Slow push-in from medium shot to wrist-and-face framing over 5 seconds. Start at office desk level and settle on Chitrakala raising her wrist naturally.',
      subject_movement:   'Chitrakala naturally raises her wrist, glances at the smart watch notification, then looks back toward camera with a confident expression.',
      environment_movement:   'Subtle office ambience only: laptop screen glow, soft background blur, no distracting motion.',
      continuity_rules: [
        'Face-lock block applied: identical facial features as approved base image',
        'Skin luminosity and tone must match base image exactly',
        'Smart casual / professional outfit remains consistent with Character Lock',
        'Lighting must match the approved office/workday storyboard frame',
        'Smart watch shape, strap, screen position, and wrist placement must remain consistent',
      ],
      negative_motion_rules: [
        'NO face drift or morphing between frames',
        'NO background objects appearing or disappearing',
        'NO skin tone shift across the 5-second clip',
        'NO camera shake or jump cuts',
        'NO AI artifacts: no melted edges, no extra fingers visible',
      ],
      reference_mood: 'Warm and relatable',
      lipsync_required: true,
      duration_seconds: 5,
    },
    {
      camera_behavior: 'Static medium shot for first 2 seconds, then gentle pan right 10 degrees following product as subject holds it up. Ends on product close-up in subject\'s hand.',
      subject_movement: 'Subject lifts product bottle with right hand at second 2, holds it label-forward for 2 seconds, then sets it down gently. Natural arm movement, no stiffness.',
      environment_movement: 'Bathroom mirror reflects soft ambient light. Subtle steam effect in background. No other movement elements.',
      continuity_rules: [
        'Product bottle identical to approved base image — same label, same orientation',
        'Hand and arm skin tone consistent with character face lock',
        'Background vanity setup unchanged from base image',
        'Lighting angle consistent with scene 1',
      ],
      negative_motion_rules: [
        'NO face drift or morphing between frames',
        'NO smart watch changing shape, color, size, or wrist position',
        'NO fake unreadable UI text appearing on the watch screen',
        'NO random background objects appearing or disappearing',
        'NO camera shake or jump cuts unless explicitly requested',
        'NO AI artifacts: extra fingers, melted wrist, distorted watch strap, warped screen',
      ],
      reference_mood: 'Confident and informative',
      lipsync_required: false,
      duration_seconds: 5,
    },
    {
      camera_behavior: 'Starts on face close-up, pulls back to medium shot over first 3 seconds to reveal full upper body. Ends static on medium shot with product visible on vanity.',
      subject_movement: 'Subject smiles warmly at second 1, slight nod at second 3 as if concluding a recommendation. Relaxed posture throughout. Natural breathing visible.',
      environment_movement: 'Window light brightens slightly at second 2 (morning sun effect). Very gentle bokeh movement in background plants. No dramatic changes.',
      continuity_rules: [
        'Face expression matches approved base image — same smile, same eye direction',
        'Hair placement consistent with all prior scenes',
        'Product visible on vanity in background — identical to scene 2',
        'Outfit (cream top) matches character lock exactly',
      ],
      negative_motion_rules: [
        'NO face structure change during the pull-back move',
        'NO skin tone shift between close-up and medium framing',
        'NO background objects appearing that were not in base image',
        'NO CTA text or overlays generated by AI — these are added in post',
        'NO lipsync animation — this scene is silent (VO only)',
      ],
      reference_mood: 'Excited and persuasive',
      lipsync_required: true,
      duration_seconds: 5,
    },
  ];

  return Array.from({ length: sceneCount }, (_, i) => ({
    scene_number: i + 1,
    ...sceneMotions[i % sceneMotions.length],
  }));
}

// ── TOW Stage 12: QC Report ───────────────────────────────────────────────
// 11-point semantic checklist + numeric scores (0–10).

export function generateMockQCReport(): QCReport {
  const checklist: QCChecklistItem[] = [
    {
      label: 'Script Clarity',
      passed: true,
      note: 'Each line is immediately understandable on first listen.',
    },
    {
      label: 'Conversion Strength',
      passed: true,
      note: 'Strong hook, clear benefit, risk-reversal CTA present.',
    },
    {
      label: 'Visual Continuity',
      passed: true,
      note: 'Background, lighting and framing are consistent across all 3 scenes.',
    },
    {
      label: 'Realism Quality',
      passed: true,
      note: 'No AI artifacts detected. Skin texture, hair, and edges look photorealistic.',
    },
    {
      label: 'Face Consistency',
      passed: true,
      note: 'Character face matches the face-lock block across all scenes — no drift detected.',
    },
    {
      label: 'Product Lock',
      passed: true,
      note: 'Product bottle is visible and correctly labeled in every scene it appears.',
    },
    {
      label: 'Lighting Consistency',
      passed: false,
      note: 'Scene 2 shows a slight cool shift vs warm lighting in scenes 1 and 3. Recommend re-generation.',
    },
    {
      label: 'Voice Quality',
      passed: true,
      note: 'Voiceover is clear, paced correctly, and matches the emotional beats of each scene.',
    },
    {
      label: 'Platform Fit',
      passed: true,
      note: '9:16 vertical format confirmed. First 3 seconds passes the thumb-stop test.',
    },
    {
      label: 'Editing Readiness',
      passed: true,
      note: 'Scene clips are clean and ready for stitching — no mid-clip artifacts or freeze frames.',
    },
    {
      label: 'Lipsync Quality',
      passed: false,
      note: 'Scene 1 lipsync has a 0.2s audio offset. Audio leads video slightly.',
    },
  ];

  const numericScores = {
    visual_consistency: 8.7,
    audio_sync: 8.2,
    lipsync_accuracy: 7.6,
    brand_alignment: 9.1,
    platform_readiness: 9.3,
  };

  const overall =
    Object.values(numericScores).reduce((a, b) => a + b, 0) / Object.values(numericScores).length;

  const cap = (n: number) => Math.min(10, parseFloat(n.toFixed(1)));
  const failCount = checklist.filter((c) => !c.passed).length;

  return {
    ...numericScores,
    visual_consistency: cap(numericScores.visual_consistency),
    audio_sync: cap(numericScores.audio_sync),
    lipsync_accuracy: cap(numericScores.lipsync_accuracy),
    brand_alignment: cap(numericScores.brand_alignment),
    platform_readiness: cap(numericScores.platform_readiness),
    overall: cap(overall),
    checklist,
    issues: failCount > 0
      ? [
          'Scene 2 lighting temperature inconsistent — slight cool shift vs warm baseline',
          'Scene 1 lipsync offset 0.2s — audio leads video',
        ]
      : [],
    passed: overall >= 7.5 && failCount <= 2,
  };
}

// ── Utilities ──────────────────────────────────────────────────────────────

/** @deprecated Use generateMockProjectStatePack() for TOW Stage 2 mock data */
export function generateLegacyMockProjectStatePack(
  category: string,
  businessBrief: string
): Record<string, unknown> {
  // Legacy shape kept for any old consumers; prefer generateMockProjectStatePack()
  return {
    brand_name: 'VidyoBharat',
    product_name: businessBrief.trim().split(/\s+/).slice(0, 4).join(' ') || 'Premium Product',
    target_audience: 'Young professionals, 25–40, urban India',
    core_message: `Experience the difference with our ${category} approach to quality and value.`,
    unique_selling_points: [
      'Premium quality at accessible pricing',
      'Trusted by 50,000+ customers across India',
      'Fast delivery & hassle-free returns',
    ],
    tone_of_voice: category === 'ugc_testimonial' ? 'Authentic, conversational, relatable' : 'Professional, confident, aspirational',
    key_emotions: ['Trust', 'Excitement', 'Aspiration'],
    call_to_action: 'Shop Now — Limited Time Offer',
  };
}
