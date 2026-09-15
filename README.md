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
