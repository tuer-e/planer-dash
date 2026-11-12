// Cele dzienne: kalorie, makroskładniki i porcje DASH wyliczane z profilu (wzór Mifflina-St Jeora).
import { porownaj, posortuj, zaokr } from "./pomocnicze.js";

export const AKTYWNOSC = { siedzaca: 1.2, lekka: 1.375, umiarkowana: 1.55, wysoka: 1.725 };
// Poniżej tych wartości nie schodzimy bez nadzoru specjalisty.
const MINIMUM_KCAL = { M: 1500, K: 1200 };
const KCAL_NA_GRAM = { bialko: 4, tluszcz: 9, weglowodany: 4 };

export function podstawowaPrzemiana(profil) {
  const bmr = 10 * profil.waga_kg + 6.25 * profil.wzrost_cm - 5 * profil.wiek;
  return bmr + (profil.plec === "M" ? 5 : -161);
}

export function zapotrzebowanie(profil) {
  return podstawowaPrzemiana(profil) * AKTYWNOSC[profil.aktywnosc];
}

export function celKcal(profil) {
  if (profil.kcal_reczne) return Math.trunc(profil.kcal_reczne);
  const deficyt = profil.waga_kg > profil.waga_docelowa_kg ? (profil.deficyt_kcal ?? 0) : 0;
  const surowy = zapotrzebowanie(profil) - deficyt;
  return Math.max(zaokr(surowy / 50.0) * 50, MINIMUM_KCAL[profil.plec]);
}

export function poziomDash(kcal, reguly) {
  const poziomy = posortuj(reguly.poziomy_kaloryczne, (p) => p.kcal);
  let najlepszy = poziomy[0];
  for (const p of poziomy) {
    if (porownaj([Math.abs(p.kcal - kcal), p.kcal], [Math.abs(najlepszy.kcal - kcal), najlepszy.kcal]) < 0) najlepszy = p;
  }
  return najlepszy;
}

export function celeDzienne(profil, reguly) {
  const kcal = celKcal(profil);
  const limity = reguly.limity;
  const poziom = poziomDash(kcal, reguly);
  const gramy = (skladnik, procent) => zaokr(kcal * procent / 100.0 / KCAL_NA_GRAM[skladnik]);
  const grupy = reguly.grupy.map((grupa) => {
    const [od, do_] = poziom.porcje[grupa.id];
    return { id: grupa.id, nazwa: grupa.nazwa, porcja: grupa.porcja, okres: grupa.okres, od, do: do_ };
  });
  return {
    zapotrzebowanie_kcal: zaokr(zapotrzebowanie(profil)),
    kcal,
    poziom_dash_kcal: poziom.kcal,
    sod_mg_max: Math.trunc(profil.limit_sodu_mg || limity.sod_mg_dzien_domyslny),
    bialko_g: gramy("bialko", limity.bialko_proc_kcal),
    tluszcz_g_max: gramy("tluszcz", limity.tluszcz_proc_kcal_max),
    tluszcz_nasycony_g_max: gramy("tluszcz", limity.tluszcz_nasycony_proc_kcal_max),
    weglowodany_g: gramy("weglowodany", limity.weglowodany_proc_kcal),
    blonnik_g_min: limity.blonnik_g_dzien_min,
    cholesterol_mg_max: limity.cholesterol_mg_dzien_max,
    grupy,
  };
}

// Szacunek: 1 kg tkanki tłuszczowej ≈ 7700 kcal. null, gdy nie ma deficytu.
export function tygodnieDoCelu(profil, kcal) {
  const roznicaKg = profil.waga_kg - profil.waga_docelowa_kg;
  const deficytDzienny = zapotrzebowanie(profil) - kcal;
  if (roznicaKg <= 0 || deficytDzienny <= 0) return null;
  return zaokr(roznicaKg * 7700 / (deficytDzienny * 7));
}
