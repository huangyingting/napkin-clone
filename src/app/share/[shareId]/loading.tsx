import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

export default function ShareLoading() {
  return (
    <main className="min-h-screen bg-ds-surface-sunken">
      {/* Header chrome */}
      <header className="border-b border-ds-border-subtle bg-ds-surface-base px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <LoadingRegion label="Loading shared document…">
            <div className="mb-2 flex items-center gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-8 w-64" />
          </LoadingRegion>
        </div>
      </header>

      {/* Content area */}
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <div
          className="flex flex-col gap-6 rounded-lg border border-ds-border-subtle bg-ds-surface-base p-4 sm:p-6"
          aria-hidden="true"
        >
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
          </div>
          <Skeleton className="h-52 w-full rounded-lg" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        </div>
      </div>
    </main>
  );
}
