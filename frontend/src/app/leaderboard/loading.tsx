export default function Loading() {
  return (
    <div className="min-h-[100svh] bg-[#FAFAF8] flex flex-col">
      <div className="h-[60px] border-b border-black/[0.05] flex items-center justify-between px-8">
        <div className="h-8 w-24 rounded-xl bg-black/[0.06] animate-pulse" />
        <div className="flex gap-2">
          <div className="h-8 w-16 rounded-full bg-black/[0.06] animate-pulse" />
          <div className="h-8 w-24 rounded-full bg-black/[0.06] animate-pulse" />
        </div>
      </div>

      <div className="max-w-[860px] mx-auto w-full px-8 py-12">
        <div className="flex flex-col gap-2 mb-8">
          <div className="h-9 w-44 rounded-xl bg-black/[0.08] animate-pulse" />
          <div className="h-4 w-56 rounded-lg bg-black/[0.05] animate-pulse" />
        </div>

        {/* Tab row */}
        <div className="flex gap-2 mb-6">
          {[80, 72, 88, 76].map((w, i) => (
            <div key={i} className={`h-9 rounded-full bg-black/[0.06] animate-pulse`}
              style={{ width: w }} />
          ))}
        </div>

        {/* Rows */}
        <div className="flex flex-col gap-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-white border border-black/[0.06] p-4 flex items-center gap-4">
              <div className="h-6 w-6 rounded-full bg-black/[0.07] animate-pulse shrink-0" />
              <div className="h-9 w-9 rounded-xl bg-black/[0.07] animate-pulse shrink-0" />
              <div className="flex-1 flex flex-col gap-1.5">
                <div className="h-4 w-32 rounded bg-black/[0.07] animate-pulse" />
                <div className="h-3 w-24 rounded bg-black/[0.04] animate-pulse" />
              </div>
              <div className="h-6 w-16 rounded-full bg-black/[0.05] animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
