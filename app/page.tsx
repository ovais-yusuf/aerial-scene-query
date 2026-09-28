import { Dashboard } from "@/components/dashboard";
import { loadGridSummary } from "@/lib/grid";
import { loadResults } from "@/lib/results";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [results, grid] = await Promise.all([loadResults(), loadGridSummary()]);

  return (
    <Dashboard
      results={results}
      videoUrl={process.env.NEXT_PUBLIC_VIDEO_URL ?? ""}
      grid={grid}
      gridVideoUrl={process.env.NEXT_PUBLIC_GRID_VIDEO_URL ?? "/videos/grid_output.mp4"}
    />
  );
}
