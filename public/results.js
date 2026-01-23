const socket = io();

const DEFAULT_MATCHES = [
  ["A1+A2", "B1+B2"],
  ["A1+A2", "B1+B3"],
  ["A1+A2", "B2+B3"],
  ["A1+A3", "B1+B2"],
  ["A1+A3", "B1+B3"],
  ["A1+A3", "B2+B3"],
  ["A2+A3", "B1+B2"],
  ["A2+A3", "B1+B3"],
  ["A2+A3", "B2+B3"],
];

function $(id){ return document.getElementById(id); }

function parseScore(score){
  if(!score) return null;
  const s = String(score).trim();
  const m = s.match(/^(\d+)\s*[:\-]\s*(\d+)$/);
  if(!m) return null;
  return { a: Number(m[1]), b: Number(m[2]) };
}

function teamFromPair(pair){
  const s = String(pair || "").trim().toUpperCase();
  if(s.startsWith("A")) return "A";
  if(s.startsWith("B")) return "B";
  return "?";
}

function normalizeMatches(matchesFromState){
  // если сервер ещё не хранит matches — показываем дефолтную сетку
  if(!Array.isArray(matchesFromState) || matchesFromState.length === 0){
    return DEFAULT_MATCHES.map(([a,b], i) => ({ id:i+1, a, b, score:"", winner:"" }));
  }
  // приводим к ожидаемому формату
  return matchesFromState.map((m, i) => ({
    id: m.id ?? (i+1),
    a: m.a ?? "",
    b: m.b ?? "",
    score: m.score ?? "",
    winner: m.winner ?? ""
  }));
}

function renderMatches(matches){
  const body = $("matchesBody");
  if(!body) return;
  body.innerHTML = "";

  matches.forEach((m, idx) => {
    const winner = m.winner === "A" ? "A" : (m.winner === "B" ? "B" : "");
    const winHtml = winner
      ? `<span class="badgeWin badge${winner}">${winner}</span>`
      : `<span class="mutedCell">—</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td>${m.a || "—"}</td>
      <td>${m.b || "—"}</td>
      <td>${m.score ? m.score : '<span class="mutedCell">—</span>'}</td>
      <td>${winHtml}</td>
    `;
    body.appendChild(tr);
  });
}

function computeStandings(matches){
  const teams = new Map();

  function ensure(t){
    if(!teams.has(t)){
      teams.set(t, { team:t, wins:0, losses:0, for:0, against:0, diff:0 });
    }
    return teams.get(t);
  }

  for(const m of matches){
    const tA = teamFromPair(m.a);
    const tB = teamFromPair(m.b);

    const A = ensure(tA);
    const B = ensure(tB);

    const sc = parseScore(m.score);
    if(sc){
      A.for += sc.a; A.against += sc.b;
      B.for += sc.b; B.against += sc.a;
    }

    if(m.winner === "A"){
      A.wins += 1; B.losses += 1;
    } else if(m.winner === "B"){
      B.wins += 1; A.losses += 1;
    }
  }

  const arr = [...teams.values()].map(x => ({...x, diff: x.for - x.against}));

  arr.sort((x,y)=>{
    if(y.wins !== x.wins) return y.wins - x.wins;
    if(y.diff !== x.diff) return y.diff - x.diff;
    return y.for - x.for;
  });

  return arr;
}

function renderStandings(rows){
  const body = $("standingsBody");
  if(!body) return;
  body.innerHTML = "";

  if(rows.length === 0){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" class="mutedCell">Нет данных</td>`;
    body.appendChild(tr);
    return;
  }

  rows.forEach((r, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td class="left"><b>Команда ${r.team}</b></td>
      <td>${r.wins}</td>
      <td>${r.losses}</td>
      <td>${r.for}:${r.against}</td>
      <td>${r.diff >= 0 ? "+" : ""}${r.diff}</td>
    `;
    body.appendChild(tr);
  });
}

socket.on("connect", ()=>{
  const st = $("statusLine");
  if(st) st.textContent = "Подключено. Загружаем данные…";
  socket.emit("getState");
});

socket.on("state", (s)=>{
  const matches = normalizeMatches(s?.matches);
  renderMatches(matches);
  renderStandings(computeStandings(matches));

  const st = $("statusLine");
  if(st){
    st.textContent = `Обновлено • матчей: ${matches.length}`;
  }
});
