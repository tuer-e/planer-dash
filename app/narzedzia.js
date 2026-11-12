// Wspólne drobiazgi interfejsu: bezpieczny tekst w HTML, daty po polsku, odmiana, arkusz i powiadomienia.

export function esc(tekst) {
  return String(tekst ?? "").replace(/[&<>"']/g, (z) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[z]));
}

// Dzisiejsza data w czasie lokalnym (RRRR-MM-DD).
export function dzis(teraz = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${teraz.getFullYear()}-${p(teraz.getMonth() + 1)}-${p(teraz.getDate())}`;
}

const DNI = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
const DNI_KROTKO = ["nd", "pn", "wt", "śr", "cz", "pt", "sb"];
const MIESIACE = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];

const naDate = (iso) => new Date(`${iso}T12:00:00`);

export function dodaj(iso, dni) {
  const d = naDate(iso);
  d.setDate(d.getDate() + dni);
  return dzis(d);
}

export function roznica(a, b) {
  return Math.round((naDate(a) - naDate(b)) / 86400000);
}

export function poniedzialek(iso) {
  const d = naDate(iso);
  return dodaj(iso, -((d.getDay() + 6) % 7));
}

export function nazwaDnia(iso) {
  return DNI[naDate(iso).getDay()];
}

export function dzienKrotko(iso) {
  return DNI_KROTKO[naDate(iso).getDay()];
}

const DOPELNIACZ = { "poniedziałek": "poniedziałku", wtorek: "wtorku", "środa": "środy", czwartek: "czwartku", "piątek": "piątku", sobota: "soboty", niedziela: "niedzieli" };

// „od piątku”, „do środy”
export function dniaDopelniacz(iso) {
  return DOPELNIACZ[nazwaDnia(iso)];
}

export function dataSlownie(iso) {
  const d = naDate(iso);
  return `${d.getDate()} ${MIESIACE[d.getMonth()]}`;
}

export function zakresTygodnia(od) {
  const a = naDate(od);
  const b = naDate(dodaj(od, 6));
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MIESIACE[b.getMonth()]}`
    : `${a.getDate()} ${MIESIACE[a.getMonth()]} – ${b.getDate()} ${MIESIACE[b.getMonth()]}`;
}

// „Dobre do jutra / do piątku / do 24 listopada”
export function doKiedy(iso, dzisiaj = dzis()) {
  const r = roznica(iso, dzisiaj);
  if (r < 0) return "po terminie — sprawdź, zanim zjesz";
  if (r === 0) return "dobre do dziś";
  if (r === 1) return "dobre do jutra";
  if (r < 7) return `dobre do ${dniaDopelniacz(iso)}`;
  return `dobre do ${dataSlownie(iso)}`;
}

// Krótka nazwa dania: „Mujaddara”, „Wrap z hummusem” zamiast pełnego opisu. Nigdy nie ucina słowa w połowie.
export function krotkaNazwa(nazwa, max = 30) {
  const przed = nazwa.split(":")[0].replace(/\s*\([^)]*\)/g, "").trim();
  if (przed.length <= max) return przed;
  // Cięcie na ostatnim przecinku albo „ i / z / w” mieszczącym się w limicie.
  const ciecia = [...przed.slice(0, max + 1).matchAll(/,| i | z | w | po /g)].map((m) => m.index).filter((i) => i >= 8);
  if (ciecia.length) return przed.slice(0, ciecia[ciecia.length - 1]);
  let wynik = "";
  for (const slowo of przed.split(" ")) {
    if (`${wynik} ${slowo}`.trim().length > max - 1) break;
    wynik = `${wynik} ${slowo}`.trim();
  }
  return `${wynik}…`;
}

export function odmiana(n, jeden, kilka, wiele) {
  if (n === 1) return `${n} ${jeden}`;
  const d = n % 10;
  const s = n % 100;
  return `${n} ${d >= 2 && d <= 4 && (s < 12 || s > 14) ? kilka : wiele}`;
}

export const porcjeTxt = (n) => odmiana(n, "porcja", "porcje", "porcji");

export function zl(x) {
  return `${Math.round(x)} zł`;
}

// --- Arkusz od dołu i krótkie powiadomienia ---

const arkusz = () => document.getElementById("arkusz");

export function pokazArkusz(html) {
  const a = arkusz();
  a.innerHTML = `<div role="dialog" aria-modal="true">${html}</div>`;
  a.hidden = false;
  a.querySelector("button, a, input")?.focus();
}

export function zamknijArkusz() {
  const a = arkusz();
  a.hidden = true;
  a.innerHTML = "";
}

let licznikPowiadomienia;
export function powiadom(tekst) {
  const p = document.getElementById("powiadomienie");
  p.textContent = tekst;
  p.classList.add("widoczne");
  clearTimeout(licznikPowiadomienia);
  licznikPowiadomienia = setTimeout(() => p.classList.remove("widoczne"), 2600);
}

export async function kopiujTekst(tekst) {
  try {
    await navigator.clipboard.writeText(tekst);
    return true;
  } catch {
    const pole = document.createElement("textarea");
    pole.value = tekst;
    pole.style.position = "fixed";
    pole.style.opacity = "0";
    document.body.append(pole);
    pole.select();
    const ok = document.execCommand("copy");
    pole.remove();
    return ok;
  }
}
