'use client';

import React from 'react';

import { SignInPage, type Testimonial } from '@/components/ui/sign-in';

const sampleTestimonials: Testimonial[] = [
  {
    avatarSrc: 'https://randomuser.me/api/portraits/women/57.jpg',
    name: 'Sarah Chen',
    handle: '@sarahdigital',
    text: 'Amazing platform! The user experience is seamless and the features are exactly what I needed.',
  },
  {
    avatarSrc: 'https://randomuser.me/api/portraits/men/64.jpg',
    name: 'Marcus Johnson',
    handle: '@marcustech',
    text: 'This service has transformed how I work. Clean design, powerful features, and excellent support.',
  },
  {
    avatarSrc: 'https://randomuser.me/api/portraits/men/32.jpg',
    name: 'David Martinez',
    handle: '@davidcreates',
    text: "I've tried many platforms, but this one stands out. Intuitive, reliable, and genuinely helpful for productivity.",
  },
];

export default function SignInPageDemo() {
  const handleSignIn = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const data = Object.fromEntries(formData.entries());
    console.log('Sign In submitted:', data);
    window.alert('Sign In Submitted! Check the browser console for form data.');
  };

  return (
    <div className="bg-bg text-text">
      <SignInPage
        heroImageSrc="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1600&q=80"
        testimonials={sampleTestimonials}
        onSignIn={handleSignIn}
        onGoogleSignIn={() => window.alert('Continue with Google clicked')}
        onResetPassword={() => window.alert('Reset Password clicked')}
        onCreateAccount={() => window.alert('Create Account clicked')}
      />
    </div>
  );
}
