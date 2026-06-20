import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

export default function BillingLoading() {
  return (
    <main className="flex flex-1 flex-col items-center bg-ds-surface-sunken px-6 py-12">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        {/* Header */}
        <LoadingRegion label="Loading billing…" className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-48" />
        </LoadingRegion>

        {/* Current plan */}
        <section
          className="flex flex-col gap-4 rounded-2xl border border-ds-border-strong bg-ds-surface-base p-6"
          aria-hidden="true"
        >
          <Skeleton className="h-5 w-32" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-5 w-36" />
          </div>
        </section>

        {/* Credits */}
        <section
          className="flex flex-col gap-4 rounded-2xl border border-ds-border-strong bg-ds-surface-base p-6"
          aria-hidden="true"
        >
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3 w-full rounded-full" />
          <Skeleton className="h-4 w-44" />
        </section>

        {/* Plan features */}
        <section
          className="flex flex-col gap-4 rounded-2xl border border-ds-border-strong bg-ds-surface-base p-6"
          aria-hidden="true"
        >
          <Skeleton className="h-5 w-36" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded-sm" />
                <Skeleton className="h-4 w-48" />
              </div>
            ))}
          </div>
        </section>

        {/* Change plan */}
        <section
          className="flex flex-col gap-4 rounded-2xl border border-ds-border-strong bg-ds-surface-base p-6"
          aria-hidden="true"
        >
          <Skeleton className="h-5 w-28" />
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-10 w-32 rounded-full" />
            <Skeleton className="h-10 w-32 rounded-full" />
          </div>
        </section>
      </div>
    </main>
  );
}
