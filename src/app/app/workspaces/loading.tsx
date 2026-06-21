import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { PANEL_CHROME, cx } from "@/components/ui/tokens";

export default function WorkspacesLoading() {
  return (
    <main className="flex flex-1 flex-col items-center bg-ds-surface-sunken px-6 py-12">
      <div className="flex w-full max-w-5xl flex-col gap-8">
        {/* Header */}
        <LoadingRegion
          label="Loading workspaces…"
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-10 w-36 rounded-full" />
        </LoadingRegion>

        {/* Workspace cards */}
        <ul
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-hidden="true"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className={cx("flex flex-col gap-3 p-6", PANEL_CHROME)}>
              <div className="flex items-start justify-between gap-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <div className="flex flex-col gap-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
