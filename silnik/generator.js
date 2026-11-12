// Generator planu tygodnia: jawne reguły, bez losowania. Wierne przeniesienie planer/generator.py
// (wersja na Maca) — opis reguł jest tam; testy porównują wyniki obu wersji na tych samych tygodniach.
import { celeDzienne } from "./cele.js";
import { SKLADNIKI, wartosciPorcji } from "./katalog.js";
import { dodajDni, dzienTygodnia, kopia, liczbaG, miesiac, porownaj, posortuj, roznicaDni, sha1, zaokr, zawiera } from "./pomocnicze.js";

export const NAZWY_DNI = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela", "Poniedziałek"];
export const POSILKI_DNIA = ["sniadanie", "przekaska", "obiad", "kolacja"];
export const LICZBA_DNI = 8;
export const WEEKEND = [5, 6];
export const DOMYSLNY_PONIEDZIALEK = { gotowanie: "wieczorem", poranek: "poprzedni", nastepny_poranek: true };
const GOTOWANIE = ["wieczorem", "rano"];
const PORANEK = ["poprzedni", "ten"];
const UDZIAL_POSILKU = { sniadanie: 0.25, przekaska: 0.12, obiad: 0.36, kolacja: 0.27 };

export const OKNA_ROTACJI = { obiad: 3, kolacja: 2, sniadanie: 1, przekaska: 0 };
export const KARA_ZA_POWTORKE = 100.0;
const OKNO_OKAZJI = 4;
const KARA_POZA_SEZONEM = 0.5;
const KARA_POZA_KROTKIM_SEZONEM = 2;
const KARA_TO_SAMO_BIALKO = 15.0;
const ROZRZUT_ZL = 2.0;
const PORY_ROKU = { zima: [10, 11, 12, 1, 2, 3], lato: [6, 7, 8, 9] };
const PRZEJSCIE = [4, 5];
export const KARA_POZA_PORA_ROKU = 60.0;

export const WARIANTY = [["A", [0, 1, 2]], ["B", [3, 4]], ["C", [5, 6, 7]]];
const MAX_AKTYWNY_PONIEDZIALEK_MIN = 90;
const MAX_GOTOWANIE_PONIEDZIALEK_MIN = 120;
const POJEMNOSC_ZAMRAZARKI = 8;
const TRWALOSC_DOMYSLNA = 7;
const DNI_SWIEZEJ_RYBY = [0, 1, 2, 3];

const DODATKI = [
  ["owoce", "jablko", 150, "1 jabłko"],
  ["owoce", "gruszka", 130, "1 gruszka"],
  ["owoce", "cytrusy", 150, "1 pomarańcza lub 2 mandarynki"],
  ["owoce", "banan", 120, "1 banan"],
  ["nabial", "maslanka", 250, "szklanka maślanki"],
  ["nabial", "jogurt_kubeczek", 150, "1 kubeczek jogurtu naturalnego (150 g)"],
  ["orzechy_straczki", "orzechy_wloskie", 15, "3 połówki orzechów włoskich"],
  ["zboza", "chleb", 30, "kromka chleba razowego"],
];
const MAX_DODATKOW_DZIENNIE = 3;
const DZIALY_RAT = ["chemia", "napoje_slodycze"];
const TOLERANCJA_KCAL = 0.12;
const MAX_KROKOW_NAPRAWY = 40;
export const TOLERANCJA_OPAKOWANIA = 0.05;
export const WERSJA_PLANU = 3;

const suma = (lista) => lista.reduce((a, b) => a + b, 0);

export class Kontekst {
  // `od`: poniedziałek tygodnia (RRRR-MM-DD). `zamiany`: stałe zamiany produktów ({produkt: zamiennik}).
  constructor(od, profil, przepisy, produkty, reguly, historia = [], zamiany = {}) {
    this.od = od;
    this.profil = profil;
    this.zamiany = Object.fromEntries(Object.entries(zamiany || {}).filter(([k, v]) => k in produkty && v in produkty));
    this.przepisy = {};
    for (const [i, p] of Object.entries(przepisy)) this.przepisy[i] = zeStalymiZamianami(p, this.zamiany, produkty);
    // „Czego nie jem” z profilu: dania z takim produktem (po nazwie albo oznaczeniu) nie trafiają do planu.
    const nieJem = (profil.wykluczone ?? []).map((w) => w.trim().toLowerCase()).filter(Boolean);
    if (nieJem.length) {
      for (const [i, p] of Object.entries(this.przepisy)) {
        const opisy = [p.nazwa, ...p.skladniki.flatMap(([id]) => [produkty[id].nazwa, ...(produkty[id].tagi ?? [])])].map((t) => t.toLowerCase());
        if (nieJem.some((w) => opisy.some((t) => t.includes(w)))) this.przepisy[i] = { ...p, wykluczony: true };
      }
    }
    this.produkty = produkty;
    this.dodatki = DODATKI.map(([g, i, gramy, opis]) => [g, this.zamiany[i] ?? i, gramy,
      i in this.zamiany ? `${produkty[this.zamiany[i]].nazwa} (zamiast: ${opis})` : opis]);
    this.reguly = reguly;
    this.cele = celeDzienne(profil, reguly);
    this.limity = reguly.limity;
    this.maxOgraniczone = reguly.klasy_produktow.ograniczone.max_razy_tydzien;
    this.miesiac = miesiac(od);
    this.w = {};
    for (const [i, p] of Object.entries(this.przepisy)) this.w[i] = wartosciPorcji(p, produkty);
    this.ostatnie = this._ostatnioUzyte(historia);
    this.ratyZapasow = this._ratyZapasow();
    this.rezerwaStala = zaokr(suma(Object.values(this.ratyZapasow)), 2);
    this.ustawTryb("sam");
    this.pojemnosc = profil.zamrazarka_pudelka ?? POJEMNOSC_ZAMRAZARKI;
    this.mamWDomu = new Set();
  }

  ustawTryb(trybWeekendu, grupy = []) {
    this.budzetGosc = trybWeekendu === "dla_dwojga" ? (this.profil.budzet_gosc_zl ?? 0) : 0;
    this.budzetOkazje = 0;
    for (const g of grupy) {
      if (g.rodzaj === "okazja" && slotyJedzone(g).length) {
        if (g.okazja === "rodzinny") this.budzetOkazje += this.profil.budzet_rodzinny_zl ?? 0;
        else if (trybWeekendu !== "dla_dwojga") this.budzetOkazje += this.profil.budzet_gosc_zl ?? 0;
      }
    }
    this.budzet = this.profil.budzet_tydzien_zl + this.budzetGosc + this.budzetOkazje;
    this.budzetLimit = this.budzet * (1 + this.profil.tolerancja_budzetu_proc / 100.0);
  }

  _ratyZapasow() {
    const uzyte = new Set();
    for (const p of Object.values(this.przepisy)) for (const s of p.skladniki) uzyte.add(s[0]);
    for (const x of this.dodatki) uzyte.add(x[1]);
    for (const i of [...uzyte]) if (this.produkty[i].kupowane_jako) uzyte.add(this.produkty[i].kupowane_jako);
    const raty = {};
    for (const [i, p] of Object.entries(this.produkty)) {
      if (p.typ === "zapasowe" && !uzyte.has(i) && p.klasa !== "niewskazane" && DZIALY_RAT.includes(p.dzial)) {
        raty[i] = zaokr(p.cena_zl / p.tygodnie_zuzycia, 2);
      }
    }
    return raty;
  }

  _ostatnioUzyte(historia) {
    const ostatnie = {};
    for (const p of Object.keys(OKNA_ROTACJI)) ostatnie[p] = new Set();
    ostatnie.okazja = new Set();
    for (const plan of historia) {
      const tygodnieTemu = Math.floor(roznicaDni(this.od, plan.od) / 7);
      if (tygodnieTemu < 1) continue;
      for (const g of plan.grupy) {
        if (g.sloty != null && !slotyJedzone(g).length) continue;
        for (const [posilek, okno] of Object.entries(OKNA_ROTACJI)) {
          if (tygodnieTemu <= okno && g.przepis) for (const i of przepisyGrupy(g)) ostatnie[posilek].add(i);
        }
        if (g.rodzaj === "okazja" && tygodnieTemu <= OKNO_OKAZJI) for (const i of przepisyGrupy(g)) ostatnie.okazja.add(i);
      }
    }
    return ostatnie;
  }

  rozrzut(id) {
    return parseInt(sha1(`${this.od}:${id}`).slice(0, 8), 16) / 0xffffffff * ROZRZUT_ZL;
  }

  karaSezonowa(id) {
    let kara = 0.0;
    for (const [idProduktu] of this.przepisy[id].skladniki) {
      const p = this.produkty[idProduktu];
      if (p.typ === "swieze" && p.sezon && p.sezon.length && !p.sezon.includes(this.miesiac)) {
        kara += p.sezon.length <= 4 ? KARA_POZA_KROTKIM_SEZONEM : KARA_POZA_SEZONEM;
      }
    }
    const pora = this.przepisy[id].pora_roku;
    if (pora && ![...PORY_ROKU[pora], ...PRZEJSCIE].includes(this.miesiac)) kara += KARA_POZA_PORA_ROKU;
    return kara;
  }

  ocena(id, grupa) {
    let wynik = this.w[id].koszt_zl + this.karaSezonowa(id) + this.rozrzut(id);
    const niedawno = this.ostatnie[grupa.posilek];
    if ((niedawno && niedawno.has(id)) || (grupa.rodzaj === "okazja" && this.ostatnie.okazja.has(id))) wynik += KARA_ZA_POWTORKE;
    return wynik;
  }

  bialko(id) {
    const tagi = this.w[id].tagi;
    for (const tag of ["ryba", "czerwone_mieso", "drob", "straczki"]) if (tagi.includes(tag)) return tag;
    if (this.przepisy[id].skladniki.some((s) => s[0].startsWith("tofu"))) return "tofu";
    return "inne";
  }

  aktywny(id) {
    const p = this.przepisy[id];
    return p.czas_aktywny_min ?? p.czas_min;
  }

  swiezaRyba(id) {
    return this.przepisy[id].skladniki.some((s) => (this.produkty[s[0]].tagi ?? []).includes("ryba") && this.produkty[s[0]].dzial !== "suche");
  }

  ograniczoneW(id) {
    return [...new Set(this.przepisy[id].skladniki.filter((s) => this.produkty[s[0]].klasa === "ograniczone").map((s) => s[0]))];
  }

  wytrzyma(id, dzien) {
    return this.przepisy[id].skladniki.every((s) => trwaloscProduktu(this.produkty[s[0]]) >= dzien);
  }

  mrozona(id, dzien) {
    return dzien > this.przepisy[id].trwalosc_dni;
  }
}

// Przepis ze stałymi zamianami; całe opakowania zamieniane na całe opakowania zamiennika.
function zeStalymiZamianami(przepis, zamiany, produkty) {
  if (!przepis.skladniki.some((s) => s[0] in zamiany)) return przepis;
  const skladniki = przepis.skladniki.map(([i, gramy, miara]) => {
    if (!(i in zamiany)) return [i, gramy, miara];
    const z = zamiany[i];
    const stare = produkty[i].opakowanie_g;
    const nowe = produkty[z].opakowanie_g;
    let ile = gramy / stare;
    if (!produkty[i].na_wage && !produkty[z].na_wage && ile >= 1 && Math.abs(ile - zaokr(ile)) < 1e-9) {
      ile = zaokr(ile);
      const nazwa = produkty[z].opakowanie_nazwa ?? "opakowanie";
      return [z, ile * nowe, `${ile} ${ile === 1 ? nazwa : (produkty[z].opakowania_nazwa ?? nazwa)} (${liczbaG(ile * nowe)} g)`];
    }
    return [z, gramy, miara];
  });
  return { ...przepis, skladniki };
}

export function trwaloscProduktu(p) {
  return p.typ === "swieze" ? (p.trwalosc_dni ?? TRWALOSC_DOMYSLNA) : 365;
}

// --- Szkielet tygodnia ---

export function ustawienia(plan) {
  return { ...DOMYSLNY_PONIEDZIALEK, ...(plan.poniedzialek || {}) };
}

export function sprawdzUstawienia(ust) {
  ust = { ...DOMYSLNY_PONIEDZIALEK, ...(ust || {}) };
  if (!GOTOWANIE.includes(ust.gotowanie) || !PORANEK.includes(ust.poranek) || typeof ust.nastepny_poranek !== "boolean") {
    throw new Error("Nieprawidłowe ustawienia poniedziałku.");
  }
  return ust;
}

export function posilkiWDniu(d, ust = DOMYSLNY_PONIEDZIALEK) {
  if (d === 0) {
    if (ust.poranek === "ten") return [...POSILKI_DNIA];
    return ust.gotowanie === "rano" ? ["obiad", "kolacja"] : ["kolacja"];
  }
  if (d === 7) return ust.nastepny_poranek ? ["sniadanie", "przekaska", "obiad"] : [];
  return [...POSILKI_DNIA];
}

export function dniWDomu(trybWeekendu, poza = null) {
  if (poza == null) poza = trybWeekendu === "poza_domem" ? WEEKEND : [];
  return [...Array(LICZBA_DNI).keys()].filter((d) => !poza.includes(d));
}

// Pół dnia poza domem: {dzień: "wieczor"} — rano w domu, wieczorem wyjazd (kolacja poza domem);
// {dzień: "rano"} — rano wyjazd, wieczorem w domu (śniadanie, przekąska i obiad poza domem).
export const POLOWKI = ["rano", "wieczor"];

export function pozaPosilek(polowki, d, posilek) {
  const p = polowki?.[d];
  if (!p) return false;
  return p === "wieczor" ? posilek === "kolacja" : posilek !== "kolacja";
}

export function polowkiPlanu(plan) {
  return plan.poza_pol ?? {};
}

export function pozaDomem(plan) {
  if ("poza_domem" in plan) return [...plan.poza_domem];
  return plan.tryb_weekendu === "poza_domem" ? [...WEEKEND] : [];
}

export function osoby(dzien, trybWeekendu) {
  return trybWeekendu === "dla_dwojga" && WEEKEND.includes(dzien) ? 2 : 1;
}

export function przepisyGrupy(g) {
  return g.przepis ? [g.przepis, ...(g.dodatkowe ?? [])] : [];
}

export function wartosciGrupy(g, ctx) {
  const s = {};
  for (const i of przepisyGrupy(g)) {
    for (const [k, v] of Object.entries(ctx.w[i])) {
      if (typeof v === "number") s[k] = (s[k] ?? 0) + v;
      else if (k === "porcje_dash") {
        const pd = s.porcje_dash ?? (s.porcje_dash = {});
        for (const [gr, ile] of Object.entries(v)) pd[gr] = (pd[gr] ?? 0) + ile;
      }
    }
  }
  return s;
}

export function slotyJedzone(g) {
  const usuniete = g.usuniete ?? [];
  return g.sloty.filter((s) => !zawiera(usuniete, s));
}

export function osobyWDniu(g, dzien) {
  return g.osoby + ((g.dwoje ?? []).includes(dzien) ? 1 : 0);
}

export function porcje(g, sloty = null) {
  sloty = sloty ?? slotyJedzone(g);
  return suma(sloty.map(([d]) => osobyWDniu(g, d)));
}

export function dzienGotowania(g) {
  return g.dzien_gotowania ?? 0;
}

export function zZamrazarki(g, dzien, ctx) {
  if (g.rodzaj === "zamrazarka") return true;
  return g.rodzaj === "partia" && Boolean(g.przepis) && ctx.mrozona(g.przepis, dzien - dzienGotowania(g));
}

export function zamrozone(grupy, ctx) {
  return suma(grupy.filter((g) => g.przepis).map((g) => porcje(g, slotyJedzone(g).filter((s) => zZamrazarki(g, s[0], ctx)))));
}

export function szkielet(trybWeekendu, usuniete = [], ust = null, poza = null, zamrazarka = null, ctx = null, polowki = {}) {
  ust = ust || DOMYSLNY_PONIEDZIALEK;
  const wDomu = new Set(dniWDomu(trybWeekendu, poza));
  const jeszWDomu = (d, posilek) => wDomu.has(d) && posilkiWDniu(d, ust).includes(posilek) && !pozaPosilek(polowki, d, posilek);
  const miejsca = (posilek, od = 0) => [...Array(LICZBA_DNI).keys()].filter((d) => d >= od && jeszWDomu(d, posilek));
  const wieczorem = ust.gotowanie === "wieczorem";
  const obiady = miejsca("obiad", wieczorem ? 1 : 0);
  const kolacje = miejsca("kolacja");
  const grupy = [];
  for (const [id, ile] of posortuj(Object.entries(zamrazarka || {}))) {
    const lista = ctx.przepisy[id].posilek.includes("obiad") ? obiady : kolacje;
    const sloty = [];
    for (let n = 0; n < ile; n++) {
      const wolne = lista.filter((d) => !(wieczorem && d === 0));
      if (!wolne.length) break;
      const ostatni = wolne[wolne.length - 1];
      lista.splice(lista.indexOf(ostatni), 1);
      sloty.push([ostatni, lista === obiady ? "obiad" : "kolacja"]);
    }
    if (sloty.length) {
      grupy.push({ id: `zamrazarka_${id}`, posilek: sloty[0][1], rodzaj: "zamrazarka", sloty: posortuj(sloty), przepis: id });
    }
  }
  let aSloty = [];
  if (wieczorem && kolacje.includes(0)) {
    kolacje.splice(kolacje.indexOf(0), 1);
    aSloty.push([0, "kolacja"]);
  }
  aSloty.push(...obiady.filter((_, i) => i % 2 === 0).map((d) => [d, "obiad"]));
  let bSloty = obiady.filter((_, i) => i % 2 === 1).map((d) => [d, "obiad"]);
  if (bSloty.length === 1) {
    aSloty = posortuj([...aSloty, ...bSloty]);
    bSloty = [];
  }
  let zupa = kolacje.filter((_, i) => i % 2 === 1);
  let bezGarnkow = kolacje.filter((_, i) => i % 2 === 0);
  if (zupa.length < 2) {
    zupa = [];
    bezGarnkow = kolacje;
  }
  for (const [idGrupy, posilek, sloty] of [["obiad_A", "obiad", aSloty], ["obiad_B", "obiad", bSloty], ["kolacja_Z", "kolacja", zupa.map((d) => [d, "kolacja"])]]) {
    if (sloty.length) grupy.push({ id: idGrupy, posilek, rodzaj: "partia", sloty });
  }
  if (wieczorem && wDomu.has(0) && posilkiWDniu(0, ust).includes("obiad")) {
    grupy.push({ id: "obiad_0", posilek: "obiad", rodzaj: "szybki", sloty: [[0, "obiad"]] });
  }
  for (const d of bezGarnkow) grupy.push({ id: `kolacja_${d}`, posilek: "kolacja", rodzaj: "kolacja", sloty: [[d, "kolacja"]] });
  for (const posilek of ["sniadanie", "przekaska"]) {
    for (const [litera, dni] of WARIANTY) {
      const sloty = dni.filter((d) => jeszWDomu(d, posilek)).map((d) => [d, posilek]);
      if (sloty.length) grupy.push({ id: `${posilek}_${litera}`, posilek, rodzaj: "wariant", sloty });
    }
  }
  const usun = usuniete.map((x) => [...x]);
  const dlaDwojga = [...Array(LICZBA_DNI).keys()].filter((d) => osoby(d, trybWeekendu) === 2);
  for (const g of grupy) {
    g.osoby = 1;
    g.dwoje = g.sloty.filter(([d]) => dlaDwojga.includes(d)).map(([d]) => d);
    if (!("przepis" in g)) g.przepis = null;
    g.usuniete = g.sloty.filter((s) => zawiera(usun, s));
  }
  return grupy;
}

// --- Kandydaci i ograniczenia ---

export function pasuje(id, grupa, ctx) {
  const p = ctx.przepisy[id];
  if (p.wycofany || p.wykluczony) return false;
  const rodzaj = grupa.rodzaj;
  const posilki = rodzaj === "szybki" ? ["obiad", "kolacja"] : [grupa.posilek];
  if (!posilki.some((x) => p.posilek.includes(x))) return false;
  if (rodzaj === "okazja") {
    const swiezaPozaTerminem = ctx.swiezaRyba(id) && grupa.sloty.some(([d]) => !DNI_SWIEZEJ_RYBY.includes(d));
    return (p.okazja ?? []).includes(grupa.okazja) && !swiezaPozaTerminem;
  }
  if (p.okazja && p.okazja.length) return false;
  const dni = grupa.sloty.map(([d]) => d);
  if (rodzaj === "partia" || rodzaj === "zamrazarka") {
    return Boolean(p.na_zapas) && dni.every((d) => d <= p.trwalosc_dni || p.mrozi_sie);
  }
  return Boolean(p.bez_garnkow) && ctx.wytrzyma(id, Math.max(...dni));
}

export function kandydaci(grupa, ctx) {
  return Object.keys(ctx.przepisy).filter((i) => pasuje(i, grupa, ctx));
}

function* zjedzone(grupy) {
  for (const g of grupy) for (const i of przepisyGrupy(g)) for (const [d, posilek] of slotyJedzone(g)) yield [d, posilek, i];
}

export function liczniki(grupy, ctx) {
  let ryby = 0;
  let czerwone = 0;
  let jaja = 0.0;
  const ograniczone = {};
  const sod = Array(LICZBA_DNI).fill(0.0);
  for (const [d, , i] of zjedzone(grupy)) {
    const w = ctx.w[i];
    ryby += w.tagi.includes("tlusta_ryba_morska") ? 1 : 0;
    czerwone += w.tagi.includes("czerwone_mieso") ? 1 : 0;
    jaja += w.jaja_cale;
    sod[d] += w.sod_mg;
    for (const idProduktu of ctx.ograniczoneW(i)) ograniczone[idProduktu] = (ograniczone[idProduktu] ?? 0) + 1;
  }
  return { ryby, czerwone, jaja, ograniczone, sod };
}

export function naruszenia(grupy, ctx) {
  const wynik = [];
  const uzyte = grupy.filter((g) => g.przepis && slotyJedzone(g).length).map((g) => g.przepis);
  for (const i of new Set(uzyte)) {
    if (uzyte.filter((x) => x === i).length > 1) wynik.push(`„${ctx.przepisy[i].nazwa}” jest w planie więcej niż raz.`);
  }
  const licz = liczniki(grupy, ctx);
  if (licz.czerwone > ctx.limity.czerwone_mieso_razy_tydzien_max) {
    wynik.push(`Czerwone mięso ${licz.czerwone}× w tygodniu (maks. ${ctx.limity.czerwone_mieso_razy_tydzien_max}).`);
  }
  if (licz.jaja > ctx.limity.jaja_cale_tydzien_max + 1e-9) {
    wynik.push(`Całe jaja: ${liczbaG(licz.jaja)} w tygodniu (maks. ${ctx.limity.jaja_cale_tydzien_max}).`);
  }
  for (const [idProduktu, ile] of Object.entries(licz.ograniczone)) {
    if (ile > ctx.maxOgraniczone) wynik.push(`${ctx.produkty[idProduktu].nazwa}: ${ile}× w tygodniu (produkt ograniczony, maks. ${ctx.maxOgraniczone}).`);
  }
  licz.sod.forEach((sod, d) => {
    if (sod > ctx.cele.sod_mg_max) wynik.push(`${NAZWY_DNI[d]}: ${zaokr(sod)} mg sodu (limit ${ctx.cele.sod_mg_max}).`);
  });
  const partie = grupy.filter((g) => g.rodzaj === "partia" && g.przepis && slotyJedzone(g).length).map((g) => g.przepis);
  const wKuchni = suma(partie.map((i) => ctx.aktywny(i)));
  if (wKuchni > MAX_AKTYWNY_PONIEDZIALEK_MIN) wynik.push(`Poniedziałkowe gotowanie: ${wKuchni} min przy garnkach (maks. ${MAX_AKTYWNY_PONIEDZIALEK_MIN}).`);
  if (partie.length && Math.max(...partie.map((i) => ctx.przepisy[i].czas_min)) > MAX_GOTOWANIE_PONIEDZIALEK_MIN) {
    wynik.push(`Poniedziałkowe gotowanie trwa ponad ${MAX_GOTOWANIE_PONIEDZIALEK_MIN} min.`);
  }
  const wZamrazarce = zamrozone(grupy, ctx);
  if (wZamrazarce > ctx.pojemnosc) wynik.push(`Zamrażarka: ${wZamrazarce} pudełek, a mieści się ${ctx.pojemnosc}.`);
  return wynik;
}

function dopuszczalny(grupy, grupa, id, ctx) {
  const stary = grupa.przepis;
  grupa.przepis = id;
  const ok = !naruszenia(grupy, ctx).length;
  grupa.przepis = stary;
  return ok;
}

function ocenaWPlanie(i, grupa, grupy, ctx, kosztBez) {
  const stary = grupa.przepis;
  grupa.przepis = i;
  const przyrost = kosztTygodnia(grupy, ctx).jedzenie - kosztBez;
  grupa.przepis = stary;
  const kary = ctx.ocena(i, grupa) - ctx.w[i].koszt_zl;
  return przyrost / Math.max(porcje(grupa), 1) + kary;
}

export function wypelnij(grupy, grupa, ctx) {
  const stary = grupa.przepis;
  grupa.przepis = null;
  const kosztBez = kosztTygodnia(grupy, ctx).jedzenie;
  grupa.przepis = stary;
  const oceny = kandydaci(grupa, ctx).map((i) => [i, ocenaWPlanie(i, grupa, grupy, ctx, kosztBez)]);
  for (const [i] of posortuj(oceny, (x) => x[1])) {
    if (dopuszczalny(grupy, grupa, i, ctx)) {
      grupa.przepis = i;
      return true;
    }
  }
  return false;
}

// --- Budowa planu ---

const poId = (grupy, id) => grupy.find((g) => g.id === id) ?? null;

function wybierzPartie(grupy, ctx) {
  const a = poId(grupy, "obiad_A");
  const b = poId(grupy, "obiad_B");
  const para = [a, b].filter((g) => g && slotyJedzone(g).length);
  if (para.length < 2) {
    for (const g of para) wypelnij(grupy, g, ctx);
    return;
  }
  let najlepsza = null;
  const kandA = kandydaci(a, ctx);
  const kandB = kandydaci(b, ctx);
  for (const ia of kandA) {
    for (const ib of kandB) {
      if (ia === ib) continue;
      a.przepis = ia;
      b.przepis = ib;
      if (naruszenia(grupy, ctx).length) continue;
      const kary = (ctx.ocena(ia, a) - ctx.w[ia].koszt_zl) + (ctx.ocena(ib, b) - ctx.w[ib].koszt_zl);
      let ocena = kosztTygodnia(grupy, ctx).jedzenie + 2 * kary;
      if (ctx.bialko(ia) === ctx.bialko(ib)) ocena += KARA_TO_SAMO_BIALKO;
      if (najlepsza === null || ocena < najlepsza[0]) najlepsza = [ocena, ia, ib];
    }
  }
  [a.przepis, b.przepis] = najlepsza ? [najlepsza[1], najlepsza[2]] : [null, null];
}

function naprawRyby(grupy, ctx) {
  const cel = ctx.limity.tluste_ryby_morskie_razy_tydzien_min;
  for (let n = 0; n < 4; n++) {
    if (liczniki(grupy, ctx).ryby >= cel) return;
    let najlepsza = null;
    for (const g of grupy) {
      if (!slotyJedzone(g).length || g.rodzaj === "zamrazarka" || (g.przepis && ctx.w[g.przepis].tagi.includes("tlusta_ryba_morska"))) continue;
      const stara = g.przepis ? ctx.ocena(g.przepis, g) : 0;
      for (const i of kandydaci(g, ctx)) {
        if (ctx.w[i].tagi.includes("tlusta_ryba_morska") && dopuszczalny(grupy, g, i, ctx)) {
          const roznica = (ctx.ocena(i, g) - stara) * slotyJedzone(g).length;
          if (najlepsza === null || roznica < najlepsza[0]) najlepsza = [roznica, g, i];
        }
      }
    }
    if (najlepsza === null) return;
    najlepsza[1].przepis = najlepsza[2];
  }
}

function naprawBudzet(grupy, ctx, pozwolPowtorki = false) {
  const granica = pozwolPowtorki ? ctx.budzetLimit : ctx.budzet;
  const celRyb = ctx.limity.tluste_ryby_morskie_razy_tydzien_min;
  for (let n = 0; n < MAX_KROKOW_NAPRAWY; n++) {
    const koszt = kosztTygodnia(grupy, ctx).jedzenie;
    if (koszt + ctx.rezerwaStala <= granica) return;
    const rybyPrzed = liczniki(grupy, ctx).ryby;
    let najlepsza = null;
    for (const g of grupy) {
      if (!g.przepis || !slotyJedzone(g).length || g.rodzaj === "zamrazarka") continue;
      const stary = g.przepis;
      for (const i of kandydaci(g, ctx)) {
        if (i === stary) continue;
        let kara = (ctx.ocena(i, g) - ctx.w[i].koszt_zl) - (ctx.ocena(stary, g) - ctx.w[stary].koszt_zl);
        if (pozwolPowtorki) {
          const niedawno = ctx.ostatnie[g.posilek];
          kara -= KARA_ZA_POWTORKE * ((niedawno.has(i) ? 1 : 0) - (niedawno.has(stary) ? 1 : 0));
        }
        kara = Math.max(kara, 0);
        if (kara >= KARA_ZA_POWTORKE) continue;
        g.przepis = i;
        if (!naruszenia(grupy, ctx).length && liczniki(grupy, ctx).ryby >= Math.min(rybyPrzed, celRyb)) {
          const wartosc = koszt - kosztTygodnia(grupy, ctx).jedzenie - kara;
          if (wartosc > 0.01 && (najlepsza === null || wartosc > najlepsza[0])) najlepsza = [wartosc, g, i];
        }
        g.przepis = stary;
      }
    }
    if (najlepsza === null) return;
    najlepsza[1].przepis = najlepsza[2];
  }
}

export function sprawdzPozaDomem(poza) {
  if (!Array.isArray(poza) || poza.some((d) => !Number.isInteger(d) || d < 1 || d >= LICZBA_DNI)) {
    throw new Error("Dni poza domem: wybierz dni od wtorku do następnego poniedziałku.");
  }
  return [...new Set(poza)].sort((a, b) => a - b);
}

export function sprawdzPolowki(polowki, poza) {
  if (typeof polowki !== "object" || polowki === null || Array.isArray(polowki)) throw new Error("Pół dnia poza domem: zły format.");
  const wynik = {};
  for (const [k, v] of Object.entries(polowki)) {
    const d = Number(k);
    if (!Number.isInteger(d) || d < 1 || d >= LICZBA_DNI || !POLOWKI.includes(v)) throw new Error("Pół dnia poza domem: wybierz rano albo wieczór, od wtorku do poniedziałku.");
    if (!poza.includes(d)) wynik[d] = v;
  }
  return wynik;
}

export function sprawdzZamrazarke(zamrazarka, ctx) {
  if (typeof zamrazarka !== "object" || zamrazarka === null || Array.isArray(zamrazarka)) throw new Error("Zamrażarka: zły format.");
  const wynik = {};
  for (const [i, ile] of Object.entries(zamrazarka)) {
    if (!(i in ctx.przepisy) || !ctx.przepisy[i].na_zapas) throw new Error("Zamrażarka: nieznane danie.");
    if (!Number.isInteger(ile) || ile < 0 || ile > 20) throw new Error("Zamrażarka: liczba porcji od 0 do 20.");
    if (ile) wynik[i] = ile;
  }
  return wynik;
}

export function generujTydzien(od, trybWeekendu, ctx, { usuniete = [], mamWDomu = [], poniedzialek = null, poza = null, zamrazarka = null, polowki = {} } = {}) {
  if (dzienTygodnia(od) !== 0) throw new Error("Tydzień planu zaczyna się w poniedziałek.");
  const ust = sprawdzUstawienia(poniedzialek);
  if (poza == null) poza = trybWeekendu === "poza_domem" ? [...WEEKEND] : [];
  poza = sprawdzPozaDomem(poza);
  polowki = sprawdzPolowki(polowki ?? {}, poza);
  if (trybWeekendu === "poza_domem") trybWeekendu = "sam";
  zamrazarka = sprawdzZamrazarke(zamrazarka ?? {}, ctx);
  ctx.ustawTryb(trybWeekendu);
  ctx.mamWDomu = new Set(mamWDomu);
  let grupy = szkielet(trybWeekendu, usuniete, ust, poza, zamrazarka, ctx, polowki);
  wybierzPartie(grupy, ctx);
  for (const g of grupy) if (g.rodzaj === "partia" && !g.przepis && slotyJedzone(g).length) wypelnij(grupy, g, ctx);
  for (const rodzaj of ["szybki", "kolacja", "wariant"]) {
    for (const g of grupy) if (g.rodzaj === rodzaj && slotyJedzone(g).length) wypelnij(grupy, g, ctx);
  }
  naprawRyby(grupy, ctx);
  naprawBudzet(grupy, ctx);
  if (kosztTygodnia(grupy, ctx).jedzenie + ctx.rezerwaStala > ctx.budzetLimit) {
    const proba = kopia(grupy);
    naprawBudzet(proba, ctx, true);
    if (kosztTygodnia(proba, ctx).jedzenie + ctx.rezerwaStala <= ctx.budzetLimit) grupy = proba;
  }
  const zZamrazarkiPoprzednich = {};
  for (const g of grupy) if (g.rodzaj === "zamrazarka") zZamrazarkiPoprzednich[g.przepis] = g.sloty.length;
  return {
    wersja: WERSJA_PLANU, od, tryb_weekendu: trybWeekendu, poza_domem: poza, grupy,
    mam_w_domu: [...ctx.mamWDomu].sort(), poniedzialek: ust, z_zamrazarki: zZamrazarkiPoprzednich,
    ...(Object.keys(polowki).length ? { poza_pol: polowki } : {}),
  };
}

export function usunieteMiejsca(plan) {
  return plan.grupy.flatMap((g) => g.usuniete ?? []);
}

// --- Dodatki dnia, koszt, podsumowanie ---

export function posilkiDnia(grupy, d) {
  const wynik = {};
  for (const g of grupy) {
    if (!g.przepis) continue;
    for (const [dz, posilek] of slotyJedzone(g)) if (dz === d) wynik[posilek] = g;
  }
  return wynik;
}

export function udzialDnia(grupy, d) {
  return suma(Object.keys(posilkiDnia(grupy, d)).map((p) => UDZIAL_POSILKU[p]));
}

export function dodatkiDnia(grupy, d, ctx) {
  const posilki = posilkiDnia(grupy, d);
  if (!Object.keys(posilki).length) return [];
  const udzial = udzialDnia(grupy, d);
  const celKcal = ctx.cele.kcal * udzial;
  let kcal = suma(Object.values(posilki).map((g) => wartosciGrupy(g, ctx).kcal));
  const dash = {};
  for (const g of Object.values(posilki)) {
    for (const [gr, ile] of Object.entries(wartosciGrupy(g, ctx).porcje_dash)) dash[gr] = (dash[gr] ?? 0) + ile;
  }
  const minimum = {};
  for (const x of ctx.cele.grupy) if (x.okres === "dzien") minimum[x.id] = x.od * udzial;
  const wynik = [];
  while (wynik.length < MAX_DODATKOW_DZIENNIE && celKcal - kcal > 100) {
    const brak = ["owoce", "nabial", "zboza"].filter((gr) => (dash[gr] ?? 0) < (minimum[gr] ?? 0));
    const kolejnosc = [...brak, "orzechy_straczki", "owoce"];
    let wybrany = null;
    for (const grupaDash of kolejnosc) {
      const wybrane = new Set(wynik.map((y) => y.produkt));
      const opcje = ctx.dodatki.filter((x) => x[0] === grupaDash && !wybrane.has(x[1])
        && (!ctx.produkty[x[1]].sezon || !ctx.produkty[x[1]].sezon.length || ctx.produkty[x[1]].sezon.includes(ctx.miesiac)));
      if (opcje.length) {
        wybrany = opcje[d % opcje.length];
        break;
      }
    }
    if (wybrany === null) break;
    const [, idProduktu, gramy, opis] = wybrany;
    const p = ctx.produkty[idProduktu];
    kcal += p.wartosci[0] * gramy / 100.0;
    if (p.grupa_dash) dash[p.grupa_dash] = (dash[p.grupa_dash] ?? 0) + gramy / p.porcja_dash_g;
    wynik.push({ produkt: idProduktu, nazwa: p.nazwa, gramy, opis, koszt_zl: zaokr(p.cena_zl * gramy / p.opakowanie_g, 2) });
  }
  return wynik;
}

// Gramy do kupienia na produkt (po zamianach) + nazwy dań, które go używają.
export function zapotrzebowanie(grupy, ctx, zamiany = {}) {
  zamiany = zamiany || {};
  const potrzeby = {};
  const dodaj = (idProduktu, gramyJadalne, skad) => {
    idProduktu = zamiany[idProduktu] ?? idProduktu;
    const p = ctx.produkty[idProduktu];
    let gramy = gramyJadalne * 100.0 / (p.jadalne_proc ?? 100);
    if (p.kupowane_jako) {
      const sztuki = gramy / p.sztuka_g;
      idProduktu = p.kupowane_jako;
      gramy = sztuki * ctx.produkty[idProduktu].sztuka_g;
    }
    const wpis = potrzeby[idProduktu] ?? (potrzeby[idProduktu] = { gramy: 0.0, uzyte_w: new Set() });
    wpis.gramy += gramy;
    wpis.uzyte_w.add(skad);
  };
  for (const g of grupy) {
    if (g.rodzaj === "zamrazarka") continue;
    const ile = porcje(g);
    for (const i of przepisyGrupy(g)) {
      const przepis = ctx.przepisy[i];
      for (const [idProduktu, gramy] of przepis.skladniki) dodaj(idProduktu, gramy * ile / przepis.porcje, przepis.nazwa);
    }
  }
  for (let d = 0; d < LICZBA_DNI; d++) for (const x of dodatkiDnia(grupy, d, ctx)) dodaj(x.produkt, x.gramy, "dodatki dnia");
  return potrzeby;
}

// [ilość opisowo, koszt zł, kupione gramy] — luzem na sztuki, mięso i ryby w tackach, reszta w opakowaniach.
export function ileKupic(p, gramy) {
  const ile = (jednostka) => Math.max(1, Math.ceil(gramy / jednostka - TOLERANCJA_OPAKOWANIA));
  if (p.na_wage) {
    const cenaG = p.cena_zl / p.opakowanie_g;
    if (p.tacka_g) {
      const tacki = ile(p.tacka_g);
      const kupione = tacki * p.tacka_g;
      return [`${tacki} opak. (ok. ${kupione} g)`, cenaG * kupione, kupione];
    }
    const sztuki = ile(p.sztuka_g);
    const kupione = sztuki * p.sztuka_g;
    return [`${sztuki} szt. (ok. ${kupione} g)`, cenaG * kupione, kupione];
  }
  if (p.sztuka_g && p.sztuka_g === p.opakowanie_g) {
    const sztuki = ile(p.sztuka_g);
    return [`${sztuki} szt.`, p.cena_zl * sztuki, sztuki * p.sztuka_g];
  }
  const opakowania = ile(p.opakowanie_g);
  let opis = `${opakowania} opak.`;
  if (p.sztuka_g) {
    const wOpakowaniu = zaokr(p.opakowanie_g / p.sztuka_g);
    const potrzeba = Math.ceil(gramy / p.sztuka_g - 1e-9);
    opis = `${opakowania} opak. (${wOpakowaniu} szt.) — potrzeba ${potrzeba} szt.`;
  }
  return [opis, p.cena_zl * opakowania, opakowania * p.opakowanie_g];
}

export function kosztTygodnia(grupy, ctx, mamWDomu = null) {
  mamWDomu = mamWDomu ?? ctx.mamWDomu;
  let swieze = 0.0;
  let zapasy = 0.0;
  for (const [idProduktu, wpis] of Object.entries(zapotrzebowanie(grupy, ctx))) {
    const p = ctx.produkty[idProduktu];
    if (p.typ === "swieze" && mamWDomu.has(idProduktu)) continue;
    if (p.typ === "swieze") swieze += ileKupic(p, wpis.gramy)[1];
    else if (p.typ === "zapasowe") zapasy += p.cena_zl * wpis.gramy / p.opakowanie_g;
  }
  let dodatki = 0;
  for (let d = 0; d < LICZBA_DNI; d++) for (const x of dodatkiDnia(grupy, d, ctx)) dodatki += x.koszt_zl;
  return { jedzenie: zaokr(swieze + zapasy, 2), swieze: zaokr(swieze, 2), zapasy: zaokr(zapasy, 2), dodatki: zaokr(dodatki, 2) };
}

function sumaWartosci(lista) {
  const s = {};
  for (const wartosci of lista) for (const [k, v] of Object.entries(wartosci)) if (typeof v === "number") s[k] = (s[k] ?? 0) + v;
  return s;
}

function wartosciDodatku(x, ctx) {
  const p = ctx.produkty[x.produkt];
  return Object.fromEntries(SKLADNIKI.map((k, i) => [k, p.wartosci[i] * x.gramy / 100.0]));
}

function opisMiejsc(sloty) {
  const nazwy = { obiad: "obiad", kolacja: "kolacja", sniadanie: "śniadanie", przekaska: "przekąska" };
  return sloty.map(([d, p]) => `${d === 7 ? "następny poniedziałek" : NAZWY_DNI[d].toLowerCase()} — ${nazwy[p]}`).join(", ");
}

export function podsumuj(plan, ctx) {
  const grupy = plan.grupy;
  ctx.ustawTryb(plan.tryb_weekendu, grupy);
  ctx.mamWDomu = new Set(plan.mam_w_domu ?? []);
  const ust = ustawienia(plan);
  const wDomu = new Set(dniWDomu(plan.tryb_weekendu, pozaDomem(plan)));
  const polowki = polowkiPlanu(plan);
  const dni = [];
  for (let d = 0; d < LICZBA_DNI; d++) {
    const posilki = posilkiDnia(grupy, d);
    const dodatki = dodatkiDnia(grupy, d, ctx);
    const s = sumaWartosci([...Object.values(posilki).map((g) => wartosciGrupy(g, ctx)), ...dodatki.map((x) => wartosciDodatku(x, ctx))]);
    const dash = {};
    for (const g of Object.values(posilki)) for (const [k, v] of Object.entries(wartosciGrupy(g, ctx).porcje_dash)) dash[k] = (dash[k] ?? 0) + v;
    for (const x of dodatki) {
      const p = ctx.produkty[x.produkt];
      if (p.grupa_dash) dash[p.grupa_dash] = (dash[p.grupa_dash] ?? 0) + x.gramy / p.porcja_dash_g;
    }
    const miejsca = [];
    for (const posilek of POSILKI_DNIA) {
      if (!posilkiWDniu(d, ust).includes(posilek)) {
        miejsca.push({ posilek, stan: d === 0 ? "poprzedni_plan" : "nastepny_plan" });
        continue;
      }
      if (!wDomu.has(d) || pozaPosilek(polowki, d, posilek)) {
        miejsca.push({ posilek, stan: "poza_domem" });
        continue;
      }
      const pasujace = grupy.filter((g) => zawiera(g.sloty, [d, posilek]));
      const grupa = pasujace.find((g) => zawiera(slotyJedzone(g), [d, posilek])) ?? pasujace[0] ?? null;
      if (grupa === null || zawiera(grupa.usuniete ?? [], [d, posilek]) || !grupa.przepis) {
        miejsca.push({ posilek, stan: "usuniety" });
        continue;
      }
      const i = grupa.przepis;
      const w = wartosciGrupy(grupa, ctx);
      miejsca.push({
        posilek, stan: "zaplanowany", grupa: grupa.id, przepis: i, nazwa: ctx.przepisy[i].nazwa,
        kcal: zaokr(w.kcal), koszt_zl: zaokr(w.koszt_zl, 2),
        czas_min: ctx.przepisy[i].czas_min, czas_aktywny_min: ctx.aktywny(i), na_zimno: ctx.przepisy[i].na_zimno,
        z_poniedzialku: ["partia", "zamrazarka"].includes(grupa.rodzaj), wiele_miejsc: grupa.sloty.length > 1,
        z_zamrazarki: zZamrazarki(grupa, d, ctx), rodzaj: grupa.rodzaj,
        okazja: grupa.okazja ?? null, osoby: osobyWDniu(grupa, d),
        deser: (grupa.dodatkowe ?? []).map((x) => ({ przepis: x, nazwa: ctx.przepisy[x].nazwa })),
      });
    }
    dni.push({
      indeks: d, nazwa: NAZWY_DNI[d], data: dodajDni(plan.od, d), poza_domem: !wDomu.has(d), ...(polowki[d] ? { poza_pol: polowki[d] } : {}),
      osoby: osoby(d, plan.tryb_weekendu), miejsca, dodatki,
      cel_kcal: zaokr(ctx.cele.kcal * udzialDnia(grupy, d)),
      suma: Object.fromEntries(Object.entries(s).filter(([k]) => k !== "koszt_zl" && k !== "jaja_cale").map(([k, v]) => [k, zaokr(v, 1)])),
      porcje_dash: Object.fromEntries(Object.entries(dash).map(([k, v]) => [k, zaokr(v, 1)])),
    });
  }

  const licz = liczniki(grupy, ctx);
  const koszt = kosztTygodnia(grupy, ctx);
  const ostrzezenia = [...naruszenia(grupy, ctx)];
  for (const g of grupy) {
    const jedzone = slotyJedzone(g);
    if (!g.przepis && jedzone.length) ostrzezenia.push(`Brak pasującego przepisu: ${opisMiejsc(jedzone)}.`);
    else if (g.przepis && ctx.ostatnie[g.posilek] && ctx.ostatnie[g.posilek].has(g.przepis) && jedzone.length && g.rodzaj !== "okazja") {
      ostrzezenia.push(`Powtórka: „${ctx.przepisy[g.przepis].nazwa}” było w planie w ostatnich ${OKNA_ROTACJI[g.posilek]} tyg. (zabrakło innych pasujących przepisów — warto dodać nowe).`);
    }
  }
  if (licz.ryby < ctx.limity.tluste_ryby_morskie_razy_tydzien_min) {
    ostrzezenia.push(`Tłuste ryby tylko ${licz.ryby}× (cel: ${ctx.limity.tluste_ryby_morskie_razy_tydzien_min}×).`);
  }
  const razem = koszt.jedzenie + ctx.rezerwaStala;
  if (razem > ctx.budzetLimit) ostrzezenia.push(`Plan kosztuje ok. ${zaokr(razem)} zł — ponad budżet z tolerancją (${zaokr(ctx.budzetLimit)} zł).`);
  else if (razem > ctx.budzet) ostrzezenia.push(`Plan kosztuje ok. ${zaokr(razem)} zł — w tolerancji, ale ponad budżet ${zaokr(ctx.budzet)} zł.`);
  for (const dzien of dni) {
    if (dzien.poza_domem || !dzien.cel_kcal) continue;
    const kcal = dzien.suma.kcal ?? 0;
    if (Math.abs(kcal - dzien.cel_kcal) > ctx.cele.kcal * TOLERANCJA_KCAL) {
      ostrzezenia.push(`${dzien.nazwa} ${dzien.data.slice(8)}.${dzien.data.slice(5, 7)}: ${zaokr(kcal)} kcal z planu (cel ${dzien.cel_kcal}).`);
    }
  }
  const udzialy = suma([...Array(LICZBA_DNI).keys()].map((d) => udzialDnia(grupy, d)));
  const srednio = (klucz) => (udzialy ? suma(dni.map((x) => x.suma[klucz] ?? 0)) / udzialy : 0);
  const cholesterol = srednio("cholesterol_mg");
  if (cholesterol > ctx.limity.cholesterol_mg_dzien_max) {
    ostrzezenia.push(`Cholesterol średnio ${zaokr(cholesterol)} mg/dzień (limit ${ctx.limity.cholesterol_mg_dzien_max}).`);
  }

  const partie = posortuj(grupy.filter((g) => g.rodzaj === "partia" && g.przepis && slotyJedzone(g).length), (g) => -ctx.przepisy[g.przepis].czas_min);
  const aktywnie = suma(partie.map((g) => ctx.aktywny(g.przepis)));
  return {
    od: plan.od,
    tryb_weekendu: plan.tryb_weekendu,
    poza_domem: pozaDomem(plan),
    poniedzialek: ust,
    dni,
    gotowanie_poniedzialek: {
      dania: partie.map((g) => ({
        przepis: g.przepis, nazwa: ctx.przepisy[g.przepis].nazwa, grupa: g.id,
        czas_min: ctx.przepisy[g.przepis].czas_min, czas_aktywny_min: ctx.aktywny(g.przepis),
        porcje: porcje(g), na: opisMiejsc(slotyJedzone(g)),
        do_zamrazarki: porcje(g, slotyJedzone(g).filter((s) => zZamrazarki(g, s[0], ctx))),
        dzien_gotowania: dzienGotowania(g), trwalosc_dni: ctx.przepisy[g.przepis].trwalosc_dni,
      })),
      czas_min: Math.max(aktywnie, ...partie.map((g) => ctx.przepisy[g.przepis].czas_min)),
      czas_aktywny_min: aktywnie,
    },
    z_zamrazarki: grupy.filter((g) => g.rodzaj === "zamrazarka" && slotyJedzone(g).length).map((g) => ({
      przepis: g.przepis, nazwa: ctx.przepisy[g.przepis].nazwa, porcje: porcje(g), na: opisMiejsc(slotyJedzone(g)),
    })),
    tydzien: {
      koszt_jedzenia_zl: koszt.jedzenie,
      koszt_dodatkow_zl: koszt.dodatki,
      raty_zapasow_zl: ctx.rezerwaStala,
      razem_zl: zaokr(razem, 2),
      budzet_zl: ctx.budzet,
      budzet_gosc_zl: ctx.budzetGosc,
      budzet_okazje_zl: ctx.budzetOkazje,
      budzet_limit_zl: zaokr(ctx.budzetLimit, 2),
      tluste_ryby: licz.ryby,
      czerwone_mieso: licz.czerwone,
      jaja_cale: zaokr(licz.jaja, 1),
      cholesterol_srednio_mg: zaokr(cholesterol),
      kcal_srednio: zaokr(srednio("kcal")),
      sod_srednio_mg: zaokr(srednio("sod_mg")),
      usuniete: usunieteMiejsca(plan).length,
      zamrazarka_pudelka: zamrozone(grupy, ctx),
      zamrazarka_pojemnosc: ctx.pojemnosc,
    },
    cele: { kcal: ctx.cele.kcal, sod_mg_max: ctx.cele.sod_mg_max },
    mam_w_domu: [...ctx.mamWDomu].sort(),
    ostrzezenia,
  };
}

// --- Ręczna podmiana („Zamień”) ---

function grupaPlanu(plan, idGrupy) {
  const grupa = plan.grupy.find((g) => g.id === idGrupy);
  if (!grupa) throw new Error("Nie ma takiego posiłku w planie.");
  return grupa;
}

export function opcjePodmiany(plan, idGrupy, ctx) {
  const grupy = plan.grupy;
  const grupa = grupaPlanu(plan, idGrupy);
  if (grupa.rodzaj === "zamrazarka") return [];
  const wPlanie = new Set(grupy.filter((g) => slotyJedzone(g).length).map((g) => g.przepis));
  const wynik = [];
  for (const i of posortuj(kandydaci(grupa, ctx), (i) => ctx.ocena(i, grupa))) {
    if (wPlanie.has(i)) continue;
    const stary = grupa.przepis;
    grupa.przepis = i;
    const problemy = naruszenia(grupy, ctx);
    grupa.przepis = stary;
    wynik.push({
      przepis: i, nazwa: ctx.przepisy[i].nazwa, kcal: zaokr(ctx.w[i].kcal), koszt_zl: ctx.w[i].koszt_zl,
      czas_min: ctx.przepisy[i].czas_min, niedawno: Boolean(ctx.ostatnie[grupa.posilek] && ctx.ostatnie[grupa.posilek].has(i)), problemy,
    });
  }
  return posortuj(wynik, (o) => [o.problemy.length > 0, o.niedawno]);
}

export function podmien(plan, idGrupy, idPrzepisu, ctx) {
  const nowy = kopia(plan);
  const grupa = grupaPlanu(nowy, idGrupy);
  if (grupa.rodzaj === "zamrazarka" || !(idPrzepisu in ctx.przepisy) || !pasuje(idPrzepisu, grupa, ctx)) {
    throw new Error("Ten przepis nie pasuje do tego posiłku.");
  }
  grupa.przepis = idPrzepisu;
  return nowy;
}

export { porownaj };
