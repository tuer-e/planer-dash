// Kuchnia (dawniej Lodówka): lodówka z ugotowanymi porcjami, blat ze śniadaniami i plecak z przekąską.
// Podpowiada miejsce według pory dnia, ale jesz, na co masz ochotę.
import {
  cofnijPrzelozenie, cofnijZjedzenie, lodowka, przelozDoLodowki, przepisy, tenTydzien, wlozDoLodowki,
  zamroz, zamrazarka, zjedz,
} from "../stan.js";
import { dataSlownie, dniaDopelniacz, dodaj, doKiedy, dzis, esc, krotkaNazwa, nazwaDnia, odmiana, porcjeTxt, pokazArkusz, powiadom, roznica, zamknijArkusz } from "../narzedzia.js";
import { kafelDnia, przelacz, stanDnia, zPlanu } from "../wyjazdy.js";
import {
  coMasz, dopiszProdukt, godzinyPosilkow, krotkiProdukt, MIEJSCA, minuty, naBlacie, podpowiedz, produktyPrzepisu, propozycje,
  wSpizarni, zPlanuNaDzien,
} from "../kuchnia.js";

let ostatnio = null; // ostatnio zjedzona porcja — „Cofnij” przy jej karcie
const arkusz = { osoby: 2, dni: 2 };

function nazwa(x) {
  return krotkaNazwa(przepisy()[x.przepis]?.nazwa ?? x.nazwa);
}

// „w piątek”, „we wtorek”, „w sobotę”
function wDzien(data) {
  const n = nazwaDnia(data);
  return n === "wtorek" ? "we wtorek" : `w ${n.replace(/a$/, "ę")}`;
}

function wyjazdTekst(app, plan, dzisiaj) {
  if (!plan) return "";
  const { dom, wyjazd } = app.dane.profil;
  const m = zPlanu(plan);
  const dzien = roznica(dzisiaj, plan.od);
  const teraz = stanDnia(m, dzien);
  if (teraz === "caly") return ` · dziś ${esc(wyjazd)}`;
  if (teraz === "wieczor") return ` · wieczorem ${esc(wyjazd)}`;
  if (teraz === "rano") return ` · wieczorem ${esc(dom)}`;
  const d = [...Array(8).keys()].find((x) => x > dzien && stanDnia(m, x) !== "dom");
  if (d === undefined) return "";
  const kiedy = dodaj(plan.od, d);
  const jutro = roznica(kiedy, dzisiaj) === 1;
  const stan = stanDnia(m, d);
  if (stan === "caly") return ` · od ${jutro ? "jutra" : dniaDopelniacz(kiedy)} ${esc(wyjazd)}`;
  return ` · ${jutro ? "jutro" : wDzien(kiedy)} ${stan === "wieczor" ? "wieczorem" : "rano"} ${esc(wyjazd)}`;
}

// Kuchnia narysowana na górze ekranu: lodówka, blat i plecak na haczyku. Podpowiadane miejsce (według pory dnia)
// jest jaśniejsze; stuknięcie innego otwiera je pod rysunkiem. Lodówka pokazuje karteczkę „Najpierw” i półki.
let miejsce = null; // miejsce wybrane ręcznie; null = to, które podpowiada pora dnia
let wybrane = null; // id porcji przeniesionej na karteczkę stuknięciem półki
let ostatniaPodpowiedz = "";
let zegar = null;

// Kafelki zamiast cyfr: jeden kafelek = jedna porcja.
function kafle(n, rodzaj = "") {
  return `<span class="porcje-kafle" aria-hidden="true">${Array.from({ length: n }, () => `<span class="porcja ${rodzaj}"></span>`).join("")}</span>`;
}

function rozmrazaSie(x, dzisiaj) {
  return x.z_zamrazarki && x.ugotowano === dzisiaj;
}

function karteczka(app, x, dzisiaj, pierwsze, ileWZamrazarce, plan) {
  if (x && rozmrazaSie(x, dzisiaj)) {
    return `<span class="wyciszony maly">Rozmraża się</span><h1>${esc(nazwa(x))}</h1>
      <span class="wyciszony">będzie dobre jutro · ${porcjeTxt(x.porcje)}</span>
      <div class="przyciski"><button type="button" class="link" data-akcja="cofnijPrzelozenie" data-id="${x.id}">z powrotem do zamrażarki</button></div>`;
  }
  if (x) {
    return `<span class="wyciszony maly">${x === pierwsze ? "Najpierw" : "Wybrane"}</span><h1>${esc(nazwa(x))}</h1>
      <span class="wyciszony">${doKiedy(x.dobre_do, dzisiaj)} · ${porcjeTxt(x.porcje)}${x.z_zamrazarki ? " · rozmrożone" : ""}</span>
      <div class="przyciski"><button type="button" class="przycisk glowny" data-akcja="zjedz" data-id="${x.id}">Zjadłem porcję</button>
        ${ostatnioCofnij(app)}<button type="button" class="link" data-akcja="danie" data-id="${x.id}">więcej</button></div>`;
  }
  const cofnij = ostatnioCofnij(app) ? `<div class="przyciski">${ostatnioCofnij(app)}</div>` : "";
  if (plan && !plan.ugotowano) {
    return `<h1>Plan czeka na gotowanie</h1><span class="wyciszony">Po gotowaniu porcje trafią tutaj, z terminem przydatności.</span>
      <div class="przyciski"><a class="przycisk glowny" href="#gotowanie">Zacznij gotowanie</a>
        <button type="button" class="link" data-akcja="juzUgotowane">już ugotowane</button></div>`;
  }
  if (ileWZamrazarce) {
    return `<h1>W lodówce pusto</h1><span class="wyciszony">Przełóż coś z zamrażarki na jutro, a dziś zajrzyj na blat: tam jest coś bez gotowania.</span>${cofnij}`;
  }
  return `<h1>Lodówka jest pusta</h1><span class="wyciszony">Ułóż plan na tydzień: planer wybierze dania na poniedziałkowe gotowanie i zrobi listę zakupów.</span>
    <div class="przyciski"><a class="przycisk glowny" href="#tydzien">Ułóż tydzień</a></div>${cofnij}`;
}

function rysunekKuchni(wyb, pod) {
  const przycisk = (co, rys) => `<button type="button" class="miejsce m-${co}${co === wyb ? " wybrane" : ""}${co === pod ? " podpowiadane" : ""}"
      data-akcja="miejsce" data-co="${co}" aria-pressed="${co === wyb}" aria-label="${MIEJSCA[co]}${co === pod ? ", podpowiedź na teraz" : ""}">
      <span class="rys" aria-hidden="true">${rys}</span><span class="podpis">${MIEJSCA[co]}</span></button>`;
  return `<div class="kuchnia" role="group" aria-label="Kuchnia">
    ${przycisk("lod", `<span class="ksztalt lod-korpus"><span class="lod-zam"></span><span class="detal lod-uchwyt g"></span><span class="detal lod-uchwyt d"></span></span>`)}
    ${przycisk("blat", `<span class="detal sloik s1"></span><span class="detal sloik s2"></span><span class="owoc o1"></span><span class="owoc o2"></span><span class="owoc o3"></span><span class="detal miska"></span><span class="blat-gora"></span><span class="ksztalt szafka"></span>`)}
    ${przycisk("plecak", `<span class="hak"></span><span class="detal ucho"></span><span class="ksztalt worek"></span><span class="detal klapa"></span><span class="detal kieszen"></span>`)}
  </div>`;
}

// Wiersz propozycji: przepis, co z nim (masz wszystko / brakuje), i „dopisz do zakupów”.
function propozycja(x, stan, dopisane) {
  const p = stan.ctx.przepisy[x.id];
  const zDopisanych = produktyPrzepisu(p, stan.ctx, stan.zamiany).filter((id) => dopisane.includes(id));
  const brak = x.brakuje[0];
  const opis = brak ? `brakuje: ${krotkiProdukt(stan.ctx.produkty[brak].nazwa)}`
    : zDopisanych.length ? `dopisane do zakupów: ${zDopisanych.map((id) => krotkiProdukt(stan.ctx.produkty[id].nazwa)).join(", ")}`
      : `masz wszystko · ok. ${p.czas_min} min`;
  return `<div class="pozycja-kuchni"><a class="cichy-link" href="#przepis/${encodeURIComponent(x.id)}"><span>${esc(krotkaNazwa(p.nazwa, 60))}</span><span class="ciemny maly">${opis}</span></a>
    ${brak ? `<button type="button" class="link" data-akcja="dopisz" data-id="${brak}" data-od="${stan.od}">dopisz do zakupów</button>` : ""}</div>`;
}

function grupa(tytul, tresc) {
  return tresc ? `<div class="grupa-kuchni"><h2 class="ciemny maly">${tytul}</h2>${tresc}</div>` : "";
}

function daniePlanu(app, id, etykieta, opis) {
  const p = przepisy()[id];
  return `<span class="wyciszony maly">${etykieta}</span><h1>${esc(p.nazwa)}</h1>
    <span class="wyciszony">${opis} · ok. ${p.czas_min} min</span>
    <div class="przyciski"><a class="link" href="#przepis/${encodeURIComponent(id)}">przepis</a></div>`;
}

function panelBlat(app, pod, dzisiaj, maPorcje) {
  const g = godzinyPosilkow(app.dane.profil);
  const teraz = new Date();
  const m = teraz.getHours() * 60 + teraz.getMinutes();
  const jutroSn = pod.pora.jutro || m >= minuty(g.przekaska) - 30;
  const dataSn = jutroSn ? dodaj(dzisiaj, 1) : dzisiaj;
  const sn = zPlanuNaDzien(app.dane, "sniadanie", dataSn);
  const stan = coMasz(app.dane, dataSn);
  const dopisane = app.dane.dopisane_produkty?.[stan.od] ?? [];
  const lista = (xs) => xs.map((x) => propozycja(x, stan, dopisane)).join("");
  const bezGotowania = pod.bezGotowania && !maPorcje;
  const czesci = [];
  if (bezGotowania) {
    const stanDzis = coMasz(app.dane, dzisiaj);
    const prop = propozycje(stanDzis, { bezGotowania: true, ile: 4 });
    const [pierwsza, ...reszta] = prop;
    if (pierwsza) {
      czesci.push(`<section class="karteczka">${daniePlanu(app, pierwsza.id, "Bez gotowania", pierwsza.brakuje.length ? `brakuje: ${krotkiProdukt(stanDzis.ctx.produkty[pierwsza.brakuje[0]].nazwa)}` : "masz wszystko")}</section>`);
      czesci.push(grupa("Albo", reszta.map((x) => propozycja(x, stanDzis, app.dane.dopisane_produkty?.[stanDzis.od] ?? [])).join("")));
    } else {
      czesci.push(`<section class="karteczka"><span class="wyciszony maly">Bez gotowania</span><h1>Kanapki albo coś z zamrażarki</h1></section>`);
    }
    czesci.push(grupa("Jutro na śniadanie", sn ? `<a class="cichy-link" href="#przepis/${encodeURIComponent(sn)}">${esc(przepisy()[sn].nazwa)}</a>` : ""));
  } else {
    const etykieta = jutroSn ? "Jutro na śniadanie" : "Na śniadanie";
    czesci.push(`<section class="karteczka">${sn ? daniePlanu(app, sn, etykieta, "z planu")
      : `<span class="wyciszony maly">${etykieta}</span><h1>Śniadanie spoza planu</h1><span class="wyciszony">Coś z tego, co masz — poniżej.</span>`}</section>`);
    czesci.push(grupa("Z tego, co masz, zrobisz też", lista(propozycje(stan, { posilek: "sniadanie", pomin: sn ? [sn] : [] }))));
  }
  const owoce = naBlacie(stan);
  czesci.push(grupa("Na blacie", owoce.length ? `<p class="wyciszony">${esc(owoce.join(", "))}</p>` : ""));
  const spizarnia = wSpizarni(app.dane, stan);
  czesci.push(grupa("W spiżarni", spizarnia.length ? `<p class="wyciszony">${esc(spizarnia.slice(0, 8).join(", "))}${spizarnia.length > 8 ? ` i ${spizarnia.length - 8} innych` : ""}</p>` : ""));
  return czesci.join("");
}

function panelPlecak(app, pod, dzisiaj, plan) {
  const g = godzinyPosilkow(app.dane.profil);
  const teraz = new Date();
  const m = teraz.getHours() * 60 + teraz.getMinutes();
  const jutro = pod.pora.jutro || m >= minuty(g.obiad) - 30;
  const data = jutro ? dodaj(dzisiaj, 1) : dzisiaj;
  const prz = zPlanuNaDzien(app.dane, "przekaska", data);
  const stan = coMasz(app.dane, data);
  const dopisane = app.dane.dopisane_produkty?.[stan.od] ?? [];
  const etykieta = jutro ? "Jutro na przekąskę" : pod.pora.posilek === "przekaska" && !pod.pora.przed ? "Na przekąskę" : `Na przekąskę o ${g.przekaska.replace(/^0/, "")}`;
  const czesci = [`<section class="karteczka">${prz ? daniePlanu(app, prz, etykieta, "z planu")
    : `<span class="wyciszony maly">${etykieta}</span><h1>Przekąska spoza planu</h1><span class="wyciszony">Coś z tego, co masz — poniżej.</span>`}</section>`];
  czesci.push(grupa("Albo, z tego, co masz", propozycje(stan, { posilek: "przekaska", pomin: prz ? [prz] : [] }).map((x) => propozycja(x, stan, dopisane)).join("")));
  if (plan) {
    const mj = zPlanu(plan);
    const d = roznica(dzisiaj, plan.od);
    const { wyjazd } = app.dane.profil;
    const droga = stanDnia(mj, d) === "wieczor" ? `Dziś wieczorem jedziesz: ${esc(wyjazd)}. Weź przekąskę na drogę.`
      : stanDnia(mj, d) === "dom" && stanDnia(mj, d + 1) === "caly" ? `Jutro jedziesz: ${esc(wyjazd)}. Spakuj przekąskę na drogę.` : "";
    czesci.push(grupa("Na drogę", droga ? `<p class="wyciszony">${droga}</p>` : ""));
  }
  return czesci.join("");
}

function panelLodowka(app, d) {
  const { dzisiaj, plan, wZamrazarce, rozmrazane, doJedzenia, zjedzone, naKarteczce, pierwsze } = d;
  const bez = plan ? [...new Set(plan.grupy.filter((g) => ["kolacja", "szybki"].includes(g.rodzaj) && g.przepis).map((g) => g.przepis))] : [];
  const polki = [...doJedzenia, ...rozmrazane].filter((x) => x !== naKarteczce).map((x) => `<button type="button" class="polka" data-akcja="naKarteczke" data-id="${x.id}" aria-label="${esc(nazwa(x))}, ${porcjeTxt(x.porcje)}">
      <span class="polka-nazwa">${esc(nazwa(x))}</span>
      <span class="polka-opis">${kafle(x.porcje, rozmrazaSie(x, dzisiaj) ? "roz" : "")}<span>${rozmrazaSie(x, dzisiaj) ? "rozmraża się, na jutro" : doKiedy(x.dobre_do, dzisiaj).replace("dobre ", "")}</span></span>
    </button><span class="deska" aria-hidden="true"></span>`).join("");
  return `<section class="karteczka" aria-label="Karteczka">${karteczka(app, naKarteczce, dzisiaj, pierwsze, wZamrazarce.length, plan)}</section>
    ${grupa("Na półkach", polki)}
    ${grupa("Zamrażarka", wZamrazarce.map((x) => `<div class="rozsun polka-zam">
        <span class="polka-tekst"><span>${esc(nazwa(x))}</span>${kafle(x.porcje, "zam")}</span>
        <button type="button" class="link" data-akcja="przeloz" data-id="${x.id}">na jutro</button></div>`).join(""))}
    ${bez.length ? `<div class="szuflada"><span class="ciemny maly">Szuflada · bez gotowania</span>
      ${bez.map((i) => `<a class="cichy-link" href="#przepis/${encodeURIComponent(i)}">${esc(przepisy()[i]?.nazwa ?? i)}</a>`).join("")}</div>` : ""}
    ${zjedzone.length ? `<p class="ciemny maly">Zjedzone: ${zjedzone.map((x) => esc(nazwa(x))).join(", ")}</p>` : ""}`;
}

export function rysuj(app) {
  const dzisiaj = dzis();
  const od = tenTydzien(dzisiaj);
  const plan = app.dane.tygodnie[od];
  const wLodowce = lodowka(app.dane);
  const wZamrazarce = zamrazarka(app.dane);
  const dostepne = wLodowce.filter((x) => x.porcje > 0);
  // Kolejność jak w lodówce: najkrótszy termin na górze. Rozmrażane dziś są gotowe dopiero jutro.
  const rozmrazane = dostepne.filter((x) => rozmrazaSie(x, dzisiaj));
  const doJedzenia = dostepne.filter((x) => !rozmrazane.includes(x));
  const zjedzone = wLodowce.filter((x) => !x.porcje);
  const pierwsze = doJedzenia[0];
  const naKarteczce = dostepne.find((x) => x.id === wybrane) ?? pierwsze ?? null;

  const pod = podpowiedz(app.dane.profil, doJedzenia.length > 0);
  // Gdy zmieni się pora dnia, ekran wraca do podpowiadanego miejsca.
  const klucz = `${pod.miejsce}|${pod.powod}`;
  if (ostatniaPodpowiedz && ostatniaPodpowiedz !== klucz) miejsce = null;
  ostatniaPodpowiedz = klucz;
  const wyb = miejsce ?? pod.miejsce;

  const panel = wyb === "lod"
    ? panelLodowka(app, { dzisiaj, plan, wZamrazarce, rozmrazane, doJedzenia, zjedzone, naKarteczce, pierwsze })
    : wyb === "blat" ? panelBlat(app, pod, dzisiaj, doJedzenia.length > 0) : panelPlecak(app, pod, dzisiaj, plan);

  return `<p class="ciemny maly">${esc(nazwaDnia(dzisiaj).replace(/^./, (z) => z.toUpperCase()))}, ${dataSlownie(dzisiaj)}${wyjazdTekst(app, plan, dzisiaj)}</p>
    ${rysunekKuchni(wyb, pod.miejsce)}
    <section class="panel-kuchni" aria-label="${MIEJSCA[wyb]}">
      <p class="ciemny maly">${MIEJSCA[wyb]}${wyb === pod.miejsce ? ` · ${esc(pod.powod.replace(/^./, (z) => z.toLowerCase()))}` : ""}</p>
      ${panel}
    </section>
    <div class="rzad">
      <button type="button" class="link" data-akcja="goscie">Goście</button>
      <button type="button" class="link" data-akcja="plany">Zmieniam plany</button>
    </div>`;
}

// Co minutę (i po powrocie do planera) sprawdź, czy nie zmieniła się pora dnia — wtedy przerysuj.
export function poNarysowaniu(app) {
  if (zegar) return;
  const sprawdz = () => {
    if (app.ekran !== "lodowka" || document.visibilityState !== "visible" || !document.getElementById("arkusz").hidden) return;
    const pelne = lodowka(app.dane).some((x) => x.porcje > 0 && !rozmrazaSie(x, dzis()));
    const p = podpowiedz(app.dane.profil, pelne);
    if (`${p.miejsce}|${p.powod}` !== ostatniaPodpowiedz) app.odswiez();
  };
  zegar = setInterval(sprawdz, 60000);
  document.addEventListener("visibilitychange", sprawdz);
}

export function poOpuszczeniu() {
  miejsce = null;
  wybrane = null;
}

// „Cofnij” po ostatnio zjedzonej porcji — cichy napis obok głównego przycisku.
function ostatnioCofnij(app) {
  const x = app.dane.lodowka.find((y) => y.id === ostatnio);
  return x && x.porcje < x.start ? `<button type="button" class="link" data-akcja="cofnij" data-id="${x.id}" aria-label="Cofnij zjedzenie porcji: ${esc(nazwa(x))}">cofnij ${esc(nazwa(x).toLowerCase())}</button>` : "";
}

function arkuszDania(app, id) {
  const x = app.dane.lodowka.find((y) => y.id === id);
  if (!x) return;
  pokazArkusz(`<h1>${esc(nazwa(x))}</h1>
    <p class="wyciszony">${doKiedy(x.dobre_do, dzis())} · ${porcjeTxt(x.porcje)}</p>
    <button type="button" class="przycisk glowny szeroki" data-akcja="zjedz" data-id="${x.id}">Zjadłem porcję</button>
    <div class="rzad">${x.mrozi && !x.z_zamrazarki ? `<button type="button" class="link" data-akcja="zamroz" data-id="${x.id}">zamroź wszystkie</button>` : ""}
      <a class="link" href="#przepis/${encodeURIComponent(x.przepis)}">przepis</a>
      <button type="button" class="link" data-akcja="zamknij">zamknij</button></div>`);
}

// --- Goście ---

function arkuszGosci(app) {
  const dostepne = app.dane.lodowka.filter((x) => x.porcje > 0).reduce((s, x) => s + x.porcje, 0);
  const potrzeba = arkusz.osoby * arkusz.dni * 2;
  const brakuje = Math.max(0, potrzeba - dostepne);
  const wybor = (pole, wartosci, opis) => `<div class="rzad" role="group" aria-label="${opis}">${wartosci.map((n) => `
    <button type="button" class="przycisk${arkusz[pole] === n ? " glowny" : ""}" aria-pressed="${arkusz[pole] === n}" data-akcja="ustawGosci" data-pole="${pole}" data-wartosc="${n}" style="min-width:56px">${pole === "dni" ? odmiana(n, "dzień", "dni", "dni") : n}</button>`).join("")}</div>`;
  const szybkie = Object.values(przepisy())
    .filter((p) => !p.wycofany && p.bez_garnkow && p.posilek.includes("kolacja"))
    .slice(0, 3);
  pokazArkusz(`
    <h1>Goście</h1>
    <p class="wyciszony">Ile osób je z Tobą (razem z Tobą)?</p>${wybor("osoby", [2, 3, 4], "Liczba osób")}
    <p class="wyciszony">Na ile dni?</p>${wybor("dni", [1, 2, 3], "Liczba dni")}
    <p style="font-size:19px;font-weight:700">${brakuje === 0
      ? `Wystarczy tego, co masz: ${porcjeTxt(dostepne)} w lodówce i zamrażarce.`
      : `Na obiady i kolacje brakuje ok. ${porcjeTxt(brakuje)}. Masz ${porcjeTxt(dostepne)}.`}</p>
    ${brakuje ? `<p class="wyciszony maly">Szybkie dania bez gotowania, na które łatwo dokupić składniki:</p>
      <p class="wyciszony maly">W przepisie możesz dopisać składniki do listy zakupów.</p>
      <div class="lista">${szybkie.map((p) => `<a class="link" href="#przepis/${encodeURIComponent(p.id)}/${arkusz.osoby}">${esc(p.nazwa)}</a>`).join("")}</div>` : ""}
    <button type="button" class="link" data-akcja="zamknij">zamknij</button>`);
}

// --- Zmiana planów: dni wyjazdu w tym tygodniu ---

function arkuszPlanow(app) {
  const dzisiaj = dzis();
  const od = tenTydzien(dzisiaj);
  const plan = app.dane.tygodnie[od];
  const { dom, wyjazd } = app.dane.profil;
  if (!plan) {
    pokazArkusz(`<h1>Zmieniam plany</h1><p class="wyciszony">Ten tydzień nie ma jeszcze planu. Dni wyjazdu zaznaczysz przy układaniu tygodnia.</p>
      <a class="przycisk glowny szeroki" href="#tydzien">Przejdź do tygodnia</a>`);
    return;
  }
  const dzisIdx = roznica(dzisiaj, od);
  const m = zPlanu(plan);
  const ileWDomu = (d) => ({ dom: 2, wieczor: 1, rano: 1, caly: 0 })[stanDnia(m, d)];
  const dni = [...Array(8).keys()].filter((d) => d >= Math.max(1, dzisIdx));
  const posilkiWDomu = dni.reduce((suma, d) => suma + ileWDomu(d), 0);
  const dostepne = app.dane.lodowka.filter((x) => x.porcje > 0).reduce((s, x) => s + x.porcje, 0);
  // Przed wyjazdem: co zostanie w lodówce i zepsuje się, zanim wrócisz? Zakładamy, że do wyjazdu
  // jesz najpierw to, co ma najkrótszy termin (dziś zostaje jeszcze kolacja).
  const wyjazdOd = [...Array(8).keys()].find((d) => d > dzisIdx && ["caly", "wieczor"].includes(stanDnia(m, d)));
  const zepsujaSie = [];
  if (wyjazdOd !== undefined) {
    const powrot = [...Array(8).keys()].find((d) => d > wyjazdOd && ["dom", "rano"].includes(stanDnia(m, d))) ?? 8;
    let posilki = 1 + [...Array(8).keys()].filter((d) => d > dzisIdx && d < wyjazdOd).reduce((suma, d) => suma + ileWDomu(d), 0)
      + (stanDnia(m, wyjazdOd) === "wieczor" ? 1 : 0);
    for (const x of lodowka(app.dane).filter((y) => y.porcje > 0)) {
      const zjesz = Math.min(x.porcje, Math.max(0, posilki));
      posilki -= zjesz;
      const zostanie = x.porcje - zjesz;
      if (zostanie > 0 && x.mrozi && !x.z_zamrazarki && roznica(x.dobre_do, dodaj(od, powrot)) < 0) zepsujaSie.push({ x, zostanie });
    }
  }
  pokazArkusz(`
    <h1>Zmieniam plany</h1>
    <p class="wyciszony">Stukaj dzień, żeby zmienić miejsce: ${esc(dom)} albo ${esc(wyjazd)}, także na pół dnia (górny napis to rano, dolny wieczór).</p>
    <div class="dni">${dni.map((d) => kafelDnia(d, dodaj(od, d), stanDnia(m, d), dom, wyjazd, "przelaczDzien")).join("")}</div>
    <p style="font-size:18px;font-weight:700">${posilkiWDomu > dostepne
      ? `W domu zjesz jeszcze ok. ${odmiana(posilkiWDomu, "obiad lub kolację", "obiady i kolacje", "obiadów i kolacji")}, a masz ${porcjeTxt(dostepne)}. Brakujące uzupełnisz kolacjami bez gotowania.`
      : `Masz ${porcjeTxt(dostepne)} na ${odmiana(posilkiWDomu, "posiłek", "posiłki", "posiłków")} w domu. Wystarczy.`}</p>
    ${zepsujaSie.length ? `<p class="wyciszony">Przed wyjazdem warto zamrozić:</p>
      <div class="lista">${zepsujaSie.map(({ x, zostanie }) => `<button type="button" class="wiersz" data-akcja="zamroz" data-id="${x.id}" data-ile="${zostanie}">Zamroź: ${esc(nazwa(x))} (${porcjeTxt(zostanie)})</button>`).join("")}</div>
      <p class="wyciszony maly">Resztę zjesz przed wyjazdem.</p>` : ""}
    <button type="button" class="przycisk szeroki" data-akcja="zamknij">Gotowe</button>`);
}

export const akcje = {
  miejsce(app, cel) {
    const pod = ostatniaPodpowiedz.split("|")[0];
    miejsce = cel.dataset.co === pod ? null : cel.dataset.co;
    app.odswiez();
  },
  naKarteczke(app, cel) {
    wybrane = cel.dataset.id;
    app.odswiez();
  },
  dopisz(app, cel) {
    dopiszProdukt(app.dane, cel.dataset.od, cel.dataset.id);
    app.zapisz();
    app.odswiez();
    powiadom("Dopisane do listy zakupów.");
  },
  danie(app, cel) {
    arkuszDania(app, cel.dataset.id);
  },
  zjedz(app, cel) {
    zjedz(app.dane, cel.dataset.id);
    ostatnio = cel.dataset.id;
    wybrane = null;
    zamknijArkusz();
    app.zapisz();
    app.odswiez();
  },
  cofnij(app, cel) {
    cofnijZjedzenie(app.dane, cel.dataset.id);
    app.zapisz();
    app.odswiez();
  },
  przeloz(app, cel) {
    przelozDoLodowki(app.dane, cel.dataset.id);
    app.zapisz();
    app.odswiez();
    powiadom("Przełożone. Jutro będzie rozmrożone.");
  },
  cofnijPrzelozenie(app, cel) {
    cofnijPrzelozenie(app.dane, cel.dataset.id);
    app.zapisz();
    app.odswiez();
  },
  zamroz(app, cel) {
    zamroz(app.dane, cel.dataset.id, cel.dataset.ile ? Number(cel.dataset.ile) : null);
    app.zapisz();
    zamknijArkusz();
    app.odswiez();
    powiadom("Porcje przeniesione do zamrażarki.");
  },
  juzUgotowane(app) {
    // Ugotowane w poniedziałek tego tygodnia: terminy liczone od poniedziałku.
    wlozDoLodowki(app.dane, tenTydzien(), tenTydzien());
    app.zapisz();
    app.odswiez();
  },
  goscie(app) {
    arkuszGosci(app);
  },
  ustawGosci(app, cel) {
    arkusz[cel.dataset.pole] = Number(cel.dataset.wartosc);
    arkuszGosci(app);
  },
  plany(app) {
    arkuszPlanow(app);
  },
  przelaczDzien(app, cel) {
    const plan = app.dane.tygodnie[tenTydzien()];
    const nowe = przelacz(zPlanu(plan), Number(cel.dataset.dzien));
    plan.poza_domem = nowe.dni;
    if (Object.keys(nowe.pol).length) plan.poza_pol = nowe.pol;
    else delete plan.poza_pol;
    app.zapisz();
    arkuszPlanow(app);
    app.odswiez();
  },
};
