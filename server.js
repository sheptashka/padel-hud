const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.send("Padel HUD server is running");
});

io.on("connection", (socket) => {
  console.log("Client connected");
});

const PORT = process.env.PORT || 3333;
server.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});
