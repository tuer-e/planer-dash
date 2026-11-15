// Przepis: otwiera się nad ekranem, z którego przyszedłeś, a „Wróć” prowadzi z powrotem.
// Adres: #przepis/<id> albo #przepis/<id>/<liczba porcji> (np. z „Goście”).
import { wartosciPorcji } from "../../silnik/katalog.js";
import { doPodania, krokiDania } from "../harmonogram.js";
import {
  dopiszDoZakupow, kontekst, MAKS_NOTATKI, notatka, opisZmian, planZDopisanymi, przepisOryginalny, przepisy, podobneWSmaku, przywrocOryginal, smaki, tekstZamian, tenTydzien, ustawNotatke,
  wersjaPrzepisu, zapiszWersjePrzepisu,
} from "../stan.js";
import { czytajMiare, doSzukania, krokIlosci, nazwaProduktu, piszMiare, zwyklaMiara } from "../miary.js";
import { arkuszOpcji, dataSlownie, dodaj, esc, kopiujTekst, odmiana, pokazArkusz, porcjeTxt, powiadom, przyciskWiecej, zakresTygodnia, zamknijArkusz } from "../narzedzia.js";

let porcjeDoZakupow = null;
let ostatniPrzepis = null;
let edytuje = false; // czy pole notatki jest otwarte
// Składniki do zmiany (kopia robocza na czas jednej zmiany — każda zmiana zapisuje się od razu jako Twoja wersja).
// Ilości w miarach kuchennych, gramy liczone w tle.
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
  const w = wartosciPorcji(p, ctx.produkty);
  const podanie = p.kroki.filter(doPodania);
  const wersja = wersjaPrzepisu(app.dane, id);
  return `<header class="naglowek">${wroc}<h1>${esc(p.nazwa)}</h1>
      <p class="wyciszony">${odmiana(p.porcje, "porcja", "porcje", "porcji")} · ok. ${p.czas_min} min${p.na_zapas ? ` · lodówka ${odmiana(p.trwalosc_dni, "dzień", "dni", "dni")}` : ""}${p.mrozi_sie ? " · mrozi się" : ""}${wersja ? ` · Twoja wersja z ${dataSlownie(wersja.zmieniono)}` : ""}</p></header>
    <div class="rzad-glowny"><a class="przycisk glowny" href="#gotowanie/przepis/${encodeURIComponent(id)}">Gotuj krok po kroku</a>${przyciskWiecej("opcjePrzepisu")}</div>
    ${sekcjaNotatki(app, id)}
    ${sekcjaSkladnikow(app, id, p, ctx)}
    <section class="sekcja"><h2>Przygotowanie</h2>${uwagaOZamianach(app, id, ctx)}<ol class="kroki">${krokiDania(p).map((k) => `<li>${esc(k.tekst)}</li>`).join("")}</ol></section>
    ${podanie.length ? `<section class="sekcja"><h2>Podanie</h2>${podanie.map((t) => `<p>${esc(t)}</p>`).join("")}</section>` : ""}
    <p class="ciemny maly">Porcja: ok. ${Math.round(w.kcal)} kcal · sód ${Math.round(w.sod_mg)} mg · ok. ${w.koszt_zl.toFixed(2).replace(".", ",")} zł</p>`;
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
  // Stuknięcie składnika otwiera jego kartę: ilość − / +, zamiana, usunięcie.
  return `<section class="sekcja"><h2>Składniki (na ${porcjeTxt(p.porcje)})</h2>
    <div>${p.skladniki.map(([pid, , miara], i) => {
      const d = dopisek(pid, miara);
      return `<button type="button" class="wiersz skladnik" data-akcja="kartaSkladnika" data-i="${i}">
        <span>${esc(nazwa(ctx, pid))}${d ? `<br><span class="ciemny maly">${esc(d)}</span>` : ""}</span><span class="wyciszony" style="text-align:right">${esc(miara)}</span></button>`;
    }).join("")}</div>
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

// Kopia robocza składników z obecnej wersji przepisu (z oznaczeniami: zamiast czego, dodane).
function robocze(app, id) {
  const p = przepisy()[id];
  const w = wersjaPrzepisu(app.dane, id);
  return p.skladniki.map(([produkt, g, miara], i) => {
    const m = czytajMiare(miara);
    const ile = m.ile > 0 ? m.ile : 1;
    const zapis = w?.skladniki[i];
    return {
      produkt, ...m, ile, gNaJedn: m.jedn === "g" ? 1 : g / ile, miara, zmienione: false,
      ...(zapis?.zamiast ? { zamiast: zapis.zamiast } : {}), ...(zapis?.dodany ? { dodany: true } : {}),
    };
  });
}

function zapiszRobocze(app, id) {
  zapiszWersjePrzepisu(app.dane, id, doZapisu(skladniki));
  skladniki = null;
  app.zapisz();
}

function kartaSkladnika(app, id, i) {
  const ctx = kontekst(app.dane, tenTydzien());
  const [pid, , miara] = przepisy()[id].skladniki[i] ?? [];
  if (!pid) return zamknijArkusz();
  const ilosc = `<div class="ilosc-karty">
      <button type="button" class="przycisk krok" data-akcja="iloscSkladnika" data-i="${i}" data-o="-1" aria-label="Mniej">−</button>
      <b>${esc(miara)}</b>
      <button type="button" class="przycisk krok" data-akcja="iloscSkladnika" data-i="${i}" data-o="1" aria-label="Więcej">+</button></div>`;
  arkuszOpcji(nazwa(ctx, pid), [
    { nazwa: "Zamień", opis: "podobne w smaku", akcja: "wybierzZamiane", dane: { i } },
    przepisy()[id].skladniki.length > 1 ? { nazwa: "Usuń z przepisu", akcja: "usunSkladnik", dane: { i } } : null,
  ], { opis: "Zmiany zapisują się od razu jako Twoja wersja.", dodatek: ilosc });
}

function opcjePrzepisu(app, id) {
  const p = przepisy()[id];
  const tekst = notatka(app.dane, id);
  arkuszOpcji("Więcej", [
    { nazwa: tekst ? "Zmień notatkę" : "Dodaj notatkę", akcja: "edytujNotatke" },
    { nazwa: "Dodaj składnik", akcja: "dodajSkladnik" },
    { nazwa: "Dopisz do zakupów", opis: tydzienDoZakupow(app) ? `na ${zakresTygodnia(tydzienDoZakupow(app))}` : "najpierw ułóż tydzień", akcja: "arkuszDopisz" },
    { nazwa: "Udostępnij przepis", akcja: "udostepnij", dane: { id, nazwa: p.nazwa } },
    wersjaPrzepisu(app.dane, id) ? { nazwa: "Przywróć oryginał", opis: "cofa Twoje zmiany składników", akcja: "przywroc" } : null,
  ]);
}

function arkuszDopisz(app) {
  const tydzien = tydzienDoZakupow(app);
  if (!tydzien) {
    pokazArkusz(`<h1>Dopisz do zakupów</h1><p class="wyciszony">Najpierw ułóż tydzień — składniki dopiszesz do jego listy zakupów.</p>
      <button type="button" class="link" data-akcja="zamknij" style="align-self:flex-start">zamknij</button>`);
    return;
  }
  pokazArkusz(`<h1>Dopisz do zakupów</h1>
    <div class="rozsun">
      <button type="button" class="przycisk" data-akcja="mniej" aria-label="Mniej porcji" style="min-width:52px">−</button>
      <b style="font-size:20px">${porcjeTxt(porcjeDoZakupow)}</b>
      <button type="button" class="przycisk" data-akcja="wiecej" aria-label="Więcej porcji" style="min-width:52px">+</button></div>
    <button type="button" class="przycisk glowny szeroki" data-akcja="dopisz">Dopisz składniki do listy</button>
    <p class="wyciszony maly">Trafią na listę zakupów na ${zakresTygodnia(tydzien)}.</p>
    <button type="button" class="link" data-akcja="zamknij" style="align-self:flex-start">zamknij</button>`);
}

// Okienko wyboru produktu: najpierw podobne w smaku (grupy smakowe), potem wyszukiwarka po całym katalogu.
function listaProduktow(ctx, szukaj) {
  const obecny = wybor?.tryb === "zamien" ? skladniki[wybor.i].produkt : null;
  const uzyte = new Set(skladniki.map((x) => x.produkt));
  const jedzenie = Object.values(ctx.produkty).filter((q) => q.dzial !== "chemia" && q.klasa !== "niewskazane" && !uzyte.has(q.id));
  const wiersz = (q) => `<button type="button" class="wiersz-produktu" data-akcja="wybierzProdukt" data-id="${esc(q.id)}">
      <span>${esc(q.nazwa)}</span><span class="ciemny maly">${q.cena_zl.toFixed(2).replace(".", ",")} zł</span></button>`;
  const fraza = doSzukania(szukaj).trim();
  if (fraza) {
    const wyniki = jedzenie.filter((q) => doSzukania(q.nazwa).includes(fraza)).slice(0, 30);
    return wyniki.length ? wyniki.map(wiersz).join("") : `<p class="ciemny maly">Nie ma takiego produktu w katalogu planera.</p>`;
  }
  // Bez wpisanej nazwy: produkty podobne w smaku (cytryna → limonka, ocet, ocet balsamiczny…).
  const podobne = obecny ? podobneWSmaku(obecny, ctx.produkty).map((pid) => ctx.produkty[pid]).filter((q) => !uzyte.has(q.id) && q.dzial !== "chemia") : [];
  const grupa = obecny ? smaki().grupy[smaki().produkty[obecny]?.[0]] : null;
  return podobne.length
    ? `<h2 class="ciemny maly">Podobne w smaku${grupa ? ` · ${esc(grupa)}` : ""}</h2>${podobne.slice(0, 15).map(wiersz).join("")}<p class="ciemny maly">Szukaj, żeby zobaczyć cały katalog.</p>`
    : `<p class="ciemny maly">Wpisz nazwę produktu.</p>`;
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
  opcjePrzepisu(app) {
    opcjePrzepisu(app, argumenty(app).id);
  },
  kartaSkladnika(app, cel) {
    kartaSkladnika(app, argumenty(app).id, Number(cel.dataset.i));
  },
  iloscSkladnika(app, cel) {
    const { id } = argumenty(app);
    const i = Number(cel.dataset.i);
    skladniki = robocze(app, id);
    const x = skladniki[i];
    const nowa = krokIlosci(x.ile, x.jedn, Number(cel.dataset.o));
    if (nowa === x.ile) return;
    x.ile = nowa;
    x.zmienione = true;
    zapiszRobocze(app, id);
    app.odswiez();
    kartaSkladnika(app, id, i);
  },
  usunSkladnik(app, cel) {
    const { id } = argumenty(app);
    skladniki = robocze(app, id);
    skladniki.splice(Number(cel.dataset.i), 1);
    zapiszRobocze(app, id);
    zamknijArkusz();
    app.odswiez();
    powiadom("Usunięte z Twojej wersji.");
  },
  wybierzZamiane(app, cel) {
    skladniki = robocze(app, argumenty(app).id);
    wybor = { tryb: "zamien", i: Number(cel.dataset.i) };
    pokazWybor(app, kontekst(app.dane, tenTydzien()));
  },
  dodajSkladnik(app) {
    skladniki = robocze(app, argumenty(app).id);
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
    const { id } = argumenty(app);
    zapiszRobocze(app, id);
    zamknijArkusz();
    app.odswiez();
    powiadom(wPlanieTegoTygodnia(app, id) ? "Zapisane. Lista zakupów tego tygodnia już to uwzględnia." : "Zapisane w Twojej wersji.");
  },
  arkuszDopisz(app) {
    arkuszDopisz(app);
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
    zamknijArkusz();
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
    zamknijArkusz();
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
    arkuszDopisz(app);
  },
  wiecej(app) {
    porcjeDoZakupow = Math.min(12, porcjeDoZakupow + 1);
    arkuszDopisz(app);
  },
  dopisz(app) {
    const tydzien = tydzienDoZakupow(app);
    const { id } = argumenty(app);
    dopiszDoZakupow(app.dane, tydzien, id, porcjeDoZakupow);
    app.zapisz();
    zamknijArkusz();
    powiadom(`Dopisane: ${porcjeTxt(porcjeDoZakupow)}. Zobaczysz je na liście zakupów.`);
  },
};
