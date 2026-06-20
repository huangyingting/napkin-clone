import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

export default function PresentEmbedLoading() {
  return (
    <LoadingRegion
      label="Loading presentation…"
      className="flex min-h-screen w-full items-center justify-center bg-[#0f1117]"
    >
      <div className="w-full max-w-5xl px-4 sm:px-8" aria-hidden="true">
        <div className="aspect-video w-full rounded-2xl border border-white/10 bg-white/5 p-8 sm:p-12">
          <div className="flex h-full flex-col justify-center gap-6">
            <Skeleton className="mx-auto h-10 w-2/3 bg-white/10" />
            <Skeleton className="mx-auto h-6 w-1/2 bg-white/10" />
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
