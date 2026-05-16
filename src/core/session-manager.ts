import { randomUUID } from "node:crypto";
import { MpcClient } from "./mcp-client.js";

export class SessionManager {
  constructor(private readonly mcp: MpcClient) {}

  async ensureSession(platform: "android" | "ios"): Promise<string> {
    const existing = this.mcp.getSessionId();
    if (existing) {
      return existing;
    }

    const response = await this.mcp.callTool("appium_session_management", {
      action: "create",
      platform
    });

    if (!response.success) {
      throw new Error(response.error ?? "Unable to create Appium session");
    }

    const candidate = asSessionId(response.data);
    const sessionId = candidate ?? `stub-${randomUUID()}`;
    this.mcp.setSessionId(sessionId);
    return sessionId;
  }

  async cleanupSession(): Promise<void> {
    const sessionId = this.mcp.getSessionId();
    if (!sessionId) {
      return;
    }

    await this.mcp.callTool("appium_session_management", {
      action: "delete",
      sessionId
    });

    this.mcp.setSessionId(undefined);
  }
}

function asSessionId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const session = (value as Record<string, unknown>).sessionId;
  return typeof session === "string" && session.length > 0 ? session : undefined;
}
