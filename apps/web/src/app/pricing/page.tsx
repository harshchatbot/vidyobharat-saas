'use client';

import Link from 'next/link';
import { ArrowRight, Coins, Sparkles, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

const plans = [
  {
    name: 'Free',
    price: '₹0',
    cadence: '/month',
    credits: 25,
    features: ['Basic image generation', 'Basic voices', 'Starter studio access'],
  },
  {
    name: 'Creator',
    price: '₹999',
    cadence: '/month',
    credits: 250,
    featured: true,
    features: ['Premium images and videos', 'Sarvam voice options', 'Faster iteration budget'],
  },
  {
    name: 'Pro',
    price: '₹2,999',
    cadence: '/month',
    credits: 1000,
    features: ['High monthly generation volume', 'Team-ready usage budget', 'Best for agencies and studios'],
  },
];

const actionCosts = [
  ['Premium Voice Generation', '3 credits'],
  ['Premium Voice Preview', '1 credit'],
  ['Voice Retry', '2 credits'],
  ['Premium Image Generation', '3 credits'],
  ['Image Upscale', '1 credit'],
  ['Premium Video 720p / 15s', '10 credits'],
  ['Premium Video 1080p / 15s', '15 credits'],
  ['Character Consistency Add-on', '+5 credits'],
  ['Script Enhance', '1 credit'],
  ['Auto Caption', '1 credit'],
  ['Auto Tag', '1 credit'],
  ['48 kHz Audio Quality Modifier', '+1 credit'],
];

export default function PricingPage() {
  return (
    <div className="space-y-8">
      <Card className="space-y-4">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-accent))]">Pricing</p>
          <h1 className="mt-2 font-heading text-3xl font-extrabold tracking-tight text-text">Simple credit-based plans for creators and teams</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Credits stay transparent across voice, image, and video generation. Estimate cost before every run, top up when needed, and scale from solo creation to production workloads.
          </p>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card
            key={plan.name}
            className={`space-y-5 ${
              plan.featured ? 'border-[hsl(var(--color-accent))] shadow-soft' : ''
            }`}
          >
            <div className="space-y-2">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]">
                {plan.featured ? <Sparkles className="h-5 w-5" /> : <Wallet className="h-5 w-5" />}
              </div>
              <p className="font-heading text-2xl font-extrabold text-text">{plan.name}</p>
              <p className="text-sm text-muted">{plan.credits} included credits</p>
            </div>
            <div>
              <span className="font-heading text-4xl font-extrabold tracking-tight text-text">{plan.price}</span>
              <span className="ml-1 text-sm text-muted">{plan.cadence}</span>
            </div>
            <ul className="space-y-2 text-sm text-muted">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[hsl(var(--color-accent))]" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Link href="/billing" className="flex-1">
                <Button className="w-full">{plan.name === 'Free' ? 'Get Started' : 'Upgrade Plan'}</Button>
              </Link>
            </div>
          </Card>
        ))}
      </div>

      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-[hsl(var(--color-accent))]" />
          <div>
            <p className="text-sm font-semibold text-text">Credit cost breakdown</p>
            <p className="text-xs text-muted">Premium features consume credits dynamically based on selected options.</p>
          </div>
        </div>
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[hsl(var(--color-border))]">
          <table className="min-w-full divide-y divide-[hsl(var(--color-border))] text-sm">
            <thead className="bg-[hsl(var(--color-bg))]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-text">Action</th>
                <th className="px-4 py-3 text-left font-semibold text-text">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]">
              {actionCosts.map(([label, cost]) => (
                <tr key={label}>
                  <td className="px-4 py-3 text-text">{label}</td>
                  <td className="px-4 py-3 text-muted">{cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-heading text-xl font-extrabold text-text">Need more generation headroom?</p>
          <p className="mt-1 text-sm text-muted">Top up instantly for the MVP, or upgrade to a larger monthly credit plan.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/billing">
            <Button className="gap-2">
              Top-Up Credits
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/credits/history">
            <Button variant="secondary">View usage history</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
