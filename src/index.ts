#!/usr/bin/env node
import { Command } from "commander";
import { loadConfigFromEnv } from "./config/defaults.js";
import { Executor } from "./core/executor.js";
import { createMcpAdapter } from "./core/mcp-adapter-factory.js";
import { MpcClient } from "./core/mcp-client.js";
import { SessionManager } from "./core/session-manager.js";
import { createLLMExecutor } from "./core/llm-executor.js";
import { parseFeatureFile } from "./parser/gherkin-parser.js";
import { printReport } from "./reporters/console-reporter.js";
import { writeJsonReport } from "./reporters/json-reporter.js";
import { StepRegistry } from "./steps/step-registry.js";
import { androidCoreHandlers } from "./steps/handlers/android-core.js";

const program = new Command();

program.name("gherkin-mcp").description("Gherkin to appium-mcp prototype runner").version("0.1.0");

program
  .command("run")
  .requiredOption("--feature <path>", "Path to .feature file")
  .option("--dry-run", "Resolve steps but do not invoke appium-mcp", false)
  .option("--continue-on-failure", "Continue executing remaining steps after a failure", false)
  .option("--real-mcp", "Use a real appium-mcp process adapter", false)
  .option("--llm", "Use LLM to interpret and execute steps (default: true)", true)
  .option("--llm-provider <provider>", "LLM provider: claude, openai (default: claude)")
  .option("--report-json <path>", "Write JSON report to this path")
  .action(async (options) => {
    const config = loadConfigFromEnv();
    const feature = parseFeatureFile(options.feature);

    const registry = new StepRegistry();
    registry.registerMany(androidCoreHandlers());

    const adapter = createMcpAdapter(config, options.realMcp ? "real" : undefined);
    const mcp = new MpcClient(adapter);
    const sessions = new SessionManager(mcp);

    // Create LLM executor if enabled
    let llmExecutor = undefined;
    if (options.llm) {
      try {
        llmExecutor = await createLLMExecutor(options.llmProvider, mcp.getAdapter());
      } catch (error) {
        console.error("Failed to create LLM executor:", error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
        return;
      }
    }

    const executor = new Executor(registry, mcp, sessions, config.platform, llmExecutor);

    try {
      const report = await executor.runFeature(feature, {
        dryRun: options.dryRun,
        continueOnFailure: options.continueOnFailure
      });

      printReport(report);

      if (options.reportJson) {
        writeJsonReport(report, options.reportJson);
        console.log(`JSON report written to ${options.reportJson}`);
      }

      if (report.totals.failed > 0) {
        process.exitCode = 1;
      }
    } finally {
      await mcp.close();
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
