const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Единое состояние (пока в памяти)
let state = {
  hudPosition: "tl", // tl,tr,bl,br
  mode: "classic",  // classic | custom
  maxPoints: 11,    // для custom
  teamA: "TEAM A",
  teamB: "TEAM B",
  // 3 цифры справа (пока просто как "сеты/геймы/очки" или "очки/очки/очки" — потом настроим)
  a1: 0, a2: 0, a3: 0,
  b1: 0, b2: 0, b3: 0
};

function broadcast() {
  io.emit("state", state);
}

app.get("/health", (req, res) => res.json({ ok: true }));

io.on("connection", (socket) => {
  socket.emit("state", state);

  socket.on("setState", (patch) => {
    if (patch && typeof patch === "object") {
      state = { ...state, ...patch };
