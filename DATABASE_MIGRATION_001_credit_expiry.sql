-- Migration: Add credit expiry and billing cycle columns to credit_wallets
-- Date: 2026-05-20
-- This migration adds support for subscription-like billing with plan expiry

BEGIN;

-- Add new columns to track plan information and expiry
ALTER TABLE credit_wallets
ADD COLUMN IF NOT EXISTS credits_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS plan_name VARCHAR(32),
ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(16),
ADD COLUMN IF NOT EXISTS plan_activated_at TIMESTAMP WITH TIME ZONE;

-- Create index on credits_expires_at for efficient expiry checks
CREATE INDEX IF NOT EXISTS idx_credit_wallets_expires_at
ON credit_wallets(credits_expires_at)
WHERE credits_expires_at IS NOT NULL;

-- Create index on plan_name for filtering by plan type
CREATE INDEX IF NOT EXISTS idx_credit_wallets_plan_name
ON credit_wallets(plan_name)
WHERE plan_name IS NOT NULL;

COMMIT;
