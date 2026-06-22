const socket = io();
const $ = (id) => document.getElementById(id);

const LS_KEY = "padel_hud_state_v1";
const MATCHES_KEY = "padel_matches_v1";

let state = null;

const DEFAULT_MATCHES = Array.from({ length: 9 }, (_, i) => ({
  id: i + 1,
  a: "",
  b: "",
  score: "",
}));

function now() {
  return Date.now();
}

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

function safeStr(v) {
  return String(v ?? "").trim();
}

function sanitizePlayers(arr) {
  const base = Array.isArray(arr) ? arr : ["", "", ""];
  const out = [base[0], base[1], base[2]].map(safeStr);
  while (out.length < 3) out.push("");
  return out.slice(0, 3);
}

function sanitizeMatches(arr) {
  const base = Array.isArray(arr) ? arr : DEFAULT_MATCHES;
  const out = base.slice(0, 9).map((m, i) => ({
    id: i + 1,
    a: safeStr(m?.a),
    b: safeStr(m?.b),
    score: safeStr(m?.score),
  }));
  while (out.length < 9) out.push({ id: out.length + 1, a: "", b: "", score: "" });
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
  const matches = Array.isArray(p?.matches)
    && p.matches.some((m) => safeStr(m?.a) || safeStr(m?.b) || safeStr(m?.score));

  return teamNames || players || score || serving || matches;
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function saveLocal(patch) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(patch));
  } catch (_) {}
}

function loadMatchesLocal() {
  try {
    const raw = localStorage.getItem(MATCHES_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch (_) {
    return null;
  }
}

function saveMatchesLocal(matches) {
  try {
    localStorage.setItem(MATCHES_KEY, JSON.stringify(matches));
  } catch (_) {}
}

function updateTeamRowTitles() {
  const aName = safeStr($("teamA").value) || "Команда A";
  const bName = safeStr($("teamB").value) || "Команда B";

  $("teamRowA").textContent = aName;
  $("teamRowB").textContent = bName;

  const colA = $("colTeamA");
  const colB = $("colTeamB");

  if (colA) colA.textContent = aName;
  if (colB) colB.textContent = bName;
}

function syncFirstServerCheckboxes(firstServer) {
  const value = sanitizeFirstServer(firstServer);
  $("firstServerA").checked = value === "A";
  $("firstServerB").checked = value === "B";
}

function getFirstServerFromUI() {
  if ($("firstServerA").checked) return "A";
  if ($("firstServerB").checked) return "B";
  return "";
}

function fill(s) {
  $("teamA").value = s.teamA ?? "";
  $("teamB").value = s.teamB ?? "";
  $("maxPoints").value = s.maxPoints ?? 11;
  $("hudPosition").value = s.hudPosition ?? "tl";
  $("hudBg").value = s.hudBg ?? "transparent";

  $("a3").value = s.a3 ?? 0;
  $("b3").value = s.b3 ?? 0;

  const aP = sanitizePlayers(s.teamAPlayers);
  const bP = sanitizePlayers(s.teamBPlayers);

  $("aP1").value = aP[0];
  $("aP2").value = aP[1];
  $("aP3").value = aP[2];
  $("bP1").value = bP[0];
  $("bP2").value = bP[1];
  $("bP3").value = bP[2];

  syncFirstServerCheckboxes(s.firstServer);

  if ($("showHud")) {
    $("showHud").checked = s.hudVisible ?? true;
  }

  // Tennis mode
  const scoreMode = s.scoreMode ?? "tournament";
  if ($("scoreMode")) $("scoreMode").value = scoreMode;
  if ($("tennisMaxGames")) $("tennisMaxGames").value = s.tennisMaxGames ?? 6;

  updateTennisPanelVisibility(scoreMode);
  updateTennisUI(s);

  updateTeamRowTitles();
}

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
      <td><input data-k="score" data-i="${idx}" class="matchIn" placeholder="21:17" value="${m.score || ""}" /></td>
    `;
    body.appendChild(tr);

    tr.querySelectorAll(".matchIn").forEach((el) => {
      el.addEventListener("input", () => {
        window.__matches = collectAdminMatches();
        saveMatchesLocal(window.__matches);
        saveDraftOnly();
      });

      el.addEventListener("change", () => {
        window.__matches = collectAdminMatches();
        saveMatchesLocal(window.__matches);
        saveDraftOnly();
      });
    });
  });
}

function collectAdminMatches() {
  const body = $("adminMatchesBody");
  if (!body) return DEFAULT_MATCHES;

  const base = Array.isArray(window.__matches) ? window.__matches : DEFAULT_MATCHES;
  const next = base.map((x) => ({ ...x }));

  body.querySelectorAll(".matchIn").forEach((el) => {
    const i = Number(el.getAttribute("data-i"));
    const k = el.getAttribute("data-k");

    if (!Number.isFinite(i) || !next[i]) return;
    next[i][k] = safeStr(el.value);
  });

  return sanitizeMatches(next);
}

function buildPatchFromUI({ touchUpdatedAt } = { touchUpdatedAt: true }) {
  const rawN = $("maxPoints").value;
  const rawA = $("a3").value;
  const rawB = $("b3").value;

  const norm = normalizeTournament(rawA, rawB, rawN);

  $("maxPoints").value = norm.N;
  $("a3").value = norm.a;
  $("b3").value = norm.b;

  updateTeamRowTitles();

  const teamA = safeStr($("teamA").value) || "Команда A";
  const teamB = safeStr($("teamB").value) || "Команда B";

  const teamAPlayers = sanitizePlayers([$("aP1").value, $("aP2").value, $("aP3").value]);
  const teamBPlayers = sanitizePlayers([$("bP1").value, $("bP2").value, $("bP3").value]);

  const matches =
    (Array.isArray(window.__matches) ? window.__matches : null) ||
    loadMatchesLocal() ||
    DEFAULT_MATCHES;

  const local = loadLocal();

  const scoreMode = ($("scoreMode") ? $("scoreMode").value : null) || "tournament";
  const tennisState = window.__tennisState || {
    tennisPointsA: 0, tennisPointsB: 0,
    tennisGamesA: 0, tennisGamesB: 0,
    tennisDeuce: false, tennisAdvA: false, tennisAdvB: false,
  };

  return {
    mode: "tournament",
    maxPoints: norm.N,
    hudBg: $("hudBg").value,
    teamA,
    teamB,
    teamAPlayers,
    teamBPlayers,
    hudPosition: $("hudPosition").value,
    a3: norm.a,
    b3: norm.b,
    hudVisible: $("showHud") ? $("showHud").checked : true,
    firstServer: getFirstServerFromUI(),
    matches: sanitizeMatches(matches),
    updatedAt: touchUpdatedAt ? now() : Number(local?.updatedAt || 0) || now(),
    scoreMode,
    tennisMaxGames: $("tennisMaxGames") ? clamp(Number($("tennisMaxGames").value), 1, 99) : 6,
    ...tennisState,
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
    window.__matches = sanitizeMatches(prev.matches || loadMatchesLocal() || DEFAULT_MATCHES);
    renderAdminMatches(window.__matches);
    return;
  }

  saveLocal(patch);
  saveMatchesLocal(patch.matches);
  socket.emit("setState", patch);
}

function applyDelta(team, delta) {
  const N = Number($("maxPoints").value ?? 11);
  const a = Number($("a3").value ?? 0);
  const b = Number($("b3").value ?? 0);

  if (team === "A") {
    const na = clamp(a + delta, 0, N);
    const nb = clamp(b, 0, N - na);
    $("a3").value = na;
    $("b3").value = nb;
    emitAll();
    return;
  }

  const nb = clamp(b + delta, 0, N);
  const na = clamp(a, 0, N - nb);
  $("a3").value = na;
  $("b3").value = nb;
  emitAll();
}

function applyBonus(team) {
  const N = Number($("maxPoints").value ?? 11);
  const a = Number($("a3").value ?? 0);
  const b = Number($("b3").value ?? 0);

  if (team === "A") {
    const na = clamp(a + 2, 0, N);
    const nb = clamp(b, 0, N - na);
    $("a3").value = na;
    $("b3").value = nb;
    emitAll();
    return;
  }

  const nb = clamp(b + 2, 0, N);
  const na = clamp(a, 0, N - nb);
  $("a3").value = na;
  $("b3").value = nb;
  emitAll();
}

function toggleFirstServer(team) {
  if (team === "A") {
    const next = $("firstServerA").checked ? "A" : "";
    syncFirstServerCheckboxes(next);
  } else {
    const next = $("firstServerB").checked ? "B" : "";
    syncFirstServerCheckboxes(next);
  }

  saveDraftOnly();
  emitAll();
}

// ===================== TENNIS LOGIC =====================

const TENNIS_LABELS = ["0", "15", "30", "40"];

window.__tennisState = {
  tennisPointsA: 0, tennisPointsB: 0,
  tennisGamesA: 0, tennisGamesB: 0,
  tennisDeuce: false, tennisAdvA: false, tennisAdvB: false,
};

function updateTennisPanelVisibility(mode) {
  const wrap = $("tennisPanelWrap");
  if (!wrap) return;
  wrap.style.display = mode === "tennis" ? "block" : "none";
}

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
  const elA = $("tennisPointA");
  const elB = $("tennisPointB");
  const elGA = $("tennisGamesA");
  const elGB = $("tennisGamesB");
  const elDeuce = $("tennisDeuceLabel");
  const elLabelA = $("tennisTeamLabelA");
  const elLabelB = $("tennisTeamLabelB");

  if (elA) elA.textContent = tennisPointLabel(ts, "A");
  if (elB) elB.textContent = tennisPointLabel(ts, "B");
  if (elGA) elGA.textContent = ts.tennisGamesA;
  if (elGB) elGB.textContent = ts.tennisGamesB;

  if (elDeuce) {
    elDeuce.textContent = (ts.tennisDeuce && !ts.tennisAdvA && !ts.tennisAdvB) ? "DEUCE" : "";
  }

  const teamA = safeStr($("teamA")?.value) || "Команда A";
  const teamB = safeStr($("teamB")?.value) || "Команда B";
  if (elLabelA) elLabelA.textContent = teamA;
  if (elLabelB) elLabelB.textContent = teamB;
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
  };
}

function tennisWinGame(winner) {
  const ts = window.__tennisState;
  if (winner === "A") ts.tennisGamesA += 1;
  else ts.tennisGamesB += 1;
  ts.tennisPointsA = 0;
  ts.tennisPointsB = 0;
  ts.tennisDeuce = false;
  ts.tennisAdvA = false;
  ts.tennisAdvB = false;
  updateTennisUI();
  emitAll();
}

function tennisScorePoint(winner) {
  const ts = window.__tennisState;

  if (ts.tennisDeuce) {
    if (ts.tennisAdvA || ts.tennisAdvB) {
      if ((winner === "A" && ts.tennisAdvA) || (winner === "B" && ts.tennisAdvB)) {
        tennisWinGame(winner);
        return;
      } else {
        ts.tennisAdvA = false;
        ts.tennisAdvB = false;
      }
    } else {
      if (winner === "A") ts.tennisAdvA = true;
      else ts.tennisAdvB = true;
    }
    updateTennisUI();
    emitAll();
    return;
  }

  if (winner === "A") ts.tennisPointsA = clamp(ts.tennisPointsA + 1, 0, 4);
  else ts.tennisPointsB = clamp(ts.tennisPointsB + 1, 0, 4);

  if (ts.tennisPointsA === 3 && ts.tennisPointsB === 3) {
    ts.tennisDeuce = true;
    ts.tennisAdvA = false;
    ts.tennisAdvB = false;
    updateTennisUI();
    emitAll();
    return;
  }

  if (ts.tennisPointsA >= 4) { tennisWinGame("A"); return; }
  if (ts.tennisPointsB >= 4) { tennisWinGame("B"); return; }

  updateTennisUI();
  emitAll();
}

function tennisRemovePoint(team) {
  const ts = window.__tennisState;

  if (ts.tennisDeuce) {
    if (ts.tennisAdvA || ts.tennisAdvB) {
      ts.tennisAdvA = false;
      ts.tennisAdvB = false;
    } else {
      ts.tennisDeuce = false;
      if (team === "A") ts.tennisPointsA = 2;
      else ts.tennisPointsB = 2;
    }
    updateTennisUI();
    emitAll();
    return;
  }

  if (team === "A") ts.tennisPointsA = clamp(ts.tennisPointsA - 1, 0, 3);
  else ts.tennisPointsB = clamp(ts.tennisPointsB - 1, 0, 3);

  updateTennisUI();
  emitAll();
}

function tennisResetAll() {
  window.__tennisState = {
    tennisPointsA: 0, tennisPointsB: 0,
    tennisGamesA: 0, tennisGamesB: 0,
    tennisDeuce: false, tennisAdvA: false, tennisAdvB: false,
  };
  updateTennisUI();
  emitAll();
}

// ===================== END TENNIS =====================

const bootLocalMatches = loadMatchesLocal();
if (bootLocalMatches) {
  window.__matches = sanitizeMatches(bootLocalMatches);
  renderAdminMatches(window.__matches);
} else {
  window.__matches = DEFAULT_MATCHES.map((m) => ({ ...m }));
  renderAdminMatches(window.__matches);
}

const bootLocal = loadLocal();
if (bootLocal && hasMeaningfulData(bootLocal)) {
  fill(bootLocal);
  window.__matches = sanitizeMatches(bootLocal.matches || loadMatchesLocal() || DEFAULT_MATCHES);
  renderAdminMatches(window.__matches);
}

socket.on("connect", () => {
  socket.emit("getState");
});

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
  const useMatches =
    (serverMatches && serverMatches.length ? serverMatches : null) ||
    loadMatchesLocal() ||
    DEFAULT_MATCHES;

  window.__matches = sanitizeMatches(useMatches);
  renderAdminMatches(window.__matches);
  saveMatchesLocal(window.__matches);

  const patchForLocal = {
    ...buildPatchFromUI({ touchUpdatedAt: false }),
    ...state,
    matches: window.__matches,
    updatedAt: sAt || now(),
  };

  saveLocal(patchForLocal);
});

$("apply").addEventListener("click", emitAll);

$("reset").addEventListener("click", () => {
  socket.emit("reset");
  setTimeout(() => socket.emit("getState"), 200);
});

$("aPlus").addEventListener("click", () => applyDelta("A", +1));
$("aMinus").addEventListener("click", () => applyDelta("A", -1));
$("bPlus").addEventListener("click", () => applyDelta("B", +1));
$("bMinus").addEventListener("click", () => applyDelta("B", -1));

$("aBonus").addEventListener("click", () => applyBonus("A"));
$("bBonus").addEventListener("click", () => applyBonus("B"));

$("firstServerA").addEventListener("change", () => toggleFirstServer("A"));
$("firstServerB").addEventListener("change", () => toggleFirstServer("B"));

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
  if (!el) return;
  el.addEventListener("input", updateTeamRowTitles);
});

if ($("showHud")) {
  $("showHud").addEventListener("change", emitAll);
}

const previewBox = $("previewBox");
const showPreview = $("showPreview");

if (previewBox && showPreview) {
  showPreview.addEventListener("change", (e) => {
    previewBox.classList.toggle("show", e.target.checked);
  });
}

const saveBtn = $("saveMatches");
if (saveBtn) {
  saveBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const matches = collectAdminMatches();
    window.__matches = matches;
    saveMatchesLocal(matches);
    emitAll();

    const hintEl = $("matchesSavedHint");
    if (hintEl) {
      hintEl.textContent = "Сохранено ✓";
      setTimeout(() => {
        hintEl.textContent = "";
      }, 1500);
    }
  });
}

const clearBtn = $("clearMatches");
if (clearBtn) {
  clearBtn.addEventListener("click", (e) => {
    e.preventDefault();

    const cleared = DEFAULT_MATCHES.map((m) => ({ ...m }));
    window.__matches = cleared;
    saveMatchesLocal(cleared);
    renderAdminMatches(cleared);
    emitAll();
  });
}

// ===================== TENNIS EVENT HANDLERS =====================

if ($("scoreMode")) {
  $("scoreMode").addEventListener("change", () => {
    const mode = $("scoreMode").value;
    updateTennisPanelVisibility(mode);
    emitAll();
  });
}

if ($("tennisMaxGames")) {
  $("tennisMaxGames").addEventListener("change", emitAll);
}

if ($("tennisAPlus")) {
  $("tennisAPlus").addEventListener("click", () => tennisScorePoint("A"));
}
if ($("tennisAMinus")) {
  $("tennisAMinus").addEventListener("click", () => tennisRemovePoint("A"));
}
if ($("tennisBPlus")) {
  $("tennisBPlus").addEventListener("click", () => tennisScorePoint("B"));
}
if ($("tennisBMinus")) {
  $("tennisBMinus").addEventListener("click", () => tennisRemovePoint("B"));
}
if ($("tennisReset")) {
  $("tennisReset").addEventListener("click", tennisResetAll);
}

// ===================== END TENNIS HANDLERS =====================

// временный фикс: если админка открыта, раз в 5 сек поднимаем актуальный state на сервер
setInterval(() => {
  try {
    const local = loadLocal();
    if (local && hasMeaningfulData(local)) {
      socket.emit("setState", {
        ...local,
        updatedAt: local.updatedAt || Date.now()
      });
    }
  } catch (_) {}
}, 5000);