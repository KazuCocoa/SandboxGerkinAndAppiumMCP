import { describe, expect, test } from "vitest";
import { loadConfigFromEnv } from "../../src/config/defaults.js";
import { createMcpAdapter } from "../../src/core/mcp-adapter-factory.js";
import { MpcClient } from "../../src/core/mcp-client.js";
import { Executor } from "../../src/core/executor.js";
import { SessionManager } from "../../src/core/session-manager.js";
import { parseFeatureFile } from "../../src/parser/gherkin-parser.js";
import { androidCoreHandlers } from "../../src/steps/handlers/android-core.js";
import { StepRegistry } from "../../src/steps/step-registry.js";
import type { ExecutionReport } from "../../src/types.js";

const runSmoke = process.env.RUN_ANDROID_SMOKE === "1";
const smokeFeaturePath = process.env.SMOKE_FEATURE_PATH ?? "features/smoke/login.feature";

describe("android smoke (real appium-mcp)", () => {
  const smokeTest = runSmoke ? test : test.skip;

  smokeTest("executes login smoke feature against real adapter", async () => {
    const config = loadConfigFromEnv();
    const registry = new StepRegistry();
    registry.registerMany(androidCoreHandlers());

    const mcp = new MpcClient(createMcpAdapter(config, "real"), 30_000, 1);
    const sessions = new SessionManager(mcp);
    const executor = new Executor(registry, mcp, sessions, "android");

    try {
      const report = await executor.runFeature(parseFeatureFile(smokeFeaturePath), {
        allowFallback: true
      });
      if (report.totals.failed > 0) {
        throw new Error(formatFailureReport(report));
      }
      expect(report.totals.failed).toBe(0);
    } finally {
      await mcp.close();
    }
  }, 120_000);
});

function formatFailureReport(report: ExecutionReport): string {
  const lines: string[] = [
    `Smoke feature failed: ${report.sourcePath}`
  ];

  for (const scenario of report.scenarios) {
    if (scenario.status !== "failed") {
      continue;
    }

    lines.push(`Scenario: ${scenario.name}`);

    for (const step of scenario.steps) {
      if (step.status !== "failed") {
        continue;
      }
      const detail = step.error ? ` (${step.error})` : "";
      lines.push(`- ${step.text}${detail}`);
    }
  }

  return lines.join("\n");
}
