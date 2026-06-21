import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

export default function EditorLoading() {
  return (
    <LoadingRegion
      label="Loading editor…"
      className="flex h-[calc(100vh-3.5rem)] w-full flex-col"
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-ds-border-subtle bg-ds-surface-base px-4 py-2">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-8 w-8 rounded-lg" />
        <div className="mx-2 h-5 w-px bg-ds-border-subtle" aria-hidden="true" />
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-16 rounded-lg" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>

      {/* Editor body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main editor area */}
        <div className="flex flex-1 flex-col items-center overflow-y-auto bg-ds-surface-sunken px-4 py-10 sm:px-8">
          <div className="flex w-full max-w-5xl flex-col gap-6">
            {/* Document title */}
            <Skeleton className="h-10 w-3/4" />
            {/* Content blocks */}
            <div className="flex flex-col gap-4">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-5/6" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-4/5" />
            </div>
            <Skeleton className="h-40 w-full rounded-xl" />
            <div className="flex flex-col gap-4">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-5/6" />
            </div>
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
