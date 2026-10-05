METRIC-GRAPH DATA HANDOFF — PHASE 1, PIXEL SPACE

This package implements the framewise portion of the professor's October
metric-graph document using the existing 589-frame density log. It extends
our previous per-cell matrices; no video detection was rerun.

START HERE
1. Read FIRST_FRAME_EXAMPLE.txt for a worked example with real measurements.
2. Open data/manifest.json for conventions, paper equation mappings, source
   provenance, unavailable capabilities, and dataset totals.
3. Open data/frame_index.json for compact frame summaries.
4. Load data/frames/frame_0001.json for the complete first frame, or any of
   the other 588 frame files. The index gives each relative filename.
5. data/validation_report.json records the numerical checks.

WHAT WAS IMPLEMENTED
D: full frame distance matrix, in original image pixels (paper Eq. 2.2).
C: every grid cell's count and within-cell distance matrix (Eq. 2.7).
A: full frame adjacency matrix, with 1 only for distinct detections whose
   distance is STRICTLY LESS THAN rho=60 pixels (Eq. 3.3).
W: frame alarm; true if the graph has any edge (Eq. 3.4).
V: number of unordered close pairs (Eq. 3.6).
Degree: number of neighbors of each detection (Eq. 3.7).
Edge weight: rho-distance for each flagged pair (Eq. 3.8).
Frame depth: max(0,rho-nearest distance), in pixels (Eq. 3.9).
Connected components, including isolated detections, and graph Laplacian L.
Neighboring-cell search with independent all-pairs comparison (Theorem 4.2).

IMPORTANT DISTINCTIONS
A graph component is a chain-connected group, not necessarily a clique.
A component ID is local to a frame. It is not a persistent group identity.
Node IDs are local detections, not persistent track IDs or verified people.
Frame depth is geometric threshold depth, not an evaluated danger score.
All matrices share the explicit matrix_axis_labels ordering. For cell matrices,
use the cell's labels/detection_indices. Symmetric entries repeat each pair;
count the upper triangle to count unordered pairs once.

RECTANGULAR GRID SEARCH
The actual image is 1920 x 1080 and the grid is 10 x 10. Cells are 192 x 108
pixels, not squares. We use exact rectangle set-distance:
 dx=max(0,abs(column_a-column_b)-1)*192
 dy=max(0,abs(row_a-row_b)-1)*108
 gap=sqrt(dx*dx+dy*dy)
Cell pairs remain candidates if gap<rho. Each unordered detection pair is
then evaluated at most once. This generalizes the paper's square-grid example
without incorrectly assuming equal width and height.

RESULTS
589 processed frames and 58,900 cell records.
10,757 within-cell plus 2,601 cross-cell flagged pair observations.
These are repeated observations across frames, not distinct people/events.
All 589 frames have at least one flagged pair.
No pair is exactly 60 pixels apart. Thus changing <=60 to <60 changes no
observed alert in this dataset, but the implementation now follows the paper.
All-pairs search: 142,196 unordered pair-distance evaluations.
Localized search: 51,310, a 63.916% reduction in pair evaluations.
This is NOT a measured runtime speedup. The research exporter computes both
methods and full distance matrices for validation, so the exporter itself
still performs all-pairs work. Cell-screening overhead is not in this count.

VALIDATION
All 589 frame outputs pass numerical checks. Twelve synthetic cases cover
threshold equality, grid boundaries, empty/singleton frames, coincident points,
chain-connected non-cliques, rectangular grids, and larger neighborhoods.
Connected components were checked with a separate union-find method. Search
edge sets match the global oracle on all real frames and synthetic cases.
This validates computation from the supplied estimates, NOT detector accuracy,
the correctness of all proofs in the paper, or real-world emergency detection.

UNAVAILABLE CAPABILITIES (NOT FABRICATED)
Sections 5-6: physical calibration and uncertainty-certified labels require a
calibration map and justified deterministic localization-error bounds. YOLO
confidence is not a distance-error bound. No epsilon=0 assumption was imposed.
Section 7: pair exposure/persistence requires persistent identities and timing.
Section 8: no-missed-event guarantees require defensible motion bounds and
sampling gaps. No such guarantee is claimed.
Section 9: no obstacle-aware/geodesic or anisotropic metric has been added.
Nominal output time is (processed_frame-1)/output_fps, not a logged source
video timestamp. Only every third original frame was processed.
The 22 frames containing pair distances below 1 pixel remain in the export.
They need review for duplicate detections or overlapping projections. Nothing
was silently removed to improve the results.

REPRODUCE (Python 3.9+, standard library only)
python build_metric_graphs.py grid_source.json regenerated_data
python validate_export.py regenerated_data
Optional different pixel threshold:
python build_metric_graphs.py grid_source.json sensitivity_40px --rho 40
Changing rho is a sensitivity experiment, not validation of a safety threshold.

WEBSITE INTEGRATION
The app has not been modified by this package. Use data/frame_index.json as
its lightweight frame list, and load one data/frames/frame_NNNN.json at a time.
Keep existing per-cell views using C[row][col]. Add a global graph view using
nodes and edges. Nodes contain foot_xy_px, cell, degree, and component_id.
Map image coordinates to the display dimensions; don't interpret px as meters.
Keep dataset-level summaries separate from selected-frame summaries.
Copy the data into the app through its existing asset/API convention rather
than loading every frame's full matrices into the initial browser bundle.
