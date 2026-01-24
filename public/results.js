const socket = io();
const $ = (id) => document.getElementById(id);

const RESULTS_KEY = "padel_results_cache_v1";

function parseScore(score) {
  if (!score) return null;
  const s = String(score).trim();
  const m = s.match(/^(\d+)\s*[:\-]\s*(\d+)$/);
  if (!m) return null;
  return { a: Number(m[1]), b: Number(m[2]) };
}

function safeName(s, fallback) {
  const v = String(s ?? "").trim();
  return v ? v : fallback;
}

function saveCache(payload) {
  try { localStorage.setItem(RESULTS_KEY, JSON.stringify(payload)); } catch(_) {}
}
function loadCache() {
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(_) { return null; }
}

function normalizeMatches(matchesFromState) {
  if (!Array.isArray(matchesFromState)) return [];
  return matchesFromState.map((m, i) => ({
    id: m.id ?? (i + 1),
    a: (m.a ?? "").trim(),
    b: (m.b ?? "").trim(),
    score: (m.score ?? "").trim(),
  }));
}

function winnerByScore(sc, teamAName, teamBName) {
  if (!sc) return "";
  if (sc.a > sc.b) return teamAName;
  if (sc.b > sc.a) return teamBName;
  return ""; // ничья
}

function renderMatches(matches, teamAName, teamBName) {
  const body = $("matchesBody");
  if (!body) return;
  body.innerHTML = "";

  // показываем ТОЛЬКО сыгранные: есть корректный счёт
  const played = matches
    .map((m, idx) => ({ ...m, idx }))
    .filter((m) => parseScore(m.score));

  if (played.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="rMuted">Пока нет сыгранных матчей</td>`;
    body.appendChild(tr);
    return;
  }

  played.forEach((m) => {
    const sc = parseScore(m.score);
    const win = winnerByScore(sc, teamAName, teamBName);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${m.idx + 1}</td>
      <td>${m.a || `<span class="rMuted">—</span>`}</td>
      <td>${m.b || `<span class="rMuted">—</span>`}</td>
      <td>${m.score}</td>
      <td>${win ? win : `<span class="rMuted">—</span>`}</td>
    `;
    body.appendChild(tr);
  });
}

function computeStandings(matches, teamAName, teamBName) {
  const base = [
    { team: teamAName, wins: 0, losses: 0, for: 0, against: 0, diff: 0 },
    { team: teamBName, wins: 0, losses: 0, for: 0, against: 0, diff: 0 },
  ];

  const map = new Map();
  base.forEach((x) => map.set(x.team, x));

  for (const m of matches) {
    const sc = parseScore(m.score);
    if (!sc) continue;

    const A = map.get(teamAName);
    const B = map.get(teamBName);

    A.for += sc.a; A.against += sc.b;
    B.for += sc.b; B.against += sc.a;

    if (sc.a > sc.b) { A.wins += 1; B.losses += 1; }
    else if (sc.b > sc.a) { B.wins += 1; A.losses += 1; }
  }

  base.forEach((x) => (x.diff = x.for - x.against));

  base.sort((x, y) => {
    if (y.wins !== x.wins) return y.wins - x.wins;
    if (y.diff !== x.diff) return y.diff - x.diff;
    return y.for - x.for;
  });

  return base;
}

function renderStandings(rows) {
  const body = $("standingsBody");
  if (!body) return;
  body.innerHTML = "";

  rows.forEach((r, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${r.team}</td>
      <td>${r.wins}</td>
      <td>${r.losses}</td>
      <td>${r.for}:${r.against}</td>
      <td>${r.diff >= 0 ? "+" : ""}${r.diff}</td>
    `;
    body.appendChild(tr);
  });
}

function renderRosters(teamAName, teamBName, teamAPlayers, teamBPlayers) {
  $("rosterTeamA").textContent = teamAName;
  $("rosterTeamB").textContent = teamBName;

  const ulA = $("rosterA");
  const ulB = $("rosterB");
  ulA.innerHTML = "";
  ulB.innerHTML = "";

  const a = Array.isArray(teamAPlayers) ? teamAPlayers : [];
  const b = Array.isArray(teamBPlayers) ? teamBPlayers : [];

  const fill = (ul, arr) => {
    const clean = arr.map(x => String(x || "").trim()).filter(Boolean);
    if (clean.length === 0) {
      const li = document.createElement("li");
      li.className = "rMuted";
      li.textContent = "—";
      ul.appendChild(li);
      return;
    }
    clean.forEach((name) => {
      const li = document.createElement("li");
      li.textContent = name;
      ul.appendChild(li);
    });
  };

  fill(ulA, a);
  fill(ulB, b);
}

function applyState(s) {
  const teamAName = safeName(s?.teamA, "Команда A");
  const teamBName = safeName(s?.teamB, "Команда B");

  // заголовки
  const thA = $("thTeamA");
  const thB = $("thTeamB");
  if (thA) thA.textContent = teamAName;
  if (thB) thB.textContent = teamBName;

  const matches = normalizeMatches(s?.matches);
  renderMatches(matches, teamAName, teamBName);
  renderStandings(computeStandings(matches, teamAName, teamBName));

  renderRosters(
    teamAName,
    teamBName,
    s?.teamAPlayers,
    s?.teamBPlayers
  );

  // статус
  const playedCount = matches.filter(m => parseScore(m.score)).length;
  const st = $("statusLine");
  if (st) st.textContent = `Обновлено • сыграно матчей: ${playedCount}`;

  // кеш на случай рестартов/простая
  saveCache({
    teamA: teamAName,
    teamB: teamBName,
    teamAPlayers: s?.teamAPlayers ?? [],
    teamBPlayers: s?.teamBPlayers ?? [],
    matches
  });
}

socket.on("connect", () => {
  socket.emit("getState");
});

socket.on("state", (s) => {
  // если сервер прислал пусто (после простоя/рестарта) — восстановим из localStorage
  const hasSomething =
    (s?.teamA || s?.teamB) ||
    (Array.isArray(s?.matches) && s.matches.some(m => String(m?.score || "").trim()));

  if (!hasSomething) {
    const cached = loadCache();
    if (cached) {
      applyState(cached);
      return;
    }
  }

  applyState(s || {});
});
