export default function Loading() {
  return (
    <div className="min-h-[100svh] bg-[#FDFAF6] flex flex-col">
      {/* Navbar skeleton */}
      <div className="h-[60px] border-b border-[#C9B8A0]/25 flex items-center justify-between px-8">
        <div className="h-8 w-24 rounded-xl bg-[#E6DDD0] animate-pulse" />
        <div className="flex gap-2">
          <div className="h-8 w-20 rounded-full bg-[#EDE5D8] animate-pulse" />
          <div className="h-8 w-28 rounded-full bg-[#E6DDD0] animate-pulse" />
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-0">
        {/* Left panel */}
        <div className="border-r border-[#C9B8A0]/25 p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-[#DDD3C4] animate-pulse" />
            <div className="flex flex-col gap-1.5">
              <div className="h-4 w-28 rounded-lg bg-[#E6DDD0] animate-pulse" />
              <div className="h-3 w-20 rounded-lg bg-[#EDE5D8] animate-pulse" />
            </div>
          </div>
          <div className="h-24 rounded-2xl bg-[#EDE5D8] animate-pulse" />
          <div className="h-16 rounded-2xl bg-[#EDE5D8] animate-pulse" />
          <div className="h-16 rounded-2xl bg-[#EDE5D8] animate-pulse" />
        </div>
        {/* Right panel */}
        <div className="p-6 flex flex-col gap-4">
          <div className="h-40 rounded-2xl bg-[#E6DDD0] animate-pulse" />
          <div className="h-32 rounded-2xl bg-[#EDE5D8] animate-pulse" />
          <div className="h-32 rounded-2xl bg-[#EDE5D8] animate-pulse" />
        </div>
      </div>
    </div>
  );
}
