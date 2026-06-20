import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

export default function BrandsLoading() {
  return (
    <main className="flex flex-1 flex-col items-center bg-ds-surface-sunken px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex w-full max-w-4xl flex-col gap-8">
        {/* Header */}
        <LoadingRegion
          label="Loading Brand Studio…"
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-8 w-28" />
        </LoadingRegion>

        {/* Brand cards */}
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-hidden="true"
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-4 rounded-2xl border border-ds-border-subtle bg-ds-surface-raised p-6"
            >
              {/* Color swatches row */}
              <div className="flex gap-2">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-8 w-8 rounded-full" />
                ))}
              </div>
              <div className="flex flex-col gap-1">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
