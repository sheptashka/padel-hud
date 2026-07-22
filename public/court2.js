const socket = io();
const $ = (id) => document.getElementById(id);

function safeStr(v) { return String(v ?? "").trim(); }
function clampInt(n, min, max) {
  n = Number(n);
  if (!Number.isFinite(n)) n = min;
  n = Math.floor(n);
  return Math.max(min, Math.min(max, n));
}

let teamAName = "Команда A";
let teamBName = "Команда B";
let colorA = ""; // "white" | "black" | ""
let colorB = "";

function applyCardColor(cardEl, color) {
  if (!cardEl) return;
  cardEl.classList.remove("color-white", "color-black");
  if (color === "white") cardEl.classList.add("color-white");
  if (color === "black") cardEl.classList.add("color-black");
}

function updateUI() {
  if ($("teamNameA")) $("teamNameA").textContent = teamAName;
  if ($("teamNameB")) $("teamNameB").textContent = teamBName;

  if ($("colorAWhite")) $("colorAWhite").classList.toggle("active", colorA === "white");
  if ($("colorABlack")) $("colorABlack").classList.toggle("active", colorA === "black");
  if ($("colorBWhite")) $("colorBWhite").classList.toggle("active", colorB === "white");
  if ($("colorBBlack")) $("colorBBlack").classList.toggle("active", colorB === "black");

  applyCardColor($("cardA"), colorA);
  applyCardColor($("cardB"), colorB);
}

function setColor(team, color) {
  if (team === "A") colorA = (colorA === color) ? "" : color;
  else colorB = (colorB === color) ? "" : color;
  updateUI();
  socket.emit("setState", {
    court2ColorA: colorA,
    court2ColorB: colorB,
    updatedAt: Date.now(),
  });
}

// Socket
socket.on("connect", () => socket.emit("getState"));
socket.on("state", (s) => {
  if (!s) return;
  teamAName = safeStr(s.teamA) || "Команда A";
  teamBName = safeStr(s.teamB) || "Команда B";
  colorA = (s.court2ColorA === "white" || s.court2ColorA === "black") ? s.court2ColorA : "";
  colorB = (s.court2ColorB === "white" || s.court2ColorB === "black") ? s.court2ColorB : "";
  updateUI();
});

// Color buttons
if ($("colorAWhite")) $("colorAWhite").addEventListener("click", () => setColor("A", "white"));
if ($("colorABlack")) $("colorABlack").addEventListener("click", () => setColor("A", "black"));
if ($("colorBWhite")) $("colorBWhite").addEventListener("click", () => setColor("B", "white"));
if ($("colorBBlack")) $("colorBBlack").addEventListener("click", () => setColor("B", "black"));

// Save flow
function openConfirm() {
  const scoreA = clampInt($("scoreA").value, 0, 99);
  const scoreB = clampInt($("scoreB").value, 0, 99);
  if ($("confirmText")) {
    $("confirmText").textContent = `Итоговый счёт: ${teamAName} "${scoreA}" – "${scoreB}" ${teamBName}. Сохранить?`;
  }
  const overlay = $("modalConfirm");
  if (overlay) overlay.classList.add("show");
}

function closeConfirm() {
  const overlay = $("modalConfirm");
  if (overlay) overlay.classList.remove("show");
}

if ($("btnSave")) $("btnSave").addEventListener("click", openConfirm);

if ($("confirmYes")) $("confirmYes").addEventListener("click", () => {
  closeConfirm();
  const scoreA = clampInt($("scoreA").value, 0, 99);
  const scoreB = clampInt($("scoreB").value, 0, 99);

  socket.emit("saveCourt2Match", { scoreA, scoreB });

  // Clear score fields for the next match
  if ($("scoreA")) $("scoreA").value = "";
  if ($("scoreB")) $("scoreB").value = "";

  const hint = $("savedHint");
  if (hint) {
    hint.textContent = "Сохранено ✓";
    setTimeout(() => { hint.textContent = ""; }, 2000);
  }
});

if ($("confirmNo")) $("confirmNo").addEventListener("click", closeConfirm);

if ($("btnBack")) $("btnBack").addEventListener("click", () => { window.location.href = "/admin.html"; });
