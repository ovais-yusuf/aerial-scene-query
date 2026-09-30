import { readFile } from "node:fs/promises";
import path from "node:path";

export interface GridSummary {
  video?: string;
  method?: string;
  model?: string;
  gridSize: string;
  proximityThresholdPx?: number;
  distanceCoordinateSpace?: string;
  thresholdValidated?: boolean;
  framesProcessed?: number;
  framesWithProximityAlert?: number;
  pctFramesWithAlert?: number;
  maxClosePairsInOneFrame?: number;
  peakCellCountOverRun?: number;
  closestDistanceSeenPx?: number;
  note?: string;
  logSampling?: string;
}

interface GridFile {
  video?: string;
  method?: string;
  model?: string;
  grid?: number[];
  proximity_threshold_px?: number;
  distance_coordinate_space?: string;
  threshold_validated?: boolean;
  frames_processed?: number;
  frames_with_proximity_alert?: number;
  pct_frames_with_alert?: number;
  max_close_pairs_in_one_frame?: number;
  peak_cell_count_over_run?: number;
  closest_distance_seen_px?: number;
  note?: string;
  log_sampling?: string;
  sampled_frame_log?: unknown;
}

function optionalNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatGridSize(grid: number[] | undefined): string {
  const rows = Number(grid?.[0]);
  const cols = Number(grid?.[1]);
  if (Number.isFinite(rows) && Number.isFinite(cols)) {
    return `${rows} × ${cols}`;
  }
  return "Not available";
}

async function loadGridFile(): Promise<GridFile & Record<string, unknown>> {
  const filePath = path.join(process.cwd(), "data", "grid.json");
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as GridFile & Record<string, unknown>;
}

export async function loadGridSummary(): Promise<GridSummary> {
  const data = await loadGridFile();

  return {
    video: typeof data.video === "string" ? data.video : undefined,
    method: typeof data.method === "string" ? data.method : undefined,
    model: typeof data.model === "string" ? data.model : undefined,
    gridSize: formatGridSize(data.grid),
    proximityThresholdPx: optionalNumber(data.proximity_threshold_px),
    distanceCoordinateSpace:
      typeof data.distance_coordinate_space === "string"
        ? data.distance_coordinate_space
        : undefined,
    thresholdValidated:
      typeof data.threshold_validated === "boolean"
        ? data.threshold_validated
        : undefined,
    framesProcessed: optionalNumber(data.frames_processed),
    framesWithProximityAlert: optionalNumber(data.frames_with_proximity_alert),
    pctFramesWithAlert: optionalNumber(data.pct_frames_with_alert),
    maxClosePairsInOneFrame: optionalNumber(data.max_close_pairs_in_one_frame),
    peakCellCountOverRun: optionalNumber(data.peak_cell_count_over_run),
    closestDistanceSeenPx: optionalNumber(data.closest_distance_seen_px),
    note: typeof data.note === "string" ? data.note : undefined,
    logSampling:
      typeof data.log_sampling === "string" ? data.log_sampling : undefined,
  };
}

export async function compactGridResults() {
  const data = await loadGridFile();
  const sampled = data.sampled_frame_log;
  const sampledCount = Array.isArray(sampled) ? sampled.length : 0;

  const {
    sampled_frame_log: _removedLog,
    ...rest
  } = data as GridFile & Record<string, unknown>;

  const compact: Record<string, unknown> = { ...rest };
  delete compact.sampled_frame_log;

  return {
    ...compact,
    frame_log_summary: {
      n_entries: sampledCount,
      sampling: data.log_sampling ?? null,
      scope:
        "Each log entry is one processed frame. Fields such as people, close_pairs, and peak_cell_count are per frame detections or pairwise alerts. They are not unique people across the full video. Pair indices in the log are not persistent track IDs.",
    },
  };
}

export { formatPxDistance } from "@/lib/format-px";
