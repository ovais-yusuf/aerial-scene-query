PER-CELL CROWD MATRICES — RESEARCH DATA HANDOFF
Prepared from the supplied grid.json; no new detection run was performed.

START WITH START_HERE_example.txt for a readable worked example from the first
processed frame. Then use cell_matrices.json for the complete dataset.

INTERPRETATION OF THE PROFESSOR'S NOTE
For each processed frame t, C^t is a 10 x 10 grid. Each cell holds an ordered
pair (N,D): its detection count N and a symmetric N x N distance matrix D.
The JSON represents this pair using named fields count and distance_matrix_px.
Supplemental fields provide explicit labels, source detection indices, foot
coordinates, and a binary proximity matrix. This is a nested structure, not
one ordinary rectangular numeric matrix: the inner matrix sizes vary by cell.

WHAT IS INCLUDED
cell_matrices.json: complete data for all 589 processed frames and 58,900 cells.
example_frame_0001.json: readable indented JSON for the first frame.
START_HERE_example.txt: first-frame occupancy and every occupied cell's matrices.
convert_grid_to_matrices.py: reproducible converter; Python 3.9+, no dependencies.
grid_source.json: unmodified copy of the input, retained for provenance.
validation_report.json: numerical and structural checks, not accuracy scores.
README.txt: this guide.

HOW TO READ THE DATA IN PYTHON
import json
with open('cell_matrices.json') as f:
    data = json.load(f)
frame = data['frames'][0]           # first processed frame
cell = frame['C'][3][4]            # row 3, column 4, zero-based
N = cell['count']                  # 6 detections in this actual cell
D = cell['distance_matrix_px']     # 6 x 6 full distance matrix
labels = cell['labels']            # matching row and column order
A = cell['proximity_matrix']       # 6 x 6 binary alert matrix
# D[0][1] measures distance between labels[0] and labels[1].
# C^t_(k,j) from the note is represented by (N,D).

REPRODUCE
python convert_grid_to_matrices.py grid_source.json regenerated_matrices.json
The source SHA-256 is recorded in cell_matrices.json. The source_file metadata
will reflect the input filename used. Outputs are not overwritten by default.

CONVENTIONS AND WORKING ASSUMPTIONS
1. Cell rows/columns and detection indices start at 0; processed frames at 1.
2. Labels such as f0001_d003 mean frame 1, detection index 3. They are NOT
   persistent identities. No tracking was enabled in this density run.
3. Distances use Euclidean separation of estimated box-bottom-center points
   in ORIGINAL 1920 x 1080 image pixels. They are not meters.
4. All within-cell distances are included, even above the alert threshold.
5. Alerts use distance <=60 px and exclude diagonal/self comparisons. The
   handwritten inequality appears to be >=; <= is our proximity interpretation
   pending professor confirmation. Full distances support either rule later.
6. Each unordered pair occurs twice in a symmetric matrix. Count unique pairs
   using only entries above the diagonal. Matrix order follows detection_indices.
7. Empty cells use count=0 and empty lists; singleton cells have D=[[0.0]], A=[[0]].
8. Cross-cell flagged pairs are retained separately, each once, so grid boundaries
   do not erase alerts. This is supplemental to the handwritten per-cell model.
9. nominal_output_time_sec=(processed_frame-1)/output_fps is the nominal output
   playback time only. Actual source frame numbers/timestamps were not recorded.
10. 589 snapshots correspond to processed frames, not all source-video frames.

LIMITATIONS AND DATA QUALITY
All 589 processed frames have at least one proximity alert. This is frequency,
not accuracy. The closest estimated points are about 0.057 px apart; 22 frames
contain a pair below 1 px. These may reflect duplicate detections or overlapping
projections and require visual review. No detections were silently removed.
Cell membership and foot locations inherit detector errors. Perspective means
pixel distances do not correspond to a consistent ground distance. A proximity
alert does not establish an emergency. No physical calibration, persistent IDs,
motion analysis, or temporal event counting has been added.

CONFIRM WITH PROFESSOR
- Is the desired comparison distance <=T or >=T?
- Do 'tagged individuals' need persistent identities across frames?
- Are pixel distances acceptable for this initial analysis?
