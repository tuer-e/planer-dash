// Gotowanie: kroki kilku dań na jednej osi czasu, z minutnikami i ekranem, który nie gaśnie.
// Plan przelicza się na bieżąco: gdy coś zajmie dłużej albo krócej, reszta przesuwa się sama.
import { slotyJedzone } from "../../silnik/generator.js";
import { etykietaKroku, koniecPlanu, krokiDania, uloz } from "../harmonogram.js";
import { przepisy, tenTydzien, wlozDoLodowki } from "../stan.js";
import { esc, krotkaNazwa, odmiana, pokazArkusz, powiadom, zamknijArkusz } from "../narzedzia.js";

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

function osPionowa(dania, bloki, m, pokazany) {
  const H = 340;
  const od = Math.max(-2, m - 10); // na starcie bez pustego miejsca nad osią
  const px = H / 50;
  const y = (t) => (t - od) * px;
  const n = dania.length;
  const kol = `((100% - 34px - ${(n - 1) * 6}px) / ${n})`;
  const kafle = bloki.filter((b) => y(b.koniec) > -2 && y(b.start) < H + 2).map((b) => {
    const wys = (b.koniec - b.start) * px - 3;
    const ulamek = !b.rownolegly ? [0, 1] : b.glowny ? [0, 0.7] : [0.7, 0.3];
    const lewo = `calc(34px + ${b.danie} * (${kol} + 6px) + ${ulamek[0]} * ${kol} + ${ulamek[0] ? 3 : 0}px)`;
    const szer = `calc(${ulamek[1]} * ${kol} - ${b.rownolegly ? 3 : 0}px)`;
    return `<button type="button" class="${klasyKafla(b, pokazany)}" data-akcja="wybierz" data-klucz="${klucz(b)}" aria-label="${esc(dania[b.danie].nazwa)}: ${esc(b.etykieta)}"
      style="top:${y(b.start).toFixed(1)}px;height:${wys.toFixed(1)}px;left:${lewo};width:${szer}">${wys >= 26 ? etykietaKafla(b, m, !b.glowny ? 0 : wys >= 56 ? 100 : 60) : ""}</button>`;
  });
  const podzialka = [];
  for (let t = Math.ceil(od / 10) * 10; t <= od + 50; t += 10) if (t >= 0) podzialka.push(`<span class="got-podzialka" style="left:0;top:${(y(t) - 7).toFixed(1)}px">${t}'</span>`);
  return `<div class="got-kolumny" style="grid-template-columns:34px repeat(${n},minmax(0,1fr))"><span></span>${dania.map((d) => `<span>${esc(d.nazwa)}</span>`).join("")}</div>
    <div class="got-os got-pion" style="height:${H}px" aria-label="Oś czasu">${podzialka.join("")}${kafle.join("")}
      <span class="teraz-linia" style="left:30px;right:0;height:2px;top:${(y(m) - 1).toFixed(1)}px"></span></div>`;
}

function osPozioma(dania, bloki, m, pokazany) {
  const od = Math.max(-2, m - 8);
  const okno = 50;
  const proc = (t) => `${((t - od) / okno * 100).toFixed(2)}%`;
  const tory = dania.map((d, k) => {
    const kafle = bloki.filter((b) => b.danie === k && b.koniec > od && b.start < od + okno).map((b) => {
      const start = Math.max(b.start, od);
      const top = b.rownolegly && !b.glowny ? 42 : 2;
      const wys = !b.rownolegly ? 52 : b.glowny ? 36 : 12;
      const miejsce = (b.koniec - start) * 9; // ok. 9 px na minutę na telefonie poziomo
      return `<button type="button" class="${klasyKafla(b, pokazany)}" data-akcja="wybierz" data-klucz="${klucz(b)}" aria-label="${esc(d.nazwa)}: ${esc(b.etykieta)}"
        style="left:${proc(start)};width:calc(${proc(b.koniec - start + od)} - 4px);top:${top}px;height:${wys}px">${etykietaKafla(b, m, miejsce)}</button>`;
    });
    return `<div class="sekcja" style="gap:4px"><span class="wyciszony maly">${esc(d.nazwa)}</span><div class="got-os" style="height:56px">${kafle.join("")}</div></div>`;
  });
  const podzialka = [];
  for (let t = Math.ceil(od / 10) * 10; t <= od + okno; t += 10) if (t >= 0) podzialka.push(`<span class="got-podzialka" style="top:0;left:${proc(t)}">${t ? `${t}'` : "start"}</span>`);
  return `<div class="got-os got-poziom" style="overflow:visible">
    <div style="position:relative;height:14px">${podzialka.join("")}</div>
    <div class="sekcja" style="gap:10px">${tory.join("")}</div>
    <span class="teraz-linia" style="top:2px;bottom:0;width:2px;left:${proc(m)}"></span></div>`;
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

function karta(b, sesja, dania, bloki, m) {
  const nazwa = esc(dania[b.danie].nazwa);
  const tlo = bloki.filter((x) => x.stan === "trwa" && klucz(x) !== klucz(b));
  const wTle = tlo.length && !wybrany ? `<div>${tlo.map((x) => `<button type="button" class="link" data-akcja="wybierz" data-klucz="${klucz(x)}">w tle: ${esc(dania[x.danie].nazwa.toLowerCase())}, ${esc(x.etykieta)} · ${Math.max(0, Math.ceil(x.koniec - m))} min</button>`).join("")}</div>` : "";
  const wroc = wybrany ? `<button type="button" class="link" data-akcja="terazWroc">wróć do teraz</button>` : "";
  if (b.stan === "trwa") {
    const zostalo = b.koniec - m;
    const zMinutnikiem = b.zCzasem || !b.aktywny;
    return `<p class="co">${nazwa} · ${zostalo <= 0 && zMinutnikiem ? "czas minął — sprawdź" : b.aktywny ? "przy garnku" : "samo się robi"}</p>
      <p class="krok-tekst">${esc(b.tekst)}</p>
      ${zMinutnikiem ? `<p class="minutnik" aria-live="off">${mmss(zostalo)}</p>` : ""}
      <div class="rzad"><button type="button" class="przycisk glowny" data-akcja="zrobione" data-i="${b.i}">Zrobione</button>
        ${zMinutnikiem ? `<button type="button" class="link" data-akcja="minuta" data-i="${b.i}">+1 min</button>` : ""}${wroc}</div>${wTle}`;
  }
  if (b.stan === "plan") {
    const mozna = doZaczecia(bloki, sesja, dania).some((x) => klucz(x) === klucz(b));
    const kiedy = b.start <= m + 0.5 ? "teraz" : `za ${Math.ceil(b.start - m)} min`;
    return `<p class="co">${nazwa} · ${mozna ? kiedy : "po poprzednim kroku"} · ${b.aktywny ? "przy garnku" : "samo się robi"}, ok. ${b.min} min</p>
      <p class="krok-tekst">${esc(b.tekst)}</p>
      <div class="rzad">${mozna ? `<button type="button" class="przycisk glowny" data-akcja="startKroku" data-danie="${b.danie}">Zaczynam ten krok</button>` : ""}${wroc}</div>${wTle}`;
  }
  return `<p class="co">${nazwa} · zrobione</p><p class="krok-tekst">${esc(b.tekst)}</p><div class="rzad">${wroc}</div>`;
}

export function rysuj(app) {
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
  const dania = przygotuj(ids);
  const plan0 = uloz(dania);
  const razem = Math.round(koniecPlanu(plan0));
  const bloki = uklad(wszystkieBloki(dania, 0, plan0, [], []));
  const pierwszy = bloki.find((b) => b.start === 0) ?? bloki[0];
  const gora = `<div class="got-gora"><b>Ok. ${odmiana(razem, "minuta", "minuty", "minut")}</b><span class="wyciszony maly">${ids.length > 1 ? "dania gotują się równolegle" : "jeden przepis"}</span></div>`;
  const kartaHtml = `<p class="co">Na start · ${esc(dania[pierwszy.danie].nazwa)}</p><p class="krok-tekst">${esc(pierwszy.tekst)}</p>
    <div class="rzad"><button type="button" class="przycisk glowny" data-akcja="zacznij" data-dania="${ids.join(",")}">Zaczynam</button></div>
    <p class="ciemny maly">Ekran nie zgaśnie, dopóki gotujesz. Minutnik zadzwoni, gdy planer jest na ekranie.</p>`;
  const os = gora + (poziomo() ? osPozioma(dania, bloki, 0, pierwszy) : osPionowa(dania, bloki, 0, pierwszy));
  return uloz2(os, kartaHtml);
}

function rysujGotowanie(app, sesja) {
  const { dania, m, przyszle, wTrakcie, zrobione } = plan(sesja);
  const bloki = uklad(wszystkieBloki(dania, m, przyszle, wTrakcie, zrobione));
  const koniec = Math.max(m, koniecPlanu(bloki));
  const gora = sesja.koniecMin != null
    ? `<div class="got-gora"><b>Gotowe</b><span class="wyciszony maly">w ${odmiana(Math.round(sesja.koniecMin), "minutę", "minuty", "minut")}</span></div>`
    : `<div class="got-gora"><b>Minuta ${Math.floor(m)}</b><span class="wyciszony maly">do końca ok. ${Math.max(0, Math.round(koniec - m))} min</span></div>`;
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
  const os = gora + (poziomo() ? osPozioma(dania, bloki, m, pokazany) : osPionowa(dania, bloki, m, pokazany));
  return uloz2(os, kartaHtml) + (koniecGotowania ? "" : `<button type="button" class="link" data-akcja="przerwij">przerwij gotowanie</button>`);
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

export function poNarysowaniu(app) {
  sledzObrot(app);
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
  zacznij(app, cel) {
    const ids = cel.dataset.dania.split(",");
    app.dane.gotowanie = {
      start: Date.now(), dania: ids,
      postep: ids.map(() => ({ nastepny: 0, wolneOd: 0, ostatniStart: 0 })),
      wTrakcie: [], zrobione: [], tydzien: ids.length > 1 ? tenTydzien() : null,
    };
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
    app.dane.gotowanie = null;
    poOpuszczeniu();
    app.zapisz();
    powiadom("Porcje są w lodówce i zamrażarce.");
    app.idz("#lodowka");
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
    app.odswiez();
  },
};
