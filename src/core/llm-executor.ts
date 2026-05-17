/**
 * LLM Executor abstraction.
 * The LLM interprets Gherkin steps and orchestrates MCP tool calls.
 */

import type { MpcAdapter } from "./mcp-client.js";

export interface LLMExecutorOptions {
  sessionId?: string | undefined;
  deviceName?: string | undefined;
  platformVersion?: string | undefined;
  logCollector?: { write(...args: unknown[]): void } | undefined;
  mcpAdapter?: MpcAdapter | undefined;
}

export interface LLMExecutorResult {
  success: boolean;
  output?: string;
  error?: string;
  toolCalls?: Array<{ tool: string; args: Record<string, unknown>; result: unknown }>;
}

export interface LLMExecutor {
  /**
   * Execute a Gherkin step via LLM.
   * The LLM will interpret the step and call appropriate MCP tools.
   */
  executeStep(step: string, options: LLMExecutorOptions): Promise<LLMExecutorResult>;

  /**
   * Initialize the executor (e.g., create MCP session, warm up LLM client).
   */
  initialize(options: LLMExecutorOptions): Promise<void>;

  /**
   * Cleanup (e.g., close MCP session).
   */
  cleanup(): Promise<void>;
}

export async function createLLMExecutor(provider?: string, mcpAdapter?: MpcAdapter): Promise<LLMExecutor> {
  const p = provider || process.env.LLM_PROVIDER || "claude";

  if (p === "claude") {
    const { LLMClaudeExecutor } = await import("./llm-claude.js");
    return new LLMClaudeExecutor(mcpAdapter);
  }

  if (p === "openai") {
    const { LLMOpenAIExecutor } = await import("./llm-openai.js");
    return new LLMOpenAIExecutor(mcpAdapter);
  }

  if (p === "copilot" || p === "copilot-cli") {
    const { LLMCopilotCliExecutor } = await import("./llm-copilot-cli.js");
    return new LLMCopilotCliExecutor(mcpAdapter);
  }

  throw new Error(`Unknown LLM provider: ${p}`);
}
