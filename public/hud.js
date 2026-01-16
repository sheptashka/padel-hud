const socket = io();
const $ = (id) => document.getElementById(id);

const hud = $("hud");
const meta = $("meta");

function setPos(pos) {
  hud.classList.remove("pos-tl", "pos-tr", "pos-bl", "pos-br");
  hud.classList.add(`pos-${pos || "tl"}`);
}

function setBg(bg) {
  hud.classList.remove(
    "bg-transparent",
    "bg-black",
    "bg-white",
    "bg-chroma-green",
    "bg-chroma-purple",
    "bg-blue",
    "bg-red",
    "bg-yellow"
  );

  const map = {
    transparent: "bg-transparent",
    black: "bg-black",
    white: "bg-white",
    chroma_green: "bg-chroma-green",
    chroma_purple: "bg-chroma-purple",
    blue: "bg-blue",
    red: "bg-red",
    yellow: "bg-yellow",
  };

  hud.classList.add(map[bg] || "bg-transparent");
}

function updateMetaTournament(s) {
  if ((s.mode ?? "tournament") !== "tournament") {
    meta.style.display = "none";
    meta.textContent = "";
    return;
  }

  const N = Number(s.maxPoints ?? 11);
  const a = Number(s.a3 ?? 0);
  const b = Number(s.b3 ?? 0);

  let left = N - (a + b);
  if (!Number.isFinite(left)) left = 0;
  if (left < 0) left = 0;

  if (left === 1) {
    meta.textContent = "финальный розыгрыш";
  } else {
    meta.textContent = `осталось розыгрышей: ${left}`;
  }

  meta.style.display = "inline-flex";
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
  setBg(s.hudBg);

  updateMetaTournament(s);
});
