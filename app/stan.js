// Dane planera: wszystko zapisane tylko w tym telefonie (pamięć przeglądarki), bez konta i serwera.
// Lodówka zamiast grafiku: po poniedziałkowym gotowaniu porcje trafiają do lodówki lub zamrażarki
// z terminem „dobre do”; jesz, na co masz ochotę, a planer tylko podpowiada, co zjeść najpierw.
import { Kontekst, generujTydzien, podmien, porcje, slotyJedzone, zZamrazarki } from "../silnik/generator.js";
import { produktyZKatalogu, przepisyZKatalogu } from "../silnik/katalog.js";
import { dodaj, dzis, poniedzialek, roznica } from "./narzedzia.js";

const KLUCZ = "planer-dash";
const WERSJA_DANYCH = 1;
const TYGODNIE_HISTORII = 3;

// Neutralne ustawienia startowe — każdy wpisuje swoje przy pierwszym uruchomieniu.
export const DOMYSLNY_PROFIL = {
  plec: "M", wiek: 30, wzrost_cm: 175, waga_kg: 75, waga_docelowa_kg: 70, aktywnosc: "lekka", deficyt_kcal: 450,
  kcal_reczne: null, limit_sodu_mg: 2300, budzet_tydzien_zl: 170, tolerancja_budzetu_proc: 10,
  budzet_gosc_zl: 60, budzet_rodzinny_zl: 80, zamrazarka_pudelka: 8, wykluczone: [],
  dom: "dom", wyjazd: "wyjazd",
};

function puste() {
  return {
    wersja: WERSJA_DANYCH,
    profil: { ...DOMYSLNY_PROFIL },
    profil_ustawiony: false,
    zamiany_stale: {},
    produkty_zmiany: {},
    produkty_wlasne: {},
    zapasy: {},
    tygodnie: {},
    lodowka: [],
    gotowanie: null,
    kupione: {},
    dodatkowe: {},
    dopisane_produkty: {},
    uwagi: [],
    ostatnia_kopia: null,
  };
}

export function wczytaj() {
  let dane = null;
  try {
    dane = JSON.parse(localStorage.getItem(KLUCZ));
  } catch { /* brak dostępu do pamięci — zaczynamy od zera */ }
  const wynik = { ...puste(), ...(dane || {}) };
  wynik.profil = { ...DOMYSLNY_PROFIL, ...wynik.profil };
  return wynik;
}

export function zapisz(dane) {
  try {
    localStorage.setItem(KLUCZ, JSON.stringify(dane));
    return true;
  } catch {
    return false;
  }
}

// Prośba do iPhone'a, żeby nie czyścił danych planera przy braku miejsca.
export async function poprosOTrwalosc() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* nie wszystkie przeglądarki to obsługują */ }
}

// --- Katalog (produkty, przepisy, reguły) ---

let katalog = null;
export async function wczytajKatalog() {
  if (katalog) return katalog;
  const pobierz = (plik) => fetch(`dane/${plik}`).then((r) => r.json());
  const [produkty, przepisy, reguly] = await Promise.all([pobierz("produkty.json"), pobierz("przepisy.json"), pobierz("reguly-dash.json")]);
  katalog = { produkty, przepisy, reguly };
  return katalog;
}

export function przepisy() {
  return przepisyZKatalogu(katalog.przepisy);
}

export function kontekst(dane, od) {
  const historia = Object.values(dane.tygodnie)
    .filter((p) => roznica(od, p.od) >= 7 && roznica(od, p.od) <= TYGODNIE_HISTORII * 7)
    .sort((a, b) => (a.od < b.od ? -1 : 1));
  const produkty = produktyZKatalogu(katalog.produkty, dane.produkty_zmiany, dane.produkty_wlasne);
  return new Kontekst(od, dane.profil, przepisy(), produkty, katalog.reguly, historia, dane.zamiany_stale);
}

// --- Tygodnie ---

export function tenTydzien(dzisiaj = dzis()) {
  return poniedzialek(dzisiaj);
}

export function ulozTydzien(dane, od, poza, polowki = {}) {
  const ctx = kontekst(dane, od);
  const plan = generujTydzien(od, "sam", ctx, { poza, polowki, zamrazarka: wZamrazarce(dane, ctx) });
  plan.zamiany_produktow = {};
  dane.tygodnie[od] = plan;
  delete dane.kupione[od];
  return plan;
}

export function zamienDanie(dane, od, idGrupy, idPrzepisu) {
  const ctx = kontekst(dane, od);
  dane.tygodnie[od] = podmien(dane.tygodnie[od], idGrupy, idPrzepisu, ctx);
}

// Dania dopisane do zakupów spoza planu (np. dla gości): {od: [{id, przepis, porcje}]}.
export function dopiszDoZakupow(dane, od, przepis, ile) {
  (dane.dodatkowe[od] ?? (dane.dodatkowe[od] = [])).push({ id: noweId(), przepis, porcje: ile });
}

export function usunDopisane(dane, od, id) {
  dane.dodatkowe[od] = (dane.dodatkowe[od] ?? []).filter((x) => x.id !== id);
}

// Plan tygodnia razem z dopisanymi daniami — do listy zakupów i kosztu.
export function planZDopisanymi(dane, od) {
  const plan = dane.tygodnie[od];
  const dopisane = dane.dodatkowe[od] ?? [];
  if (!plan || !dopisane.length) return plan;
  return {
    ...plan,
    grupy: [...plan.grupy, ...dopisane.map((x) => ({
      id: `dopisane_${x.id}`, posilek: "kolacja", rodzaj: "dopisane", przepis: x.przepis,
      sloty: [[8, "kolacja"]], osoby: x.porcje, dwoje: [], usuniete: [],
    }))],
  };
}

// Porcje w zamrażarce, które planer może wziąć do planu (tylko dania z poniedziałkowego gotowania).
function wZamrazarce(dane, ctx) {
  const wynik = {};
  for (const x of dane.lodowka) {
    if (x.miejsce === "zamrazarka" && x.porcje > 0 && ctx.przepisy[x.przepis]?.na_zapas) {
      wynik[x.przepis] = Math.min(20, (wynik[x.przepis] ?? 0) + x.porcje);
    }
  }
  return wynik;
}

// --- Lodówka ---

let licznikId = 0;
const noweId = () => `p${Date.now().toString(36)}${(licznikId++).toString(36)}`;

// Po poniedziałkowym gotowaniu: porcje dań z planu idą do lodówki (z terminem) i do zamrażarki.
export function wlozDoLodowki(dane, od, dzien = dzis()) {
  const plan = dane.tygodnie[od];
  const ctx = kontekst(dane, od);
  for (const g of plan.grupy) {
    if (g.rodzaj !== "partia" || !g.przepis || !slotyJedzone(g).length) continue;
    const p = ctx.przepisy[g.przepis];
    const wszystkie = porcje(g);
    const doZamrazarki = porcje(g, slotyJedzone(g).filter((s) => zZamrazarki(g, s[0], ctx)));
    const wspolne = { przepis: g.przepis, nazwa: p.nazwa, ugotowano: dzien, trwalosc_dni: p.trwalosc_dni, mrozi: Boolean(p.mrozi_sie), tydzien: od };
    if (wszystkie - doZamrazarki > 0) {
      dane.lodowka.push({ ...wspolne, id: noweId(), miejsce: "lodowka", porcje: wszystkie - doZamrazarki, start: wszystkie - doZamrazarki, dobre_do: dodaj(dzien, p.trwalosc_dni) });
    }
    if (doZamrazarki > 0) {
      dane.lodowka.push({ ...wspolne, id: noweId(), miejsce: "zamrazarka", porcje: doZamrazarki, start: doZamrazarki, dobre_do: null });
    }
  }
  plan.ugotowano = dzien;
}

export function zjedz(dane, id, dzien = dzis()) {
  const x = dane.lodowka.find((y) => y.id === id);
  if (x && x.porcje > 0) {
    x.porcje -= 1;
    x.zmieniono = dzien;
  }
}

export function cofnijZjedzenie(dane, id) {
  const x = dane.lodowka.find((y) => y.id === id);
  if (x && x.porcje < x.start) x.porcje += 1;
}

// Rozmrożona porcja: do lodówki, dobra przez 2 dni.
export function przelozDoLodowki(dane, id, dzien = dzis()) {
  const x = dane.lodowka.find((y) => y.id === id);
  if (!x || x.porcje < 1) return null;
  x.porcje -= 1;
  x.start = Math.max(x.porcje, x.start - 1);
  const nowa = { ...x, id: noweId(), miejsce: "lodowka", porcje: 1, start: 1, dobre_do: dodaj(dzien, 2), trwalosc_dni: 2, ugotowano: dzien, z_zamrazarki: true, z: x.id, zmieniono: dzien };
  dane.lodowka.push(nowa);
  return nowa.id;
}

export function cofnijPrzelozenie(dane, id) {
  const x = dane.lodowka.find((y) => y.id === id);
  const zrodlo = x && dane.lodowka.find((y) => y.id === x.z);
  if (!x || !zrodlo || x.porcje < 1) return;
  zrodlo.porcje += 1;
  zrodlo.start += 1;
  dane.lodowka = dane.lodowka.filter((y) => y.id !== id);
}

// Porcje, które nie zostaną zjedzone przed terminem (np. przed wyjazdem), można zamrozić — wszystkie albo `ile`.
export function zamroz(dane, id, ile = null) {
  const x = dane.lodowka.find((y) => y.id === id);
  if (!x || !x.mrozi || x.porcje < 1) return;
  const n = Math.min(x.porcje, ile ?? x.porcje);
  dane.lodowka.push({ ...x, id: noweId(), miejsce: "zamrazarka", porcje: n, start: n, dobre_do: null });
  x.porcje -= n;
  x.start = Math.max(x.porcje, x.start - n);
  if (x.porcje === 0) dane.lodowka = dane.lodowka.filter((y) => y.id !== id);
}

// Zjedzone do końca pozycje znikają następnego dnia (do tego czasu można cofnąć).
export function porzadkuj(dane, dzien = dzis()) {
  dane.lodowka = dane.lodowka.filter((x) => x.porcje > 0 || (x.start > 0 && x.zmieniono === dzien));
}

export function lodowka(dane) {
  return dane.lodowka.filter((x) => x.miejsce === "lodowka" && (x.porcje > 0 || x.start > 0)).sort((a, b) => (a.dobre_do < b.dobre_do ? -1 : 1));
}

export function zamrazarka(dane) {
  return dane.lodowka.filter((x) => x.miejsce === "zamrazarka" && x.porcje > 0);
}

// --- Kopia zapasowa ---

export function eksport(dane) {
  return JSON.stringify({ ...dane, eksport: new Date().toISOString(), aplikacja: "planer-dash-telefon" }, null, 1);
}

// Plik z telefonu albo kopia z wersji na Maca (planer-dash-kopia-*.json).
export function importuj(tekst) {
  const z = JSON.parse(tekst);
  if (!z || typeof z !== "object" || !z.profil) throw new Error("To nie wygląda na kopię danych planera.");
  const dane = puste();
  if (z.aplikacja === "planer-dash-telefon") return { ...dane, ...z, profil: { ...DOMYSLNY_PROFIL, ...z.profil } };
  // Kopia z Maca: profil, zamiany, zapasy i ostatnie tygodnie (do rotacji dań). Dziennika nie przenosimy.
  dane.profil = { ...DOMYSLNY_PROFIL, ...z.profil }; // miasta (dom, wyjazd) ustawiasz w Profilu
  dane.profil_ustawiony = true;
  dane.zamiany_stale = z.zamiany_stale ?? {};
  dane.produkty_zmiany = z.produkty_zmiany ?? {};
  dane.produkty_wlasne = z.produkty_wlasne ?? {};
  dane.zapasy = z.zapasy ?? {};
  dane.tygodnie = z.tygodnie ?? {};
  for (const [przepis, ile] of Object.entries(z.zamrazarka ?? {})) {
    if (ile > 0) dane.lodowka.push({ id: noweId(), przepis, nazwa: przepis, miejsce: "zamrazarka", porcje: ile, start: ile, dobre_do: null, mrozi: true });
  }
  return dane;
}
