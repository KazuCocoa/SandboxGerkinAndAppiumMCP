import type { CanonicalAction } from "../schema/action-schema.js";
import { extractTextFromMcpData } from "./mcp-result-utils.js";
import { inferFallbackAction } from "../steps/fallback/nlp-adapter.js";
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

export class Executor {
  constructor(
    private readonly registry: StepRegistry,
    private readonly mcp: MpcClient,
    private readonly sessions: SessionManager,
    private readonly platform: "android" | "ios"
  ) {}

  async runFeature(feature: ParsedFeature, options: RunOptions = {}): Promise<ExecutionReport> {
    const start = Date.now();
    const scenarios: ScenarioResult[] = [];

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
            if (resolved) {
              if (!options.dryRun) {
                await resolved.definition.handler(context, this.mcp, ...resolved.args);
              }
            } else {
              const fallbackAllowed = options.allowFallback && step.keyword !== "Then";
              const action = fallbackAllowed ? inferFallbackAction(step) : undefined;
              if (!action) {
                throw new Error(`No step definition for: ${step.keyword} ${step.text}`);
              }
              callPath = "fallback";
              if (!options.dryRun) {
                await this.executeFallbackAction(context, action);
              }
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

  private async executeFallbackAction(context: ScenarioContext, action: CanonicalAction): Promise<void> {
    if (action.type === "tap") {
      await this.mcp.callTool("appium_gesture", {
        action: "tap",
        strategy: action.strategy,
        selector: action.locator,
        sessionId: context.sessionId
      });
      return;
    }

    if (action.type === "type") {
      await this.mcp.callTool("appium_set_value", {
        strategy: action.strategy,
        selector: action.locator,
        value: action.text,
        sessionId: context.sessionId
      });
      return;
    }

    if (action.type === "assertTextVisible") {
      const response = await this.mcp.callTool("appium_get_page_source", {
        sessionId: context.sessionId
      });
      const source = extractTextFromMcpData(response.data);
      if (!source.includes(action.text)) {
        throw new Error(`Expected text not visible: ${action.text}`);
      }
      return;
    }

    if (action.type === "wait") {
      await new Promise((resolve) => setTimeout(resolve, action.seconds * 1000));
      return;
    }

    await this.mcp.callTool("appium_screenshot", {
      name: action.name,
      sessionId: context.sessionId
    });
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
