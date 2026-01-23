const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DEFAULT_MATCHES = [
  { id: 1, a: "A1+A2", b: "B1+B2", score: "", winner: "" },
  { id: 2, a: "A1+A2", b: "B1+B3", score: "", winner: "" },
  { id: 3, a: "A1+A2", b: "B2+B3", score: "", winner: "" },
  { id: 4, a: "A1+A3", b: "B1+B2", score: "", winner: "" },
  { id: 5, a: "A1+A3", b: "B1+B3", score: "", winner: "" },
  { id: 6, a: "A1+A3", b: "B2+B3", score: "", winner: "" },
  { id: 7, a: "A2+A3", b: "B1+B2", score: "", winner: "" },
  { id: 8, a: "A2+A3", b: "B1+B3", score: "", winner: "" },
  { id: 9, a: "A2+A3", b: "B2+B3", score: "", winner: "" },
];


app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let state = {
  hudPosition: "tl", // tl,tr,bl,br
  mode: "classic",  // classic | custom
  maxPoints: 11,
  teamA: "TEAM A",
  teamB: "TEAM B",
  a1: 0, a2: 0, a3: 0,
  b1: 0, b2: 0, b3: 0,
  matches: DEFAULT_MATCHES,

};

function broadcast() {
  io.emit("state", state);
}

app.get("/", (req, res) => {
  res.send("Padel HUD server is running");
});

app.get("/health", (req, res) => res.json({ ok: true }));

io.on("connection", (socket) => {
  socket.emit("state", state);

  socket.on("setState", (patch) => {
    if (patch && typeof patch === "object") {
      state = { ...state, ...patch };
      broadcast();
    }
socket.on("setMatches", (matches) => {
  if (!Array.isArray(matches)) return;

  // лёгкая нормализация
  state.matches = matches.slice(0, 100).map((m, i) => ({
    id: m.id ?? (i + 1),
    a: String(m.a ?? "").trim(),
    b: String(m.b ?? "").trim(),
    score: String(m.score ?? "").trim(),
    winner: (m.winner === "A" || m.winner === "B") ? m.winner : "",
  }));

  io.emit("state", state);
});

  });

  socket.on("reset", () => {
    state = { ...state, a1: 0, a2: 0, a3: 0, b1: 0, b2: 0, b3: 0 };
    broadcast();
  });
});



const PORT = process.env.PORT || 3333;
server.listen(PORT, () => console.log("Server started on port " + PORT));
