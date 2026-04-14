const socket = io();
const $ = (id) => document.getElementById(id);

const hud = $("hud");
const meta = $("meta");
const totalScoreEl = $("totalScore");

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

/**
 * 🔥 Новый расчет общего счета
 */
function calculateTotalScore(s) {
  let totalA = 0;
  let totalB = 0;

  if (!Array.isArray(s.matches)) return { totalA, totalB };

  s.matches.forEach((m) => {
    if (!m.score) return;

    const parts = m.score.split(":");
    if (parts.length !== 2) return;

    const a = parseInt(parts[0], 10);
    const b = parseInt(parts[1], 10);

    if (!isNaN(a)) totalA += a;
    if (!isNaN(b)) totalB += b;
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
});
