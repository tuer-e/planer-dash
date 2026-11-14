// Kuchnia: trzy miejsca — lodówka (ugotowane porcje), blat (śniadania, owoce, spiżarnia) i plecak (przekąska).
// Planer patrzy na godzinę i podpowiada jedno miejsce. Blat i plecak niczego nie liczą: pokazują danie z planu
// i co jeszcze da się zrobić z tego, co jest w domu albo na liście zakupów tego tygodnia.
import { kontekst, planZDopisanymi, tenTydzien } from "./stan.js";
import { dodaj, roznica } from "./narzedzia.js";
import { zapotrzebowanie } from "../silnik/generator.js";

export const MIEJSCA = { lod: "Lodówka", blat: "Blat", plecak: "Plecak" };
export const DOMYSLNE_GODZINY = { sniadanie: "07:30", przekaska: "11:00", obiad: "14:00", kolacja: "19:00" };
export const POSILKI_KUCHNI = ["sniadanie", "przekaska", "obiad", "kolacja"];
const MIEJSCE_POSILKU = { sniadanie: "blat", przekaska: "plecak", obiad: "lod", kolacja: "lod" };
const PORA = { sniadanie: "Pora śniadania", przekaska: "Pora przekąski", obiad: "Pora obiadu", kolacja: "Pora kolacji" };
const PRZED = 30; // posiłek „zaczyna się” pół godziny przed swoją godziną
const PO_KOLACJI = 120; // dwie godziny po kolacji myślimy już o jutrzejszym śniadaniu
const OWOCE_NA_BLACIE = ["jablko", "gruszka", "banan", "cytrusy"];
const DZIALY_SPIZARNI = ["suche", "tluszcze_dodatki"];

export function minuty(godzina) {
  const z = /^(\d{1,2}):(\d{2})$/.exec(String(godzina ?? "").trim());
  return z && Number(z[1]) < 24 && Number(z[2]) < 60 ? Number(z[1]) * 60 + Number(z[2]) : null;
}

export function godzinyPosilkow(profil) {
  const g = { ...DOMYSLNE_GODZINY };
  for (const p of POSILKI_KUCHNI) if (minuty(profil?.godziny?.[p]) !== null) g[p] = profil.godziny[p];
  return g;
}

// Który posiłek jest teraz: { posilek, jutro, przed } — „przed” = jeszcze przed śniadaniem.
export function poraDnia(profil, teraz = new Date()) {
  const g = godzinyPosilkow(profil);
  const m = teraz.getHours() * 60 + teraz.getMinutes();
  if (m >= minuty(g.kolacja) + PO_KOLACJI) return { posilek: "sniadanie", jutro: true, przed: false };
  const p = [...POSILKI_KUCHNI].reverse().find((x) => m >= minuty(g[x]) - PRZED);
  return p ? { posilek: p, jutro: false, przed: false } : { posilek: "sniadanie", jutro: false, przed: true };
}

// Podpowiadane miejsce i krótki powód. Pusta lodówka w porze obiadu albo kolacji → blat (coś bez gotowania).
export function podpowiedz(profil, maPorcje, teraz = new Date()) {
  const pora = poraDnia(profil, teraz);
  let miejsce = MIEJSCE_POSILKU[pora.posilek];
  let powod = pora.jutro ? "Na jutro rano" : pora.przed ? "Na rano" : PORA[pora.posilek];
  const bezGotowania = miejsce === "lod" && !maPorcje;
  if (bezGotowania) {
    miejsce = "blat";
    powod += " · lodówka pusta";
  }
  return { miejsce, powod, pora, bezGotowania };
}

// Danie z planu na dany posiłek i dzień (poniedziałek rano może być jeszcze w planie poprzedniego tygodnia).
export function zPlanuNaDzien(dane, posilek, data) {
  const od = tenTydzien(data);
  for (const [tydzien, d] of [[od, roznica(data, od)], [dodaj(od, -7), roznica(data, od) + 7]]) {
    const plan = dane.tygodnie[tydzien];
    if (!plan) continue;
    const g = plan.grupy.find((x) => x.posilek === posilek && x.przepis
      && x.sloty.some(([dz, p]) => dz === d && p === posilek)
      && !(x.usuniete ?? []).some(([dz, p]) => dz === d && p === posilek));
    if (g) return g.przepis;
  }
  return null;
}

// Co jest w domu: składniki planu tego tygodnia (lista zakupów), dopisane produkty, zapasy z szafki
// i rzeczy, które są zawsze (przyprawy, ocet). Ilości nie liczymy.
export function coMasz(dane, data) {
  const od = tenTydzien(data);
  const ctx = kontekst(dane, od);
  const masz = new Set(Object.values(ctx.produkty).filter((p) => p.typ === "stale").map((p) => p.id));
  const plan = planZDopisanymi(dane, od);
  if (plan) for (const id of Object.keys(zapotrzebowanie(plan.grupy, ctx, plan.zamiany_produktow ?? {}))) masz.add(id);
  for (const id of plan?.mam_w_domu ?? []) masz.add(id);
  for (const [id, z] of Object.entries(dane.zapasy ?? {})) if (z?.stan === "jest" || z?.stan === "konczy_sie") masz.add(id);
  for (const id of dane.dopisane_produkty?.[od] ?? []) masz.add(id);
  return { masz, ctx, od, zamiany: plan?.zamiany_produktow ?? {} };
}

// Produkty przepisu tak, jak się je kupuje (białko jaja → jajka; zamiany z planu).
export function produktyPrzepisu(przepis, ctx, zamiany = {}) {
  const wynik = [];
  for (const [id0] of przepis.skladniki) {
    let id = zamiany[id0] ?? id0;
    const p = ctx.produkty[id];
    if (!p) continue;
    if (p.kupowane_jako) id = p.kupowane_jako;
    if (!wynik.includes(id)) wynik.push(id);
  }
  return wynik;
}

// Przepisy na dany posiłek z tego, co masz: najpierw te, na które masz wszystko, potem z jednym brakującym.
export function propozycje(stan, { posilek, bezGotowania = false, pomin = [], ile = 3 }) {
  const { masz, ctx, zamiany } = stan;
  const kandydaci = Object.values(ctx.przepisy).filter((p) => !p.wycofany && !p.wykluczony && !(p.okazja ?? []).length
    && !pomin.includes(p.id)
    && (bezGotowania ? p.bez_garnkow && p.posilek.some((x) => x === "obiad" || x === "kolacja") : p.posilek.includes(posilek)));
  const ocenione = kandydaci.map((p) => ({ id: p.id, nazwa: p.nazwa, czas: p.czas_min, brakuje: produktyPrzepisu(p, ctx, zamiany).filter((id) => !masz.has(id)) }))
    .filter((x) => x.brakuje.length <= 1)
    .sort((a, b) => a.brakuje.length - b.brakuje.length || a.czas - b.czas || (a.id < b.id ? -1 : 1));
  const pelne = ocenione.filter((x) => !x.brakuje.length);
  const zJednym = ocenione.filter((x) => x.brakuje.length === 1);
  return [...pelne.slice(0, Math.max(1, ile - 1)), ...zJednym].slice(0, ile);
}

// „Płatki owsiane górskie 500 g” → „płatki owsiane górskie”
export function krotkiProdukt(nazwa) {
  return nazwa.replace(/\s*\(.*?\)/g, "").replace(/\s+\d[\d,.]*(\s*[×x]\s*\d[\d,.]*)?\s*(g|kg|ml|l|szt\.?)(?=\s|$).*$/i, "").replace(/\s+z puszki$/i, "").trim().toLowerCase();
}

export function naBlacie(stan) {
  return OWOCE_NA_BLACIE.filter((id) => stan.masz.has(id) && stan.ctx.produkty[id]).map((id) => krotkiProdukt(stan.ctx.produkty[id].nazwa));
}

export function wSpizarni(dane, stan) {
  return Object.entries(dane.zapasy ?? {})
    .filter(([id, z]) => (z?.stan === "jest" || z?.stan === "konczy_sie") && DZIALY_SPIZARNI.includes(stan.ctx.produkty[id]?.dzial)
      && stan.ctx.produkty[id].typ !== "stale")
    .map(([id]) => krotkiProdukt(stan.ctx.produkty[id].nazwa))
    .sort((a, b) => a.localeCompare(b, "pl"));
}

// Produkt dopisany do zakupów z kuchni (pojedynczo, bez całego przepisu).
export function dopiszProdukt(dane, od, id) {
  const lista = (dane.dopisane_produkty ??= {})[od] ??= [];
  if (!lista.includes(id)) lista.push(id);
}

export function usunProdukt(dane, od, id) {
  if (!dane.dopisane_produkty?.[od]) return;
  dane.dopisane_produkty[od] = dane.dopisane_produkty[od].filter((x) => x !== id);
  if (!dane.dopisane_produkty[od].length) delete dane.dopisane_produkty[od];
}
