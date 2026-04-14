const socket = io();
const $ = (id) => document.getElementById(id);

const hud = $("hud");
const meta = $("meta");
const totalScoreEl = $("totalScore");
const serveAEl = $("serveA");
const serveBEl = $("serveB");

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

  if (left === 1) {
    meta.textContent = "финальный розыгрыш";
    meta.style.display = "inline-flex";
    return;
  }

  if (left <= 0) {
    const nameA = (s.teamA ?? "TEAM A").trim() || "TEAM A";
    const nameB = (s.teamB ?? "TEAM B").trim() || "TEAM B";

    if (a > b) meta.textContent = `победила команда — ${nameA}`;
    else if (b > a) meta.textContent = `победила команда — ${nameB}`;
    else meta.textContent = "ничья";

    meta.style.display = "inline-flex";
    return;
  }

  meta.textContent = `осталось розыгрышей: ${left}`;
  meta.style.display = "inline-flex";
}

function calculateTotalScore(s) {
  let totalA = 0;
  let totalB = 0;

  if (!Array.isArray(s.matches)) {
    return { totalA, totalB };
  }

  s.matches.forEach((m) => {
    const score = String(m?.score ?? "").trim();
    if (!score || !score.includes(":")) return;

    const [left, right] = score.split(":");
    const a = parseInt(left, 10);
    const b = parseInt(right, 10);

    if (Number.isFinite(a)) totalA += a;
    if (Number.isFinite(b)) totalB += b;
  });

  return { totalA, totalB };
}

function updateTotalScore(s) {
  const { totalA, totalB } = calculateTotalScore(s);
  const nameA = (s.teamA ?? "TEAM A").trim() || "TEAM A";
  const nameB = (s.teamB ?? "TEAM B").trim() || "TEAM B";

  totalScoreEl.textContent = `общий счет: ${nameA} ${totalA} : ${totalB} ${nameB}`;
  totalScoreEl.style.display = "inline-flex";
}

function getCurrentServer(s) {
  const firstServer = s.firstServer === "A" || s.firstServer === "B" ? s.firstServer : "";
  if (!firstServer) return "";

  const a = Number(s.a3 ?? 0);
  const b = Number(s.b3 ?? 0);
  const totalPoints = Math.max(0, a + b);
  const serveBlock = Math.floor(totalPoints / 2);

  if (firstServer === "A") {
    return serveBlock % 2 === 0 ? "A" : "B";
  }

  return serveBlock % 2 === 0 ? "B" : "A";
}

function updateServeIndicator(s) {
  const currentServer = getCurrentServer(s);

  serveAEl.classList.toggle("show", currentServer === "A");
  serveBEl.classList.toggle("show", currentServer === "B");
}

socket.on("state", (s) => {
  hud.style.display = (s.hudVisible ?? true) ? "flex" : "none";
  if (!(s.hudVisible ?? true)) return;

  $("teamA").textContent = s.teamA ?? "TEAM A";
  $("teamB").textContent = s.teamB ?? "TEAM B";

  $("a3").textContent = String(s.a3 ?? 0);
  $("b3").textContent = String(s.b3 ?? 0);

  setPos(s.hudPosition);
  setBg(s.hudBg);
  updateMetaTournament(s);
  updateTotalScore(s);
  updateServeIndicator(s);
});