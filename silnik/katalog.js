// Katalog produktów i przepisów: wartości porcji i działy sklepu.
import { zaokr } from "./pomocnicze.js";

// Kolejność liczb w polu "wartosci" produktu (na 100 g części jadalnej).
export const SKLADNIKI = ["kcal", "bialko_g", "tluszcz_g", "tluszcz_nasycony_g", "weglowodany_g", "blonnik_g", "sod_mg", "cholesterol_mg"];

export const DZIALY = {
  warzywa_owoce: "Warzywa i owoce",
  piekarnia: "Pieczywo",
  nabial: "Nabiał i jaja",
  mieso_ryby: "Mięso i ryby",
  mrozonki: "Mrożonki",
  suche: "Kasze, makarony, puszki",
  tluszcze_dodatki: "Oleje, orzechy, dodatki",
  napoje_slodycze: "Napoje i słodycze",
  chemia: "Chemia i higiena",
};

// Słownik id → produkt, ze zmianami użytkownika (typ, cena) i jego własnymi produktami.
export function produktyZKatalogu(katalog, nadpisania = {}, wlasne = {}) {
  const produkty = {};
  for (const p of katalog.produkty) produkty[p.id] = p;
  for (const [id, p] of Object.entries(wlasne)) if (!(id in produkty)) produkty[id] = { ...p, wlasny: true };
  for (const [id, zmiany] of Object.entries(nadpisania)) if (id in produkty) produkty[id] = { ...produkty[id], ...zmiany };
  return produkty;
}

export function przepisyZKatalogu(katalog) {
  const przepisy = {};
  for (const p of katalog.przepisy) przepisy[p.id] = p;
  return przepisy;
}

// Wartości odżywcze, koszt i porcje DASH na 1 porcję przepisu.
export function wartosciPorcji(przepis, produkty) {
  const suma = Object.fromEntries(SKLADNIKI.map((k) => [k, 0.0]));
  const porcjeDash = {};
  let koszt = 0.0;
  let jajaCale = 0.0;
  for (const [id, gramy] of przepis.skladniki) {
    const p = produkty[id];
    SKLADNIKI.forEach((nazwa, i) => { suma[nazwa] += p.wartosci[i] * gramy / 100.0; });
    const doKupieniaG = gramy * 100.0 / (p.jadalne_proc ?? 100);
    koszt += p.cena_zl * doKupieniaG / p.opakowanie_g;
    if (p.grupa_dash) porcjeDash[p.grupa_dash] = (porcjeDash[p.grupa_dash] ?? 0) + gramy / p.porcja_dash_g;
    if ((p.tagi ?? []).includes("jajo_cale")) jajaCale += gramy / p.sztuka_g;
  }
  const n = przepis.porcje;
  const wynik = {};
  for (const [k, v] of Object.entries(suma)) wynik[k] = zaokr(v / n, 1);
  wynik.koszt_zl = zaokr(koszt / n, 2);
  wynik.porcje_dash = Object.fromEntries(Object.entries(porcjeDash).map(([k, v]) => [k, zaokr(v / n, 1)]));
  wynik.jaja_cale = zaokr(jajaCale / n, 2);
  const tagi = new Set();
  for (const [id] of przepis.skladniki) for (const t of produkty[id].tagi ?? []) tagi.add(t);
  wynik.tagi = [...tagi].sort();
  return wynik;
}
