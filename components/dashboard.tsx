"use client";

import { useMemo, useState } from "react";

import { CellMatricesExplorer } from "@/components/cell-matrices";
import {
  CrowdDensityMedia,
  CrowdDensityStats,
} from "@/components/crowd-density";
import { SceneCopilot } from "@/components/scene-copilot";
import type { CellMatrixIndex } from "@/lib/cell-matrices-types";
import type { GridSummary } from "@/lib/grid";
import type { AnalysisResults, ZoneName } from "@/lib/results";

type WorkspaceTab = "scene" | "density" | "matrices";

interface DashboardProps {
  results: AnalysisResults;
  videoUrl: string;
  grid: GridSummary;
  gridVideoUrl: string;
  cellMatrices: CellMatrixIndex;
}

const ZONE_ORDER: ZoneName[] = [
  "ALREADY PRESENT",
  "LEFT",
  "RIGHT",
  "TUNNEL",
  "TRAIN PATH",
  "OTHER",
];

function countFor(results: AnalysisResults, zone: ZoneName): number {
  const value = Number(results.counts?.[zone] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function formatManualValue(value: string | number): string {
  return String(value).replace(/-/g, " to ");
}

function manualTotal(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatManualValue).join(" to ");
  if (typeof value === "string" || typeof value === "number")
    return formatManualValue(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const total = record.total;
    if (Array.isArray(total)) return total.map(formatManualValue).join(" to ");
    if (typeof total === "string" || typeof total === "number")
      return formatManualValue(total);
  }
  return "not supplied";
}

function limitationList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function Dashboard({
  results,
  videoUrl,
  grid,
  gridVideoUrl,
  cellMatrices,
}: DashboardProps) {
  const [activeView, setActiveView] = useState<"landing" | "scene">("landing");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("scene");

  const analytics = useMemo(() => {
    const rows = ZONE_ORDER.map((zone) => ({
      zone,
      count: countFor(results, zone),
    }));
    const entryRows = rows.filter((row) => row.zone !== "ALREADY PRESENT");
    const enteredAfterStart = entryRows.reduce(
      (sum, row) => sum + row.count,
      0,
    );
    const dominant = entryRows.reduce(
      (best, row) => (row.count > best.count ? row : best),
      entryRows[0] ?? { zone: "OTHER" as ZoneName, count: 0 },
    );
    const maximum = Math.max(1, ...rows.map((row) => row.count));
    return { rows, enteredAfterStart, dominant, maximum };
  }, [results]);

  const resolution = Array.isArray(results.resolution)
    ? results.resolution.slice(0, 2).join(" × ")
    : "Not available";
  const duration = Number.isFinite(Number(results.duration_sec))
    ? `${Number(results.duration_sec).toFixed(1)} sec`
    : "Not available";

  function openSceneWorkspace() {
    setWorkspaceTab("scene");
    setActiveView("scene");
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-5 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="instrument-border flex items-center justify-between bg-paper px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center bg-crimson font-mono text-xs font-black tracking-tight text-white">
              AQ
            </div>
            <div>
              <p className="text-sm font-extrabold tracking-[-0.025em]">
                Aerial Scene Query{" "}
                <span className="font-medium text-muted">
                  Vision language research instrument
                </span>
              </p>
              <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-muted">
                Pedestrian & Vehicle Analysis
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-3 font-mono text-[9px] uppercase tracking-[0.13em] text-muted md:flex">
            <span>Built by Ovais Yusuf</span>
            <span className="h-px w-8 bg-line" />
            <span>MSc Capstone / Research Prototype</span>
          </div>
        </header>

        {activeView === "landing" ? (
          <section className="view-enter border-x border-b border-line bg-paper px-5 py-12 sm:px-8 lg:px-14 lg:py-16">
            <p className="mb-5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.15em] text-muted before:h-2 before:w-8 before:bg-crimson before:content-['']">
              Aerial intelligence / natural language access
            </p>
            <h1 className="text-[clamp(2.8rem,5.2vw,5.7rem)] font-black leading-[0.98] tracking-[-0.065em]">
              Language queryable aerial scene understanding for UAV traffic
              analysis
            </h1>
            <p className="mt-7 text-base leading-7 text-muted">
              Computer vision, multi object tracking, and language models
              combined to analyze movement and query aerial traffic scenes in
              plain language.
            </p>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.13em] text-muted">
              Built by Ovais Yusuf
            </p>
            <button
              type="button"
              onClick={openSceneWorkspace}
              className="mt-8 inline-flex items-center gap-3 bg-crimson px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.13em] text-white transition hover:bg-ink"
            >
              LET&apos;S GO <span aria-hidden="true">→</span>
            </button>
            <div className="mt-9 grid grid-cols-2 gap-x-6 gap-y-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted sm:grid-cols-4">
              {[
                ["01", "Detect"],
                ["02", "Track"],
                ["03", "Understand"],
                ["04", "Query"],
              ].map(([index, label]) => (
                <span key={index} className="flex items-center gap-2">
                  <b className="text-crimson">{index}</b> {label}
                </span>
              ))}
            </div>
          </section>
        ) : (
          <div className="view-enter">
            <section className="mt-8">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-crimson">
                    {workspaceTab === "scene"
                      ? "Scene 01"
                      : workspaceTab === "density"
                        ? "Scene 01, grid"
                        : "Scene 01, matrices"}
                  </p>
                  <h2 className="mt-1 text-3xl font-black tracking-[-0.045em]">
                    {workspaceTab === "scene"
                      ? "Pedestrian flow workspace"
                      : workspaceTab === "density"
                        ? "Crowd density and proximity"
                        : "Cell matrices"}
                  </h2>
                </div>
                <p className="hidden font-mono text-[9px] uppercase tracking-[0.12em] text-muted sm:block">
                  {workspaceTab === "scene"
                    ? `${results.video ?? "Annotated scene"}, ${resolution}`
                    : workspaceTab === "density"
                      ? grid.proximityThresholdPx !== undefined
                        ? `${grid.gridSize}, ${grid.proximityThresholdPx} px proximity`
                        : grid.gridSize
                      : cellMatrices.proximity_threshold_px !== undefined
                        ? `${cellMatrices.grid[0]} × ${cellMatrices.grid[1]}, ${cellMatrices.proximity_threshold_px} px`
                        : `${cellMatrices.grid[0]} × ${cellMatrices.grid[1]}`}
                </p>
              </div>

              <nav
                className="mb-5 flex border border-line bg-paper"
                aria-label="Workspace sections"
              >
                {(
                  [
                    ["scene", "Pedestrian flow"],
                    ["density", "Crowd density and proximity"],
                    ["matrices", "Cell matrices"],
                  ] as const
                ).map(([id, label]) => {
                  const active = workspaceTab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setWorkspaceTab(id)}
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

              {workspaceTab === "matrices" ? (
                <CellMatricesExplorer index={cellMatrices} />
              ) : (
              <div className="grid items-stretch gap-5 lg:grid-cols-[1.65fr_.85fr]">
                {workspaceTab === "density" ? (
                  <CrowdDensityMedia grid={grid} videoUrl={gridVideoUrl} />
                ) : (
                <section
                  className="instrument-border bg-paper p-4"
                  aria-labelledby="video-heading"
                >
                  <div className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-3">
                    <div>
                      <h3 id="video-heading" className="text-sm font-extrabold">
                        Annotated footage
                      </h3>
                      <p className="font-mono text-[9px] uppercase tracking-[0.11em] text-muted">
                        {duration}, {resolution}
                      </p>
                    </div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
                      {results.model ?? "yolov8x"} /{" "}
                      {results.tracker ?? "bytetrack"}
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
                            Set NEXT_PUBLIC_VIDEO_URL in Vercel.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
                )}

                <SceneCopilot />
              </div>
              )}

              {workspaceTab === "density" ? (
                <CrowdDensityStats grid={grid} />
              ) : workspaceTab === "matrices" ? null : (
                <>
            <section
              className="mt-5 grid grid-cols-2 border border-line bg-paper lg:grid-cols-4"
              aria-label="Scene statistics"
            >
              {[
                [
                  "Unique People",
                  String(results.total_people),
                  `Manual reference: ${manualTotal(results.ground_truth_manual)}`,
                ],
                [
                  "Entered After Start",
                  String(analytics.enteredAfterStart),
                  "Observed entry origins only",
                ],
                [
                  "Dominant Entrance",
                  analytics.dominant.zone,
                  `${analytics.dominant.count} tracked people`,
                ],
                ["Footage Window", duration, resolution],
              ].map(([label, value, note], index) => (
                <div
                  key={label}
                  className={`min-h-28 p-4 ${index < 3 ? "lg:border-r" : ""} ${index % 2 === 0 ? "border-r" : ""} ${index < 2 ? "border-b lg:border-b-0" : ""} border-line`}
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

            <section
              className="instrument-border mt-5 bg-paper p-5"
              aria-labelledby="distribution-heading"
            >
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
                <div>
                  <h3
                    id="distribution-heading"
                    className="text-sm font-extrabold"
                  >
                    Entry origin distribution
                  </h3>
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                    Unique tracked persons / zone
                  </p>
                </div>
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                  Crimson = dominant observed entrance
                </p>
              </div>
              <div className="mt-3">
                {analytics.rows.map((row) => {
                  const highlighted = row.zone === analytics.dominant.zone;
                  return (
                    <div
                      key={row.zone}
                      className="grid min-h-11 grid-cols-[9rem_1fr_2rem] items-center gap-3 border-b border-line/70 last:border-0 sm:grid-cols-[11rem_1fr_2.5rem]"
                    >
                      <span className="font-mono text-[9px] tracking-[0.06em] text-muted">
                        {row.zone}
                      </span>
                      <div className="h-2 bg-[#E5E3DD]">
                        <div
                          className={`h-full ${highlighted ? "bg-crimson" : row.zone === "ALREADY PRESENT" ? "bg-[#9B9D98]" : "bg-ink"}`}
                          style={{
                            width:
                              row.count === 0
                                ? 0
                                : `${Math.max(2, (row.count / analytics.maximum) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-right font-mono text-[10px]">
                        {row.count}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-xs leading-5 text-muted">
                “Already present” identifies people visible in the first frame;
                their actual entry origin was not observed.
              </p>
            </section>

            <details className="instrument-border group mt-5 bg-paper">
              <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-extrabold">
                <span>Analysis pipeline</span>
                <span className="font-mono text-lg font-normal text-crimson transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="border-t border-line px-5 py-5">
                <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
                  {[
                    ["01 / DETECTION", results.model ?? "yolov8x"],
                    ["02 / TRACKING", results.tracker ?? "bytetrack"],
                    ["03 / LANGUAGE", "GPT 4o mini"],
                  ].map(([label, value], index) => (
                    <div key={label} className="contents">
                      <div className="border border-line bg-white p-4">
                        <p className="font-mono text-[9px] uppercase tracking-[0.11em] text-muted">
                          {label}
                        </p>
                        <p className="mt-2 text-sm font-bold">
                          {String(value)}
                        </p>
                      </div>
                      {index < 2 && (
                        <span className="hidden font-mono text-muted md:block">
                          →
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                {limitationList(results.known_limitations).length > 0 && (
                  <div className="mt-5 border-t border-line pt-4">
                    <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                      Known limitations
                    </p>
                    <ul className="mt-2 grid gap-2 text-xs leading-5 text-muted md:grid-cols-3">
                      {limitationList(results.known_limitations).map((item) => (
                        <li
                          key={item}
                          className="border-l-2 border-crimson pl-3"
                        >
                          {item.replace(/-/g, " ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
                </>
              )}
            </section>

            <footer className="flex flex-wrap justify-between gap-2 py-6 font-mono text-[9px] uppercase tracking-[0.11em] text-muted">
              <span>Aerial Scene Query. Built by Ovais Yusuf.</span>
              <span>Research prototype. Counts are approximate.</span>
            </footer>
          </div>
        )}
      </div>
    </main>
  );
}
