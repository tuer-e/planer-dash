// Zakupy z wyprzedzeniem: wybierasz dzień i godzinę zakupów (od piątku do poniedziałku gotowania).
// Lista dzieli się na „Kup w sobotę” (wszystko, co wytrzyma do dnia, w którym tego używasz) i „Dokup w poniedziałek”
// (świeże, które by nie wytrzymały, a kupione w dniu gotowania wytrzymają). Zakupy w poniedziałek = jedna lista, jak dawniej.
import { dodatkiDnia, dzienGotowania, LICZBA_DNI, przepisyGrupy, slotyJedzone, trwaloscProduktu } from "../silnik/generator.js";
import { dodaj, dzienKrotko, nazwaDnia } from "./narzedzia.js";
import { godziny } from "./kalendarz.js";

export const DNI_ZAKUPOW = [-3, -2, -1, 0]; // od piątku przed tygodniem do poniedziałku gotowania
export const GODZINY_ZAKUPOW = ["10:00", "13:00", "16:30", "19:00"];
const W_DZIEN = { "poniedziałek": "w poniedziałek", wtorek: "we wtorek", "środa": "w środę", czwartek: "w czwartek", "piątek": "w piątek", sobota: "w sobotę", niedziela: "w niedzielę" };

// { dzien: -2 (dni od poniedziałku planu), godzina: "13:00" } — zapamiętane przy tygodniu, domyślnie poniedziałek.
export function kiedyZakupy(plan, profil) {
  const z = plan?.zakupy ?? {};
  return {
    dzien: DNI_ZAKUPOW.includes(z.dzien) ? z.dzien : 0,
    godzina: /^([01]\d|2[0-3]):[0-5]\d$/.test(z.godzina ?? "") ? z.godzina : godziny(profil).zakupy,
  };
}

export function wDzien(iso) {
  return W_DZIEN[nazwaDnia(iso)];
}

const KROTKO = { pn: "pon", wt: "wt", "śr": "śr", cz: "czw", pt: "pt", sb: "sob", nd: "nd" };
export function dzienSkrot(iso) {
  return KROTKO[dzienKrotko(iso)] ?? dzienKrotko(iso);
}

// „sob 14.11, 13:00”
export function opisKiedy(od, kiedy) {
  const iso = dodaj(od, kiedy.dzien);
  const [, m, d] = iso.split("-");
  return `${dzienSkrot(iso)} ${Number(d)}.${m}, ${kiedy.godzina}`;
}

// Kiedy pierwszy raz używasz produktu (dzień planu): danie z gotowania — w dniu gotowania, reszta — w pierwszym dniu, kiedy ją jesz.
export function pierwszeUzycie(plan, ctx) {
  const wynik = {};
  const zamiany = plan.zamiany_produktow ?? {};
  const zapisz = (id0, dzien) => {
    let id = zamiany[id0] ?? id0;
    const p = ctx.produkty[id];
    if (!p) return;
    if (p.kupowane_jako) id = p.kupowane_jako;
    if (!(id in wynik) || dzien < wynik[id]) wynik[id] = dzien;
  };
  for (const g of plan.grupy) {
    if (!g.przepis || g.rodzaj === "zamrazarka") continue;
    const dni = slotyJedzone(g).map(([d]) => d);
    const dzien = g.rodzaj === "partia" ? dzienGotowania(g) : g.rodzaj === "dopisane" ? 0 : dni.length ? Math.min(...dni) : 0;
    for (const i of przepisyGrupy(g)) for (const [id] of ctx.przepisy[i]?.skladniki ?? []) zapisz(id, dzien);
  }
  for (let d = 0; d < LICZBA_DNI; d++) for (const x of dodatkiDnia(plan.grupy, d, ctx)) zapisz(x.produkt, d);
  return wynik;
}

// Podział pozycji listy zakupów: { teraz: [...], dokup: [...] }.
export function podzielListe(pozycje, plan, ctx, kiedy) {
  if (kiedy.dzien >= 0) return { teraz: pozycje, dokup: [] };
  const uzycie = pierwszeUzycie(plan, ctx);
  const teraz = [];
  const dokup = [];
  for (const x of pozycje) {
    const p = ctx.produkty[x.id];
    const trw = p ? trwaloscProduktu(p) : 365;
    const u = uzycie[x.id] ?? 0;
    const wytrzyma = u - kiedy.dzien <= trw - 1;
    const wDniuGotowania = u <= trw - 1;
    (wytrzyma || !wDniuGotowania ? teraz : dokup).push(x);
  }
  return { teraz, dokup };
}
