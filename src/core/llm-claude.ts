import type { LLMExecutor, LLMExecutorOptions, LLMExecutorResult } from "./llm-executor.js";
import type { MpcAdapter } from "./mcp-client.js";
import { MpcProcessAdapter } from "./mcp-process-adapter.js";

interface AnthropicMessage {
  content: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  stop_reason: string;
}

interface AnthropicToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export class LLMClaudeExecutor implements LLMExecutor {
  private mcp: MpcAdapter | null = null;
  private sessionId: string | null = null;
  private logCollector: { write(...args: unknown[]): void } | null = null;
  private claudeApiKey: string;
  private claudeModel: string;

  constructor(mcpAdapter?: MpcAdapter) {
    this.mcp = mcpAdapter || null;
    const env = (process.env as Record<string, string | undefined>) || {};
    this.claudeApiKey = env.ANTHROPIC_API_KEY || "";
    this.claudeModel = env.CLAUDE_MODEL || "claude-3-5-sonnet-20241022";

    if (!this.claudeApiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }
  }

  async initialize(options: LLMExecutorOptions): Promise<void> {
    this.logCollector = options.logCollector || null;
    this.sessionId = (options.sessionId ?? null) as string | null;

    // Initialize MCP adapter if not already provided
    if (!this.mcp) {
      const adapter = options.mcpAdapter;
      if (adapter) {
        this.mcp = adapter;
      } else {
        this.mcp = new MpcProcessAdapter("npx", ["appium-mcp"]);
      }
    }

    if (this.logCollector) {
      this.logCollector.write("[LLM] Claude executor initialized", {
        model: this.claudeModel,
        sessionId: this.sessionId,
        deviceName: options.deviceName,
        platformVersion: options.platformVersion
      });
    }
  }

  async executeStep(step: string, options: LLMExecutorOptions): Promise<LLMExecutorResult> {
    if (!this.mcp) {
      await this.initialize(options);
    }

    this.sessionId = this.sessionId || (options.sessionId ?? null);
    this.logCollector = options.logCollector || this.logCollector;

    const toolCalls: Array<{ tool: string; args: Record<string, unknown>; result: unknown }> = [];

    const systemPrompt = `You are a test automation assistant that interprets Gherkin steps and controls an Android device via MCP tools.

Current Session:
- Session ID: ${this.sessionId || "not set"}
- Device: ${options.deviceName || "default"}
- Platform Version: ${options.platformVersion || "auto"}

Available MCP tools:
1. appium_app_lifecycle: Manage app lifecycle (launch, activate, background, terminate)
   - action: "activate" | "background" | "terminate"
   - id: app package name (optional)
   - name: app name (optional)
   - sessionId: required

2. appium_gesture: Perform touch gestures (tap, swipe, scroll)
   - action: "tap" | "swipe" | "scroll"
   - strategy: "xpath" | "accessibility id" | "id" (for tap/swipe)
   - selector: locator (for xpath/id strategies)
   - elementUUID: element UUID (for tap via UUID)
   - direction: "up" | "down" | "left" | "right" (for scroll)
   - sessionId: required

3. appium_find_element: Find elements on screen
   - strategy: "xpath" | "accessibility id" | "id"
   - selector: locator
   - sessionId: required

4. appium_set_value: Set value in field
   - strategy: "accessibility id" | "id" | "xpath"
   - selector: locator
   - value: text to enter
   - sessionId: required

5. appium_get_page_source: Get current page XML
   - sessionId: required

6. appium_screenshot: Take screenshot
   - name: screenshot name
   - sessionId: required

7. appium_execute_mobile_method: Execute Android methods
   - method: method name (e.g., "getCurrentPackage")
   - sessionId: required

Your task: Interpret the Gherkin step and decide which MCP tools to call. Use tool_use to invoke tools.

Gherkin Step: ${step}

Be concise. Call the necessary tools and report success or failure.`;

    const messages: Array<{ role: string; content: Array<unknown> }> = [
      {
        role: "user",
        content: [{ type: "text", text: systemPrompt }]
      }
    ];

    const tools = this.buildClaudeToolDefinitions();

    let iterationCount = 0;
    const maxIterations = 10;

    while (iterationCount < maxIterations) {
      iterationCount += 1;

      const response = await this.callClaude(messages, tools);

      if (this.logCollector) {
        this.logCollector.write("[LLM] Claude response", {
          iteration: iterationCount,
          stopReason: response.stop_reason,
          contentLength: response.content.length
        });
      }

      // Process response content
      let hasToolUse = false;
      for (const block of response.content) {
        if (block.type === "text" && block.text) {
          // LLM returned final text response
          return {
            success: true,
            output: block.text,
            toolCalls
          };
        }

        if (block.type === "tool_use") {
          hasToolUse = true;
          const toolUse = block as AnthropicToolUse;

          if (this.logCollector) {
            this.logCollector.write("[LLM] Tool call", {
              tool: toolUse.name,
              args: toolUse.input
            });
          }

          try {
            const result = await this.mcp!.callTool(toolUse.name, {
              ...toolUse.input,
              sessionId: this.sessionId || options.sessionId
            });

            toolCalls.push({
              tool: toolUse.name,
              args: toolUse.input as Record<string, unknown>,
              result: result.data
            });

            if (this.logCollector) {
              this.logCollector.write("[LLM] Tool result", {
                tool: toolUse.name,
                success: result.success,
                resultKeys: result.data ? Object.keys(result.data).slice(0, 5) : []
              });
            }

            // Add tool result back to messages
            messages.push({
              role: "assistant",
              content: [block]
            });

            messages.push({
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: toolUse.id,
                  content: JSON.stringify(result.data || { success: result.success })
                }
              ]
            });
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);

            if (this.logCollector) {
              this.logCollector.write("[LLM] Tool error", {
                tool: toolUse.name,
                error: errorMsg
              });
            }

            messages.push({
              role: "assistant",
              content: [block]
            });

            messages.push({
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: toolUse.id,
                  is_error: true,
                  content: errorMsg
                }
              ]
            });
          }
        }
      }

      // If no tool_use and no text, break
      if (!hasToolUse) {
        break;
      }
    }

    return {
      success: false,
      error: `LLM did not return a final response after ${maxIterations} iterations`,
      toolCalls
    };
  }

  async cleanup(): Promise<void> {
    if (this.mcp && this.mcp.close) {
      await this.mcp.close();
    }
    this.mcp = null;

    if (this.logCollector) {
      this.logCollector.write("[LLM] Cleanup complete");
    }
  }

  private buildClaudeToolDefinitions(): Array<Record<string, unknown>> {
    return [
      {
        name: "appium_app_lifecycle",
        description: "Manage app lifecycle (launch, activate, background, terminate)",
        input_schema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["activate", "background", "terminate"],
              description: "Action to perform"
            },
            id: {
              type: "string",
              description: "App package name (optional)"
            },
            name: {
              type: "string",
              description: "App name (optional)"
            },
            sessionId: {
              type: "string",
              description: "Session ID (required)"
            }
          },
          required: ["action", "sessionId"]
        }
      },
      {
        name: "appium_gesture",
        description: "Perform touch gestures (tap, swipe, scroll)",
        input_schema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["tap", "swipe", "scroll"],
              description: "Gesture type"
            },
            strategy: {
              type: "string",
              enum: ["xpath", "accessibility id", "id"],
              description: "Locator strategy"
            },
            selector: {
              type: "string",
              description: "Locator value"
            },
            elementUUID: {
              type: "string",
              description: "Element UUID (alternative to selector)"
            },
            direction: {
              type: "string",
              enum: ["up", "down", "left", "right"],
              description: "Scroll direction"
            },
            sessionId: {
              type: "string",
              description: "Session ID (required)"
            }
          },
          required: ["action", "sessionId"]
        }
      },
      {
        name: "appium_find_element",
        description: "Find elements on screen",
        input_schema: {
          type: "object",
          properties: {
            strategy: {
              type: "string",
              enum: ["xpath", "accessibility id", "id"],
              description: "Locator strategy"
            },
            selector: {
              type: "string",
              description: "Locator value"
            },
            sessionId: {
              type: "string",
              description: "Session ID (required)"
            }
          },
          required: ["strategy", "selector", "sessionId"]
        }
      },
      {
        name: "appium_set_value",
        description: "Set value in field",
        input_schema: {
          type: "object",
          properties: {
            strategy: {
              type: "string",
              enum: ["accessibility id", "id", "xpath"],
              description: "Locator strategy"
            },
            selector: {
              type: "string",
              description: "Locator value"
            },
            value: {
              type: "string",
              description: "Text to enter"
            },
            sessionId: {
              type: "string",
              description: "Session ID (required)"
            }
          },
          required: ["strategy", "selector", "value", "sessionId"]
        }
      },
      {
        name: "appium_get_page_source",
        description: "Get current page XML",
        input_schema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Session ID (required)"
            }
          },
          required: ["sessionId"]
        }
      },
      {
        name: "appium_screenshot",
        description: "Take screenshot",
        input_schema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Screenshot name"
            },
            sessionId: {
              type: "string",
              description: "Session ID (required)"
            }
          },
          required: ["name", "sessionId"]
        }
      },
      {
        name: "appium_execute_mobile_method",
        description: "Execute Android methods",
        input_schema: {
          type: "object",
          properties: {
            method: {
              type: "string",
              description: "Method name (e.g., getCurrentPackage)"
            },
            sessionId: {
              type: "string",
              description: "Session ID (required)"
            }
          },
          required: ["method", "sessionId"]
        }
      }
    ];
  }

  private async callClaude(
    messages: Array<{ role: string; content: Array<unknown> }>,
    tools: Array<Record<string, unknown>>
  ): Promise<AnthropicMessage> {
    // Use native fetch to call Anthropic API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": this.claudeApiKey
      },
      body: JSON.stringify({
        model: this.claudeModel,
        max_tokens: 4096,
        tools,
        messages
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as AnthropicMessage;
    return data;
  }
}
