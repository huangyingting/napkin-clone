import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { PANEL_CHROME, cx } from "@/components/ui/tokens";

export default function WorkspaceDetailLoading() {
  return (
    <main className="flex flex-1 flex-col items-center bg-ds-surface-sunken px-6 py-12">
      <div className="flex w-full max-w-5xl flex-col gap-8">
        {/* Back link + header */}
        <LoadingRegion
          label="Loading workspace…"
          className="flex flex-col gap-4"
        >
          <Skeleton className="h-4 w-32" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-40" />
          </div>
        </LoadingRegion>

        {/* Members + invite columns */}
        <div className="grid gap-6 lg:grid-cols-2" aria-hidden="true">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-24" />
            <div className={cx("flex flex-col gap-3 p-4", PANEL_CHROME)}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex flex-1 flex-col gap-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-28" />
            <div className={cx("flex flex-col gap-3 p-4", PANEL_CHROME)}>
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 flex-1 rounded" />
                  <Skeleton className="h-8 w-16 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Documents */}
        <div className="flex flex-col gap-4" aria-hidden="true">
          <Skeleton className="h-6 w-28" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className={cx("flex flex-col gap-3 p-5", PANEL_CHROME)}
              >
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
