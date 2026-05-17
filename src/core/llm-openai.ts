import type { LLMExecutor, LLMExecutorOptions, LLMExecutorResult } from "./llm-executor.js";
import type { MpcAdapter } from "./mcp-client.js";

/**
 * OpenAI implementation placeholder.
 * To be implemented when needed.
 */
export class LLMOpenAIExecutor implements LLMExecutor {
  constructor(_mcpAdapter?: MpcAdapter) {
    // Constructor accepts mcpAdapter for consistency with other executors
  }

  async executeStep(_step: string, _options: LLMExecutorOptions): Promise<LLMExecutorResult> {
    throw new Error("OpenAI executor not yet implemented");
  }

  async initialize(_options: LLMExecutorOptions): Promise<void> {
    throw new Error("OpenAI executor not yet implemented");
  }

  async cleanup(): Promise<void> {
    throw new Error("OpenAI executor not yet implemented");
  }
}
