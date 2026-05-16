import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ExecutionReport } from "../types.js";

export function writeJsonReport(report: ExecutionReport, outputPath: string): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");
}
