import { Dashboard } from "@/components/dashboard";
import { loadCellMatrixIndex } from "@/lib/cell-matrices";
import { loadGridSummary } from "@/lib/grid";
import { loadResults } from "@/lib/results";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [results, grid, cellMatrices] = await Promise.all([
    loadResults(),
    loadGridSummary(),
    loadCellMatrixIndex(),
  ]);

  return (
    <Dashboard
      results={results}
      videoUrl={process.env.NEXT_PUBLIC_VIDEO_URL ?? ""}
      grid={grid}
      gridVideoUrl={process.env.NEXT_PUBLIC_GRID_VIDEO_URL ?? "/videos/grid_output.mp4"}
      cellMatrices={cellMatrices}
    />
  );
}
