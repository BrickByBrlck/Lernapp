// Siehe app.js fuer die Begruendung: marked.parse() zerstoert "\\" und "\,"
// (LaTeX-Matrixzeilenumbruch bzw. Duennleerzeichen) durch normales Markdown-
// Backslash-Escaping, bevor KaTeX den Text sieht -- Mathe-Bloecke muessen
// davor geschuetzt werden, auch wenn eine Inline-Formel im Quelltext ueber
// eine Zeile umbricht (aber nicht ueber eine Leerzeile/Absatzgrenze hinweg).
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

function renderMath(el, versucheUebrig = 20) {
  if (window.renderMathInElement) {
    renderMathInElement(el, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
      macros: {
        "\\ten": "\\boldsymbol{#1}",
        "\\tr": "\\operatorname{tr}",
        "\\grad": "\\operatorname{Grad}",
        "\\dv": "\\operatorname{div}",
      },
    });
  } else if (versucheUebrig > 0) {
    setTimeout(() => renderMath(el, versucheUebrig - 1), 50);
  }
}

let aktuelleDatei = null;
let archivFrageBusy = false;
const $archivQa = document.getElementById("archiv-qa");
const $archivQaForm = document.getElementById("archiv-qa-form");
const $archivQaInput = document.getElementById("archiv-qa-input");
const $archivQaSend = document.getElementById("archiv-qa-send");

async function openFile(name, itemEl) {
  document.querySelectorAll(".archiv-item").forEach((e) => e.classList.remove("active"));
  itemEl.classList.add("active");

  aktuelleDatei = name;
  $archivQa.innerHTML = "";
  $archivQaForm.style.display = "flex";

  const content = document.getElementById("archiv-content");
  content.innerHTML = '<p class="muted">Lade …</p>';
  try {
    const res = await fetch("/api/archiv-datei?name=" + encodeURIComponent(name));
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    content.innerHTML = mdWithMath(data.content || "*(leer)*");
    renderMath(content);
  } catch (err) {
    content.innerHTML = `<p class="muted">Konnte Datei nicht laden: ${err.message}</p>`;
  }
}

// ---------- Rueckfrage zu einer archivierten Aufgabe -- eigenstaendig,
// nutzt NICHT die Haupt-Chat-Sitzung (siehe app.py: build_archiv_frage_cmd
// ist zustandslos, --no-session-persistence). Stellt keine neue Aufgabe,
// schreibt nirgends etwas -- reine Erklaerung zum bereits archivierten Inhalt. ----------
function setArchivFrageBusy(v) {
  archivFrageBusy = v;
  $archivQaSend.disabled = v;
  $archivQaInput.disabled = v;
}

async function askArchivFrage(frage) {
  if (!frage.trim() || archivFrageBusy || !aktuelleDatei) return;
  setArchivFrageBusy(true);

  const qDiv = document.createElement("div");
  qDiv.className = "qa-question";
  qDiv.textContent = frage;
  $archivQa.appendChild(qDiv);

  const aDiv = document.createElement("div");
  aDiv.className = "qa-answer cursor-blink";
  $archivQa.appendChild(aDiv);
  $archivQa.scrollIntoView({ block: "end", behavior: "smooth" });

  let raw = "";
  try {
    const res = await fetch("/api/archiv-frage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: aktuelleDatei, frage }),
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
          raw += evt.text;
          aDiv.textContent = raw;
        } else if (evt.type === "error") {
          raw += "\n\n⚠ " + evt.message;
        }
      }
    }
  } catch (err) {
    raw += "\n\n⚠ Verbindungsfehler: " + err.message;
  }

  aDiv.classList.remove("cursor-blink");
  aDiv.innerHTML = mdWithMath(raw || "*(keine Antwort)*");
  renderMath(aDiv);

  setArchivFrageBusy(false);
}

$archivQaForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $archivQaInput.value;
  $archivQaInput.value = "";
  askArchivFrage(text);
});

let alleArchivItems = [];

function renderArchivList(items) {
  const el = document.getElementById("archiv-list");
  if (!items.length) {
    el.innerHTML = alleArchivItems.length
      ? '<p class="muted">Keine Treffer.</p>'
      : '<p class="muted">Noch keine abgeschlossenen Aufgaben — die erste landet hier, sobald eine Aufgabe komplett ist.</p>';
    return;
  }
  el.innerHTML = "";
  items.forEach((it) => {
    const div = document.createElement("div");
    div.className = "archiv-item";
    div.innerHTML = `<div>${it.thema}</div><div class="datum">${it.datum || ""}</div>`;
    div.addEventListener("click", () => openFile(it.name, div));
    el.appendChild(div);
  });
}

async function loadArchivList() {
  const el = document.getElementById("archiv-list");
  try {
    const res = await fetch("/api/archiv");
    alleArchivItems = await res.json();
    renderArchivList(alleArchivItems);
  } catch (err) {
    el.innerHTML = `<p class="muted">Konnte Archiv nicht laden: ${err.message}</p>`;
  }
}

document.getElementById("archiv-search").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  const gefiltert = q
    ? alleArchivItems.filter(
        (it) => it.thema.toLowerCase().includes(q) || (it.datum || "").includes(q)
      )
    : alleArchivItems;
  renderArchivList(gefiltert);
});

loadArchivList();
