// Gotowanie: kroki kilku dań na jednej osi czasu, z minutnikami i ekranem, który nie gaśnie.
// Plan przelicza się na bieżąco: gdy coś zajmie dłużej albo krócej, reszta przesuwa się sama.
import { slotyJedzone } from "../../silnik/generator.js";
import { etykietaKroku, koniecPlanu, krokiDania, uloz } from "../harmonogram.js";
import { przepisy, tenTydzien, wlozDoLodowki } from "../stan.js";
import { esc, kopiujTekst, krotkaNazwa, odmiana, pokazArkusz, powiadom, zamknijArkusz } from "../narzedzia.js";
import { adresZaproszenia, czytajKod, godzina, ileOsob, kodZaproszenia, MAKS_OSOB, NAZWY_OSOB, planOsoby, podzielDania } from "../razem.js";

let zegar = null;
let blokada = null;
let audio = null;
const zadzwonione = new Set();

const minutaTeraz = (sesja) => (Date.now() - sesja.start) / 60000;

function daniaPlanu(app) {
  const plan = app.dane.tygodnie[tenTydzien()];
  if (!plan) return [];
  return plan.grupy.filter((g) => g.rodzaj === "partia" && g.przepis && slotyJedzone(g).length).map((g) => g.przepis);
}

function przygotuj(ids) {
  const p = przepisy();
  return ids.map((id) => ({ id, nazwa: krotkaNazwa(p[id].nazwa), kroki: krokiDania(p[id]) }));
}

// Pozostałe kroki ułożone od teraz; kroki w trakcie i zrobione — z sesji.
function plan(sesja) {
  const dania = przygotuj(sesja.dania);
  // Po ostatnim kroku czas się zatrzymuje — oś zostaje taka, jak było naprawdę.
  const m = sesja.start ? (sesja.koniecMin ?? minutaTeraz(sesja)) : 0;
  const wTrakcie = sesja.wTrakcie ?? [];
  const zajetyDo = Math.max(m, ...wTrakcie.filter((b) => b.aktywny).map((b) => b.koniec));
  const przyszle = uloz(dania.map((d, k) => ({
    ...d,
    nastepny: sesja.postep[k].nastepny,
    wolneOd: Math.max(m, sesja.postep[k].wolneOd, ...wTrakcie.filter((b) => b.danie === k).map((b) => b.koniec)),
    ostatniStart: sesja.postep[k].ostatniStart,
  })), m, zajetyDo);
  return { dania, m, przyszle, wTrakcie, zrobione: sesja.zrobione ?? [] };
}

const mmss = (min) => {
  const s = Math.max(0, Math.round(min * 60));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// --- Widok: oś czasu (pionowa przy telefonie pionowo, pozioma po obróceniu) i karta „Teraz” ---
// Zasady wyglądu: świeci tylko kafelek kroku z karty; reszta szara. Kafelek mówi „kiedy i jak długo”
// (2 słowa), pełny krok, minutnik i przyciski są w karcie. Równoległe kroki jednego dania stoją obok
// siebie: szeroki pas z napisem dla kroku „przy garnku”, wąski bez napisu dla kroku, który robi się sam.

let wybrany = null; // klucz „danie-krok” kafelka stukniętego przez Ciebie (podgląd w karcie)
const POZIOMO = "(orientation: landscape) and (max-height: 520px)";
const poziomo = () => window.matchMedia?.(POZIOMO).matches ?? false;
const klucz = (b) => `${b.danie}-${b.krok}`;

// Wszystkie kafelki z sesji: zrobione, w trakcie i zaplanowane.
function wszystkieBloki(dania, m, przyszle, wTrakcie, zrobione) {
  return [
    ...zrobione.map((b) => ({ ...b, stan: "zrobiony" })),
    ...wTrakcie.map((b, i) => ({ ...b, stan: "trwa", i })),
    ...przyszle.map((b) => ({ ...b, stan: "plan", zCzasem: dania[b.danie].kroki[b.krok].zCzasem })),
  ].map((b) => ({ ...b, etykieta: etykietaKroku(b.tekst) }));
}

function uklad(bloki) {
  const nachodzi = (b, c) => c !== b && c.danie === b.danie && c.start < b.koniec && b.start < c.koniec;
  return bloki.map((b) => {
    const rownolegly = bloki.some((c) => nachodzi(b, c));
    const glowny = !rownolegly || b.aktywny || !bloki.some((c) => nachodzi(b, c) && c.aktywny);
    return { ...b, rownolegly, glowny };
  });
}

function klasyKafla(b, pokazany) {
  const swieci = pokazany && klucz(b) === klucz(pokazany) && b.stan !== "zrobiony";
  return `kafel ${b.aktywny ? "aktywny" : "bierny"}${b.stan === "zrobiony" ? " zrobiony" : swieci ? (wybrany ? " wybrany" : " swieci") : ""}`;
}

function etykietaKafla(b, m, miejsce) {
  if (b.stan === "zrobiony" || !b.glowny || miejsce < 44) return "";
  const czas = b.stan === "trwa" && miejsce >= 100 && (b.zCzasem || !b.aktywny) ? `<span class="czas">${Math.max(0, Math.ceil(b.koniec - m))}'</span>` : "";
  return `<span>${esc(b.etykieta)}</span>${czas}`;
}

// Oś pokazuje całe gotowanie; widać 50 minut naraz, resztę przewijasz palcem.
// Sama ustawia się tak, żeby „teraz” było blisko góry (10 minut wstecz), chyba że przed chwilą przewijałeś.
const OKNO_H = 340;
const PX = OKNO_H / 50;
const OD = -2;
function zakresOsi(bloki, m) {
  return Math.max(OD + 50, Math.max(m, 0) + 40, koniecPlanu(bloki) + 4);
}
function przewijana(m, wysokosc, srodek) {
  const cel = Math.max(0, (Math.max(m, OD) - OD - 10) * PX);
  return `<div class="got-przewijana" style="height:${OKNO_H}px" data-cel="${cel.toFixed(0)}">${srodek.replace("__WYS__", `${wysokosc.toFixed(0)}px`)}</div>`;
}

function osPionowa(dania, bloki, m, pokazany) {
  const od = OD;
  const px = PX;
  const H = (zakresOsi(bloki, m) - od) * px;
  const y = (t) => (t - od) * px;
  const n = dania.length;
  const kol = `((100% - 34px - ${(n - 1) * 6}px) / ${n})`;
  const kafle = bloki.map((b) => {
    const wys = (b.koniec - b.start) * px - 3;
    const ulamek = !b.rownolegly ? [0, 1] : b.glowny ? [0, 0.7] : [0.7, 0.3];
    const lewo = `calc(34px + ${b.danie} * (${kol} + 6px) + ${ulamek[0]} * ${kol} + ${ulamek[0] ? 3 : 0}px)`;
    const szer = `calc(${ulamek[1]} * ${kol} - ${b.rownolegly ? 3 : 0}px)`;
    return `<button type="button" class="${klasyKafla(b, pokazany)}" data-akcja="wybierz" data-klucz="${klucz(b)}" aria-label="${esc(dania[b.danie].nazwa)}: ${esc(b.etykieta)}"
      style="top:${y(b.start).toFixed(1)}px;height:${wys.toFixed(1)}px;left:${lewo};width:${szer}">${wys >= 26 ? etykietaKafla(b, m, !b.glowny ? 0 : wys >= 56 ? 100 : 60) : ""}</button>`;
  });
  const podzialka = [];
  for (let t = 0; t <= od + H / px; t += 10) podzialka.push(`<span class="got-podzialka" style="left:0;top:${(y(t) - 7).toFixed(1)}px">${t}'</span>`);
  return `<div class="got-kolumny" style="grid-template-columns:34px repeat(${n},minmax(0,1fr))"><span></span>${dania.map((d) => `<span>${esc(d.nazwa)}</span>`).join("")}</div>
    ${przewijana(m, H, `<div class="got-os got-pion" style="height:__WYS__" aria-label="Oś czasu">${podzialka.join("")}${kafle.join("")}
      <span class="teraz-linia" style="left:30px;right:0;height:2px;top:${(y(m) - 1).toFixed(1)}px"></span></div>`)}`;
}

// Telefon poziomo: tory dań jeden pod drugim, czas płynie w prawo. Też całe gotowanie, przewijane palcem w bok;
// samo ustawia „teraz” blisko lewej krawędzi (8 minut wstecz), chyba że przed chwilą przewijałeś.
const PX_POZIOMO = 9; // ok. 9 px na minutę
function osPozioma(dania, bloki, m, pokazany) {
  const od = OD;
  const W = (zakresOsi(bloki, m) - od) * PX_POZIOMO;
  const x = (t) => (t - od) * PX_POZIOMO;
  const tory = dania.map((d, k) => {
    const kafle = bloki.filter((b) => b.danie === k).map((b) => {
      const top = b.rownolegly && !b.glowny ? 42 : 2;
      const wys = !b.rownolegly ? 52 : b.glowny ? 36 : 12;
      const miejsce = (b.koniec - b.start) * PX_POZIOMO;
      return `<button type="button" class="${klasyKafla(b, pokazany)}" data-akcja="wybierz" data-klucz="${klucz(b)}" aria-label="${esc(d.nazwa)}: ${esc(b.etykieta)}"
        style="left:${x(b.start).toFixed(1)}px;width:${(miejsce - 4).toFixed(1)}px;top:${top}px;height:${wys}px">${etykietaKafla(b, m, miejsce)}</button>`;
    });
    return `<div class="sekcja" style="gap:4px"><span class="wyciszony maly got-tor-nazwa">${esc(d.nazwa)}</span><div class="got-os" style="height:56px">${kafle.join("")}</div></div>`;
  });
  const podzialka = [];
  for (let t = 0; t <= od + W / PX_POZIOMO; t += 10) podzialka.push(`<span class="got-podzialka" style="top:0;left:${x(t).toFixed(1)}px">${t ? `${t}'` : "start"}</span>`);
  const cel = Math.max(0, (Math.max(m, od) - od - 8) * PX_POZIOMO);
  return `<div class="got-przewijana got-przewijana-x" data-os="x" data-cel="${cel.toFixed(0)}">
    <div class="got-os got-poziom" style="overflow:visible;width:${W.toFixed(0)}px">
      <div style="position:relative;height:14px">${podzialka.join("")}</div>
      <div class="sekcja" style="gap:10px">${tory.join("")}</div>
      <span class="teraz-linia" style="top:2px;bottom:0;width:2px;left:${x(m).toFixed(1)}px"></span></div></div>`;
}

// Co pokazuje karta: stuknięty kafelek, a bez wyboru — krok przy garnku w trakcie, potem krok „samo się robi”,
// potem następny krok do zaczęcia.
function coPokazac(bloki, sesja, dania, m) {
  const wybranyBlok = wybrany && bloki.find((b) => klucz(b) === wybrany);
  if (wybranyBlok) return wybranyBlok;
  if (wybrany) wybrany = null;
  const trwa = bloki.filter((b) => b.stan === "trwa");
  const nastepne = doZaczecia(bloki, sesja, dania).sort((x, y) => x.start - y.start);
  const terazDoZaczecia = nastepne.find((b) => b.start <= m + 0.5);
  // Gdy coś „samo się robi”, a ręce są wolne — karta podpowiada, co zacząć.
  return trwa.find((b) => b.aktywny) ?? terazDoZaczecia ?? trwa[0] ?? nastepne[0] ?? null;
}

function doZaczecia(bloki, sesja, dania) {
  const zajete = (k) => bloki.some((b) => b.stan === "trwa" && b.danie === k);
  return bloki.filter((b) => b.stan === "plan" && b.krok === sesja.postep[b.danie].nastepny && (!zajete(b.danie) || dania[b.danie].kroki[b.krok].rownolegly));
}

let notatki = {}; // Twoje notatki do przepisów — krótko w karcie „Teraz”
function notatkaKarty(b, dania) {
  const t = notatki[dania[b.danie].id];
  return t ? `<p class="notatka-karty"><span class="ciemny">Twoja notatka:</span> ${esc(t)}</p>` : "";
}

function karta(b, sesja, dania, bloki, m) {
  const nazwa = esc(dania[b.danie].nazwa);
  const tlo = bloki.filter((x) => x.stan === "trwa" && klucz(x) !== klucz(b));
  const wTle = tlo.length && !wybrany ? `<div>${tlo.map((x) => `<button type="button" class="link" data-akcja="wybierz" data-klucz="${klucz(x)}">w tle: ${esc(dania[x.danie].nazwa.toLowerCase())}, ${esc(x.etykieta)} · ${Math.max(0, Math.ceil(x.koniec - m))} min</button>`).join("")}</div>` : "";
  const wroc = wybrany ? `<button type="button" class="link" data-akcja="terazWroc">wróć do teraz</button>` : "";
  if (b.stan === "trwa") {
    const zostalo = b.koniec - m;
    const zMinutnikiem = b.zCzasem || !b.aktywny;
    return `<p class="co">${nazwa} · ${zostalo <= 0 && zMinutnikiem ? "czas minął — sprawdź" : b.aktywny ? "przy garnku" : "samo się robi"}</p>
      <p class="krok-tekst">${esc(b.tekst)}</p>${notatkaKarty(b, dania)}
      ${zMinutnikiem ? `<p class="minutnik" aria-live="off">${mmss(zostalo)}</p>` : ""}
      <div class="rzad"><button type="button" class="przycisk glowny" data-akcja="zrobione" data-i="${b.i}">Zrobione</button>
        ${zMinutnikiem ? `<button type="button" class="link" data-akcja="minuta" data-i="${b.i}">+1 min</button>` : ""}${wroc}</div>${wTle}`;
  }
  if (b.stan === "plan") {
    const mozna = doZaczecia(bloki, sesja, dania).some((x) => klucz(x) === klucz(b));
    const kiedy = b.start <= m + 0.5 ? "teraz" : `za ${Math.ceil(b.start - m)} min`;
    return `<p class="co">${nazwa} · ${mozna ? kiedy : "po poprzednim kroku"} · ${b.aktywny ? "przy garnku" : "samo się robi"}, ok. ${b.min} min</p>
      <p class="krok-tekst">${esc(b.tekst)}</p>${notatkaKarty(b, dania)}
      <div class="rzad">${mozna ? `<button type="button" class="przycisk glowny" data-akcja="startKroku" data-danie="${b.danie}">Zaczynam ten krok</button>` : ""}${wroc}</div>${wTle}`;
  }
  return `<p class="co">${nazwa} · zrobione</p><p class="krok-tekst">${esc(b.tekst)}</p><div class="rzad">${wroc}</div>`;
}

export function rysuj(app) {
  if (app.argument?.startsWith("razem/")) {
    const kod = app.argument.slice(6);
    const sesja = app.dane.gotowanie;
    if (!(sesja?.start && sesja.razem?.kod === kod)) return rysujDolaczenie(app, kod);
  }
  if (app.argument?.startsWith("przepis/") && !app.dane.gotowanie?.start) {
    const id = decodeURIComponent(app.argument.slice(8));
    if (przepisy()[id]) return rysujStart(app, [id]);
  }
  const sesja = app.dane.gotowanie;
  if (!sesja?.start) return rysujStart(app, daniaPlanu(app));
  return rysujGotowanie(app, sesja);
}

function uloz2(os, kartaHtml) {
  document.body.classList.toggle("gotowanie-poziomo", poziomo());
  return poziomo()
    ? `<div class="got-poziomo"><div class="got">${os}</div><section class="got-karta">${kartaHtml}</section></div>`
    : `<div class="got">${os}<section class="got-karta">${kartaHtml}</section></div>`;
}

function rysujStart(app, ids) {
  document.body.classList.remove("gotowanie-poziomo");
  if (!ids.length) {
    return `<div class="najpierw"><h1>Nie ma planu na ten tydzień</h1>
      <span class="wyciszony">Ułóż tydzień, a tutaj zobaczysz plan poniedziałkowego gotowania krok po kroku. Pojedynczy przepis ugotujesz z listy przepisów.</span>
      <div class="przyciski"><a class="przycisk glowny" href="#tydzien">Ułóż tydzień</a><a class="link" href="#wiecej/przepisy">przepisy</a></div></div>`;
  }
  if (zaproszenie && ids.length > 1) return rysujZaproszenie(app, ids);
  const dania = przygotuj(ids);
  const plan0 = uloz(dania);
  const razem = Math.round(koniecPlanu(plan0));
  const bloki = uklad(wszystkieBloki(dania, 0, plan0, [], []));
  const pierwszy = bloki.find((b) => b.start === 0) ?? bloki[0];
  const gora = `<div class="got-gora"><b>Ok. ${odmiana(razem, "minuta", "minuty", "minut")}</b><span class="wyciszony maly">${ids.length > 1 ? "dania gotują się równolegle" : "jeden przepis"}</span></div>`;
  const kartaHtml = `<p class="co">Na start · ${esc(dania[pierwszy.danie].nazwa)}</p><p class="krok-tekst">${esc(pierwszy.tekst)}</p>
    <div class="rzad"><button type="button" class="przycisk glowny" data-akcja="zacznij" data-dania="${ids.join(",")}">Zaczynam</button></div>
    <p class="ciemny maly">Ekran nie zgaśnie, dopóki gotujesz. Minutnik zadzwoni, gdy planer jest na ekranie.</p>
    ${ids.length > 1 ? `<button type="button" class="link" data-akcja="razemOtworz">gotujemy razem — podziel dania między osoby</button>` : ""}`;
  const os = gora + (poziomo() ? osPozioma(dania, bloki, 0, pierwszy) : osPionowa(dania, bloki, 0, pierwszy));
  return uloz2(os, kartaHtml);
}

function rysujGotowanie(app, sesja) {
  notatki = app.dane.notatki ?? {};
  const { dania, m, przyszle, wTrakcie, zrobione } = plan(sesja);
  const bloki = uklad(wszystkieBloki(dania, m, przyszle, wTrakcie, zrobione));
  const koniec = Math.max(m, koniecPlanu(bloki));
  const z = sesja.razem;
  const koniecWszystkich = z ? Math.max(koniec, ...z.grupy.map((g, k) => (k === z.ja ? 0 : planOsoby(g).koniec))) : koniec;
  let gora = sesja.koniecMin != null
    ? `<div class="got-gora"><b>${z ? "Twoja część gotowa" : "Gotowe"}</b><span class="wyciszony maly">w ${odmiana(Math.round(sesja.koniecMin), "minutę", "minuty", "minut")}</span></div>`
    : `<div class="got-gora"><b>${m < 0 ? `Start za ${Math.ceil(-m)} min` : `Minuta ${Math.floor(m)}`}</b><span class="wyciszony maly">${z ? `${ileOsob(z.grupy.length)} · ` : ""}do końca ok. ${Math.max(0, Math.round(koniecWszystkich - Math.max(m, 0)))} min</span></div>`;
  if (z) gora += `<div class="got-postep" aria-hidden="true"><span style="width:${Math.min(100, Math.max(0, m) / Math.max(1, koniecWszystkich) * 100).toFixed(1)}%"></span></div>`;
  const koniecGotowania = !wTrakcie.length && !przyszle.length;
  const pokazany = koniecGotowania ? null : coPokazac(bloki, sesja, dania, m);
  let kartaHtml;
  if (koniecGotowania) {
    kartaHtml = sesja.tydzien
      ? `<p class="krok-tekst">Wszystko ugotowane</p><p class="wyciszony">Rozłóż do pudełek: część do lodówki, część do zamrażarki. Planer zapisze terminy.</p>
         <div class="rzad"><button type="button" class="przycisk glowny" data-akcja="koniec">Włóż porcje do lodówki</button></div>`
      : `<p class="krok-tekst">Gotowe. Smacznego.</p><div class="rzad"><button type="button" class="przycisk glowny" data-akcja="koniec">Zakończ</button></div>`;
  } else {
    kartaHtml = karta(pokazany, sesja, dania, bloki, m);
  }
  if (z) {
    kartaHtml += coRobiaInni(z, m);
    if (z.ja === 0) kartaHtml += `<button type="button" class="link" data-akcja="razemUdostepnij">wyślij zaproszenie jeszcze raz</button>`;
  }
  const os = gora + (poziomo() ? osPozioma(dania, bloki, m, pokazany) : z ? osRazem(sesja, dania, bloki, m, pokazany) : osPionowa(dania, bloki, m, pokazany));
  return uloz2(os, kartaHtml) + (koniecGotowania ? "" : `<button type="button" class="link" data-akcja="przerwij">przerwij gotowanie</button>`);
}

// --- Gotowanie razem: zaproszenie, dołączanie i oś z kolumną dla każdej osoby ---

let zaproszenie = null; // {osoby, za} — ekran zapraszania przed startem

function nowaSesja(ids, start, tydzien, razem = null) {
  return {
    start, dania: ids,
    postep: ids.map(() => ({ nastepny: 0, wolneOd: 0, ostatniStart: 0 })),
    wTrakcie: [], zrobione: [], tydzien, ...(razem ? { razem } : {}),
  };
}

function rysujZaproszenie(app, ids) {
  document.body.classList.remove("gotowanie-poziomo");
  const maks = Math.min(MAKS_OSOB, ids.length);
  const n = Math.min(zaproszenie.osoby, maks);
  const grupy = podzielDania(ids, n);
  const plany = grupy.map(planOsoby);
  const razem = Math.round(Math.max(...plany.map((p) => p.koniec)));
  const sam = Math.round(planOsoby(ids).koniec);
  const start = Date.now() + zaproszenie.za * 60000;
  const maksPraca = Math.max(...plany.map((p) => p.praca), 1);
  return `<header class="naglowek"><h1>Gotujemy razem</h1>
      <p class="wyciszony">${esc(przygotuj(ids).map((d) => d.nazwa).join(", "))}</p></header>
    <section class="sekcja"><span class="ciemny maly">Ile osób gotuje</span>
      <div class="rzad" role="group" aria-label="Ile osób gotuje" style="gap:8px">${[1, 2, 3].filter((k) => k <= maks).map((k) => `
        <button type="button" class="przycisk${k === n ? " wybrany-wybor" : ""}" aria-pressed="${k === n}" data-akcja="razemOsoby" data-n="${k}" style="min-width:56px">${k === 1 ? "sam" : k}</button>`).join("")}</div></section>
    <section class="sekcja"><span class="ciemny maly">Kto co robi — każdy gotuje swoje dania od początku do końca</span>
      ${grupy.map((g, k) => `<div class="osoba-podzial">
        <div class="rozsun"><b class="${k === 0 ? "jasny" : ""}">${NAZWY_OSOB[k]}</b><span class="ciemny maly">ok. ${plany[k].praca} min przy garnku</span></div>
        <span class="wyciszony">${esc(plany[k].dania.map((d) => d.nazwa).join(", "))}</span>
        <span class="pasek-pracy" aria-hidden="true"><span style="width:${Math.round(plany[k].praca / maksPraca * 100)}%"></span></span></div>`).join("")}
      <span>${n === 1 ? `Razem ok. ${sam} min` : `Razem ok. ${razem} min (sam: ok. ${sam})`}</span></section>
    <div class="rozsun"><span>Start ${godzina(start)} · ${zaproszenie.za ? `za ${zaproszenie.za} min` : "teraz"}</span>
      <span class="rzad"><button type="button" class="link" data-akcja="razemStart" data-o="-5">wcześniej</button>
        <button type="button" class="link" data-akcja="razemStart" data-o="5">później</button></span></div>
    ${n === 1
      ? `<button type="button" class="przycisk glowny szeroki" data-akcja="zacznij" data-dania="${ids.join(",")}">Zaczynam</button>`
      : `<button type="button" class="przycisk glowny szeroki" data-akcja="razemWyslij" data-dania="${ids.join(",")}">Wyślij zaproszenie</button>
         <p class="ciemny maly">Druga osoba dostaje link, otwiera go w Safari i nic nie instaluje. Telefony nie łączą się ze sobą: każdy liczy ten sam plan od wspólnej godziny startu.</p>`}
    <button type="button" class="link" data-akcja="razemZamknij">wróć</button>`;
}

function rysujDolaczenie(app, kod) {
  document.body.classList.remove("gotowanie-poziomo");
  const z = czytajKod(kod);
  if (!z) {
    return `<div class="najpierw"><h1>Ten link nie działa</h1>
      <span class="wyciszony">Link do wspólnego gotowania jest niepełny albo pochodzi z innej wersji planera. Poproś o nowy.</span></div>`;
  }
  const wszystkie = z.grupy.flat().map((id) => planOsoby([id]).dania[0].nazwa);
  const zaIle = Math.round((z.start - Date.now()) / 60000);
  const kiedy = zaIle > 0 ? `start ${godzina(z.start)} · za ${zaIle} min` : zaIle === 0 ? `start ${godzina(z.start)} · teraz` : `trwa od ${-zaIle} min`;
  const trwa = app.dane.gotowanie?.start ? `<p class="ciemny maly">Masz otwarte inne gotowanie — dołączenie je zakończy.</p>` : "";
  const czesc = (k) => planOsoby(z.grupy[k]);
  if (z.grupy.length === 2) {
    return `<div class="najpierw"><span class="wyciszony maly">Zaproszenie do gotowania</span>
        <h1>${esc(wszystkie.join(", "))}</h1><span class="wyciszony">${kiedy}</span></div>
      <section class="sekcja"><span class="ciemny maly">Twoja część</span>
        <span class="jasny" style="font-size:19px">${esc(czesc(1).dania.map((d) => d.nazwa).join(", "))}</span>
        <span class="wyciszony">${odmiana(czesc(1).bloki.length, "krok", "kroki", "kroków")} · ok. ${czesc(1).praca} min przy garnku</span></section>
      <button type="button" class="przycisk glowny szeroki" data-akcja="razemDolacz" data-ja="1">Dołączam</button>${trwa}
      <p class="ciemny maly">Nie musisz nic instalować. Ekran nie zgaśnie, dopóki gotujecie, a minutniki zadzwonią, gdy planer jest na ekranie.</p>`;
  }
  return `<div class="najpierw"><span class="wyciszony maly">Zaproszenie do gotowania we troje</span>
      <h1>${esc(wszystkie.join(", "))}</h1><span class="wyciszony">${kiedy}</span></div>
    <section class="sekcja"><span class="ciemny maly">Którą osobą jesteś? Ustalcie to między sobą.</span>
      ${[1, 2].map((k) => `<button type="button" class="przycisk szeroki" style="justify-content:space-between;gap:12px;text-align:left" data-akcja="razemDolacz" data-ja="${k}">
        <span>${NAZWY_OSOB[k]}: ${esc(czesc(k).dania.map((d) => d.nazwa).join(", "))}</span><span class="ciemny maly">ok. ${czesc(k).praca} min</span></button>`).join("")}</section>${trwa}
    <p class="ciemny maly">Nie musisz nic instalować. Wszystko zostaje w Twoim telefonie.</p>`;
}

// Co robią pozostałe osoby według planu (telefony nie wiedzą o sobie nic więcej).
function cudzeBloki(z, m) {
  return z.grupy.flatMap((g, k) => (k === z.ja ? [] : planOsoby(g).bloki.map((b) => ({
    ...b, osoba: k, etykieta: etykietaKroku(b.tekst), nazwaDania: planOsoby(g).dania[b.danie].nazwa, minal: b.koniec <= m,
  }))));
}

function coRobiaInni(z, m) {
  return z.grupy.map((g, k) => {
    if (k === z.ja) return "";
    const bloki = planOsoby(g).bloki.filter((b) => b.aktywny);
    const teraz = bloki.find((b) => b.start <= m && m < b.koniec);
    const potem = bloki.find((b) => b.start > m);
    const b = teraz ?? potem;
    const kto = k === 0 && z.ja !== 0 ? "Osoba, która zaprosiła" : NAZWY_OSOB[k];
    if (!b) return `<p class="ciemny maly">${kto}: swoja część gotowa.</p>`;
    return `<p class="ciemny maly">${kto} ${teraz ? "teraz" : `za ${Math.ceil(b.start - m)} min`}: ${esc(planOsoby(g).dania[b.danie].nazwa.toLowerCase())}, ${esc(etykietaKroku(b.tekst))}</p>`;
  }).join("");
}

// Oś 2A: kolumna „Ty”, kolumny pozostałych osób i wąski pas „samo się robi” po prawej.
function osRazem(sesja, dania, bloki, m, pokazany) {
  const z = sesja.razem;
  const mOs = Math.max(m, OD);
  const od = OD;
  const px = PX;
  const cudze = cudzeBloki(z, m);
  const H = (Math.max(zakresOsi(bloki, m), ...cudze.map((b) => b.koniec + 4)) - od) * px;
  const y = (t) => (t - od) * px;
  const n = z.grupy.length;
  const SAMO = 48;
  const kol = `((100% - 34px - ${SAMO}px - ${n * 6}px) / ${n})`;
  const kolumna = (osoba) => (osoba === z.ja ? 0 : osoba < z.ja ? osoba + 1 : osoba);
  const lewo = (osoba) => `calc(34px + ${kolumna(osoba)} * (${kol} + 6px))`;
  const moje = bloki.map((b) => ({ ...b, osoba: z.ja, moj: true }));
  const wszystkie = [...moje, ...cudze];
  // Kroki „samo się robi” wszystkich osób dzielą wąski pas; nachodzące na siebie stają obok siebie.
  const bierne = wszystkie.filter((b) => !b.aktywny).sort((a, b) => a.start - b.start);
  const tory = [];
  for (const b of bierne) {
    let t = tory.findIndex((koniec) => koniec <= b.start);
    if (t < 0) { t = tory.length; tory.push(0); }
    tory[t] = b.koniec;
    b.tor = t;
  }
  const szerToru = (SAMO - (Math.max(tory.length, 1) - 1) * 2) / Math.max(tory.length, 1);
  const kafle = wszystkie.map((b) => {
    const wys = (b.koniec - b.start) * px - 3;
    const poz = b.aktywny
      ? `left:${lewo(b.osoba)};width:calc(${kol})`
      : `left:calc(100% - ${SAMO}px + ${(b.tor * (szerToru + 2)).toFixed(1)}px);width:${szerToru.toFixed(1)}px`;
    const styl = `top:${y(b.start).toFixed(1)}px;height:${wys.toFixed(1)}px;${poz}`;
    if (!b.moj) {
      const napis = b.aktywny && wys >= 26 && !b.minal ? `${wys >= 40 ? `<span class="danie">${esc(b.nazwaDania)}</span>` : ""}<span>${esc(b.etykieta)}</span>` : "";
      return `<span class="kafel cudzy ${b.aktywny ? "aktywny" : "bierny"}${b.minal ? " minal" : ""}" style="${styl}" aria-hidden="true">${napis}</span>`;
    }
    const napis = b.aktywny && wys >= 26 && b.stan !== "zrobiony"
      ? `${wys >= 40 ? `<span class="danie">${esc(dania[b.danie].nazwa)}</span>` : ""}<span>${esc(b.etykieta)}</span>` : "";
    return `<button type="button" class="${klasyKafla(b, pokazany)}" data-akcja="wybierz" data-klucz="${klucz(b)}" aria-label="${esc(dania[b.danie].nazwa)}: ${esc(b.etykieta)}" style="${styl}">${napis}</button>`;
  });
  const podzialka = [];
  for (let t = 0; t <= od + H / px; t += 10) podzialka.push(`<span class="got-podzialka" style="left:0;top:${(y(t) - 7).toFixed(1)}px">${t}'</span>`);
  const naglowki = [...Array(n).keys()].sort((a, b) => kolumna(a) - kolumna(b)).map((k) => `<span${k === z.ja ? ' class="jasny"' : ""}>${k === z.ja ? "Ty" : k === 0 ? "Zaprasza" : NAZWY_OSOB[k]}</span>`);
  return `<div class="got-kolumny" style="grid-template-columns:34px repeat(${n},minmax(0,1fr)) ${SAMO}px"><span></span>${naglowki.join("")}<span>samo</span></div>
    ${przewijana(m, H, `<div class="got-os got-pion got-razem" style="height:__WYS__" aria-label="Oś czasu">${podzialka.join("")}${kafle.join("")}
      <span class="teraz-linia" style="left:30px;right:0;height:2px;top:${(y(mOs) - 1).toFixed(1)}px"></span></div>`)}`;
}

// Link przez okno udostępniania (AirDrop, Wiadomości…), a gdy go nie ma — do schowka.
function udostepnijZaproszenie(sesja) {
  const z = sesja.razem;
  const url = adresZaproszenia(z.kod);
  const tekst = `Gotujemy razem: ${przygotuj(z.grupy.flat()).map((d) => d.nazwa).join(", ")}. Start ${godzina(sesja.start)}.`;
  if (navigator.share) navigator.share({ title: "Gotujemy razem", text: tekst, url }).catch(() => {});
  else kopiujTekst(`${tekst} ${url}`).then(() => powiadom("Link skopiowany — wklej go drugiej osobie."));
}

// --- Minutniki, dźwięk i ekran, który nie gaśnie ---

function pik() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach((t) => {
      const osc = audio.createOscillator();
      const glos = audio.createGain();
      osc.frequency.value = 880;
      glos.gain.setValueAtTime(0.0001, audio.currentTime + t);
      glos.gain.exponentialRampToValueAtTime(0.4, audio.currentTime + t + 0.02);
      glos.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.25);
      osc.connect(glos).connect(audio.destination);
      osc.start(audio.currentTime + t);
      osc.stop(audio.currentTime + t + 0.3);
    });
  } catch { /* bez dźwięku */ }
}

async function nieGasnij() {
  try {
    if ("wakeLock" in navigator && !blokada) {
      blokada = await navigator.wakeLock.request("screen");
      blokada.addEventListener("release", () => { blokada = null; });
    }
  } catch { /* przeglądarka nie pozwala — ekran zgaśnie jak zwykle */ }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && zegar) nieGasnij();
});

// Przewijanie osi: ekran odświeża się co sekundę, więc pamiętamy, gdzie ją zostawiłeś.
// Oś pionowa przewija się w dół (scrollTop), pozioma w bok (scrollLeft). Po obróceniu telefonu zaczynamy od „teraz”.
const przewin = { kiedy: 0, pozycja: 0, ustawione: -1, os: "y" };
const PAMIEC_PRZEWINIECIA_MS = 20000;
function ustawPrzewiniecie() {
  const el = document.querySelector(".got-przewijana");
  if (!el) return;
  const os = el.dataset.os === "x" ? "x" : "y";
  const wlasnosc = os === "x" ? "scrollLeft" : "scrollTop";
  if (przewin.os !== os) Object.assign(przewin, { os, kiedy: 0, pozycja: 0 });
  const reczne = Date.now() - przewin.kiedy < PAMIEC_PRZEWINIECIA_MS;
  el[wlasnosc] = reczne ? przewin.pozycja : Number(el.dataset.cel);
  przewin.ustawione = el[wlasnosc];
  el.addEventListener("scroll", () => {
    if (Math.abs(el[wlasnosc] - przewin.ustawione) < 2) return; // to nasze ustawienie, nie palec
    przewin.kiedy = Date.now();
    przewin.pozycja = el[wlasnosc];
    przewin.ustawione = -1;
  }, { passive: true });
}

export function poNarysowaniu(app) {
  sledzObrot(app);
  ustawPrzewiniecie();
  const sesja = app.dane.gotowanie;
  if (sesja?.start && !zegar) {
    nieGasnij();
    zegar = setInterval(() => {
      const m = minutaTeraz(sesja);
      for (const b of sesja.wTrakcie ?? []) {
        const klucz = `${b.danie}-${b.krok}-${b.koniec}`;
        if (b.koniec <= m && !zadzwonione.has(klucz) && (b.zCzasem || !b.aktywny)) {
          zadzwonione.add(klucz);
          pik();
        }
      }
      if (sesja.koniecMin == null && app.ekran === "gotowanie" && document.getElementById("arkusz").hidden) app.odswiez();
    }, 1000);
  }
}

// Obrócenie telefonu przełącza oś między pionową a poziomą.
let obserwujeObrot = false;
function sledzObrot(app) {
  if (obserwujeObrot || !window.matchMedia) return;
  obserwujeObrot = true;
  window.matchMedia(POZIOMO).addEventListener?.("change", () => { if (app.ekran === "gotowanie") app.odswiez(); });
}

export function poOpuszczeniu() {
  document.body.classList.remove("gotowanie-poziomo");
  wybrany = null;
  clearInterval(zegar);
  zegar = null;
  blokada?.release?.();
  blokada = null;
}

export const akcje = {
  wybierz(app, cel) {
    wybrany = wybrany === cel.dataset.klucz ? null : cel.dataset.klucz;
    app.odswiez();
  },
  terazWroc(app) {
    wybrany = null;
    app.odswiez();
  },
  razemOtworz(app) {
    zaproszenie = { osoby: 2, za: 5 };
    app.odswiez();
  },
  razemZamknij(app) {
    zaproszenie = null;
    app.odswiez();
  },
  razemOsoby(app, cel) {
    zaproszenie.osoby = Number(cel.dataset.n);
    app.odswiez();
  },
  razemStart(app, cel) {
    zaproszenie.za = Math.max(0, Math.min(120, zaproszenie.za + Number(cel.dataset.o)));
    app.odswiez();
  },
  razemWyslij(app, cel) {
    const ids = cel.dataset.dania.split(",");
    const grupy = podzielDania(ids, zaproszenie.osoby);
    const start = Math.round((Date.now() + zaproszenie.za * 60000) / 1000) * 1000;
    const kod = kodZaproszenia(start, grupy);
    app.dane.gotowanie = nowaSesja(grupy[0], start, tenTydzien(), { grupy, ja: 0, kod });
    zaproszenie = null;
    pik();
    app.zapisz();
    udostepnijZaproszenie(app.dane.gotowanie);
    app.idz(`#gotowanie/razem/${kod}`);
  },
  razemUdostepnij(app) {
    udostepnijZaproszenie(app.dane.gotowanie);
  },
  razemDolacz(app, cel) {
    const z = czytajKod(app.argument?.slice(6));
    if (!z) return;
    const ja = Number(cel.dataset.ja);
    poOpuszczeniu();
    app.dane.gotowanie = nowaSesja(z.grupy[ja], z.start, null, { grupy: z.grupy, ja, kod: z.kod });
    pik(); // pierwszy dźwięk po stuknięciu odblokowuje dźwięk w Safari
    app.zapisz();
    app.odswiez();
  },
  zacznij(app, cel) {
    const ids = cel.dataset.dania.split(",");
    zaproszenie = null;
    app.dane.gotowanie = nowaSesja(ids, Date.now(), ids.length > 1 ? tenTydzien() : null);
    pik(); // pierwszy dźwięk po stuknięciu odblokowuje dźwięk w Safari
    app.zapisz();
    akcje.startKroku(app, { dataset: { danie: String(przygotuj(ids).length > 0 ? uloz(przygotuj(ids))[0].danie : 0) } });
  },
  startKroku(app, cel) {
    wybrany = null;
    const sesja = app.dane.gotowanie;
    const k = Number(cel.dataset.danie);
    const dania = przygotuj(sesja.dania);
    const krok = dania[k].kroki[sesja.postep[k].nastepny];
    if (!krok) return;
    const m = minutaTeraz(sesja);
    sesja.wTrakcie.push({ danie: k, krok: sesja.postep[k].nastepny, start: m, koniec: m + krok.min, aktywny: !krok.bierny, tekst: krok.tekst, zCzasem: krok.zCzasem });
    sesja.postep[k].ostatniStart = m;
    sesja.postep[k].nastepny += 1;
    app.zapisz();
    app.odswiez();
  },
  zrobione(app, cel) {
    wybrany = null;
    const sesja = app.dane.gotowanie;
    const m = minutaTeraz(sesja);
    const [b] = sesja.wTrakcie.splice(Number(cel.dataset.i), 1);
    sesja.zrobione.push({ ...b, koniec: Math.max(m, b.start + 0.5) });
    sesja.postep[b.danie].wolneOd = m;
    const zostalo = przygotuj(sesja.dania).some((d, k) => sesja.postep[k].nastepny < d.kroki.length);
    if (!sesja.wTrakcie.length && !zostalo) sesja.koniecMin = m;
    app.zapisz();
    app.odswiez();
  },
  minuta(app, cel) {
    const sesja = app.dane.gotowanie;
    const b = sesja.wTrakcie[Number(cel.dataset.i)];
    b.koniec = Math.max(b.koniec, minutaTeraz(sesja)) + 1;
    app.zapisz();
    app.odswiez();
  },
  koniec(app) {
    const sesja = app.dane.gotowanie;
    if (sesja.tydzien && app.dane.tygodnie[sesja.tydzien] && !app.dane.tygodnie[sesja.tydzien].ugotowano) wlozDoLodowki(app.dane, sesja.tydzien);
    const wTygodniu = Boolean(sesja.tydzien);
    app.dane.gotowanie = null;
    poOpuszczeniu();
    app.zapisz();
    if (wTygodniu) {
      powiadom("Porcje są w lodówce i zamrażarce.");
      app.idz("#lodowka");
    } else app.idz("#gotowanie");
  },
  przerwij() {
    pokazArkusz(`<h1>Przerwać gotowanie?</h1><p class="wyciszony">Postęp i minutniki znikną. Porcje nie trafią do lodówki.</p>
      <button type="button" class="przycisk glowny szeroki" data-akcja="przerwijTak">Przerwij</button>
      <button type="button" class="przycisk szeroki" data-akcja="zamknij">Gotuję dalej</button>`);
  },
  przerwijTak(app) {
    app.dane.gotowanie = null;
    poOpuszczeniu();
    zamknijArkusz();
    app.zapisz();
    app.idz("#gotowanie");
  },
};
