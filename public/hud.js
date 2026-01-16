const socket = io();
const $ = (id) => document.getElementById(id);

const hud = $("hud");

function setPos(pos) {
  hud.classList.remove("pos-tl", "pos-tr", "pos-bl", "pos-br");
  hud.classList.add(`pos-${pos || "tl"}`);
}

// грубая оценка ширины по длине (без пробелов)
// подобрано под текущий font-size 16 и uppercase
function calcTeamWidth(nameA, nameB) {
  const clean = (s) => String(s || "").replace(/\s+/g, "");
  const maxLen = Math.max(clean(nameA).length, clean(nameB).length, 4);

  // 9px на символ + паддинги строки и запас под эллипсис
  const px = 12 + maxLen * 9 + 18;
  return Math.max(140, Math.min(px, 360)); // ограничим разумными рамками
}

socket.on("state", (s) => {
  const aName = s.teamA ?? "TEAM A";
  const bName = s.teamB ?? "TEAM B";

  $("teamA").textContent = aName;
  $("teamB").textContent = bName;

  $("a1").textContent = String(s.a1 ?? 0);
  $("a2").textContent = String(s.a2 ?? 0);
  $("a3").textContent = String(s.a3 ?? 0);

  $("b1").textContent = String(s.b1 ?? 0);
  $("b2").textContent = String(s.b2 ?? 0);
  $("b3").textContent = String(s.b3 ?? 0);

  setPos(s.hudPosition);

  const teamW = calcTeamWidth(aName, bName);
  hud.style.setProperty("--teamW", `${teamW}px`);
});
