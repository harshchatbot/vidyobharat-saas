import { redirect } from 'next/navigation';

/** Legacy SFX approval URL now uses the protected Admin Studio audio library. */
export default function SfxApprovalRedirect() {
  redirect('/admin/audio-library');
}
