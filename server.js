const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

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
  matches: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, a: "", b: "", score: "" })),
};

let state = { ...DEFAULT_STATE };

io.on("connection", (socket) => {
  socket.emit("state", state);

  socket.on("getState", () => {
    socket.emit("state", state);
  });

  socket.on("setState", (patch) => {
    if (patch && typeof patch === "object") {
      // мягкий merge
      state = {
        ...state,
        ...patch,
      };

      // нормализация составов
      if (!Array.isArray(state.teamAPlayers)) state.teamAPlayers = ["", "", ""];
      if (!Array.isArray(state.teamBPlayers)) state.teamBPlayers = ["", "", ""];

      // нормализация matches
      if (!Array.isArray(state.matches)) state.matches = DEFAULT_STATE.matches;

      io.emit("state", state);
    }
  });

  socket.on("reset", () => {
    // сбрасываем только счёт HUD, но не имена/составы/матчи
    state = {
      ...state,
      a3: 0,
      b3: 0,
    };
    io.emit("state", state);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("Server started on port", PORT));
