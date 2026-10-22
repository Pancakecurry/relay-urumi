export type Effect = "allow" | "deny";

/** An explicit denial is a ceiling. Allows may open a default-deny workspace. */
export function toolDecision(
  defaultEffect: Effect,
  effects: readonly Effect[],
) {
  if (effects.includes("deny")) return false;
  return effects.includes("allow") || defaultEffect === "allow";
}
