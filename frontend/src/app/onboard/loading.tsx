export default function Loading() {
  return (
    <div className="h-[100svh] flex flex-col bg-[#FDFAF6]">
      <div className="flex items-center justify-between border-b border-[#C9B8A0]/25 px-8 py-4">
        <div className="h-12 w-12 rounded-xl bg-[#E6DDD0] animate-pulse" />
        <div className="h-4 w-10 rounded bg-[#EDE5D8] animate-pulse" />
      </div>

      <div className="flex flex-col items-center pt-10 px-6 gap-3">
        <div className="h-8 w-64 rounded-xl bg-[#DDD3C4] animate-pulse" />
        <div className="h-4 w-80 rounded-lg bg-[#EDE5D8] animate-pulse" />
      </div>

      <div className="flex-1 px-8 pt-6">
        <div className="grid grid-cols-3 gap-4 h-full max-h-[420px]">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl bg-[#E6DDD0] animate-pulse"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-[#C9B8A0]/25 px-8 py-4 flex justify-center">
        <div className="h-11 w-44 rounded-full bg-[#DDD3C4] animate-pulse" />
      </div>
    </div>
  );
}
