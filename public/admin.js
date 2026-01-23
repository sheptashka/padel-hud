const socket = io();
const $ = (id) => document.getElementById(id);

const LS_KEY = "padel_hud_state_v1";
const MATCHES_KEY = "padel_matches_v2";
let state = null;

const DEFAULT_MATCHES = Array.from({ length: 9 }, (_, i) => ({
  id: i + 1,
  a: "",
  b: "",
  score: "",
  winner: ""
}));

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

function parseScore(score){
  if(!score) return null;
  const s = String(score).trim();
  const m = s.match(/^(\d+)\s*[:\-]\s*(\d+)$/);
  if(!m) return null;
  return { a: Number(m[1]), b: Number(m[2]) };
}

function computeWinnerFromScore(score){
  const sc = parseScore(score);
  if(!sc) return "";
  if(sc.a === sc.b) return "";
  return sc.a > sc.b ? "A" : "B";
}

function saveLocal(patch) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(patch)); } catch (_) {}
}
function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) { return null; }
}

function loadMatchesLocal() {
  try {
    const raw = localStorage.getItem(MATCHES_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch (_) { return null; }
}
function saveMatchesLocal(matches) {
  try { localStorage.setItem(MATCHES_KEY, JSON.stringify(matches)); } catch (_) {}
}

function getTeamAName() {
  return ($("teamA").value || "Команда A").trim() || "Команда A";
}
function getTeamBName() {
  return ($("teamB").value || "Команда B").trim() || "Команда B";
}

function escapeAttr(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function updateTeamRowTitles() {
  const aName = getTeamAName();
  const bName = getTeamBName();

  $("teamRowA").textContent = aName;
  $("teamRowB").textContent = bName;

  const colA = $("colTeamA");
  const colB = $("colTeamB");
  if (colA) colA.textContent = aName;
  if (colB) colB.textContent = bName;

  const aPH = `${aName} (пара/игроки)`;
  const bPH = `${bName} (пара/игроки)`;
  document.querySelectorAll('input.matchIn[data-k="a"]').forEach((el) => { el.placeholder = aPH; });
  document.querySelectorAll('input.matchIn[data-k="b"]').forEach((el) => { el.placeholder = bPH; });
}

function fill(s) {
  $("teamA").value = s.teamA ?? "";
  $("teamB").value = s.teamB ?? "";
  $("maxPoints").value = s.maxPoints ?? 11;
  $("hudPosition").value = s.hudPosition ?? "tl";
  $("hudBg").value = s.hudBg ?? "transparent";

  $("a3").value = s.a3 ?? 0;
  $("b3").value = s.b3 ?? 0;

  if ($("showHud")) $("showHud").checked = (s.hudVisible ?? true);

  const rA = Array.isArray(s.rosterA) ? s.rosterA : ["","",""];
  const rB = Array.isArray(s.rosterB) ? s.rosterB : ["","",""];

  if ($("playerA1")) $("playerA1").value = rA[0] ?? "";
  if ($("playerA2")) $("playerA2").value = rA[1] ?? "";
  if ($("playerA3")) $("playerA3").value = rA[2] ?? "";

  if ($("playerB1")) $("playerB1").value = rB[0] ?? "";
  if ($("playerB2")) $("playerB2").value = rB[1] ?? "";
  if ($("playerB3")) $("playerB3").value = rB[2] ?? "";

  updateTeamRowTitles();
}

function buildPatchFromUI() {
  const rawN = $("maxPoints").value;
  const rawA = $("a3").value;
  const rawB = $("b3").value;

  const norm = normalizeTournament(rawA, rawB, rawN);

  $("maxPoints").value = norm.N;
  $("a3").value = norm.a;
  $("b3").value = norm.b;

  updateTeamRowTitles();

  return {
    mode: "tournament",
    maxPoints: norm.N,
    hudBg: $("hudBg").value,
    teamA: $("teamA").value.trim() || "TEAM A",
    teamB: $("teamB").value.trim() || "TEAM B",
    hudPosition: $("hudPosition").value,
    a3: norm.a,
    b3: norm.b,
    hudVisible: $("showHud") ? $("showHud").checked : true,

    rosterA: [
      ($("playerA1")?.value || "").trim(),
      ($("playerA2")?.value || "").trim(),
      ($("playerA3")?.value || "").trim(),
    ],
    rosterB: [
      ($("playerB1")?.value || "").trim(),
      ($("playerB2")?.value || "").trim(),
      ($("playerB3")?.value || "").trim(),
    ],
  };
}

function emitAll() {
  const patch = buildPatchFromUI();
  saveLocal(patch);
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
    const patch = { mode: "tournament", maxPoints: N, a3: na, b3: nb };
    saveLocal({ ...buildPatchFromUI(), ...patch });
    socket.emit("setState", patch);
    return;
  }

  const nb = clamp(b + delta, 0, N);
  const na = clamp(a, 0, N - nb);
  $("a3").value = na;
  $("b3").value = nb;
  const patch = { mode: "tournament", maxPoints: N, a3: na, b3: nb };
  saveLocal({ ...buildPatchFromUI(), ...patch });
  socket.emit("setState", patch);
}

// ===== Matches =====

function normalizeMatches(arr) {
  if (!Array.isArray(arr) || !arr.length) return DEFAULT_MATCHES.map((m) => ({ ...m }));
  return arr.map((m, i) => ({
    id: m.id ?? (i + 1),
    a: (m.a ?? "").trim(),
    b: (m.b ?? "").trim(),
    score: (m.score ?? "").trim(),
    winner: "" // победителя считаем автоматически
  }));
}

function renderAdminMatches(matches) {
  const body = $("adminMatchesBody");
  if (!body) return;
  body.innerHTML = "";

  const aName = getTeamAName();
  const bName = getTeamBName();

  matches.forEach((m, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>

      <td>
        <input
          data-k="a" data-i="${idx}"
          class="matchIn"
          value="${escapeAttr(m.a || "")}"
          placeholder="${escapeAttr(aName)} (пара/игроки)"
        />
      </td>

      <td>
        <input
          data-k="b" data-i="${idx}"
          class="matchIn"
          value="${escapeAttr(m.b || "")}"
          placeholder="${escapeAttr(bName)} (пара/игроки)"
        />
      </td>

      <td>
        <input
          data-k="score" data-i="${idx}"
          class="matchIn"
          placeholder="21:17"
          value="${escapeAttr(m.score || "")}"
        />
      </td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll(".matchIn").forEach((el) => {
    el.addEventListener("input", () => {
      window.__matches = collectAdminMatches();
      saveMatchesLocal(window.__matches);
    });
    el.addEventListener("change", () => {
      window.__matches = collectAdminMatches();
      saveMatchesLocal(window.__matches);
    });
  });
}

function collectAdminMatches() {
  const body = $("adminMatchesBody");
  if (!body) return normalizeMatches(DEFAULT_MATCHES);

  const base = (window.__matches && Array.isArray(window.__matches))
    ? window.__matches
    : normalizeMatches(DEFAULT_MATCHES);

  const next = base.map((x) => ({ ...x }));

  body.querySelectorAll(".matchIn").forEach((el) => {
    const i = Number(el.getAttribute("data-i"));
    const k = el.getAttribute("data-k");
    if (!Number.isFinite(i) || !next[i]) return;
    next[i][k] = String(el.value ?? "").trim();
  });

  const norm = normalizeMatches(next);

  // ✅ winner автоматически по score
  return norm.map(m => ({
    ...m,
    winner: computeWinnerFromScore(m.score)
  }));
}

// ===== Socket =====

socket.on("connect", () => {
  socket.emit("getState");
});

socket.on("state", (s) => {
  state = s;

  const local = loadLocal();
  const looksReset = (Number(s?.a3 ?? 0) === 0 && Number(s?.b3 ?? 0) === 0);

  if (looksReset && local && (local.teamA || local.teamB || local.a3 || local.b3)) {
    socket.emit("setState", local);
    return;
  }

  fill(s);
  saveLocal(buildPatchFromUI());

  const serverMatches = normalizeMatches(s?.matches);
  const localMatchesRaw = loadMatchesLocal();
  const localMatches = localMatchesRaw ? normalizeMatches(localMatchesRaw) : null;
  const useMatches = (localMatches && localMatches.length) ? localMatches : serverMatches;

  window.__matches = useMatches;
  renderAdminMatches(useMatches);
});

// ===== UI events =====

$("apply").addEventListener("click", emitAll);

$("reset").addEventListener("click", () => {
  try { localStorage.removeItem(LS_KEY); } catch (_) {}
  socket.emit("reset");
  setTimeout(() => socket.emit("getState"), 200);
});

$("aPlus").addEventListener("click", () => applyDelta("A", +1));
$("aMinus").addEventListener("click", () => applyDelta("A", -1));
$("bPlus").addEventListener("click", () => applyDelta("B", +1));
$("bMinus").addEventListener("click", () => applyDelta("B", -1));

["teamA", "teamB"].forEach((id) => {
  $(id).addEventListener("input", () => {
    updateTeamRowTitles();
    if (window.__matches) renderAdminMatches(window.__matches);
  });
  $(id).addEventListener("change", emitAll);
});

["maxPoints", "hudPosition", "hudBg", "a3", "b3"].forEach((id) => {
  $(id).addEventListener("change", emitAll);
});

["playerA1","playerA2","playerA3","playerB1","playerB2","playerB3"].forEach((id)=>{
  const el = $(id);
  if(!el) return;
  el.addEventListener("change", emitAll);
});

if ($("showHud")) $("showHud").addEventListener("change", emitAll);

// превью toggle
const previewBox = $("previewBox");
const showPreview = $("showPreview");
if (previewBox && showPreview) {
  showPreview.addEventListener("change", (e) => {
    previewBox.classList.toggle("show", e.target.checked);
  });
}

// matches buttons
const saveBtn = $("saveMatches");
if (saveBtn) {
  saveBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const matches = collectAdminMatches();
    window.__matches = matches;
    saveMatchesLocal(matches);

    socket.emit("setMatches", matches);

    const hintEl = $("matchesSavedHint");
    if (hintEl) {
      hintEl.textContent = "Сохранено ✓";
      setTimeout(() => (hintEl.textContent = ""), 1500);
    }
  });
}

const clearBtn = $("clearMatches");
if (clearBtn) {
  clearBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const cleared = normalizeMatches(
      (window.__matches && window.__matches.length ? window.__matches : DEFAULT_MATCHES)
        .map((m) => ({ ...m, score: "", winner: "" }))
    ).map(m => ({...m, winner: ""}));

    window.__matches = cleared;
    saveMatchesLocal(cleared);
    renderAdminMatches(cleared);
    socket.emit("setMatches", cleared);

    const hintEl = $("matchesSavedHint");
    if (hintEl) {
      hintEl.textContent = "Очищено";
      setTimeout(() => (hintEl.textContent = ""), 1200);
    }
  });
}
