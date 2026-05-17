import type { StepDefinition } from "../types.js";
import { StepRegistry } from "../steps/step-registry.js";
import type {
  ExecutionReport,
  ParsedFeature,
  RunOptions,
  ScenarioContext,
  ScenarioResult,
  StepResult
} from "../types.js";
import { MpcClient } from "./mcp-client.js";
import { SessionManager } from "./session-manager.js";
import type { LLMExecutor } from "./llm-executor.js";

export class Executor {
  constructor(
    private readonly registry: StepRegistry,
    private readonly mcp: MpcClient,
    private readonly sessions: SessionManager,
    private readonly platform: "android" | "ios",
    private readonly llmExecutor?: LLMExecutor
  ) {
    // Register LLM fallback handler if LLM executor is provided
    if (this.llmExecutor) {
      const executor = this.llmExecutor; // Capture for closure
      const mcp = this.mcp; // Capture for closure
      this.registry.setLlmFallback({
        description: "LLM-based step execution",
        pattern: /.*/,
        priority: 0,
        handler: async (ctx, _mcp, stepText) => {
          const result = await executor.executeStep(stepText, {
            sessionId: ctx.sessionId,
            logCollector: mcp.getLogCollector() as { write(...args: unknown[]): void } | undefined
          });
          if (!result.success) {
            throw new Error(result.error || "LLM step execution failed");
          }
        }
      });
    }
  }

  async runFeature(feature: ParsedFeature, options: RunOptions = {}): Promise<ExecutionReport> {
    const start = Date.now();
    const scenarios: ScenarioResult[] = [];

    // Initialize LLM if provided
    if (this.llmExecutor && !options.dryRun) {
      await this.llmExecutor.initialize({
        deviceName: process.env.APPIUM_DEVICE_NAME,
        platformVersion: process.env.APPIUM_PLATFORM_VERSION,
        logCollector: this.mcp.getLogCollector() as { write(...args: unknown[]): void } | undefined,
        mcpAdapter: this.mcp.getAdapter()
      });
    }

    try {
      for (const scenario of feature.scenarios) {
        const scenarioStart = Date.now();
        const stepResults: StepResult[] = [];
        const context: ScenarioContext = {
          featureName: feature.name,
          scenarioName: scenario.name,
          platform: this.platform,
          state: {},
          screenshots: []
        };

        let scenarioStatus: "passed" | "failed" = "passed";
        let scenarioError: string | undefined;

        try {
          if (!options.dryRun) {
            context.sessionId = await this.sessions.ensureSession(this.platform);
          }

          for (let index = 0; index < scenario.steps.length; index += 1) {
            const step = scenario.steps[index];
            if (!step) {
              continue;
            }
            const stepStart = Date.now();
            let status: StepResult["status"] = "passed";
            let error: string | undefined;
            let callPath: StepResult["callPath"] = "registry";

            try {
              const resolved = this.registry.resolve(step.text);
              if (!resolved) {
                throw new Error(`No step definition for: ${step.keyword} ${step.text}`);
              }
              if (!options.dryRun) {
                callPath = resolved.isLlmFallback ? "llm" : "registry";
                await resolved.definition.handler(context, this.mcp, ...resolved.args);
              }
            } catch (e) {
              status = "failed";
              scenarioStatus = "failed";
              error = e instanceof Error ? e.message : String(e);
              scenarioError = error;
            }

            const stepResult: StepResult = {
              text: `${step.keyword} ${step.text}`,
              status,
              durationMs: Date.now() - stepStart,
              callPath
            };
            if (error) {
              stepResult.error = error;
            }
            stepResults.push(stepResult);

            if (status === "failed") {
              if (!options.continueOnFailure) {
                markRemainingSkipped(scenario.steps.length, index + 1, scenario.steps, stepResults);
                break;
              }
            }
          }
        } finally {
          if (!options.dryRun) {
            await this.sessions.cleanupSession();
          }
        }

        const scenarioResult: ScenarioResult = {
          name: scenario.name,
          status: scenarioStatus,
          steps: stepResults,
          durationMs: Date.now() - scenarioStart
        };
        if (scenarioError) {
          scenarioResult.error = scenarioError;
        }
        scenarios.push(scenarioResult);
      }
    } finally {
      // Cleanup LLM if provided
      if (this.llmExecutor && !options.dryRun) {
        await this.llmExecutor.cleanup();
      }
    }

    return {
      feature: feature.name,
      sourcePath: feature.sourcePath,
      scenarios,
      totals: {
        passed: scenarios.filter((s) => s.status === "passed").length,
        failed: scenarios.filter((s) => s.status === "failed").length,
        skipped: scenarios
          .flatMap((s) => s.steps)
          .filter((step) => step.status === "skipped").length,
        durationMs: Date.now() - start
      }
    };
  }
}

function markRemainingSkipped(
  scenarioLength: number,
  startIndex: number,
  steps: ParsedFeature["scenarios"][number]["steps"],
  stepResults: StepResult[]
): void {
  for (let i = startIndex; i < scenarioLength; i += 1) {
    const step = steps[i];
    if (!step) {
      continue;
    }
    stepResults.push({
      text: `${step.keyword} ${step.text}`,
      status: "skipped",
      durationMs: 0,
      callPath: "registry"
    });
  }
}
