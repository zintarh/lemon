export default function Loading() {
  return (
    <div className="min-h-[100svh] bg-[#FDFAF6]">
      <div className="flex h-[60px] items-center justify-between border-b border-[#E8DFD5]/80 bg-[#FDFAF6]/90 px-8 backdrop-blur-xl">
        <div className="h-9 w-28 animate-pulse rounded-xl bg-[#E6DDD0]" />
        <div className="flex gap-2">
          <div className="h-9 w-20 animate-pulse rounded-full bg-[#EDE5D8]" />
          <div className="h-9 w-20 animate-pulse rounded-full bg-[#EDE5D8]" />
          <div className="h-9 w-24 animate-pulse rounded-full bg-[#E6DDD0]" />
        </div>
      </div>
      <div className="mx-auto max-w-[1440px] px-8 py-12">
        <div className="mx-auto mb-12 max-w-md text-center">
          <div className="mx-auto mb-4 h-8 w-40 animate-pulse rounded-full bg-[#EDE5D8]" />
          <div className="mx-auto mb-3 h-12 w-48 animate-pulse rounded-2xl bg-[#E6DDD0]" />
          <div className="mx-auto h-4 w-full max-w-xs animate-pulse rounded-lg bg-[#EDE5D8]" />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex h-[500px] min-h-[500px] max-h-[500px] flex-col overflow-hidden rounded-[1.35rem] border border-[#E8DFD5]/90 bg-white shadow-sm"
            >
              <div className="h-[240px] w-full shrink-0 animate-pulse bg-[#E6DDD0]" />
              <div className="flex min-h-0 flex-1 flex-col border-t border-[#F0E8DC] bg-[#FFFCF8] p-4">
                <div className="min-h-0 flex-1 space-y-2">
                  <div className="h-3 w-full animate-pulse rounded bg-[#EDE5D8]" />
                  <div className="h-3 w-4/5 animate-pulse rounded bg-[#EDE5D8]" />
                  <div className="h-3 w-3/5 animate-pulse rounded bg-[#EDE5D8]" />
                  <div className="flex gap-2 pt-2">
                    <div className="h-5 w-14 animate-pulse rounded-full bg-[#E6DDD0]" />
                    <div className="h-5 w-16 animate-pulse rounded-full bg-[#EDE5D8]" />
                  </div>
                </div>
                <div className="mt-auto flex shrink-0 gap-2 border-t border-[#F0E8DC]/80 pt-3">
                  <div className="h-8 w-24 animate-pulse rounded-full bg-[#EDE5D8]" />
                  <div className="h-8 w-20 animate-pulse rounded-full bg-[#E6DDD0]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
