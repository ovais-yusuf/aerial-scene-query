import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadHowItWorks(): Promise<string> {
  const filePath = path.join(process.cwd(), "data", "HOW_IT_WORKS.md");
  return readFile(filePath, "utf8");
}
