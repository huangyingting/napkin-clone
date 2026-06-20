import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <main className="flex flex-1 flex-col items-center bg-ds-surface-sunken px-6 py-12">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        {/* Header */}
        <LoadingRegion
          label="Loading settings…"
          className="flex flex-col gap-2"
        >
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-4 w-48" />
        </LoadingRegion>

        {/* Profile section */}
        <section
          className="flex flex-col gap-4 rounded-2xl border border-ds-border-strong bg-ds-surface-base p-6"
          aria-hidden="true"
        >
          <div className="flex flex-col gap-1">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-full" />
          </div>
        </section>

        {/* Password section */}
        <section
          className="flex flex-col gap-4 rounded-2xl border border-ds-border-strong bg-ds-surface-base p-6"
          aria-hidden="true"
        >
          <div className="flex flex-col gap-1">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-full" />
          </div>
        </section>

        {/* Danger zone section */}
        <section
          className="flex flex-col gap-4 rounded-2xl border border-ds-border-subtle bg-ds-surface-base p-6"
          aria-hidden="true"
        >
          <div className="flex flex-col gap-1">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-52" />
          </div>
          <Skeleton className="h-9 w-36 rounded-full" />
        </section>
      </div>
    </main>
  );
}
