require("dotenv").config();
const express = require("express");
const cors = require("cors");
const gradeRouter = require("./routes/grade");

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ───────────────────────────────────────────────────────────────
const corsOptions = {
  origin: ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174", "http://localhost:5200", "http://127.0.0.1:5200"],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // handle preflight for all routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Request logger (dev only) ─────────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/api", gradeRouter);

// ── Backend status ────────────────────────────────────────────────────────────
app.get("/api/status", (_req, res) => {
  const usingMistral = !!process.env.MISTRAL_API_KEY;
  res.json({
    backend:   usingMistral ? "mistral" : "ollama",
    model:     usingMistral
      ? (process.env.MISTRAL_MODEL || "mistral-medium-latest")
      : (process.env.OLLAMA_MODEL  || "qwen2.5:14b"),
    ollamaUrl: usingMistral ? null : (process.env.OLLAMA_BASE_URL || "http://localhost:11434"),
  });
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/", (_req, res) => res.json({ status: "AI Grader API is running." }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`AI Grader server listening on http://localhost:${PORT}`);
});
