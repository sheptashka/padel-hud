const socket = io();
const $ = (id) => document.getElementById(id);

const HUD_CACHE_KEY = "padel_hud_cache_v1";

const hud = $("hud");
const meta = $("meta");
const serveAEl = $("serveA");
const serveBEl = $("serveB");

function hasStateData(s) {
  return (
    (s?.teamA && s.teamA !== "Команда A") ||
    (s?.teamB && s.teamB !== "Команда B") ||
    Number(s?.a3 || 0) !== 0 ||
    Number(s?.b3 || 0) !== 0 ||
    (Array.isArray(s?.matches) && s.matches.some(m => String(m?.score || "").trim())) ||
    (Array.isArray(s?.teamAPlayers) && s.teamAPlayers.some(x => String(x || "").trim())) ||
    (Array.isArray(s?.teamBPlayers) && s.teamBPlayers.some(x => String(x || "").trim()))
  );
}

function saveHudCache(s) {
  if (!hasStateData(s)) return;
  try {
    localStorage.setItem(HUD_CACHE_KEY, JSON.stringify(s));
  } catch (_) {}
}

function loadHudCache() {
  try {
    const raw = localStorage.getItem(HUD_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

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

  if (Array.isArray(s.matches)) {
    s.matches.forEach((m) => {
      const sc = parseScore(m?.score);
      if (!sc) return;
      totalA += sc.a;
      totalB += sc.b;
    });
  }

  // ✅ добавляем текущий матч из админки
  totalA += Number(s.a3 || 0);
  totalB += Number(s.b3 || 0);

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

  const serveRallies = Number(s.serveRallies ?? (Number(s.a3 ?? 0) + Number(s.b3 ?? 0)));
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

function applyState(s) {
  hud.style.display = (s.hudVisible ?? true) ? "flex" : "none";
  if (!(s.hudVisible ?? true)) return;

  const scoreMode = s.scoreMode ?? "tournament";

  const tournamentEl = document.getElementById("hudTournament");
  const tennisEl = document.getElementById("hudTennis");

  if (scoreMode === "tennis") {
    if (tournamentEl) tournamentEl.style.display = "none";
    if (tennisEl) tennisEl.style.display = "block";
    applyTennisState(s);
  } else {
    if (tournamentEl) tournamentEl.style.display = "block";
    if (tennisEl) tennisEl.style.display = "none";
    applyTournamentState(s);
  }

  setPos(s.hudPosition);
  setBg(s.hudBg);
  updateServeIndicator(s);
}

function applyTournamentState(s) {
  const totals = calculateTotalScore(s);

  $("teamA").textContent = s.teamA ?? "TEAM A";
  $("teamB").textContent = s.teamB ?? "TEAM B";

  $("a3").textContent = String(s.a3 ?? 0);
  $("b3").textContent = String(s.b3 ?? 0);

  $("totalA").textContent = String(totals.totalA);
  $("totalB").textContent = String(totals.totalB);

  updateMetaTournament(s);
}

const TENNIS_LABELS_HUD = ["0", "15", "30", "40"];

function tennisHudPointLabel(s, team) {
  const deuce = !!s.tennisDeuce;
  const advA = !!s.tennisAdvA;
  const advB = !!s.tennisAdvB;

  if (deuce) {
    if (team === "A" && advA) return "Ad";
    if (team === "B" && advB) return "Ad";
    return "40";
  }
  const pts = team === "A" ? Number(s.tennisPointsA ?? 0) : Number(s.tennisPointsB ?? 0);
  return TENNIS_LABELS_HUD[pts] ?? "0";
}

function applyTennisState(s) {
  const elTA = $("tennisTeamA");
  const elTB = $("tennisTeamB");
  const elPA = $("tennisHudPointA");
  const elPB = $("tennisHudPointB");
  const elGA = $("tennisHudGamesA");
  const elGB = $("tennisHudGamesB");
  const elDeuce = $("hudTennisDeuce");

  if (elTA) elTA.textContent = s.teamA ?? "TEAM A";
  if (elTB) elTB.textContent = s.teamB ?? "TEAM B";
  if (elPA) elPA.textContent = tennisHudPointLabel(s, "A");
  if (elPB) elPB.textContent = tennisHudPointLabel(s, "B");
  if (elGA) elGA.textContent = String(s.tennisGamesA ?? 0);
  if (elGB) elGB.textContent = String(s.tennisGamesB ?? 0);

  if (elDeuce) {
    const showDeuce = !!s.tennisDeuce && !s.tennisAdvA && !s.tennisAdvB;
    elDeuce.style.display = showDeuce ? "block" : "none";
  }
}

socket.on("connect", () => {
  socket.emit("getState");
});

socket.on("state", (s) => {
  if (!hasStateData(s)) {
    const cached = loadHudCache();
    if (cached) {
      applyState(cached);
      return;
    }
  } else {
    saveHudCache(s);
  }

  applyState(s || {});
});
