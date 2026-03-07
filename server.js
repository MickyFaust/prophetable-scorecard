const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "scorecard.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "prophet2026";

app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Ensure data directory and file exist
if (!fs.existsSync(path.join(__dirname, "data"))) {
  fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ days: [] }, null, 2));
}

// GET scorecard data (public)
app.get("/api/scorecard", (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to read scorecard data" });
  }
});

// POST update scorecard data (admin - password protected)
app.post("/api/scorecard", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const data = req.body;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save scorecard data" });
  }
});

// POST verify admin password
app.post("/api/auth", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Invalid password" });
  }
});

// Catch-all: serve index.html for SPA routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Prophetable Scorecard running on port ${PORT}`);
});
