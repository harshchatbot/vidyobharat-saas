import type { CreditHistoryItem } from '@/types/api';

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatCreditFeatureLabel(item: CreditHistoryItem) {
  const feature = String(item.featureName || '').trim();
  const normalized = feature.toLowerCase();

  if (normalized === 'monthly_reset') return 'Monthly credit refill';
  if (normalized === 'activation_bonus') return 'Activation bonus';
  if (normalized === 'topup') return 'Top-up credits';
  if (normalized === 'image_generate') return 'Image generation';
  if (normalized === 'image_generate_free') return 'Free image generation';
  if (normalized === 'video_create') return 'Video generation';
  if (normalized === 'video_create_free') return 'Free video generation';
  if (normalized === 'video_create_failed_status') return 'Video refund';
  if (normalized === 'video_create_provider_error') return 'Video refund';
  if (normalized === 'video_create_error') return 'Video refund';
  if (normalized === 'video_create_timed_out') return 'Video refund';
  if (normalized === 'script_enhance') return 'Script enhance';
  if (normalized === 'tts_preview') return 'Voice preview';
  if (normalized === 'template_generate_image') return 'Template image generation';
  if (normalized === 'template_generate_video') return 'Template video generation';
  if (normalized === 'image_generate_failed_status') return 'Image refund';
  if (normalized === 'image_generate_error') return 'Image refund';
  if (normalized === 'template_generate_image_failed') return 'Template image refund';
  if (normalized === 'template_generate_image_error') return 'Template image refund';
  if (normalized === 'template_generate_video_error') return 'Template video refund';
  if (normalized === 'template_generate_video_unhandled_error') return 'Template video refund';
  if (normalized === 'influencer_image_generate') return 'Influencer image generation';
  if (normalized === 'influencer_content_generate') return 'Influencer content generation';
  if (normalized === 'influencer_reference_lock') return 'Reference lock';
  if (normalized === 'video_create_model_reconcile') return 'Video pricing adjustment';

  if (normalized.startsWith('image_action:')) {
    return `${titleCase(normalized.split(':')[1] || 'image action')}`;
  }

  return titleCase(feature || 'Credit activity');
}

export function formatCreditSourceLabel(item: CreditHistoryItem) {
  const source = String(item.source || '').trim().toLowerCase();

  if (source === 'topup') return 'Top-up';
  if (source === 'bonus') return 'Bonus';
  if (source === 'free') return 'Free tier';
  if (source === 'premium') return 'Premium usage';
  if (source === 'refund') return 'Refund';
  if (source === 'monthly_reset') return 'Monthly refill';

  return titleCase(item.source || 'System');
}
