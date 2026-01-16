const socket = io();
const $ = (id) => document.getElementById(id);

let state = null;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function normalizeTournament(a, b, N) {
  a = clamp(Number(a || 0), 0, N);
  b = clamp(Number(b || 0), 0, N);
  if (a + b > N) b = N - a;
  return { a, b };
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

function emitAll() {
  const N = Number($("maxPoints").value || 11);
  const a = Number($("a3").value || 0);
  const b = Number($("b3").value || 0);

  const norm = normalizeTournament(a, b, N);
  $("a3").value = norm.a;
  $("b3").value = norm.b;

  updateTeamRowTitles();

  socket.emit("setState", {
    mode: "tournament",
    maxPoints: N,
    hudBg: $("hudBg").value,
    teamA: $("teamA").value.trim() || "TEAM A",
    teamB: $("teamB").value.trim() || "TEAM B",
    hudPosition: $("hudPosition").value,
    a3: norm.a,
    b3: norm.b
  });
}

function applyDelta(team, delta) {
  if (!state) return;

  const N = Number(state.maxPoints ?? $("maxPoints").value ?? 11);
  const a = Number(state.a3 ?? 0);
  const b = Number(state.b3 ?? 0);

  if (team === "A") {
    const nextA = clamp(a + delta, 0, N);
    const nextB = clamp(b, 0, N - nextA);
    socket.emit("setState", { mode: "tournament", maxPoints: N, a3: nextA, b3: nextB });
    return;
  }

  const nextB = clamp(b + delta, 0, N);
  const nextA = clamp(a, 0, N - nextB);
  socket.emit("setState", { mode: "tournament", maxPoints: N, a3: nextA, b3: nextB });
}

socket.on("state", (s) => {
  state = s;

  if (!s.mode || s.mode === "custom") {
    socket.emit("setState", { mode: "tournament" });
  }

  fill({ ...s, mode: s.mode === "custom" ? "tournament" : s.mode });
});

// кнопки
$("apply").addEventListener("click", emitAll);
$("reset").addEventListener("click", () => socket.emit("reset"));

$("aPlus").addEventListener("click", () => applyDelta("A", +1));
$("aMinus").addEventListener("click", () => applyDelta("A", -1));
$("bPlus").addEventListener("click", () => applyDelta("B", +1));
$("bMinus").addEventListener("click", () => applyDelta("B", -1));

// автоприменение при изменениях (но без спама на каждый символ)
["teamA", "teamB"].forEach((id) => {
  $(id).addEventListener("input", updateTeamRowTitles);
  $(id).addEventListener("change", emitAll);
});

["maxPoints", "hudPosition", "hudBg", "a3", "b3"].forEach((id) => {
  $(id).addEventListener("change", emitAll);
});

// превью toggle
const previewBox = $("previewBox");
$("showPreview").addEventListener("change", (e) => {
  previewBox.classList.toggle("show", e.target.checked);
});
