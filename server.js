const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const EMPTY_MATCHES = () =>
  Array.from({ length: 9 }, (_, i) => ({ id: i + 1, a: "", b: "", score: "" }));

const DEFAULT_STATE = {
  mode: "tournament",
  teamA: "Команда A",
  teamB: "Команда B",
  teamAPlayers: ["", "", ""],
  teamBPlayers: ["", "", ""],
  maxPoints: 11,
  hudPosition: "tl",
  hudBg: "transparent",
  a3: 0,
  b3: 0,
  hudVisible: true,
  firstServer: "", // "A" | "B" | ""
  matches: EMPTY_MATCHES(),
  updatedAt: Date.now(),
};

let state = { ...DEFAULT_STATE };

function isObj(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

function clampInt(n, min, max) {
  n = Number(n);
  if (!Number.isFinite(n)) n = min;
  n = Math.floor(n);
  return Math.max(min, Math.min(max, n));
}

function sanitizePlayers(arr) {
  const base = Array.isArray(arr) ? arr : ["", "", ""];
  const out = [base[0], base[1], base[2]].map((v) => String(v ?? "").trim());
  while (out.length < 3) out.push("");
  return out.slice(0, 3);
}

function sanitizeMatches(arr) {
  const base = Array.isArray(arr) ? arr : EMPTY_MATCHES();
  const out = base.slice(0, 9).map((m, i) => ({
    id: i + 1,
    a: String(m?.a ?? "").trim(),
    b: String(m?.b ?? "").trim(),
    score: String(m?.score ?? "").trim(),
  }));
  while (out.length < 9) {
    out.push({ id: out.length + 1, a: "", b: "", score: "" });
  }
  return out.map((m, i) => ({ ...m, id: i + 1 }));
}

function sanitizeFirstServer(value) {
  return value === "A" || value === "B" ? value : "";
}

function sanitizePatch(patch) {
  const p = {};

  if (typeof patch.mode === "string") p.mode = patch.mode;
  if (patch.teamA !== undefined) p.teamA = String(patch.teamA ?? "").trim();
  if (patch.teamB !== undefined) p.teamB = String(patch.teamB ?? "").trim();
  if (patch.maxPoints !== undefined) p.maxPoints = clampInt(patch.maxPoints, 1, 9999);

  if (typeof patch.hudPosition === "string") p.hudPosition = patch.hudPosition;
  if (typeof patch.hudBg === "string") p.hudBg = patch.hudBg;

  if (patch.a3 !== undefined) p.a3 = clampInt(patch.a3, 0, 9999);
  if (patch.b3 !== undefined) p.b3 = clampInt(patch.b3, 0, 9999);

  if (patch.hudVisible !== undefined) p.hudVisible = !!patch.hudVisible;
  if (patch.firstServer !== undefined) p.firstServer = sanitizeFirstServer(patch.firstServer);

  if (patch.teamAPlayers !== undefined) p.teamAPlayers = sanitizePlayers(patch.teamAPlayers);
  if (patch.teamBPlayers !== undefined) p.teamBPlayers = sanitizePlayers(patch.teamBPlayers);
  if (patch.matches !== undefined) p.matches = sanitizeMatches(patch.matches);

  const ua = Number(patch.updatedAt);
  if (Number.isFinite(ua) && ua > 0) p.updatedAt = ua;

  return p;
}

io.on("connection", (socket) => {
  socket.emit("state", state);

  socket.on("getState", () => {
    socket.emit("state", state);
  });

  socket.on("setState", (patch) => {
    if (!isObj(patch)) return;

    const clean = sanitizePatch(patch);

    const incomingUpdatedAt = Number(clean.updatedAt || 0);
    const currentUpdatedAt = Number(state.updatedAt || 0);
    const effectiveUpdatedAt = incomingUpdatedAt || Date.now();

    if (incomingUpdatedAt && currentUpdatedAt && incomingUpdatedAt < currentUpdatedAt) {
      socket.emit("state", state);
      return;
    }

    state = {
      ...state,
      ...clean,
      updatedAt: effectiveUpdatedAt,
    };

    state.teamAPlayers = sanitizePlayers(state.teamAPlayers);
    state.teamBPlayers = sanitizePlayers(state.teamBPlayers);
    state.matches = sanitizeMatches(state.matches);
    state.firstServer = sanitizeFirstServer(state.firstServer);

    io.emit("state", state);
  });

  socket.on("reset", () => {
    state = {
      ...state,
      a3: 0,
      b3: 0,
      updatedAt: Date.now(),
    };
    io.emit("state", state);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("Server started on port", PORT));