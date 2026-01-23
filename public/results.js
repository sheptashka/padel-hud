const socket = io();
function $(id){ return document.getElementById(id); }

function parseScore(score){
  if(!score) return null;
  const s = String(score).trim();
  const m = s.match(/^(\d+)\s*[:\-]\s*(\d+)$/);
  if(!m) return null;
  return { a: Number(m[1]), b: Number(m[2]) };
}

function computeWinnerFromScore(score){
  const sc = parseScore(score);
  if(!sc) return "";
  if(sc.a === sc.b) return "";
  return sc.a > sc.b ? "A" : "B";
}

function normalizeMatches(matchesFromState){
  if(!Array.isArray(matchesFromState)) return [];
  return matchesFromState.map((m, i) => ({
    id: m.id ?? (i+1),
    a: String(m.a ?? "").trim(),
    b: String(m.b ?? "").trim(),
    score: String(m.score ?? "").trim(),
  }));
}

const MATCHES_KEY = "padel_matches_v1";

function loadMatchesLocal(){
  try{
    const raw = localStorage.getItem(MATCHES_KEY);
    if(!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  }catch(_){ return null; }
}

function saveMatchesLocal(matches){
  try{ localStorage.setItem(MATCHES_KEY, JSON.stringify(matches)); }catch(_){}
}


function isPlayed(m){
  return !!parseScore(m.score);
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function setHeaderNames(teamA, teamB){
  const colA = $("colResA");
  const colB = $("colResB");
  if(colA) colA.textContent = teamA;
  if(colB) colB.textContent = teamB;
}

function renderMatches(playedMatches, teamA, teamB){
  const body = $("matchesBody");
  if(!body) return;
  body.innerHTML = "";

  if(playedMatches.length === 0){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="mutedCellPlain">Пока нет сыгранных матчей</td>`;
    body.appendChild(tr);
    return;
  }

  playedMatches.forEach((m) => {
    const w = computeWinnerFromScore(m.score);
    const winnerName = (w === "A") ? teamA : (w === "B" ? teamB : "—");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${m.id}</td>
      <td class="left clipPlain">${escapeHtml(m.a || "—")}</td>
      <td class="left clipPlain">${escapeHtml(m.b || "—")}</td>
      <td>${escapeHtml(m.score)}</td>
      <td class="left">${escapeHtml(winnerName)}</td>
    `;
    body.appendChild(tr);
  });
}


  playedMatches.forEach((m) => {
    const w = computeWinnerFromScore(m.score);
    const winnerName = (w === "A") ? teamA : (w === "B" ? teamB : "—");

    const winHtml = (winnerName === "—")
      ? `<span class="mutedCell">—</span>`
      : `<span class="pillWin">${escapeHtml(winnerName)}</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="num">${m.id}</td>
      <td class="left clip">${escapeHtml(m.a || "—")}</td>
      <td class="left clip">${escapeHtml(m.b || "—")}</td>
      <td class="score">${escapeHtml(m.score)}</td>
      <td>${winHtml}</td>
    `;
    body.appendChild(tr);
  });
}

function computeStandings(playedMatches, teamA, teamB){
  const A = { team: teamA, wins:0, losses:0, for:0, against:0, diff:0 };
  const B = { team: teamB, wins:0, losses:0, for:0, against:0, diff:0 };

  for(const m of playedMatches){
    const sc = parseScore(m.score);
    if(!sc) continue;

    A.for += sc.a; A.against += sc.b;
    B.for += sc.b; B.against += sc.a;

    const w = computeWinnerFromScore(m.score);
    if(w === "A"){ A.wins += 1; B.losses += 1; }
    else if(w === "B"){ B.wins += 1; A.losses += 1; }
  }

  A.diff = A.for - A.against;
  B.diff = B.for - B.against;

  const rows = [A, B];
  rows.sort((x,y)=>{
    if(y.wins !== x.wins) return y.wins - x.wins;
    if(y.diff !== x.diff) return y.diff - x.diff;
    return y.for - x.for;
  });

  return rows;
}

function renderStandings(rows){
  const body = $("standingsBody");
  if(!body) return;
  body.innerHTML = "";

  rows.forEach((r, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="num">${idx+1}</td>
      <td class="left clip"><b>${escapeHtml(r.team)}</b></td>
      <td>${r.wins}</td>
      <td>${r.losses}</td>
      <td>${r.for}:${r.against}</td>
      <td>${r.diff >= 0 ? "+" : ""}${r.diff}</td>
    `;
    body.appendChild(tr);
  });
}

function renderRoster(listId, arr){
  const ul = $(listId);
  if(!ul) return;
  ul.innerHTML = "";

  const clean = (arr || []).map(x => String(x||"").trim()).filter(Boolean);

  if(clean.length === 0){
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "—";
    ul.appendChild(li);
    return;
  }

  clean.forEach(p=>{
    const li = document.createElement("li");
    li.textContent = p;
    ul.appendChild(li);
  });
}

socket.on("connect", ()=>{
  const st = $("statusLine");
  if(st) st.textContent = "Подключено. Загружаем данные…";
  socket.emit("getState");
});

socket.on("state", (s)=>{
  const serverMatches = normalizeMatches(s?.matches);

  // берём только реально сыгранные матчи (с корректным score)
  const played = serverMatches.filter(m => parseScore(m.score));

  // Если сервер прислал пусто/0 сыгранных — попробуем восстановить из localStorage
  const local = loadMatchesLocal();
  if(played.length === 0 && local && Array.isArray(local) && local.length){
    const localNorm = normalizeMatches(local);
    const localPlayed = localNorm.filter(m => parseScore(m.score));

    if(localPlayed.length){
      // показываем из local
      renderMatches(localPlayed, s?.teamA || "Команда A", s?.teamB || "Команда B");
      renderStandings(computeStandings(localNorm, s?.teamA || "Команда A", s?.teamB || "Команда B"));
      // и пушим на сервер (чтобы не надо было жать “сохранить” в админке)
      socket.emit("setMatches", localNorm);

      const st = $("statusLine");
      if(st) st.textContent = `Восстановлено из браузера • сыграно матчей: ${localPlayed.length}`;
      return;
    }
  }

  // обычный сценарий
  renderMatches(played, s?.teamA || "Команда A", s?.teamB || "Команда B");
  renderStandings(computeStandings(serverMatches, s?.teamA || "Команда A", s?.teamB || "Команда B"));

  // сохраним актуальное в localStorage
  saveMatchesLocal(serverMatches);

  const st = $("statusLine");
  if(st) st.textContent = `Обновлено • сыграно матчей: ${played.length}`;
});

  // Rosters
  const rA = Array.isArray(s?.rosterA) ? s.rosterA : [];
  const rB = Array.isArray(s?.rosterB) ? s.rosterB : [];
  const tA = $("rosterTeamAName");
  const tB = $("rosterTeamBName");
  if(tA) tA.textContent = teamA;
  if(tB) tB.textContent = teamB;
  renderRoster("rosterA", rA);
  renderRoster("rosterB", rB);

  const matchesAll = normalizeMatches(s?.matches);
  const played = matchesAll.filter(isPlayed);

  renderMatches(played, teamA, teamB);
  renderStandings(computeStandings(played, teamA, teamB));

  const st = $("statusLine");
  if(st) st.textContent = `Обновлено • сыграно матчей: ${played.length}`;
});
