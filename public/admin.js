const socket = io();
const $ = (id) => document.getElementById(id);

let state = null;

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

socket.on("state", (s) => {
  state = s;
  fill(s);
});

$("apply").addEventListener("click", () => {
  socket.emit("setState", patchFromForm());
});

// пока +1 добавляет к третьему полю (очки)
$("aPlus").addEventListener("click", () => {
  if (!state) return;
  socket.emit("setState", { a3: (state.a3 ?? 0) + 1 });
});

$("bPlus").addEventListener("click", () => {
  if (!state) return;
  socket.emit("setState", { b3: (state.b3 ?? 0) + 1 });
});

$("reset").addEventListener("click", () => socket.emit("reset"));
