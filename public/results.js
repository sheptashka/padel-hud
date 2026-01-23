const socket = io();
function $(id){ return document.getElementById(id); }

function parseScore(score){
  if(!score) return null;
  const s = String(score).trim();
  const m = s.match(/^(\d+)\s*[:\-]\s*(\d+)$/);
  if(!m) return null;
  return { a: Number(m[1]), b: Number(m[2]) };
}

function normalizeMatches(matchesFromState){
  if(!Array.isArray(matchesFromState)) return [];
  return matchesFromState.map((m, i) => ({
    id: m.id ?? (i+1),
    a: String(m.a ?? "").trim(),
    b: String(m.b ?? "").trim(),
    score: String(m.score ?? "").trim(),
    winner: (m.winner === "A" || m.winner === "B") ? m.winner : ""
  }));
}

function isPlayed(m){
  // "сыгранный" = есть валидный счет + выбран победитель
  const sc = parseScore(m.score);
  if(!sc) return false;
  if(m.winner !== "A" && m.winner !== "B") return false;
  return true;
}

function setHeaderNames(teamA, teamB){
  const colA = $("colResA");
  const colB = $("colResB");
  if(colA) colA.textContent = teamA;
  if(colB) colB.textContent = teamB;
}

function renderMatches(matches, teamA, teamB){
  const body = $("matchesBody");
  if(!body) return;
  body.innerHTML = "";

  if(matches.length === 0){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="mutedCell">Пока нет сыгранных матчей</td>`;
    body.appendChild(tr);
    return;
  }

  matches.forEach((m) => {
    const winnerName = (m.winner === "A") ? teamA : teamB;
    const winHtml = `<span class="badgeWin">${escapeHtml(winnerName)}</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${m.id}</td>
      <td class="left">${escapeHtml(m.a || "—")}</td>
      <td class="left">${escapeHtml(m.b || "—")}</td>
      <td>${escapeHtml(m.score)}</td>
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

    // по нашему формату счет "A:B" (колонка A — команда A, колонка B — команда B)
    A.for += sc.a; A.against += sc.b;
    B.for += sc.b; B.against += sc.a;

    if(m.winner === "A"){
      A.wins += 1; B.losses += 1;
    } else if(m.winner === "B"){
      B.wins += 1; A.losses += 1;
    }
  }

  A.diff = A.for - A.against;
  B.diff = B.for - B.against;

  // сортировка: победы, разница, забито
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
      <td>${idx+1}</td>
      <td class="left"><b>${escapeHtml(r.team)}</b></td>
      <td>${r.wins}</td>
      <td>${r.losses}</td>
      <td>${r.for}:${r.against}</td>
      <td>${r.diff >= 0 ? "+" : ""}${r.diff}</td>
    `;
    body.appendChild(tr);
  });
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

socket.on("connect", ()=>{
  const st = $("statusLine");
  if(st) st.textContent = "Подключено. Загружаем данные…";
  socket.emit("getState");
});

socket.on("state", (s)=>{
  const teamA = String(s?.teamA ?? "Команда A").trim() || "Команда A";
  const teamB = String(s?.teamB ?? "Команда B").trim() || "Команда B";

  setHeaderNames(teamA, teamB);

  const matchesAll = normalizeMatches(s?.matches);
  const played = matchesAll.filter(isPlayed);

  renderMatches(played, teamA, teamB);
  renderStandings(computeStandings(played, teamA, teamB));

  const st = $("statusLine");
  if(st){
    st.textContent = `Обновлено • сыграно матчей: ${played.length}`;
  }
});
