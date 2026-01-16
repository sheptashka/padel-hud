const socket = io();
const $ = (id) => document.getElementById(id);

const hud = $("hud");

function setPos(pos) {
  hud.classList.remove("pos-tl", "pos-tr", "pos-bl", "pos-br");
  hud.classList.add(`pos-${pos || "tl"}`);
}

socket.on("state", (s) => {
  $("teamA").textContent = s.teamA ?? "TEAM A";
  $("teamB").textContent = s.teamB ?? "TEAM B";

  $("a1").textContent = String(s.a1 ?? 0);
  $("a2").textContent = String(s.a2 ?? 0);
  $("a3").textContent = String(s.a3 ?? 0);

  $("b1").textContent = String(s.b1 ?? 0);
  $("b2").textContent = String(s.b2 ?? 0);
  $("b3").textContent = String(s.b3 ?? 0);

  setPos(s.hudPosition);
});
