import express from "express";
import { execSync, spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";

const app = express();
app.use(express.json({ limit: "50mb" }));

interface RenderJob {
  id: string;
  status: "rendering" | "completed" | "failed";
  outputPath: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

const jobs = new Map<string, RenderJob>();

app.post("/render", (req, res) => {
  const { replay, output_path } = req.body;

  if (!replay) {
    res.status(400).json({ error: "Missing replay data" });
    return;
  }

  const jobId = uuidv4();
  const outputPath = output_path || `videos/${jobId}.mp4`;
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const job: RenderJob = {
    id: jobId,
    status: "rendering",
    outputPath,
    startedAt: Date.now(),
  };
  jobs.set(jobId, job);

  // Write replay to temp file for Remotion input props
  const propsPath = `/tmp/replay-${jobId}.json`;
  fs.writeFileSync(propsPath, JSON.stringify({ replay }));

  // Spawn Remotion render in background
  const child = spawn(
    "npx",
    [
      "remotion",
      "render",
      "SlmArenaMatch",
      outputPath,
      "--props",
      propsPath,
    ],
    { cwd: path.resolve(__dirname, "../.."), stdio: "pipe" }
  );

  child.on("close", (code) => {
    // Clean up temp file
    try { fs.unlinkSync(propsPath); } catch {}

    if (code === 0) {
      job.status = "completed";
      job.completedAt = Date.now();
      console.log(`Render ${jobId} completed: ${outputPath}`);
    } else {
      job.status = "failed";
      job.error = `Remotion exited with code ${code}`;
      job.completedAt = Date.now();
      console.error(`Render ${jobId} failed with code ${code}`);
    }
  });

  child.stderr.on("data", (data: Buffer) => {
    console.error(`[render ${jobId}] ${data.toString()}`);
  });

  const estimatedDuration = replay.turns?.length
    ? Math.max(30, replay.turns.length * 10)
    : 120;

  res.json({
    status: "rendering",
    job_id: jobId,
    estimated_duration_seconds: estimatedDuration,
  });
});

app.get("/status/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const response: Record<string, unknown> = {
    status: job.status,
    output_path: job.outputPath,
  };

  if (job.completedAt) {
    response.duration_seconds = Math.round(
      (job.completedAt - job.startedAt) / 1000
    );
  }

  if (job.error) {
    response.error = job.error;
  }

  res.json(response);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SLM Arena Render Service running on port ${PORT}`);
});
