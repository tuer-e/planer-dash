// Lista zakupów i zapasy: z planu tygodnia do listy w sklepie (reguły jak w planer/zakupy.py).
import { DZIALY } from "./katalog.js";
import { ileKupic, zapotrzebowanie as zapotrzebowanieGrup } from "./generator.js";
import { posortuj, zaokr } from "./pomocnicze.js";

export function zapotrzebowanie(plan, ctx, zamiany = {}) {
  return zapotrzebowanieGrup(plan.grupy, ctx, zamiany);
}

// Produkty z tej samej grupy zamienników (najpierw w sezonie, potem najtańsze).
export function zamienniki(idProduktu, ctx) {
  const grupa = ctx.produkty[idProduktu].grupa_zamiennikow;
  if (!grupa) return [];
  const wynik = Object.values(ctx.produkty).filter((q) => q.grupa_zamiennikow === grupa && q.id !== idProduktu && q.klasa !== "niewskazane");
  return posortuj(wynik, (q) => [Boolean(q.sezon && q.sezon.length) && !q.sezon.includes(ctx.miesiac), q.cena_zl / q.opakowanie_g])
    .map((q) => ({ id: q.id, nazwa: q.nazwa, cena_zl: q.cena_zl }));
}

const posortowane = (zbior) => [...zbior].sort();

export function listaZakupow(plan, ctx, zapasy = {}) {
  zapasy = zapasy || {};
  const zamiany = plan.zamiany_produktow ?? {};
  const potrzeby = zapotrzebowanie(plan, ctx, zamiany);
  const zamienioneZ = Object.fromEntries(Object.entries(zamiany).map(([k, v]) => [v, k]));
  const mamWDomu = new Set(plan.mam_w_domu ?? []);
  const pozycje = [];
  const wDomu = [];
  const przeglad = [];
  let kosztSklep = 0.0;
  let kosztSwiezych = 0.0;
  let zuzycieZapasow = 0.0;

  for (const [id, wpis] of Object.entries(potrzeby)) {
    const p = ctx.produkty[id];
    if (p.typ === "stale") continue;
    if (p.typ === "zapasowe") {
      zuzycieZapasow += p.cena_zl * wpis.gramy / p.opakowanie_g;
      const stan = zapasy[id]?.stan ?? "nie_wiem";
      przeglad.push({ id, nazwa: p.nazwa, stan, potrzebny: true, sprawdzony: id in zapasy, uzyte_w: posortowane(wpis.uzyte_w) });
      if (stan === "jest") continue;
    }
    const [opis, koszt] = ileKupic(p, wpis.gramy);
    if (p.typ === "swieze" && mamWDomu.has(id)) {
      wDomu.push({ id, nazwa: p.nazwa, ilosc: opis, uzyte_w: posortowane(wpis.uzyte_w) });
      continue;
    }
    kosztSklep += koszt;
    if (p.typ === "swieze") kosztSwiezych += koszt;
    pozycje.push({
      id, nazwa: p.nazwa, dzial: p.dzial, ilosc: opis, koszt_zl: zaokr(koszt, 2), typ: p.typ, potrzeba_g: zaokr(wpis.gramy),
      uzyte_w: posortowane(wpis.uzyte_w), zamienniki: zamienniki(id, ctx),
      zamiast: id in zamienioneZ ? ctx.produkty[zamienioneZ[id]].nazwa : null,
      szacunek: p.cena_zrodlo === "szacunek",
      do_sprawdzenia: p.typ === "zapasowe" && !(id in zapasy),
    });
  }

  for (const [id] of Object.entries(ctx.ratyZapasow)) {
    const p = ctx.produkty[id];
    const stan = zapasy[id]?.stan ?? "jest";
    przeglad.push({ id, nazwa: p.nazwa, stan, potrzebny: false, sprawdzony: id in zapasy, uzyte_w: [] });
    if (stan === "konczy_sie") {
      kosztSklep += p.cena_zl;
      pozycje.push({
        id, nazwa: p.nazwa, dzial: p.dzial, ilosc: "1 opak.", koszt_zl: p.cena_zl, typ: p.typ, potrzeba_g: 0, uzyte_w: [],
        zamienniki: [], zamiast: null, szacunek: p.cena_zrodlo === "szacunek",
      });
    }
  }

  const kolejnosc = Object.keys(DZIALY);
  const pozycjePosortowane = posortuj(pozycje, (x) => [kolejnosc.indexOf(x.dzial), x.nazwa]);
  const przegladPosortowany = posortuj(przeglad, (x) => [!x.potrzebny, x.stan !== "konczy_sie", x.nazwa]);
  const dzialy = Object.entries(DZIALY)
    .filter(([d]) => pozycjePosortowane.some((x) => x.dzial === d))
    .map(([d, nazwa]) => ({ id: d, nazwa, pozycje: pozycjePosortowane.filter((x) => x.dzial === d) }));
  const rataRazem = Object.values(ctx.ratyZapasow).reduce((a, b) => a + b, 0);
  const kosztBudzet = kosztSwiezych + zuzycieZapasow + rataRazem;
  ctx.ustawTryb(plan.tryb_weekendu, plan.grupy);
  return {
    od: plan.od,
    dzialy,
    przeglad_zapasow: przegladPosortowany,
    mam_w_domu: posortuj(wDomu, (x) => x.nazwa),
    tekst_przypomnienia: tekstDoPrzypomnien(pozycjePosortowane),
    koszt: {
      w_sklepie_zl: zaokr(kosztSklep, 2),
      swieze_zl: zaokr(kosztSwiezych, 2),
      zuzycie_zapasow_zl: zaokr(zuzycieZapasow, 2),
      raty_zapasow_zl: zaokr(rataRazem, 2),
      w_budzecie_zl: zaokr(kosztBudzet, 2),
      budzet_zl: ctx.budzet,
      budzet_limit_zl: zaokr(ctx.budzetLimit, 2),
    },
    zakupy_zrobione: plan.zakupy_zrobione ?? null,
  };
}

export function tekstPozycji(x) {
  return `${x.nazwa} — ${x.ilosc}${x.do_sprawdzenia ? " (sprawdź, czy masz)" : ""}`;
}

// Jedna pozycja w linii — po wklejeniu do Przypomnień każda linia staje się osobnym punktem.
export function tekstDoPrzypomnien(pozycje) {
  return pozycje.map(tekstPozycji).join("\n");
}
