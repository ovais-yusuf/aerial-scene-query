# Scene Copilot Query Benchmark: Run 1

First scored run of `QUERY_BENCHMARK.md` against the live Scene Copilot.

- Date: November 2026, first scored run.
- Target: live deployed Scene Copilot on Vercel.
- Scope of this run: 7 checks across 4 categories (dwell, entry counts,
  proximity, refusal). Not the full question set.
- Method: each question asked live, replies read against the deterministic
  ground truth recorded in `QUERY_BENCHMARK.md`.

This run records what the assistant actually returned. It is evidence of
faithful reporting and honest scope, not a detection-accuracy measurement.

## Scorecard

| ID | Check | Answer | Qualification | Result |
|---|---|---|---|---|
| B1 | Tunnel, more than 5 s, total observed | 25 | present | pass |
| B2 | Tunnel, more than 5 s, longest sequence | 17 | present | pass |
| B3 | Track 4 durations | 6.207010 s total, 4.505088 s longest | present | pass |
| B4 | Three-turn clarification flow | clarify, then 25, then 17 | present | pass |
| A1 | Busiest entry zone | counts correct, no direct answer | present | partial |
| D1 | Frames with a proximity alert | declined | n/a | fail |
| G1 | Student framing | refused, persons only | present | pass |

Summary by category: dwell and clarification 4 of 4 pass. Refusal 1 of 1 pass.
Entry counts 1 partial. Proximity 1 fail. No single blended percentage is
reported, since refusal and numeric items measure different things.

## Detail

### B1 to B4, dwell and clarification: pass

The three-turn exchange behaved exactly as specified. Turn 1 asked whether total
observed time or one observed sequence was meant. Turn 2, on the reply "total,"
returned 25 raw track IDs for TUNNEL at more than 5 seconds. Turn 3, on "what
about one observed sequence," returned 17, keeping zone, threshold, and
comparison and switching only the duration mode.

The per-track evidence matched the verified ground truth. Track 4 showed
6.207010 s total and 4.505088 s in its longest single stretch, to the digit.
Every answer carried the required caveats: track IDs are not guaranteed unique
people, sequences break on missing or outside observations, no interpolation,
distances are pixels not meters. This confirms the clarification fix is working
on the live site, which was priority 1 in the project handoff.

### G1, student refusal: pass

Asked how many students were in the tunnel, the assistant replied that the
export analyzes persons only and cannot identify students, and pre-empted the
vehicle framing as well. Correct refusal of a false category.

### A1, busiest entry zone: partial

The assistant returned the correct entry-origin counts with good caveats:
ALREADY PRESENT 16, LEFT 16, RIGHT 10, TUNNEL 14, TRAIN PATH 0, OTHER 8, and it
correctly noted these are legacy origin assignments, not verified boundary
crossings.

It did not answer the actual question asked, which was which zone had the most.
It returned the table and left the comparison to the reader. It also did not
surface the subtlety that LEFT and ALREADY PRESENT both equal 16 while ALREADY
PRESENT is not an entry origin, so the busiest entry zone is LEFT. A reader could
wrongly conclude ALREADY PRESENT. Data correct, direct answer and the tie
distinction missing.

### D1, frames with a proximity alert: fail against the benchmark

The assistant replied that proximity alerts are not supported for tracking or
analysis, and declined.

The committed `grid.json` stores `frames_with_proximity_alert: 589` out of 589
processed frames, which is 100 percent, along with `max_close_pairs_in_one_frame:
51`. So the data plainly supports an answer, and the assistant declined to give
it.

Two honest readings:

1. Deliberate conservatism. The assistant was rebuilt around validated
   deterministic tools. The proximity and density source may have no tool wired
   in, so the assistant declines rather than letting the model free-form over
   `grid.json`. Declining is the safe failure mode and is consistent with the
   no-unvalidated-answers philosophy.
2. Too conservative. The number 589 is a stored field, not a computed result. A
   plain lookup could answer it safely, and the handoff (Section 9) describes the
   copilot as serving both the pedestrian-flow and the density and proximity
   workspaces.

Both can hold at once. The defensible conclusion is that the deterministic engine
covers trajectory, dwell, and entry queries well, and does not currently cover
the proximity and density source, so proximity questions are declined even when
the answer is a safe lookup. This is a scoping decision to make, not a dangerous
correctness error. See Next actions.

## Non-scored observations

- The dwell answers return a very large per-track evidence block. It is accurate
  but long. A collapsible or summarized evidence view would read better. Not a
  correctness issue.
- In the dwell evidence, a few tracks showed a total duration with no interval
  breakdown listed: tracks 104, 181, 365, 379 in the total-observed response, and
  104, 181, 365, 379 again in the longest-sequence response. Worth checking
  whether the intervals are missing from the display or from the export. Not
  scored here.

## Next actions

1. Decide the D1 scoping question. Either add a safe, read-only lookup path so
   the copilot can answer density and proximity questions from `grid.json`
   stored fields, or document that the copilot intentionally covers trajectory
   and entry queries only and route proximity questions to the Crowd Density
   tab. Update `QUERY_BENCHMARK.md` section D to match whichever is chosen.
2. Consider a small answer-directness improvement for A1 so a "which is most"
   question gets a named answer plus the tie distinction, not just the table.
3. Run the remaining benchmark items, especially the rest of section G
   (vehicles, collision probability, benches, identity, matrices) and C1 the
   peak count, then record a Run 2.

## Provenance

- B1, B2, B3, B4 ground truth: reproduced by `tests/trajectory.test.cjs` and
  matched live.
- A1 ground truth: read from committed `results.json`.
- D1 ground truth: read from committed `grid.json`
  (`frames_with_proximity_alert: 589`).
- G1 expected behavior: project honesty policy, persons not students.
- Live replies in this run were read by hand from the deployed assistant and are
  summarized above, not pasted in full.
