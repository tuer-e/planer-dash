// Kalendarz i Przypomnienia przez aplikację Skróty: planer przygotowuje wydarzenia tygodnia i listę zakupów,
// a skrót „Planer DASH” na iPhonie wpisuje je do kalendarza „Posiłki DASH” i listy „Zakupy DASH”.
// Zasady jak w planerze na Macu (te same nazwy i ten sam znacznik tygodnia, więc nic się nie dubluje):
//  1. Poniedziałek: „Zakupy na tydzień” i „Gotowanie na tydzień” (dania, porcje, co do lodówki, co do zamrażarki).
//  2. Wieczorem dzień wcześniej „Na jutro” — tylko gdy jest coś do zrobienia (przełożyć z zamrażarki, przygotować na noc).
//  3. Menu na okazję: gotowanie przed posiłkiem.
//  4. Pełnych przepisów w Kalendarzu nie ma: są w planerze, link w opisie otwiera tryb gotowania.
import { dodaj } from "./narzedzia.js";
import { dzienGotowania, porcje, posilkiDnia, POSILKI_DNIA, slotyJedzone, zZamrazarki } from "../silnik/generator.js";

export const NAZWA_KALENDARZA = "Posiłki DASH";
export const NAZWA_LISTY = "Zakupy DASH";
export const NAZWA_SKROTU = "Planer DASH";
export const DOMYSLNE_GODZINY = {
  sniadanie: "07:30", przekaska: "11:00", obiad: "14:00", kolacja: "19:00",
  przygotowania: "21:00", gotowanie_wieczorem: "18:00", gotowanie_rano: "10:00", zakupy: "16:30",
};
const NAZWY = { sniadanie: "Śniadanie", przekaska: "Przekąska", obiad: "Obiad", kolacja: "Kolacja" };
const DNI_KROTKO = ["pon.", "wt.", "śr.", "czw.", "pt.", "sob.", "nd.", "nast. pon."];
const CZAS_ZAKUPOW_MIN = 45;
const CZAS_PRZYGOTOWAN_MIN = 15;

export function znacznik(od) {
  return `[planer-dash ${od}]`;
}

const poprawna = (g) => typeof g === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(g);

export function godziny(profil) {
  const g = { ...DOMYSLNE_GODZINY };
  for (const [k, v] of Object.entries(profil?.godziny ?? {})) if (k in g && poprawna(v)) g[k] = v;
  return g;
}

// Czas lokalny jako tekst „2026-11-16T18:00” — tak skrót odczytuje datę.
function czas(od, dzien, godzina, plusMin = 0) {
  const [h, m] = godzina.split(":").map(Number);
  const d = new Date(`${dodaj(od, dzien)}T00:00:00`);
  d.setHours(h, m + plusMin, 0, 0);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const minutyCzasu = (t) => {
  const [data, g] = t.split("T");
  return new Date(`${data}T00:00:00`).getTime() / 60000 + Number(g.slice(0, 2)) * 60 + Number(g.slice(3));
};

function porcjeTxt(n) {
  return `${n} porcj${n === 1 ? "a" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "e" : "i"}`;
}

function dni(sloty) {
  return [...new Set(sloty.map(([d]) => d))].sort((a, b) => a - b).map((d) => DNI_KROTKO[d]).join(", ");
}

function menuDnia(grupy, d, ctx) {
  return Object.entries(posilkiDnia(grupy, d))
    .sort((a, b) => POSILKI_DNIA.indexOf(a[0]) - POSILKI_DNIA.indexOf(b[0]))
    .map(([posilek, g]) => `• ${NAZWY[posilek]}: ${ctx.przepisy[g.przepis].nazwa}`);
}

// Po gotowaniu: które porcje do lodówki, które do zamrażarki.
function pudelka(plan, ctx, dzien) {
  const lod = [];
  const zam = [];
  for (const g of plan.grupy) {
    if (g.rodzaj !== "partia" || !g.przepis || dzienGotowania(g) !== dzien) continue;
    const sloty = slotyJedzone(g).filter(([d]) => d > dzien);
    const doZam = sloty.filter(([d]) => zZamrazarki(g, d, ctx));
    const doLod = sloty.filter((s) => !doZam.includes(s));
    const nazwa = ctx.przepisy[g.przepis].nazwa;
    if (doLod.length) lod.push(`• ${nazwa} — ${porcje(g, doLod)} (na ${dni(doLod)})`);
    if (doZam.length) zam.push(`• ${nazwa} — ${porcje(g, doZam)} (na ${dni(doZam)})`);
  }
  return [
    ...(zam.length ? ["Do zamrażarki (podpisz dzień na pudełku):", ...zam, ""] : []),
    ...(lod.length ? ["Do lodówki:", ...lod, ""] : []),
  ];
}

function gotowanie(plan, ctx, g, od, dzien, adres) {
  const partie = plan.grupy.filter((x) => x.rodzaj === "partia" && x.przepis && slotyJedzone(x).length && dzienGotowania(x) === dzien)
    .sort((a, b) => ctx.przepisy[b.przepis].czas_min - ctx.przepisy[a.przepis].czas_min);
  if (!partie.length) return null;
  const rano = dzien === 0 && plan.poniedzialek?.gotowanie === "rano";
  const start = czas(od, dzien, g[rano ? "gotowanie_rano" : "gotowanie_wieczorem"]);
  const aktywnie = partie.reduce((s, x) => s + ctx.aktywny(x.przepis), 0);
  const trwa = Math.max(aktywnie, ...partie.map((x) => ctx.przepisy[x.przepis].czas_min)) + 15;
  const linie = [`Zacznij od „${ctx.przepisy[partie[0].przepis].nazwa}” (najdłużej się robi).`, ""];
  for (const x of partie) linie.push(`■ ${ctx.przepisy[x.przepis].nazwa} — ${porcjeTxt(porcje(x))} (na: ${dni(slotyJedzone(x))})`);
  linie.push("", ...pudelka(plan, ctx, dzien));
  if (adres) linie.push(`Krok po kroku w planerze: ${adres}#gotowanie`);
  return {
    tytul: dzien === 0 ? "Gotowanie na tydzień" : `Gotowanie: ${partie.map((x) => ctx.przepisy[x.przepis].nazwa.split(" z ")[0]).join(", ")}`,
    start, koniec: czas(od, dzien, g[rano ? "gotowanie_rano" : "gotowanie_wieczorem"], trwa), notatka: linie.join("\n").trim(),
  };
}

// Wydarzenia tygodnia: [{tytul, start, koniec, notatka}], posortowane od najwcześniejszego.
// `zakupy`: {pozycje, koszt_zl} do opisu zakupów; `adres`: adres planera (link do trybu gotowania).
export function wydarzeniaTygodnia(plan, ctx, profil, { zakupy = null, adres = "" } = {}) {
  const g = godziny(profil);
  const od = plan.od;
  const grupy = plan.grupy;
  const wynik = [];

  const got = gotowanie(plan, ctx, g, od, 0, adres);
  let startZakupow = czas(od, 0, g.zakupy);
  if (got && minutyCzasu(startZakupow) >= minutyCzasu(got.start)) startZakupow = czas(od, 0, g[plan.poniedzialek?.gotowanie === "rano" ? "gotowanie_rano" : "gotowanie_wieczorem"], -(CZAS_ZAKUPOW_MIN + 15));
  const [hz, mz] = startZakupow.slice(11).split(":");
  wynik.push({
    tytul: "Zakupy na tydzień", start: startZakupow, koniec: czas(od, 0, `${hz}:${mz}`, CZAS_ZAKUPOW_MIN),
    notatka: [`Lista: Przypomnienia → „${NAZWA_LISTY}”.`, zakupy ? `${zakupy.pozycje} pozycji, ok. ${Math.round(zakupy.koszt_zl)} zł.` : ""].filter(Boolean).join("\n"),
  });
  if (got) wynik.push(got);
  for (let d = 1; d < 7; d++) {
    const inne = gotowanie(plan, ctx, g, od, d, adres);
    if (inne) wynik.push(inne);
  }

  for (let d = 1; d < 8; d++) {
    const zadania = [];
    for (const [posilek, gr] of Object.entries(posilkiDnia(grupy, d)).sort((a, b) => POSILKI_DNIA.indexOf(a[0]) - POSILKI_DNIA.indexOf(b[0]))) {
      const p = ctx.przepisy[gr.przepis];
      if (zZamrazarki(gr, d, ctx)) zadania.push(`• Przełóż z zamrażarki do lodówki: ${p.nazwa} (${NAZWY[posilek].toLowerCase()}).`);
      else if (p.przygotuj_wieczorem && !["partia", "zamrazarka"].includes(gr.rodzaj)) zadania.push(`• ${NAZWY[posilek]}: ${p.przygotuj_wieczorem}`);
    }
    if (!zadania.length) continue;
    wynik.push({
      tytul: "Na jutro", start: czas(od, d - 1, g.przygotowania), koniec: czas(od, d - 1, g.przygotowania, CZAS_PRZYGOTOWAN_MIN),
      notatka: [...zadania, "", "Jutro jesz:", ...menuDnia(grupy, d, ctx)].join("\n"),
    });
  }

  for (const gr of grupy) {
    if (gr.rodzaj !== "okazja" || !gr.przepis || !slotyJedzone(gr).length) continue;
    const [d, posilek] = slotyJedzone(gr)[0];
    const p = ctx.przepisy[gr.przepis];
    wynik.push({
      tytul: `Gotowanie: ${p.nazwa}`, start: czas(od, d, g[posilek], -p.czas_min), koniec: czas(od, d, g[posilek]),
      notatka: [`${gr.okazja === "randka" ? "Randka" : "Obiad rodzinny"} — ${porcje(gr)} os., do stołu o ${g[posilek]}.`,
        adres ? `Przepis w planerze: ${adres}#przepis/${encodeURIComponent(gr.przepis)}/${porcje(gr)}` : ""].filter(Boolean).join("\n"),
    });
  }
  return wynik.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

// Paczka dla skrótu: wydarzenia (opis kończy się znacznikiem tygodnia — po nim skrót znajduje i usuwa stare)
// i lista zakupów, jedna pozycja na element.
export function paczkaDlaSkrotu(plan, ctx, profil, { zakupy, pozycje, adres }) {
  const zn = znacznik(plan.od);
  return {
    v: 1,
    tydzien: plan.od,
    znacznik: zn,
    wydarzenia: wydarzeniaTygodnia(plan, ctx, profil, { zakupy, adres }).map((w) => ({ ...w, notatka: `${w.notatka}\n\n${zn}` })),
    zakupy: pozycje,
  };
}

export function adresSkrotu(paczka, nazwa = NAZWA_SKROTU) {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(nazwa)}&input=text&text=${encodeURIComponent(JSON.stringify(paczka))}`;
}
