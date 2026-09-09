import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CoachAnswerRequest, CoachPlanRequest } from "../src/coach/models.ts";
import { loadConfig } from "./config.ts";
import { answer, planContext } from "./orchestrator.ts";
import { explainBodyAge } from "./bodyAge.ts";

const config = loadConfig();
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => response.json({ ok: true }));
app.post("/api/coach/plan", async (request, response) => {
  try { response.json(await planContext(config, request.body as CoachPlanRequest)); }
  catch (error) { console.error(error); response.status(502).json({ error: error instanceof Error ? error.message : "Planning failed." }); }
});
app.post("/api/coach/answer", async (request, response) => {
  try { response.json(await answer(config, request.body as CoachAnswerRequest)); }
  catch (error) { console.error(error); response.status(502).json({ error: error instanceof Error ? error.message : "Coaching failed." }); }
});
app.post("/api/overall/body-age", async (request, response) => {
  try { response.json(await explainBodyAge(config, request.body)); }
  catch (error) { console.error(error); response.status(502).json({ error: error instanceof Error ? error.message : "Body age explanation failed." }); }
});

const directory = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(directory, "../dist");
app.use(express.static(dist));
app.use((_request, response) => response.sendFile(path.join(dist, "index.html")));
app.listen(config.port, () => console.log(`Health Coach listening on http://localhost:${config.port}`));
