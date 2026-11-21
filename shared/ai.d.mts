import type { Answer, Bridge } from "../src/types";
export function prepareQuestion(input: Parameters<Bridge["ask"]>[0]): {
  messages: { role: "system" | "user"; content: string }[];
  sources: Answer["sources"];
};
