const socket = io();
const $ = (id) => document.getElementById(id);

let state = null;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function fill(s) {
  $("teamA").value = s.teamA ?? "";
  $("teamB").value = s.teamB ?? "";
  $("mode").value = s.mode ?? "classic";
  $("maxPoints").value = s.maxPoints ?? 11;
  $("hudPosition").value = s.hudPosition ?? "tl";

  $("a1").value = s.a1 ?? 0;
  $("a2").value = s.a2 ?? 0;
  $("a3").value = s.a3 ?? 0;

  $("b1").value = s.b1 ?? 0;
  $("b2").value = s.b2 ?? 0;
  $("b3").value = s.b3 ?? 0;
}

function patchFromForm() {
  return {
    teamA: $("teamA").value.trim() || "TEAM A",
    teamB: $("teamB").value.trim() || "TEAM B",
    mode: $("mode").value,
    maxPoints: Number($("maxPoints").value || 11),
    hudPosition: $("hudPosition").value,

    a1: Number($("a1").value || 0),
    a2: Number($("a2").value || 0),
    a3: Number($("a3").value || 0),

    b1: Number($("b1").value || 0),
    b2: Number($("b2").value || 0),
    b3: Number($("b3").value || 0)
  };
}

// CUSTOM: считаем очки по value3 (a3/b3).
// Ограничение: a3 + b3 <= maxPoints (N). И очки не уходят ниже 0.
function applyCustomDelta(team, delta) {
  if (!state) return;

  const N = Number(state.maxPoints ?? 11);
  const a = Number(state.a3 ?? 0);
  const b = Number(state.b3 ?? 0);

  if (team === "A") {
    const nextA = clamp(a + delta, 0, N);           // не больше N
    const nextB = clamp(b, 0, N - nextA);           // чтобы сумма не превысила N
    socket.emit("setState", { a3: nextA, b3: nextB });
    return;
  }

  if (team === "B") {
    const nextB = clamp(b + delta, 0, N);
    const nextA = clamp(a, 0, N - nextB);
    socket.emit("setState", { a3: nextA, b3: nextB });
  }
}

socket.on("state", (s) => {
  state = s;
  fill(s);
});

$("apply").addEventListener("click", () => {
  const patch = patchFromForm();

  // если custom — подчистим очки под правило суммы
  if ((patch.mode || state?.mode) === "custom") {
    const N = Number(patch.maxPoints ?? state?.maxPoints ?? 11);
    let a = Number(patch.a3 ?? state?.a3 ?? 0);
    let b = Number(patch.b3 ?? state?.b3 ?? 0);

    a = clamp(a, 0, N);
    b = clamp(b, 0, N);

    // если сумма перебор — режем B
    if (a + b > N) b = N - a;

    patch.a3 = a;
    patch.b3 = b;
  }

  socket.emit("setState", patch);
});

$("aPlus").addEventListener("click", () => {
  if ((state?.mode ?? "classic") === "custom") return applyCustomDelta("A", +1);
  socket.emit("setState", { a3: (state.a3 ?? 0) + 1 });
});

$("aMinus").addEventListener("click", () => {
  if ((state?.mode ?? "classic") === "custom") return applyCustomDelta("A", -1);
  socket.emit("setState", { a3: Math.max(0, (state.a3 ?? 0) - 1) });
});

$("bPlus").addEventListener("click", () => {
  if ((state?.mode ?? "classic") === "custom") return applyCustomDelta("B", +1);
  socket.emit("setState", { b3: (state.b3 ?? 0) + 1 });
});

$("bMinus").addEventListener("click", () => {
  if ((state?.mode ?? "classic") === "custom") return applyCustomDelta("B", -1);
  socket.emit("setState", { b3: Math.max(0, (state.b3 ?? 0) - 1) });
});

$("reset").addEventListener("click", () => socket.emit("reset"));
