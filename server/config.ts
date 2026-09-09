import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

export interface ServerConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
  port: number;
}

export function loadConfig(): ServerConfig {
  return {
    endpoint: required("AZURE_OPENAI_ENDPOINT").replace(/\/$/, ""),
    apiKey: required("AZURE_OPENAI_API_KEY"),
    deployment: required("AZURE_OPENAI_DEPLOYMENT"),
    apiVersion: process.env.AZURE_OPENAI_API_VERSION?.trim() || "2024-10-21",
    port: Number(process.env.PORT || 3000),
  };
}
