// Tydzień: gdzie jesteś, co gotujesz w poniedziałek (z „Zamień”), co bez gotowania i lista zakupów.
import { opcjePodmiany, porcje, slotyJedzone } from "../../silnik/generator.js";
import { listaZakupow } from "../../silnik/zakupy.js";
import { kontekst, planZDopisanymi, tenTydzien, ulozTydzien, usunDopisane, zamienDanie } from "../stan.js";
import { dodaj, dzis, esc, kopiujTekst, odmiana, pokazArkusz, porcjeTxt, powiadom, zakresTygodnia, zamknijArkusz, zl } from "../narzedzia.js";
import { kafelDnia, przelacz, stanDnia, takieSame, zPlanu } from "../wyjazdy.js";
import { usunProdukt } from "../kuchnia.js";
import { adresSkrotu, NAZWA_KALENDARZA, NAZWA_LISTY, NAZWA_SKROTU, paczkaDlaSkrotu } from "../kalendarz.js";

const WARIANTY_OPIS = { A: "pon–śr", B: "czw–pt", C: "sob–pon" };
let wyjazdySzkic = null; // dni wyjazdu wybrane przed ułożeniem planu

function wybranyTydzien(app) {
  const czesci = (app.argument ?? "").split("/");
  const od = czesci.includes("nastepny") ? dodaj(tenTydzien(), 7) : tenTydzien();
  return { od, nastepny: czesci.includes("nastepny"), zakupy: czesci.includes("zakupy") };
}

const adres = (nastepny, zakupy) => `#tydzien${nastepny ? "/nastepny" : ""}${zakupy ? "/zakupy" : ""}`;

function przelacznikTygodni(nastepny) {
  return `<nav class="tygodnie" aria-label="Który tydzień">
    <a href="#tydzien" aria-current="${nastepny ? "false" : "page"}">Ten tydzień</a>
    <a href="#tydzien/nastepny" aria-current="${nastepny ? "page" : "false"}">Następny</a>
  </nav>`;
}

function dniWyjazdu(app, od, miejsca) {
  const { dom, wyjazd } = app.dane.profil;
  return `<div class="sekcja">
    <h2>Gdzie jesteś</h2>
    <div class="dni" style="grid-template-columns:repeat(7,minmax(0,1fr))">${[1, 2, 3, 4, 5, 6, 7].map((d) =>
      kafelDnia(d, dodaj(od, d), stanDnia(miejsca, d), dom, wyjazd, "przelaczDzien")).join("")}</div>
    <p class="wyciszony maly">W poniedziałek zakupy i gotowanie. Stukaj dzień, żeby zmienić miejsce; przy połowie dnia górny napis to rano, dolny wieczór.</p>
  </div>`;
}

function opisDania(g, ctx) {
  const p = ctx.przepisy[g.przepis];
  return `${porcjeTxt(porcje(g))} · lodówka ${odmiana(p.trwalosc_dni, "dzień", "dni", "dni")}${p.mrozi_sie ? " · mrozi się" : ""} · ok. ${p.czas_min} min`;
}

export function rysuj(app) {
  const { od, nastepny, zakupy } = wybranyTydzien(app);
  const plan = app.dane.tygodnie[od];
  if (zakupy && plan) return rysujZakupy(app, od, plan, nastepny);
  const czesci = [`<header class="naglowek"><p class="wyciszony">${nastepny ? "Następny tydzień" : "Ten tydzień"}</p><h1>${zakresTygodnia(od)}</h1></header>`, przelacznikTygodni(nastepny)];

  if (!plan) {
    if (wyjazdySzkic === null || wyjazdySzkic.od !== od) {
      const poprzedni = app.dane.tygodnie[dodaj(od, -7)];
      wyjazdySzkic = { od, ...zPlanu(poprzedni) };
    }
    czesci.push(dniWyjazdu(app, od, wyjazdySzkic));
    czesci.push(`<button type="button" class="przycisk glowny szeroki" data-akcja="uloz">Ułóż plan</button>
      <p class="wyciszony maly">Planer wybierze dania na poniedziałkowe gotowanie, kolacje bez gotowania i śniadania, w budżecie ${zl(app.dane.profil.budzet_tydzien_zl)}.</p>`);
    return czesci.join("");
  }

  const ctx = kontekst(app.dane, od);
  const zmienioneDni = wyjazdySzkic && wyjazdySzkic.od === od && !takieSame(wyjazdySzkic, zPlanu(plan));
  czesci.push(dniWyjazdu(app, od, zmienioneDni ? wyjazdySzkic : zPlanu(plan)));
  if (zmienioneDni) {
    czesci.push(`<button type="button" class="przycisk glowny szeroki" data-akcja="uloz">Ułóż od nowa z tymi dniami</button>`);
  }

  const partie = plan.grupy.filter((g) => g.rodzaj === "partia" && g.przepis && slotyJedzone(g).length);
  czesci.push(`<section class="sekcja"><h2>Gotujesz w poniedziałek</h2><div class="lista">${partie.map((g) => `
    <article class="karta">
      <h3>${esc(ctx.przepisy[g.przepis].nazwa)}</h3>
      <p class="wyciszony maly">${opisDania(g, ctx)}</p>
      <div class="rzad">
        <button type="button" class="link" data-akcja="zamien" data-grupa="${g.id}">zamień</button>
        <a class="link" href="#przepis/${encodeURIComponent(g.przepis)}">przepis</a>
      </div>
    </article>`).join("")}</div></section>`);

  const zZamrazarki = plan.grupy.filter((g) => g.rodzaj === "zamrazarka" && slotyJedzone(g).length);
  if (zZamrazarki.length) {
    czesci.push(`<section class="sekcja"><h2>Z zamrażarki</h2>${zZamrazarki.map((g) => `<p>${esc(ctx.przepisy[g.przepis].nazwa)} · ${porcjeTxt(porcje(g))}</p>`).join("")}</section>`);
  }

  const bez = plan.grupy.filter((g) => ["kolacja", "szybki"].includes(g.rodzaj) && g.przepis);
  if (bez.length) {
    czesci.push(`<section class="sekcja"><h2>Kolacje bez gotowania</h2><div class="lista">${bez.map((g) => `
      <div class="rozsun"><a class="cichy-link" href="#przepis/${encodeURIComponent(g.przepis)}">${esc(ctx.przepisy[g.przepis].nazwa)}</a>
      <button type="button" class="link" data-akcja="zamien" data-grupa="${g.id}">zamień</button></div>`).join("")}</div></section>`);
  }

  const warianty = plan.grupy.filter((g) => g.rodzaj === "wariant" && g.przepis);
  if (warianty.length) {
    const wiersz = (posilek, tytul) => {
      const lista = warianty.filter((g) => g.posilek === posilek);
      return lista.length ? `<h2>${tytul}</h2><div class="lista">${lista.map((g) => `
        <div class="rozsun"><a class="cichy-link" href="#przepis/${encodeURIComponent(g.przepis)}">${esc(ctx.przepisy[g.przepis].nazwa)}</a>
        <span class="wyciszony maly" style="white-space:nowrap">${WARIANTY_OPIS[g.id.slice(-1)] ?? ""}</span></div>`).join("")}</div>` : "";
    };
    czesci.push(`<section class="sekcja">${wiersz("sniadanie", "Śniadania")}${wiersz("przekaska", "Przekąski")}</section>`);
  }

  const lista = listaZakupow(planZDopisanymi(app.dane, od), ctx, app.dane.zapasy);
  const ile = lista.dzialy.reduce((s, d) => s + d.pozycje.length, 0);
  czesci.push(`<section class="karta">
    <div class="rozsun"><h3>Zakupy</h3><b>ok. ${zl(lista.koszt.w_sklepie_zl)}</b></div>
    <p class="wyciszony maly">${odmiana(ile, "pozycja", "pozycje", "pozycji")} · budżet ${zl(lista.koszt.budzet_zl)}</p>
    <a class="przycisk${zmienioneDni ? "" : " glowny"} szeroki" href="${adres(nastepny, true)}">Lista zakupów</a>
    <div class="rzad">${nastepny ? "" : `<a class="link" href="#gotowanie">zacznij gotowanie</a>`}${linkWyslij(plan)}</div>
    ${opisWyslania(plan)}
  </section>
  <button type="button" class="link" data-akcja="ulozOdNowa">Ułóż cały tydzień od nowa</button>`);
  return czesci.join("");
}

// --- Kalendarz i Przypomnienia (przez skrót „Planer DASH” w aplikacji Skróty) ---

function linkWyslij() {
  return `<button type="button" class="link" data-akcja="wyslij">wyślij do Kalendarza i Przypomnień</button>`;
}

function opisWyslania(plan) {
  if (!plan.wyslano) return "";
  const t = new Date(plan.wyslano);
  const kiedy = dzis(t) === dzis() ? "dziś" : `${t.getDate()}.${String(t.getMonth() + 1).padStart(2, "0")}`;
  return `<p class="ciemny maly">Wysłane do Skrótów ${kiedy} o ${t.getHours()}:${String(t.getMinutes()).padStart(2, "0")}.</p>`;
}

function wyslijDoSkrotow(app, od) {
  const plan = app.dane.tygodnie[od];
  const ctx = kontekst(app.dane, od);
  const lista = listaZakupow(planZDopisanymi(app.dane, od), ctx, app.dane.zapasy);
  const zKuchni = (app.dane.dopisane_produkty?.[od] ?? []).map((id) => ctx.produkty[id]?.nazwa ?? id);
  const pozycje = [...lista.tekst_przypomnienia.split("\n").filter(Boolean), ...zKuchni];
  const paczka = paczkaDlaSkrotu(plan, ctx, app.dane.profil, {
    zakupy: { pozycje: pozycje.length, koszt_zl: lista.koszt.w_sklepie_zl }, pozycje,
    adres: `${location.origin}${location.pathname}`,
  });
  plan.wyslano = new Date().toISOString();
  app.dane.skrot_uzyty = true;
  app.zapisz();
  zamknijArkusz();
  app.odswiez();
  location.href = adresSkrotu(paczka);
}

// Za pierwszym razem: krótko, co się stanie i że potrzebny jest skrót.
function arkuszWysylki() {
  pokazArkusz(`<h1>Kalendarz i Przypomnienia</h1>
    <p>Planer otworzy skrót „${NAZWA_SKROTU}” w aplikacji Skróty. Skrót wpisze zakupy, gotowanie i „Na jutro” do Kalendarza i zastąpi listę zakupów w Przypomnieniach — w kalendarzu i na liście wybranych przy dodawaniu skrótu (zwykle „${NAZWA_KALENDARZA}” i „${NAZWA_LISTY}”).</p>
    <p class="wyciszony maly">Przed usunięciem starych wpisów Skróty zapytają o zgodę.</p>
    <p class="wyciszony maly">Skrót dodajesz raz. Jeśli go jeszcze nie masz, Skróty pokażą, że go nie znalazły — nic się wtedy nie zmieni.</p>
    <button type="button" class="przycisk glowny szeroki" data-akcja="wyslijTak">Wyślij</button>
    <button type="button" class="link" data-akcja="zamknij">anuluj</button>`);
}

function rysujZakupy(app, od, plan, nastepny) {
  const ctx = kontekst(app.dane, od);
  const lista = listaZakupow(planZDopisanymi(app.dane, od), ctx, app.dane.zapasy);
  const kupione = app.dane.kupione[od] ?? {};
  const dopisane = app.dane.dodatkowe[od] ?? [];
  const produktyZKuchni = app.dane.dopisane_produkty?.[od] ?? [];
  const ile = lista.dzialy.reduce((s, d) => s + d.pozycje.length, 0);
  const ileKupione = lista.dzialy.reduce((s, d) => s + d.pozycje.filter((x) => kupione[x.id]).length, 0);
  return `<header class="naglowek"><a class="link" href="${adres(nastepny, false)}">‹ ${zakresTygodnia(od)}</a><h1>Lista zakupów</h1>
      <p class="wyciszony">ok. ${zl(lista.koszt.w_sklepie_zl)} · ${ileKupione} z ${ile} w koszyku</p></header>
    <div class="rzad"><button type="button" class="przycisk glowny" data-akcja="kopiujListe">Kopiuj listę</button>${linkWyslij(plan)}</div>
    ${opisWyslania(plan)}
    ${dopisane.length ? `<section class="sekcja"><h2>Dopisane spoza planu</h2>${dopisane.map((x) => `
      <div class="rozsun"><a class="link" href="#przepis/${encodeURIComponent(x.przepis)}">${esc(ctx.przepisy[x.przepis]?.nazwa ?? x.przepis)} · ${porcjeTxt(x.porcje)}</a>
      <button type="button" class="link" data-akcja="usunDopisane" data-id="${x.id}">Usuń</button></div>`).join("")}
      <p class="wyciszony maly">Ich składniki są już na liście poniżej.</p></section>` : ""}
    ${produktyZKuchni.length ? `<section class="sekcja"><h2>Dopisane z kuchni</h2><div>${produktyZKuchni.map((id) => `
      <label class="zakupy-pozycja${kupione[`+${id}`] ? " kupione" : ""}">
        <input type="checkbox" data-zmiana="kupione" data-id="+${esc(id)}"${kupione[`+${id}`] ? " checked" : ""}>
        <span style="flex-grow:1"><b>${esc(ctx.produkty[id]?.nazwa ?? id)}</b></span>
        <button type="button" class="link" data-akcja="usunProdukt" data-id="${esc(id)}">usuń</button>
      </label>`).join("")}</div></section>` : ""}
    ${lista.dzialy.map((d) => `<section class="sekcja"><h2>${esc(d.nazwa)}</h2><div>${d.pozycje.map((x) => `
      <label class="zakupy-pozycja${kupione[x.id] ? " kupione" : ""}">
        <input type="checkbox" data-zmiana="kupione" data-id="${x.id}"${kupione[x.id] ? " checked" : ""}>
        <span style="flex-grow:1"><b>${esc(x.nazwa)}</b><br><span class="wyciszony maly">${esc(x.ilosc)}${x.do_sprawdzenia ? " · sprawdź, czy masz" : ""}</span></span>
        ${x.do_sprawdzenia ? `<button type="button" class="link" data-akcja="mam" data-id="${x.id}">mam</button>` : ""}
      </label>`).join("")}</div></section>`).join("")}
    ${lista.przeglad_zapasow.some((x) => x.stan === "jest" && x.potrzebny) ? `<section class="sekcja"><h2>Masz w szafce</h2>${lista.przeglad_zapasow.filter((x) => x.stan === "jest" && x.potrzebny).map((x) => `
      <div class="rozsun"><span>${esc(x.nazwa)}</span><button type="button" class="link" data-akcja="konczySie" data-id="${x.id}">Kończy się</button></div>`).join("")}</section>` : ""}`;
}

function arkuszZamiany(app, idGrupy) {
  const { od } = wybranyTydzien(app);
  const ctx = kontekst(app.dane, od);
  const opcje = opcjePodmiany(app.dane.tygodnie[od], idGrupy, ctx).filter((o) => !o.problemy.length).slice(0, 8);
  pokazArkusz(`<h1>Zamień na</h1>
    ${opcje.length ? `<div class="lista">${opcje.map((o) => `
      <button type="button" class="przycisk szeroki" style="justify-content:space-between;gap:14px;text-align:left;font-weight:600;padding:12px 16px" data-akcja="wybierzZamiane" data-grupa="${idGrupy}" data-przepis="${o.przepis}">
        <span>${esc(o.nazwa)}${o.niedawno ? " · było niedawno" : ""}</span><span class="maly" style="white-space:nowrap">${zl(o.koszt_zl)}/porcja</span></button>`).join("")}</div>`
      : `<p class="wyciszony">Nie ma innych dań, które pasują tu bez łamania zasad (sól, czerwone mięso, czas gotowania).</p>`}
    <button type="button" class="przycisk szeroki" data-akcja="zamknij">Zostaw jak jest</button>`);
}

export const akcje = {
  przelaczDzien(app, cel) {
    const { od } = wybranyTydzien(app);
    const d = Number(cel.dataset.dzien);
    if (!wyjazdySzkic || wyjazdySzkic.od !== od) wyjazdySzkic = { od, ...zPlanu(app.dane.tygodnie[od]) };
    wyjazdySzkic = { od, ...przelacz(wyjazdySzkic, d) };
    app.odswiez();
  },
  uloz(app, cel) {
    const { od } = wybranyTydzien(app);
    zamknijArkusz();
    cel.disabled = true;
    cel.textContent = "Układam…";
    setTimeout(() => {
      const m = wyjazdySzkic && wyjazdySzkic.od === od ? wyjazdySzkic : zPlanu(app.dane.tygodnie[od]);
      ulozTydzien(app.dane, od, m.dni, m.pol);
      wyjazdySzkic = null;
      app.zapisz();
      app.odswiez();
      powiadom("Plan gotowy.");
    }, 30);
  },
  ulozOdNowa(app) {
    pokazArkusz(`<h1>Ułożyć od nowa?</h1><p class="wyciszony">Twoje zamiany dań w tym tygodniu przepadną, a lista zakupów się zmieni.</p>
      <button type="button" class="przycisk glowny szeroki" data-akcja="uloz">Ułóż od nowa</button>
      <button type="button" class="przycisk szeroki" data-akcja="zamknij">Zostaw</button>`);
  },
  zamien(app, cel) {
    arkuszZamiany(app, cel.dataset.grupa);
  },
  wybierzZamiane(app, cel) {
    const { od } = wybranyTydzien(app);
    zamienDanie(app.dane, od, cel.dataset.grupa, cel.dataset.przepis);
    app.zapisz();
    zamknijArkusz();
    app.odswiez();
    powiadom("Zamienione. Lista zakupów jest już zmieniona.");
  },
  kupione(app, cel) {
    const { od } = wybranyTydzien(app);
    const k = app.dane.kupione[od] ?? (app.dane.kupione[od] = {});
    if (cel.checked) k[cel.dataset.id] = true;
    else delete k[cel.dataset.id];
    app.zapisz();
    app.odswiez();
  },
  usunDopisane(app, cel) {
    const { od } = wybranyTydzien(app);
    usunDopisane(app.dane, od, cel.dataset.id);
    app.zapisz();
    app.odswiez();
  },
  usunProdukt(app, cel) {
    const { od } = wybranyTydzien(app);
    usunProdukt(app.dane, od, cel.dataset.id);
    app.zapisz();
    app.odswiez();
  },
  mam(app, cel) {
    app.dane.zapasy[cel.dataset.id] = { stan: "jest", data: dzis() };
    app.zapisz();
    app.odswiez();
  },
  konczySie(app, cel) {
    app.dane.zapasy[cel.dataset.id] = { stan: "konczy_sie", data: dzis() };
    app.zapisz();
    app.odswiez();
  },
  wyslij(app) {
    if (!app.dane.skrot_uzyty) return arkuszWysylki();
    wyslijDoSkrotow(app, wybranyTydzien(app).od);
  },
  wyslijTak(app) {
    wyslijDoSkrotow(app, wybranyTydzien(app).od);
  },
  async kopiujListe(app) {
    const { od } = wybranyTydzien(app);
    const lista = listaZakupow(planZDopisanymi(app.dane, od), kontekst(app.dane, od), app.dane.zapasy);
    const ctx = kontekst(app.dane, od);
    const zKuchni = (app.dane.dopisane_produkty?.[od] ?? []).map((id) => ctx.produkty[id]?.nazwa ?? id);
    const tekst = [lista.tekst_przypomnienia, ...zKuchni].filter(Boolean).join("\n");
    powiadom((await kopiujTekst(tekst)) ? "Skopiowane. Wklej do Przypomnień." : "Nie udało się skopiować.");
  },
};
