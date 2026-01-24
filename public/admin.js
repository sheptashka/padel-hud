const socket = io();
const $ = (id) => document.getElementById(id);

const LS_KEY = "padel_hud_state_v1";
const MATCHES_KEY = "padel_matches_v1";

let state = null;

const DEFAULT_MATCHES = [
  { id: 1, a: "", b: "", score: "" },
  { id: 2, a: "", b: "", score: "" },
  { id: 3, a: "", b: "", score: "" },
  { id: 4, a: "", b: "", score: "" },
  { id: 5, a: "", b: "", score: "" },
  { id: 6, a: "", b: "", score: "" },
  { id: 7, a: "", b: "", score: "" },
  { id: 8, a: "", b: "", score: "" },
  { id: 9, a: "", b: "", score: "" },
];

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
  const aName = ($("teamA").value || "Команда A").trim() || "Команда A";
  const bName = ($("teamB").value || "Команда B").trim() || "Команда B";
  $("teamRowA").textContent = aName;
  $("teamRowB").textContent = bName;

  const colA = $("colTeamA");
  const colB = $("colTeamB");
  if (colA) colA.textContent = aName;
  if (colB) colB.textContent = bName;
}

function fill(s) {
  $("teamA").value = s.teamA ?? "";
  $("teamB").value = s.teamB ?? "";
  $("maxPoints").value = s.maxPoints ?? 11;
  $("hudPosition").value = s.hudPosition ?? "tl";
  $("hudBg").value = s.hudBg ?? "transparent";

  $("a3").value = s.a3 ?? 0;
  $("b3").value = s.b3 ?? 0;

  // составы
  const aP = Array.isArray(s.teamAPlayers) ? s.teamAPlayers : ["", "", ""];
  const bP = Array.isArray(s.teamBPlayers) ? s.teamBPlayers : ["", "", ""];
  $("aP1").value = aP[0] ?? "";
  $("aP2").value = aP[1] ?? "";
  $("aP3").value = aP[2] ?? "";
  $("bP1").value = bP[0] ?? "";
  $("bP2").value = bP[1] ?? "";
  $("bP3").value = bP[2] ?? "";

  updateTeamRowTitles();

  if ($("showHud")) {
    $("showHud").checked = (s.hudVisible ?? true);
  }
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

    // сохраняем локально при вводе, чтобы не “слетало”
    tr.querySelectorAll(".matchIn").forEach((el) => {
      el.addEventListener("input", () => {
        window.__matches = collectAdminMatches();
        saveMatchesLocal(window.__matches);
      });
      el.addEventListener("change", () => {
        window.__matches = collectAdminMatches();
        saveMatchesLocal(window.__matches);
      });
    });
  });
}

function collectAdminMatches() {
  const body = $("adminMatchesBody");
  if (!body) return DEFAULT_MATCHES;

  const base = (window.__matches && Array.isArray(window.__matches)) ? window.__matches : DEFAULT_MATCHES;
  const next = base.map((x) => ({ ...x }));

  body.querySelectorAll(".matchIn").forEach((el) => {
    const i = Number(el.getAttribute("data-i"));
    const k = el.getAttribute("data-k");
    if (!Number.isFinite(i) || !next[i]) return;
    next[i][k] = String(el.value ?? "").trim();
  });

  return next.map((m, i) => ({
    id: m.id ?? (i + 1),
    a: m.a || "",
    b: m.b || "",
    score: m.score || ""
  }));
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

  const teamA = $("teamA").value.trim() || "Команда A";
  const teamB = $("teamB").value.trim() || "Команда B";

  const teamAPlayers = [ $("aP1").value, $("aP2").value, $("aP3").value ].map(s => (s || "").trim());
  const teamBPlayers = [ $("bP1").value, $("bP2").value, $("bP3").value ].map(s => (s || "").trim());

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
    matches: window.__matches && Array.isArray(window.__matches) ? window.__matches : (loadMatchesLocal() || DEFAULT_MATCHES),
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
    emitAll();
    return;
  }

  const nb = clamp(b + delta, 0, N);
  const na = clamp(a, 0, N - nb);
  $("a3").value = na;
  $("b3").value = nb;
  emitAll();
}

// boot matches
const bootLocalMatches = loadMatchesLocal();
if (bootLocalMatches) {
  window.__matches = bootLocalMatches;
  renderAdminMatches(bootLocalMatches);
} else {
  window.__matches = DEFAULT_MATCHES;
  renderAdminMatches(DEFAULT_MATCHES);
}

// socket
socket.on("connect", () => {
  socket.emit("getState");
});

socket.on("state", (s) => {
  state = s;

  // восстановление UI из localStorage, если сервер после рестарта пустой
  const local = loadLocal();
  const looksReset =
    Number(s?.a3 ?? 0) === 0 &&
    Number(s?.b3 ?? 0) === 0 &&
    (!s?.teamA && !s?.teamB);

  if (looksReset && local) {
    socket.emit("setState", local);
    return;
  }

  fill(s);

  // matches: берём серверные, иначе локальные, иначе дефолт
  const serverMatches = Array.isArray(s?.matches) ? s.matches : null;
  const localMatches = loadMatchesLocal();
  const useMatches =
    (serverMatches && serverMatches.length ? serverMatches : null) ||
    (localMatches && localMatches.length ? localMatches : null) ||
    DEFAULT_MATCHES;

  window.__matches = useMatches;
  renderAdminMatches(useMatches);
  saveMatchesLocal(useMatches);

  // сохраняем локально всё состояние
  saveLocal({
    ...buildPatchFromUI(),
    matches: useMatches
  });
});

// buttons
$("apply").addEventListener("click", emitAll);

$("reset").addEventListener("click", () => {
  socket.emit("reset");
  setTimeout(() => socket.emit("getState"), 200);
});

$("aPlus").addEventListener("click", () => applyDelta("A", +1));
$("aMinus").addEventListener("click", () => applyDelta("A", -1));
$("bPlus").addEventListener("click", () => applyDelta("B", +1));
$("bMinus").addEventListener("click", () => applyDelta("B", -1));

// inputs
["teamA", "teamB"].forEach((id) => {
  $(id).addEventListener("input", updateTeamRowTitles);
  $(id).addEventListener("change", emitAll);
});

["maxPoints", "hudPosition", "hudBg", "a3", "b3", "aP1", "aP2", "aP3", "bP1", "bP2", "bP3"].forEach((id) => {
  $(id).addEventListener("change", emitAll);
});

if ($("showHud")) $("showHud").addEventListener("change", emitAll);

// preview toggle
const previewBox = $("previewBox");
const showPreview = $("showPreview");
if (previewBox && showPreview) {
  showPreview.addEventListener("change", (e) => {
    previewBox.classList.toggle("show", e.target.checked);
  });
}

// matches actions
const saveBtn = $("saveMatches");
if (saveBtn) {
  saveBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const matches = collectAdminMatches();
    window.__matches = matches;
    saveMatchesLocal(matches);

    // отправляем на сервер через общий state
    emitAll();

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
    const cleared = (window.__matches || DEFAULT_MATCHES).map((m) => ({ ...m, a:"", b:"", score:"" }));
    window.__matches = cleared;
    saveMatchesLocal(cleared);
    renderAdminMatches(cleared);
    emitAll();
  });
}
