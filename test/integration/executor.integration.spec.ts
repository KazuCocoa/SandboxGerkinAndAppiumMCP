import { describe, expect, test } from "vitest";
import { parseFeatureFile } from "../../src/parser/gherkin-parser.js";
import { StepRegistry } from "../../src/steps/step-registry.js";
import { androidCoreHandlers } from "../../src/steps/handlers/android-core.js";
import { MpcClient, StubMcpAdapter } from "../../src/core/mcp-client.js";
import { SessionManager } from "../../src/core/session-manager.js";
import { Executor } from "../../src/core/executor.js";

describe("executor integration", () => {
  test("fails in non-dry-run when using stub adapter", async () => {
    const feature = parseFeatureFile("features/smoke/login.feature");
    const registry = new StepRegistry();
    registry.registerMany(androidCoreHandlers());

    const mcp = new MpcClient(new StubMcpAdapter());
    const sessions = new SessionManager(mcp);
    const executor = new Executor(registry, mcp, sessions, "android");

    await expect(
      executor.runFeature(feature, {
        allowFallback: true
      })
    ).rejects.toThrow("Stub adapter does not create real sessions");

    await mcp.close();
  });

  test("supports dry-run for deterministic registry", async () => {
    const feature = parseFeatureFile("features/smoke/login.feature");
    const registry = new StepRegistry();
    registry.registerMany(androidCoreHandlers());

    const mcp = new MpcClient(new StubMcpAdapter());
    const sessions = new SessionManager(mcp);
    const executor = new Executor(registry, mcp, sessions, "android");

    const report = await executor.runFeature(feature, {
      dryRun: true,
      allowFallback: true
    });

    await mcp.close();

    expect(report.totals.failed).toBe(0);
    expect(report.totals.passed).toBe(1);
  });
});
