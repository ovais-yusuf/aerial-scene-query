import { Dashboard } from "@/components/dashboard";
import { loadCellMatrixIndex } from "@/lib/cell-matrices";
import { loadGridSummary } from "@/lib/grid";
import { loadResults } from "@/lib/results";
import { loadRoute104Data } from "@/lib/route104";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [results, grid, cellMatrices, route104] = await Promise.all([
    loadResults(),
    loadGridSummary(),
    loadCellMatrixIndex(),
    loadRoute104Data(),
  ]);

  return (
    <Dashboard
      results={results}
      videoUrl={process.env.NEXT_PUBLIC_VIDEO_URL ?? ""}
      grid={grid}
      gridVideoUrl={process.env.NEXT_PUBLIC_GRID_VIDEO_URL ?? "/videos/grid_output.mp4"}
      cellMatrices={cellMatrices}
      route104={route104}
      route104VideoUrl={process.env.NEXT_PUBLIC_ROUTE104_VIDEO_URL ?? "/api/route104/video"}
    />
  );
}
