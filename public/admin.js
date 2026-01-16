const socket = io();
const $ = (id) => document.getElementById(id);

const LS_KEY = "padel_hud_state_v1";
let state = null;

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

function updateTeamRowTitles() {
  const aName = ($("teamA").value || "Команда A").trim() || "Команда A";
  const bName = ($("teamB").value || "Команда B").trim() || "Команда B";
  $("teamRowA").textContent = aName;
  $("teamRowB").textContent = bName;
}

function fill(s) {
  $("teamA").value = s.teamA ?? "";
  $("teamB").value = s.teamB ?? "";
  $("maxPoints").value = s.maxPoints ?? 11;
  $("hudPosition").value = s.hudPosition ?? "tl";
  $("hudBg").value = s.hudBg ?? "transparent";

  $("a3").value = s.a3 ?? 0;
  $("b3").value = s.b3 ?? 0;

  updateTeamRowTitles();
}

function buildPatchFromUI() {
  const rawN = $("maxPoints").value;
  const rawA = $("a3").value;
  const rawB = $("b3").value;

  const norm = normalizeTournament(rawA, rawB, rawN);

  // фиксируем UI после нормализации
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
    b3: norm.b
  };
}

function saveLocal(patch) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(patch));
  } catch (_) {}
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

function emitAll() {
  const patch = buildPatchFromUI();
  saveLocal(patch);
  socket.emit("setState", patch);
}

function applyDelta(team, delta) {
  const N = Number(state?.maxPoints ?? $("maxPoints").value ?? 11);
  const a = Number(state?.a3 ?? $("a3").value ?? 0);
  const b = Number(state?.b3 ?? $("b3").value ?? 0);

  if (team === "A") {
    const na = clamp(a + delta, 0, N);
    const nb = clamp(b, 0, N - na);
    const patch = { mode: "tournament", maxPoints: N, a3: na, b3: nb };
    saveLocal({ ...buildPatchFromUI(), ...patch });
    socket.emit("setState", patch);
    return;
  }

  const nb = clamp(b + delta, 0, N);
  const na = clamp(a, 0, N - nb);
  const patch = { mode: "tournament", maxPoints: N, a3: na, b3: nb };
  saveLocal({ ...buildPatchFromUI(), ...patch });
  socket.emit("setState", patch);
}

// ✅ При подключении просим state и если сервер прислал нули — переотправляем сохранённый
socket.on("connect", () => {
  socket.emit("getState");
});

socket.on("state", (s) => {
  state = s;

  // Если сервер вдруг отдал нули (после рестарта), восстановим из localStorage
  const local = loadLocal();
  const looksReset = (Number(s?.a3 ?? 0) === 0 && Number(s?.b3 ?? 0) === 0);

  if (looksReset && local && (local.teamA || local.teamB || local.a3 || local.b3)) {
    socket.emit("setState", local);
    return;
  }

  fill(s);
  saveLocal({
    mode: "tournament",
    teamA: s.teamA ?? "TEAM A",
    teamB: s.teamB ?? "TEAM B",
    maxPoints: s.maxPoints ?? 11,
    hudPosition: s.hudPosition ?? "tl",
    hudBg: s.hudBg ?? "transparent",
    a3: s.a3 ?? 0,
    b3: s.b3 ?? 0
  });
});

// кнопки
$("apply").addEventListener("click", emitAll);
$("reset").addEventListener("click", () => socket.emit("reset"));

$("aPlus").addEventListener("click", () => applyDelta("A", +1));
$("aMinus").addEventListener("click", () => applyDelta("A", -1));
$("bPlus").addEventListener("click", () => applyDelta("B", +1));
$("bMinus").addEventListener("click", () => applyDelta("B", -1));

// названия команд — сразу в UI + при смене отправляем
["teamA", "teamB"].forEach((id) => {
  $(id).addEventListener("input", updateTeamRowTitles);
  $(id).addEventListener("change", emitAll);
});

// остальные поля — по change
["maxPoints", "hudPosition", "hudBg", "a3", "b3"].forEach((id) => {
  $(id).addEventListener("change", emitAll);
});

// превью toggle (если есть)
const previewBox = document.getElementById("previewBox");
const showPreview = document.getElementById("showPreview");
if (previewBox && showPreview) {
  showPreview.addEventListener("change", (e) => {
    previewBox.classList.toggle("show", e.target.checked);
  });
}
