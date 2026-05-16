import { describe, expect, test } from "vitest";
import { loadConfigFromEnv } from "../../src/config/defaults.js";
import { createMcpAdapter } from "../../src/core/mcp-adapter-factory.js";
import { MpcClient } from "../../src/core/mcp-client.js";
import { Executor } from "../../src/core/executor.js";
import { SessionManager } from "../../src/core/session-manager.js";
import { parseFeatureFile } from "../../src/parser/gherkin-parser.js";
import { androidCoreHandlers } from "../../src/steps/handlers/android-core.js";
import { StepRegistry } from "../../src/steps/step-registry.js";

const runSmoke = process.env.RUN_ANDROID_SMOKE === "1";

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
      const report = await executor.runFeature(parseFeatureFile("features/smoke/login.feature"), {
        allowFallback: true
      });
      expect(report.totals.failed).toBe(0);
    } finally {
      await mcp.close();
    }
  }, 120_000);
});
