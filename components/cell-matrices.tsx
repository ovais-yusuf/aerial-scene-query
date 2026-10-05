"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  MetricGraphCell,
  MetricGraphEdge,
  MetricGraphFrame,
  MetricGraphIndex,
  MetricGraphNode,
} from "@/lib/cell-matrices-types";

interface CellMatricesExplorerProps {
  index: MetricGraphIndex;
}

interface SelectedCell {
  row: number;
  col: number;
}

type Inspector =
  | { kind: "node"; node: MetricGraphNode }
  | { kind: "edge"; edge: MetricGraphEdge }
  | null;

const COMPONENT_COLORS = [
  "#C8102E",
  "#1F3A5F",
  "#3F6B4A",
  "#7A4A1F",
  "#5A3D6B",
  "#2F5858",
  "#8A3A4A",
  "#4A4A4A",
];

function formatPx(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "unavailable";
  }
  if (value < 1) return `${value.toFixed(2)} px`;
  if (value < 100) return `${value.toFixed(1)} px`;
  return `${Math.round(value)} px`;
}

function formatTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return "unavailable";
  }
  return `${seconds.toFixed(1)} s`;
}

function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "unavailable";
  }
  return String(value);
}

function occupancyFill(count: number, peak: number): string {
  if (count <= 0) return "#FBFAF7";
  const t = Math.min(1, count / Math.max(peak, 1));
  const r = Math.round(232 + (200 - 232) * t);
  const g = Math.round(211 + (16 - 211) * t);
  const b = Math.round(214 + (46 - 214) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function occupancyText(count: number, peak: number): string {
  if (count <= 0) return "#686B69";
  return count / Math.max(peak, 1) > 0.55 ? "#ffffff" : "#151719";
}

function distanceFill(
  value: number,
  threshold: number,
  isDiagonal: boolean,
  strictLess: boolean,
): string {
  if (isDiagonal) return "#E5E3DD";
  const flagged =
    threshold > 0 && (strictLess ? value < threshold : value <= threshold);
  if (flagged) {
    const t = 1 - value / threshold;
    const r = Math.round(250 + (200 - 250) * t);
    const g = Math.round(232 + (16 - 232) * t);
    const b = Math.round(232 + (46 - 232) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
  return "#FBFAF7";
}

function countUpperPairs(matrix: number[][] | undefined): number {
  if (!matrix?.length) return 0;
  let total = 0;
  for (let i = 0; i < matrix.length; i += 1) {
    for (let j = i + 1; j < (matrix[i]?.length ?? 0); j += 1) {
      if (matrix[i][j]) total += 1;
    }
  }
  return total;
}

function emptyCell(): MetricGraphCell {
  return {
    count: 0,
    detection_indices: [],
    labels: [],
    distance_matrix_px: [],
    proximity_matrix: [],
  };
}

function shortLabel(label: string | undefined, fallback: number): string {
  if (!label) return String(fallback);
  return label.replace(/^f\d+_/, "");
}

function componentColor(id: number, size: number): string {
  if (size <= 1) return "#9B9D98";
  return COMPONENT_COLORS[id % COMPONENT_COLORS.length] ?? "#151719";
}

function reductionLabel(value: number | undefined): string | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return `${value.toFixed(1)}% fewer pair distance checks`;
}

export function CellMatricesExplorer({ index }: CellMatricesExplorerProps) {
  const frames = index.frames;
  const [framePos, setFramePos] = useState(0);
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const [detail, setDetail] = useState<MetricGraphFrame | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"cell" | "graph">("cell");
  const [inspector, setInspector] = useState<Inspector>(null);

  const summary = frames[framePos];
  const peak = Math.max(1, index.peak_cell_count_over_run ?? 1);
  const rows = index.grid[0];
  const cols = index.grid[1];
  const threshold = index.proximity_threshold_px;
  const imageWidth = index.resolution?.[0] ?? 1920;
  const imageHeight = index.resolution?.[1] ?? 1080;
  const detailMatches =
    detail?.processed_frame === summary?.processed_frame ? detail : null;

  useEffect(() => {
    if (!summary) return;
    const processed = summary.processed_frame;
    let cancelled = false;
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError(null);
    setInspector(null);

    fetch(`/api/cell-matrices?frame=${processed}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Frame matrices could not be loaded.");
        }
        return (await response.json()) as MetricGraphFrame;
      })
      .then((payload) => {
        if (cancelled) return;
        if (payload.processed_frame !== processed) return;
        setDetail(payload);
        setIsLoading(false);
        const occupancy = payload.occupancy_matrix ?? [];
        let best: SelectedCell = { row: 0, col: 0 };
        let bestCount = -1;
        occupancy.forEach((row, rowIndex) => {
          row.forEach((count, colIndex) => {
            if (count > bestCount) {
              bestCount = count;
              best = { row: rowIndex, col: colIndex };
            }
          });
        });
        setSelected((current) => current ?? best);
      })
      .catch((error: unknown) => {
        if (
          cancelled ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        setDetail(null);
        setIsLoading(false);
        setLoadError("Frame matrices could not be loaded.");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [summary]);

  const selectedCell = useMemo(() => {
    if (!selected || !detailMatches) return selected ? emptyCell() : null;
    return detailMatches.C?.[selected.row]?.[selected.col] ?? emptyCell();
  }, [detailMatches, selected]);

  const nodeByIndex = useMemo(() => {
    const map = new Map<number, MetricGraphNode>();
    for (const node of detailMatches?.nodes ?? []) {
      map.set(node.index, node);
    }
    return map;
  }, [detailMatches]);

  const componentSize = useMemo(() => {
    const map = new Map<number, number>();
    for (const component of detailMatches?.components ?? []) {
      map.set(component.component_id, component.size);
    }
    return map;
  }, [detailMatches]);

  const alertLookup = useMemo(() => {
    const map = new Map<string, number>();
    const grid = detailMatches?.C ?? [];
    grid.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        const pairs = countUpperPairs(cell.proximity_matrix);
        if (pairs > 0) map.set(`${rowIndex},${colIndex}`, pairs);
      });
    });
    return map;
  }, [detailMatches]);

  function step(delta: number) {
    setFramePos((current) =>
      Math.min(frames.length - 1, Math.max(0, current + delta)),
    );
  }

  const cards = [
    {
      label: "Grid",
      value: `${rows} × ${cols}`,
      note: "Rectangular cells. Occupancy is detections per cell.",
    },
    threshold !== undefined
      ? {
          label: "Proximity threshold",
          value: `${index.threshold_operator ?? "<"} ${threshold} px`,
          note: "Paper rule: distance strictly less than 60 px",
        }
      : null,
    index.dataset.frames !== undefined
      ? {
          label: "Processed frames",
          value: String(index.dataset.frames),
          note: "One frame JSON per processed frame",
        }
      : null,
    index.dataset.within_cell_pair_observations !== undefined
      ? {
          label: "Within cell pair observations",
          value: String(index.dataset.within_cell_pair_observations),
          note: "Repeated across frames, not unique events",
        }
      : null,
    index.dataset.cross_cell_pair_observations !== undefined
      ? {
          label: "Cross cell pair observations",
          value: String(index.dataset.cross_cell_pair_observations),
          note: "Pairs that sit across a grid boundary",
        }
      : null,
    index.dataset.comparison_reduction_pct !== undefined
      ? {
          label: "Comparison count reduction",
          value: `${index.dataset.comparison_reduction_pct.toFixed(1)}%`,
          note: "Fewer pair distance checks, not a measured runtime speedup",
        }
      : null,
  ].filter((card): card is { label: string; value: string; note: string } =>
    Boolean(card),
  );

  const frameCards = [
    ["Detections this frame", summary?.detections],
    ["Close pairs", summary?.close_pairs],
    ["Detections in alerts", summary?.people_in_alert],
    ["Components including isolates", summary?.component_count_including_isolates],
    ["Nontrivial components", summary?.nontrivial_component_count],
    ["Largest component", summary?.largest_component_size],
    ["Nearest pair distance", summary?.nearest_pair_distance_px],
    ["Max threshold depth", summary?.max_threshold_depth_px],
  ] as const;

  const crossEdges = detailMatches?.cross_cell_edges ?? [];

  return (
    <div>
      <section className="instrument-border bg-paper p-5">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-crimson">
          Metric graph, framewise pixel space
        </p>
        <h3 className="mt-1 text-sm font-extrabold">
          Occupancy, adjacency, and proximity graph
        </h3>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted">
          Occupancy counts detections in each cell using estimated foot points.
          Adjacency marks distinct pairs whose Euclidean pixel distance is
          strictly less than {threshold ?? 60} px. Degree is the number of close
          neighbors. Threshold depth for a flagged pair is {threshold ?? 60} minus
          that distance. A connected component can be a chain of close pairs. It
          does not mean every pair in the group is close. Labels and component
          IDs are local to the processed frame. This is not a confirmed
          emergency score.
        </p>
      </section>

      <section
        className="mt-5 grid grid-cols-2 divide-x divide-y divide-line border border-line bg-paper lg:grid-cols-3"
        aria-label="Metric graph dataset statistics"
      >
        {cards.map((card) => (
          <div key={card.label} className="min-h-28 p-4">
            <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-muted">
              {card.label}
            </p>
            <p className="mt-2 text-2xl font-black tracking-[-0.04em]">
              {card.value}
            </p>
            <p className="mt-2 text-[11px] text-muted">{card.note}</p>
          </div>
        ))}
      </section>

      <section className="instrument-border mt-5 bg-paper p-5">
        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
          Validation
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">
          {formatCount(index.validation?.export_frames_checked)} processed
          frames. Neighboring cell search and all pairs search produced the same
          edge set. All pairs checks:{" "}
          {formatCount(index.dataset.all_pairs_comparisons)}. Localized checks:{" "}
          {formatCount(index.dataset.localized_comparisons)}
          {reductionLabel(index.dataset.comparison_reduction_pct)
            ? `, ${reductionLabel(index.dataset.comparison_reduction_pct)}`
            : ""}
          . Validation also covers {formatCount(index.validation?.synthetic_cases)}{" "}
          synthetic cases. This is a reduction in comparison count, not a
          measured runtime speedup. The exporter still computes both methods and
          full matrices. Validation checks numerical consistency with the
          supplied coordinates. It does not establish detection accuracy or
          physical safety.
        </p>
        {index.dataset.pairs_exactly_at_threshold !== undefined ? (
          <p className="mt-2 text-[11px] leading-5 text-muted">
            Pairs exactly at 60 px: {index.dataset.pairs_exactly_at_threshold}.
            Changing the earlier inclusive rule to the paper rule (distance
            strictly less than 60) did not change observed alert counts in this
            dataset. The Crowd density tab video and grid.json still come from
            the earlier inclusive export.
          </p>
        ) : null}
      </section>

      <section className="instrument-border mt-5 bg-paper p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
          <div>
            <h3 className="text-sm font-extrabold">Frame explorer</h3>
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
              Processed frame {summary?.processed_frame ?? "unavailable"} of{" "}
              {frames.length}
            </p>
          </div>
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
            Nominal output time {formatTime(summary?.nominal_output_time_sec)}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={framePos === 0}
            className="border border-line bg-white px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ink transition hover:border-crimson hover:text-crimson disabled:opacity-40"
          >
            Prev
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(0, frames.length - 1)}
            value={framePos}
            onChange={(event) => setFramePos(Number(event.target.value))}
            aria-label="Processed frame"
            className="h-1 min-w-[12rem] flex-1 accent-crimson"
          />
          <button
            type="button"
            onClick={() => step(1)}
            disabled={framePos >= frames.length - 1}
            className="border border-line bg-white px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ink transition hover:border-crimson hover:text-crimson disabled:opacity-40"
          >
            Next
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {frameCards.map(([label, value]) => (
            <div key={label} className="border border-line bg-white p-3">
              <p className="font-mono text-[8px] uppercase tracking-[0.11em] text-muted">
                {label}
              </p>
              <p className="mt-1 text-lg font-black">
                {label.includes("distance") || label.includes("depth")
                  ? formatPx(value)
                  : formatCount(value)}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-5 text-muted">
          Close pairs are not the same as detections involved in alerts. A
          component may be a chain. Isolated detections still count as
          components. Nearest pair distance is unavailable when a frame has
          fewer than two detections. Threshold depth is a geometric pixel
          measurement, not a validated danger score. These cards follow the
          selected processed frame, not video playback.
        </p>
      </section>

      <nav
        className="mt-5 flex border border-line bg-paper"
        aria-label="Matrix views"
      >
        {(
          [
            ["cell", "Cell detail"],
            ["graph", "Frame graph"],
          ] as const
        ).map(([id, label]) => {
          const active = panel === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPanel(id)}
              className={`flex-1 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.13em] transition ${
                active
                  ? "bg-crimson text-white"
                  : "bg-paper text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          );
        })}
      </nav>

      {panel === "cell" ? (
        <>
          <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)]">
            <section className="instrument-border bg-paper p-5">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
                <div>
                  <h3 className="text-sm font-extrabold">Occupancy C</h3>
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                    Click a cell, including empty cells
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 font-mono text-[8px] uppercase tracking-[0.1em] text-muted">
                  <span className="border border-line bg-white px-2 py-1">
                    Empty
                  </span>
                  <span className="bg-crimson px-2 py-1 text-white">
                    Higher N
                  </span>
                  <span className="border border-crimson px-2 py-1">
                    Within cell alert
                  </span>
                </div>
              </div>
              <OccupancyGrid
                rows={rows}
                cols={cols}
                occupancy={detailMatches?.occupancy_matrix}
                peak={peak}
                selected={selected}
                alertLookup={alertLookup}
                loading={isLoading && !detailMatches}
                onSelect={setSelected}
              />
            </section>

            <section className="instrument-border bg-paper p-5">
              <div className="mb-4 border-b border-line pb-4">
                <h3 className="text-sm font-extrabold">
                  {selected
                    ? `Cell [${selected.row}, ${selected.col}]`
                    : "Select a cell"}
                </h3>
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                  {isLoading && !detailMatches
                    ? "Loading matrices"
                    : loadError ??
                      (selectedCell
                        ? `N = ${selectedCell.count} detections`
                        : "Choose a cell on the occupancy grid")}
                </p>
              </div>
              {!selectedCell || (isLoading && !detailMatches) ? (
                <p className="text-sm text-muted">
                  {loadError ?? "Use the occupancy grid to inspect a cell."}
                </p>
              ) : selectedCell.count === 0 ? (
                <p className="border-l-2 border-crimson bg-[#F2F0EB] p-3 text-xs leading-5 text-muted">
                  Empty cell. Count is 0 and both matrices are empty lists.
                </p>
              ) : (
                <div className="space-y-5">
                  <p className="text-xs leading-5 text-muted">
                    Cell matrix order:{" "}
                    <span className="font-mono text-[11px] text-ink">
                      {selectedCell.labels.join(", ") || "unavailable"}
                    </span>
                    . Use these labels for this cell only. Global matrices use
                    matrix_axis_labels.
                  </p>
                  <MatrixTable
                    title="Within cell distance matrix"
                    note={
                      threshold !== undefined
                        ? `Pixels. Crimson marks values strictly less than ${threshold} px.`
                        : "Pixels. Diagonal is self distance."
                    }
                    labels={selectedCell.labels}
                    values={selectedCell.distance_matrix_px}
                    formatValue={(value) =>
                      value < 1 ? value.toFixed(2) : value.toFixed(1)
                    }
                    cellStyle={(value, row, col) => ({
                      background: distanceFill(
                        value,
                        threshold ?? 0,
                        row === col,
                        true,
                      ),
                      color: "#151719",
                    })}
                  />
                  <MatrixTable
                    title="Within cell adjacency matrix"
                    note="1 if a distinct pair meets the strict threshold."
                    labels={selectedCell.labels}
                    values={selectedCell.proximity_matrix}
                    formatValue={(value) => String(value)}
                    cellStyle={(value, row, col) => ({
                      background:
                        row === col
                          ? "#E5E3DD"
                          : value
                            ? "#C8102E"
                            : "#FBFAF7",
                      color: row !== col && value ? "#ffffff" : "#151719",
                    })}
                  />
                  <p className="text-xs text-muted">
                    Unique within cell close pairs in this cell:{" "}
                    {countUpperPairs(selectedCell.proximity_matrix)} (upper
                    triangle only).
                  </p>
                </div>
              )}
            </section>
          </div>

          <section className="instrument-border mt-5 bg-paper p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
              <div>
                <h3 className="text-sm font-extrabold">Cross cell close pairs</h3>
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                  Each pair listed once. Adjacency can cross a grid boundary.
                </p>
              </div>
            </div>
            {crossEdges.length === 0 ? (
              <p className="text-sm text-muted">
                {isLoading && !detailMatches
                  ? "Loading cross cell pairs."
                  : "No cross cell close pairs in this processed frame."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[42rem] border-collapse text-left text-xs">
                  <thead>
                    <tr className="font-mono text-[8px] uppercase tracking-[0.11em] text-muted">
                      <th className="border-b border-line py-2 pr-3 font-medium">
                        Detection A
                      </th>
                      <th className="border-b border-line py-2 pr-3 font-medium">
                        Cell A
                      </th>
                      <th className="border-b border-line py-2 pr-3 font-medium">
                        Detection B
                      </th>
                      <th className="border-b border-line py-2 pr-3 font-medium">
                        Cell B
                      </th>
                      <th className="border-b border-line py-2 pr-3 font-medium">
                        Distance
                      </th>
                      <th className="border-b border-line py-2 font-medium">
                        Threshold depth
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {crossEdges.map((edge) => {
                      const nodeA = nodeByIndex.get(edge.a);
                      const nodeB = nodeByIndex.get(edge.b);
                      const [ar, ac] = nodeA?.cell ?? [];
                      const [br, bc] = nodeB?.cell ?? [];
                      const active =
                        selected &&
                        ((ar === selected.row && ac === selected.col) ||
                          (br === selected.row && bc === selected.col));
                      return (
                        <tr
                          key={`${edge.a}-${edge.b}`}
                          className={active ? "bg-[#F2F0EB]" : ""}
                        >
                          <td className="border-b border-line/70 py-2 pr-3 font-mono">
                            {nodeA?.label ?? `index ${edge.a}`}
                          </td>
                          <td className="border-b border-line/70 py-2 pr-3">
                            {nodeA?.cell
                              ? `[${nodeA.cell.join(", ")}]`
                              : "unavailable"}
                          </td>
                          <td className="border-b border-line/70 py-2 pr-3 font-mono">
                            {nodeB?.label ?? `index ${edge.b}`}
                          </td>
                          <td className="border-b border-line/70 py-2 pr-3">
                            {nodeB?.cell
                              ? `[${nodeB.cell.join(", ")}]`
                              : "unavailable"}
                          </td>
                          <td className="border-b border-line/70 py-2 pr-3">
                            {formatPx(edge.distance_px)}
                          </td>
                          <td className="border-b border-line/70 py-2">
                            {formatPx(edge.threshold_depth_px)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="instrument-border mt-5 bg-paper p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
            <div>
              <h3 className="text-sm font-extrabold">Frame graph</h3>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                Image coordinates. Edges are supplied close pairs only.
              </p>
            </div>
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
              {imageWidth} × {imageHeight} px. Not a video overlay.
            </p>
          </div>
          {!detailMatches ? (
            <p className="text-sm text-muted">
              {loadError ?? "Loading graph for this processed frame."}
            </p>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.7fr)]">
              <ProximityGraph
                nodes={detailMatches.nodes}
                edges={detailMatches.edges}
                componentSize={componentSize}
                imageWidth={imageWidth}
                imageHeight={imageHeight}
                inspector={inspector}
                onInspect={setInspector}
              />
              <div className="border border-line bg-white p-4 text-xs leading-5 text-muted">
                {inspector?.kind === "node" ? (
                  <>
                    <p className="font-mono text-[8px] uppercase tracking-[0.11em] text-muted">
                      Node
                    </p>
                    <p className="mt-2 font-mono text-sm text-ink">
                      {inspector.node.label}
                    </p>
                    <p className="mt-2">
                      Cell [{inspector.node.cell.join(", ")}]
                    </p>
                    <p>Degree {inspector.node.degree} close neighbors</p>
                    <p>
                      Component {inspector.node.component_id} (frame local)
                    </p>
                    <p>
                      Foot {formatPx(inspector.node.foot_xy_px[0])},{" "}
                      {formatPx(inspector.node.foot_xy_px[1])}
                    </p>
                  </>
                ) : inspector?.kind === "edge" ? (
                  <>
                    <p className="font-mono text-[8px] uppercase tracking-[0.11em] text-muted">
                      Edge
                    </p>
                    <p className="mt-2 font-mono text-sm text-ink">
                      {nodeByIndex.get(inspector.edge.a)?.label ??
                        inspector.edge.a}{" "}
                      to{" "}
                      {nodeByIndex.get(inspector.edge.b)?.label ??
                        inspector.edge.b}
                    </p>
                    <p className="mt-2">
                      Distance {formatPx(inspector.edge.distance_px)}
                    </p>
                    <p>
                      Threshold depth {formatPx(inspector.edge.threshold_depth_px)}
                    </p>
                    <p>
                      {inspector.edge.cross_cell
                        ? "Crosses a grid cell boundary"
                        : "Same cell"}
                    </p>
                  </>
                ) : (
                  <p>
                    Click a node or an edge. Colors group frame local connected
                    components. Isolated detections use grey. Component IDs do
                    not persist across frames. No trajectories are drawn.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      <details className="instrument-border group mt-5 bg-paper">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-extrabold">
          <span>Advanced matrices</span>
          <span className="font-mono text-lg font-normal text-crimson transition group-open:rotate-45">
            +
          </span>
        </summary>
        <div className="space-y-6 border-t border-line px-5 py-5">
          <p className="text-xs leading-5 text-muted">
            Global axes use matrix_axis_labels for this processed frame. Scroll
            horizontally for larger matrices. The Laplacian is L = degree
            matrix minus adjacency.
          </p>
          {!detailMatches ? (
            <p className="text-sm text-muted">
              {loadError ?? "Load a processed frame to view global matrices."}
            </p>
          ) : (
            <>
              <MatrixTable
                title="Global distance matrix D"
                note="Original video pixels. Shared axis order."
                labels={detailMatches.matrix_axis_labels}
                values={detailMatches.distance_matrix_px}
                formatValue={(value) =>
                  value < 1 ? value.toFixed(2) : value.toFixed(1)
                }
                cellStyle={(value, row, col) => ({
                  background: distanceFill(
                    value,
                    threshold ?? 0,
                    row === col,
                    true,
                  ),
                  color: "#151719",
                })}
              />
              <MatrixTable
                title="Global adjacency matrix A"
                note="1 only for distinct pairs with distance strictly less than the threshold."
                labels={detailMatches.matrix_axis_labels}
                values={detailMatches.adjacency_matrix}
                formatValue={(value) => String(value)}
                cellStyle={(value, row, col) => ({
                  background:
                    row === col
                      ? "#E5E3DD"
                      : value
                        ? "#C8102E"
                        : "#FBFAF7",
                  color: row !== col && value ? "#ffffff" : "#151719",
                })}
              />
              <MatrixTable
                title="Graph Laplacian L"
                note="Optional linear algebra view of the same frame graph."
                labels={detailMatches.matrix_axis_labels}
                values={detailMatches.laplacian_matrix}
                formatValue={(value) => String(value)}
                cellStyle={(value) => ({
                  background: value !== 0 ? "#F2F0EB" : "#FBFAF7",
                  color: "#151719",
                })}
              />
            </>
          )}
        </div>
      </details>

      <section className="instrument-border mt-5 bg-paper p-5">
        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
          Research limitations
        </p>
        <ul className="mt-3 grid gap-2 text-xs leading-5 text-muted md:grid-cols-2">
          {index.limitations.map((item) => (
            <li key={item} className="border-l-2 border-crimson pl-3">
              {item}
            </li>
          ))}
        </ul>
        {index.validation?.scope ? (
          <p className="mt-4 text-[11px] leading-5 text-muted">
            {index.validation.scope}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function OccupancyGrid({
  rows,
  cols,
  occupancy,
  peak,
  selected,
  alertLookup,
  loading,
  onSelect,
}: {
  rows: number;
  cols: number;
  occupancy: number[][] | undefined;
  peak: number;
  selected: SelectedCell | null;
  alertLookup: Map<string, number>;
  loading: boolean;
  onSelect: (cell: SelectedCell) => void;
}) {
  return (
    <div className={`overflow-x-auto ${loading ? "opacity-50" : ""}`}>
      <table className="mx-auto border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="w-6" />
            {Array.from({ length: cols }, (_, col) => (
              <th
                key={`col-${col}`}
                className="font-mono text-[8px] font-medium uppercase tracking-[0.08em] text-muted"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr key={`row-${row}`}>
              <th className="w-6 font-mono text-[8px] font-medium uppercase tracking-[0.08em] text-muted">
                {row}
              </th>
              {Array.from({ length: cols }, (_, col) => {
                const count = occupancy?.[row]?.[col] ?? 0;
                const alertPairs = alertLookup.get(`${row},${col}`) ?? 0;
                const isSelected =
                  selected?.row === row && selected?.col === col;
                return (
                  <td key={`${row}-${col}`} className="p-0">
                    <button
                      type="button"
                      onClick={() => onSelect({ row, col })}
                      aria-label={`Cell row ${row}, column ${col}, ${count} detections`}
                      className={`grid h-10 w-10 place-items-center border text-[11px] font-extrabold transition ${
                        isSelected
                          ? "border-ink ring-2 ring-ink"
                          : alertPairs > 0
                            ? "border-crimson"
                            : "border-line"
                      }`}
                      style={{
                        background: occupancyFill(count, peak),
                        color: occupancyText(count, peak),
                      }}
                    >
                      {count || ""}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProximityGraph({
  nodes,
  edges,
  componentSize,
  imageWidth,
  imageHeight,
  inspector,
  onInspect,
}: {
  nodes: MetricGraphNode[];
  edges: MetricGraphEdge[];
  componentSize: Map<number, number>;
  imageWidth: number;
  imageHeight: number;
  inspector: Inspector;
  onInspect: (value: Inspector) => void;
}) {
  return (
    <div className="overflow-x-auto border border-line bg-[#F2F0EB]">
      <svg
        viewBox={`0 0 ${imageWidth} ${imageHeight}`}
        className="h-auto w-full"
        role="img"
        aria-label="Proximity graph in original image coordinates"
      >
        <rect width={imageWidth} height={imageHeight} fill="#F2F0EB" />
        {edges.map((edge) => {
          const a = nodes.find((node) => node.index === edge.a);
          const b = nodes.find((node) => node.index === edge.b);
          if (!a || !b) return null;
          const active =
            inspector?.kind === "edge" &&
            inspector.edge.a === edge.a &&
            inspector.edge.b === edge.b;
          const color = componentColor(
            a.component_id,
            componentSize.get(a.component_id) ?? 1,
          );
          return (
            <line
              key={`${edge.a}-${edge.b}`}
              x1={a.foot_xy_px[0]}
              y1={a.foot_xy_px[1]}
              x2={b.foot_xy_px[0]}
              y2={b.foot_xy_px[1]}
              stroke={color}
              strokeWidth={active ? 8 : 4}
              opacity={active ? 1 : 0.75}
              onClick={() => onInspect({ kind: "edge", edge })}
              style={{ cursor: "pointer" }}
            />
          );
        })}
        {nodes.map((node) => {
          const size = componentSize.get(node.component_id) ?? 1;
          const color = componentColor(node.component_id, size);
          const active =
            inspector?.kind === "node" && inspector.node.index === node.index;
          return (
            <circle
              key={node.index}
              cx={node.foot_xy_px[0]}
              cy={node.foot_xy_px[1]}
              r={active ? 16 : 12}
              fill={color}
              stroke={active ? "#151719" : "#FBFAF7"}
              strokeWidth={active ? 4 : 2}
              onClick={() => onInspect({ kind: "node", node })}
              style={{ cursor: "pointer" }}
            >
              <title>{node.label}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}

function MatrixTable({
  title,
  note,
  labels,
  values,
  formatValue,
  cellStyle,
}: {
  title: string;
  note: string;
  labels: string[];
  values: number[][];
  formatValue: (value: number) => string;
  cellStyle: (
    value: number,
    row: number,
    col: number,
  ) => { background: string; color: string };
}) {
  if (!values?.length) {
    return (
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
          {title}
        </p>
        <p className="mt-2 text-xs text-muted">Matrix unavailable.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
        {title}
      </p>
      <p className="mt-1 text-[11px] text-muted">{note}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="border-collapse text-center font-mono text-[10px]">
          <thead>
            <tr>
              <th className="p-1 font-medium text-muted" />
              {labels.map((label, index) => (
                <th
                  key={`${title}-h-${index}`}
                  className="p-1 font-medium text-muted"
                >
                  {shortLabel(label, index)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {values.map((row, rowIndex) => (
              <tr key={`${title}-r-${rowIndex}`}>
                <th className="p-1 text-left font-medium text-muted">
                  {shortLabel(labels[rowIndex], rowIndex)}
                </th>
                {row.map((value, colIndex) => {
                  const style = cellStyle(value, rowIndex, colIndex);
                  return (
                    <td
                      key={`${title}-${rowIndex}-${colIndex}`}
                      className="min-w-12 border border-line px-1.5 py-1.5"
                      style={style}
                    >
                      {formatValue(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
