import { spawn } from "child_process";
import type { LLMExecutor, LLMExecutorOptions, LLMExecutorResult } from "./llm-executor.js";
import type { MpcAdapter } from "./mcp-client.js";
import { MpcProcessAdapter } from "./mcp-process-adapter.js";

export class LLMCopilotCliExecutor implements LLMExecutor {
  private mcp: MpcAdapter | null = null;

  constructor(mcpAdapter?: MpcAdapter) {
    this.mcp = mcpAdapter || null;
  }

  async initialize(options: LLMExecutorOptions): Promise<void> {
    // Use provided adapter or create a new one
    if (!this.mcp) {
      const adapter = options.mcpAdapter;
      if (adapter) {
        this.mcp = adapter;
      } else {
        this.mcp = new MpcProcessAdapter("npx", ["appium-mcp"]);
      }
    }

    if (process.env.DEBUG_LLM_COPILOT === "1") {
      console.log("[copilot-cli] Initialized");
    }
  }

  async executeStep(step: string, options: LLMExecutorOptions): Promise<LLMExecutorResult> {
    if (!this.mcp) {
      throw new Error("LLMCopilotCliExecutor not initialized");
    }

    const sessionId = options.sessionId || "";

    const stepDescription = `
You are controlling a mobile app via Appium MCP tools.
For this Gherkin step, decide which MCP tool to call and what arguments to use.

Available tools and their usage:
- appium_app_lifecycle: Activate/launch/terminate apps
  Example: {"toolName": "appium_app_lifecycle", "args": {"action": "activate", "id": "com.android.settings", "name": "com.android.settings", "sessionId": "..."}}

- appium_gesture: Tap, swipe, scroll, long-press elements (action: "tap", "swipe", "scroll", "long_press")
  Example: {"toolName": "appium_gesture", "args": {"action": "tap", "strategy": "accessibility id", "selector": "element_id", "sessionId": "..."}}

- appium_find_element: Find elements by strategy (id, accessibility id, xpath, etc.)
  Example: {"toolName": "appium_find_element", "args": {"strategy": "accessibility id", "selector": "element_id", "sessionId": "..."}}

- appium_set_value: Set text value in input fields
  Example: {"toolName": "appium_set_value", "args": {"strategy": "accessibility id", "selector": "field_id", "value": "text", "sessionId": "..."}}

- appium_screenshot: Take a screenshot
  Example: {"toolName": "appium_screenshot", "args": {"sessionId": "..."}}

- appium_get_page_source: Get the XML page source
  Example: {"toolName": "appium_get_page_source", "args": {"sessionId": "..."}}

- appium_execute_mobile_method: Execute native mobile commands
  Example: {"toolName": "appium_execute_mobile_method", "args": {"method": "getCurrentPackage", "sessionId": "..."}}

- appium_session_management: Create/delete Appium sessions
  Example: {"toolName": "appium_session_management", "args": {"action": "create", "platform": "android"}}

Respond ONLY with valid JSON in this exact format:
{
  "toolName": "string",
  "args": { "key": "value", "sessionId": "${sessionId}" },
  "reasoning": "brief explanation"
}

If multiple calls are needed, respond with a JSON array.
If the step cannot be done, respond with: {"error": "reason"}

Gherkin Step: ${step}
`;

    const result = await this.callCopilotCli(stepDescription);

    // Check if result is an error response
    if (typeof result === "object" && result !== null && "error" in result && !Array.isArray(result)) {
      const errorObj = result as { error: string };
      return { success: false, error: errorObj.error };
    }

    // Parse the tool calls and execute them
    const toolCalls = Array.isArray(result) ? result : [result as Record<string, unknown>];
    let lastOutput = "";

    for (const call of toolCalls) {
      const callObj = call as Record<string, unknown>;
      if (!callObj.toolName || !callObj.args) {
        return { success: false, error: `Invalid tool call format: ${JSON.stringify(call)}` };
      }

      try {
        // Add sessionId if not present
        const args = { ...callObj.args, sessionId } as Record<string, unknown>;

        if (process.env.DEBUG_LLM_COPILOT === "1") {
          console.log(`[copilot-cli] Response from Copilot:\n${JSON.stringify(result, null, 2)}`); console.log(`[copilot-cli] Calling tool: ${callObj.toolName}`, args);
        }

        const toolResult = await this.mcp.callTool(String(callObj.toolName), args);

        if (!toolResult.success) {
          return { success: false, error: toolResult.error || "Tool call failed" };
        }

        lastOutput = this.formatToolOutput(toolResult.data);
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    return { success: true, output: lastOutput };
  }

  async cleanup(): Promise<void> {
    if (this.mcp && typeof this.mcp.close === "function") {
      await this.mcp.close();
    }
  }

  private async callCopilotCli(prompt: string): Promise<Record<string, unknown> | Record<string, unknown>[] | { error: string }> {
    return new Promise((resolve, reject) => {
      // Use copilot with non-interactive mode
      const proc = spawn("copilot", ["--prompt", prompt], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30000 // 30 second timeout
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          console.error("[copilot-cli] stderr:", stderr);
          resolve({ error: `Copilot CLI exited with code ${code}: ${stderr}` });
          return;
        }

        // Try to extract JSON from the response
        const jsonMatch = stdout.match(/\{[\s\S]*\}(?:\n\{[\s\S]*\})*/) || stdout.match(/\[[\s\S]*\]/);

        if (!jsonMatch) {
          console.error("[copilot-cli] No JSON found in response:", stdout);
          resolve({ error: "Copilot CLI did not return valid JSON" });
          return;
        }

        try {
          const result = JSON.parse(jsonMatch[0]);
          resolve(result);
        } catch (parseError) {
          console.error("[copilot-cli] Failed to parse JSON:", parseError);
          resolve({ error: `Failed to parse Copilot response: ${String(parseError)}` });
        }
      });

      proc.on("error", (error) => {
        reject(error);
      });
    });
  }

  private formatToolOutput(data: unknown): string {
    if (!data) {
      return "";
    }

    if (typeof data === "string") {
      return data;
    }

    if (typeof data === "object") {
      const obj = data as Record<string, unknown>;

      // Check for MCP response fields
      if (obj.output) {
        return String(obj.output);
      }

      if (obj.text) {
        return String(obj.text);
      }

      if (obj.pageSource) {
        return String(obj.pageSource);
      }

      // Fallback to JSON representation
      return JSON.stringify(obj).slice(0, 500);
    }

    return String(data);
  }
}
