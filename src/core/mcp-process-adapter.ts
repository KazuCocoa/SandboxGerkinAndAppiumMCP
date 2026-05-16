import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { MpcAdapter } from "./mcp-client.js";
import type { ToolResult } from "../types.js";

interface RpcPending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface RpcMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class MpcProcessAdapter implements MpcAdapter {
  private processRef: ChildProcessWithoutNullStreams | undefined;
  private ready = false;
  private nextId = 1;
  private readonly pending = new Map<number, RpcPending>();
  private stdoutBuffer = "";

  constructor(
    private readonly command: string,
    private readonly args: string[] = []
  ) {}

  async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    await this.ensureStarted();

    const response = await this.sendRequest("tools/call", {
      name: toolName,
      arguments: args
    });

    const resultObj = asRecord(response);
    const isError = Boolean(resultObj?.isError);
    if (isError) {
      return {
        success: false,
        error: extractErrorText(resultObj) ?? `MCP tool call failed: ${toolName}`,
        data: resultObj
      };
    }

    return {
      success: true,
      data: resultObj
    };
  }

  async close(): Promise<void> {
    for (const [id, pending] of this.pending.entries()) {
      pending.reject(new Error(`MCP process closed before response for request ${id}`));
    }
    this.pending.clear();

    const child = this.processRef;
    this.processRef = undefined;
    this.ready = false;

    if (!child) {
      return;
    }

    await new Promise<void>((resolve) => {
      if (child.killed) {
        resolve();
        return;
      }
      child.once("exit", () => resolve());
      child.kill();
      setTimeout(() => resolve(), 1000);
    });
  }

  private async ensureStarted(): Promise<void> {
    if (this.processRef && this.ready) {
      return;
    }

    if (!this.processRef) {
      this.processRef = spawn(this.command, this.args, {
        stdio: "pipe",
        env: process.env
      });
      this.processRef.stdout.setEncoding("utf8");
      this.processRef.stdout.on("data", (chunk: string) => this.onStdout(chunk));
      this.processRef.stderr.setEncoding("utf8");
      this.processRef.stderr.on("data", (_chunk: string) => {
        // stderr can include debug logs from MCP server; do not fail on logs.
      });
      this.processRef.on("exit", (code, signal) => this.onExit(code, signal));
      this.processRef.on("error", (error) => this.onSpawnError(error));
    }

    const initResult = await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "gherkin-mcp-prototype",
        version: "0.1.0"
      }
    });

    if (!initResult) {
      throw new Error("MCP initialize returned empty result");
    }

    await this.sendNotification("notifications/initialized", {});
    this.ready = true;
  }

  private onStdout(chunk: string): void {
    this.stdoutBuffer += chunk;

    let newline = this.stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line.length > 0) {
        this.consumeLine(line);
      }
      newline = this.stdoutBuffer.indexOf("\n");
    }
  }

  private consumeLine(line: string): void {
    let message: RpcMessage;
    try {
      message = JSON.parse(line) as RpcMessage;
    } catch {
      return;
    }

    if (typeof message.id !== "number") {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message));
      return;
    }

    pending.resolve(message.result);
  }

  private onExit(code: number | null, signal: NodeJS.Signals | null): void {
    const message = `MCP process exited (code=${String(code)}, signal=${String(signal)})`;
    for (const [, pending] of this.pending) {
      pending.reject(new Error(message));
    }
    this.pending.clear();
    this.processRef = undefined;
    this.ready = false;
  }

  private onSpawnError(error: Error): void {
    for (const [, pending] of this.pending) {
      pending.reject(error);
    }
    this.pending.clear();
    this.processRef = undefined;
    this.ready = false;
  }

  private async sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;

    const payload: RpcMessage = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    const child = this.processRef;
    if (!child) {
      throw new Error("MCP process is not running");
    }

    const resultPromise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    child.stdin.write(`${JSON.stringify(payload)}\n`);
    return resultPromise;
  }

  private async sendNotification(method: string, params: Record<string, unknown>): Promise<void> {
    const child = this.processRef;
    if (!child) {
      throw new Error("MCP process is not running");
    }

    const payload: RpcMessage = {
      jsonrpc: "2.0",
      method,
      params
    };

    child.stdin.write(`${JSON.stringify(payload)}\n`);
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function extractErrorText(result: Record<string, unknown> | undefined): string | undefined {
  if (!result) {
    return undefined;
  }

  const content = result.content;
  if (!Array.isArray(content)) {
    return undefined;
  }

  const textEntry = content.find((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    return (entry as Record<string, unknown>).type === "text";
  }) as Record<string, unknown> | undefined;

  const text = textEntry?.text;
  return typeof text === "string" ? text : undefined;
}
