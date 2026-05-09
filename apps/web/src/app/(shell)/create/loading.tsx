export default function CreateLoading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-14 pt-8 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-[28px] border border-[hsl(var(--color-border-soft)/0.38)] bg-[hsl(var(--color-surface)/0.88)] p-6">
        <div className="h-6 w-52 animate-pulse rounded bg-[hsl(var(--color-border-soft)/0.45)]" />
        <div className="mt-4 h-11 w-full animate-pulse rounded-2xl bg-[hsl(var(--color-border-soft)/0.3)]" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-28 animate-pulse rounded-2xl bg-[hsl(var(--color-border-soft)/0.28)]" />
          <div className="h-28 animate-pulse rounded-2xl bg-[hsl(var(--color-border-soft)/0.28)]" />
          <div className="h-28 animate-pulse rounded-2xl bg-[hsl(var(--color-border-soft)/0.28)]" />
        </div>
      </div>
    </div>
  );
}
