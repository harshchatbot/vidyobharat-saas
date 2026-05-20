'use client'

import { useEffect, useState } from 'react'
import { getCurrentUserIdOrThrow } from '@/lib/authUser'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type StreakData = {
  current_streak: number
  longest_streak: number
  created_today: boolean
}

export function StreakWidget() {
  const [streak, setStreak] = useState<StreakData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const userId = getCurrentUserIdOrThrow('streak')
        const res = await fetch(`${API_BASE_URL}/api/streak`, {
          headers: { 'X-User-ID': userId }
        })
        if (res.ok) {
          const data = await res.json()
          setStreak(data)
        }
      } catch (err) {
        console.error('Failed to load streak:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading || !streak) return null

  const isAtRisk = !streak.created_today && streak.current_streak > 0

  return (
    <div className="glass-card px-3 py-2.5 mx-2 mb-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`text-lg transition-opacity ${isAtRisk ? 'grayscale opacity-50' : ''}`}
          >
            🔥
          </span>
          <div>
            <p
              className="text-xs font-bold"
              style={{
                color: isAtRisk
                  ? 'hsl(var(--color-muted))'
                  : 'hsl(var(--color-accent-amber))'
              }}
            >
              {streak.current_streak} day streak
            </p>
            <p className="text-[10px]" style={{ color: 'hsl(var(--color-muted))' }}>
              Best: {streak.longest_streak} days
            </p>
          </div>
        </div>
        {streak.created_today && (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{
              background: 'hsl(var(--color-success) / 0.15)',
              color: 'hsl(var(--color-success))'
            }}
          >
            ✓ Today
          </span>
        )}
      </div>
      {isAtRisk && (
        <p
          className="text-[10px] mt-1.5 font-medium"
          style={{ color: 'hsl(var(--color-accent-amber))' }}
        >
          ⚡ Create today to keep your streak!
        </p>
      )}
    </div>
  )
}
