// ===== Skeleton Loader Component =====

interface SkeletonProps {
  className?: string;
}

export const Skeleton = ({ className = '' }: SkeletonProps) => (
  <div className={`animate-pulse rounded bg-[var(--color-surface-muted)] ${className}`} />
);

export const SkeletonCard = ({ lines = 3 }: { lines?: number }) => (
  <div className="rounded-xl bg-[var(--color-surface-card)] p-5 shadow-sm">
    <Skeleton className="mb-3 h-5 w-2/3" />
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} className={`mb-2 h-4 ${i === lines - 1 ? 'w-4/6' : 'w-full'}`} />
    ))}
  </div>
);

export const SkeletonList = ({ count = 3 }: { count?: number }) => (
  <div className="space-y-3">
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} lines={2 + (i % 2)} />
    ))}
  </div>
);

export const SkeletonRow = ({ cols = 3 }: { cols?: number }) => (
  <div className="flex items-center gap-3 rounded-lg bg-[var(--color-surface-card)] p-4 shadow-sm">
    <Skeleton className="h-8 w-8 rounded-full" />
    <div className="flex-1 space-y-1.5">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-1/3" />
    </div>
    {Array.from({ length: cols }).map((_, i) => (
      <Skeleton key={i} className="hidden h-4 w-10 sm:block" />
    ))}
  </div>
);
