import { readFile } from "node:fs/promises";
import path from "node:path";

export interface GridSummary {
  video?: string;
  gridSize: string;
  threshold: number;
  framesProcessed: number;
  maxPeopleInAnyCell: number;
  emergencyFrames: number;
  note?: string;
}

interface GridFile {
  video?: string;
  grid?: number[];
  threshold?: number;
  frames_processed?: number;
  max_people_in_any_cell?: number;
  num_emergency_frames?: number;
  note?: string;
}

export async function loadGridSummary(): Promise<GridSummary> {
  const filePath = path.join(process.cwd(), "data", "grid.json");
  const raw = await readFile(filePath, "utf8");
  const data = JSON.parse(raw) as GridFile;
  const rows = Number(data.grid?.[0]);
  const cols = Number(data.grid?.[1]);
  const gridSize =
    Number.isFinite(rows) && Number.isFinite(cols)
      ? `${rows} × ${cols}`
      : "Not available";

  return {
    video: data.video,
    gridSize,
    threshold: Number(data.threshold) || 0,
    framesProcessed: Number(data.frames_processed) || 0,
    maxPeopleInAnyCell: Number(data.max_people_in_any_cell) || 0,
    emergencyFrames: Number(data.num_emergency_frames) || 0,
    note: typeof data.note === "string" ? data.note : undefined,
  };
}
