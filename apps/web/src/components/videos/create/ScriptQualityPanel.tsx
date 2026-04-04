import { AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

import type { ScriptQualityReport } from './scriptQuality';

export function ScriptQualityPanel({
  report,
  onEnhance,
  loading,
  enhanceCredits,
}: {
  report: ScriptQualityReport;
  onEnhance: () => void;
  loading: boolean;
  enhanceCredits?: number | null;
}) {
  const scoreTone =
    report.score >= 85
      ? 'text-[hsl(var(--color-accent))]'
      : report.score >= 70
        ? 'text-[hsl(var(--color-accent))]'
        : 'text-[hsl(var(--color-accent))]';
  const enhanceLabel =
    typeof enhanceCredits === 'number'
      ? enhanceCredits > 0
        ? `Improve script · ${enhanceCredits} credits`
        : 'Improve script · Free'
      : 'Improve script';

  return (
    <div className="rounded-[18px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-bg)/0.48)] px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Script quality</p>
          <div className="mt-1 flex items-center gap-2">
            <p className={`text-sm font-semibold ${scoreTone}`}>{report.score}/100</p>
            <Badge variant="outline" className="text-[10px]">
              Creator best-practice check
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted">{report.summary}</p>
        </div>
        <Button type="button" variant="secondary" onClick={onEnhance} disabled={loading} className="gap-2 rounded-full px-3 py-2 text-xs">
          <Sparkles className="h-3.5 w-3.5" />
          {loading ? 'Enhancing...' : enhanceLabel}
        </Button>
      </div>

      {report.findings.length > 0 ? (
        <div className="mt-3 space-y-2">
          {report.findings.slice(0, 4).map((finding) => (
            <div
              key={finding.id}
              className="flex items-start gap-2 rounded-[14px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-surface)/0.36)] px-3 py-2.5"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--color-accent))]" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">{finding.title}</p>
                <p className="mt-0.5 text-xs leading-5 text-muted">{finding.detail}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {report.strengths.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {report.strengths.slice(0, 3).map((strength) => (
            <div
              key={strength}
              className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-surface)/0.3)] px-3 py-1.5 text-xs text-muted"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
              {strength}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
