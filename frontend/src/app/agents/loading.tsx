export default function Loading() {
  return (
    <div className="min-h-[100svh] bg-[#FAFAF8] flex flex-col">
      <div className="h-[60px] border-b border-black/[0.05] flex items-center justify-between px-8">
        <div className="h-8 w-24 rounded-xl bg-black/[0.06] animate-pulse" />
        <div className="flex gap-2">
          <div className="h-8 w-16 rounded-full bg-black/[0.06] animate-pulse" />
          <div className="h-8 w-16 rounded-full bg-black/[0.06] animate-pulse" />
          <div className="h-8 w-24 rounded-full bg-black/[0.06] animate-pulse" />
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto w-full px-8 py-12">
        <div className="flex items-end justify-between mb-8">
          <div className="flex flex-col gap-2">
            <div className="h-9 w-36 rounded-xl bg-black/[0.08] animate-pulse" />
            <div className="h-4 w-24 rounded-lg bg-black/[0.05] animate-pulse" />
          </div>
          <div className="h-10 w-52 rounded-xl bg-black/[0.06] animate-pulse" />
        </div>

        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-white border border-black/[0.07] overflow-hidden"
              style={{ animationDelay: `${i * 40}ms` }}>
              <div className="h-28 bg-black/[0.07] animate-pulse" />
              <div className="p-4 flex flex-col gap-2">
                <div className="h-3 w-full rounded bg-black/[0.05] animate-pulse" />
                <div className="h-3 w-4/5 rounded bg-black/[0.05] animate-pulse" />
                <div className="h-3 w-3/5 rounded bg-black/[0.05] animate-pulse" />
                <div className="flex gap-1.5 mt-1">
                  <div className="h-5 w-20 rounded-full bg-black/[0.05] animate-pulse" />
                  <div className="h-5 w-16 rounded-full bg-black/[0.05] animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
