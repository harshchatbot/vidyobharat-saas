import {
  Building2,
  Cpu,
  Landmark,
  Package2,
  Rocket,
  ScrollText,
  Sparkles,
  Crown,
  MonitorSmartphone,
  WandSparkles,
} from 'lucide-react';

import type { AIVideoModel, TTSLanguageOption, TTSVoiceOption } from '@/types/api';
import { buildVideoModelsForApiFallback, getVideoModelMap } from '@/config/videoModels';

export type TemplateOption = {
  key: string;
  label: string;
  description: string;
  icon: typeof ScrollText;
  scriptHint: string;
  topicHint: string;
};

export const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    key: 'custom',
    label: 'No Template',
    description: 'Start fully from scratch with your own topic and script.',
    icon: WandSparkles,
    scriptHint: 'Write your own script. If you click Generate Script with existing text, it will be enhanced into narrator + scene blocks + camera/mood cues + CTA.',
    topicHint: 'Describe your video idea (optional if script is already written)',
  },
  {
    key: 'music-video',
    label: 'Music Video',
    description: 'Beat-led visuals, performance energy, and rhythmic scene flow.',
    icon: Sparkles,
    scriptHint: 'Open with a strong mood hook, describe beat shifts and scene transitions, build momentum, and end with a memorable drop or signature close.',
    topicHint: 'A late-night rooftop performance with neon city lights and cinematic beat drops',
  },
  {
    key: 'explainer-video',
    label: 'Explainer Video',
    description: 'Simple step-by-step explainers for product, business, or education.',
    icon: ScrollText,
    scriptHint: 'Start with the core problem, explain the concept in simple steps, show practical value, and close with a clear next action.',
    topicHint: 'How AI video generation helps creators publish faster',
  },
  {
    key: 'character-vlog',
    label: 'Character Vlog',
    description: 'Persona-led monologue format with expressive first-person storytelling.',
    icon: Crown,
    scriptHint: 'Write in first person, establish the character voice quickly, narrate one focused moment, and end with a punchy personality-led CTA.',
    topicHint: 'A creator sharing one breakthrough lesson from their daily content routine',
  },
  {
    key: 'asmr-video',
    label: 'ASMR Video',
    description: 'Calm, sensory-rich scripts with soft pacing and immersive ambience.',
    icon: WandSparkles,
    scriptHint: 'Use gentle sensory language, keep sentence rhythm slow and soothing, describe texture and sound cues, and close softly.',
    topicHint: 'Rain on window glass with soft lamp light and whispered narration',
  },
  {
    key: 'storyboard',
    label: 'Build Storyboard',
    description: 'Scene-by-scene planning format for structured video production.',
    icon: MonitorSmartphone,
    scriptHint: 'Break the idea into sequential scenes, define visual intent per scene, include transitions, and end with final shot direction.',
    topicHint: 'A 6-scene storyboard for launching a new creator tool',
  },
  {
    key: 'history',
    label: 'History',
    description: 'Dramatic stories, timelines, and big turning points.',
    icon: Landmark,
    scriptHint: 'Open with a compelling moment, give context, explain why it mattered, and close with a memorable takeaway.',
    topicHint: 'The rise of the Maurya empire',
  },
  {
    key: 'mythology',
    label: 'Mythology',
    description: 'Epic stories, characters, and emotional retellings.',
    icon: Sparkles,
    scriptHint: 'Introduce the character, reveal the conflict, add emotion, and land the moral clearly.',
    topicHint: 'Lord Krishna guiding Arjuna on the battlefield',
  },
  {
    key: 'tech',
    label: 'Tech',
    description: 'Explainers, launches, AI tools, and product demos.',
    icon: Cpu,
    scriptHint: 'Start with the problem, simplify the concept, show the benefit, and end with a strong creator CTA.',
    topicHint: 'How AI voice cloning changes content creation',
  },
  {
    key: 'startup',
    label: 'Startup',
    description: 'Pitch-style content, founder stories, and launches.',
    icon: Rocket,
    scriptHint: 'Frame the market pain, your solution, traction, and why users should care right now.',
    topicHint: 'A startup helping local sellers create video ads',
  },
  {
    key: 'product',
    label: 'Product',
    description: 'Showcases, benefits, and polished marketing videos.',
    icon: Package2,
    scriptHint: 'Introduce the product, highlight core features, show outcomes, and close with a clear action.',
    topicHint: 'Premium ayurvedic skincare launch',
  },
  {
    key: 'real-estate',
    label: 'Real Estate',
    description: 'Property tours, amenities, and locality-focused reels.',
    icon: Building2,
    scriptHint: 'Open with the property value, walk through amenities, mention location, and close with a viewing CTA.',
    topicHint: 'Luxury 3BHK in Gurgaon with skyline views',
  },
];

export const LANGUAGE_OPTIONS: TTSLanguageOption[] = [
  { code: 'en-IN', label: 'English', native_label: 'English' },
  { code: 'hi-IN', label: 'Hindi', native_label: 'हिन्दी' },
  { code: 'hi-IN', label: 'Hinglish', native_label: 'Hinglish' },
  { code: 'bn-IN', label: 'Bengali', native_label: 'বাংলা' },
  { code: 'gu-IN', label: 'Gujarati', native_label: 'ગુજરાતી' },
  { code: 'kn-IN', label: 'Kannada', native_label: 'ಕನ್ನಡ' },
  { code: 'ml-IN', label: 'Malayalam', native_label: 'മലയാളം' },
  { code: 'mr-IN', label: 'Marathi', native_label: 'मराठी' },
  { code: 'od-IN', label: 'Odia', native_label: 'ଓଡ଼ିଆ' },
  { code: 'pa-IN', label: 'Punjabi', native_label: 'ਪੰਜਾਬੀ' },
  { code: 'ta-IN', label: 'Tamil', native_label: 'தமிழ்' },
  { code: 'te-IN', label: 'Telugu', native_label: 'తెలుగు' },
];

export const VOICE_OPTIONS: TTSVoiceOption[] = [
  { key: 'Shubh', label: 'Shubh', tone: 'Balanced male', gender: 'male', provider_voice: 'shubh', supported_language_codes: ['en-IN'], description: 'Versatile Sarvam voice for English explainers, education, and general creator narration.' },
  { key: 'Aditya', label: 'Aditya', tone: 'Confident male', gender: 'male', provider_voice: 'aditya', supported_language_codes: ['en-IN', 'hi-IN', 'bn-IN', 'gu-IN', 'mr-IN', 'pa-IN'], description: 'Clear storyteller voice for startup, product, and tech explainers.' },
  { key: 'Rahul', label: 'Rahul', tone: 'Warm male', gender: 'male', provider_voice: 'rahul', supported_language_codes: ['en-IN', 'hi-IN', 'bn-IN', 'gu-IN', 'mr-IN', 'pa-IN'], description: 'Friendly male narration for accessible creator content.' },
  { key: 'Rohan', label: 'Rohan', tone: 'Polished male', gender: 'male', provider_voice: 'rohan', supported_language_codes: ['en-IN', 'hi-IN', 'mr-IN', 'ta-IN', 'te-IN'], description: 'Professional male delivery for branded and polished videos.' },
  { key: 'Amit', label: 'Amit', tone: 'Steady male', gender: 'male', provider_voice: 'amit', supported_language_codes: ['en-IN', 'hi-IN', 'gu-IN', 'mr-IN'], description: 'Steady male narration for neutral explainers and promos.' },
  { key: 'Dev', label: 'Dev', tone: 'Deep male', gender: 'male', provider_voice: 'dev', supported_language_codes: ['en-IN', 'hi-IN'], description: 'Stronger dramatic male tone for cinematic or intense scripts.' },
  { key: 'Ratan', label: 'Ratan', tone: 'Grounded male', gender: 'male', provider_voice: 'ratan', supported_language_codes: ['en-IN', 'hi-IN', 'bn-IN', 'od-IN'], description: 'Grounded male voice for informative and educational narration.' },
  { key: 'Varun', label: 'Varun', tone: 'Young male', gender: 'male', provider_voice: 'varun', supported_language_codes: ['en-IN', 'hi-IN', 'mr-IN', 'ta-IN', 'te-IN'], description: 'Youthful male tone for fast creator videos and social clips.' },
  { key: 'Manan', label: 'Manan', tone: 'Neutral male', gender: 'male', provider_voice: 'manan', supported_language_codes: ['en-IN', 'hi-IN', 'bn-IN', 'gu-IN', 'mr-IN', 'pa-IN'], description: 'Neutral male delivery for general-purpose narration.' },
  { key: 'Sumit', label: 'Sumit', tone: 'Clear male', gender: 'male', provider_voice: 'sumit', supported_language_codes: ['en-IN', 'hi-IN', 'bn-IN', 'gu-IN', 'mr-IN', 'pa-IN'], description: 'Clear male voice for instructional or product-led content.' },
  { key: 'Kabir', label: 'Kabir', tone: 'Broadcast male', gender: 'male', provider_voice: 'kabir', supported_language_codes: ['en-IN', 'hi-IN'], description: 'Anchor-style male voice for commentary and educational reels.' },
  { key: 'Aayan', label: 'Aayan', tone: 'Light male', gender: 'male', provider_voice: 'aayan', supported_language_codes: ['en-IN', 'hi-IN', 'bn-IN', 'gu-IN', 'mr-IN', 'pa-IN'], description: 'Lighter male voice for energetic creator-facing narration.' },
  { key: 'Ashutosh', label: 'Ashutosh', tone: 'Formal male', gender: 'male', provider_voice: 'ashutosh', supported_language_codes: ['en-IN', 'hi-IN'], description: 'Formal male tone for corporate and training content.' },
  { key: 'Advait', label: 'Advait', tone: 'Measured male', gender: 'male', provider_voice: 'advait', supported_language_codes: ['en-IN', 'hi-IN', 'mr-IN', 'ta-IN', 'te-IN'], description: 'Measured male narration for premium explainers.' },
  { key: 'Anand', label: 'Anand', tone: 'Deep male', gender: 'male', provider_voice: 'anand', supported_language_codes: ['en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN'], description: 'Deeper cinematic tone for dramatic storytelling.' },
  { key: 'Tarun', label: 'Tarun', tone: 'Friendly male', gender: 'male', provider_voice: 'tarun', supported_language_codes: ['en-IN', 'hi-IN', 'bn-IN', 'gu-IN', 'mr-IN', 'pa-IN'], description: 'Friendly and balanced male voice for everyday content.' },
  { key: 'Sunny', label: 'Sunny', tone: 'Energetic male', gender: 'male', provider_voice: 'sunny', supported_language_codes: ['en-IN', 'hi-IN', 'bn-IN', 'gu-IN', 'mr-IN', 'pa-IN'], description: 'More upbeat male narration for engaging short-form content.' },
  { key: 'Mani', label: 'Mani', tone: 'Warm male', gender: 'male', provider_voice: 'mani', supported_language_codes: ['en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN'], description: 'Warm, conversational male voice for regional storytelling.' },
  { key: 'Gokul', label: 'Gokul', tone: 'Natural male', gender: 'male', provider_voice: 'gokul', supported_language_codes: ['en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN'], description: 'Natural male delivery for grounded scenes and local stories.' },
  { key: 'Vijay', label: 'Vijay', tone: 'Confident male', gender: 'male', provider_voice: 'vijay', supported_language_codes: ['en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN'], description: 'Confident male voice for authoritative delivery.' },
  { key: 'Mohit', label: 'Mohit', tone: 'Balanced male', gender: 'male', provider_voice: 'mohit', supported_language_codes: ['en-IN', 'hi-IN', 'gu-IN', 'mr-IN'], description: 'Balanced male narration for general creator workflows.' },
  { key: 'Rehan', label: 'Rehan', tone: 'Smooth male', gender: 'male', provider_voice: 'rehan', supported_language_codes: ['en-IN', 'hi-IN', 'bn-IN', 'gu-IN', 'mr-IN', 'pa-IN'], description: 'Smooth male voice for polished branded content.' },
  { key: 'Soham', label: 'Soham', tone: 'Young male', gender: 'male', provider_voice: 'soham', supported_language_codes: ['en-IN', 'hi-IN', 'bn-IN', 'gu-IN', 'mr-IN', 'pa-IN'], description: 'Modern male tone for social and youth-focused scripts.' },
  { key: 'Ritu', label: 'Ritu', tone: 'Clear female', gender: 'female', provider_voice: 'ritu', supported_language_codes: ['en-IN', 'hi-IN', 'bn-IN', 'gu-IN', 'mr-IN', 'pa-IN'], description: 'Natural female narration for clean explainers and tutorials.' },
  { key: 'Priya', label: 'Priya', tone: 'Bright female', gender: 'female', provider_voice: 'priya', supported_language_codes: LANGUAGE_OPTIONS.map((item) => item.code), description: 'Lively female voice for social, product, and short-form content.' },
  { key: 'Neha', label: 'Neha', tone: 'Friendly female', gender: 'female', provider_voice: 'neha', supported_language_codes: ['en-IN', 'hi-IN', 'bn-IN', 'gu-IN', 'mr-IN', 'pa-IN'], description: 'Friendly female narration for everyday brand and social use.' },
  { key: 'Pooja', label: 'Pooja', tone: 'Balanced female', gender: 'female', provider_voice: 'pooja', supported_language_codes: ['en-IN', 'hi-IN', 'gu-IN', 'mr-IN'], description: 'Balanced female delivery for versatile creator workflows.' },
  { key: 'Simran', label: 'Simran', tone: 'Expressive female', gender: 'female', provider_voice: 'simran', supported_language_codes: ['en-IN', 'hi-IN', 'bn-IN', 'gu-IN', 'mr-IN', 'pa-IN'], description: 'Energetic female voice for creator-led storytelling.' },
  { key: 'Kavya', label: 'Kavya', tone: 'Soft female', gender: 'female', provider_voice: 'kavya', supported_language_codes: ['en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN'], description: 'Gentle storytelling tone for mythology and devotional themes.' },
  { key: 'Ishita', label: 'Ishita', tone: 'Calm female', gender: 'female', provider_voice: 'ishita', supported_language_codes: ['en-IN', 'hi-IN', 'mr-IN', 'ta-IN', 'te-IN'], description: 'Composed female voice for premium brand narration.' },
  { key: 'Shreya', label: 'Shreya', tone: 'Polished female', gender: 'female', provider_voice: 'shreya', supported_language_codes: ['en-IN', 'hi-IN', 'bn-IN', 'gu-IN', 'mr-IN', 'pa-IN'], description: 'Polished female voice for premium content and tutorials.' },
  { key: 'Roopa', label: 'Roopa', tone: 'Mature female', gender: 'female', provider_voice: 'roopa', supported_language_codes: ['en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN'], description: 'More grounded female delivery for documentary-style scripts.' },
  { key: 'Amelia', label: 'Amelia', tone: 'Global female', gender: 'female', provider_voice: 'amelia', supported_language_codes: ['en-IN', 'hi-IN'], description: 'Refined female voice for premium and cosmopolitan content.' },
  { key: 'Sophia', label: 'Sophia', tone: 'Crisp female', gender: 'female', provider_voice: 'sophia', supported_language_codes: ['en-IN', 'hi-IN'], description: 'Crisp female narration for sharp, clean product storytelling.' },
  { key: 'Tanya', label: 'Tanya', tone: 'Modern female', gender: 'female', provider_voice: 'tanya', supported_language_codes: ['en-IN', 'hi-IN', 'bn-IN', 'gu-IN', 'mr-IN', 'pa-IN'], description: 'Modern female voice for social-first creator workflows.' },
  { key: 'Shruti', label: 'Shruti', tone: 'Warm female', gender: 'female', provider_voice: 'shruti', supported_language_codes: ['en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN'], description: 'Warm female narration for emotional or community-led content.' },
  { key: 'Suhani', label: 'Suhani', tone: 'Gentle female', gender: 'female', provider_voice: 'suhani', supported_language_codes: ['en-IN', 'hi-IN', 'mr-IN', 'ta-IN', 'te-IN'], description: 'Gentle female voice for softer storytelling and lifestyle content.' },
  { key: 'Kavitha', label: 'Kavitha', tone: 'Mature female', gender: 'female', provider_voice: 'kavitha', supported_language_codes: ['en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN'], description: 'Measured female voice for regional and documentary-style content.' },
  { key: 'Rupali', label: 'Rupali', tone: 'Rich female', gender: 'female', provider_voice: 'rupali', supported_language_codes: ['en-IN', 'hi-IN', 'bn-IN', 'od-IN'], description: 'Richer female tone for premium narrative voiceovers.' },
];

export const CAPTION_STYLE_OPTIONS = ['Classic', 'Bold', 'Minimal'] as const;

export const ASPECT_OPTIONS = [
  { value: '9:16', label: '9:16', description: 'Vertical output for reels, shorts, and story-style videos.' },
  { value: '16:9', label: '16:9', description: 'Landscape output for YouTube, web, and presentation-style videos.' },
  { value: '1:1', label: '1:1', description: 'Square output for feeds, ads, and balanced social posts.' },
] as const;

export const RESOLUTION_OPTIONS = [
  { value: '720p', label: '1K (720p)', description: 'Faster generation with lighter credit usage.' },
  { value: '1080p', label: '2K (1080p)', description: 'Higher fidelity output for final publishing.' },
] as const;

export const RESOLUTION_DISPLAY_OPTIONS = [
  { value: '720p', label: '1K (720p)', description: 'Faster generation with lighter credit usage.' },
  { value: '1080p', label: '2K (1080p)', description: 'Higher fidelity output for final publishing.' },
  { value: '2160p', label: '4K (2160p)', description: 'Coming soon. Not available for current models yet.' },
] as const;

export const VIDEO_QUALITY_OPTIONS = [
  { value: 'standard', label: 'Standard', description: 'Balanced output quality with lower credit usage.' },
  { value: 'high', label: 'High', description: 'Higher compute quality for more polished motion and detail.' },
] as const;

export const AUDIO_QUALITY_OPTIONS = [
  { value: 8000, label: '8 kHz', description: 'Lowest bandwidth. Suitable for basic speech testing.' },
  { value: 22050, label: '22 kHz', description: 'Balanced quality for most reels and previews.' },
  { value: 48000, label: '48 kHz', description: 'Highest fidelity. Best for premium narration output.' },
] as const;

const VIDEO_MODEL_MAP = getVideoModelMap();

export const VIDEO_OUTPUT_RULES = Object.fromEntries(
  Object.entries(VIDEO_MODEL_MAP).map(([key, model]) => [
    key,
    {
      aspects: model.supportedAspectRatios,
      resolutions: model.supportedResolutions,
      sizes: model.sizes,
    },
  ]),
) as Record<string, { aspects: string[]; resolutions: string[]; sizes: Record<string, Record<string, string>> }>;

export const VIDEO_DURATION_RULES = Object.fromEntries(
  Object.entries(VIDEO_MODEL_MAP).map(([key, model]) => [
    key,
    {
      defaultSeconds: model.defaultDurationSeconds,
      presetSeconds: model.durationPresets,
      seededSeconds: model.seededDurationSeconds,
      minSeconds: model.minDurationSeconds,
      maxSeconds: model.maxDurationSeconds,
      helperText: model.durationHelperText,
    },
  ]),
) as Record<string, { defaultSeconds: number; presetSeconds: number[]; seededSeconds?: number; minSeconds?: number; maxSeconds?: number; helperText: string }>;

export const FALLBACK_VIDEO_MODELS: AIVideoModel[] = buildVideoModelsForApiFallback();

export const MODEL_ICONS: Record<string, typeof Crown> = {
  sora2: Crown,
  sora2_pro: Sparkles,
  veo3: MonitorSmartphone,
  kling3: WandSparkles,
};
