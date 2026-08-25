import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const ANALYSIS_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
