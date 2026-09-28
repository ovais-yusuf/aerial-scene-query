import type { GridSummary } from "@/lib/grid";

interface CrowdDensitySectionProps {
  grid: GridSummary;
  videoUrl: string;
}

export function CrowdDensitySection({
  grid,
  videoUrl,
}: CrowdDensitySectionProps) {
  const stats: [string, string, string][] = [
    ["Grid size", grid.gridSize, "Cells spanning the aerial scene"],
    [
      "Safety threshold",
      String(grid.threshold),
      "People per cell before an emergency flag",
    ],
    [
      "Frames processed",
      String(grid.framesProcessed),
      grid.video ? `Source · ${grid.video}` : "Density grid pass",
    ],
    [
      "Max people in any cell",
      String(grid.maxPeopleInAnyCell),
      "Peak occupancy observed in one cell",
    ],
    [
      "Emergency frames",
      String(grid.emergencyFrames),
      "Frames with at least one cell above threshold",
    ],
  ];

  return (
    <div>
      <section
        className="instrument-border bg-paper p-5"
        aria-labelledby="density-intro-heading"
      >
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-crimson">
          Grid analysis
        </p>
        <h3
          id="density-intro-heading"
          className="mt-1 text-sm font-extrabold"
        >
          Crowd density & emergency detection
        </h3>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted">
          A grid-based crowd-density analysis that divides the aerial scene into
          cells, assigns each person to a cell by their feet position, counts
          people per cell over time, and flags cells that exceed a safety
          threshold as possible crowding emergencies.
        </p>
      </section>

      <section
        className="instrument-border mt-5 bg-paper p-4"
        aria-labelledby="density-video-heading"
      >
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-3">
          <div>
            <h3 id="density-video-heading" className="text-sm font-extrabold">
              Density-annotated footage
            </h3>
            <p className="font-mono text-[9px] uppercase tracking-[0.11em] text-muted">
              {grid.gridSize} grid · threshold {grid.threshold}
            </p>
          </div>
          <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
            Feet assignment / cell occupancy
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

      <section
        className="mt-5 grid grid-cols-2 border border-line bg-paper lg:grid-cols-5"
        aria-label="Crowd density statistics"
      >
        {stats.map(([label, value, note], index) => (
          <div
            key={label}
            className={`min-h-28 p-4 border-line ${
              index < 4 ? "lg:border-r" : ""
            } ${index % 2 === 0 ? "border-r" : ""} ${
              index < 2 ? "border-b lg:border-b-0" : ""
            } ${index === 4 ? "col-span-2 border-t lg:col-span-1 lg:border-t-0" : ""} ${
              index >= 2 && index < 4 ? "border-b lg:border-b-0" : ""
            }`}
          >
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
            Known limitation
          </p>
          <p className="mt-2 border-l-2 border-crimson pl-3 text-xs leading-5 text-muted">
            {grid.note}
          </p>
        </section>
      ) : null}
    </div>
  );
}
