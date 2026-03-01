const socket = io();
const $ = (id) => document.getElementById(id);

const MATCH_CACHE_KEY = "padel_match_cache_v1";

function parseScore(score) {
  if (!score) return null;
  const s = String(score).trim();
  const m = s.match(/^(\d+)\s*[:\-]\s*(\d+)$/);
  if (!m) return null;
  return { a: Number(m[1]), b: Number(m[2]) };
}

function safeName(v, fallback) {
  const s = String(v ?? "").trim();
  return s ? s : fallback;
}

function saveCache(payload) {
  try { localStorage.setItem(MATCH_CACHE_KEY, JSON.stringify(payload)); } catch (_) {}
}
function loadCache() {
  try {
    const raw = localStorage.getItem(MATCH_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) { return null; }
}

function normalizeMatches(matchesFromState) {
  if (!Array.isArray(matchesFromState)) return [];
  return matchesFromState.map((m, i) => ({
    id: m.id ?? (i + 1),
    score: String(m.score ?? "").trim()
  }));
}

function computeTotals(matches) {
  let aTotal = 0;
  let bTotal = 0;

  for (const m of matches) {
    const sc = parseScore(m.score);
    if (!sc) continue;
    aTotal += sc.a;
    bTotal += sc.b;
  }
  return { aTotal, bTotal };
}

function setLeaderUI(aTotal, bTotal) {
  const teamAEl = $("teamAName");
  const teamBEl = $("teamBName");
  const aEl = $("totalA");
  const bEl = $("totalB");

  [teamAEl, teamBEl, aEl, bEl].forEach((x) => x && x.classList.remove("mLeader"));
  [aEl, bEl].forEach((x) => x && x.classList.remove("mLeaderScore"));

  if (aTotal > bTotal) {
    teamAEl && teamAEl.classList.add("mLeader");
    aEl && aEl.classList.add("mLeader", "mLeaderScore");
  } else if (bTotal > aTotal) {
    teamBEl && teamBEl.classList.add("mLeader");
    bEl && bEl.classList.add("mLeader", "mLeaderScore");
  }
  // ничья — без подсветки
}

function renderHeader(teamAName, teamBName, aTotal, bTotal) {
  $("teamAName").textContent = teamAName;
  $("teamBName").textContent = teamBName;

  $("totalA").textContent = String(aTotal);
  $("totalB").textContent = String(bTotal);

  setLeaderUI(aTotal, bTotal);
}

function renderRoster(listId, players) {
  const ul = $(listId);
  if (!ul) return;
  ul.innerHTML = "";

  const arr = Array.isArray(players) ? players : [];
  const clean = arr.map(x => String(x || "").trim()).filter(Boolean);

  if (clean.length === 0) {
    const li = document.createElement("li");
    li.className = "mMuted";
    li.innerHTML = `<span class="mAvatar"></span><span class="mName">—</span>`;
    ul.appendChild(li);
    return;
  }

  clean.forEach((name) => {
    const li = document.createElement("li");
    // ✅ без чекбоксов, но оставляем место под мини-фото (mAvatar)
    li.innerHTML = `<span class="mAvatar"></span><span class="mName">${escapeHtml(name)}</span>`;
    ul.appendChild(li);
  });
}

function renderMatchScores(matches) {
  const box = $("matchScores");
  if (!box) return;
  box.innerHTML = "";

  // ✅ показываем только корректные счёта
  const played = matches
    .map((m, idx) => ({ ...m, idx }))
    .filter((m) => parseScore(m.score));

  if (played.length === 0) {
    const empty = document.createElement("div");
    empty.className = "mEmpty";
    empty.textContent = "Пока нет сыгранных матчей";
    box.appendChild(empty);
    return;
  }

  played.forEach((m) => {
    const row = document.createElement("div");
    row.className = "mMatchRow";
    row.innerHTML = `
      <div class="mMatchIdx">${m.idx + 1}</div>
      <div class="mMatchScore">${escapeHtml(m.score.replace("-", ":"))}</div>
    `;
    box.appendChild(row);
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function applyState(s) {
  const teamAName = safeName(s?.teamA, "Команда A");
  const teamBName = safeName(s?.teamB, "Команда B");

  const matches = normalizeMatches(s?.matches);
  const { aTotal, bTotal } = computeTotals(matches);

  renderHeader(teamAName, teamBName, aTotal, bTotal);
  renderRoster("rosterA", s?.teamAPlayers);
  renderRoster("rosterB", s?.teamBPlayers);
  renderMatchScores(matches);

  // ✅ статус: сыграно + разница общего счёта
  const playedCount = matches.filter(m => parseScore(m.score)).length;
  const diff = aTotal - bTotal;
  const diffText = diff === 0 ? "Разница: 0" : `Разница: ${diff > 0 ? "+" : ""}${diff}`;

  const st = $("statusLine");
  if (st) st.textContent = `Сыграно матчей: ${playedCount} • ${diffText}`;

  // кеш на случай простоя/рестарта
  saveCache({
    teamA: teamAName,
    teamB: teamBName,
    teamAPlayers: s?.teamAPlayers ?? [],
    teamBPlayers: s?.teamBPlayers ?? [],
    matches
  });
}

socket.on("connect", () => {
  const st = $("statusLine");
  if (st) st.textContent = "Подключено…";
  socket.emit("getState");
});

socket.on("state", (s) => {
  // если сервер прислал пусто — берём кеш
  const hasData =
    (s?.teamA || s?.teamB) ||
    (Array.isArray(s?.matches) && s.matches.some(m => String(m?.score || "").trim())) ||
    (Array.isArray(s?.teamAPlayers) && s.teamAPlayers.some(x => String(x || "").trim())) ||
    (Array.isArray(s?.teamBPlayers) && s.teamBPlayers.some(x => String(x || "").trim()));

  if (!hasData) {
    const cached = loadCache();
    if (cached) {
      applyState(cached);
      return;
    }
  }

  applyState(s || {});
});