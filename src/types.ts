export type StepKeyword = "Given" | "When" | "Then" | "And" | "But";

export interface ParsedStep {
  keyword: StepKeyword;
  text: string;
  dataTable?: Array<Record<string, string>>;
  docString?: string;
}

export interface ParsedScenario {
  name: string;
  tags: string[];
  steps: ParsedStep[];
}

export interface ParsedFeature {
  name: string;
  tags: string[];
  scenarios: ParsedScenario[];
  sourcePath: string;
}

export interface ScenarioContext {
  featureName: string;
  scenarioName: string;
  platform: "android" | "ios";
  sessionId?: string;
  state: Record<string, unknown>;
  screenshots: Array<{ name: string; path: string }>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface MpcCallRecord {
  tool: string;
  args: Record<string, unknown>;
}

export interface StepResult {
  text: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  error?: string;
  callPath: "registry" | "fallback" | "llm";
}

export interface ScenarioResult {
  name: string;
  status: "passed" | "failed";
  steps: StepResult[];
  durationMs: number;
  error?: string;
}

export interface ExecutionReport {
  feature: string;
  sourcePath: string;
  scenarios: ScenarioResult[];
  totals: {
    passed: number;
    failed: number;
    skipped: number;
    durationMs: number;
  };
}

export interface RunOptions {
  dryRun?: boolean;
  continueOnFailure?: boolean;
}

export type StepHandler = (
  context: ScenarioContext,
  mcp: {
    callTool: (toolName: string, args: Record<string, unknown>) => Promise<ToolResult>;
  },
  ...args: string[]
) => Promise<void>;

export interface StepDefinition {
  pattern: RegExp;
  handler: StepHandler;
  description: string;
  priority?: number;
}
