const socket = io();
const $ = (id) => document.getElementById(id);

const hud = $("hud");
const meta = $("meta");
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

function parseScore(score) {
  const s = String(score ?? "").trim();
  const m = s.match(/^(\d+)\s*[:\-]\s*(\d+)$/);
  if (!m) return null;
  return { a: Number(m[1]), b: Number(m[2]) };
}

function calculateTotalScore(s) {
  let totalA = 0;
  let totalB = 0;

  if (!Array.isArray(s.matches)) return { totalA, totalB };

  s.matches.forEach((m) => {
    const sc = parseScore(m?.score);
    if (!sc) return;
    totalA += sc.a;
    totalB += sc.b;
  });

  return { totalA, totalB };
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
    meta.textContent = "остался розыгрыш: 1";
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

function getCurrentServer(s) {
  const firstServer = s.firstServer === "A" || s.firstServer === "B" ? s.firstServer : "";
  if (!firstServer) return "";

  const serveRallies = Number(s.serveRallies ?? ((Number(s.a3 ?? 0) + Number(s.b3 ?? 0))));
  const totalRallies = Math.max(0, serveRallies);
  const serveBlock = Math.floor(totalRallies / 2);

  if (firstServer === "A") return serveBlock % 2 === 0 ? "A" : "B";
  return serveBlock % 2 === 0 ? "B" : "A";
}

function updateServeIndicator(s) {
  const currentServer = getCurrentServer(s);
  serveAEl.classList.toggle("show", currentServer === "A");
  serveBEl.classList.toggle("show", currentServer === "B");
}

socket.on("connect", () => {
  socket.emit("getState");
});

socket.on("state", (s) => {
  hud.style.display = (s.hudVisible ?? true) ? "flex" : "none";
  if (!(s.hudVisible ?? true)) return;

  const totals = calculateTotalScore(s);

  $("teamA").textContent = s.teamA ?? "TEAM A";
  $("teamB").textContent = s.teamB ?? "TEAM B";

  $("a3").textContent = String(s.a3 ?? 0);
  $("b3").textContent = String(s.b3 ?? 0);

  $("totalA").textContent = String(totals.totalA);
  $("totalB").textContent = String(totals.totalB);

  setPos(s.hudPosition);
  setBg(s.hudBg);
  updateMetaTournament(s);
  updateServeIndicator(s);
});