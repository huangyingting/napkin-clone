import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <main className="flex flex-1 flex-col items-center bg-ds-surface-sunken px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex w-full max-w-5xl flex-col gap-8">
        {/* Header */}
        <LoadingRegion
          label="Loading dashboard…"
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-32 rounded-full" />
            <Skeleton className="h-10 w-36 rounded-full" />
          </div>
        </LoadingRegion>

        {/* Document grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-2xl border border-ds-border-subtle bg-ds-surface-raised p-5"
              aria-hidden="true"
            >
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
