// Przepis: otwiera się nad ekranem, z którego przyszedłeś, a „Wróć” prowadzi z powrotem.
// Adres: #przepis/<id> albo #przepis/<id>/<liczba porcji> (np. z „Goście”).
import { wartosciPorcji } from "../../silnik/katalog.js";
import { doPodania, krokiDania } from "../harmonogram.js";
import { dopiszDoZakupow, kontekst, MAKS_NOTATKI, notatka, tenTydzien, ustawNotatke } from "../stan.js";
import { dodaj, esc, kopiujTekst, odmiana, porcjeTxt, powiadom, zakresTygodnia } from "../narzedzia.js";

let porcjeDoZakupow = null;
let ostatniPrzepis = null;
let edytuje = false; // czy pole notatki jest otwarte

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
    edytuje = false;
  }
  const w = wartosciPorcji(p, ctx.produkty);
  const podanie = p.kroki.filter(doPodania);
  const tydzien = tydzienDoZakupow(app);
  return `<header class="naglowek">${wroc}<h1>${esc(p.nazwa)}</h1>
      <p class="wyciszony">${odmiana(p.porcje, "porcja", "porcje", "porcji")} · ok. ${p.czas_min} min${p.na_zapas ? ` · lodówka ${odmiana(p.trwalosc_dni, "dzień", "dni", "dni")}` : ""}${p.mrozi_sie ? " · mrozi się" : ""}</p></header>
    <div class="rzad"><a class="przycisk glowny" href="#gotowanie/przepis/${encodeURIComponent(id)}">Gotuj krok po kroku</a>
      <button type="button" class="link" data-akcja="udostepnij" data-id="${esc(id)}" data-nazwa="${esc(p.nazwa)}">udostępnij przepis</button>
      ${!notatka(app.dane, id) && !edytuje ? `<button type="button" class="link" data-akcja="edytujNotatke">dodaj notatkę</button>` : ""}</div>
    ${sekcjaNotatki(app, id)}
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

// Moje notatki: zwykły tekst pod przyciskami; widać go też w karcie „Teraz” podczas gotowania.
function sekcjaNotatki(app, id) {
  const tekst = notatka(app.dane, id);
  if (edytuje) {
    return `<form class="sekcja" data-wyslij="zapiszNotatke"><h2>Moje notatki</h2>
      <textarea name="notatka" rows="4" maxlength="${MAKS_NOTATKI}" aria-label="Moje notatki do przepisu" placeholder="np. mniej soli, dodać kumin, piec 5 minut dłużej">${esc(tekst)}</textarea>
      <div class="rzad"><button type="submit" class="przycisk">Zapisz</button>
        <button type="button" class="link" data-akcja="anulujNotatke">anuluj</button>
        ${tekst ? `<button type="button" class="link" data-akcja="usunNotatke">usuń notatkę</button>` : ""}</div></form>`;
  }
  if (!tekst) return "";
  return `<section class="sekcja notatka"><h2>Moje notatki</h2><p class="notatka-tekst">${esc(tekst)}</p>
    <button type="button" class="link" data-akcja="edytujNotatke" style="align-self:flex-start">zmień</button></section>`;
}

export function poNarysowaniu() {
  const pole = edytuje && document.querySelector('textarea[name="notatka"]');
  if (pole && document.activeElement !== pole) {
    pole.focus();
    pole.setSelectionRange(pole.value.length, pole.value.length);
  }
}

export function poOpuszczeniu() {
  edytuje = false;
}

export const akcje = {
  edytujNotatke(app) {
    edytuje = true;
    app.odswiez();
  },
  anulujNotatke(app) {
    edytuje = false;
    app.odswiez();
  },
  zapiszNotatke(app, formularz) {
    const { id } = argumenty(app);
    ustawNotatke(app.dane, id, new FormData(formularz).get("notatka"));
    edytuje = false;
    app.zapisz();
    app.odswiez();
    powiadom(notatka(app.dane, id) ? "Notatka zapisana." : "Notatka usunięta.");
  },
  usunNotatke(app) {
    const { id } = argumenty(app);
    ustawNotatke(app.dane, id, "");
    edytuje = false;
    app.zapisz();
    app.odswiez();
    powiadom("Notatka usunięta.");
  },
  // Link do przepisu: druga osoba otwiera go w Safari, bez instalowania planera.
  udostepnij(app, cel) {
    const url = `${location.origin}${location.pathname}#przepis/${encodeURIComponent(cel.dataset.id)}`;
    if (navigator.share) navigator.share({ title: cel.dataset.nazwa, url }).catch(() => {});
    else kopiujTekst(url).then(() => powiadom("Link do przepisu skopiowany."));
  },
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
