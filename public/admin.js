const socket = io();
const $ = (id) => document.getElementById(id);

const LS_KEY = "padel_hud_state_v2";
const MATCHES_KEY = "padel_matches_v1";

let state = null;
let matchCount = 9;

function makeEmptyMatches(n) {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, a: "", b: "", score: "" }));
}

function now() { return Date.now(); }
function clamp(n, min, max) { n = Number(n); if (!Number.isFinite(n)) n = 0; return Math.max(min, Math.min(max, n)); }
function safeStr(v) { return String(v ?? "").trim(); }

function normalizeTournament(a, b, N) {
  N = clamp(N, 1, 9999); a = clamp(a, 0, N); b = clamp(b, 0, N);
  if (a + b > N) b = Math.max(0, N - a);
  return { N, a, b };
}

function sanitizePlayers(arr, count) {
  const n = count ?? (Array.isArray(arr) ? arr.length : 3);
  const base = Array.isArray(arr) ? arr : [];
  const out = [];
  for (let i = 0; i < n; i++) out.push(safeStr(base[i] ?? ""));
  return out;
}

function sanitizeMatches(arr, n) {
  const count = n ?? matchCount;
  const base = Array.isArray(arr) ? arr : makeEmptyMatches(count);
  const out = [];
  for (let i = 0; i < count; i++) {
    const m = base[i];
    out.push({ id: i + 1, a: safeStr(m?.a), b: safeStr(m?.b), score: safeStr(m?.score) });
  }
  return out;
}

function sanitizeFirstServer(v) { return v === "A" || v === "B" ? v : ""; }

function hasMeaningfulData(p) {
  if (!p || typeof p !== "object") return false;
  const teamNames = (safeStr(p.teamA) && safeStr(p.teamA) !== "Команда A") || (safeStr(p.teamB) && safeStr(p.teamB) !== "Команда B");
  const players = [...(Array.isArray(p.teamAPlayers) ? p.teamAPlayers : []), ...(Array.isArray(p.teamBPlayers) ? p.teamBPlayers : [])].some(Boolean);
  const score = Number(p?.a3 || 0) !== 0 || Number(p?.b3 || 0) !== 0;
  const matches = Array.isArray(p?.matches) && p.matches.some((m) => safeStr(m?.a) || safeStr(m?.b) || safeStr(m?.score));
  return teamNames || players || score || matches;
}

function loadLocal() { try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch(_) { return null; } }
function saveLocal(p) { try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch(_) {} }
function loadMatchesLocal() { try { const r = localStorage.getItem(MATCHES_KEY); if (!r) return null; const a = JSON.parse(r); return Array.isArray(a) ? a : null; } catch(_) { return null; } }
function saveMatchesLocal(m) { try { localStorage.setItem(MATCHES_KEY, JSON.stringify(m)); } catch(_) {} }

// ===================== ROSTER INPUTS =====================
let playerCountA = 3;
let playerCountB = 3;
let rosterValuesA = ["", "", ""];
let rosterValuesB = ["", "", ""];

function renderRosterInputs(team) {
  const count = team === "A" ? playerCountA : playerCountB;
  const values = team === "A" ? rosterValuesA : rosterValuesB;
  const container = $(`rosterInputs${team}`);
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const wrap = document.createElement("div");
    wrap.style.marginBottom = "8px";
    const label = document.createElement("label");
    label.textContent = `Команда ${team} — игрок ${i + 1}`;
    const input = document.createElement("input");
    input.value = values[i] ?? "";
    input.placeholder = `Игрок ${i + 1}`;
    input.dataset.team = team;
    input.dataset.idx = i;
    input.className = "rosterInput";
    input.addEventListener("input", () => {
      if (team === "A") rosterValuesA[i] = input.value;
      else rosterValuesB[i] = input.value;
      saveDraftOnly();
    });
    input.addEventListener("change", () => emitAll());
    wrap.appendChild(label);
    wrap.appendChild(input);
    container.appendChild(wrap);
  }
}

function setPlayerCount(team, n) {
  n = clamp(n, 1, 10);
  if (team === "A") {
    playerCountA = n;
    if ($("playerCountA")) $("playerCountA").value = n;
    rosterValuesA = sanitizePlayers(rosterValuesA, n);
    renderRosterInputs("A");
  } else {
    playerCountB = n;
    if ($("playerCountB")) $("playerCountB").value = n;
    rosterValuesB = sanitizePlayers(rosterValuesB, n);
    renderRosterInputs("B");
  }
  emitAll();
}

// ===================== TEAM TITLES =====================
function updateTeamRowTitles() {
  const aName = safeStr($("teamA")?.value) || "Команда A";
  const bName = safeStr($("teamB")?.value) || "Команда B";
  if ($("teamRowA")) $("teamRowA").textContent = aName;
  if ($("teamRowB")) $("teamRowB").textContent = bName;
  if ($("colTeamA")) $("colTeamA").textContent = aName;
  if ($("colTeamB")) $("colTeamB").textContent = bName;
}

function syncFirstServerCheckboxes(v) {
  const val = sanitizeFirstServer(v);
  if ($("firstServerA")) $("firstServerA").checked = val === "A";
  if ($("firstServerB")) $("firstServerB").checked = val === "B";
}

function getFirstServerFromUI() {
  if ($("firstServerA")?.checked) return "A";
  if ($("firstServerB")?.checked) return "B";
  return "";
}

// ===================== SCORE MODE UI =====================
function updateScoreModeUI(mode) {
  const tb = $("tournamentBlock"); const tnb = $("tennisBlock"); const mpw = $("maxPointsWrap");
  if (mode === "tennis") {
    if (tb) tb.style.display = "none";
    if (tnb) tnb.style.display = "block";
    if (mpw) mpw.style.display = "none";
  } else {
    if (tb) tb.style.display = "block";
    if (tnb) tnb.style.display = "none";
    if (mpw) mpw.style.display = "block";
  }
}

// ===================== MATCH COUNT =====================
function setMatchCount(n) {
  n = clamp(n, 1, 99);
  matchCount = n;
  if ($("matchCount")) $("matchCount").value = n;
  const current = Array.isArray(window.__matches) ? window.__matches : [];
  window.__matches = sanitizeMatches(current, n);
  renderAdminMatches(window.__matches);
  saveMatchesLocal(window.__matches);
  emitAll();
}

// ===================== MATCHES =====================
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
      <td><input data-k="score" data-i="${idx}" class="matchIn" placeholder="6:3" value="${m.score || ""}" /></td>`;
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
    const i = Number(el.getAttribute("data-i")); const k = el.getAttribute("data-k");
    if (!Number.isFinite(i) || !next[i]) return;
    next[i][k] = safeStr(el.value);
  });
  return sanitizeMatches(next);
}

function saveMatchToTable(scoreStr) {
  const matches = collectAdminMatches();
  const idx = matches.findIndex((m) => !safeStr(m.score));
  if (idx === -1) return;
  const teamAName = safeStr($("teamA")?.value) || "Команда A";
  const teamBName = safeStr($("teamB")?.value) || "Команда B";
  matches[idx].a = teamAName + " (Главный корт)";
  matches[idx].b = teamBName + " (судья)";
  matches[idx].score = scoreStr;
  window.__matches = matches;
  saveMatchesLocal(matches);
  renderAdminMatches(matches);
  emitAll();
  const h = $("matchesSavedHint");
  if (h) { h.textContent = "Счёт сохранён ✓"; setTimeout(() => { h.textContent = ""; }, 2000); }
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
  const matches = (Array.isArray(window.__matches) ? window.__matches : null) || loadMatchesLocal() || makeEmptyMatches(matchCount);
  const local = loadLocal();
  const scoreMode = $("scoreMode")?.value || "tournament";
  const ts = window.__tennisState || {};

  return {
    mode: "tournament",
    maxPoints: norm.N,
    hudBg: $("hudBg").value,
    teamA, teamB,
    teamAPlayers: sanitizePlayers(rosterValuesA, playerCountA),
    teamBPlayers: sanitizePlayers(rosterValuesB, playerCountB),
    teamAPlayerCount: playerCountA,
    teamBPlayerCount: playerCountB,
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
    goldenPointMode: isGoldenPointModeOn(),
  };
}

function saveDraftOnly() { saveLocal(buildPatchFromUI({ touchUpdatedAt: true })); }

function emitAll() {
  const patch = buildPatchFromUI({ touchUpdatedAt: true });
  const prev = loadLocal();
  if (!hasMeaningfulData(patch) && hasMeaningfulData(prev)) {
    fill(prev); window.__matches = sanitizeMatches(prev.matches || loadMatchesLocal() || makeEmptyMatches(matchCount)); renderAdminMatches(window.__matches); return;
  }
  saveLocal(patch); saveMatchesLocal(patch.matches);
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
  syncFirstServerCheckboxes(s.firstServer);
  if ($("showHud")) $("showHud").checked = s.hudVisible ?? true;
  if ($("goldenPointMode")) $("goldenPointMode").checked = !!s.goldenPointMode;
  goldenPending = null;
  hideGoldenBars();

  const scoreMode = s.scoreMode ?? "tournament";
  if ($("scoreMode")) $("scoreMode").value = scoreMode;
  if ($("tennisMaxGames")) $("tennisMaxGames").value = s.tennisMaxGames ?? 6;
  updateScoreModeUI(scoreMode);

  if (s.matchCount && Number(s.matchCount) > 0) {
    matchCount = Number(s.matchCount);
    if ($("matchCount")) $("matchCount").value = matchCount;
  }

  // Rosters
  playerCountA = Number(s.teamAPlayerCount ?? (Array.isArray(s.teamAPlayers) ? s.teamAPlayers.length : 3)) || 3;
  playerCountB = Number(s.teamBPlayerCount ?? (Array.isArray(s.teamBPlayers) ? s.teamBPlayers.length : 3)) || 3;
  rosterValuesA = sanitizePlayers(s.teamAPlayers, playerCountA);
  rosterValuesB = sanitizePlayers(s.teamBPlayers, playerCountB);
  if ($("playerCountA")) $("playerCountA").value = playerCountA;
  if ($("playerCountB")) $("playerCountB").value = playerCountB;
  renderRosterInputs("A");
  renderRosterInputs("B");

  loadTennisState(s);
  updateTennisUI();
  updateTeamRowTitles();
}

function applyDeltaRaw(team, delta) {
  const N = Number($("maxPoints")?.value ?? 11);
  const a = Number($("a3")?.value ?? 0); const b = Number($("b3")?.value ?? 0);
  if (team === "A") { const na = clamp(a + delta, 0, N); $("a3").value = na; $("b3").value = clamp(b, 0, N - na); }
  else { const nb = clamp(b + delta, 0, N); $("b3").value = nb; $("a3").value = clamp(a, 0, N - nb); }
  emitAll();
  return { prevA: a, prevB: b };
}

let goldenPending = null; // { prevA, prevB } — score before the tentative point that's awaiting confirmation

function isGoldenPointModeOn() {
  return !!($("goldenPointMode") && $("goldenPointMode").checked);
}

function hideGoldenBars() {
  if ($("goldenBar")) $("goldenBar").style.display = "none";
  if ($("goldenWhoWonBar")) $("goldenWhoWonBar").style.display = "none";
}

function showGoldenConfirmBar() {
  hideGoldenBars();
  if ($("goldenBar")) $("goldenBar").style.display = "flex";
}

function showGoldenWhoWonBar() {
  hideGoldenBars();
  const teamA = safeStr($("teamA")?.value) || "Команда A";
  const teamB = safeStr($("teamB")?.value) || "Команда B";
  if ($("goldenWinA")) $("goldenWinA").textContent = teamA;
  if ($("goldenWinB")) $("goldenWinB").textContent = teamB;
  if ($("goldenWhoWonBar")) $("goldenWhoWonBar").style.display = "flex";
}

function goldenCancel() {
  if (goldenPending) {
    if ($("a3")) $("a3").value = goldenPending.prevA;
    if ($("b3")) $("b3").value = goldenPending.prevB;
    emitAll();
  }
  goldenPending = null;
  hideGoldenBars();
}

function goldenPickWinner(team) {
  if (goldenPending) {
    if ($("a3")) $("a3").value = goldenPending.prevA;
    if ($("b3")) $("b3").value = goldenPending.prevB;
  }
  goldenPending = null;
  hideGoldenBars();
  applyDeltaRaw(team, +1);
}

function applyDelta(team, delta) {
  const prev = applyDeltaRaw(team, delta);
  if (isGoldenPointModeOn()) {
    goldenPending = prev;
    showGoldenConfirmBar();
  } else {
    goldenPending = null;
    hideGoldenBars();
  }
}

function applyBonus(team) {
  const N = Number($("maxPoints")?.value ?? 11);
  const a = Number($("a3")?.value ?? 0); const b = Number($("b3")?.value ?? 0);
  if (team === "A") { const na = clamp(a + 2, 0, N); $("a3").value = na; $("b3").value = clamp(b, 0, N - na); }
  else { const nb = clamp(b + 2, 0, N); $("b3").value = nb; $("a3").value = clamp(a, 0, N - nb); }
  emitAll();
}

function toggleFirstServer(team) {
  const next = team === "A" ? ($("firstServerA").checked ? "A" : "") : ($("firstServerB").checked ? "B" : "");
  syncFirstServerCheckboxes(next); saveDraftOnly(); emitAll();
}

// ===================== TENNIS =====================
const TENNIS_LABELS = ["0", "15", "30", "40"];

window.__tennisState = {
  tennisPointsA: 0, tennisPointsB: 0,
  tennisGamesA: 0, tennisGamesB: 0,
  tennisDeuce: false, tennisAdvA: false, tennisAdvB: false,
  tennisFirstServer: "",
};

function getCurrentTennisServer(ts) {
  const srv = ts.tennisFirstServer;
  if (srv !== "A" && srv !== "B") return "";
  const totalGames = ts.tennisGamesA + ts.tennisGamesB;
  // switches every game
  return (totalGames % 2 === 0) ? srv : (srv === "A" ? "B" : "A");
}

function tennisPointLabel(ts, team) {
  if (ts.tennisDeuce) { if (team === "A" && ts.tennisAdvA) return "AD"; if (team === "B" && ts.tennisAdvB) return "AD"; return "40"; }
  const pts = team === "A" ? ts.tennisPointsA : ts.tennisPointsB;
  return TENNIS_LABELS[pts] ?? "0";
}

function updateTennisUI() {
  const ts = window.__tennisState;
  if ($("tennisPointA")) $("tennisPointA").textContent = tennisPointLabel(ts, "A");
  if ($("tennisPointB")) $("tennisPointB").textContent = tennisPointLabel(ts, "B");
  if ($("tennisGamesA")) $("tennisGamesA").textContent = ts.tennisGamesA;
  if ($("tennisGamesB")) $("tennisGamesB").textContent = ts.tennisGamesB;
  if ($("tennisDeuceLabel")) $("tennisDeuceLabel").textContent = (ts.tennisDeuce && !ts.tennisAdvA && !ts.tennisAdvB) ? "DEUCE" : "";

  const teamA = safeStr($("teamA")?.value) || "Команда A";
  const teamB = safeStr($("teamB")?.value) || "Команда B";
  if ($("tennisTeamLabelA")) $("tennisTeamLabelA").textContent = teamA;
  if ($("tennisTeamLabelB")) $("tennisTeamLabelB").textContent = teamB;
  if ($("tennisServeLabelA")) $("tennisServeLabelA").textContent = teamA;
  if ($("tennisServeLabelB")) $("tennisServeLabelB").textContent = teamB;

  // Serve buttons active state
  const srv = ts.tennisFirstServer || "";
  if ($("tennisServeA")) $("tennisServeA").classList.toggle("active", srv === "A");
  if ($("tennisServeB")) $("tennisServeB").classList.toggle("active", srv === "B");
  if ($("tennisServeNone")) $("tennisServeNone").classList.toggle("active", srv === "");

  // Serve dots in scoreboard (shows who serves NOW)
  const currentServer = getCurrentTennisServer(ts);
  if ($("scoreDotA")) $("scoreDotA").classList.toggle("show", currentServer === "A");
  if ($("scoreDotB")) $("scoreDotB").classList.toggle("show", currentServer === "B");
  if ($("adminServeDotA")) $("adminServeDotA").classList.toggle("show", currentServer === "A");
  if ($("adminServeDotB")) $("adminServeDotB").classList.toggle("show", currentServer === "B");
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

function snapshotTennis() { return JSON.parse(JSON.stringify(window.__tennisState)); }

function showGameWinModal(winner, onConfirm, onCancel) {
  const teamName = winner === "A" ? (safeStr($("teamA")?.value) || "Команда A") : (safeStr($("teamB")?.value) || "Команда B");
  if ($("modalGameWinSub")) $("modalGameWinSub").textContent = `Гейм выиграла: ${teamName}`;
  const overlay = $("modalGameWin");
  if (overlay) overlay.classList.add("show");
  const yes = $("modalGameWinYes"); const no = $("modalGameWinNo");
  const cleanup = () => { if (overlay) overlay.classList.remove("show"); yes.onclick = null; no.onclick = null; };
  yes.onclick = () => { cleanup(); onConfirm(); };
  no.onclick = () => { cleanup(); onCancel(); };
}

function showMatchWinModal(winner, snapshotBeforeGame) {
  const ts = window.__tennisState;
  const teamA = safeStr($("teamA")?.value) || "Команда A";
  const teamB = safeStr($("teamB")?.value) || "Команда B";
  const winnerName = winner === "A" ? teamA : teamB;
  const scoreStr = `${ts.tennisGamesA}:${ts.tennisGamesB}`;
  if ($("modalMatchWinSub")) $("modalMatchWinSub").textContent = `Победила команда: ${winnerName} — ${scoreStr} геймов`;
  const overlay = $("modalMatchWin");
  if (overlay) overlay.classList.add("show");
  const saveBtn = $("modalMatchWinSave"); const cancelBtn = $("modalMatchWinCancel");
  const cleanup = () => { if (overlay) overlay.classList.remove("show"); saveBtn.onclick = null; cancelBtn.onclick = null; };
  saveBtn.onclick = () => {
    cleanup(); saveMatchToTable(scoreStr);
    window.__tennisState = { tennisPointsA:0,tennisPointsB:0,tennisGamesA:0,tennisGamesB:0,tennisDeuce:false,tennisAdvA:false,tennisAdvB:false,tennisFirstServer:ts.tennisFirstServer||"" };
    updateTennisUI(); emitAll();
  };
  cancelBtn.onclick = () => {
    cleanup();
    if (snapshotBeforeGame) { window.__tennisState = snapshotBeforeGame; updateTennisUI(); emitAll(); }
  };
}

function checkMatchWin(winner, snapshotBeforeGame) {
  const maxG = clamp(Number($("tennisMaxGames")?.value ?? 6), 1, 99);
  const ts = window.__tennisState;
  if (ts.tennisGamesA + ts.tennisGamesB >= maxG) showMatchWinModal(ts.tennisGamesA > ts.tennisGamesB ? "A" : "B", snapshotBeforeGame);
}

function doWinGame(winner, snapshotBeforeGame) {
  const ts = window.__tennisState;
  if (winner === "A") ts.tennisGamesA += 1; else ts.tennisGamesB += 1;
  ts.tennisPointsA = 0; ts.tennisPointsB = 0;
  ts.tennisDeuce = false; ts.tennisAdvA = false; ts.tennisAdvB = false;
  updateTennisUI(); emitAll();
  checkMatchWin(winner, snapshotBeforeGame);
}

function tennisScorePoint(winner) {
  const ts = window.__tennisState;
  if (ts.tennisDeuce) {
    if (ts.tennisAdvA || ts.tennisAdvB) {
      if ((winner === "A" && ts.tennisAdvA) || (winner === "B" && ts.tennisAdvB)) {
        const snapshot = snapshotTennis();
        showGameWinModal(winner, () => { doWinGame(winner, snapshot); }, () => { window.__tennisState = snapshot; updateTennisUI(); emitAll(); });
        return;
      } else { ts.tennisAdvA = false; ts.tennisAdvB = false; }
    } else { if (winner === "A") ts.tennisAdvA = true; else ts.tennisAdvB = true; }
    updateTennisUI(); emitAll(); return;
  }
  const snapshot = snapshotTennis();
  if (winner === "A") ts.tennisPointsA = clamp(ts.tennisPointsA + 1, 0, 4);
  else ts.tennisPointsB = clamp(ts.tennisPointsB + 1, 0, 4);
  if (ts.tennisPointsA === 3 && ts.tennisPointsB === 3) { ts.tennisDeuce = true; ts.tennisAdvA = false; ts.tennisAdvB = false; updateTennisUI(); emitAll(); return; }
  if (ts.tennisPointsA >= 4 || ts.tennisPointsB >= 4) {
    const w = ts.tennisPointsA >= 4 ? "A" : "B";
    showGameWinModal(w, () => { doWinGame(w, snapshot); }, () => { window.__tennisState = snapshot; updateTennisUI(); emitAll(); });
    return;
  }
  updateTennisUI(); emitAll();
}

function tennisRemovePoint(team) {
  const ts = window.__tennisState;
  if (ts.tennisDeuce) {
    if (ts.tennisAdvA || ts.tennisAdvB) { ts.tennisAdvA = false; ts.tennisAdvB = false; }
    else { ts.tennisDeuce = false; if (team === "A") ts.tennisPointsA = 2; else ts.tennisPointsB = 2; }
    updateTennisUI(); emitAll(); return;
  }
  if (team === "A") ts.tennisPointsA = clamp(ts.tennisPointsA - 1, 0, 3);
  else ts.tennisPointsB = clamp(ts.tennisPointsB - 1, 0, 3);
  updateTennisUI(); emitAll();
}

function tennisResetAll() {
  const srv = window.__tennisState.tennisFirstServer || "";
  window.__tennisState = { tennisPointsA:0,tennisPointsB:0,tennisGamesA:0,tennisGamesB:0,tennisDeuce:false,tennisAdvA:false,tennisAdvB:false,tennisFirstServer:srv };
  updateTennisUI(); emitAll();
}

// ===================== BOOT =====================
const bootLocal = loadLocal();
if (bootLocal?.matchCount) { matchCount = Number(bootLocal.matchCount) || 9; if ($("matchCount")) $("matchCount").value = matchCount; }

// Init roster inputs
playerCountA = Number(bootLocal?.teamAPlayerCount ?? (Array.isArray(bootLocal?.teamAPlayers) ? bootLocal.teamAPlayers.length : 3)) || 3;
playerCountB = Number(bootLocal?.teamBPlayerCount ?? (Array.isArray(bootLocal?.teamBPlayers) ? bootLocal.teamBPlayers.length : 3)) || 3;
rosterValuesA = sanitizePlayers(bootLocal?.teamAPlayers, playerCountA);
rosterValuesB = sanitizePlayers(bootLocal?.teamBPlayers, playerCountB);
if ($("playerCountA")) $("playerCountA").value = playerCountA;
if ($("playerCountB")) $("playerCountB").value = playerCountB;
renderRosterInputs("A");
renderRosterInputs("B");

const bootLocalMatches = loadMatchesLocal();
if (bootLocalMatches) { window.__matches = sanitizeMatches(bootLocalMatches); renderAdminMatches(window.__matches); }
else { window.__matches = makeEmptyMatches(matchCount); renderAdminMatches(window.__matches); }

if (bootLocal && hasMeaningfulData(bootLocal)) {
  fill(bootLocal);
  loadTennisState(bootLocal); updateTennisUI();
  window.__matches = sanitizeMatches(bootLocal.matches || loadMatchesLocal() || makeEmptyMatches(matchCount));
  renderAdminMatches(window.__matches);
}

// ===================== SOCKET =====================
socket.on("connect", () => { socket.emit("getState"); });
socket.on("state", (s) => {
  state = s || {};
  const local = loadLocal();
  const sAt = Number(state.updatedAt || 0); const lAt = Number(local?.updatedAt || 0);
  if (local && hasMeaningfulData(local) && (!hasMeaningfulData(state) || (lAt && lAt > sAt))) {
    socket.emit("setState", { ...local, updatedAt: local.updatedAt || now() }); return;
  }
  fill(state); loadTennisState(state); updateTennisUI();
  const useMatches = (Array.isArray(state.matches) && state.matches.length ? state.matches : null) || loadMatchesLocal() || makeEmptyMatches(matchCount);
  window.__matches = sanitizeMatches(useMatches); renderAdminMatches(window.__matches); saveMatchesLocal(window.__matches);
  saveLocal({ ...buildPatchFromUI({ touchUpdatedAt: false }), ...state, matches: window.__matches, updatedAt: sAt || now() });
});

// ===================== EVENTS =====================
if ($("apply")) $("apply").addEventListener("click", emitAll);
if ($("reset")) $("reset").addEventListener("click", () => { socket.emit("reset"); setTimeout(() => socket.emit("getState"), 200); });
if ($("aPlus")) $("aPlus").addEventListener("click", () => applyDelta("A", +1));
if ($("aMinus")) $("aMinus").addEventListener("click", () => applyDelta("A", -1));
if ($("bPlus")) $("bPlus").addEventListener("click", () => applyDelta("B", +1));
if ($("bMinus")) $("bMinus").addEventListener("click", () => applyDelta("B", -1));
if ($("aBonus")) $("aBonus").addEventListener("click", () => applyBonus("A"));
if ($("bBonus")) $("bBonus").addEventListener("click", () => applyBonus("B"));

if ($("goldenPointMode")) $("goldenPointMode").addEventListener("change", () => {
  goldenPending = null;
  hideGoldenBars();
  saveDraftOnly();
  emitAll();
});
if ($("goldenCancelBtn")) $("goldenCancelBtn").addEventListener("click", goldenCancel);
if ($("goldenConfirmBtn")) $("goldenConfirmBtn").addEventListener("click", showGoldenWhoWonBar);
if ($("goldenWinA")) $("goldenWinA").addEventListener("click", () => goldenPickWinner("A"));
if ($("goldenWinB")) $("goldenWinB").addEventListener("click", () => goldenPickWinner("B"));
if ($("firstServerA")) $("firstServerA").addEventListener("change", () => toggleFirstServer("A"));
if ($("firstServerB")) $("firstServerB").addEventListener("change", () => toggleFirstServer("B"));
if ($("scoreMode")) $("scoreMode").addEventListener("change", () => { updateScoreModeUI($("scoreMode").value); emitAll(); });
if ($("tennisMaxGames")) $("tennisMaxGames").addEventListener("change", emitAll);
if ($("tennisAPlus")) $("tennisAPlus").addEventListener("click", () => tennisScorePoint("A"));
if ($("tennisAMinus")) $("tennisAMinus").addEventListener("click", () => tennisRemovePoint("A"));
if ($("tennisBPlus")) $("tennisBPlus").addEventListener("click", () => tennisScorePoint("B"));
if ($("tennisBMinus")) $("tennisBMinus").addEventListener("click", () => tennisRemovePoint("B"));
if ($("tennisReset")) $("tennisReset").addEventListener("click", tennisResetAll);
if ($("tennisServeA")) $("tennisServeA").addEventListener("click", () => { window.__tennisState.tennisFirstServer = "A"; updateTennisUI(); emitAll(); });
if ($("tennisServeB")) $("tennisServeB").addEventListener("click", () => { window.__tennisState.tennisFirstServer = "B"; updateTennisUI(); emitAll(); });
if ($("tennisServeNone")) $("tennisServeNone").addEventListener("click", () => { window.__tennisState.tennisFirstServer = ""; updateTennisUI(); emitAll(); });

if ($("playerCountA")) $("playerCountA").addEventListener("change", () => setPlayerCount("A", Number($("playerCountA").value)));
if ($("playerCountB")) $("playerCountB").addEventListener("change", () => setPlayerCount("B", Number($("playerCountB").value)));
if ($("playerCountAPlus")) $("playerCountAPlus").addEventListener("click", () => setPlayerCount("A", playerCountA + 1));
if ($("playerCountAMinus")) $("playerCountAMinus").addEventListener("click", () => setPlayerCount("A", playerCountA - 1));
if ($("playerCountBPlus")) $("playerCountBPlus").addEventListener("click", () => setPlayerCount("B", playerCountB + 1));
if ($("playerCountBMinus")) $("playerCountBMinus").addEventListener("click", () => setPlayerCount("B", playerCountB - 1));

if ($("matchCount")) $("matchCount").addEventListener("change", () => setMatchCount(Number($("matchCount").value)));
if ($("matchCountPlus")) $("matchCountPlus").addEventListener("click", () => setMatchCount(matchCount + 1));
if ($("matchCountMinus")) $("matchCountMinus").addEventListener("click", () => setMatchCount(matchCount - 1));

["teamA","teamB","maxPoints","hudPosition","hudBg","a3","b3"].forEach((id) => {
  const el = $(id); if (!el) return;
  el.addEventListener("input", () => saveDraftOnly());
  el.addEventListener("change", () => emitAll());
});
["teamA","teamB"].forEach((id) => { const el=$(id); if(el) el.addEventListener("input", () => { updateTeamRowTitles(); updateTennisUI(); }); });
if ($("showHud")) $("showHud").addEventListener("change", emitAll);
const previewBox=$("previewBox"); const showPreview=$("showPreview");
if (previewBox && showPreview) showPreview.addEventListener("change", (e) => previewBox.classList.toggle("show", e.target.checked));

const saveBtn = $("saveMatches");
if (saveBtn) saveBtn.addEventListener("click", (e) => {
  e.preventDefault(); e.stopPropagation();
  const matches = collectAdminMatches(); window.__matches = matches; saveMatchesLocal(matches); emitAll();
  const h = $("matchesSavedHint"); if (h) { h.textContent = "Сохранено ✓"; setTimeout(() => { h.textContent=""; }, 1500); }
});

const clearBtn = $("clearMatches");
if (clearBtn) clearBtn.addEventListener("click", (e) => {
  e.preventDefault();
  const cleared = makeEmptyMatches(matchCount); window.__matches = cleared; saveMatchesLocal(cleared); renderAdminMatches(cleared); emitAll();
});

setInterval(() => {
  try { const local = loadLocal(); if (local && hasMeaningfulData(local)) socket.emit("setState", { ...local, updatedAt: local.updatedAt || Date.now() }); } catch(_) {}
}, 5000);
