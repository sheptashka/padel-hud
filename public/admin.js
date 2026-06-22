const socket = io();
const $ = (id) => document.getElementById(id);

const LS_KEY = "padel_hud_state_v1";
const MATCHES_KEY = "padel_matches_v1";

let state = null;

// Dynamic match count
let matchCount = 9;

function makeEmptyMatches(n) {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, a: "", b: "", score: "" }));
}

let DEFAULT_MATCHES = makeEmptyMatches(matchCount);

function now() { return Date.now(); }

function clamp(n, min, max) {
  n = Number(n);
  if (!Number.isFinite(n)) n = 0;
  return Math.max(min, Math.min(max, n));
}

function normalizeTournament(a, b, N) {
  N = clamp(N, 1, 9999);
  a = clamp(a, 0, N);
  b = clamp(b, 0, N);
  if (a + b > N) b = Math.max(0, N - a);
  return { N, a, b };
}

function safeStr(v) { return String(v ?? "").trim(); }

function sanitizePlayers(arr) {
  const base = Array.isArray(arr) ? arr : ["", "", ""];
  const out = [base[0], base[1], base[2]].map(safeStr);
  while (out.length < 3) out.push("");
  return out.slice(0, 3);
}

function sanitizeMatches(arr, n) {
  const count = n ?? matchCount;
  const base = Array.isArray(arr) ? arr : makeEmptyMatches(count);
  // Preserve all existing entries, expand or trim to count
  const out = [];
  for (let i = 0; i < count; i++) {
    const m = base[i];
    out.push({
      id: i + 1,
      a: safeStr(m?.a),
      b: safeStr(m?.b),
      score: safeStr(m?.score),
    });
  }
  return out;
}

function sanitizeFirstServer(value) {
  return value === "A" || value === "B" ? value : "";
}

function hasMeaningfulData(p) {
  if (!p || typeof p !== "object") return false;
  const teamNames =
    (safeStr(p.teamA) && safeStr(p.teamA) !== "Команда A") ||
    (safeStr(p.teamB) && safeStr(p.teamB) !== "Команда B");
  const players = [...sanitizePlayers(p.teamAPlayers), ...sanitizePlayers(p.teamBPlayers)].some(Boolean);
  const score = Number(p?.a3 || 0) !== 0 || Number(p?.b3 || 0) !== 0;
  const serving = sanitizeFirstServer(p.firstServer) !== "";
  const matches = Array.isArray(p?.matches) && p.matches.some((m) => safeStr(m?.a) || safeStr(m?.b) || safeStr(m?.score));
  return teamNames || players || score || serving || matches;
}

function loadLocal() {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; }
  catch (_) { return null; }
}
function saveLocal(patch) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(patch)); } catch (_) {}
}
function loadMatchesLocal() {
  try { const raw = localStorage.getItem(MATCHES_KEY); if (!raw) return null; const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : null; }
  catch (_) { return null; }
}
function saveMatchesLocal(matches) {
  try { localStorage.setItem(MATCHES_KEY, JSON.stringify(matches)); } catch (_) {}
}

function updateTeamRowTitles() {
  const aName = safeStr($("teamA").value) || "Команда A";
  const bName = safeStr($("teamB").value) || "Команда B";
  if ($("teamRowA")) $("teamRowA").textContent = aName;
  if ($("teamRowB")) $("teamRowB").textContent = bName;
  const colA = $("colTeamA"); const colB = $("colTeamB");
  if (colA) colA.textContent = aName;
  if (colB) colB.textContent = bName;
}

function syncFirstServerCheckboxes(firstServer) {
  const value = sanitizeFirstServer(firstServer);
  if ($("firstServerA")) $("firstServerA").checked = value === "A";
  if ($("firstServerB")) $("firstServerB").checked = value === "B";
}

function getFirstServerFromUI() {
  if ($("firstServerA")?.checked) return "A";
  if ($("firstServerB")?.checked) return "B";
  return "";
}

// ===================== SCORE MODE UI =====================
function updateScoreModeUI(mode) {
  const tournamentBlock = $("tournamentBlock");
  const tennisBlock = $("tennisBlock");
  const maxPointsWrap = $("maxPointsWrap");

  if (mode === "tennis") {
    if (tournamentBlock) tournamentBlock.style.display = "none";
    if (tennisBlock) tennisBlock.style.display = "block";
    if (maxPointsWrap) maxPointsWrap.style.display = "none";
  } else {
    if (tournamentBlock) tournamentBlock.style.display = "block";
    if (tennisBlock) tennisBlock.style.display = "none";
    if (maxPointsWrap) maxPointsWrap.style.display = "block";
  }
}

// ===================== MATCH COUNT =====================
function setMatchCount(n) {
  n = clamp(n, 1, 99);
  matchCount = n;
  if ($("matchCount")) $("matchCount").value = n;

  // Expand or trim matches preserving data
  const current = Array.isArray(window.__matches) ? window.__matches : [];
  window.__matches = sanitizeMatches(current, n);
  renderAdminMatches(window.__matches);
  saveMatchesLocal(window.__matches);
  emitAll();
}

// ===================== MATCHES RENDER =====================
function renderAdminMatches(matches) {
  const body = $("adminMatchesBody");
  if (!body) return;
  body.innerHTML = "";

  (matches || []).forEach((m, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><input data-k="a" data-i="${idx}" class="matchIn" placeholder="Игрок 1 / Игрок 2" value="${m.a || ""}" /></td>
      <td><input data-k="b" data-i="${idx}" class="matchIn" placeholder="Игрок 1 / Игрок 2" value="${m.b || ""}" /></td>
      <td><input data-k="score" data-i="${idx}" class="matchIn" placeholder="6:3" value="${m.score || ""}" /></td>
    `;
    body.appendChild(tr);

    tr.querySelectorAll(".matchIn").forEach((el) => {
      el.addEventListener("input", () => { window.__matches = collectAdminMatches(); saveMatchesLocal(window.__matches); saveDraftOnly(); });
      el.addEventListener("change", () => { window.__matches = collectAdminMatches(); saveMatchesLocal(window.__matches); saveDraftOnly(); });
    });
  });
}

function collectAdminMatches() {
  const body = $("adminMatchesBody");
  if (!body) return makeEmptyMatches(matchCount);
  const base = Array.isArray(window.__matches) ? window.__matches : makeEmptyMatches(matchCount);
  const next = base.map((x) => ({ ...x }));
  body.querySelectorAll(".matchIn").forEach((el) => {
    const i = Number(el.getAttribute("data-i"));
    const k = el.getAttribute("data-k");
    if (!Number.isFinite(i) || !next[i]) return;
    next[i][k] = safeStr(el.value);
  });
  return sanitizeMatches(next);
}

// Write tennis match result into first empty matches row
function saveMatchToTable(scoreStr) {
  const matches = collectAdminMatches();
  const idx = matches.findIndex((m) => !safeStr(m.score));
  if (idx === -1) return; // no empty row

  const teamAName = safeStr($("teamA")?.value) || "Команда A";
  const teamBName = safeStr($("teamB")?.value) || "Команда B";

  matches[idx].a = teamAName + " (Главный корт)";
  matches[idx].b = teamBName + " (судья)";
  matches[idx].score = scoreStr;

  window.__matches = matches;
  saveMatchesLocal(matches);
  renderAdminMatches(matches);
  emitAll();

  const hintEl = $("matchesSavedHint");
  if (hintEl) {
    hintEl.textContent = "Счёт сохранён ✓";
    setTimeout(() => { hintEl.textContent = ""; }, 2000);
  }
}

// ===================== BUILD PATCH =====================
function buildPatchFromUI({ touchUpdatedAt } = { touchUpdatedAt: true }) {
  const rawN = $("maxPoints")?.value ?? 11;
  const rawA = $("a3")?.value ?? 0;
  const rawB = $("b3")?.value ?? 0;
  const norm = normalizeTournament(rawA, rawB, rawN);

  if ($("maxPoints")) $("maxPoints").value = norm.N;
  if ($("a3")) $("a3").value = norm.a;
  if ($("b3")) $("b3").value = norm.b;

  updateTeamRowTitles();

  const teamA = safeStr($("teamA").value) || "Команда A";
  const teamB = safeStr($("teamB").value) || "Команда B";
  const teamAPlayers = sanitizePlayers([$("aP1").value, $("aP2").value, $("aP3").value]);
  const teamBPlayers = sanitizePlayers([$("bP1").value, $("bP2").value, $("bP3").value]);
  const matches = (Array.isArray(window.__matches) ? window.__matches : null) || loadMatchesLocal() || makeEmptyMatches(matchCount);
  const local = loadLocal();

  const scoreMode = $("scoreMode")?.value || "tournament";
  const ts = window.__tennisState || {};

  return {
    mode: "tournament",
    maxPoints: norm.N,
    hudBg: $("hudBg").value,
    teamA, teamB, teamAPlayers, teamBPlayers,
    hudPosition: $("hudPosition").value,
    a3: norm.a, b3: norm.b,
    hudVisible: $("showHud") ? $("showHud").checked : true,
    firstServer: getFirstServerFromUI(),
    matches: sanitizeMatches(matches),
    updatedAt: touchUpdatedAt ? now() : Number(local?.updatedAt || 0) || now(),
    scoreMode,
    tennisMaxGames: $("tennisMaxGames") ? clamp(Number($("tennisMaxGames").value), 1, 99) : 6,
    tennisPointsA: ts.tennisPointsA ?? 0,
    tennisPointsB: ts.tennisPointsB ?? 0,
    tennisGamesA: ts.tennisGamesA ?? 0,
    tennisGamesB: ts.tennisGamesB ?? 0,
    tennisDeuce: ts.tennisDeuce ?? false,
    tennisAdvA: ts.tennisAdvA ?? false,
    tennisAdvB: ts.tennisAdvB ?? false,
    tennisFirstServer: ts.tennisFirstServer ?? "",
    matchCount,
  };
}

function saveDraftOnly() {
  const patch = buildPatchFromUI({ touchUpdatedAt: true });
  saveLocal(patch);
}

function emitAll() {
  const patch = buildPatchFromUI({ touchUpdatedAt: true });
  const prev = loadLocal();
  if (!hasMeaningfulData(patch) && hasMeaningfulData(prev)) {
    fill(prev);
    window.__matches = sanitizeMatches(prev.matches || loadMatchesLocal() || makeEmptyMatches(matchCount));
    renderAdminMatches(window.__matches);
    return;
  }
  saveLocal(patch);
  saveMatchesLocal(patch.matches);
  socket.emit("setState", patch);
}

function fill(s) {
  if ($("teamA")) $("teamA").value = s.teamA ?? "";
  if ($("teamB")) $("teamB").value = s.teamB ?? "";
  if ($("maxPoints")) $("maxPoints").value = s.maxPoints ?? 11;
  if ($("hudPosition")) $("hudPosition").value = s.hudPosition ?? "tl";
  if ($("hudBg")) $("hudBg").value = s.hudBg ?? "transparent";
  if ($("a3")) $("a3").value = s.a3 ?? 0;
  if ($("b3")) $("b3").value = s.b3 ?? 0;

  const aP = sanitizePlayers(s.teamAPlayers);
  const bP = sanitizePlayers(s.teamBPlayers);
  if ($("aP1")) $("aP1").value = aP[0];
  if ($("aP2")) $("aP2").value = aP[1];
  if ($("aP3")) $("aP3").value = aP[2];
  if ($("bP1")) $("bP1").value = bP[0];
  if ($("bP2")) $("bP2").value = bP[1];
  if ($("bP3")) $("bP3").value = bP[2];

  syncFirstServerCheckboxes(s.firstServer);
  if ($("showHud")) $("showHud").checked = s.hudVisible ?? true;

  const scoreMode = s.scoreMode ?? "tournament";
  if ($("scoreMode")) $("scoreMode").value = scoreMode;
  if ($("tennisMaxGames")) $("tennisMaxGames").value = s.tennisMaxGames ?? 6;
  updateScoreModeUI(scoreMode);

  if (s.matchCount && Number(s.matchCount) > 0) {
    matchCount = Number(s.matchCount);
    if ($("matchCount")) $("matchCount").value = matchCount;
  }

  loadTennisState(s);
  updateTennisUI();
  updateTeamRowTitles();
}

function applyDelta(team, delta) {
  const N = Number($("maxPoints")?.value ?? 11);
  const a = Number($("a3")?.value ?? 0);
  const b = Number($("b3")?.value ?? 0);
  if (team === "A") {
    const na = clamp(a + delta, 0, N);
    $("a3").value = na;
    $("b3").value = clamp(b, 0, N - na);
  } else {
    const nb = clamp(b + delta, 0, N);
    $("b3").value = nb;
    $("a3").value = clamp(a, 0, N - nb);
  }
  emitAll();
}

function applyBonus(team) {
  const N = Number($("maxPoints")?.value ?? 11);
  const a = Number($("a3")?.value ?? 0);
  const b = Number($("b3")?.value ?? 0);
  if (team === "A") {
    const na = clamp(a + 2, 0, N);
    $("a3").value = na;
    $("b3").value = clamp(b, 0, N - na);
  } else {
    const nb = clamp(b + 2, 0, N);
    $("b3").value = nb;
    $("a3").value = clamp(a, 0, N - nb);
  }
  emitAll();
}

function toggleFirstServer(team) {
  const next = team === "A" ? ($("firstServerA").checked ? "A" : "") : ($("firstServerB").checked ? "B" : "");
  syncFirstServerCheckboxes(next);
  saveDraftOnly();
  emitAll();
}

// ===================== TENNIS LOGIC =====================
const TENNIS_LABELS = ["0", "15", "30", "40"];

window.__tennisState = {
  tennisPointsA: 0, tennisPointsB: 0,
  tennisGamesA: 0, tennisGamesB: 0,
  tennisDeuce: false, tennisAdvA: false, tennisAdvB: false,
  tennisFirstServer: "", // "A" | "B" | ""
};

// Snapshot for undo on "No" in game-win modal
let __tennisSnapshotBeforeGame = null;

function tennisPointLabel(ts, team) {
  if (ts.tennisDeuce) {
    if (team === "A" && ts.tennisAdvA) return "Ad";
    if (team === "B" && ts.tennisAdvB) return "Ad";
    return "40";
  }
  const pts = team === "A" ? ts.tennisPointsA : ts.tennisPointsB;
  return TENNIS_LABELS[pts] ?? "0";
}

function updateTennisUI() {
  const ts = window.__tennisState;
  const elA = $("tennisPointA"); const elB = $("tennisPointB");
  const elGA = $("tennisGamesA"); const elGB = $("tennisGamesB");
  const elDeuce = $("tennisDeuceLabel");
  const elLA = $("tennisTeamLabelA"); const elLB = $("tennisTeamLabelB");

  if (elA) elA.textContent = tennisPointLabel(ts, "A");
  if (elB) elB.textContent = tennisPointLabel(ts, "B");
  if (elGA) elGA.textContent = ts.tennisGamesA;
  if (elGB) elGB.textContent = ts.tennisGamesB;
  if (elDeuce) elDeuce.textContent = (ts.tennisDeuce && !ts.tennisAdvA && !ts.tennisAdvB) ? "DEUCE" : "";

  const teamA = safeStr($("teamA")?.value) || "Команда A";
  const teamB = safeStr($("teamB")?.value) || "Команда B";
  if (elLA) elLA.textContent = teamA;
  if (elLB) elLB.textContent = teamB;

  // Update serve labels and active state
  const slA = $("tennisServeLabelA"); const slB = $("tennisServeLabelB");
  if (slA) slA.textContent = teamA;
  if (slB) slB.textContent = teamB;

  const sA = $("tennisServeA"); const sB = $("tennisServeB"); const sN = $("tennisServeNone");
  const srv = ts.tennisFirstServer || "";
  if (sA) sA.classList.toggle("active", srv === "A");
  if (sB) sB.classList.toggle("active", srv === "B");
  if (sN) sN.classList.toggle("active", srv === "");
}

function loadTennisState(s) {
  window.__tennisState = {
    tennisPointsA: Number(s?.tennisPointsA ?? 0),
    tennisPointsB: Number(s?.tennisPointsB ?? 0),
    tennisGamesA: Number(s?.tennisGamesA ?? 0),
    tennisGamesB: Number(s?.tennisGamesB ?? 0),
    tennisDeuce: !!s?.tennisDeuce,
    tennisAdvA: !!s?.tennisAdvA,
    tennisAdvB: !!s?.tennisAdvB,
    tennisFirstServer: s?.tennisFirstServer === "A" || s?.tennisFirstServer === "B" ? s.tennisFirstServer : "",
  };
}

function snapshotTennis() {
  return JSON.parse(JSON.stringify(window.__tennisState));
}

// Show game-win confirmation modal
function showGameWinModal(winner, onConfirm, onCancel) {
  const teamName = winner === "A"
    ? (safeStr($("teamA")?.value) || "Команда A")
    : (safeStr($("teamB")?.value) || "Команда B");

  const title = $("modalGameWinTitle");
  const sub = $("modalGameWinSub");
  const overlay = $("modalGameWin");
  const yesBtn = $("modalGameWinYes");
  const noBtn = $("modalGameWinNo");

  if (title) title.textContent = `Победа в гейме?`;
  if (sub) sub.textContent = `Гейм выиграла: ${teamName}`;
  if (overlay) overlay.classList.add("show");

  const cleanup = () => {
    if (overlay) overlay.classList.remove("show");
    yesBtn.onclick = null;
    noBtn.onclick = null;
  };

  yesBtn.onclick = () => { cleanup(); onConfirm(); };
  noBtn.onclick = () => { cleanup(); onCancel(); };
}

// Show match-win modal
function showMatchWinModal(winner, snapshotBeforeGame) {
  const ts = window.__tennisState;
  const teamA = safeStr($("teamA")?.value) || "Команда A";
  const teamB = safeStr($("teamB")?.value) || "Команда B";
  const winnerName = winner === "A" ? teamA : teamB;
  const scoreStr = `${ts.tennisGamesA}:${ts.tennisGamesB}`;

  const overlay = $("modalMatchWin");
  const title = $("modalMatchWinTitle");
  const sub = $("modalMatchWinSub");
  const saveBtn = $("modalMatchWinSave");
  const cancelBtn = $("modalMatchWinCancel");

  if (title) title.textContent = `Матч завершён!`;
  if (sub) sub.textContent = `Победила команда: ${winnerName} — ${scoreStr} геймов`;
  if (overlay) overlay.classList.add("show");

  const cleanup = () => {
    if (overlay) overlay.classList.remove("show");
    saveBtn.onclick = null;
    cancelBtn.onclick = null;
  };

  saveBtn.onclick = () => {
    cleanup();
    saveMatchToTable(scoreStr);
    window.__tennisState = {
      tennisPointsA: 0, tennisPointsB: 0,
      tennisGamesA: 0, tennisGamesB: 0,
      tennisDeuce: false, tennisAdvA: false, tennisAdvB: false,
    };
    updateTennisUI();
    emitAll();
  };

  cancelBtn.onclick = () => {
    cleanup();
    // Restore full state before the last game point was scored
    if (snapshotBeforeGame) {
      window.__tennisState = snapshotBeforeGame;
      updateTennisUI();
      emitAll();
    }
  };
}

function checkMatchWin(winner, snapshotBeforeGame) {
  const maxG = clamp(Number($("tennisMaxGames")?.value ?? 6), 1, 99);
  const ts = window.__tennisState;
  const gA = ts.tennisGamesA;
  const gB = ts.tennisGamesB;
  if (gA + gB >= maxG) {
    showMatchWinModal(gA > gB ? "A" : "B", snapshotBeforeGame);
  }
}

function doWinGame(winner, snapshotBeforeGame) {
  const ts = window.__tennisState;
  if (winner === "A") ts.tennisGamesA += 1;
  else ts.tennisGamesB += 1;
  ts.tennisPointsA = 0; ts.tennisPointsB = 0;
  ts.tennisDeuce = false; ts.tennisAdvA = false; ts.tennisAdvB = false;
  updateTennisUI();
  emitAll();
  checkMatchWin(winner, snapshotBeforeGame);
}

function tennisScorePoint(winner) {
  const ts = window.__tennisState;

  if (ts.tennisDeuce) {
    if (ts.tennisAdvA || ts.tennisAdvB) {
      if ((winner === "A" && ts.tennisAdvA) || (winner === "B" && ts.tennisAdvB)) {
        const snapshot = snapshotTennis();
        showGameWinModal(winner,
          () => { doWinGame(winner, snapshot); },
          () => { window.__tennisState = snapshot; updateTennisUI(); emitAll(); }
        );
        return;
      } else {
        ts.tennisAdvA = false; ts.tennisAdvB = false;
      }
    } else {
      if (winner === "A") ts.tennisAdvA = true;
      else ts.tennisAdvB = true;
    }
    updateTennisUI(); emitAll(); return;
  }

  // Take snapshot BEFORE mutating
  const snapshot = snapshotTennis();

  if (winner === "A") ts.tennisPointsA = clamp(ts.tennisPointsA + 1, 0, 4);
  else ts.tennisPointsB = clamp(ts.tennisPointsB + 1, 0, 4);

  if (ts.tennisPointsA === 3 && ts.tennisPointsB === 3) {
    ts.tennisDeuce = true; ts.tennisAdvA = false; ts.tennisAdvB = false;
    updateTennisUI(); emitAll(); return;
  }

  if (ts.tennisPointsA >= 4 || ts.tennisPointsB >= 4) {
    const w = ts.tennisPointsA >= 4 ? "A" : "B";
    showGameWinModal(w,
      () => { doWinGame(w, snapshot); },
      () => { window.__tennisState = snapshot; updateTennisUI(); emitAll(); }
    );
    return;
  }

  updateTennisUI(); emitAll();
}

function tennisRemovePoint(team) {
  const ts = window.__tennisState;
  if (ts.tennisDeuce) {
    if (ts.tennisAdvA || ts.tennisAdvB) {
      ts.tennisAdvA = false; ts.tennisAdvB = false;
    } else {
      ts.tennisDeuce = false;
      if (team === "A") ts.tennisPointsA = 2;
      else ts.tennisPointsB = 2;
    }
    updateTennisUI(); emitAll(); return;
  }
  if (team === "A") ts.tennisPointsA = clamp(ts.tennisPointsA - 1, 0, 3);
  else ts.tennisPointsB = clamp(ts.tennisPointsB - 1, 0, 3);
  updateTennisUI(); emitAll();
}

function tennisResetAll() {
  window.__tennisState = {
    tennisPointsA: 0, tennisPointsB: 0,
    tennisGamesA: 0, tennisGamesB: 0,
    tennisDeuce: false, tennisAdvA: false, tennisAdvB: false,
    tennisFirstServer: "",
  };
  updateTennisUI(); emitAll();
}

// ===================== BOOT =====================
const bootLocalMatches = loadMatchesLocal();
const bootLocal = loadLocal();

if (bootLocal?.matchCount) {
  matchCount = Number(bootLocal.matchCount) || 9;
  if ($("matchCount")) $("matchCount").value = matchCount;
}

if (bootLocalMatches) {
  window.__matches = sanitizeMatches(bootLocalMatches);
  renderAdminMatches(window.__matches);
} else {
  window.__matches = makeEmptyMatches(matchCount);
  renderAdminMatches(window.__matches);
}

if (bootLocal && hasMeaningfulData(bootLocal)) {
  fill(bootLocal);
  loadTennisState(bootLocal);
  updateTennisUI();
  window.__matches = sanitizeMatches(bootLocal.matches || loadMatchesLocal() || makeEmptyMatches(matchCount));
  renderAdminMatches(window.__matches);
}

// ===================== SOCKET =====================
socket.on("connect", () => { socket.emit("getState"); });

socket.on("state", (s) => {
  state = s || {};
  const local = loadLocal();
  const sAt = Number(state.updatedAt || 0);
  const lAt = Number(local?.updatedAt || 0);
  const serverLooksEmpty = !hasMeaningfulData(state);

  if (local && hasMeaningfulData(local) && (serverLooksEmpty || (lAt && lAt > sAt))) {
    socket.emit("setState", { ...local, updatedAt: local.updatedAt || now() });
    return;
  }

  fill(state);
  loadTennisState(state);
  updateTennisUI();

  const serverMatches = Array.isArray(state.matches) ? state.matches : null;
  const useMatches = (serverMatches?.length ? serverMatches : null) || loadMatchesLocal() || makeEmptyMatches(matchCount);
  window.__matches = sanitizeMatches(useMatches);
  renderAdminMatches(window.__matches);
  saveMatchesLocal(window.__matches);

  saveLocal({
    ...buildPatchFromUI({ touchUpdatedAt: false }),
    ...state,
    matches: window.__matches,
    updatedAt: sAt || now(),
  });
});

// ===================== EVENT LISTENERS =====================
if ($("apply")) $("apply").addEventListener("click", emitAll);
if ($("reset")) $("reset").addEventListener("click", () => { socket.emit("reset"); setTimeout(() => socket.emit("getState"), 200); });

if ($("aPlus")) $("aPlus").addEventListener("click", () => applyDelta("A", +1));
if ($("aMinus")) $("aMinus").addEventListener("click", () => applyDelta("A", -1));
if ($("bPlus")) $("bPlus").addEventListener("click", () => applyDelta("B", +1));
if ($("bMinus")) $("bMinus").addEventListener("click", () => applyDelta("B", -1));
if ($("aBonus")) $("aBonus").addEventListener("click", () => applyBonus("A"));
if ($("bBonus")) $("bBonus").addEventListener("click", () => applyBonus("B"));
if ($("firstServerA")) $("firstServerA").addEventListener("change", () => toggleFirstServer("A"));
if ($("firstServerB")) $("firstServerB").addEventListener("change", () => toggleFirstServer("B"));

if ($("scoreMode")) {
  $("scoreMode").addEventListener("change", () => {
    updateScoreModeUI($("scoreMode").value);
    emitAll();
  });
}

if ($("tennisMaxGames")) $("tennisMaxGames").addEventListener("change", emitAll);
if ($("tennisAPlus")) $("tennisAPlus").addEventListener("click", () => tennisScorePoint("A"));
if ($("tennisAMinus")) $("tennisAMinus").addEventListener("click", () => tennisRemovePoint("A"));
if ($("tennisBPlus")) $("tennisBPlus").addEventListener("click", () => tennisScorePoint("B"));
if ($("tennisBMinus")) $("tennisBMinus").addEventListener("click", () => tennisRemovePoint("B"));
if ($("tennisReset")) $("tennisReset").addEventListener("click", tennisResetAll);
if ($("tennisServeA")) $("tennisServeA").addEventListener("click", () => { window.__tennisState.tennisFirstServer = "A"; updateTennisUI(); emitAll(); });
if ($("tennisServeB")) $("tennisServeB").addEventListener("click", () => { window.__tennisState.tennisFirstServer = "B"; updateTennisUI(); emitAll(); });
if ($("tennisServeNone")) $("tennisServeNone").addEventListener("click", () => { window.__tennisState.tennisFirstServer = ""; updateTennisUI(); emitAll(); });

// Match count controls
if ($("matchCount")) {
  $("matchCount").addEventListener("change", () => {
    const n = clamp(Number($("matchCount").value), 1, 99);
    setMatchCount(n);
  });
}
if ($("matchCountPlus")) {
  $("matchCountPlus").addEventListener("click", () => setMatchCount(matchCount + 1));
}
if ($("matchCountMinus")) {
  $("matchCountMinus").addEventListener("click", () => setMatchCount(matchCount - 1));
}

[
  "teamA", "teamB", "maxPoints", "hudPosition", "hudBg", "a3", "b3",
  "aP1", "aP2", "aP3", "bP1", "bP2", "bP3"
].forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.addEventListener("input", () => saveDraftOnly());
  el.addEventListener("change", () => emitAll());
});

["teamA", "teamB"].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener("input", () => { updateTeamRowTitles(); updateTennisUI(); });
});

if ($("showHud")) $("showHud").addEventListener("change", emitAll);

const previewBox = $("previewBox");
const showPreview = $("showPreview");
if (previewBox && showPreview) {
  showPreview.addEventListener("change", (e) => { previewBox.classList.toggle("show", e.target.checked); });
}

const saveBtn = $("saveMatches");
if (saveBtn) {
  saveBtn.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    const matches = collectAdminMatches();
    window.__matches = matches;
    saveMatchesLocal(matches);
    emitAll();
    const hintEl = $("matchesSavedHint");
    if (hintEl) { hintEl.textContent = "Сохранено ✓"; setTimeout(() => { hintEl.textContent = ""; }, 1500); }
  });
}

const clearBtn = $("clearMatches");
if (clearBtn) {
  clearBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const cleared = makeEmptyMatches(matchCount);
    window.__matches = cleared;
    saveMatchesLocal(cleared);
    renderAdminMatches(cleared);
    emitAll();
  });
}

setInterval(() => {
  try {
    const local = loadLocal();
    if (local && hasMeaningfulData(local)) {
      socket.emit("setState", { ...local, updatedAt: local.updatedAt || Date.now() });
    }
  } catch (_) {}
}, 5000);
