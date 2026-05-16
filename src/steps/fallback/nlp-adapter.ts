import type { ParsedStep } from "../../types.js";
import { isCanonicalAction, type CanonicalAction } from "../../schema/action-schema.js";

export function inferFallbackAction(step: ParsedStep): CanonicalAction | undefined {
  const text = step.text.trim();

  let action: unknown;

  const tapMatch = /^I tap "([^"]+)"$/i.exec(text);
  if (tapMatch) {
    action = {
      type: "tap",
      locator: tapMatch[1],
      strategy: "accessibility id"
    };
  }

  const typeMatch = /^I type "([^"]+)" into "([^"]+)"$/i.exec(text);
  if (typeMatch) {
    action = {
      type: "type",
      text: typeMatch[1],
      locator: typeMatch[2],
      strategy: "accessibility id"
    };
  }

  const assertMatch = /^I should see text "([^"]+)"$/i.exec(text);
  if (assertMatch) {
    action = {
      type: "assertTextVisible",
      text: assertMatch[1]
    };
  }

  const waitMatch = /^I wait (\d+) seconds?$/i.exec(text);
  if (waitMatch) {
    action = {
      type: "wait",
      seconds: Number(waitMatch[1])
    };
  }

  if (isCanonicalAction(action)) {
    return action;
  }

  return undefined;
}
