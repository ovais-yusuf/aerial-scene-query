# Aerial Scene Query

A Vercel-ready Next.js 14 research dashboard for language-queryable UAV pedestrian analysis. The application combines an externally hosted annotated video, structured analysis results, entry-origin analytics, and a server-side OpenAI question-answering route.

## Stack

- Next.js 14 with the App Router
- TypeScript
- Tailwind CSS
- OpenAI Node SDK
- Standard HTML5 video playback

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Replace `data/results.json` with your analysis file. Keep the same top-level fields described below.

3. Create `.env.local`:

   ```bash
   OPENAI_API_KEY=your_openai_api_key
   NEXT_PUBLIC_VIDEO_URL=https://your-host.example/annotated.mp4
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000`.

## Expected data

The app reads `data/results.json` on the server. Expected fields include:

```json
{
  "video": "scene.mp4",
  "resolution": [1920, 1080],
  "duration_sec": 59,
  "model": "yolov8x",
  "tracker": "bytetrack",
  "total_people": 64,
  "counts": {
    "ALREADY PRESENT": 16,
    "LEFT": 16,
    "RIGHT": 10,
    "TUNNEL": 14,
    "TRAIN PATH": 0,
    "OTHER": 8
  },
  "ground_truth_manual": {},
  "zones": {},
  "known_limitations": [],
  "tracks": []
}
```

The `/api/ask` route removes `tracks` before constructing the model prompt and includes only `n_tracks_recorded` in its place.

## Video hosting

Set `NEXT_PUBLIC_VIDEO_URL` to a direct HTTPS URL for the annotated MP4. For broad browser compatibility, encode it as H.264 with `yuv420p` pixel format and move the MP4 metadata to the beginning of the file:

```bash
ffmpeg -i annotated.mp4 -c:v libx264 -crf 20 -preset fast -pix_fmt yuv420p -movflags +faststart -an annotated_web.mp4
```

The host must permit direct video delivery and byte-range requests. The dashboard uses the standard `<video>` element and does not proxy the video through Vercel.

## Security

- `OPENAI_API_KEY` is read only inside `app/api/ask/route.ts` and is never sent to the browser.
- The client POSTs only a question to `/api/ask`.
- Questions are limited to 500 characters.
- The API route permits at most eight requests per forwarded IP per minute.
- Rate limiting is intentionally in memory, as requested. On a serverless deployment, each runtime instance has its own memory, so this is a basic abuse guard rather than a globally consistent limit.
- `.env*` files are ignored by Git.

## Deploy to Vercel

1. Push this directory to a Git repository.
2. Import the repository in Vercel.
3. Add these environment variables in **Project Settings → Environment Variables**:

   - `OPENAI_API_KEY`
   - `NEXT_PUBLIC_VIDEO_URL`

4. Deploy. Vercel will detect Next.js and use `npm run build` automatically.

Do not prefix the OpenAI key with `NEXT_PUBLIC_`; that prefix intentionally exposes variables to browser code.

## Next.js 14 compatibility note

This project intentionally targets the requested Next.js 14 line and currently resolves to Next.js 14.2.35. The package audit reports published advisories against the legacy 14.x line and recommends a breaking upgrade to the current Next.js major. Before exposing the project broadly on the public internet, review the current Next.js security guidance and plan an upgrade if your course or deployment requirements allow it. The application does not use Next Image, Server Actions, custom rewrites, or custom servers, which avoids several advisory-specific features, but it does not eliminate every framework-level risk.

## Commands

```bash
npm run dev
npm run typecheck
npm run build
npm start
```

## Python analysis and research exports

The website includes Pedestrian Flow, Crowd Density and Proximity, and Cell
Matrices views. The Cell Matrices workspace also exposes frame-level proximity
graphs. These are processed observations, not a live video feed.

- `pipeline/density_grid.py`: YOLOv8 person detection, grid occupancy, pixel-space
  proximity analysis, annotated video, and per-frame JSON. Distance-number labels
  are removed from the video; grid counts, proximity lines, foot dots, and the
  status banner remain. The legacy `--hide-distances` flag is accepted for
  compatibility, but labels are always hidden.
- `Professor_Cell_Matrices/`: original per-cell export and converter.
- `Metric_Graph_Research_Data/`: paper-aligned graph export, source observations,
  reproducible scripts, frame data, and validation results. Start with its
  `README.txt` and `FIRST_FRAME_EXAMPLE.txt`.

### Generate a new annotated video

Use a Python environment with `ultralytics` and `opencv-python` and an appropriate
PyTorch installation for the selected GPU. On the configured BU SCC environment:

```bash
module load miniconda
module load academic-ml/fall-2026
conda activate fall-2026-pyt
python pipeline/density_grid.py \
  --video /projectnb/ct-vehicle-bws/data/new.MP4 \
  --out-dir /projectnb/ct-vehicle-bws/runs/density_no_distance_labels
```

Run in an allocated compatible GPU session (the project uses `-l gpu_c=7.5`
when requesting a GPU). Override `--video` and `--out-dir` for another machine.
Use a new output directory for each run; existing outputs are not overwritten.
The script writes `annotated_proximity_new.mp4` and `density_results_new.json`.
Use `python pipeline/density_grid.py --help` for all options.

Defaults: YOLOv8x, confidence 0.25, inference size 1280, stride 3, a 10 x 10
occupancy grid, and a 60-pixel proximity threshold. This script uses detection
only, with no ByteTrack identities. It retains the original inclusive `<=`
threshold; the graph exporter below follows the paper's strict `<` rule.

### Reproduce the paper-aligned graph export

Python 3.9+ and the standard library are sufficient for the graph scripts:

```bash
cd Metric_Graph_Research_Data
python build_metric_graphs.py grid_source.json regenerated_data
python validate_export.py regenerated_data
```

For a new clip, pass its generated JSON as the first argument instead. A new
analysis run does not automatically replace the web application's datasets or
hosted video. Integrate and verify them explicitly before publishing new results.

The committed 589-frame dataset contains 58,900 cell records. Neighboring-cell
search matched all-pairs results using 51,310 versus 142,196 pair-distance
comparisons (63.9% fewer). This is a comparison-count result for this dataset,
not a measured runtime speedup or detection-accuracy score. No pair was exactly
60 pixels apart, so `<60` and `<=60` produced the same flags in that export.

Distances use estimated box-bottom-center points in original image pixels.
Detection labels and component IDs in the density/graph data are frame-local.
Physical calibration, uncertainty-certified labels, persistent-pair exposure,
and collision prediction are not implemented by these exports. Close pairs
are geometric flags, not confirmed emergencies.
