const socket = io();
const $ = (id) => document.getElementById(id);

const hud = $("hud");
const meta = $("meta");

function setPos(pos) {
  hud.classList.remove("pos-tl", "pos-tr", "pos-bl", "pos-br");
  hud.classList.add(`pos-${pos || "tl"}`);
}

function setBg(bg) {
  hud.classList.remove(
    "bg-transparent",
    "bg-black",
    "bg-white",
    "bg-chroma-green",
    "bg-chroma-purple",
    "bg-blue",
    "bg-red",
    "bg-yellow"
  );

  const map = {
    transparent: "bg-transparent",
    black: "bg-black",
    white: "bg-white",
    chroma_green: "bg-chroma-green",
    chroma_purple: "bg-chroma-purple",
    blue: "bg-blue",
    red: "bg-red",
    yellow: "bg-yellow",
  };

  hud.classList.add(map[bg] || "bg-transparent");
}

function updateMetaTournament(s) {
  if ((s.mode ?? "tournament") !== "tournament") {
    meta.style.display = "none";
    meta.textContent = "";
    return;
  }

  const N = Number(s.maxPoints ?? 11);
  const a = Number(s.a3 ?? 0);
  const b = Number(s.b3 ?? 0);

  let left = N - (a + b);
  if (!Number.isFinite(left)) left = 0;

  // Финальный/осталось
  if (left === 1) {
    meta.textContent = "финальный розыгрыш";
    meta.style.display = "inline-flex";
    return;
  }

  // Победа (когда дошли до 0 или перелетели)
  if (left <= 0) {
    const nameA = (s.teamA ?? "TEAM A").trim() || "TEAM A";
    const nameB = (s.teamB ?? "TEAM B").trim() || "TEAM B";

    if (a > b) meta.textContent = `победила команда — ${nameA}`;
    else if (b > a) meta.textContent = `победила команда — ${nameB}`;
    else meta.textContent = "ничья";

    meta.style.display = "inline-flex";
    return;
  }

  meta.textContent = `осталось розыгрышей: ${left}`;
  meta.style.display = "inline-flex";
}

/**
 * Делает ширину обеих строк одинаковой (по самой широкой из них).
 */
function syncRowWidths() {
  // сбрасываем, чтобы корректно перемерить
  hud.style.removeProperty("--rowW");

  requestAnimationFrame(() => {
    const rows = hud.querySelectorAll(".row");
    let maxW = 0;

    rows.forEach((r) => {
      // scrollWidth чаще точнее при max-content
      const w = Math.ceil(Math.max(r.offsetWidth, r.scrollWidth));
      if (w > maxW) maxW = w;
    });

    if (maxW > 0) {
      hud.style.setProperty("--rowW", `${maxW}px`);
    }
  });
}

socket.on("state", (s) => {
  hud.style.display = (s.hudVisible ?? true) ? "flex" : "none";
  if (!(s.hudVisible ?? true)) return;
  $("teamA").textContent = s.teamA ?? "TEAM A";
  $("teamB").textContent = s.teamB ?? "TEAM B";

  $("a3").textContent = String(s.a3 ?? 0);
  $("b3").textContent = String(s.b3 ?? 0);

  setPos(s.hudPosition);
  setBg(s.hudBg);

  updateMetaTournament(s);

  // ✅ ширина строк подгоняется под самую длинную
  // syncRowWidths();
});
