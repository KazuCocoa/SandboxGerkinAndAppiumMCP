import { Writable } from "node:stream";
import { format } from "node:util";
import { mkdirSync, createWriteStream, existsSync } from "node:fs";
import { join } from "node:path";

export class MCPLogCollector {
  private logStream: Writable | null = null;
  private logPath: string;

  constructor(sessionId?: string) {
    const logDir = join(process.cwd(), "mcp-logs");
    if (!existsSync(logDir)) {
      mkdirSync(logDir);
    }
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    this.logPath = join(logDir, `mcp-server${sessionId ? `-${sessionId}` : ""}-${ts}.log`);
    this.logStream = createWriteStream(this.logPath, { flags: "a" });
  }

  write(...args: unknown[]) {
    if (this.logStream) {
      this.logStream.write(format(...args) + "\n");
    }
  }

  close() {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }

  getLogPath() {
    return this.logPath;
  }
}
