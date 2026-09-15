import { Dashboard } from "@/components/dashboard";
import { loadResults } from "@/lib/results";

export const dynamic = "force-dynamic";

export default async function Home() {
  const results = await loadResults();

  return (
    <Dashboard
      results={results}
      videoUrl={process.env.NEXT_PUBLIC_VIDEO_URL ?? ""}
    />
  );
}
