// Przepis: otwiera się nad ekranem, z którego przyszedłeś, a „Wróć” prowadzi z powrotem.
// Adres: #przepis/<id> albo #przepis/<id>/<liczba porcji> (np. z „Goście”).
import { wartosciPorcji } from "../../silnik/katalog.js";
import { doPodania, krokiDania } from "../harmonogram.js";
import { zamienniki } from "../../silnik/zakupy.js";
import {
  dopiszDoZakupow, kontekst, MAKS_NOTATKI, notatka, opisZmian, planZDopisanymi, przepisOryginalny, przepisy, przywrocOryginal, tekstZamian, tenTydzien, ustawNotatke,
  wersjaPrzepisu, zapiszWersjePrzepisu,
} from "../stan.js";
import { czytajMiare, doSzukania, krokIlosci, nazwaProduktu, piszMiare, zwyklaMiara } from "../miary.js";
import { dataSlownie, dodaj, esc, kopiujTekst, odmiana, pokazArkusz, porcjeTxt, powiadom, zakresTygodnia, zamknijArkusz } from "../narzedzia.js";

let porcjeDoZakupow = null;
let ostatniPrzepis = null;
let edytuje = false; // czy pole notatki jest otwarte
// Zmiana składników: kopia robocza do „Zapisz zmiany”. Ilości w miarach kuchennych, gramy liczone w tle.
let skladniki = null; // [{produkt, ile, jedn, dopisek, tekst, gNaJedn, miara, zmienione, zamiast, dodany}]
let wybor = null; // okienko wyboru produktu: { tryb: "zamien" | "dodaj", i }

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
    skladniki = null;
  }
  if (skladniki) return rysujEdycje(app, id, p, ctx, wroc);
  const w = wartosciPorcji(p, ctx.produkty);
  const podanie = p.kroki.filter(doPodania);
  const tydzien = tydzienDoZakupow(app);
  const wersja = wersjaPrzepisu(app.dane, id);
  return `<header class="naglowek">${wroc}<h1>${esc(p.nazwa)}</h1>
      <p class="wyciszony">${odmiana(p.porcje, "porcja", "porcje", "porcji")} · ok. ${p.czas_min} min${p.na_zapas ? ` · lodówka ${odmiana(p.trwalosc_dni, "dzień", "dni", "dni")}` : ""}${p.mrozi_sie ? " · mrozi się" : ""}</p>
      ${wersja ? `<p class="wyciszony maly">Twoja wersja · zmieniona ${dataSlownie(wersja.zmieniono)} · <button type="button" class="link" data-akcja="przywroc">przywróć oryginał</button></p>` : ""}</header>
    <div class="rzad"><a class="przycisk glowny" href="#gotowanie/przepis/${encodeURIComponent(id)}">Gotuj krok po kroku</a>
      <button type="button" class="link" data-akcja="udostepnij" data-id="${esc(id)}" data-nazwa="${esc(p.nazwa)}">udostępnij przepis</button>
      ${!notatka(app.dane, id) && !edytuje ? `<button type="button" class="link" data-akcja="edytujNotatke">dodaj notatkę</button>` : ""}</div>
    ${sekcjaNotatki(app, id)}
    ${sekcjaSkladnikow(app, id, p, ctx)}
    <section class="sekcja"><h2>Przygotowanie</h2>${uwagaOZamianach(app, id, ctx)}<ol class="kroki">${krokiDania(p).map((k) => `<li>${esc(k.tekst)}</li>`).join("")}</ol></section>
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

// --- Składniki: widok i Twoja wersja ---

const nazwa = (ctx, id) => nazwaProduktu(ctx.produkty[id]?.nazwa ?? id);

function sekcjaSkladnikow(app, id, p, ctx) {
  const z = opisZmian(app.dane, id);
  const dopisek = (pid, miara) => {
    if (!z) return "";
    const zam = z.zamiany.find((x) => x.nowy === pid);
    if (zam) return `zamiast: ${nazwa(ctx, zam.stary).toLowerCase()}`;
    if (z.dodane.includes(pid)) return "dodane";
    const il = z.ilosci.find((x) => x.produkt === pid && x.jest === miara);
    return il ? `było: ${il.bylo}` : "";
  };
  return `<section class="sekcja"><div class="rozsun"><h2>Składniki (na ${porcjeTxt(p.porcje)})</h2>
      <button type="button" class="link" data-akcja="zmienSkladniki">zmień składniki</button></div>
    <ul class="skladniki">${p.skladniki.map(([pid, , miara]) => {
      const d = dopisek(pid, miara);
      return `<li><span>${esc(nazwa(ctx, pid))}${d ? `<br><span class="ciemny maly">${esc(d)}</span>` : ""}</span><span class="wyciszony" style="text-align:right">${esc(miara)}</span></li>`;
    }).join("")}</ul>
    ${z?.usuniete.length ? `<p class="ciemny maly">Usunięte: ${z.usuniete.map((x) => esc(nazwa(ctx, x).toLowerCase())).join(", ")}</p>` : ""}</section>`;
}

function uwagaOZamianach(app, id, ctx) {
  const t = tekstZamian(app.dane, id, ctx);
  return t ? `<p class="wyciszony maly">${esc(t)}</p>` : "";
}

function gramy(x) {
  return x.jedn === "g" ? x.ile : x.ile * x.gNaJedn;
}

function doZapisu(lista) {
  return lista.map((x) => ({
    produkt: x.produkt, gramy: gramy(x), miara: x.zmienione ? piszMiare(x) : x.miara,
    ...(x.zamiast ? { zamiast: x.zamiast } : {}), ...(x.dodany ? { dodany: true } : {}),
  }));
}

function rysujEdycje(app, id, p, ctx, wroc) {
  const probny = { ...p, skladniki: doZapisu(skladniki).map((x) => [x.produkt, x.gramy, x.miara]) };
  const w = wartosciPorcji(probny, ctx.produkty);
  return `<header class="naglowek">${wroc}<h1>${esc(p.nazwa)}</h1>
      <p class="wyciszony">Zmieniasz składniki (na ${porcjeTxt(p.porcje)})</p></header>
    <section class="lista-edycji">${skladniki.map((x, i) => `
      <div class="skladnik-edycja">
        <div class="rozsun"><button type="button" class="nazwa-skladnika" data-akcja="wybierzZamiane" data-i="${i}">${esc(nazwa(ctx, x.produkt))}</button>
          <button type="button" class="link ciemny" data-akcja="usunSkladnik" data-i="${i}">usuń</button></div>
        <div class="ilosc">
          <button type="button" class="przycisk krok" data-akcja="ilosc" data-i="${i}" data-o="-1" aria-label="Mniej: ${esc(nazwa(ctx, x.produkt))}">−</button>
          <b>${esc(x.zmienione ? piszMiare(x) : x.miara)}</b>
          <button type="button" class="przycisk krok" data-akcja="ilosc" data-i="${i}" data-o="1" aria-label="Więcej: ${esc(nazwa(ctx, x.produkt))}">+</button>
        </div>
      </div>`).join("")}
      <button type="button" class="link" data-akcja="dodajSkladnik" style="align-self:flex-start">dodaj składnik</button>
    </section>
    <p class="ciemny maly">Porcja: ok. ${Math.round(w.kcal)} kcal · sód ${Math.round(w.sod_mg)} mg · ok. ${w.koszt_zl.toFixed(2).replace(".", ",")} zł</p>
    <div class="rzad"><button type="button" class="przycisk glowny" data-akcja="zapiszSkladniki">Zapisz zmiany</button>
      <button type="button" class="link" data-akcja="anulujSkladniki">anuluj</button></div>
    <p class="ciemny maly">Stuknij nazwę, żeby zamienić produkt. Zmiana od razu trafi do listy zakupów tego tygodnia.</p>`;
}

// Okienko wyboru produktu: najpierw podobne (zamienniki z katalogu), potem wyszukiwarka po całym katalogu.
function listaProduktow(ctx, szukaj) {
  const obecny = wybor?.tryb === "zamien" ? skladniki[wybor.i].produkt : null;
  const uzyte = new Set(skladniki.map((x) => x.produkt));
  const jedzenie = Object.values(ctx.produkty).filter((q) => q.dzial !== "chemia" && q.klasa !== "niewskazane" && !uzyte.has(q.id));
  const wiersz = (q) => `<button type="button" class="wiersz-produktu" data-akcja="wybierzProdukt" data-id="${esc(q.id)}">
      <span>${esc(nazwaProduktu(q.nazwa))}</span><span class="ciemny maly">${q.cena_zl.toFixed(2).replace(".", ",")} zł</span></button>`;
  const fraza = doSzukania(szukaj).trim();
  if (fraza) {
    const wyniki = jedzenie.filter((q) => doSzukania(q.nazwa).includes(fraza)).slice(0, 30);
    return wyniki.length ? wyniki.map(wiersz).join("") : `<p class="ciemny maly">Nie ma takiego produktu w katalogu planera.</p>`;
  }
  const podobne = obecny ? zamienniki(obecny, ctx).map((z) => ctx.produkty[z.id]).filter((q) => q && !uzyte.has(q.id)) : [];
  const dzial = obecny ? ctx.produkty[obecny]?.dzial : null;
  const inne = jedzenie.filter((q) => !podobne.includes(q) && (!dzial || q.dzial === dzial))
    .sort((a, b) => a.nazwa.localeCompare(b.nazwa, "pl")).slice(0, 15);
  return `${podobne.length ? `<h2 class="ciemny maly">Podobne</h2>${podobne.map(wiersz).join("")}` : ""}
    <h2 class="ciemny maly">${obecny ? "Inne z tego działu" : "Z katalogu planera"}</h2>${inne.map(wiersz).join("")}
    <p class="ciemny maly">Szukaj, żeby zobaczyć cały katalog.</p>`;
}

function pokazWybor(app, ctx) {
  const obecny = wybor.tryb === "zamien" ? skladniki[wybor.i].produkt : null;
  pokazArkusz(`<h1>${obecny ? `Zamiast: ${esc(nazwa(ctx, obecny).toLowerCase())}` : "Dodaj składnik"}</h1>
    <input type="search" class="szukaj-produktu" placeholder="Szukaj produktu" aria-label="Szukaj produktu" autocomplete="off">
    <div class="lista-produktow">${listaProduktow(ctx, "")}</div>
    <button type="button" class="link" data-akcja="zamknij" style="align-self:flex-start">zamknij</button>`);
  const pole = document.querySelector(".szukaj-produktu");
  pole?.addEventListener("input", () => {
    document.querySelector(".lista-produktow").innerHTML = listaProduktow(ctx, pole.value);
  });
}

function arkuszPrzywracania(app, id, ctx) {
  const z = opisZmian(app.dane, id);
  if (!z) return;
  const linie = [
    ...z.zamiany.map((x) => `${nazwa(ctx, x.nowy)} (zamiast: ${nazwa(ctx, x.stary).toLowerCase()})`),
    ...z.ilosci.map((x) => `${nazwa(ctx, x.produkt)} — ${x.jest} (było: ${x.bylo})`),
    ...z.dodane.map((x) => `${nazwa(ctx, x)} (dodane)`),
    ...z.usuniete.map((x) => `${nazwa(ctx, x)} (usunięte)`),
  ];
  pokazArkusz(`<h1>Przywrócić oryginał?</h1>
    <p class="wyciszony">Twoje zmiany w tym przepisie znikną:</p>
    <div class="lista">${linie.map((l) => `<span>${esc(l)}</span>`).join("")}</div>
    <p class="ciemny maly">Lista zakupów tego tygodnia wróci do oryginalnych składników.</p>
    <button type="button" class="przycisk glowny szeroki" data-akcja="przywrocTak">Przywróć oryginał</button>
    <button type="button" class="link" data-akcja="zamknij" style="align-self:flex-start">zostaw moją wersję</button>`);
}

function wPlanieTegoTygodnia(app, id) {
  const plan = planZDopisanymi(app.dane, tenTydzien());
  return Boolean(plan?.grupy.some((g) => g.przepis === id || (g.dodatkowe ?? []).includes(id)));
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
  skladniki = null;
  wybor = null;
}

export const akcje = {
  zmienSkladniki(app) {
    const { id } = argumenty(app);
    const p = przepisy()[id];
    const w = wersjaPrzepisu(app.dane, id);
    skladniki = p.skladniki.map(([produkt, gramy, miara], i) => {
      const m = czytajMiare(miara);
      const ile = m.ile > 0 ? m.ile : 1;
      const zapis = w?.skladniki[i];
      return {
        produkt, ...m, ile, gNaJedn: m.jedn === "g" ? 1 : gramy / ile, miara, zmienione: false,
        ...(zapis?.zamiast ? { zamiast: zapis.zamiast } : {}), ...(zapis?.dodany ? { dodany: true } : {}),
      };
    });
    app.odswiez();
    document.getElementById("ekran").scrollTop = 0;
  },
  anulujSkladniki(app) {
    skladniki = null;
    app.odswiez();
  },
  ilosc(app, cel) {
    const x = skladniki[Number(cel.dataset.i)];
    x.ile = krokIlosci(x.ile, x.jedn, Number(cel.dataset.o));
    x.zmienione = true;
    app.odswiez();
  },
  usunSkladnik(app, cel) {
    skladniki.splice(Number(cel.dataset.i), 1);
    app.odswiez();
  },
  wybierzZamiane(app, cel) {
    wybor = { tryb: "zamien", i: Number(cel.dataset.i) };
    pokazWybor(app, kontekst(app.dane, tenTydzien()));
  },
  dodajSkladnik(app) {
    wybor = { tryb: "dodaj" };
    pokazWybor(app, kontekst(app.dane, tenTydzien()));
  },
  wybierzProdukt(app, cel) {
    const ctx = kontekst(app.dane, tenTydzien());
    const nowy = cel.dataset.id;
    const zw = zwyklaMiara(nowy, przepisy(), ctx.produkty[nowy]);
    if (wybor?.tryb === "zamien") {
      const stary = skladniki[wybor.i];
      // Ta sama miara (puszka → puszka): ilość zostaje. Inna: zaczynamy od 1 w zwykłej mierze nowego produktu.
      const ta = zw.jedn === stary.jedn;
      const zamiast = stary.dodany ? undefined : (stary.zamiast ?? stary.produkt);
      skladniki[wybor.i] = {
        produkt: nowy, ile: ta ? stary.ile : 1, jedn: zw.jedn, dopisek: "", gNaJedn: zw.gNaJedn, zmienione: true,
        ...(zamiast && zamiast !== nowy ? { zamiast } : {}), ...(stary.dodany ? { dodany: true } : {}),
      };
      // Powrót do produktu z oryginału: wraca też jego miara z przepisu.
      const oryg = zamiast === nowy && przepisOryginalny(argumenty(app).id)?.skladniki.find(([pid]) => pid === nowy);
      if (oryg) skladniki[wybor.i] = { produkt: nowy, ...czytajMiare(oryg[2]), ile: czytajMiare(oryg[2]).ile || 1, gNaJedn: oryg[1] / (czytajMiare(oryg[2]).ile || 1), miara: oryg[2], zmienione: false };
    } else {
      skladniki.push({ produkt: nowy, ile: 1, jedn: zw.jedn, dopisek: "", gNaJedn: zw.gNaJedn, zmienione: true, dodany: true });
    }
    wybor = null;
    zamknijArkusz();
    app.odswiez();
  },
  zapiszSkladniki(app) {
    const { id } = argumenty(app);
    if (!skladniki.length) {
      powiadom("Przepis musi mieć choć jeden składnik.");
      return;
    }
    zapiszWersjePrzepisu(app.dane, id, doZapisu(skladniki));
    skladniki = null;
    app.zapisz();
    app.odswiez();
    powiadom(wPlanieTegoTygodnia(app, id) ? "Zapisane. Lista zakupów tego tygodnia już to uwzględnia." : "Zapisane.");
  },
  przywroc(app) {
    arkuszPrzywracania(app, argumenty(app).id, kontekst(app.dane, tenTydzien()));
  },
  przywrocTak(app) {
    przywrocOryginal(app.dane, argumenty(app).id);
    zamknijArkusz();
    app.zapisz();
    app.odswiez();
    powiadom("Przywrócony oryginał.");
  },
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
