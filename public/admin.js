const socket = io();
const $ = (id) => document.getElementById(id);

let state = null;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function fill(s) {
  $("teamA").value = s.teamA ?? "";
  $("teamB").value = s.teamB ?? "";
  $("maxPoints").value = s.maxPoints ?? 11;
  $("hudPosition").value = s.hudPosition ?? "tl";
  $("hudBg").value = s.hudBg ?? "transparent";

  $("a3").value = s.a3 ?? 0;
  $("b3").value = s.b3 ?? 0;
}

function normalizeTournament(a, b, N) {
  a = clamp(Number(a || 0), 0, N);
  b = clamp(Number(b || 0), 0, N);
  if (a + b > N) b = N - a;
  return { a, b };
}

function emitTournament(a, b) {
  const N = Number($("maxPoints").value || 11);
  const norm = normalizeTournament(a, b, N);

  socket.emit("setState", {
    mode: "tournament",
    maxPoints: N,
    hudBg: $("hudBg").value,
    teamA: $("teamA").value.trim() || "TEAM A",
    teamB: $("teamB").value.trim() || "TEAM B",
    hudPosition: $("hudPosition").value,
    a1: 0, a2: 0,
    b1: 0, b2: 0,
    a3: norm.a,
    b3: norm.b
  });
}

function applyDelta(team, delta) {
  if (!state) return;
  const N = Number(state.maxPoints ?? 11);
  const a = Number(state.a3 ?? 0);
  const b = Number(state.b3 ?? 0);

  if (team === "A") {
    const nextA = clamp(a + delta, 0, N);
    const nextB = clamp(b, 0, N - nextA);
    socket.emit("setState", { a3: nextA, b3: nextB, maxPoints: N, mode: "tournament" });
    return;
  }

  const nextB = clamp(b + delta, 0, N);
  const nextA = clamp(a, 0, N - nextB);
  socket.emit("setState", { a3: nextA, b3: nextB, maxPoints: N, mode: "tournament" });
}

socket.on("state", (s) => {
  state = s;

  // миграция старого custom -> tournament
  if (!s.mode || s.mode === "custom") {
    socket.emit("setState", { mode: "tournament" });
  }

  fill({ ...s, mode: s.mode === "custom" ? "tournament" : s.mode });
});

$("apply").addEventListener("click", () => {
  const N = Number($("maxPoints").value || 11);
  const a = Number($("a3").value || 0);
  const b = Number($("b3").value || 0);

  const norm = normalizeTournament(a, b, N);
  $("a3").value = norm.a;
  $("b3").value = norm.b;

  emitTournament(norm.a, norm.b);
});

$("aPlus").addEventListener("click", () => applyDelta("A", +1));
$("aMinus").addEventListener("click", () => applyDelta("A", -1));
$("bPlus").addEventListener("click", () => applyDelta("B", +1));
$("bMinus").addEventListener("click", () => applyDelta("B", -1));

$("a3").addEventListener("change", () => $("apply").click());
$("b3").addEventListener("change", () => $("apply").click());

// при смене цвета — сразу применяем
$("hudBg").addEventListener("change", () => $("apply").click());

$("reset").addEventListener("click", () => socket.emit("reset"));
