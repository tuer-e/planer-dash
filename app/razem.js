// Gotowanie razem, bez serwera: dania dzielimy między osoby (każda gotuje swoje od początku do końca),
// a link zaproszenia niesie tylko godzinę startu i podział. Każdy telefon liczy plan sam, od tej samej
// godziny, więc oś i pasek postępu są u wszystkich takie same. Telefony nie wysyłają sobie nic nawzajem.
import { koniecPlanu, krokiDania, uloz } from "./harmonogram.js";
import { krotkaNazwa } from "./narzedzia.js";
import { przepisy } from "./stan.js";

export const NAZWY_OSOB = ["Ty", "Druga osoba", "Trzecia osoba"];
export const MAKS_OSOB = 3;

export function aktywneMinuty(id) {
  return krokiDania(przepisy()[id]).filter((k) => !k.bierny).reduce((s, k) => s + k.min, 0);
}

// Najcięższe danie (najwięcej pracy przy garnku) trafia do osoby, która ma jeszcze najmniej.
// Wynik zależy tylko od listy dań i liczby osób, więc każdy telefon policzy to samo.
export function podzielDania(ids, osoby) {
  const n = Math.max(1, Math.min(osoby, ids.length, MAKS_OSOB));
  const grupy = Array.from({ length: n }, () => []);
  const praca = Array(n).fill(0);
  const kolejnosc = [...ids].sort((a, b) => aktywneMinuty(b) - aktywneMinuty(a) || (a < b ? -1 : 1));
  for (const id of kolejnosc) {
    const k = praca.indexOf(Math.min(...praca));
    grupy[k].push(id);
    praca[k] += aktywneMinuty(id);
  }
  return grupy.map((g) => ids.filter((i) => g.includes(i)));
}

const pamiec = new Map();
// Plan jednej osoby od startu: dania i kafelki (minuty od wspólnego startu).
export function planOsoby(ids) {
  const klucz = ids.join(",");
  if (!pamiec.has(klucz)) {
    const p = przepisy();
    const dania = ids.map((id) => ({ id, nazwa: krotkaNazwa(p[id].nazwa), kroki: krokiDania(p[id]) }));
    const bloki = uloz(dania);
    pamiec.set(klucz, { dania, bloki, koniec: koniecPlanu(bloki), praca: ids.reduce((s, id) => s + aktywneMinuty(id), 0) });
  }
  return pamiec.get(klucz);
}

// Kod w linku: <start w sekundach, base36>.<dania osoby 1>~<dania osoby 2>[~<osoby 3>]
export function kodZaproszenia(start, grupy) {
  return `${Math.round(start / 1000).toString(36)}.${grupy.map((g) => g.join(",")).join("~")}`;
}

export function czytajKod(kod) {
  const [czas, reszta] = String(kod ?? "").split(".");
  const start = parseInt(czas, 36) * 1000;
  const grupy = (reszta ?? "").split("~").map((g) => g.split(",").filter(Boolean));
  const p = przepisy();
  if (!Number.isFinite(start) || grupy.length < 2 || grupy.length > MAKS_OSOB) return null;
  if (grupy.some((g) => !g.length || g.some((id) => !p[id]))) return null;
  return { start, grupy, kod };
}

export function adresZaproszenia(kod) {
  return `${location.origin}${location.pathname}#gotowanie/razem/${kod}`;
}

export function godzina(ms) {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function ileOsob(n) {
  return n === 2 ? "we dwoje" : n === 3 ? "we troje" : "sam";
}
