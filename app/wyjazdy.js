// Gdzie jesteś danego dnia: cały dzień w domu, cały na wyjeździe albo pół na pół.
// W planie: poza_domem = [dni całe], poza_pol = {dzień: "wieczor" | "rano"}.
//   "wieczor" — rano w domu, wieczorem wyjazd (np. piątek),
//   "rano"    — rano wyjazd, wieczorem w domu (np. niedziela, powrót).
import { dzienKrotko, esc, nazwaDnia } from "./narzedzia.js";

const KOLEJNOSC = ["dom", "wieczor", "caly", "rano"]; // stuknięcie przechodzi do następnego stanu

export function stanDnia(miejsca, d) {
  if (miejsca.dni.includes(d)) return "caly";
  return miejsca.pol?.[d] ?? "dom";
}

export function zPlanu(plan) {
  return { dni: [...(plan?.poza_domem ?? [])], pol: { ...(plan?.poza_pol ?? {}) } };
}

// Zmienia stan dnia na następny w kolejności; zwraca nowe {dni, pol}.
export function przelacz(miejsca, d) {
  const nowy = KOLEJNOSC[(KOLEJNOSC.indexOf(stanDnia(miejsca, d)) + 1) % KOLEJNOSC.length];
  const dni = miejsca.dni.filter((x) => x !== d);
  const pol = { ...miejsca.pol };
  delete pol[d];
  if (nowy === "caly") dni.push(d);
  if (nowy === "wieczor" || nowy === "rano") pol[d] = nowy;
  return { dni: dni.sort((a, b) => a - b), pol };
}

export function takieSame(a, b) {
  const klucz = (m) => JSON.stringify([m.dni, Object.entries(m.pol).map(([k, v]) => [Number(k), v]).sort((x, y) => x[0] - y[0])]);
  return klucz(a) === klucz(b);
}

export function opisStanu(stan, dom, wyjazd) {
  return { dom: `cały dzień: ${dom}`, caly: `cały dzień: ${wyjazd}`, wieczor: `rano ${dom}, wieczorem ${wyjazd}`, rano: `rano ${wyjazd}, wieczorem ${dom}` }[stan];
}

// Kafelek dnia: górna połowa to rano, dolna wieczór; jaśniejsze tło = poza domem.
export function kafelDnia(d, data, stan, dom, wyjazd, akcja) {
  const krotko = (s) => esc(s).slice(0, 6);
  const gora = stan === "caly" || stan === "rano" ? krotko(wyjazd) : "dom";
  const dol = stan === "caly" || stan === "wieczor" ? krotko(wyjazd) : "dom";
  return `<button type="button" class="dzien stan-${stan}" aria-pressed="${stan !== "dom"}" data-akcja="${akcja}" data-dzien="${d}"
    aria-label="${nazwaDnia(data)}: ${esc(opisStanu(stan, dom, wyjazd))}">
    <b>${dzienKrotko(data)}</b>
    ${stan === "wieczor" || stan === "rano"
      ? `<small class="pol${stan === "rano" ? " poza" : ""}">${gora}</small><small class="pol${stan === "wieczor" ? " poza" : ""}">${dol}</small>`
      : `<small>${gora}</small>`}
  </button>`;
}
