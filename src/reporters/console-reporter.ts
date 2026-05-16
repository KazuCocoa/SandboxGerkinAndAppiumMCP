import type { ExecutionReport } from "../types.js";

export function printReport(report: ExecutionReport): void {
  console.log(`\nFeature: ${report.feature}`);
  console.log(`Source: ${report.sourcePath}`);

  for (const scenario of report.scenarios) {
    console.log(`\nScenario: ${scenario.name} [${scenario.status}]`);
    for (const step of scenario.steps) {
      const marker = step.status === "passed" ? "PASS" : step.status === "failed" ? "FAIL" : "SKIP";
      console.log(`  ${marker} ${step.text} (${step.durationMs}ms, ${step.callPath})`);
      if (step.error) {
        console.log(`    ${step.error}`);
      }
    }
  }

  console.log("\nTotals:");
  console.log(`  passed=${report.totals.passed}`);
  console.log(`  failed=${report.totals.failed}`);
  console.log(`  skipped=${report.totals.skipped}`);
  console.log(`  durationMs=${report.totals.durationMs}`);
}
