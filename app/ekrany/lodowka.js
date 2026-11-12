// Lodówka: co masz ugotowane, do kiedy jest dobre i co zjeść najpierw. Jesz, na co masz ochotę.
import {
  cofnijPrzelozenie, cofnijZjedzenie, kontekst, lodowka, przelozDoLodowki, przepisy, tenTydzien, wlozDoLodowki,
  zamroz, zamrazarka, zjedz,
} from "../stan.js";
import { dataSlownie, dniaDopelniacz, dzienKrotko, dodaj, doKiedy, dzis, esc, krotkaNazwa, nazwaDnia, odmiana, porcjeTxt, pokazArkusz, powiadom, roznica, zamknijArkusz } from "../narzedzia.js";

let ostatnio = null; // ostatnio zjedzona porcja — „Cofnij” przy jej karcie
const arkusz = { osoby: 2, dni: 2 };

function nazwa(x) {
  return krotkaNazwa(przepisy()[x.przepis]?.nazwa ?? x.nazwa);
}

function wyjazdTekst(app, plan, dzisiaj) {
  if (!plan) return "";
  const dzien = roznica(dzisiaj, plan.od);
  const nastepne = plan.poza_domem.filter((d) => d > dzien);
  if (plan.poza_domem.includes(dzien)) return ` · dziś ${esc(app.dane.profil.wyjazd)}`;
  if (!nastepne.length) return "";
  const kiedy = dodaj(plan.od, nastepne[0]);
  return ` · od ${roznica(kiedy, dzisiaj) === 1 ? "jutra" : dniaDopelniacz(kiedy)} ${esc(app.dane.profil.wyjazd)}`;
}

// Lodówka narysowana jak lodówka: na górze zamrażarka, niżej komora z półkami. Obie mają drzwi,
// które odsuwają się w bok po stuknięciu (zostaje pasek z uchwytem). Na drzwiach lodówki wisi
// karteczka z tym, co zjeść najpierw — „Zjadłem porcję” działa bez otwierania drzwi.
let otwarte = ""; // "lod" | "zam" | ""
let wybrane = null; // id porcji przeniesionej na karteczkę stuknięciem półki

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
    return `<h1>W lodówce pusto</h1><span class="wyciszony">Stuknij zamrażarkę i przełóż coś na jutro albo zrób kolację bez gotowania.</span>${cofnij}`;
  }
  return `<h1>Lodówka jest pusta</h1><span class="wyciszony">Ułóż plan na tydzień: planer wybierze dania na poniedziałkowe gotowanie i zrobi listę zakupów.</span>
    <div class="przyciski"><a class="przycisk glowny" href="#tydzien">Ułóż tydzień</a></div>${cofnij}`;
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
  const reszta = doJedzenia.filter((x) => x !== naKarteczce);
  const bez = plan ? [...new Set(plan.grupy.filter((g) => ["kolacja", "szybki"].includes(g.rodzaj) && g.przepis).map((g) => g.przepis))] : [];
  const ctx = bez.length ? kontekst(app.dane, plan.od) : null;
  const drzwiAttr = (co, opis) => `class="drzwi${otwarte === co ? " otwarte" : ""}" role="button" tabindex="0" aria-expanded="${otwarte === co}" aria-label="${opis}" data-akcja="drzwi" data-co="${co}"`;
  const wnetrzeAttr = (co) => `class="wnetrze" data-akcja="zamknijDrzwi"${otwarte === co ? "" : " inert"}`;

  const zamrazarkaHtml = `<div class="komora zam">
      <div ${wnetrzeAttr("zam")}>
        ${wZamrazarce.length ? wZamrazarce.map((x) => `<div class="rozsun polka-zam">
          <span class="polka-tekst"><span>${esc(nazwa(x))}</span>${kafle(x.porcje, "zam")}</span>
          <button type="button" class="link" data-akcja="przeloz" data-id="${x.id}">na jutro</button></div>`).join("")
          : `<span class="wyciszony">W zamrażarce pusto.</span>`}
      </div>
      <div ${drzwiAttr("zam", "Zamrażarka")}><span class="uchwyt" aria-hidden="true"></span>
        <span class="ciemny maly">Zamrażarka</span>
        ${wZamrazarce.map((x) => `<span class="w-srodku"><span>${esc(nazwa(x))}</span>${kafle(x.porcje, "zam")}</span>`).join("")}
        ${rozmrazane.length ? `<span class="ciemny maly">rozmraża się: ${rozmrazane.map((x) => esc(nazwa(x))).join(", ")}</span>` : ""}
        ${!wZamrazarce.length && !rozmrazane.length ? `<span class="ciemny">pusto</span>` : ""}
      </div>
    </div>`;

  const polki = [...doJedzenia, ...rozmrazane].map((x) => `<button type="button" class="polka" data-akcja="naKarteczke" data-id="${x.id}" aria-label="${esc(nazwa(x))}, ${porcjeTxt(x.porcje)}">
      <span class="polka-nazwa">${esc(nazwa(x))}</span>
      <span class="polka-opis">${kafle(x.porcje, rozmrazaSie(x, dzisiaj) ? "roz" : "")}<span>${rozmrazaSie(x, dzisiaj) ? "rozmraża się, na jutro" : doKiedy(x.dobre_do, dzisiaj).replace("dobre ", "")}</span></span>
    </button><span class="deska" aria-hidden="true"></span>`).join("");
  const lodowkaHtml = `<div class="komora lod">
      <div ${wnetrzeAttr("lod")}>
        ${polki || `<span class="wyciszony">Na półkach pusto.</span>`}
        ${bez.length ? `<div class="szuflada"><span class="ciemny maly">Szuflada · bez gotowania</span>
          ${bez.map((i) => `<a class="cichy-link" href="#przepis/${encodeURIComponent(i)}">${esc(ctx.przepisy[i].nazwa)}</a>`).join("")}</div>` : ""}
        ${zjedzone.length ? `<p class="ciemny maly">Zjedzone dziś: ${zjedzone.map((x) => esc(nazwa(x))).join(", ")}</p>` : ""}
      </div>
      <div ${drzwiAttr("lod", "Lodówka")}><span class="uchwyt" aria-hidden="true"></span>
        <section class="karteczka" aria-label="Karteczka">${karteczka(app, naKarteczce, dzisiaj, pierwsze, wZamrazarce.length, plan)}</section>
        ${reszta.length ? `<div class="sekcja" style="gap:10px"><span class="ciemny maly">W środku też</span>
          ${reszta.map((x) => `<span class="w-srodku"><span>${esc(nazwa(x))}</span>${kafle(x.porcje)}</span>`).join("")}</div>` : ""}
      </div>
    </div>`;

  return `<p class="ciemny maly">${esc(nazwaDnia(dzisiaj).replace(/^./, (z) => z.toUpperCase()))}, ${dataSlownie(dzisiaj)}${wyjazdTekst(app, plan, dzisiaj)}</p>
    <section class="szafa" aria-label="Lodówka">${zamrazarkaHtml}${lodowkaHtml}</section>
    <div class="rzad">
      <button type="button" class="link" data-akcja="goscie">Goście</button>
      <button type="button" class="link" data-akcja="plany">Zmieniam plany</button>
    </div>`;
}

// Drzwi przesuwają się bez przerysowania ekranu, żeby ruch był płynny.
function ustawDrzwi(co) {
  otwarte = co;
  for (const d of document.querySelectorAll(".szafa .drzwi")) {
    const otw = d.dataset.co === co;
    d.classList.toggle("otwarte", otw);
    d.setAttribute("aria-expanded", String(otw));
    d.previousElementSibling?.toggleAttribute("inert", !otw);
  }
}

export function poOpuszczeniu() {
  otwarte = "";
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
  const dni = [...Array(8).keys()].filter((d) => d >= Math.max(1, dzisIdx));
  const wDomu = dni.filter((d) => !plan.poza_domem.includes(d));
  const posilkiWDomu = wDomu.length * 2;
  const dostepne = app.dane.lodowka.filter((x) => x.porcje > 0).reduce((s, x) => s + x.porcje, 0);
  // Przed wyjazdem: co zostanie w lodówce i zepsuje się, zanim wrócisz? Zakładamy, że do wyjazdu
  // jesz najpierw to, co ma najkrótszy termin (dziś zostaje jeszcze kolacja).
  const wyjazdOd = plan.poza_domem.find((d) => d > dzisIdx);
  const zepsujaSie = [];
  if (wyjazdOd !== undefined) {
    const powrot = [...Array(8).keys()].find((d) => d > wyjazdOd && !plan.poza_domem.includes(d)) ?? 8;
    let posilki = 1 + (wyjazdOd - dzisIdx - 1) * 2;
    for (const x of lodowka(app.dane).filter((y) => y.porcje > 0)) {
      const zjesz = Math.min(x.porcje, Math.max(0, posilki));
      posilki -= zjesz;
      const zostanie = x.porcje - zjesz;
      if (zostanie > 0 && x.mrozi && !x.z_zamrazarki && roznica(x.dobre_do, dodaj(od, powrot)) < 0) zepsujaSie.push({ x, zostanie });
    }
  }
  pokazArkusz(`
    <h1>Zmieniam plany</h1>
    <p class="wyciszony">Stuknij dzień, żeby przełączyć: ${esc(dom)} albo ${esc(wyjazd)}.</p>
    <div class="dni">${dni.map((d) => {
      const poza = plan.poza_domem.includes(d);
      const data = dodaj(od, d);
      return `<button type="button" class="dzien" aria-pressed="${poza}" data-akcja="przelaczDzien" data-dzien="${d}" aria-label="${nazwaDnia(data)}: ${poza ? esc(wyjazd) : esc(dom)}">
        <b>${dzienKrotko(data)}</b><small>${poza ? esc(wyjazd).slice(0, 6) : "dom"}</small></button>`;
    }).join("")}</div>
    <p style="font-size:18px;font-weight:700">${posilkiWDomu > dostepne
      ? `W domu zjesz jeszcze ok. ${odmiana(posilkiWDomu, "obiad lub kolację", "obiady i kolacje", "obiadów i kolacji")}, a masz ${porcjeTxt(dostepne)}. Brakujące uzupełnisz kolacjami bez gotowania.`
      : `Masz ${porcjeTxt(dostepne)} na ${odmiana(posilkiWDomu, "posiłek", "posiłki", "posiłków")} w domu. Wystarczy.`}</p>
    ${zepsujaSie.length ? `<p class="wyciszony">Przed wyjazdem warto zamrozić:</p>
      <div class="lista">${zepsujaSie.map(({ x, zostanie }) => `<button type="button" class="wiersz" data-akcja="zamroz" data-id="${x.id}" data-ile="${zostanie}">Zamroź: ${esc(nazwa(x))} (${porcjeTxt(zostanie)})</button>`).join("")}</div>
      <p class="wyciszony maly">Resztę zjesz przed wyjazdem.</p>` : ""}
    <button type="button" class="przycisk szeroki" data-akcja="zamknij">Gotowe</button>`);
}

export const akcje = {
  drzwi(app, cel) {
    ustawDrzwi(otwarte === cel.dataset.co ? "" : cel.dataset.co);
  },
  zamknijDrzwi() {
    ustawDrzwi("");
  },
  naKarteczke(app, cel) {
    // Danie z półki trafia na karteczkę, a drzwi same się zasuwają.
    wybrane = cel.dataset.id;
    app.odswiez();
    requestAnimationFrame(() => requestAnimationFrame(() => ustawDrzwi("")));
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
    const d = Number(cel.dataset.dzien);
    plan.poza_domem = plan.poza_domem.includes(d) ? plan.poza_domem.filter((x) => x !== d) : [...plan.poza_domem, d].sort((a, b) => a - b);
    app.zapisz();
    arkuszPlanow(app);
    app.odswiez();
  },
};
