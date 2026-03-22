export default function Loading() {
  return (
    <div className="min-h-[100svh] bg-[#FDFAF6] flex flex-col">
      <div className="h-[60px] border-b border-[#C9B8A0]/25 flex items-center justify-between px-8">
        <div className="h-8 w-24 rounded-xl bg-[#E6DDD0] animate-pulse" />
        <div className="flex gap-2">
          <div className="h-8 w-16 rounded-full bg-[#EDE5D8] animate-pulse" />
          <div className="h-8 w-24 rounded-full bg-[#E6DDD0] animate-pulse" />
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto w-full px-8 py-12">
        <div className="flex flex-col gap-2 mb-8">
          <div className="h-9 w-32 rounded-xl bg-[#DDD3C4] animate-pulse" />
          <div className="h-4 w-48 rounded-lg bg-[#EDE5D8] animate-pulse" />
        </div>

        <div className="flex gap-2 mb-6">
          <div className="h-9 w-24 rounded-full bg-[#D8CFC2] animate-pulse" />
          <div className="h-9 w-20 rounded-full bg-[#EDE5D8] animate-pulse" />
        </div>

        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl bg-white border border-[#C9B8A0]/28 overflow-hidden"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="aspect-[4/3] bg-[#E6DDD0] animate-pulse" />
              <div className="p-4 flex flex-col gap-2">
                <div className="h-4 w-3/4 rounded bg-[#DDD3C4] animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-[#EDE5D8] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
