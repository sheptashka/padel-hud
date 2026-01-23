const socket = io();

function $(id) {
  return document.getElementById(id);
}

function parseScore(score) {
  if (!score) return null;
  const m = String(score).trim().match(/^(\d+)\s*[:\-]\s*(\d+)$/);
  if (!m) return null;
  return { a: Number(m[1]), b: Number(m[2]) };
}

function renderMatches(matches, teamA, teamB) {
  const body = $("matchesBody");
  if (!body) return;

  body.innerHTML = "";

  const played = matches.filter(m => parseScore(m.score));

  if (played.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="5" style="color:#888">Нет сыгранных матчей</td>
      </tr>
    `;
    return;
  }

  played.forEach((m, i) => {
    const sc = parseScore(m.score);
    const winner =
      sc.a > sc.b ? teamA :
      sc.b > sc.a ? teamB :
      "—";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${m.a || "—"}</td>
      <td>${m.b || "—"}</td>
      <td>${m.score}</td>
      <td>${winner}</td>
    `;
    body.appendChild(tr);
  });
}

function renderTable(matches, teamA, teamB) {
  const body = $("standingsBody");
  if (!body) return;

  const stats = {
    A: { name: teamA, wins: 0, losses: 0, for: 0, against: 0 },
    B: { name: teamB, wins: 0, losses: 0, for: 0, against: 0 }
  };

  matches.forEach(m => {
    const sc = parseScore(m.score);
    if (!sc) return;

    stats.A.for += sc.a;
    stats.A.against += sc.b;
    stats.B.for += sc.b;
    stats.B.against += sc.a;

    if (sc.a > sc.b) {
      stats.A.wins++;
      stats.B.losses++;
    } else if (sc.b > sc.a) {
      stats.B.wins++;
      stats.A.losses++;
    }
  });

  body.innerHTML = "";

  ["A", "B"].forEach((k, i) => {
    const t = stats[k];
    const diff = t.for - t.against;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${t.name}</td>
      <td>${t.wins}</td>
      <td>${t.losses}</td>
      <td>${t.for}:${t.against}</td>
      <td>${diff >= 0 ? "+" : ""}${diff}</td>
    `;
    body.appendChild(tr);
  });
}

function renderRosters(rosters, teamA, teamB) {
  $("rosterA").innerHTML = (rosters?.A || []).map(p => `<li>${p}</li>`).join("");
  $("rosterB").innerHTML = (rosters?.B || []).map(p => `<li>${p}</li>`).join("");

  $("rosterTitleA").textContent = teamA;
  $("rosterTitleB").textContent = teamB;
}

socket.on("connect", () => {
  $("statusLine").textContent = "Загружаем…";
  socket.emit("getState");
});

socket.on("state", (s) => {
  if (!s) return;

  const teamA = s.teamA || "Команда A";
  const teamB = s.teamB || "Команда B";
  const matches = Array.isArray(s.matches) ? s.matches : [];

  $("statusLine").textContent = `Обновлено • сыграно матчей: ${matches.filter(m => parseScore(m.score)).length}`;

  renderMatches(matches, teamA, teamB);
  renderTable(matches, teamA, teamB);
  renderRosters(s.rosters || {}, teamA, teamB);
});
