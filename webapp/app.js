const $messages = document.getElementById("messages");
const $input = document.getElementById("input");
const $sendBtn = document.getElementById("send-btn");
const $form = document.getElementById("input-row");
const $quickActions = document.querySelectorAll("#quick-actions button");
const $taskContent = document.getElementById("task-content");
const $uebungenList = document.getElementById("uebungen-list");
const $wdhList = document.getElementById("wiederholung-list");
const $toastStack = document.getElementById("toast-stack");
const $newSessionBtn = document.getElementById("new-session-btn");

let busy = false;
let letzterStand = null; // letzter /api/status-Fortschritt -- fuer die XP-Aufschluesselung beim Klick auf einen Meter

let KATEX_MACROS = {};
fetch("/config.json")
  .then((r) => r.json())
  .then((cfg) => { KATEX_MACROS = cfg.katex_macros || {}; })
  .catch(() => {});

// marked.parse() escaped Backslashes wie ganz normalen Markdown-Text -- "\\"
// (der LaTeX-Zeilenumbruch in einer Matrix) wird dabei zu einem einzelnen "\",
// noch bevor KaTeX den Text je sieht. Ergebnis: jede mehrzeilige Matrix faellt
// in eine Zeile zusammen (einzeilige Formeln ohne "\\" sind nicht betroffen,
// daher "manchmal"). Fix: Mathe-Bloecke vor marked.parse() durch Platzhalter
// ersetzen und danach unveraendert wieder einsetzen, damit KaTeX den rohen
// LaTeX-Quelltext bekommt statt einer von marked() bereits veraenderten Fassung.
//
// Das Inline-Pattern ($...$) erlaubt bewusst auch Zeilenumbrueche darin: eine
// im Quelltext umgebrochene Formel (z.B. "$\lambda\,\tr(E)\,1 +\n2\mu\,E$")
// wurde sonst NICHT als Mathe erkannt und lief roh durch marked() -- "\," wird
// dann zu "," (gleiches Escaping-Problem wie bei "\\") UND eine Fortsetzungs-
// zeile, die zufaellig mit "+" oder "-" beginnt, wird faelschlich als Listen-
// punkt interpretiert. Einzige Grenze: nicht ueber eine Leerzeile (Absatz-
// ende) hinweg matchen, sonst koennte ein einzelnes verirrtes "$" (z.B. ein
// Geldbetrag) den Rest des Dokuments verschlucken.
function mdWithMath(text) {
  const mathBloecke = [];
  const stashed = (text || "").replace(/\$\$[\s\S]*?\$\$|\$(?:[^$]|\n(?!\n))+?\$/g, (m) => {
    mathBloecke.push(m);
    return `@@MATH${mathBloecke.length - 1}@@`;
  });
  let html = marked.parse(stashed);
  return html.replace(/@@MATH(\d+)@@/g, (_, i) =>
    mathBloecke[Number(i)].replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  );
}

const TOOL_LABELS = {
  Read: iconSvg("book-open") + "liest eine Datei",
  Write: iconSvg("pencil") + "schreibt eine Datei",
  Edit: iconSvg("pencil") + "bearbeitet eine Datei",
  Bash: iconSvg("terminal") + "führt etwas aus",
  Glob: iconSvg("search") + "sucht Dateien",
  Grep: iconSvg("search") + "durchsucht Text",
};

function spawnConfetti() {
  const farben = ["var(--accent)", "var(--ok)", "var(--violet)", "#f5b400"];
  const container = document.createElement("div");
  container.className = "confetti-burst";
  for (let i = 0; i < 24; i++) {
    const stueck = document.createElement("span");
    stueck.className = "confetti-piece";
    stueck.style.setProperty("--x", `${(Math.random() - 0.5) * 240}px`);
    stueck.style.setProperty("--y", `${120 + Math.random() * 140}px`);
    stueck.style.setProperty("--r", `${Math.random() * 720 - 360}deg`);
    stueck.style.setProperty("--delay", `${Math.random() * 150}ms`);
    stueck.style.background = farben[i % farben.length];
    container.appendChild(stueck);
  }
  document.body.appendChild(container);
  setTimeout(() => container.remove(), 1500);
}

function showLevelUps(konzepte) {
  if (!$toastStack) return;
  if (konzepte.length > 0) spawnConfetti();
  for (const c of konzepte) {
    const toast = document.createElement("div");
    toast.className = "levelup-toast";
    toast.innerHTML = `${iconSvg("sparkle")}<strong>${c.name}</strong> gemeistert!
      <span class="levelup-grad">[${c.ue}] Grad ${c.von} → ${c.nach}</span>`;
    $toastStack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 400);
    }, 4500);
  }
}

function renderMath(el, versucheUebrig = 20) {
  // katex.min.js/auto-render.min.js laden mit "defer" -- je nach Netzwerk-
  // Timing kann renderMath() vor ihnen fertig sein. Ohne Retry blieb die
  // Formel dann dauerhaft als rohes "$$...$$" stehen (mobil beobachtet).
  if (window.renderMathInElement) {
    renderMathInElement(el, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
      macros: KATEX_MACROS,
    });
  } else if (versucheUebrig > 0) {
    setTimeout(() => renderMath(el, versucheUebrig - 1), 50);
  }
}

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = "msg " + role;
  if (role === "system") {
    // System-Nachrichten kommen nur aus fest einprogrammierten Strings hier in
    // app.js (nie aus Nutzereingabe oder dem Chatverlauf-Server) -- innerHTML
    // ist hier sicher und noetig, damit die Icon-<svg>s darin gerendert werden.
    div.innerHTML = text;
  } else {
    div.innerHTML = mdWithMath(text);
    renderMath(div);
  }
  $messages.appendChild(div);
  $messages.scrollTop = $messages.scrollHeight;
  return div;
}

function setBusy(v) {
  busy = v;
  $sendBtn.disabled = v;
  $input.disabled = v;
  $quickActions.forEach((b) => (b.disabled = v));
}

async function loadStatus() {
  const res = await fetch("/api/status");
  const data = await res.json();

  // --- Aufgabenkarte ---
  if (data.aktuell_md && data.aktuell_md.trim()) {
    $taskContent.innerHTML = mdWithMath(data.aktuell_md);
    renderMath($taskContent);
  } else {
    $taskContent.innerHTML = '<p class="muted">Noch keine Aufgabe. Klick auf „Heute".</p>';
  }

  // --- Fortschritt ---
  const f = data.fortschritt;
  if (f) {
    letzterStand = f;

    // gesamt_xp/erreicht_xp kommen jetzt vom Server (schliesst Grundlagen korrekt
    // aus, ist teilaufgaben-bewusst) -- nicht mehr im Browser doppelt rechnen.
    const heuteIso = new Date().toISOString().slice(0, 10);
    const heuteXp = (f.log || [])
      .filter((e) => e.datum === heuteIso)
      .reduce((s, e) => s + e.xp, 0);

    setMeter("meter-heute", heuteXp, f.tagesziel || 1, f.tagesziel || 0);
    setMeter("meter-season", f.erreicht_xp, f.gesamt_xp, f.gesamt_xp);
    setMeter("meter-grundlagen", f.grundlagen_erreicht_xp, f.grundlagen_gesamt_xp || 1, f.grundlagen_gesamt_xp);

    document.getElementById("streak-badge").innerHTML = `${iconSvg("flame")}${f.streak.aktuell} (Best ${f.streak.bester})`;

    // Übungen (inkl. "Grundlagen" als eigene Gruppe, gleiche Darstellung)
    const uebungen = [...new Set(f.konzepte.map((c) => c.ue))].sort();
    $uebungenList.innerHTML = "";
    for (const ue of uebungen) {
      const g = f.konzepte.filter((c) => c.ue === ue);
      const ges = g.reduce((s, c) => s + c.xp, 0);
      const err = g.reduce((s, c) => s + c.xp * c.xp_anteil, 0);
      const done = g.every((c) => c.grad >= 2);
      const row = document.createElement("div");
      row.className = "ue-row" + (done ? " done" : "");
      row.title = `Klick: Konzepte in ${ue} ansehen`;
      row.innerHTML = `
        <div class="ue-name">${ue}</div>
        <div class="ue-track"><div class="ue-fill" style="width:${(err / ges) * 100}%"></div></div>
        <div class="ue-pct">${Math.round((err / ges) * 100)}%</div>
      `;
      row.addEventListener("click", () => openUebungDetail(ue));
      $uebungenList.appendChild(row);
    }

    // Wiederholungen
    const heute = new Date();
    const faellig = f.konzepte.filter(
      (c) => c.naechste_wiederholung && new Date(c.naechste_wiederholung) <= heute
    );
    $wdhList.innerHTML = "";
    if (faellig.length === 0) {
      $wdhList.innerHTML = `<p class="muted">${iconSvg("sparkle")}Nichts fällig</p>`;
    } else {
      for (const c of faellig) {
        const item = document.createElement("div");
        item.className = "wdh-item";
        item.textContent = `[${c.ue}] ${c.name}`;
        $wdhList.appendChild(item);
      }
    }
  }
}

// ---------- XP-Aufschluesselung: Klick auf einen Fortschrittsbalken zeigt,
// welche Konzepte (und bei Teilaufgaben: welche Teilschritte) die Zahl
// ergeben -- die gleiche xp_anteil-Rechnung, die auch die Balken fuellt,
// nicht separat neu erfunden. Jede Konzept-Zeile ist zusaetzlich klickbar
// (data-concept-id + origin, siehe Delegation weiter unten) und fuehrt zur
// Konzept-Detailansicht mit "Erklaer mir das"/"Uebung starten". ----------
function xpRowsForConcepts(konzepte, origin) {
  return konzepte.map((c) => {
    const beitrag = c.xp * c.xp_anteil;
    let html = `<div class="xpb-row row-clickable g${c.grad}" data-concept-id="${c.id}" data-origin-type="${origin.type}" data-origin-value="${origin.value}">
      <span>${c.name}</span>
      <span class="xpb-amount">${beitrag.toFixed(1)}/${c.xp} XP</span>
    </div>`;
    if (c.teilaufgaben && c.teilaufgaben.length) {
      html += `<div class="xpb-sub">` + c.teilaufgaben.map((t) => `
        <div class="xpb-subrow${t.erledigt ? " done" : ""}">
          ${iconSvg(t.erledigt ? "check-circle" : "circle", "icon-nm")}
          <span class="xpb-subdesc">${t.beschreibung}</span>
          <span class="xpb-subamount">${(c.xp * t.anteil).toFixed(1)} XP</span>
        </div>`).join("") + `</div>`;
    }
    return html;
  }).join("");
}

function xpBlockGroup(konzepte, blockOrder, origin) {
  let html = "";
  for (const block of blockOrder) {
    const g = konzepte.filter((c) => c.ue === block);
    if (!g.length) continue;
    const summe = g.reduce((s, c) => s + c.xp * c.xp_anteil, 0);
    const gesamt = g.reduce((s, c) => s + c.xp, 0);
    html += `<div class="xpb-block">
      <div class="xpb-block-title">${block}
        <span class="xpb-block-total">${summe.toFixed(1)}/${gesamt} XP</span>
      </div>
      ${xpRowsForConcepts(g, origin)}
    </div>`;
  }
  return html;
}

function renderXpDetail(kind, f) {
  if (kind === "heute") {
    const heuteIso = new Date().toISOString().slice(0, 10);
    const byId = Object.fromEntries(f.konzepte.map((c) => [c.id, c]));
    const heuteLog = (f.log || []).filter((e) => e.datum === heuteIso);
    const summe = heuteLog.reduce((s, e) => s + e.xp, 0);

    let html = `<div class="detail-title">Heute verdiente XP</div>`;
    html += `<div class="detail-meta">${summe.toFixed(1)} / ${(f.tagesziel || 0).toFixed(1)} XP Tagesziel</div>`;
    if (!heuteLog.length) {
      html += `<p class="muted" style="margin-top:14px;">Heute noch keine XP verdient.</p>`;
    } else {
      html += `<div class="detail-teilaufgaben" style="margin-top:14px;">`;
      for (const e of heuteLog) {
        const c = byId[e.id];
        const attrs = c ? `data-concept-id="${c.id}" data-origin-type="xpkind" data-origin-value="heute"` : "";
        html += `<div class="teil-row done${c ? " row-clickable" : ""}" ${attrs}>
          <span class="teil-desc">${c ? c.name : e.id}${c ? ` <span class="xpb-ue-tag">[${c.ue}]</span>` : ""}</span>
          <span class="teil-anteil">+${e.xp} XP</span>
        </div>`;
      }
      html += `</div>`;
    }
    return html;
  }

  if (kind === "season") {
    const skript = f.konzepte.filter((c) => c.typ !== "grundlage");
    const blockOrder = [...new Set(skript.map((c) => c.ue))];
    let html = `<div class="detail-title">Season 1 — XP-Zusammensetzung</div>`;
    html += `<div class="detail-meta">${f.erreicht_xp.toFixed(1)} / ${f.gesamt_xp} XP</div>`;
    html += xpBlockGroup(skript, blockOrder, { type: "xpkind", value: "season" });
    return html;
  }

  // kind === "grundlagen"
  const grundlagen = f.konzepte.filter((c) => c.typ === "grundlage");
  let html = `<div class="detail-title">Grundlagen — XP-Zusammensetzung</div>`;
  html += `<div class="detail-meta">${f.grundlagen_erreicht_xp.toFixed(1)} / ${f.grundlagen_gesamt_xp} XP</div>`;
  if (!grundlagen.length) {
    html += `<p class="muted" style="margin-top:14px;">Noch keine Grundlagen-Lücke entdeckt.</p>`;
  } else {
    html += xpBlockGroup(grundlagen, ["Grundlagen"], { type: "xpkind", value: "grundlagen" });
  }
  return html;
}

// Klick auf eine Übungszeile (U1, U2, ...) -- Übersicht aller Konzepte darin,
// nicht nur der erreichten XP. Nutzt dieselbe Zeilendarstellung (xpRowsForConcepts)
// wie die XP-Aufschlüsselung oben, nur ungefiltert nach grad.
function renderUebungDetail(ue, f) {
  const g = f.konzepte.filter((c) => c.ue === ue);
  const gesamt = g.reduce((s, c) => s + c.xp, 0);
  const erreicht = g.reduce((s, c) => s + c.xp * c.xp_anteil, 0);

  let html = `<div class="detail-title">${ue}</div>`;
  html += `<div class="detail-meta">${erreicht.toFixed(1)} / ${gesamt} XP · ${gesamt > 0 ? Math.round((erreicht / gesamt) * 100) : 0}% abgeschlossen</div>`;
  html += `<div style="margin-top:14px">${xpRowsForConcepts(g, { type: "ue", value: ue })}</div>`;
  return html;
}

// ---------- Konzept-Detail: Klick auf eine Konzept-Zeile -- zeigt Status und
// bietet zwei Wege weiter: eine Erklaerung (nutzt den bestehenden /erklaer-
// Befehl aus CLAUDE.md) oder eine frische Uebung genau zu diesem Konzept,
// beides als ganz normale Chat-Nachricht ueber sendMessage(). ----------
function renderConceptDetail(c) {
  let html = `<div class="detail-title">${c.name}</div>`;
  html += `<div class="detail-meta">${c.ue} · Grad ${c.grad}/3 · ${c.xp} XP</div>`;
  if (c.naechste_wiederholung) {
    html += `<div class="detail-meta">${iconSvg("repeat")}Nächste Wiederholung: ${c.naechste_wiederholung}</div>`;
  }
  if (c.teilaufgaben && c.teilaufgaben.length) {
    html += `<div class="pane-header">Teilaufgaben</div><div class="detail-teilaufgaben">`;
    for (const t of c.teilaufgaben) {
      html += `<div class="teil-row${t.erledigt ? " done" : ""}">
        ${iconSvg(t.erledigt ? "check-circle" : "circle", "icon-nm")}
        <span class="teil-desc">${t.beschreibung}</span>
        <span class="teil-anteil">${Math.round(t.anteil * 100)}%</span>
      </div>`;
    }
    html += `</div>`;
  }
  html += `<div class="concept-actions">
    <button type="button" class="concept-action-btn" data-concept-action="erklaer" data-concept-id="${c.id}">${iconSvg("lightbulb")}Erklär mir das</button>
    <button type="button" class="concept-action-btn" data-concept-action="uebung" data-concept-id="${c.id}">${iconSvg("play", "icon-fill")}Übung dazu starten</button>
  </div>`;
  return html;
}

let conceptOrigin = null; // { type: "ue"|"xpkind", value: string } -- fuer den "Zurück"-Button

function openConceptDetail(c, originType, originValue) {
  conceptOrigin = { type: originType, value: originValue };
  showDetailPanel(renderConceptDetail(c), true);
}

function reopenConceptOrigin() {
  if (!conceptOrigin) return;
  if (conceptOrigin.type === "ue") openUebungDetail(conceptOrigin.value);
  else openXpDetail(conceptOrigin.value);
}

function showDetailPanel(html, showBack = false) {
  const back = showBack
    ? `<button type="button" class="detail-back">${iconSvg("arrow-left", "icon-nm")}Zurück</button>`
    : "";
  document.getElementById("detail-content").innerHTML = back + html;
  document.getElementById("detail-panel").classList.add("open");
  document.getElementById("detail-overlay").classList.add("open");
}

function openXpDetail(kind) {
  if (!letzterStand) return;
  showDetailPanel(renderXpDetail(kind, letzterStand));
}

function openUebungDetail(ue) {
  if (!letzterStand) return;
  showDetailPanel(renderUebungDetail(ue, letzterStand));
}

function closeXpDetail() {
  document.getElementById("detail-panel").classList.remove("open");
  document.getElementById("detail-overlay").classList.remove("open");
}

document.getElementById("meter-heute").addEventListener("click", () => openXpDetail("heute"));
document.getElementById("meter-season").addEventListener("click", () => openXpDetail("season"));
document.getElementById("meter-grundlagen").addEventListener("click", () => openXpDetail("grundlagen"));
document.getElementById("detail-close").addEventListener("click", closeXpDetail);
document.getElementById("detail-overlay").addEventListener("click", closeXpDetail);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeXpDetail();
});

// Ein Klick-Handler fuer alles im Panel -- Zurueck-Button, Konzept-Zeilen und
// die beiden Aktionsbuttons (Erklaeren/Uebung). Delegation, weil die Zeilen
// per innerHTML eingefuegt werden, nicht einzeln mit Listenern versehen sind.
document.getElementById("detail-content").addEventListener("click", (e) => {
  const backBtn = e.target.closest(".detail-back");
  if (backBtn) {
    reopenConceptOrigin();
    return;
  }

  const actionBtn = e.target.closest(".concept-action-btn");
  if (actionBtn && letzterStand) {
    const c = letzterStand.konzepte.find((k) => k.id === actionBtn.dataset.conceptId);
    if (!c) return;
    closeXpDetail();
    sendMessage(
      actionBtn.dataset.conceptAction === "erklaer"
        ? `/erklaer ${c.name}`
        : `Gib mir eine Übungsaufgabe genau zu "${c.name}" (${c.ue}).`
    );
    return;
  }

  const row = e.target.closest("[data-concept-id]");
  if (row && !row.closest(".concept-actions") && letzterStand) {
    const c = letzterStand.konzepte.find((k) => k.id === row.dataset.conceptId);
    if (c) openConceptDetail(c, row.dataset.originType, row.dataset.originValue);
  }
});

async function loadHistory() {
  try {
    const res = await fetch("/api/history");
    const data = await res.json();
    const messages = data.messages || [];
    for (const m of messages) {
      addMessage(m.role, m.text);
    }
    return messages.length > 0;
  } catch (err) {
    return false;
  }
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

function setMeter(id, value, max, maxDisplay) {
  const el = document.getElementById(id);
  const fill = el.querySelector(".meter-fill");
  const valueEl = el.querySelector(".meter-value");
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const anzeigeMax = maxDisplay === undefined ? max : maxDisplay;

  const vorherigeXp = parseFloat(el.dataset.xp || "0");
  const vorherigePct = parseFloat(fill.style.width) || 0;

  animateNumber(vorherigePct, pct, 500, (v) => { fill.style.width = v + "%"; });
  animateNumber(vorherigeXp, value, 500, (v) => {
    valueEl.textContent = `${v.toFixed(0)}/${anzeigeMax.toFixed(0)} XP`;
  });

  el.dataset.xp = value;
}

async function sendMessage(text) {
  if (!text.trim() || busy) return;
  addMessage("user", text);
  setBusy(true);

  const assistantEl = addMessage("assistant", "");
  assistantEl.classList.add("cursor-blink");
  let raw = "";

  // Zeigt an, welches Werkzeug Claude gerade nutzt (z.B. "schreibt Aufgabe"),
  // solange noch kein sichtbarer Text angekommen ist -- verschwindet, sobald
  // der erste echte Antwort-Text eintrifft.
  const statusEl = document.createElement("div");
  statusEl.className = "tool-status";
  assistantEl.before(statusEl);

  try {
    const res = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    if (!res.ok || !res.body) throw new Error("Server antwortet nicht (HTTP " + res.status + ")");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        const evt = JSON.parse(line);
        if (evt.type === "delta") {
          statusEl.remove();
          raw += evt.text;
          assistantEl.textContent = raw; // waehrend des Streamens: schlicht, wird am Ende neu gerendert
          $messages.scrollTop = $messages.scrollHeight;
        } else if (evt.type === "tool") {
          statusEl.innerHTML = TOOL_LABELS[evt.name] || `${iconSvg("wrench")}nutzt ${evt.name}`;
          $messages.scrollTop = $messages.scrollHeight;
        } else if (evt.type === "levelup") {
          showLevelUps(evt.konzepte);
        } else if (evt.type === "error") {
          raw += `\n\n${iconSvg("alert-triangle")}` + evt.message;
        }
      }
    }
  } catch (err) {
    raw += `\n\n${iconSvg("alert-triangle")}Verbindungsfehler: ` + err.message;
  }

  statusEl.remove();
  assistantEl.classList.remove("cursor-blink");
  assistantEl.innerHTML = mdWithMath(raw || "*(keine Antwort)*");
  renderMath(assistantEl);
  $messages.scrollTop = $messages.scrollHeight;

  setBusy(false);
  await loadStatus();
}

$form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $input.value;
  $input.value = "";
  sendMessage(text);
});

$input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (!e.shiftKey || e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    $form.requestSubmit();
  } else if (e.key === "Escape") {
    $input.blur();
  }
});

// Zifferntasten 1-5 ausserhalb des Eingabefelds fuellen es direkt --
// schnelle Antwort auf die Kalibrierungs-Sicherheitsfrage ("1-5?").
document.addEventListener("keydown", (e) => {
  if (busy || document.activeElement === $input) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (["1", "2", "3", "4", "5"].includes(e.key)) {
    e.preventDefault();
    $input.value = e.key;
    $input.focus();
  }
});

if ($newSessionBtn) {
  $newSessionBtn.addEventListener("click", async () => {
    if (busy) return;
    $newSessionBtn.disabled = true;
    try {
      const res = await fetch("/api/new-session", { method: "POST" });
      const data = await res.json();
      addMessage("system", data.ok
        ? `${iconSvg("refresh")}Neue Sitzung gestartet — Claude beginnt bei der nächsten Nachricht ohne die bisherige Historie (Antworten sollten wieder schneller sein).`
        : `${iconSvg("alert-triangle")}` + (data.error || "Sitzung konnte nicht zurückgesetzt werden."));
    } catch (err) {
      addMessage("system", `${iconSvg("alert-triangle")}Verbindungsfehler beim Zurücksetzen: ` + err.message);
    }
    $newSessionBtn.disabled = false;
  });
}

$quickActions.forEach((btn) => {
  btn.addEventListener("click", () => {
    const cmd = btn.dataset.cmd;
    const extra = $input.value.trim();
    $input.value = "";
    sendMessage(extra ? `${cmd} ${extra}` : cmd);
  });
});

(async () => {
  const [, hadHistory] = await Promise.all([loadStatus(), loadHistory()]);
  addMessage(
    "system",
    hadHistory
      ? "Willkommen zurück — dein bisheriger Chat ist wieder da."
      : 'Bereit. Klick auf „Heute" für den Einstieg oder schreib direkt los.'
  );
})();

// ---------- Sitzungs-Timer -- rein informativ, beeinflusst keine XP ----------
// Zustand liegt in sessionStorage (nicht localStorage): bleibt beim Wechsel zu
// Baum/Archiv/Statistik im selben Tab erhalten, startet aber bei neuer Sitzung
// (neuer Tab, Browser neu gestartet) wieder bei 0 -- das ist die "Sitzung",
// die die Anzeige meint.
(function setupSessionTimer() {
  const el = document.getElementById("session-timer");
  const pauseBtn = document.getElementById("session-timer-pause");
  if (!el) return;

  const BASE_KEY = "nlfem-timer-base-ms";
  const SINCE_KEY = "nlfem-timer-since";
  const PAUSED_KEY = "nlfem-timer-paused";

  // Erststart dieser Sitzung: noch kein Zustand hinterlegt -> laufend ab jetzt.
  if (sessionStorage.getItem(SINCE_KEY) === null && sessionStorage.getItem(PAUSED_KEY) !== "1") {
    sessionStorage.setItem(SINCE_KEY, Date.now());
  }

  function isPaused() {
    return sessionStorage.getItem(PAUSED_KEY) === "1";
  }

  function elapsedMs() {
    const base = parseFloat(sessionStorage.getItem(BASE_KEY)) || 0;
    if (isPaused()) return base;
    const since = parseInt(sessionStorage.getItem(SINCE_KEY), 10);
    return base + (Date.now() - since);
  }

  function render() {
    const s = Math.floor(elapsedMs() / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    el.innerHTML = `${iconSvg("clock")}${m}:${String(sec).padStart(2, "0")}`;
    if (pauseBtn) pauseBtn.innerHTML = iconSvg(isPaused() ? "play" : "pause", "icon-fill icon-nm");
  }

  function pause() {
    if (isPaused()) return;
    sessionStorage.setItem(BASE_KEY, elapsedMs());
    sessionStorage.setItem(PAUSED_KEY, "1");
    render();
  }

  function resume() {
    if (!isPaused()) return;
    sessionStorage.setItem(SINCE_KEY, Date.now());
    sessionStorage.removeItem(PAUSED_KEY);
    render();
  }

  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => (isPaused() ? resume() : pause()));
  }

  render();
  setInterval(render, 1000);
})();

// ---------- Ziehbarer Trenner zwischen Aufgaben- und Chat-Spalte ----------
(function setupResizer() {
  const resizer = document.getElementById("resizer");
  const taskPane = document.getElementById("task-pane");
  const layout = document.getElementById("layout");
  const STORAGE_KEY = "nlfem-task-pane-width";
  const MIN = 260, MAX = 720;

  const saved = parseInt(localStorage.getItem(STORAGE_KEY), 10);
  if (!Number.isNaN(saved)) {
    taskPane.style.setProperty("--task-pane-width", saved + "px");
    taskPane.style.width = saved + "px";
  }

  let dragging = false;

  resizer.addEventListener("mousedown", (e) => {
    dragging = true;
    resizer.classList.add("dragging");
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const left = layout.getBoundingClientRect().left;
    const w = Math.max(MIN, Math.min(MAX, e.clientX - left));
    taskPane.style.width = w + "px";
  });

  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove("dragging");
    document.body.style.userSelect = "";
    localStorage.setItem(STORAGE_KEY, parseInt(taskPane.style.width, 10));
  });
})();
