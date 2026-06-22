const socket = io();
const $ = (id) => document.getElementById(id);

const TENNIS_LABELS = ["0", "15", "30", "40"];

function clamp(n, min, max) { n = Number(n); if (!Number.isFinite(n)) n = 0; return Math.max(min, Math.min(max, n)); }
function safeStr(v) { return String(v ?? "").trim(); }

let ts = {
  tennisPointsA: 0, tennisPointsB: 0,
  tennisGamesA: 0, tennisGamesB: 0,
  tennisDeuce: false, tennisAdvA: false, tennisAdvB: false,
  tennisFirstServer: "",
};
let teamAName = "Команда A";
let teamBName = "Команда B";
let maxGames = 6;

function snapshot() { return JSON.parse(JSON.stringify(ts)); }

function getCurrentServer() {
  const srv = ts.tennisFirstServer;
  if (srv !== "A" && srv !== "B") return "";
  const total = ts.tennisGamesA + ts.tennisGamesB;
  return (total % 2 === 0) ? srv : (srv === "A" ? "B" : "A");
}

function pointLabel(team) {
  if (ts.tennisDeuce) { if (team === "A" && ts.tennisAdvA) return "Ad"; if (team === "B" && ts.tennisAdvB) return "Ad"; return "40"; }
  const pts = team === "A" ? ts.tennisPointsA : ts.tennisPointsB;
  return TENNIS_LABELS[pts] ?? "0";
}

function updateUI() {
  if ($("teamNameA")) $("teamNameA").textContent = teamAName;
  if ($("teamNameB")) $("teamNameB").textContent = teamBName;
  if ($("btnALabel")) $("btnALabel").textContent = teamAName;
  if ($("btnBLabel")) $("btnBLabel").textContent = teamBName;
  if ($("serveLabelA")) $("serveLabelA").textContent = teamAName;
  if ($("serveLabelB")) $("serveLabelB").textContent = teamBName;
  if ($("headerTitle")) $("headerTitle").textContent = `${teamAName} vs ${teamBName}`;
  if ($("headerMaxGames")) $("headerMaxGames").textContent = maxGames;

  if ($("pointA")) $("pointA").textContent = pointLabel("A");
  if ($("pointB")) $("pointB").textContent = pointLabel("B");
  if ($("gamesA")) $("gamesA").textContent = ts.tennisGamesA;
  if ($("gamesB")) $("gamesB").textContent = ts.tennisGamesB;
  if ($("deuceBanner")) $("deuceBanner").textContent = (ts.tennisDeuce && !ts.tennisAdvA && !ts.tennisAdvB) ? "DEUCE" : "";

  const srv = ts.tennisFirstServer || "";
  if ($("serveA")) $("serveA").classList.toggle("active", srv === "A");
  if ($("serveB")) $("serveB").classList.toggle("active", srv === "B");
  if ($("serveNone")) $("serveNone").classList.toggle("active", srv === "");

  const cur = getCurrentServer();
  if ($("serveDotA")) $("serveDotA").classList.toggle("show", cur === "A");
  if ($("serveDotB")) $("serveDotB").classList.toggle("show", cur === "B");
}

// Modals
function showGameWinModal(winner, onConfirm, onCancel) {
  const name = winner === "A" ? teamAName : teamBName;
  if ($("modalGameWinSub")) $("modalGameWinSub").textContent = `Гейм выиграла: ${name}`;
  const overlay = $("modalGameWin");
  if (overlay) overlay.classList.add("show");
  const yes = $("modalGameWinYes"); const no = $("modalGameWinNo");
  const cleanup = () => { if (overlay) overlay.classList.remove("show"); yes.onclick = null; no.onclick = null; };
  yes.onclick = () => { cleanup(); onConfirm(); };
  no.onclick = () => { cleanup(); onCancel(); };
}

function showMatchWinModal(snapshotBeforeGame) {
  const winner = ts.tennisGamesA > ts.tennisGamesB ? "A" : "B";
  const name = winner === "A" ? teamAName : teamBName;
  const scoreStr = `${ts.tennisGamesA}:${ts.tennisGamesB}`;
  if ($("modalMatchWinSub")) $("modalMatchWinSub").textContent = `Победила команда: ${name} — ${scoreStr} геймов`;
  const overlay = $("modalMatchWin");
  if (overlay) overlay.classList.add("show");
  const saveBtn = $("modalMatchWinSave"); const cancelBtn = $("modalMatchWinCancel");
  const cleanup = () => { if (overlay) overlay.classList.remove("show"); saveBtn.onclick = null; cancelBtn.onclick = null; };

  saveBtn.onclick = () => {
    cleanup();
    // Emit save to server — server-side match table save handled by admin
    const savedSrv = ts.tennisFirstServer;
    socket.emit("setState", {
      ...buildPatch(),
      tennisPointsA: 0, tennisPointsB: 0,
      tennisGamesA: 0, tennisGamesB: 0,
      tennisDeuce: false, tennisAdvA: false, tennisAdvB: false,
      tennisFirstServer: savedSrv,
      updatedAt: Date.now(),
    });
    ts = { tennisPointsA:0, tennisPointsB:0, tennisGamesA:0, tennisGamesB:0, tennisDeuce:false, tennisAdvA:false, tennisAdvB:false, tennisFirstServer: savedSrv };
    updateUI();
  };

  cancelBtn.onclick = () => {
    cleanup();
    if (snapshotBeforeGame) { ts = snapshotBeforeGame; updateUI(); emitState(); }
  };
}

function checkMatchWin(snapshotBeforeGame) {
  if (ts.tennisGamesA + ts.tennisGamesB >= maxGames) showMatchWinModal(snapshotBeforeGame);
}

function doWinGame(winner, snapshotBeforeGame) {
  if (winner === "A") ts.tennisGamesA += 1; else ts.tennisGamesB += 1;
  ts.tennisPointsA = 0; ts.tennisPointsB = 0;
  ts.tennisDeuce = false; ts.tennisAdvA = false; ts.tennisAdvB = false;
  updateUI(); emitState();
  checkMatchWin(snapshotBeforeGame);
}

function scorePoint(winner) {
  if (ts.tennisDeuce) {
    if (ts.tennisAdvA || ts.tennisAdvB) {
      if ((winner === "A" && ts.tennisAdvA) || (winner === "B" && ts.tennisAdvB)) {
        const snap = snapshot();
        showGameWinModal(winner, () => doWinGame(winner, snap), () => { ts = snap; updateUI(); emitState(); });
        return;
      } else { ts.tennisAdvA = false; ts.tennisAdvB = false; }
    } else { if (winner === "A") ts.tennisAdvA = true; else ts.tennisAdvB = true; }
    updateUI(); emitState(); return;
  }
  const snap = snapshot();
  if (winner === "A") ts.tennisPointsA = clamp(ts.tennisPointsA + 1, 0, 4);
  else ts.tennisPointsB = clamp(ts.tennisPointsB + 1, 0, 4);
  if (ts.tennisPointsA === 3 && ts.tennisPointsB === 3) { ts.tennisDeuce = true; ts.tennisAdvA = false; ts.tennisAdvB = false; updateUI(); emitState(); return; }
  if (ts.tennisPointsA >= 4 || ts.tennisPointsB >= 4) {
    const w = ts.tennisPointsA >= 4 ? "A" : "B";
    showGameWinModal(w, () => doWinGame(w, snap), () => { ts = snap; updateUI(); emitState(); });
    return;
  }
  updateUI(); emitState();
}

function removePoint(team) {
  if (ts.tennisDeuce) {
    if (ts.tennisAdvA || ts.tennisAdvB) { ts.tennisAdvA = false; ts.tennisAdvB = false; }
    else { ts.tennisDeuce = false; if (team === "A") ts.tennisPointsA = 2; else ts.tennisPointsB = 2; }
    updateUI(); emitState(); return;
  }
  if (team === "A") ts.tennisPointsA = clamp(ts.tennisPointsA - 1, 0, 3);
  else ts.tennisPointsB = clamp(ts.tennisPointsB - 1, 0, 3);
  updateUI(); emitState();
}

function buildPatch() {
  return {
    tennisPointsA: ts.tennisPointsA, tennisPointsB: ts.tennisPointsB,
    tennisGamesA: ts.tennisGamesA, tennisGamesB: ts.tennisGamesB,
    tennisDeuce: ts.tennisDeuce, tennisAdvA: ts.tennisAdvA, tennisAdvB: ts.tennisAdvB,
    tennisFirstServer: ts.tennisFirstServer,
    tennisMaxGames: maxGames,
    updatedAt: Date.now(),
  };
}

function emitState() { socket.emit("setState", buildPatch()); }

// Socket
socket.on("connect", () => socket.emit("getState"));
socket.on("state", (s) => {
  if (!s) return;
  teamAName = safeStr(s.teamA) || "Команда A";
  teamBName = safeStr(s.teamB) || "Команда B";
  maxGames = clamp(Number(s.tennisMaxGames ?? 6), 1, 99);
  if ($("maxGamesInput")) $("maxGamesInput").value = maxGames;
  ts = {
    tennisPointsA: Number(s.tennisPointsA ?? 0),
    tennisPointsB: Number(s.tennisPointsB ?? 0),
    tennisGamesA: Number(s.tennisGamesA ?? 0),
    tennisGamesB: Number(s.tennisGamesB ?? 0),
    tennisDeuce: !!s.tennisDeuce,
    tennisAdvA: !!s.tennisAdvA,
    tennisAdvB: !!s.tennisAdvB,
    tennisFirstServer: s.tennisFirstServer === "A" || s.tennisFirstServer === "B" ? s.tennisFirstServer : "",
  };
  updateUI();
});

// Events
if ($("btnAPlus")) $("btnAPlus").addEventListener("click", () => scorePoint("A"));
if ($("btnBPlus")) $("btnBPlus").addEventListener("click", () => scorePoint("B"));
if ($("btnAMinus")) $("btnAMinus").addEventListener("click", () => removePoint("A"));
if ($("btnBMinus")) $("btnBMinus").addEventListener("click", () => removePoint("B"));

if ($("serveA")) $("serveA").addEventListener("click", () => { ts.tennisFirstServer = "A"; updateUI(); emitState(); });
if ($("serveB")) $("serveB").addEventListener("click", () => { ts.tennisFirstServer = "B"; updateUI(); emitState(); });
if ($("serveNone")) $("serveNone").addEventListener("click", () => { ts.tennisFirstServer = ""; updateUI(); emitState(); });

if ($("maxGamesInput")) $("maxGamesInput").addEventListener("change", () => {
  maxGames = clamp(Number($("maxGamesInput").value), 1, 99);
  $("maxGamesInput").value = maxGames;
  if ($("headerMaxGames")) $("headerMaxGames").textContent = maxGames;
  socket.emit("setState", { tennisMaxGames: maxGames, updatedAt: Date.now() });
});

if ($("btnReset")) $("btnReset").addEventListener("click", () => {
  const srv = ts.tennisFirstServer;
  ts = { tennisPointsA:0,tennisPointsB:0,tennisGamesA:0,tennisGamesB:0,tennisDeuce:false,tennisAdvA:false,tennisAdvB:false,tennisFirstServer:srv };
  updateUI(); emitState();
});

if ($("btnBack")) $("btnBack").addEventListener("click", () => { window.location.href = "/admin.html"; });
