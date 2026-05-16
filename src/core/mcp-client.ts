import { DEFAULT_RETRY_COUNT, DEFAULT_TIMEOUT_MS } from "../config/defaults.js";
import type { ToolResult } from "../types.js";

export interface MpcAdapter {
  callTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
  close?: () => Promise<void>;
}

export class StubMcpAdapter implements MpcAdapter {
  async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (toolName === "appium_session_management" && args.action === "create") {
      return {
        success: false,
        error: "Stub adapter does not create real sessions. Use --dry-run or APPIUM_MCP_MODE=real."
      };
    }

    return {
      success: true,
      data: {
        toolName,
        args,
        stub: true
      }
    };
  }
}

export class MpcClient {
  private sessionId: string | undefined;

  constructor(
    private readonly adapter: MpcAdapter,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
    private readonly retryCount = DEFAULT_RETRY_COUNT
  ) {}

  getSessionId(): string | undefined {
    return this.sessionId;
  }

  setSessionId(sessionId: string | undefined): void {
    this.sessionId = sessionId;
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
      try {
        const result = await withTimeout(
          this.adapter.callTool(toolName, args),
          this.timeoutMs,
          `${toolName} timed out after ${this.timeoutMs}ms`
        );
        if (!result.success) {
          throw new Error(result.error ?? `Tool call failed: ${toolName}`);
        }
        return result;
      } catch (error) {
        lastError = error;
        if (attempt < this.retryCount) {
          await sleep(200 * (attempt + 1));
        }
      }
    }

    return {
      success: false,
      error: lastError instanceof Error ? lastError.message : String(lastError)
    };
  }

  async close(): Promise<void> {
    if (this.adapter.close) {
      await this.adapter.close();
    }
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
