import OpenAI from "openai";
import { getConfig } from "@/lib/config";

export async function getOpenAIClient(): Promise<OpenAI> {
  const apiKey = await getConfig("openai_api_key");
  if (!apiKey) {
    throw new Error("Missing OpenAI API Key. Vào Settings → Config để thêm.");
  }
  return new OpenAI({ apiKey });
}

export async function getOpenAIModel(): Promise<string> {
  return (await getConfig("openai_model")) || "gpt-5.5";
}

export async function isOpenAIConfigured(): Promise<boolean> {
  return Boolean(await getConfig("openai_api_key"));
}
