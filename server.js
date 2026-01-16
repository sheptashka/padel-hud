const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let state = {
  hudPosition: "tl", // tl,tr,bl,br
  mode: "classic",  // classic | custom
  maxPoints: 11,
  teamA: "TEAM A",
  teamB: "TEAM B",
  a1: 0, a2: 0, a3: 0,
  b1: 0, b2: 0, b3: 0
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
  });

  socket.on("reset", () => {
    state = { ...state, a1: 0, a2: 0, a3: 0, b1: 0, b2: 0, b3: 0 };
    broadcast();
  });
});

const PORT = process.env.PORT || 3333;
server.listen(PORT, () => console.log("Server started on port " + PORT));
