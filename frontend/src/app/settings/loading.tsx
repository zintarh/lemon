export default function Loading() {
  return (
    <div className="min-h-[100svh] bg-[#FDFAF6] flex flex-col">
      <div className="h-[60px] border-b border-[#C9B8A0]/25 flex items-center justify-between px-8">
        <div className="h-8 w-28 rounded-xl bg-[#E6DDD0] animate-pulse" />
        <div className="h-8 w-24 rounded-xl bg-[#EDE5D8] animate-pulse" />
        <div className="h-8 w-28 rounded-full bg-[#E6DDD0] animate-pulse" />
      </div>

      <div className="max-w-2xl mx-auto w-full px-8 py-12 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5 mb-2">
          <div className="h-9 w-48 rounded-xl bg-[#DDD3C4] animate-pulse" />
          <div className="h-4 w-72 rounded-lg bg-[#EDE5D8] animate-pulse" />
        </div>

        {[140, 180, 100, 100, 80].map((h, i) => (
          <div key={i} className="rounded-2xl bg-white border border-[#C9B8A0]/30 p-5">
            <div className="h-3 w-24 rounded bg-[#E6DDD0] animate-pulse mb-3" />
            <div className="rounded-xl bg-[#EDE5D8] animate-pulse" style={{ height: h }} />
          </div>
        ))}
      </div>
    </div>
  );
}
