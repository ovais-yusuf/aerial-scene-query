"""Convert existing foot-coordinate logs to per-cell matrices; no detector needed.
Usage: python convert_grid_to_matrices.py grid.json output.json
Python 3.9+; standard library only. Distances remain in original-video pixels.
"""
import hashlib
import json
import math
import sys
from pathlib import Path


def convert(source):
    raw = Path(source).read_bytes()
    data = json.loads(raw)
    rows, cols = data['grid']
    width, height = data['resolution']
    threshold = float(data['proximity_threshold_px'])
    if min(rows, cols, width, height) <= 0 or not math.isfinite(threshold) or threshold <= 0:
        raise ValueError('Invalid geometry or threshold')
    source_frames = data['sampled_frame_log']
    if len(source_frames) != data['frames_processed']:
        raise ValueError('This converter requires a log entry for every processed frame')
    frames = []
    for sequence, f in enumerate(source_frames, 1):
        t = f['processed_frame']
        if t != sequence:
            raise ValueError('Processed-frame indices must be consecutive starting at 1')
        points = [[float(x), float(y)] for x, y in f['feet_xy_px']]
        if not all(math.isfinite(v) for p in points for v in p):
            raise ValueError('Nonfinite coordinate')
        if len(points) != f['people']:
            raise ValueError('Detection count mismatch')
        def cell_of(p):
            # Same floor-and-clamp convention as the producer script.
            return (min(rows-1, max(0, int(p[1] * rows / height))),
                    min(cols-1, max(0, int(p[0] * cols / width))))
        memberships = [cell_of(p) for p in points]
        labels = [f'f{t:04d}_d{i:03d}' for i in range(len(points))]
        buckets = [[[] for _ in range(cols)] for _ in range(rows)]
        for i, (rr, cc) in enumerate(memberships):
            buckets[rr][cc].append(i)
        counts = [[len(ids) for ids in row] for row in buckets]
        source_counts = [[0]*cols for _ in range(rows)]
        for entry in f['occupied_cells']:
            source_counts[entry['row']][entry['col']] = entry['people']
        if source_counts != counts:
            raise ValueError(f'Occupancy mismatch in frame {t}')
        global_d = [[math.dist(a, b) for b in points] for a in points]
        grid = []
        for rr in range(rows):
            cell_row = []
            for cc in range(cols):
                ids = buckets[rr][cc]
                distances = [[global_d[a][b] for b in ids] for a in ids]
                alerts = [[int(a != b and global_d[a][b] <= threshold) for b in ids] for a in ids]
                cell_row.append({
                    'count': len(ids),
                    'detection_indices': ids,
                    'labels': [labels[i] for i in ids],
                    'feet_xy_px': [points[i] for i in ids],
                    'distance_matrix_px': distances,
                    'proximity_matrix': alerts,
                })
            grid.append(cell_row)
        cross = []
        all_alerts = {}
        within = 0
        for a in range(len(points)):
            for b in range(a+1, len(points)):
                d = global_d[a][b]
                if d <= threshold:
                    all_alerts[(a,b)] = d
                    if memberships[a] == memberships[b]:
                        within += 1
                    else:
                        cross.append({'a': a, 'b': b, 'label_a': labels[a], 'label_b': labels[b],
                                      'cell_a': list(memberships[a]), 'cell_b': list(memberships[b]),
                                      'distance_px': d})
        observed = {(p['a'],p['b']): p['distance_px'] for p in f['pair_details']}
        if observed.keys() != all_alerts.keys() or not all(
                math.isclose(observed[k], v, rel_tol=1e-9, abs_tol=1e-9)
                for k,v in all_alerts.items()):
            raise ValueError(f'Alert pair mismatch in frame {t}')
        involved = {i for pair in all_alerts for i in pair}
        if len(all_alerts) != f['close_pairs'] or len(involved) != f['people_in_alert']:
            raise ValueError(f'Alert count mismatch in frame {t}')
        frames.append({
            'processed_frame': t,
            'nominal_output_time_sec': (t-1)/data['output_fps'],
            'detection_count': len(points),
            'occupancy_matrix': counts,
            'C': grid,
            'within_cell_close_pairs': within,
            'cross_cell_close_pairs': cross,
            'total_close_pairs': len(all_alerts),
            'people_in_alert': len(involved),
        })
    return {
        'schema_version': '1.0',
        'description': 'For every processed frame t, C[row][col] contains count N and full within-cell distance matrix D, plus explicit row/column labels.',
        'source_file': Path(source).name,
        'source_sha256': hashlib.sha256(raw).hexdigest(),
        'source_metadata': {k:v for k,v in data.items() if k != 'sampled_frame_log'},
        'conventions': {
            'grid_shape': [rows,cols], 'cell_index_base': 0, 'detection_index_base': 0,
            'processed_frame_index_base': 1,
            'matrix_axis_order': 'labels and detection_indices in each cell; original per-frame detection order',
            'coordinates': 'x rightward, y downward from top-left; original video pixels',
            'cell_assignment': 'floor coordinate scaled by grid dimension, clamped to valid grid index',
            'distance': 'Euclidean distance between estimated box-bottom-center points; original video pixels',
            'alert_rule': 'distance <= proximity_threshold_px, distinct detections only',
            'threshold_px': threshold,
            'threshold_interpretation': 'Working assumption for proximity. Handwritten note appears to use >=; not confirmed with professor. Full distances permit either comparison later.',
            'identity': 'Frame-local detection labels only; not persistent track IDs or verified distinct people',
            'empty_cell': 'count=0; labels, coordinates, and both matrices are []',
            'singleton_cell': 'count=1; distance_matrix_px=[[0.0]]; proximity_matrix=[[0]]',
            'symmetry': 'Both matrices symmetric; diagonal zero; count pairs using upper triangle only',
            'time': 'nominal_output_time_sec is (processed_frame-1)/output_fps, not a measured original-video timestamp. Source frame numbers and timestamps were not logged.',
            'cross_cell_extension': 'cross_cell_close_pairs lists each cross-cell flagged pair once; supplemental to the professor per-cell structure',
        },
        'limitations': [
            'No calibration to meters; perspective affects physical interpretation.',
            'No persistent identities, motion analysis, or event deduplication.',
            'No rerun, detector correction, or new accuracy evaluation performed.',
            'Near-coincident estimates are retained, not silently removed; they can reflect duplicate detections or overlapping projections.',
            'Proximity flags do not establish emergencies; threshold is unvalidated.',
        ],
        'frames': frames,
    }


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    destination = Path(sys.argv[2])
    if destination.exists():
        raise SystemExit('Output exists; choose a new filename')
    result = convert(sys.argv[1])
    destination.write_text(json.dumps(result, separators=(',', ':'), allow_nan=False))
    print(f'Wrote {len(result["frames"])} frames to {destination}')
