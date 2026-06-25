import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

export default function PresentLoading() {
  return (
    <LoadingRegion
      label="Loading presentation…"
      className="flex min-h-screen flex-col items-center justify-center bg-ds-present-loading"
    >
      {/* Slide placeholder */}
      <div
        className="relative flex w-full max-w-5xl flex-col items-center justify-center px-4 sm:px-8"
        aria-hidden="true"
      >
        {/* Slide area */}
        <div className="aspect-video w-full rounded-2xl border border-white/10 bg-white/5 p-8 sm:p-12">
          <div className="flex h-full flex-col justify-center gap-6">
            <Skeleton className="mx-auto h-10 w-2/3 bg-white/10" />
            <Skeleton className="mx-auto h-6 w-1/2 bg-white/10" />
            <div className="flex flex-col gap-3">
              <Skeleton className="h-5 w-full bg-white/10" />
              <Skeleton className="h-5 w-5/6 bg-white/10" />
              <Skeleton className="h-5 w-4/5 bg-white/10" />
            </div>
          </div>
        </div>

        {/* Slide nav dots */}
        <div className="mt-6 flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton
              key={i}
              className={`h-2 rounded-full bg-white/20 ${i === 0 ? "w-6" : "w-2"}`}
            />
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
