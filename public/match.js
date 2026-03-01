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
  try { localStorage.setItem(MATCH_CACHE_KEY, JSON.stringify(payload)); } catch(_) {}
}
function loadCache() {
  try {
    const raw = localStorage.getItem(MATCH_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(_) { return null; }
}

function normalizeMatches(matchesFromState) {
  if (!Array.isArray(matchesFromState)) return [];
  return matchesFromState.map((m, i) => ({
    id: m.id ?? (i + 1),
    score: String(m.score ?? "").trim()
  }));
}

function setLeaderUI(aTotal, bTotal) {
  const teamAEl = $("teamAName");
  const teamBEl = $("teamBName");
  const aEl = $("totalA");
  const bEl = $("totalB");

  [teamAEl, teamBEl, aEl, bEl].forEach((x) => x && x.classList.remove("mLeader"));

  if (aTotal > bTotal) {
    teamAEl && teamAEl.classList.add("mLeader");
    aEl && aEl.classList.add("mLeader");
  } else if (bTotal > aTotal) {
    teamBEl && teamBEl.classList.add("mLeader");
    bEl && bEl.classList.add("mLeader");
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
    li.innerHTML = <span class="mAvatar"></span><span class="mName">—</span>;
    ul.appendChild(li);
    return;
  }

  clean.forEach((name) => {
    const li = document.createElement("li");
    li.innerHTML = <span class="mAvatar"></span><span class="mName">${name}</span>;
    ul.appendChild(li);
  });
}

function renderMatchScores(matches) {
  const box = $("matchScores");
  if (!box) return;
  box.innerHTML = "";

  // показываем только корректные счёта
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
      <div class="mMatchScore">${m.score.replace("-", ":")}</div>
    `;
    box.appendChild(row);
  });
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

function applyState(s) {
  const teamAName = safeName(s?.teamA, "Команда A");
  const teamBName = safeName(s?.teamB, "Команда B");

  const matches = normalizeMatches(s?.matches);
  const { aTotal, bTotal } = computeTotals(matches);

  renderHeader(teamAName, teamBName, aTotal, bTotal);

  // Rosters (из админки)
  renderRoster("rosterA", s?.teamAPlayers);
  renderRoster("rosterB", s?.teamBPlayers);

  // Center list
  renderMatchScores(matches);

  // статус
  const playedCount = matches.filter(m => parseScore(m.score)).length;
  const st = $("statusLine");
  if (st) st.textContent = Сыграно матчей: ${playedCount};

  // кеш (на случай простоя/рестарта)
  saveCache({
    teamA: teamAName,
    teamB: teamBName,
    teamAPlayers: s?.
teamAPlayers ?? [],
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
  // если сервер прислал пусто — восстановим из localStorage
  const hasData =
    (s?.teamA  s?.teamB) 
    (Array.isArray(s?.matches) && s.matches.some(m => String(m?.score  "").trim())) 
    (Array.isArray(s?.teamAPlayers) && s.teamAPlayers.length) ||
    (Array.isArray(s?.teamBPlayers) && s.teamBPlayers.length);

  if (!hasData) {
    const cached = loadCache();
    if (cached) {
      applyState(cached);
      return;
    }
  }

  applyState(s || {});
});