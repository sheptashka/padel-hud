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
  try {
    localStorage.setItem(MATCH_CACHE_KEY, JSON.stringify(payload));
  } catch (_) {}
}

function loadCache() {
  try {
    const raw = localStorage.getItem(MATCH_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function normalizeMatches(matchesFromState) {
  if (!Array.isArray(matchesFromState)) return [];
  return matchesFromState.map((m, i) => ({
    id: m.id ?? (i + 1),
    score: String(m.score ?? "").trim(),
  }));
}

function computeTotals(matches, currentA, currentB) {
  let aTotal = 0;
  let bTotal = 0;

  for (const m of matches) {
    const sc = parseScore(m.score);
    if (!sc) continue;
    aTotal += sc.a;
    bTotal += sc.b;
  }

  aTotal += Number(currentA || 0);
  bTotal += Number(currentB || 0);

  return { aTotal, bTotal };
}

function setLeaderUI(aTotal, bTotal) {
  const teamAEl = $("teamAName");
  const teamBEl = $("teamBName");
  const aEl = $("totalA");
  const bEl = $("totalB");

  [teamAEl, teamBEl, aEl, bEl].forEach((x) => {
    if (x) x.classList.remove("mLeader");
  });

  [aEl, bEl].forEach((x) => {
    if (x) x.classList.remove("mLeaderScore");
  });

  if (aTotal > bTotal) {
    if (teamAEl) teamAEl.classList.add("mLeader");
    if (aEl) aEl.classList.add("mLeader", "mLeaderScore");
  } else if (bTotal > aTotal) {
    if (teamBEl) teamBEl.classList.add("mLeader");
    if (bEl) bEl.classList.add("mLeader", "mLeaderScore");
  }
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
  const clean = arr.map((x) => String(x || "").trim()).filter(Boolean);

  if (clean.length === 0) {
    const li = document.createElement("li");
    li.className = "mMuted";
    li.innerHTML = `<span class="mName">—</span>`;
    ul.appendChild(li);
    return;
  }

  clean.forEach((name) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="mName">${escapeHtml(name)}</span>`;
    ul.appendChild(li);
  });
}

function renderMatchScores(matches, currentA, currentB) {
  const box = $("matchScores");
  if (!box) return;
  box.innerHTML = "";

  const total = Math.max(matches.length, 1);
  const played = matches
    .map((m, idx) => ({ ...m, idx }))
    .filter((m) => parseScore(m.score));

  const currentHasScore = Number(currentA || 0) !== 0 || Number(currentB || 0) !== 0;
  const currentMatchNumber = Math.min(played.length + 1, total);

  const rows = [];

  played.forEach((m) => {
    rows.push({
      idx: m.idx + 1,
      score: m.score.replace("-", ":"),
      live: false,
    });
  });

  if (currentHasScore && played.length < total) {
    rows.push({
      idx: currentMatchNumber,
      score: `${Number(currentA || 0)}:${Number(currentB || 0)}`,
      live: true,
    });
  }

  while (rows.length < total) {
    rows.push({
      idx: rows.length + 1,
      score: "–:–",
      live: false,
      empty: true,
    });
  }

  rows.slice(0, total).forEach((m) => {
    const row = document.createElement("div");
    row.className = `mMatchRow${m.live ? " mMatchRowLive" : ""}${m.empty ? " mMatchRowEmpty" : ""}`;
    row.innerHTML = `
      <div class="mMatchIdx">${m.idx}</div>
      <div class="mMatchScore">${escapeHtml(m.score)}</div>
      ${m.live ? `<div class="mLive">LIVE</div>` : `<div class="mLiveSpacer"></div>`}
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

function hasStateData(s) {
  return (
    (s?.teamA && s.teamA !== "Команда A") ||
    (s?.teamB && s.teamB !== "Команда B") ||
    Number(s?.a3 || 0) !== 0 ||
    Number(s?.b3 || 0) !== 0 ||
    (Array.isArray(s?.matches) && s.matches.some((m) => String(m?.score || "").trim())) ||
    (Array.isArray(s?.teamAPlayers) && s.teamAPlayers.some((x) => String(x || "").trim())) ||
    (Array.isArray(s?.teamBPlayers) && s.teamBPlayers.some((x) => String(x || "").trim()))
  );
}

function applyState(s) {
  const teamAName = safeName(s?.teamA, "Команда A");
  const teamBName = safeName(s?.teamB, "Команда B");

  const matches = normalizeMatches(s?.matches);
  const currentA = Number(s?.a3 || 0);
  const currentB = Number(s?.b3 || 0);

  const { aTotal, bTotal } = computeTotals(matches, currentA, currentB);

  renderHeader(teamAName, teamBName, aTotal, bTotal);
  renderRoster("rosterA", s?.teamAPlayers);
  renderRoster("rosterB", s?.teamBPlayers);
  renderMatchScores(matches, currentA, currentB);

  const playedCount = matches.filter((m) => parseScore(m.score)).length;
  const totalMatches = matches.length;
  const currentHasScore = currentA !== 0 || currentB !== 0;
  const currentMatchNumber = currentHasScore ? Math.min(playedCount + 1, totalMatches) : "—";

  const diff = aTotal - bTotal;
  const diffText = diff === 0 ? "Разница: 0" : `Разница: ${diff > 0 ? "+" : ""}${diff}`;

  const st = $("statusLine");
  if (st) {
    st.textContent = currentHasScore
      ? `Сыграно матчей: ${playedCount} из ${totalMatches} • Идёт матч: ${currentMatchNumber} • ${diffText}`
      : `Сыграно матчей: ${playedCount} из ${totalMatches} • ${diffText}`;
  }

  saveCache({
    teamA: teamAName,
    teamB: teamBName,
    teamAPlayers: s?.teamAPlayers ?? [],
    teamBPlayers: s?.teamBPlayers ?? [],
    a3: currentA,
    b3: currentB,
    matches,
  });
}

socket.on("connect", () => {
  const st = $("statusLine");
  if (st) st.textContent = "Подключено…";
  socket.emit("getState");
});

socket.on("state", (s) => {
  if (!hasStateData(s)) {
    const cached = loadCache();
    if (cached) {
      applyState(cached);
      return;
    }
  }

  applyState(s || {});
});
