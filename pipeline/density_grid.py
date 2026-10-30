"""Phase 1: image-space proximity alerts plus grid occupancy visualization.

No tracking, physical-distance calibration, or validated emergency classifier.
Grid counts describe current detections, not unique people across the video.
Run with --help for tuning options. Pixel distances use ORIGINAL video pixels.
"""
import argparse
import json
import math
from pathlib import Path


def analyze_feet(feet, width, height, rows, cols, threshold):
    counts = [[0 for _ in range(cols)] for _ in range(rows)]
    for x, y in feet:
        col = min(cols - 1, max(0, int(x * cols / width)))
        row = min(rows - 1, max(0, int(y * rows / height)))
        counts[row][col] += 1
    pairs, involved, minimum = [], set(), None
    for a in range(len(feet)):
        for b in range(a + 1, len(feet)):
            distance = math.hypot(feet[a][0] - feet[b][0], feet[a][1] - feet[b][1])
            minimum = distance if minimum is None else min(minimum, distance)
            if distance <= threshold:
                pairs.append((a, b, distance))
                involved.update((a, b))
    return counts, pairs, involved, minimum


def arguments():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--video', default='/projectnb/ct-vehicle-bws/data/new.MP4')
    p.add_argument('--out-dir', default='/projectnb/ct-vehicle-bws/runs/density_grid_v2')
    p.add_argument('--model', default='yolov8x.pt')
    p.add_argument('--conf', type=float, default=0.25)
    p.add_argument('--imgsz', type=int, default=1280)
    p.add_argument('--stride', type=int, default=3)
    p.add_argument('--rows', type=int, default=10)
    p.add_argument('--cols', type=int, default=10)
    p.add_argument('--prox-dist', type=float, default=60.0,
                   help='Unvalidated threshold in original-video pixels (default: 60).')
    p.add_argument('--device', default='0')
    p.add_argument('--hide-distances', action='store_true', help='Compatibility option: pair distance labels are always hidden.')
    args = p.parse_args()
    if min(args.stride, args.rows, args.cols, args.imgsz) < 1:
        p.error('stride, rows, cols, and imgsz must be positive integers')
    if not math.isfinite(args.prox_dist) or args.prox_dist <= 0:
        p.error('prox-dist must be finite and positive')
    if not 0 < args.conf <= 1:
        p.error('conf must be in (0, 1]')
    return args


def main():
    args = arguments()
    import cv2
    from ultralytics import YOLO

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        raise SystemExit('Could not open video: ' + args.video)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = float(cap.get(cv2.CAP_PROP_FPS))
    cap.release()
    if width <= 0 or height <= 0:
        raise SystemExit('Invalid video dimensions')
    if args.rows > height or args.cols > width:
        raise SystemExit('Grid dimensions must not exceed video pixel dimensions')
    if not math.isfinite(fps) or fps <= 0:
        raise SystemExit('Invalid video FPS; cannot preserve playback timing')

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / 'annotated_proximity_new.mp4'
    json_path = out_dir / 'density_results_new.json'
    if out_path.exists() or json_path.exists():
        raise SystemExit('Output already exists. Choose a new --out-dir for this comparison.')
    model = YOLO(args.model)
    writer = cv2.VideoWriter(str(out_path), cv2.VideoWriter_fourcc(*'mp4v'),
                             fps / args.stride, (width, height))
    if not writer.isOpened():
        raise SystemExit('Could not open video writer: ' + str(out_path))

    scale = max(0.4, width / 1920.0)
    white, red, cyan = (255, 255, 255), (0, 0, 255), (255, 200, 0)
    # Fixed occupancy scale: same count keeps same color across frames.
    # Amber occupancy shading is deliberately distinct from red proximity alerts.
    def occupancy_color(n):
        t = min(n / 5.0, 1.0)  # Color saturation at 5; NOT an alert threshold.
        return (0, int(190 + 25 * t), int(60 + 195 * t))

    def label(frame, text, point, color=white, font_scale=None):
        fs = font_scale if font_scale is not None else 0.65 * scale
        thickness = max(1, round(2 * scale))
        cv2.putText(frame, text, point, cv2.FONT_HERSHEY_SIMPLEX, fs,
                    (0, 0, 0), thickness + 2, cv2.LINE_AA)
        cv2.putText(frame, text, point, cv2.FONT_HERSHEY_SIMPLEX, fs,
                    color, thickness, cv2.LINE_AA)

    frame_no = alert_frames = max_pairs = peak_cell_run = 0
    min_dist_ever = None
    logs = []
    print(f'Video: {width}x{height} @ {fps:.3f} fps; processing every {args.stride} frames', flush=True)
    print(f'Grid: {args.rows}x{args.cols}; threshold: {args.prox_dist:g} ORIGINAL-video px', flush=True)
    print('Detection only; threshold unvalidated; no physical emergency inference.', flush=True)
    try:
        results = model.predict(source=args.video, stream=True, classes=[0],
                                conf=args.conf, imgsz=args.imgsz, vid_stride=args.stride,
                                device=args.device, verbose=False)
        for result in results:
            frame_no += 1
            frame = result.orig_img.copy()
            if frame.shape[:2] != (height, width):
                raise RuntimeError('Frame dimensions changed during decoding')
            feet = []
            if result.boxes is not None:
                for x1, y1, x2, y2 in result.boxes.xyxy.cpu().numpy():
                    feet.append(((float(x1) + float(x2)) / 2.0, float(y2)))
            counts, pairs, involved, minimum = analyze_feet(
                feet, width, height, args.rows, args.cols, args.prox_dist)
            peak = max(max(row) for row in counts)
            peak_cell_run = max(peak_cell_run, peak)
            if minimum is not None:
                min_dist_ever = minimum if min_dist_ever is None else min(min_dist_ever, minimum)
            alert_frames += int(bool(pairs))
            max_pairs = max(max_pairs, len(pairs))

            overlay = frame.copy()
            occupied = []
            for rr, row in enumerate(counts):
                for cc, n in enumerate(row):
                    if n:
                        x0, y0 = round(cc * width / args.cols), round(rr * height / args.rows)
                        x1 = min(width - 1, round((cc + 1) * width / args.cols))
                        y1 = min(height - 1, round((rr + 1) * height / args.rows))
                        cv2.rectangle(overlay, (x0, y0), (x1, y1), occupancy_color(n), -1)
                        occupied.append({'row': rr, 'col': cc, 'people': n})
            cv2.addWeighted(overlay, 0.25, frame, 0.75, 0, frame)
            for rr in range(args.rows + 1):
                y = min(height - 1, round(rr * height / args.rows))
                cv2.line(frame, (0, y), (width - 1, y), (190, 190, 190), 1)
            for cc in range(args.cols + 1):
                x = min(width - 1, round(cc * width / args.cols))
                cv2.line(frame, (x, 0), (x, height - 1), (190, 190, 190), 1)
            for cell in occupied:
                x = round(cell['col'] * width / args.cols) + max(2, round(4 * scale))
                y = min(height - 3, round(cell['row'] * height / args.rows) + round(22 * scale))
                label(frame, str(cell['people']), (x, y))

            for a, b, distance in pairs:
                pa, pb = tuple(map(round, feet[a])), tuple(map(round, feet[b]))
                cv2.line(frame, pa, pb, red, max(1, round(2 * scale)))
            for idx, foot in enumerate(feet):
                cv2.circle(frame, tuple(map(round, foot)), max(2, round(5 * scale)),
                           red if idx in involved else cyan, -1)

            banner = [
                f'PEOPLE IN FRAME: {len(feet)} | Peak cell (now): {peak} | Grid: {args.rows}x{args.cols}',
                f'Close pairs: {len(pairs)} | People in alert: {len(involved)} | Threshold: {args.prox_dist:g} px',
                'PROXIMITY ALERT: pair(s) within threshold' if pairs else 'PROXIMITY ALERT: NONE',
                'Pixel distance only - unvalidated emergency indicator',
            ]
            panel_height = min(height, round(136 * scale))
            frame[:panel_height] = (frame[:panel_height] * 0.35).astype('uint8')
            for line_no, text in enumerate(banner):
                label(frame, text, (round(14 * scale), round((29 + 31 * line_no) * scale)),
                      red if line_no == 2 and pairs else white)
            writer.write(frame)
            # Log every processed frame; detection indices are local to each frame.
            logs.append({
                'processed_frame': frame_no, 'people': len(feet),
                'peak_cell_count': peak, 'occupied_cells': occupied,
                'close_pairs': len(pairs), 'people_in_alert': len(involved),
                'minimum_pair_distance_px': minimum,
                'feet_xy_px': [[x, y] for x, y in feet],
                'pair_details': [{'a': a, 'b': b, 'distance_px': d} for a, b, d in pairs],
            })
            if frame_no % 50 == 0:
                print(f'  {frame_no} processed frames...', flush=True)
    finally:
        writer.release()
    if frame_no == 0:
        raise SystemExit('No frames processed; no summary written')

    summary = {
        'video': Path(args.video).name,
        'method': 'image-space pairwise proximity alerts + grid occupancy heatmap',
        'model': args.model, 'confidence_threshold': args.conf, 'inference_imgsz': args.imgsz,
        'tracking_enabled': False, 'resolution': [width, height],
        'source_fps': fps, 'video_stride': args.stride, 'output_fps': fps / args.stride,
        'grid': [args.rows, args.cols], 'grid_index_base': 0,
        'proximity_threshold_px': args.prox_dist, 'distance_coordinate_space': 'original video pixels',
        'threshold_validated': False, 'frames_processed': frame_no,
        'frames_with_proximity_alert': alert_frames,
        'pct_frames_with_alert': round(100.0 * alert_frames / frame_no, 1),
        'max_close_pairs_in_one_frame': max_pairs,
        'peak_cell_count_over_run': peak_cell_run,
        'closest_distance_seen_px': min_dist_ever,
        'sampled_frame_log': logs,
        'log_sampling': 'every processed frame; indices a/b are not persistent track IDs',
        'note': 'Alerts mean estimated box-bottom-center distance <= threshold, regardless of grid. '
                'Counts are detections per processed frame, not unique visitors. Feet are estimates. '
                'No calibration, motion analysis, or temporal confirmation. Proximity does not establish '
                'an emergency. Occupancy color saturates at 5 and never triggers an alert. '
                'Frame percentages refer only to processed frames.',
    }
    with json_path.open('w') as handle:
        json.dump(summary, handle, indent=2, allow_nan=False)
    print(f'Processed: {frame_no}; alert frames: {alert_frames} ({summary["pct_frames_with_alert"]}%)')
    print(f'Annotated video: {out_path}\nResults JSON: {json_path}', flush=True)


if __name__ == '__main__':
    main()
