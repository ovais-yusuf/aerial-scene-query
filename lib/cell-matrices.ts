import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  CellMatrixFrameDetail,
  CellMatrixIndex,
} from "@/lib/cell-matrices-types";

interface CompactFile {
  frames: CellMatrixFrameDetail[];
}

type CacheGlobal = typeof globalThis & {
  aerialCellMatrixIndex?: CellMatrixIndex;
  aerialCellMatrixFrames?: CompactFile;
};

const cache = globalThis as CacheGlobal;

async function readJson<T>(filename: string): Promise<T> {
  const filePath = path.join(process.cwd(), "data", filename);
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function loadCellMatrixIndex(): Promise<CellMatrixIndex> {
  if (!cache.aerialCellMatrixIndex) {
    cache.aerialCellMatrixIndex = await readJson<CellMatrixIndex>(
      "cell_matrices_index.json",
    );
  }
  return cache.aerialCellMatrixIndex;
}

export async function loadCellMatrixFrame(
  processedFrame: number,
): Promise<CellMatrixFrameDetail | undefined> {
  if (!cache.aerialCellMatrixFrames) {
    cache.aerialCellMatrixFrames = await readJson<CompactFile>(
      "cell_matrices_compact.json",
    );
  }
  return cache.aerialCellMatrixFrames.frames.find(
    (frame) => frame.processed_frame === processedFrame,
  );
}
