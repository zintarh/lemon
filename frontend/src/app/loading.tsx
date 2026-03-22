import { LemonPulseLoader } from "@/components/LemonPulseLoader";

/** Route-level loading — lemon logo pulse + subtle text bar. */
export default function Loading() {
  return (
    <div className="flex min-h-[100svh] flex-col items-center justify-center bg-[#FDFAF6] px-6">
      <div className="flex flex-col items-center gap-4">
        <LemonPulseLoader className="h-14 w-14" />
        <div className="h-2.5 w-28 rounded-full bg-[#EDE5D8] animate-pulse" />
        <div className="h-2 w-20 rounded-full bg-[#EDE5D8]/80 animate-pulse" />
      </div>
    </div>
  );
}
