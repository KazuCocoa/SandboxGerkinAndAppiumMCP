export type CanonicalAction =
  | { type: "tap"; locator: string; strategy: "accessibility id" | "id" }
  | { type: "type"; locator: string; text: string; strategy: "accessibility id" | "id" }
  | { type: "assertTextVisible"; text: string }
  | { type: "wait"; seconds: number }
  | { type: "screenshot"; name: string };

const ACTION_TYPES = new Set([
  "tap",
  "type",
  "assertTextVisible",
  "wait",
  "screenshot"
]);

export function isCanonicalAction(input: unknown): input is CanonicalAction {
  if (!input || typeof input !== "object") {
    return false;
  }

  const action = input as Record<string, unknown>;
  const type = action.type;
  if (typeof type !== "string" || !ACTION_TYPES.has(type)) {
    return false;
  }

  if (type === "tap") {
    return isString(action.locator) && isLocatorStrategy(action.strategy);
  }
  if (type === "type") {
    return isString(action.locator) && isString(action.text) && isLocatorStrategy(action.strategy);
  }
  if (type === "assertTextVisible") {
    return isString(action.text);
  }
  if (type === "wait") {
    return typeof action.seconds === "number" && action.seconds >= 0;
  }
  if (type === "screenshot") {
    return isString(action.name);
  }

  return false;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isLocatorStrategy(value: unknown): value is "accessibility id" | "id" {
  return value === "accessibility id" || value === "id";
}
