function formatDate(iso) {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y.slice(2)}`;
}

function animateNumber(from, to, duration, render) {
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) * (1 - t); // ease-out
    render(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function animateBar(fillEl, valueEl, value, max) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  animateNumber(0, pct, 700, (v) => { fillEl.style.width = v + "%"; });
  animateNumber(0, value, 700, (v) => { valueEl.textContent = `${v.toFixed(0)}/${max.toFixed(0)} XP`; });
}

function renderSeasonOverview(f) {
  const el = document.getElementById("season-overview");
  const heuteIso = new Date().toISOString().slice(0, 10);
  const heuteXp = (f.log || [])
    .filter((e) => e.datum === heuteIso)
    .reduce((s, e) => s + e.xp, 0);

  el.innerHTML = `
    <div class="season-row">
      <div class="label">Heute</div>
      <div class="track"><div class="fill" id="bar-heute" style="width:0%; background:var(--ok)"></div></div>
      <div class="value" id="val-heute">0/${f.tagesziel.toFixed(0)} XP</div>
    </div>
    <div class="season-row">
      <div class="label">Season 1</div>
      <div class="track"><div class="fill" id="bar-season" style="width:0%"></div></div>
      <div class="value" id="val-season">0/${f.gesamt_xp} XP</div>
    </div>
    <div class="season-row">
      <div class="label">${iconSvg("layers")}Grundl.</div>
      <div class="track"><div class="fill" id="bar-grundlagen" style="width:0%; background:var(--violet)"></div></div>
      <div class="value" id="val-grundlagen">0/${f.grundlagen_gesamt_xp} XP</div>
    </div>
    <p class="muted" style="margin-top:10px;">Ziel: ${f.season.ziel} · Deadline ${formatDate(f.season.deadline)}</p>
    <p class="muted">${iconSvg("layers")}Grundlagen sind Voraussetzungen außerhalb des Skripts (z.B. Indexnotation) — zählen nicht in Season 1, sind aber genauso wichtig.</p>
  `;

  animateBar(document.getElementById("bar-heute"), document.getElementById("val-heute"), heuteXp, f.tagesziel || 1);
  animateBar(document.getElementById("bar-season"), document.getElementById("val-season"), f.erreicht_xp, f.gesamt_xp);
  animateBar(document.getElementById("bar-grundlagen"), document.getElementById("val-grundlagen"), f.grundlagen_erreicht_xp, f.grundlagen_gesamt_xp || 1);
}

function renderPace(f) {
  const el = document.getElementById("pace-info");
  const p = f.pace;

  if (!p || p.xp_pro_tag <= 0) {
    el.innerHTML = `<div class="pace-card"><p class="muted">Noch keine Daten fürs Tempo — nach der ersten Session siehst du hier eine Prognose.</p></div>`;
    return;
  }

  el.innerHTML = `
    <div class="pace-card ${p.im_plan ? "on-track" : "behind"}">
      <div class="big">${p.xp_pro_tag} XP/Tag</div>
      <p>im Schnitt seit Season-Start. Bei diesem Tempo bist du am
      <strong>${formatDate(p.projiziertes_ende)}</strong> fertig —
      ${p.im_plan ? `vor der Deadline ${iconSvg("sparkle")}` : "das ist nach der Deadline, etwas anziehen!"}</p>
    </div>
  `;
}

function renderXpChart(taeglich) {
  const el = document.getElementById("xp-chart");
  const max = Math.max(1, ...taeglich.map((d) => d.xp));
  const heuteIso = new Date().toISOString().slice(0, 10);

  el.innerHTML = taeglich
    .map(
      (d) => `
    <div class="xp-bar-wrap" title="${d.datum}: ${d.xp} XP">
      <div class="xp-bar${d.datum === heuteIso ? " today" : ""}" style="height:${Math.max(2, (d.xp / max) * 100)}%"></div>
      <div class="xp-bar-label">${d.tag}</div>
    </div>`
    )
    .join("");
}

function renderBadges(badges) {
  const el = document.getElementById("badge-grid");
  el.innerHTML = (badges || [])
    .map(
      (b) => `
    <div class="badge-tile${b.erreicht ? " earned" : ""}" title="${b.beschreibung}">
      <div class="badge-icon">${iconSvg(b.erreicht ? "medal" : "lock", "icon-nm")}</div>
      <div class="badge-title">${b.titel}</div>
    </div>`
    )
    .join("");
}

function renderHeatmap(log) {
  const el = document.getElementById("heatmap");
  const totals = {};
  (log || []).forEach((e) => {
    totals[e.datum] = (totals[e.datum] || 0) + e.xp;
  });

  const heute = new Date();
  const TAGE = 91; // ~13 Wochen, wie das GitHub-Beitragsraster
  const start = new Date(heute);
  start.setDate(start.getDate() - (TAGE - 1));
  const startWochentag = (start.getDay() + 6) % 7; // 0 = Montag
  start.setDate(start.getDate() - startWochentag);

  const cells = [];
  const cursor = new Date(start);
  while (cursor <= heute) {
    const iso = cursor.toISOString().slice(0, 10);
    cells.push({ iso, xp: totals[iso] || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  const max = Math.max(1, ...cells.map((c) => c.xp));
  const levelOf = (xp) => (xp <= 0 ? 0 : Math.min(4, Math.ceil((xp / max) * 4)));

  const wochen = [];
  for (let i = 0; i < cells.length; i += 7) wochen.push(cells.slice(i, i + 7));

  el.innerHTML = `<div class="heatmap-grid">${wochen
    .map(
      (woche) => `<div class="heatmap-col">${woche
        .map((c) => `<div class="heatmap-cell lvl${levelOf(c.xp)}" title="${c.iso}: ${c.xp} XP"></div>`)
        .join("")}</div>`
    )
    .join("")}</div>`;
}

function renderWeekCompare(f) {
  const el = document.getElementById("week-compare");
  const w = f.wochenvergleich;
  const diff = w.differenz;
  const richtung = diff > 0 ? "▲ mehr" : diff < 0 ? "▼ weniger" : "— gleich viel";
  const farbe = diff > 0 ? "var(--ok)" : diff < 0 ? "var(--accent)" : "var(--text-muted)";
  el.innerHTML = `
    <div class="pace-card">
      <div class="big">${w.diese_woche.toFixed(0)} XP</div>
      <p>diese Woche · letzte Woche: ${w.letzte_woche.toFixed(0)} XP ·
      <span style="color:${farbe}; font-weight:600;">${Math.abs(diff).toFixed(0)} XP ${richtung}</span></p>
    </div>
  `;
}

function renderWeekChart(woechentlich) {
  const el = document.getElementById("week-chart");
  const max = Math.max(1, ...woechentlich.map((w) => w.xp));
  const dieseWoche = woechentlich[woechentlich.length - 1]?.woche_start;

  el.innerHTML = woechentlich
    .map((w) => {
      const [, m, d] = w.woche_start.split("-");
      return `
    <div class="xp-bar-wrap" title="Woche ab ${d}.${m}.: ${w.xp} XP">
      <div class="xp-bar${w.woche_start === dieseWoche ? " today" : ""}" style="height:${Math.max(2, (w.xp / max) * 100)}%"></div>
      <div class="xp-bar-label">${d}.${m}.</div>
    </div>`;
    })
    .join("");
}

// Trefferquote (unten definiert) und Kalibrierung beantworten bewusst zwei
// verschiedene Fragen und bleiben deshalb in getrennten Funktionen/Sektionen:
// "schaffe ich es ohne Hilfe" (Trefferquote) vs. "weiss ich, was ich nicht
// weiss" (Kalibrierung -- kreuzt Trefferquote mit der Sicherheits-Vorhersage).
function renderCalibration(auswertung) {
  const el = document.getElementById("calibration-chart");
  const hatDaten = auswertung.some((s) => s.trefferquote !== null);

  if (!hatDaten) {
    el.innerHTML = '<p class="muted">Noch keine Daten — nach ein paar Aufgaben mit Sicherheitseinschätzung siehst du hier, wie gut du dich selbst einschätzt.</p>';
    return;
  }

  el.innerHTML = `
    <div class="xp-chart" style="align-items:flex-end;">
      ${auswertung
        .map((s) => {
          const pct = s.trefferquote === null ? 0 : s.trefferquote * 100;
          const label = s.trefferquote === null ? "–" : `${Math.round(pct)}%`;
          return `
        <div class="xp-bar-wrap" title="Sicherheit ${s.stufe}: ${label} Trefferquote (${s.anzahl} Einschätzungen)">
          <div class="xp-bar" style="height:${Math.max(2, pct)}%; background:${s.trefferquote === null ? "var(--border)" : "var(--accent)"}"></div>
          <div class="xp-bar-label">${s.stufe} (${label})</div>
        </div>`;
        })
        .join("")}
    </div>
  `;
}

// Zeigt Prozent PLUS den Verlauf der letzten Aufgaben als Balkenfolge --
// ein Schnitt allein verschleiert, ob es gleichmaessig oder durchwachsen lief
// (z.B. 5x richtig, 5x falsch ergibt denselben Schnitt wie durchgehend halb).
function renderTrefferquote(tq) {
  const el = document.getElementById("trefferquote-chart");
  if (!tq) {
    el.innerHTML = '<p class="muted">Noch keine bewerteten Aufgaben — die erste liefert die erste Zahl hier.</p>';
    return;
  }

  const pct = Math.round(tq.quote * 100);
  const imZiel = pct >= 70 && pct <= 80;
  const hinweis = imZiel
    ? "genau im Zielkorridor — Schwierigkeit passt gerade."
    : pct > 80
    ? "über dem Zielkorridor — Aufgaben dürften ruhig schwerer werden."
    : "unter dem Zielkorridor — eine Stufe leichter wäre dran.";

  const balken = tq.verlauf
    .map((v) => {
      const h = Math.max(4, v.score * 100);
      const farbe = v.score === 1 ? "var(--ok)" : v.score === 0.5 ? "var(--accent)" : "var(--text-muted)";
      const symbol = v.score === 1 ? "✓" : v.score === 0.5 ? "~" : "✗";
      return `
        <div class="xp-bar-wrap" title="${v.konzept_id || "?"}: ${v.ergebnis}">
          <div class="xp-bar" style="height:${h}%; background:${farbe}"></div>
          <div class="xp-bar-label">${symbol}</div>
        </div>`;
    })
    .join("");

  el.innerHTML = `
    <div class="pace-card ${imZiel ? "on-track" : "behind"}" style="margin-bottom:16px;">
      <div class="big">${pct}%</div>
      <p>Trefferquote der letzten ${tq.n} bewerteten Aufgaben · Ziel 70–80% · ${hinweis}</p>
    </div>
    <div class="xp-chart" style="align-items:flex-end;">${balken}</div>
  `;
}

function renderConceptGrid(konzepte) {
  const el = document.getElementById("concept-grid");
  const uebungen = [...new Set(konzepte.map((c) => c.ue))].sort();

  el.innerHTML = uebungen
    .map((ue) => {
      const g = konzepte.filter((c) => c.ue === ue);
      const ges = g.reduce((s, c) => s + c.xp, 0);
      const err = g.reduce((s, c) => s + c.xp * c.xp_anteil, 0);
      const pills = g
        .map(
          (c) =>
            `<span class="concept-pill g${c.grad}" title="[${c.ue}] ${c.name} — Grad ${c.grad}/3"></span>`
        )
        .join("");
      return `
        <div class="ue-block">
          <div class="ue-block-title">${ue} — ${Math.round((err / ges) * 100)}%</div>
          <div>${pills}</div>
        </div>`;
    })
    .join("");
}

function renderMisc(f) {
  const el = document.getElementById("misc-stats");
  const tage = new Set((f.log || []).map((e) => e.datum)).size;

  el.innerHTML = `
    <div class="misc-grid">
      <div class="misc-tile"><div class="num">${iconSvg("flame")}${f.streak.aktuell}</div><div class="label">Streak (Best ${f.streak.bester})</div></div>
      <div class="misc-tile"><div class="num">${tage}</div><div class="label">Lerntage bisher</div></div>
      <div class="misc-tile"><div class="num">${f.fehlerlog_offen}</div><div class="label">Offene Fehlerlog-Einträge</div></div>
    </div>
  `;
}

async function loadStats() {
  const res = await fetch("/api/stats");
  const f = await res.json();
  renderSeasonOverview(f);
  renderPace(f);
  renderXpChart(f.taeglich);
  renderBadges(f.badges);
  renderHeatmap(f.log);
  renderWeekCompare(f);
  renderWeekChart(f.woechentlich);
  renderTrefferquote(f.trefferquote);
  renderCalibration(f.kalibrierung_auswertung);
  renderConceptGrid(f.konzepte);
  renderMisc(f);
}

loadStats();
