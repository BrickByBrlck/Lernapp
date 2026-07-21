let letzteKonzepte = [];

function konzeptGesperrt(c, byId) {
  // Ein Konzept gilt als "gesperrt", solange noch keine Voraussetzung
  // erfuellt ist UND er selbst noch gar nicht angefangen hat -- sobald
  // grad > 0, zeigen wir es normal (er arbeitet ja schon dran).
  if (!c.abhaengig_von || c.grad > 0) return false;
  return c.abhaengig_von.some((depId) => {
    const dep = byId[depId];
    return !dep || dep.grad < 2;
  });
}

function getNodeCenter(id) {
  const el = document.querySelector(`.tree-node[data-id="${CSS.escape(id)}"]`);
  if (!el) return null;
  return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 };
}

function drawEdges(konzepte) {
  const byId = Object.fromEntries(konzepte.map((c) => [c.id, c]));
  const svg = document.getElementById("tree-svg");
  const container = document.getElementById("tree-rows");

  svg.setAttribute("width", container.scrollWidth);
  svg.setAttribute("height", container.scrollHeight);
  svg.innerHTML = "";

  for (const c of konzepte) {
    if (!c.abhaengig_von) continue;
    const to = getNodeCenter(c.id);
    if (!to) continue;
    const gesperrt = konzeptGesperrt(c, byId);

    for (const depId of c.abhaengig_von) {
      const from = getNodeCenter(depId);
      if (!from) continue;
      const midY = (from.y + to.y) / 2;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute(
        "d",
        `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`
      );
      path.setAttribute("class", "tree-edge" + (gesperrt ? " locked" : ""));
      svg.appendChild(path);
    }
  }
}

function renderTree(konzepte) {
  letzteKonzepte = konzepte;
  const byId = Object.fromEntries(konzepte.map((c) => [c.id, c]));
  const blockOrder = ["Grundlagen", "U1", "U2", "U3", "U4", "U5"];
  const rowsEl = document.getElementById("tree-rows");
  rowsEl.innerHTML = "";

  for (const block of blockOrder) {
    const g = konzepte.filter((c) => c.ue === block);
    if (!g.length) continue;

    const blockEl = document.createElement("div");
    blockEl.className = "tree-block";
    blockEl.innerHTML = `<div class="tree-block-label">${block}</div>`;

    const rowEl = document.createElement("div");
    rowEl.className = "tree-row";
    for (const c of g) {
      const gesperrt = konzeptGesperrt(c, byId);
      const hatTeil = c.teilaufgaben && c.teilaufgaben.length > 0;
      const node = document.createElement("div");
      node.className = `tree-node g${c.grad}` + (gesperrt ? " locked" : "") + (hatTeil ? " has-teil" : "");
      node.dataset.id = c.id;
      node.title = `${c.name} — Grad ${c.grad}/3`
        + (gesperrt ? " (gesperrt: Voraussetzung fehlt)" : "")
        + (hatTeil ? " — Klick fuer Teilaufgaben" : " — Klick fuer Details");
      node.innerHTML = (gesperrt ? iconSvg("lock") : "") + c.name;
      if (hatTeil) {
        const erledigt = c.teilaufgaben.filter((t) => t.erledigt).length;
        const sub = document.createElement("span");
        sub.className = "tree-node-sub";
        sub.textContent = `${erledigt}/${c.teilaufgaben.length} Teilschritte`;
        node.appendChild(sub);
      }
      node.addEventListener("click", () => openDetail(c.id));
      rowEl.appendChild(node);
    }
    blockEl.appendChild(rowEl);
    rowsEl.appendChild(blockEl);
  }

  // Erst nach dem naechsten Frame sind offsetLeft/offsetTop der neuen Knoten
  // verlaesslich -- dann die Verbindungslinien zeichnen.
  requestAnimationFrame(() => drawEdges(konzepte));
}

async function loadTree() {
  const res = await fetch("/api/stats");
  const f = await res.json();
  renderTree(f.konzepte);
}

window.addEventListener("resize", () => {
  if (letzteKonzepte.length) drawEdges(letzteKonzepte);
});

// ---------- Detail-Panel: Klick auf einen Knoten zeigt Teilaufgaben (falls
// vorhanden), Voraussetzungen und Wiederholungsstatus -- die "Unterteilung"
// eines Konzepts unter dem groben Grad-0..3-Fortschritt. ----------
function renderDetail(c, byId) {
  const gesperrt = konzeptGesperrt(c, byId);
  const teil = c.teilaufgaben;

  let html = `<div class="detail-title">${c.name}</div>`;
  html += `<div class="detail-meta">${c.ue} · Grad ${c.grad}/3 · ${c.xp} XP`
    + (gesperrt ? ` · ${iconSvg("lock", "icon-nm")} gesperrt` : "") + `</div>`;
  if (c.naechste_wiederholung) {
    html += `<div class="detail-meta">${iconSvg("repeat")}Nächste Wiederholung: ${c.naechste_wiederholung}</div>`;
  }

  if (teil && teil.length) {
    html += `<div class="pane-header">Teilaufgaben</div><div class="detail-teilaufgaben">`;
    for (const t of teil) {
      html += `<div class="teil-row${t.erledigt ? " done" : ""}">
        ${iconSvg(t.erledigt ? "check-circle" : "circle", "icon-nm")}
        <span class="teil-desc">${t.beschreibung}</span>
        <span class="teil-anteil">${Math.round(t.anteil * 100)}%</span>
      </div>`;
    }
    html += `</div>`;
  } else {
    html += `<p class="muted" style="margin-top:14px;">
      Kein mehrteiliger Ablauf hinterlegt — dieses Konzept wird als Ganzes
      bewertet (Grad 0 → 1 → 2 → 3).
    </p>`;
  }

  if (c.abhaengig_von && c.abhaengig_von.length) {
    html += `<div class="pane-header">Voraussetzungen</div><div class="detail-deps">`;
    for (const depId of c.abhaengig_von) {
      const dep = byId[depId];
      const fertig = dep && dep.grad >= 2;
      html += `<div class="dep-row${fertig ? " dep-done" : ""}">
        ${iconSvg(fertig ? "check-circle" : "circle")}${dep ? dep.name : depId}
      </div>`;
    }
    html += `</div>`;
  }

  return html;
}

function openDetail(id) {
  const byId = Object.fromEntries(letzteKonzepte.map((c) => [c.id, c]));
  const c = byId[id];
  if (!c) return;
  document.getElementById("detail-content").innerHTML = renderDetail(c, byId);
  document.getElementById("detail-panel").classList.add("open");
  document.getElementById("detail-overlay").classList.add("open");
}

function closeDetail() {
  document.getElementById("detail-panel").classList.remove("open");
  document.getElementById("detail-overlay").classList.remove("open");
}

document.getElementById("detail-close").addEventListener("click", closeDetail);
document.getElementById("detail-overlay").addEventListener("click", closeDetail);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDetail();
});

loadTree();
