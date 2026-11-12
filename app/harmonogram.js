// Plan poniedziałkowego gotowania: kroki kilku dań ułożone w czasie dla jednej osoby w kuchni.
// Kroki „przy garnku” (krojenie, smażenie, mieszanie) zajmują Ciebie — nie da się robić dwóch naraz.
// Kroki „samo się robi” (duszenie, gotowanie, pieczenie) biegną w tle, a Ty w tym czasie robisz coś innego.
// Czas kroku odczytujemy z tekstu przepisu („duś 40 minut”, „1 godzinę”); bez liczby — 5 minut pracy.

const DOMYSLNIE_MIN = 5;
const BIERNE = /(duś|gotuj|piecz|odstaw|przykryj|namocz|ostudź|zapiekaj|wstaw)/i;
const AKTYWNE = /(mieszaj|mieszając|wlewaj|smaż|krój|siekaj|zagnieć|rozwałkuj|formuj)/i;
// Wskazówki do podania („Podanie: …”, „Porcje na dalsze dni zamroź”) nie są częścią poniedziałkowego gotowania.
const DO_PODANIA = /^(podanie|podawaj|na talerzu|porcje na dalsze dni|przed jedzeniem)/i;

export function minutyKroku(tekst) {
  let max = 0;
  for (const m of tekst.matchAll(/(\d+)(?:\s*[–-]\s*(\d+))?\s*(?:min|minut)/gi)) max = Math.max(max, Number(m[2] ?? m[1]));
  for (const m of tekst.matchAll(/(\d+(?:[,.]\d+)?)?\s*godzin/gi)) max = Math.max(max, Math.round(Number((m[1] ?? "1").replace(",", ".")) * 60));
  return max;
}

// Krok bierny: ma czas i opisuje gotowanie w tle, a nie pracę rękami (smażenie z mieszaniem jest aktywne).
export function krokZPrzepisu(tekst) {
  const min = minutyKroku(tekst);
  const bierny = min >= 8 && BIERNE.test(tekst) && !AKTYWNE.test(tekst.split(/[.;]/).find((z) => /\d/.test(z)) ?? tekst);
  // „W tym czasie …” — krok zaczyna się razem z poprzednim, a nie po nim.
  const rownolegly = /^w tym czasie/i.test(tekst.trim());
  return { tekst, min: min || DOMYSLNIE_MIN, bierny, zCzasem: min > 0, rownolegly };
}

export function doPodania(tekst) {
  return DO_PODANIA.test(tekst.trim());
}

export function krokiDania(przepis) {
  return przepis.kroki.filter((t) => !doPodania(t)).map(krokZPrzepisu);
}

// Układa pozostałe kroki od chwili `teraz` (w minutach od startu).
// `dania`: [{nazwa, kroki: [...], nastepny: indeks pierwszego niezaczętego kroku, wolneOd: minuta, od której danie czeka na Ciebie}].
// `zajetyDo`: do kiedy jesteś zajęty krokiem, który właśnie robisz.
export function uloz(dania, teraz = 0, zajetyDo = teraz) {
  const stan = dania.map((d) => ({ i: d.nastepny ?? 0, wolneOd: Math.max(teraz, d.wolneOd ?? teraz), ostatniStart: d.ostatniStart ?? teraz }));
  let ty = Math.max(teraz, zajetyDo);
  const bloki = [];
  const pozostalo = (k) => dania[k].kroki.slice(stan[k].i).reduce((s, x) => s + x.min, 0);
  for (;;) {
    let wybor = null;
    dania.forEach((d, k) => {
      if (stan[k].i >= d.kroki.length) return;
      const krok = d.kroki[stan[k].i];
      // Nawet krok „samo się robi” trzeba zacząć (wstawić garnek), więc też czeka, aż będziesz wolny.
      const gotowe = krok.rownolegly && stan[k].i > 0 ? Math.max(teraz, stan[k].ostatniStart + 1) : stan[k].wolneOd;
      const start = Math.max(gotowe, ty);
      if (!wybor || start < wybor.start || (start === wybor.start && pozostalo(k) > wybor.reszta)) wybor = { k, start, reszta: pozostalo(k) };
    });
    if (!wybor) break;
    const krok = dania[wybor.k].kroki[stan[wybor.k].i];
    const koniec = wybor.start + krok.min;
    bloki.push({ danie: wybor.k, krok: stan[wybor.k].i, start: wybor.start, koniec, aktywny: !krok.bierny, tekst: krok.tekst, min: krok.min });
    stan[wybor.k].i += 1;
    stan[wybor.k].wolneOd = Math.max(stan[wybor.k].wolneOd, koniec);
    stan[wybor.k].ostatniStart = wybor.start;
    ty = krok.bierny ? wybor.start + 1 : koniec;
  }
  return bloki;
}

export function koniecPlanu(bloki) {
  return bloki.reduce((m, b) => Math.max(m, b.koniec), 0);
}

// Krótka etykieta kafelka (2 słowa): „Tortille: …” → „Tortille”; „Na oleju zeszklij cebulę” → „zeszklij cebulę”;
// pomija liczby i jednostki („gotuj 15 minut” → „gotuj”).
const NA_POCZATKU = /^(?:(?:w tym czasie|pod koniec|na koniec|na wierzch|na (?:reszcie |łyżce |suchej |samej |połowie )?\S+|w \S+|do \S+|po \S+|pod \S+|wieczorem|rano|drobno|delikatnie|osobno)\s+)+/i;
// Liczby, miary i czas — pomijane, ale nie kończą etykiety.
const MIARA = /^(\d|½|¼|min$|minut|godzin|°|ok\.?$|l$|g$|ml$|szklan|łyż|łyżecz|garś|szczypt|raz[ay]?$)/i;
// Przyimki i spójniki kończą etykietę („wymieszaj z jogurtem” → „wymieszaj”).
const STOP = /^(z|ze|w|we|na|do|po|pod|aż|i|oraz|lub|albo|od|przez|według|bez|dla|tuż|żeby|by|się|je|go|ją|można|dokładnie|dobrze)$/i;
// Przymiotniki i narzędnik („startą”, „posiekanymi”, „blenderem”) — pomijane, szukamy rzeczownika.
const OPIS = /(ą|ego|emu|ym|ymi|ych|ane|one|ęte|ute|em|ami)$/i;

// Krótka etykieta kafelka: czasownik i rzecz, np. „zeszklij cebulę”, „ugotuj jajka”, albo nazwa
// przed dwukropkiem („Sos: …” → „sos”). Bierze tylko pierwsze zdanie kroku.
export function etykietaKroku(tekst) {
  const t = tekst.trim();
  const dwukropek = t.match(/^([^:.,]{2,20}):/);
  if (dwukropek) return dwukropek[1].trim().toLowerCase();
  const zdanie = t.replace(NA_POCZATKU, "").split(/[,.;()—–]/)[0];
  const slowa = zdanie.replace(/:/g, "").split(/\s+/).filter((s) => s && !MIARA.test(s));
  const wynik = slowa.slice(0, 1);
  for (const s of slowa.slice(1)) {
    if (STOP.test(s)) break;
    if (OPIS.test(s)) continue;
    wynik.push(s);
    break;
  }
  return wynik.join(" ").toLowerCase();
}
