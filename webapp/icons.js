// Eigene Icons statt Emoji -- Linien-Stil (Stroke, currentColor), damit sie sich
// wie das restliche Farbsystem an Hell/Dunkel anpassen, statt von der
// Emoji-Schriftart des Betriebssystems abzuhaengen. Nur die Pfade hier drin,
// iconSvg() baut daraus das <svg>-Tag.
const ICON_PATHS = {
  // Streak/Fortschritt "in Fahrt" -- Flamme
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',

  // Kompetenzbaum: bewusst kein Nadelbaum, sondern ein Abhaengigkeits-Graph
  // (Knoten + Kanten) -- passt inhaltlich besser zu "welches Konzept baut auf
  // welchem auf" als ein woertlicher Baum.
  "skill-tree": '<circle cx="12" cy="4" r="1.8"/><circle cx="6" cy="12" r="1.8"/><circle cx="18" cy="12" r="1.8"/><circle cx="9" cy="20" r="1.8"/><circle cx="16" cy="20" r="1.8"/><path d="M12 5.8 6 10.2M12 5.8l6 4.4M6 13.8l2.3 4.4M18 13.8l-1.7 4.4M9 20h7"/>',

  // Grundlagen: gestapelte Ebenen -- "das, worauf alles andere aufbaut"
  layers: '<path d="M12 3 21 8 12 13 3 8Z"/><path d="M3 13l9 5 9-5"/><path d="M3 17.5l9 5 9-5"/>',

  // Erklaerung/Idee
  lightbulb: '<path d="M9 18h6"/><path d="M10 21.5h4"/><path d="M12 2.5a6.7 6.7 0 0 0-3.8 12.2c.7.5 1.3 1.4 1.3 2.3h5c0-.9.6-1.8 1.3-2.3A6.7 6.7 0 0 0 12 2.5Z"/>',

  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.85-4.85"/>',
  "bar-chart": '<path d="M4 20V10"/><path d="M12 20V4"/><path d="M20 20v-7"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M4 8v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>',
  medal: '<circle cx="12" cy="9" r="5.5"/><path d="M9.3 13.7 7.5 21l4.5-2.2 4.5 2.2-1.8-7.3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  "book-open": '<path d="M12 6.2c-1.8-1.4-4.3-2.2-7-2.2v13c2.7 0 5.2.8 7 2.2 1.8-1.4 4.3-2.2 7-2.2V4c-2.7 0-5.2.8-7 2.2Z"/><path d="M12 6.2v13"/>',
  pencil: '<path d="M17 3.3a2.1 2.1 0 0 1 3 3L7 19.3l-4 1 1-4Z"/><path d="M14 6.3l3.7 3.7"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9.5l3 2.5-3 2.5"/><path d="M13 15h4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17"/><path d="M8 3v4"/><path d="M16 3v4"/>',
  "arrow-right": '<path d="M4 12h16"/><path d="M13 5l7 7-7 7"/>',
  "arrow-left": '<path d="M20 12H4"/><path d="M11 5l-7 7 7 7"/>',
  ladder: '<path d="M7 2v20"/><path d="M17 2v20"/><path d="M7 7h10"/><path d="M7 12h10"/><path d="M7 17h10"/>',
  "check-circle": '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9"/>',
  circle: '<circle cx="12" cy="12" r="9"/>',
  "alert-triangle": '<path d="M12 3.5 21.5 20h-19Z"/><path d="M12 9.5v5"/><path d="M12 17.3h.01"/>',
  refresh: '<path d="M20 11A8 8 0 0 0 6.3 6.3L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 13.7 4.7L20 15.5"/><path d="M20 20v-4.5h-4.5"/>',
  repeat: '<path d="M4 7h11a4 4 0 0 1 4 4v1"/><path d="M16.5 9 19 11.5 16.5 14"/><path d="M20 17H9a4 4 0 0 1-4-4v-1"/><path d="M7.5 15 5 12.5 7.5 10"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2-2Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  play: '<path d="M7 4.5v15l13-7.5Z"/>',
  sparkle: '<path d="M12 2c.5 4 3 6.5 7 7-4 .5-6.5 3-7 7-.5-4-3-6.5-7-7 4-.5 6.5-3 7-7Z"/>',
};

function iconSvg(name, cls = "") {
  const path = ICON_PATHS[name];
  if (!path) return "";
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
}

// HTML bleibt lesbar (data-icon="flame" statt fertigem SVG-Markup drin) --
// diese Funktion setzt beim Laden das passende SVG davor ein.
function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.insertAdjacentHTML("afterbegin", iconSvg(el.dataset.icon));
  });
}
document.addEventListener("DOMContentLoaded", () => hydrateIcons());
