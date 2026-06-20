import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

export default function EmbedLoading() {
  return (
    <main className="min-h-screen w-full bg-ds-surface-base p-4">
      <div className="mx-auto w-full max-w-3xl">
        <LoadingRegion label="Loading embedded document…">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
          </div>
          <div className="mt-6 flex flex-col gap-6" aria-hidden="true">
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        </LoadingRegion>
      </div>
    </main>
  );
}
