import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  MetricGraphFrame,
  MetricGraphIndex,
  MetricGraphIndexFrame,
} from "@/lib/cell-matrices-types";

interface ManifestFile {
  schema_version?: string;
  paper?: string;
  scope?: string;
  source_metadata?: {
    model?: string;
    tracking_enabled?: boolean;
    resolution?: number[];
    distance_coordinate_space?: string;
    peak_cell_count_over_run?: number;
    frames_processed?: number;
  };
  threshold_px?: number;
  threshold_operator?: string;
  grid_shape?: number[];
  conventions?: Record<string, string>;
  unavailable_reasons?: Record<string, string>;
  summary?: MetricGraphIndex["dataset"];
}

interface ValidationFile {
  status?: string;
  export_frames_checked?: number;
  synthetic_cases?: number;
  checks?: string[];
  scope?: string;
}

type CacheGlobal = typeof globalThis & {
  aerialMetricGraphIndex?: MetricGraphIndex;
};

const cache = globalThis as CacheGlobal;

function dataRoot(): string {
  return path.join(process.cwd(), "Metric_Graph_Research_Data", "data");
}

async function readJson<T>(relativePath: string): Promise<T> {
  const filePath = path.join(dataRoot(), relativePath);
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function loadCellMatrixIndex(): Promise<MetricGraphIndex> {
  if (cache.aerialMetricGraphIndex) return cache.aerialMetricGraphIndex;

  const [manifest, validation, frames] = await Promise.all([
    readJson<ManifestFile>("manifest.json"),
    readJson<ValidationFile>("validation_report.json"),
    readJson<MetricGraphIndexFrame[]>("frame_index.json"),
  ]);

  const grid = manifest.grid_shape;
  const rows = Number(grid?.[0]);
  const cols = Number(grid?.[1]);
  const resolution = manifest.source_metadata?.resolution;

  cache.aerialMetricGraphIndex = {
    schema_version: manifest.schema_version,
    paper: manifest.paper,
    scope: manifest.scope,
    grid: [
      Number.isFinite(rows) ? rows : 10,
      Number.isFinite(cols) ? cols : 10,
    ],
    proximity_threshold_px: optionalNumber(manifest.threshold_px),
    threshold_operator: manifest.threshold_operator,
    distance_coordinate_space:
      manifest.source_metadata?.distance_coordinate_space,
    resolution:
      Array.isArray(resolution) && resolution.length >= 2
        ? [Number(resolution[0]), Number(resolution[1])]
        : undefined,
    model: manifest.source_metadata?.model,
    tracking_enabled: manifest.source_metadata?.tracking_enabled,
    frames_processed: optionalNumber(manifest.source_metadata?.frames_processed),
    peak_cell_count_over_run: optionalNumber(
      manifest.source_metadata?.peak_cell_count_over_run,
    ),
    conventions: manifest.conventions ?? {},
    unavailable_reasons: manifest.unavailable_reasons ?? {},
    dataset: manifest.summary ?? {},
    validation: {
      status: validation.status,
      export_frames_checked: validation.export_frames_checked,
      synthetic_cases: validation.synthetic_cases,
      checks: validation.checks,
      scope: validation.scope,
    },
    limitations: [
      "Distances are original video pixels, not meters.",
      "Foot points are estimates from detection box bottom centers, not guaranteed ground contact.",
      "Labels and component IDs are frame local detections, not persistent track IDs.",
      "Calibration and justified localization error bounds are unavailable.",
      "Pair exposure, persistence, and motion guarantees have not been computed.",
      "Summed pair observations across frames are not distinct events.",
      "Near coincident detections remain in the data and require review.",
    ],
    frames,
  };

  return cache.aerialMetricGraphIndex;
}

export async function loadCellMatrixFrame(
  processedFrame: number,
): Promise<MetricGraphFrame | undefined> {
  const index = await loadCellMatrixIndex();
  const entry = index.frames.find(
    (frame) => frame.processed_frame === processedFrame,
  );
  if (!entry?.path) return undefined;
  return readJson<MetricGraphFrame>(entry.path);
}

export async function compactMetricGraphEvidence() {
  const index = await loadCellMatrixIndex();
  const first = index.frames[0] ?? null;
  return {
    schema_version: index.schema_version,
    scope: index.scope,
    threshold_rule: "distance < 60 pixels (strict paper rule). No pair in this export is exactly 60 px, so observed alert counts match the earlier inclusive export.",
    grid: index.grid,
    frames_processed: index.dataset.frames ?? index.frames_processed,
    dataset_totals: {
      cell_records: index.dataset.cell_records,
      alert_frames: index.dataset.alert_frames,
      within_cell_pair_observations: index.dataset.within_cell_pair_observations,
      cross_cell_pair_observations: index.dataset.cross_cell_pair_observations,
      pairs_exactly_at_threshold: index.dataset.pairs_exactly_at_threshold,
      all_pairs_comparisons: index.dataset.all_pairs_comparisons,
      localized_comparisons: index.dataset.localized_comparisons,
      comparison_reduction_pct: index.dataset.comparison_reduction_pct,
      search_scope: index.dataset.search_scope,
    },
    validation: index.validation,
    conventions: index.conventions,
    unavailable_reasons: index.unavailable_reasons,
    limitations: index.limitations,
    example_processed_frame_1_index: first,
    evidence_limit:
      "This context has dataset totals, validation, and the compact index row for processed frame 1. Full D, A, Laplacian, C, nodes, and edges live in per-frame JSON and are not injected here.",
  };
}

function optionalNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
