import type { GridSummary } from "@/lib/grid";
import { formatPxDistance } from "@/lib/format-px";

function readableCopy(text: string): string {
  return text.replace(/-/g, " ");
}

interface CrowdDensityMediaProps {
  grid: GridSummary;
  videoUrl: string;
}

interface CrowdDensityStatsProps {
  grid: GridSummary;
}

function statCards(grid: GridSummary): { label: string; value: string; note: string }[] {
  const cards: { label: string; value: string; note: string }[] = [
    {
      label: "Grid dimensions",
      value: grid.gridSize,
      note: "Occupancy visualization cells across the scene",
    },
  ];

  if (grid.proximityThresholdPx !== undefined) {
    cards.push({
      label: "Proximity threshold",
      value: `${grid.proximityThresholdPx} px`,
      note: grid.distanceCoordinateSpace
        ? `Pairwise foot distance in ${grid.distanceCoordinateSpace}`
        : "Pairwise foot distance threshold for alerts",
    });
  }

  if (grid.framesProcessed !== undefined) {
    cards.push({
      label: "Frames processed",
      value: String(grid.framesProcessed),
      note: grid.video ? `Source, ${grid.video}` : "Processed frames in grid.json",
    });
  }

  if (grid.framesWithProximityAlert !== undefined) {
    const pct =
      grid.pctFramesWithAlert !== undefined
        ? `${grid.pctFramesWithAlert}% of processed frames`
        : "Processed frames with ≥1 proximity alert";
    cards.push({
      label: "Frames with proximity alerts",
      value: String(grid.framesWithProximityAlert),
      note: pct,
    });
  }

  if (grid.maxClosePairsInOneFrame !== undefined) {
    cards.push({
      label: "Max close pairs (one frame)",
      value: String(grid.maxClosePairsInOneFrame),
      note: "Close pairs are not the same as people involved; one person can appear in multiple pairs",
    });
  }

  if (grid.peakCellCountOverRun !== undefined) {
    cards.push({
      label: "Peak cell occupancy",
      value: String(grid.peakCellCountOverRun),
      note: "Highest detections in one cell across the run (summary cards are not synced to playback)",
    });
  }

  const closest = formatPxDistance(grid.closestDistanceSeenPx);
  if (closest) {
    cards.push({
      label: "Closest pair distance",
      value: closest,
      note: "Minimum pairwise foot distance observed in processed frames",
    });
  }

  return cards;
}

export function CrowdDensityMedia({
  grid,
  videoUrl,
}: CrowdDensityMediaProps) {
  const thresholdLabel =
    grid.proximityThresholdPx !== undefined
      ? `${grid.proximityThresholdPx} px proximity`
      : "Proximity threshold unavailable";

  return (
    <div>
      <section
        className="instrument-border bg-paper p-5"
        aria-labelledby="density-intro-heading"
      >
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-crimson">
          Grid and pairwise proximity
        </p>
        <h3
          id="density-intro-heading"
          className="mt-1 text-sm font-extrabold"
        >
          Crowd density and proximity
        </h3>
        <p className="mt-3 text-sm leading-6 text-muted">
          The grid shows occupancy: how many detections fall in each cell per
          frame using estimated foot positions at the bottom center of each box.{" "}
          <strong className="font-semibold text-ink">Proximity alerts</strong>{" "}
          are separate. Every pair of foot points is measured in original video
          pixel space. If Euclidean distance is at or below the configured
          threshold, the pair is flagged, even across grid boundaries. Grid
          resolution changes the occupancy view, not the alert rule. Alerts do
          not establish an emergency or a validated safe distance.
        </p>
      </section>

      <section
        className="instrument-border mt-5 bg-paper p-4"
        aria-labelledby="density-video-heading"
      >
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-3">
          <div>
            <h3 id="density-video-heading" className="text-sm font-extrabold">
              Proximity annotated footage
            </h3>
            <p className="font-mono text-[9px] uppercase tracking-[0.11em] text-muted">
              {grid.gridSize} grid, {thresholdLabel}
            </p>
          </div>
          <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
            Detection only, no tracking IDs
          </p>
        </div>
        <div className="relative aspect-video overflow-hidden bg-[#111416]">
          {videoUrl ? (
            <video
              className="h-full w-full object-contain"
              controls
              playsInline
              preload="metadata"
              src={videoUrl}
            >
              Your browser does not support the video element.
            </video>
          ) : (
            <div className="telemetry-grid grid h-full place-items-center text-center">
              <div>
                <span className="mx-auto grid h-12 w-12 place-items-center border border-white/25 font-mono text-crimson">
                  ▶
                </span>
                <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.13em] text-white/75">
                  Video URL not configured
                </p>
                <p className="mt-2 text-xs text-white/40">
                  Set NEXT_PUBLIC_GRID_VIDEO_URL in Vercel.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function CrowdDensityStats({ grid }: CrowdDensityStatsProps) {
  const stats = statCards(grid);

  return (
    <div>
      <section
        className="mt-5 grid grid-cols-2 divide-x divide-y divide-line border border-line bg-paper lg:grid-cols-4"
        aria-label="Crowd density and proximity statistics"
      >
        {stats.map(({ label, value, note }) => (
          <div key={label} className="min-h-28 p-4">
            <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-muted">
              {label}
            </p>
            <p className="mt-2 text-2xl font-black tracking-[-0.04em]">
              {value}
            </p>
            <p className="mt-2 text-[11px] text-muted">{note}</p>
          </div>
        ))}
      </section>

      {grid.note ? (
        <section className="instrument-border mt-5 bg-paper p-5">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
            Notes from grid.json
          </p>
          <p className="mt-2 border-l-2 border-crimson pl-3 text-xs leading-5 text-muted">
            {readableCopy(grid.note)}
          </p>
          {grid.logSampling ? (
            <p className="mt-3 border-l-2 border-line pl-3 text-[11px] leading-5 text-muted">
              {readableCopy(grid.logSampling)}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
