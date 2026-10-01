"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  CellMatrixFrameDetail,
  CellMatrixIndex,
  OccupiedCell,
} from "@/lib/cell-matrices-types";

interface CellMatricesExplorerProps {
  index: CellMatrixIndex;
}

interface SelectedCell {
  row: number;
  col: number;
}

function formatPx(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "unavailable";
  if (value < 1) return `${value.toFixed(2)} px`;
  if (value < 100) return `${value.toFixed(1)} px`;
  return `${Math.round(value)} px`;
}

function formatTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return "unavailable";
  return `${seconds.toFixed(1)} s`;
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

function distanceFill(value: number, threshold: number, isDiagonal: boolean): string {
  if (isDiagonal) return "#E5E3DD";
  if (threshold > 0 && value <= threshold) {
    const t = 1 - value / threshold;
    const r = Math.round(250 + (200 - 250) * t);
    const g = Math.round(232 + (16 - 232) * t);
    const b = Math.round(232 + (46 - 232) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
  return "#FBFAF7";
}

function emptyCell(row: number, col: number): OccupiedCell {
  return {
    row,
    col,
    count: 0,
    labels: [],
    detection_indices: [],
    feet_xy_px: [],
    distance_matrix_px: [],
    proximity_matrix: [],
    within_cell_close_pairs: 0,
  };
}

export function CellMatricesExplorer({ index }: CellMatricesExplorerProps) {
  const frames = index.frames;
  const [framePos, setFramePos] = useState(0);
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const [detail, setDetail] = useState<CellMatrixFrameDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const summary = frames[framePos];
  const peak = Math.max(1, index.peak_cell_count_over_run ?? 1);
  const rows = index.grid[0];
  const cols = index.grid[1];
  const threshold = index.proximity_threshold_px;

  useEffect(() => {
    if (!summary) return;
    const processed = summary.processed_frame;
    let cancelled = false;
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError(null);

    fetch(`/api/cell-matrices?frame=${processed}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Frame matrices could not be loaded.");
        }
        return (await response.json()) as CellMatrixFrameDetail;
      })
      .then((payload) => {
        if (cancelled) return;
        setDetail(payload);
        setIsLoading(false);
        const richest = [...payload.occupied_cells].sort(
          (a, b) => b.count - a.count || a.row - b.row || a.col - b.col,
        )[0];
        setSelected((current) => {
          if (current) return current;
          return richest
            ? { row: richest.row, col: richest.col }
            : { row: 0, col: 0 };
        });
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) {
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

  const alertLookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const cell of summary?.within_alert_cells ?? []) {
      map.set(`${cell.row},${cell.col}`, cell.pairs);
    }
    return map;
  }, [summary]);

  const occupiedLookup = useMemo(() => {
    const map = new Map<string, OccupiedCell>();
    for (const cell of detail?.occupied_cells ?? []) {
      map.set(`${cell.row},${cell.col}`, cell);
    }
    return map;
  }, [detail]);

  const selectedCell = selected
    ? occupiedLookup.get(`${selected.row},${selected.col}`) ??
      emptyCell(selected.row, selected.col)
    : null;

  const highlightedPairs = (detail?.cross_cell_close_pairs ?? []).filter((pair) => {
    if (!selected) return false;
    const [ar, ac] = pair.cell_a ?? [];
    const [br, bc] = pair.cell_b ?? [];
    return (
      (ar === selected.row && ac === selected.col) ||
      (br === selected.row && bc === selected.col)
    );
  });

  function step(delta: number) {
    setFramePos((current) =>
      Math.min(frames.length - 1, Math.max(0, current + delta)),
    );
  }

  const cards = [
    {
      label: "Grid",
      value: `${rows} × ${cols}`,
      note: "Per cell count N plus distance matrix D",
    },
    threshold !== undefined
      ? {
          label: "Proximity threshold",
          value: `${threshold} px`,
          note: "Alert if estimated foot distance is at or below this",
        }
      : null,
    index.frames_processed !== undefined
      ? {
          label: "Processed frames",
          value: String(index.frames_processed),
          note: "One C matrix per processed frame",
        }
      : null,
    index.validation?.within_cell_flagged_pair_observations !== undefined
      ? {
          label: "Within cell pair observations",
          value: String(index.validation.within_cell_flagged_pair_observations),
          note: "Repeated across frames, not unique events",
        }
      : null,
    index.validation?.cross_cell_flagged_pair_observations !== undefined
      ? {
          label: "Cross cell pair observations",
          value: String(index.validation.cross_cell_flagged_pair_observations),
          note: "Pairs that sit across a grid boundary",
        }
      : null,
    index.validation?.frames_with_cross_cell_alerts !== undefined
      ? {
          label: "Frames with cross cell alerts",
          value: String(index.validation.frames_with_cross_cell_alerts),
          note: "Of checked processed frames",
        }
      : null,
  ].filter((card): card is { label: string; value: string; note: string } =>
    Boolean(card),
  );

  return (
    <div>
      <section className="instrument-border bg-paper p-5">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-crimson">
          Per cell matrices
        </p>
        <h3 className="mt-1 text-sm font-extrabold">Cᵗ occupancy, D, and A</h3>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted">
          For each processed frame the scene is a {rows} by {cols} grid. A cell
          holds an ordered pair (N, D): how many detections fall in that cell,
          and the Euclidean pixel distances between their estimated foot points.
          A is the binary alert matrix for distinct pairs at or below the
          threshold. Cross cell alerts are listed separately so a grid boundary
          does not hide a close pair. Labels are local to the frame, not track
          IDs. Pixel distances are not meters.
        </p>
      </section>

      <section
        className="mt-5 grid grid-cols-2 divide-x divide-y divide-line border border-line bg-paper lg:grid-cols-3"
        aria-label="Cell matrix dataset statistics"
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
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
          <div>
            <h3 className="text-sm font-extrabold">Frame explorer</h3>
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
              Processed frame {summary?.processed_frame ?? "unavailable"} of{" "}
              {frames.length}
            </p>
          </div>
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
            Nominal time {formatTime(summary?.nominal_output_time_sec)}
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

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            ["Detections this frame", summary?.detection_count],
            ["Within cell close pairs", summary?.within_cell_close_pairs],
            ["Cross cell close pairs", summary?.cross_cell_close_pair_count],
            ["Total close pairs", summary?.total_close_pairs],
            ["People in alert", summary?.people_in_alert],
          ].map(([label, value]) => (
            <div key={String(label)} className="border border-line bg-white p-3">
              <p className="font-mono text-[8px] uppercase tracking-[0.11em] text-muted">
                {label}
              </p>
              <p className="mt-1 text-lg font-black">
                {value === undefined ? "unavailable" : String(value)}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-5 text-muted">
          Close pairs are not the same as people involved. People in alert counts
          detections that belong to at least one flagged pair in this frame.
          These cards follow the selected processed frame, not video playback.
        </p>
      </section>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)]">
        <section className="instrument-border bg-paper p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
            <div>
              <h3 className="text-sm font-extrabold">Occupancy Cᵗ</h3>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                Click a cell to open N, D, and A
              </p>
            </div>
            <div className="flex flex-wrap gap-2 font-mono text-[8px] uppercase tracking-[0.1em] text-muted">
              <span className="border border-line bg-white px-2 py-1">
                Empty paper
              </span>
              <span className="bg-crimson px-2 py-1 text-white">
                Higher N
              </span>
              <span className="border border-crimson px-2 py-1">
                Within cell alert
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
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
                      const count = summary?.occupancy_matrix?.[row]?.[col] ?? 0;
                      const alertPairs = alertLookup.get(`${row},${col}`) ?? 0;
                      const isSelected =
                        selected?.row === row && selected?.col === col;
                      return (
                        <td key={`${row}-${col}`} className="p-0">
                          <button
                            type="button"
                            onClick={() => setSelected({ row, col })}
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
        </section>

        <section className="instrument-border bg-paper p-5">
          <div className="mb-4 border-b border-line pb-4">
            <h3 className="text-sm font-extrabold">
              {selected
                ? `Cell [${selected.row}, ${selected.col}]`
                : "Select a cell"}
            </h3>
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
              {isLoading
                ? "Loading matrices"
                : loadError ??
                  (selectedCell
                    ? `N = ${selectedCell.count} detections`
                    : "Choose a cell on the occupancy grid")}
            </p>
          </div>

          {!selectedCell ? (
            <p className="text-sm text-muted">
              Use the occupancy grid to inspect a cell.
            </p>
          ) : selectedCell.count === 0 ? (
            <p className="border-l-2 border-crimson bg-[#F2F0EB] p-3 text-xs leading-5 text-muted">
              Empty cell. Count is 0 and both matrices are empty lists.
            </p>
          ) : (
            <div className="space-y-5">
              <p className="text-xs leading-5 text-muted">
                Matrix order:{" "}
                <span className="font-mono text-[11px] text-ink">
                  {selectedCell.labels.join(", ") || "unavailable"}
                </span>
                . Labels are frame local detections, not persistent identities.
              </p>

              <MatrixTable
                title="Distance matrix D"
                note={
                  threshold !== undefined
                    ? `Pixels. Crimson marks values at or below ${threshold} px.`
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
                  ),
                  color: "#151719",
                })}
              />

              <MatrixTable
                title="Alert matrix A"
                note="1 if a distinct pair is at or below the threshold."
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

              {selectedCell.within_cell_close_pairs > 0 ? (
                <p className="text-xs text-muted">
                  Unique within cell close pairs in this cell:{" "}
                  {selectedCell.within_cell_close_pairs} (upper triangle only).
                </p>
              ) : (
                <p className="text-xs text-muted">
                  No within cell close pairs in this cell. A singleton has D =
                  [[0]] and A = [[0]].
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="instrument-border mt-5 bg-paper p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
          <div>
            <h3 className="text-sm font-extrabold">Cross cell close pairs</h3>
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
              Each pair listed once. Supplemental to the per cell model.
            </p>
          </div>
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
            {selected
              ? `${highlightedPairs.length} touch the selected cell`
              : "Select a cell to highlight related pairs"}
          </p>
        </div>

        {(detail?.cross_cell_close_pairs ?? []).length === 0 ? (
          <p className="text-sm text-muted">
            {isLoading
              ? "Loading cross cell pairs."
              : "No cross cell close pairs in this processed frame."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left text-xs">
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
                  <th className="border-b border-line py-2 font-medium">
                    Distance
                  </th>
                </tr>
              </thead>
              <tbody>
                {(detail?.cross_cell_close_pairs ?? []).map((pair, pairIndex) => {
                  const [ar, ac] = pair.cell_a ?? [];
                  const [br, bc] = pair.cell_b ?? [];
                  const active =
                    selected &&
                    ((ar === selected.row && ac === selected.col) ||
                      (br === selected.row && bc === selected.col));
                  return (
                    <tr
                      key={`${pair.label_a}-${pair.label_b}-${pairIndex}`}
                      className={active ? "bg-[#F2F0EB]" : ""}
                    >
                      <td className="border-b border-line/70 py-2 pr-3 font-mono">
                        {pair.label_a ?? "unavailable"}
                      </td>
                      <td className="border-b border-line/70 py-2 pr-3">
                        {pair.cell_a ? `[${pair.cell_a.join(", ")}]` : "unavailable"}
                      </td>
                      <td className="border-b border-line/70 py-2 pr-3 font-mono">
                        {pair.label_b ?? "unavailable"}
                      </td>
                      <td className="border-b border-line/70 py-2 pr-3">
                        {pair.cell_b ? `[${pair.cell_b.join(", ")}]` : "unavailable"}
                      </td>
                      <td className="border-b border-line/70 py-2">
                        {formatPx(pair.distance_px)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {index.limitations.length > 0 ? (
        <section className="instrument-border mt-5 bg-paper p-5">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
            Dataset limitations
          </p>
          <ul className="mt-3 grid gap-2 text-xs leading-5 text-muted md:grid-cols-2">
            {index.limitations.map((item) => (
              <li key={item} className="border-l-2 border-crimson pl-3">
                {item.replace(/-/g, " ")}
              </li>
            ))}
          </ul>
          {index.validation?.meaning ? (
            <p className="mt-4 text-[11px] leading-5 text-muted">
              {index.validation.meaning.replace(/-/g, " ")}
            </p>
          ) : null}
        </section>
      ) : null}
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
  if (!values.length) {
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
                <th key={`${title}-h-${index}`} className="p-1 font-medium text-muted">
                  {label.replace(/^f\d+_/, "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {values.map((row, rowIndex) => (
              <tr key={`${title}-r-${rowIndex}`}>
                <th className="p-1 text-left font-medium text-muted">
                  {labels[rowIndex]?.replace(/^f\d+_/, "") ?? rowIndex}
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
