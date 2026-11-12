// Przepis: otwiera się nad ekranem, z którego przyszedłeś, a „Wróć” prowadzi z powrotem.
// Adres: #przepis/<id> albo #przepis/<id>/<liczba porcji> (np. z „Goście”).
import { wartosciPorcji } from "../../silnik/katalog.js";
import { doPodania, krokiDania } from "../harmonogram.js";
import { dopiszDoZakupow, kontekst, tenTydzien } from "../stan.js";
import { dodaj, esc, odmiana, porcjeTxt, powiadom, zakresTygodnia } from "../narzedzia.js";

let porcjeDoZakupow = null;
let ostatniPrzepis = null;

function argumenty(app) {
  const [id, porcje] = (app.argument ?? "").split("/");
  return { id: decodeURIComponent(id ?? ""), porcje: Number(porcje) || null };
}

// Dopisujemy do tygodnia, który ma plan: najpierw ten, potem następny.
function tydzienDoZakupow(app) {
  const ten = tenTydzien();
  if (app.dane.tygodnie[ten]) return ten;
  const nastepny = dodaj(ten, 7);
  return app.dane.tygodnie[nastepny] ? nastepny : null;
}

export function rysuj(app) {
  const { id, porcje } = argumenty(app);
  const ctx = kontekst(app.dane, tenTydzien());
  const p = ctx.przepisy[id];
  const wroc = `<button type="button" class="link" data-akcja="wroc">‹ Wróć</button>`;
  if (!p) return `<header class="naglowek">${wroc}<h1>Nie ma takiego przepisu</h1></header>`;
  if (ostatniPrzepis !== app.argument) {
    ostatniPrzepis = app.argument;
    porcjeDoZakupow = porcje ?? 2;
  }
  const w = wartosciPorcji(p, ctx.produkty);
  const podanie = p.kroki.filter(doPodania);
  const tydzien = tydzienDoZakupow(app);
  return `<header class="naglowek">${wroc}<h1>${esc(p.nazwa)}</h1>
      <p class="wyciszony">${odmiana(p.porcje, "porcja", "porcje", "porcji")} · ok. ${p.czas_min} min${p.na_zapas ? ` · lodówka ${odmiana(p.trwalosc_dni, "dzień", "dni", "dni")}` : ""}${p.mrozi_sie ? " · mrozi się" : ""}</p></header>
    <a class="przycisk glowny szeroki" href="#gotowanie/przepis/${encodeURIComponent(id)}">Gotuj krok po kroku</a>
    <section class="sekcja"><h2>Składniki (na ${porcjeTxt(p.porcje)})</h2><ul class="skladniki">${p.skladniki.map(([idProduktu, , miara]) => `
      <li><span>${esc(ctx.produkty[idProduktu]?.nazwa ?? idProduktu)}</span><span class="wyciszony" style="text-align:right">${esc(miara)}</span></li>`).join("")}</ul></section>
    <section class="sekcja"><h2>Przygotowanie</h2><ol class="kroki">${krokiDania(p).map((k) => `<li>${esc(k.tekst)}</li>`).join("")}</ol></section>
    ${podanie.length ? `<section class="sekcja"><h2>Podanie</h2>${podanie.map((t) => `<p>${esc(t)}</p>`).join("")}</section>` : ""}
    <section class="karta">
      <h3>Dopisz do zakupów</h3>
      ${tydzien ? `<div class="rozsun">
          <button type="button" class="przycisk" data-akcja="mniej" aria-label="Mniej porcji" style="min-width:52px">−</button>
          <b style="font-size:20px">${porcjeTxt(porcjeDoZakupow)}</b>
          <button type="button" class="przycisk" data-akcja="wiecej" aria-label="Więcej porcji" style="min-width:52px">+</button></div>
        <button type="button" class="przycisk glowny szeroki" data-akcja="dopisz">Dopisz składniki do listy</button>
        <p class="wyciszony maly">Trafią na listę zakupów na ${zakresTygodnia(tydzien)}.</p>`
        : `<p class="wyciszony maly">Najpierw ułóż tydzień — składniki dopiszesz do jego listy zakupów.</p>`}
    </section>
    <p class="wyciszony maly">Porcja: ok. ${Math.round(w.kcal)} kcal · sód ${Math.round(w.sod_mg)} mg · ok. ${w.koszt_zl.toFixed(2).replace(".", ",")} zł</p>`;
}

export const akcje = {
  wroc(app) {
    if (history.length > 1) history.back();
    else app.idz("#wiecej/przepisy");
  },
  mniej(app) {
    porcjeDoZakupow = Math.max(1, porcjeDoZakupow - 1);
    app.odswiez();
  },
  wiecej(app) {
    porcjeDoZakupow = Math.min(12, porcjeDoZakupow + 1);
    app.odswiez();
  },
  dopisz(app) {
    const tydzien = tydzienDoZakupow(app);
    const { id } = argumenty(app);
    dopiszDoZakupow(app.dane, tydzien, id, porcjeDoZakupow);
    app.zapisz();
    powiadom(`Dopisane: ${porcjeTxt(porcjeDoZakupow)}. Zobaczysz je na liście zakupów.`);
  },
};
