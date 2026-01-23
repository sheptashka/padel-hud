const socket = io();
const $ = (id) => document.getElementById(id);

const LS_KEY = "padel_hud_state_v1";
let state = null;

const MATCHES_KEY = "padel_matches_v1";

const DEFAULT_MATCHES = [
  { id: 1, a: "A1+A2", b: "B1+B2", score: "", winner: "" },
  { id: 2, a: "A1+A2", b: "B1+B3", score: "", winner: "" },
  { id: 3, a: "A1+A2", b: "B2+B3", score: "", winner: "" },
  { id: 4, a: "A1+A3", b: "B1+B2", score: "", winner: "" },
  { id: 5, a: "A1+A3", b: "B1+B3", score: "", winner: "" },
  { id: 6, a: "A1+A3", b: "B2+B3", score: "", winner: "" },
  { id: 7, a: "A2+A3", b: "B1+B2", score: "", winner: "" },
  { id: 8, a: "A2+A3", b: "B1+B3", score: "", winner: "" },
  { id: 9, a: "A2+A3", b: "B2+B3", score: "", winner: "" },
];

function loadMatchesLocal(){
  try{
    const raw = localStorage.getItem(MATCHES_KEY);
    if(!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  }catch(_){ return null; }
}
function saveMatchesLocal(matches){
  try{ localStorage.setItem(MATCHES_KEY, JSON.stringify(matches)); }catch(_){}
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

  if ($("showHud")) {
    $("showHud").checked = (s.hudVisible ?? true);
  }
}

function renderAdminMatches(matches){
  const body = document.getElementById("adminMatchesBody");
  if(!body) return;
  body.innerHTML = "";

  (matches || []).forEach((m, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td><input data-k="a" data-i="${idx}" class="matchIn" value="${m.a || ""}" /></td>
      <td><input data-k="b" data-i="${idx}" class="matchIn" value="${m.b || ""}" /></td>
      <td><input data-k="score" data-i="${idx}" class="matchIn" placeholder="21:17" value="${m.score || ""}" /></td>
      <td>
        <select data-k="winner" data-i="${idx}" class="matchIn">
          <option value="" ${!m.winner ? "selected":""}>—</option>
          <option value="A" ${m.winner==="A"?"selected":""}>A</option>
          <option value="B" ${m.winner==="B"?"selected":""}>B</option>
        </select>
      </td>
    `;
    body.appendChild(tr);
  });
}

function collectAdminMatches(){
  const body = document.getElementById("adminMatchesBody");
  if(!body) return DEFAULT_MATCHES;

  // начинаем с текущего сохранённого массива, чтобы не терять id
  const base = (window.__matches && Array.isArray(window.__matches)) ? window.__matches : DEFAULT_MATCHES;
  const next = base.map(x => ({...x}));

  body.querySelectorAll(".matchIn").forEach((el) => {
    const i = Number(el.getAttribute("data-i"));
    const k = el.getAttribute("data-k");
    if(!Number.isFinite(i) || !next[i]) return;
    next[i][k] = String(el.value ?? "").trim();
  });

  // лёгкая нормализация
  return next.map((m, i) => ({
    id: m.id ?? (i+1),
    a: m.a || "",
    b: m.b || "",
    score: m.score || "",
    winner: (m.winner === "A" || m.winner === "B") ? m.winner : ""
  }));
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
    b3: norm.b,
    hudVisible: $("showHud") ? $("showHud").checked : true,
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
    const N = Number($("maxPoints").value ?? 11);
    // ✅ всегда берём актуальные цифры из инпутов
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
  // --- matches for results page ---
  const serverMatches = Array.isArray(s?.matches) && s.matches.length ? s.matches : null;
  const localMatches = loadMatchesLocal();
  const useMatches = serverMatches || localMatches || DEFAULT_MATCHES;

  window.__matches = useMatches;
  renderAdminMatches(useMatches);

  // если сервер пустой, но локально есть — отправим на сервер один раз
  if(!serverMatches && localMatches){
    socket.emit("setMatches", localMatches);
  }

});

// кнопки
$("apply").addEventListener("click", emitAll);
$("reset").addEventListener("click", () => {
  try { localStorage.removeItem(LS_KEY); } catch (_) {}
  socket.emit("reset");
  // просим актуальный state после reset, чтобы UI обновился
  setTimeout(() => socket.emit("getState"), 200);
});

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

if ($("showHud")) {
  $("showHud").addEventListener("change", emitAll);
}

// превью toggle (если есть)
const previewBox = document.getElementById("previewBox");
const showPreview = document.getElementById("showPreview");
if (previewBox && showPreview) {
  showPreview.addEventListener("change", (e) => {
    previewBox.classList.toggle("show", e.target.checked);
  });
}

const saveBtn = document.getElementById("saveMatches");
if(saveBtn){
  saveBtn.addEventListener("click", (e) => {
  e.preventDefault();
    const matches = collectAdminMatches();
    window.__matches = matches;
    saveMatchesLocal(matches);
    socket.emit("setMatches", matches);
  });
}

const clearBtn = document.getElementById("clearMatches");
if(clearBtn){
  clearBtn.addEventListener("click", (e) => {
  e.preventDefault();

    const cleared = (window.__matches || DEFAULT_MATCHES).map((m) => ({...m, score:"", winner:""}));
    window.__matches = cleared;
    saveMatchesLocal(cleared);
    renderAdminMatches(cleared);
    socket.emit("setMatches", cleared);
  });
}

