const socket = io();
const $ = (id) => document.getElementById(id);

const MATCH_PAGE_CACHE_KEY = "padel_match_page_cache_v1";

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

function normalizeMatches(matchesFromState) {
  if (!Array.isArray(matchesFromState)) return [];
  return matchesFromState.map((m, i) => ({
    id: m.id ?? (i + 1),
    score: String(m.score ?? "").trim(),
  }));
}

function onlyPlayed(matches) {
  return matches
    .map((m, idx) => ({ ...m, idx }))
    .filter((m) => parseScore(m.score));
}

function computeTotals(played) {
  let totalA = 0;
  let totalB = 0;
  for (const m of played) {
    const sc = parseScore(m.score);
    if (!sc) continue;
    totalA += sc.a;
    totalB += sc.b;
  }
  return { totalA, totalB };
}

function renderTeams(teamA, teamB) {
  $("mTeamA").textContent = teamA;
  $("mTeamB").textContent = teamB;
  $("mRosterATitle").textContent = teamA;
  $("mRosterBTitle").textContent = teamB;
}

function renderRosters(teamAPlayers, teamBPlayers) {
  const ulA = $("mRosterA");
  const ulB = $("mRosterB");
  ulA.innerHTML = "";
  ulB.innerHTML = "";

  const a = Array.isArray(teamAPlayers) ? teamAPlayers : [];
  const b = Array.isArray(teamBPlayers) ? teamBPlayers : [];

  const fill = (ul, arr) => {
    const clean = arr.map(x => String(x || "").trim()).filter(Boolean);
    if (clean.length === 0) {
      const li = document.createElement("li");
      li.className = "mMuted";
      li.textContent = "—";
      ul.appendChild(li);
      return;
    }

    clean.forEach((name) => {
      const li = document.createElement("li");
      li.className = "mPlayer";
      li.innerHTML = `
        <span class="mAvatar" aria-hidden="true"></span>
        <span class="mName">${escapeHtml(name)}</span>
      `;
      ul.appendChild(li);
    });
  };

  fill(ulA, a);
  fill(ulB, b);
}

function renderScores(played) {
  const box = $("mScores");
  box.innerHTML = "";

  if (played.length === 0) {
    const div = document.createElement("div");
    div.className = "mEmpty";
    div.textContent = "Пока нет сыгранных матчей";
    box.appendChild(div);
    return;
  }

  played.forEach((m) => {
    const div = document.createElement("div");
    div.className = "mScoreRow";
    div.innerHTML = `
      <span class="mScoreIdx">${m.idx + 1}</span>
      <span class="mScoreVal">${escapeHtml(m.score)}</span>
    `;
    box.appendChild(div);
  });
}

function renderTotals(totalA, totalB) {
  $("mTotal").textContent = `${totalA} : ${totalB}`;
}

function setStatus(text) {
  const st = $("mStatus");
  if (st) st.textContent = text;
}

function saveCache(payload) {
  try { localStorage.setItem(MATCH_PAGE_CACHE_KEY, JSON.stringify(payload)); } catch (_) {}
}
function loadCache() {
  try {
    const raw = localStorage.getItem(MATCH_PAGE_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) { return null; }
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
  const teamA = safeName(s?.teamA, "Команда 1");
  const teamB = safeName(s?.teamB, "Команда 2");

  const matches = normalizeMatches(s?.matches);
  const played = onlyPlayed(matches);
  const totals = computeTotals(played);

  renderTeams(teamA, teamB);
  renderTotals(totals.totalA, totals.totalB);
  renderScores(played);
  renderRosters(s?.teamAPlayers, s?.teamBPlayers);

  setStatus(`сыграно матчей: ${played.length}`);

  saveCache({
    teamA, teamB,
    teamAPlayers: s?.teamAPlayers ?? [],
    teamBPlayers: s?.teamBPlayers ?? [],
    matches
  });
}

socket.on("connect", () => {
  socket.emit("getState");
});

socket.on("state", (s) => {
  // Если сервер пришлёт пустое после простоя — покажем кеш
  const hasSomething =
    (s?.teamA || s?.teamB) ||
    (Array.isArray(s?.matches) && s.matches.some(m => String(m?.score || "").trim())) ||
    (Array.isArray(s?.teamAPlayers) && s.teamAPlayers.some(x => String(x || "").trim())) ||
    (Array.isArray(s?.teamBPlayers) && s.teamBPlayers.some(x => String(x || "").trim()));

  if (!hasSomething) {
    const cached = loadCache();
    if (cached) {
      applyState(cached);
      return;
    }
  }

  applyState(s || {});
});