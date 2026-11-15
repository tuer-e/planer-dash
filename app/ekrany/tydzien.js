// Tydzień: gdzie jesteś, co gotujesz w poniedziałek (z „Zamień”), co bez gotowania i lista zakupów.
import { opcjePodmiany, porcje, slotyJedzone } from "../../silnik/generator.js";
import { listaZakupow, tekstPozycji } from "../../silnik/zakupy.js";
import { kontekst, planZDopisanymi, tenTydzien, ulozTydzien, usunDopisane, zamienDanie } from "../stan.js";
import { arkuszOpcji, dodaj, dzis, esc, kopiujTekst, krotkaNazwa, odmiana, pokazArkusz, porcjeTxt, powiadom, przyciskWiecej, zakresTygodnia, zamknijArkusz, zl } from "../narzedzia.js";
import { kafelDnia, przelacz, stanDnia, takieSame as takieSameDni, zPlanu as zPlanuDni } from "../wyjazdy.js";

// Szkic tygodnia przed ułożeniem: gdzie jesteś (dni, połówki) i ile osób je w danym dniu ({dzień: 2|3}).
const zPlanu = (plan) => ({ ...zPlanuDni(plan), osoby: { ...(plan?.osoby_dni ?? {}) } });
const takieSame = (a, b) => takieSameDni(a, b)
  && JSON.stringify(Object.entries(a.osoby ?? {}).sort()) === JSON.stringify(Object.entries(b.osoby ?? {}).sort());
import { usunProdukt } from "../kuchnia.js";
import { DNI_ZAKUPOW, dzienSkrot, GODZINY_ZAKUPOW, kiedyZakupy, opisKiedy, podzielListe, wDzien } from "../zakupy-kiedy.js";
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
  const dni = [1, 2, 3, 4, 5, 6, 7];
  const osoby = miejsca.osoby ?? {};
  return `<div class="sekcja">
    <h2>Gdzie jesteś</h2>
    <div class="dni" style="grid-template-columns:repeat(7,minmax(0,1fr))">${dni.map((d) =>
      kafelDnia(d, dodaj(od, d), stanDnia(miejsca, d), dom, wyjazd, "przelaczDzien")).join("")}</div>
    <p class="wyciszony maly">W poniedziałek zakupy i gotowanie. Stukaj dzień, żeby zmienić miejsce; przy połowie dnia górny napis to rano, dolny wieczór.</p>
    <h2>Ile osób je</h2>
    <div class="dni" style="grid-template-columns:repeat(7,minmax(0,1fr))">${dni.map((d) => {
      const n = osoby[d] ?? 1;
      const poza = stanDnia(miejsca, d) === "caly";
      return `<button type="button" class="dzien osoby${n > 1 ? " wiecej-osob" : ""}" data-akcja="przelaczOsoby" data-dzien="${d}"${poza ? " disabled" : ""}
        aria-label="${dzienSkrot(dodaj(od, d))}: ${poza ? "poza domem" : odmiana(n, "osoba", "osoby", "osób")}"><b>${dzienSkrot(dodaj(od, d))}</b><small>${poza ? "—" : `${n} os.`}</small></button>`;
    }).join("")}</div>
    <p class="wyciszony maly">Stuknij dzień: 1, 2 albo 3 osoby. Porcje i budżet liczą się na tyle osób.</p>
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
  // Który tydzień — widać w przełączniku pod datą, więc nad datą nie powtarzamy.
  const czesci = [`<header class="naglowek"><h1>${zakresTygodnia(od)}</h1></header>`, przelacznikTygodni(nastepny)];

  if (!plan) {
    if (wyjazdySzkic === null || wyjazdySzkic.od !== od) {
      const poprzedni = app.dane.tygodnie[dodaj(od, -7)];
      wyjazdySzkic = { od, ...zPlanuDni(poprzedni), osoby: {} };
    }
    czesci.push(dniWyjazdu(app, od, wyjazdySzkic));
    czesci.push(`<button type="button" class="przycisk glowny szeroki" data-akcja="uloz">Ułóż plan</button>
      <p class="wyciszony maly">Planer wybierze dania na poniedziałkowe gotowanie, kolacje bez gotowania i śniadania, w budżecie ${zl(app.dane.profil.budzet_tydzien_zl)}.</p>`);
    return czesci.join("");
  }

  const ctx = kontekst(app.dane, od);
  const zmienioneDni = wyjazdySzkic && wyjazdySzkic.od === od && !takieSame(wyjazdySzkic, zPlanu(plan));
  // Gdzie jesteś: jedna cicha linijka zamiast paska dni; zmiana dni pod „⋯ → Dni wyjazdów”.
  czesci.push(`<p class="ciemny maly gdzie">${esc(opisMiejsc(app, zmienioneDni ? wyjazdySzkic : zPlanu(plan)))}</p>`);
  if (zmienioneDni) {
    czesci.push(`<button type="button" class="przycisk glowny szeroki" data-akcja="uloz">Ułóż od nowa z tymi dniami</button>`);
  }

  // Każdy wiersz otwiera kartę dania (przepis, zamiana) — bez linków przy każdej pozycji.
  const wiersz = (g, prawo) => `<button type="button" class="wiersz" data-akcja="kartaDania" data-grupa="${g.id}">
      <span>${esc(krotkaNazwa(ctx.przepisy[g.przepis].nazwa, 40))}</span><span class="prawo">${esc(prawo)}</span></button>`;
  const partie = plan.grupy.filter((g) => g.rodzaj === "partia" && g.przepis && slotyJedzone(g).length);
  czesci.push(`<section class="sekcja"><h2>Gotujesz w poniedziałek</h2><div>${partie.map((g) => wiersz(g, porcjeTxt(porcje(g)))).join("")}</div></section>`);

  const zZamrazarki = plan.grupy.filter((g) => g.rodzaj === "zamrazarka" && slotyJedzone(g).length);
  if (zZamrazarki.length) {
    czesci.push(`<section class="sekcja"><h2>Z zamrażarki</h2>${zZamrazarki.map((g) => `<p>${esc(ctx.przepisy[g.przepis].nazwa)} · ${porcjeTxt(porcje(g))}</p>`).join("")}</section>`);
  }

  const bez = plan.grupy.filter((g) => ["kolacja", "szybki"].includes(g.rodzaj) && g.przepis);
  if (bez.length) {
    czesci.push(`<section class="sekcja"><h2>Kolacje bez gotowania</h2><div>${bez.map((g) => wiersz(g, dniGrupy(g, od))).join("")}</div></section>`);
  }

  const warianty = plan.grupy.filter((g) => g.rodzaj === "wariant" && g.przepis);
  for (const [posilek, tytul] of [["sniadanie", "Śniadania"], ["przekaska", "Przekąski"]]) {
    const lista = warianty.filter((g) => g.posilek === posilek);
    if (lista.length) czesci.push(`<section class="sekcja"><h2>${tytul}</h2><div>${lista.map((g) => wiersz(g, WARIANTY_OPIS[g.id.slice(-1)] ?? "")).join("")}</div></section>`);
  }

  const lista = listaZakupow(planZDopisanymi(app.dane, od), ctx, app.dane.zapasy);
  const ile = lista.dzialy.reduce((s, d) => s + d.pozycje.length, 0);
  czesci.push(`<section class="karta">
    <div class="rozsun"><h3>Zakupy</h3><b>ok. ${zl(lista.koszt.w_sklepie_zl)}</b></div>
    <p class="wyciszony maly">${odmiana(ile, "pozycja", "pozycje", "pozycji")} · budżet ${zl(lista.koszt.budzet_zl)}</p>
    <div class="rzad-glowny"><a class="przycisk${zmienioneDni ? "" : " glowny"}" href="${adres(nastepny, true)}">Lista zakupów</a>${przyciskWiecej("opcjeTygodnia")}</div>
    ${linijkaKiedy(app, od, plan)}
  </section>`);
  return czesci.join("");
}

// „sob–nd: <wyjazd> · pt wieczorem: <wyjazd>” albo „Cały tydzień: <dom>”.
function opisMiejsc(app, miejsca) {
  const { dom, wyjazd } = app.dane.profil;
  const OPIS = { caly: "", wieczor: " wieczorem", rano: " rano" };
  const KROTKO = ["pon", "wt", "śr", "czw", "pt", "sob", "nd", "pon"];
  const czesci = [];
  for (let d = 1; d <= 7; d++) {
    const st = stanDnia(miejsca, d);
    if (st === "dom") continue;
    let k = d;
    while (st === "caly" && k + 1 <= 7 && stanDnia(miejsca, k + 1) === "caly") k++;
    czesci.push(`${KROTKO[d]}${k > d ? `–${KROTKO[k]}` : ""}${OPIS[st]}: ${wyjazd}`);
    d = k;
  }
  const osoby = Object.entries(miejsca.osoby ?? {}).filter(([, n]) => n > 1).sort((a, b) => a[0] - b[0]);
  const ludzie = osoby.length ? [`${osoby.map(([d, n]) => `${KROTKO[d]}: ${n} os.`).join(", ")}`] : [];
  return [...(czesci.length ? czesci : [`Cały tydzień: ${dom}`]), ...ludzie].join(" · ");
}

function dniGrupy(g, od) {
  return [...new Set(slotyJedzone(g).map(([d]) => dzienSkrot(dodaj(od, d))))].join(", ");
}

function arkuszWyjazdow(app, od) {
  const plan = app.dane.tygodnie[od];
  const m = wyjazdySzkic && wyjazdySzkic.od === od ? wyjazdySzkic : zPlanu(plan);
  const zmienione = plan && !takieSame(m, zPlanu(plan));
  pokazArkusz(`<h1>Dni i osoby</h1>${dniWyjazdu(app, od, m)}
    ${zmienione ? `<button type="button" class="przycisk glowny szeroki" data-akcja="uloz">Ułóż od nowa z tymi dniami</button>` : ""}
    <button type="button" class="link" data-akcja="zamknijWyjazdy" style="align-self:flex-start">${zmienione ? "zostaw na później" : "zamknij"}</button>`);
}

function opcjeTygodnia(app, od, nastepny) {
  const plan = app.dane.tygodnie[od];
  arkuszOpcji("Więcej", [
    { nazwa: "Wyślij do Kalendarza i Przypomnień", opis: opisWyslania(plan), akcja: "wyslij" },
    { nazwa: "Dzień zakupów", opis: opisKiedy(od, kiedyZakupy(plan, app.dane.profil)), akcja: "zmienZakupy" },
    nastepny ? null : { nazwa: "Zacznij gotowanie", href: "#gotowanie" },
    { nazwa: "Dni i osoby", opis: opisMiejsc(app, zPlanu(plan)), akcja: "wyjazdy" },
    { nazwa: "Ułóż tydzień od nowa", akcja: "ulozOdNowa" },
  ]);
}

function kartaDania(app, od, idGrupy) {
  const plan = app.dane.tygodnie[od];
  const g = plan.grupy.find((x) => x.id === idGrupy);
  if (!g) return;
  const ctx = kontekst(app.dane, od);
  const p = ctx.przepisy[g.przepis];
  const opis = g.rodzaj === "partia" ? opisDania(g, ctx) : `${g.rodzaj === "wariant" ? WARIANTY_OPIS[g.id.slice(-1)] ?? "" : dniGrupy(g, od)} · ok. ${p.czas_min} min`;
  arkuszOpcji(p.nazwa, [
    { nazwa: "Przepis", href: `#przepis/${encodeURIComponent(g.przepis)}` },
    { nazwa: "Zamień na inne danie", akcja: "zamien", dane: { grupa: g.id } },
    g.rodzaj === "partia" ? { nazwa: "Gotuj tylko to", opis: "krok po kroku", href: `#gotowanie/przepis/${encodeURIComponent(g.przepis)}` } : null,
  ], { opis });
}

// --- Kalendarz i Przypomnienia (przez skrót „Planer DASH” w aplikacji Skróty) ---

function opisWyslania(plan) {
  if (!plan?.wyslano) return "";
  const t = new Date(plan.wyslano);
  const kiedy = dzis(t) === dzis() ? "dziś" : `${t.getDate()}.${String(t.getMonth() + 1).padStart(2, "0")}`;
  return `ostatnio: ${kiedy} o ${t.getHours()}:${String(t.getMinutes()).padStart(2, "0")}`;
}

function wyslijDoSkrotow(app, od) {
  const { plan, ctx, lista, kiedy, dokup, linie } = linieZakupow(app, od);
  const paczka = paczkaDlaSkrotu(plan, ctx, app.dane.profil, {
    zakupy: { pozycje: linie.length, koszt_zl: lista.koszt.w_sklepie_zl }, pozycje: linie,
    adres: `${location.origin}${location.pathname}`, kiedy, dokup: dokup.map((x) => tekstPozycji(x)),
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

// --- Kiedy zakupy (z wyprzedzeniem) ---

// Lista zakupów tygodnia podzielona według dnia zakupów: teraz i „dokup” w dniu gotowania.
function zakupyTygodnia(app, od) {
  const plan = app.dane.tygodnie[od];
  const ctx = kontekst(app.dane, od);
  const lista = listaZakupow(planZDopisanymi(app.dane, od), ctx, app.dane.zapasy);
  const kiedy = kiedyZakupy(plan, app.dane.profil);
  const wszystkie = lista.dzialy.flatMap((d) => d.pozycje);
  const { teraz, dokup } = podzielListe(wszystkie, planZDopisanymi(app.dane, od), ctx, kiedy);
  return { plan, ctx, lista, kiedy, teraz, dokup, dzienDokupu: od };
}

// Linie do Przypomnień i do „Kopiuj listę”: najpierw zakupy, potem to, co dokupić, z dopiskiem kiedy.
function linieZakupow(app, od) {
  const z = zakupyTygodnia(app, od);
  const zKuchni = (app.dane.dopisane_produkty?.[od] ?? []).map((id) => z.ctx.produkty[id]?.nazwa ?? id);
  const kiedyDokup = `dokup ${wDzien(od).slice(0, 5)}.`; // „dokup w pon.”
  return { ...z, linie: [...z.teraz.map(tekstPozycji), ...zKuchni, ...z.dokup.map((x) => `${tekstPozycji(x)} (${kiedyDokup})`)] };
}

// Informacja o zakupach tylko wtedy, gdy coś znaczy: zakupy nie w poniedziałek albo jest co dokupić.
function linijkaKiedy(app, od) {
  const z = zakupyTygodnia(app, od);
  if (z.kiedy.dzien === 0 && !z.dokup.length) return "";
  return `<p class="ciemny maly kiedy-zakupy">zakupy: ${opisKiedy(od, z.kiedy)}${z.dokup.length ? ` · ${wDzien(od)} dokupisz: ${z.dokup.map((x) => esc(nazwaKrotka(x.nazwa))).join(", ")}` : ""}</p>`;
}

const nazwaKrotka = (n) => n.replace(/\s*\(.*?\)/g, "").replace(/\s+\d[\d,.]*(\s*[×x]\s*\d[\d,.]*)?\s*(g|kg|ml|l|szt\.?)(?=\s|$).*$/i, "").trim().toLowerCase();

function arkuszZakupow(app, od) {
  const z = zakupyTygodnia(app, od);
  const wyb = (on) => `przycisk${on ? " wybrany-wybor" : ""}`;
  pokazArkusz(`<h1>Kiedy robisz zakupy?</h1>
    <div class="rzad" role="group" aria-label="Dzień zakupów">${DNI_ZAKUPOW.map((d) => {
      const iso = dodaj(od, d);
      return `<button type="button" class="${wyb(d === z.kiedy.dzien)} wybor-dnia" aria-pressed="${d === z.kiedy.dzien}" data-akcja="zakupyDzien" data-d="${d}">
        <b>${dzienSkrot(iso)}</b><span class="maly">${Number(iso.slice(8))}.${iso.slice(5, 7)}</span></button>`;
    }).join("")}</div>
    <div class="rzad" role="group" aria-label="Godzina zakupów">${[...new Set([...GODZINY_ZAKUPOW, z.kiedy.godzina])].sort().map((g) => `
      <button type="button" class="${wyb(g === z.kiedy.godzina)}" aria-pressed="${g === z.kiedy.godzina}" data-akcja="zakupyGodzina" data-g="${g}">${g}</button>`).join("")}</div>
    <p class="wyciszony">${z.dokup.length
      ? `Świeże, które by nie wytrzymały (${z.dokup.map((x) => esc(nazwaKrotka(x.nazwa))).join(", ")}), planer przeniesie na ${esc(wDzien(od).replace("w ", ""))} przed gotowaniem.`
      : "Wszystko kupisz za jednym razem."}</p>
    <button type="button" class="przycisk glowny szeroki" data-akcja="zakupyGotowe">Gotowe</button>`);
}


function rysujZakupy(app, od, plan, nastepny) {
  const { ctx, lista, kiedy, teraz, dokup } = zakupyTygodnia(app, od);
  const kupione = app.dane.kupione[od] ?? {};
  const wiersz = (x) => `
      <label class="zakupy-pozycja${kupione[x.id] ? " kupione" : ""}">
        <input type="checkbox" data-zmiana="kupione" data-id="${x.id}"${kupione[x.id] ? " checked" : ""}>
        <span style="flex-grow:1"><b>${esc(x.nazwa)}</b><br><span class="wyciszony maly">${esc(x.ilosc)}${x.do_sprawdzenia ? " · sprawdź, czy masz" : ""}</span></span>
        ${x.do_sprawdzenia ? `<button type="button" class="link" data-akcja="mam" data-id="${x.id}">mam</button>` : ""}
      </label>`;
  const dopisane = app.dane.dodatkowe[od] ?? [];
  const produktyZKuchni = app.dane.dopisane_produkty?.[od] ?? [];
  const ile = lista.dzialy.reduce((s, d) => s + d.pozycje.length, 0);
  const ileKupione = lista.dzialy.reduce((s, d) => s + d.pozycje.filter((x) => kupione[x.id]).length, 0);
  return `<header class="naglowek"><a class="link" href="${adres(nastepny, false)}">‹ ${zakresTygodnia(od)}</a><h1>Lista zakupów</h1>
      <p class="wyciszony">ok. ${zl(lista.koszt.w_sklepie_zl)} · ${ileKupione} z ${ile} w koszyku</p>
      ${kiedy.dzien !== 0 ? `<p class="ciemny maly">zakupy: ${opisKiedy(od, kiedy)}</p>` : ""}</header>
    <div class="rzad-glowny"><button type="button" class="przycisk glowny" data-akcja="kopiujListe">Kopiuj listę</button>${przyciskWiecej("opcjeListy")}</div>
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
    ${dokup.length ? `<h2 class="czesc-zakupow">Kup ${esc(wDzien(dodaj(od, kiedy.dzien)))}</h2>
      <p class="ciemny maly">Trwałe i to, co wytrzyma do użycia.</p>` : ""}
    ${lista.dzialy.map((d) => ({ ...d, pozycje: d.pozycje.filter((x) => teraz.includes(x)) })).filter((d) => d.pozycje.length)
      .map((d) => `<section class="sekcja"><h2>${esc(d.nazwa)}</h2><div>${d.pozycje.map(wiersz).join("")}</div></section>`).join("")}
    ${dokup.length ? `<h2 class="czesc-zakupow">Dokup ${esc(wDzien(od))}</h2>
      <p class="ciemny maly">Przed gotowaniem — świeże, które do tego czasu by nie wytrzymały.</p>
      <section class="sekcja"><div>${dokup.map(wiersz).join("")}</div></section>` : ""}
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
    wyjazdySzkic = { od, ...przelacz(wyjazdySzkic, d), osoby: wyjazdySzkic.osoby ?? {} };
    app.odswiez();
    if (app.dane.tygodnie[od]) arkuszWyjazdow(app, od);
  },
  przelaczOsoby(app, cel) {
    const { od } = wybranyTydzien(app);
    const d = Number(cel.dataset.dzien);
    if (!wyjazdySzkic || wyjazdySzkic.od !== od) wyjazdySzkic = { od, ...zPlanu(app.dane.tygodnie[od]) };
    const osoby = { ...(wyjazdySzkic.osoby ?? {}) };
    const n = ((osoby[d] ?? 1) % 3) + 1;
    if (n > 1) osoby[d] = n;
    else delete osoby[d];
    wyjazdySzkic = { ...wyjazdySzkic, osoby };
    app.odswiez();
    if (app.dane.tygodnie[od]) arkuszWyjazdow(app, od);
  },
  opcjeTygodnia(app) {
    const { od, nastepny } = wybranyTydzien(app);
    opcjeTygodnia(app, od, nastepny);
  },
  opcjeListy(app) {
    const { od } = wybranyTydzien(app);
    const plan = app.dane.tygodnie[od];
    arkuszOpcji("Więcej", [
      { nazwa: "Wyślij do Kalendarza i Przypomnień", opis: opisWyslania(plan), akcja: "wyslij" },
      { nazwa: "Dzień zakupów", opis: opisKiedy(od, kiedyZakupy(plan, app.dane.profil)), akcja: "zmienZakupy" },
    ]);
  },
  kartaDania(app, cel) {
    kartaDania(app, wybranyTydzien(app).od, cel.dataset.grupa);
  },
  wyjazdy(app) {
    arkuszWyjazdow(app, wybranyTydzien(app).od);
  },
  zamknijWyjazdy(app) {
    zamknijArkusz();
    app.odswiez();
  },
  uloz(app, cel) {
    const { od } = wybranyTydzien(app);
    zamknijArkusz();
    cel.disabled = true;
    cel.textContent = "Układam…";
    setTimeout(() => {
      const m = wyjazdySzkic && wyjazdySzkic.od === od ? wyjazdySzkic : zPlanu(app.dane.tygodnie[od]);
      ulozTydzien(app.dane, od, m.dni, m.pol, m.osoby ?? {});
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
  zmienZakupy(app) {
    arkuszZakupow(app, wybranyTydzien(app).od);
  },
  zakupyDzien(app, cel) {
    const { od } = wybranyTydzien(app);
    const plan = app.dane.tygodnie[od];
    plan.zakupy = { ...kiedyZakupy(plan, app.dane.profil), dzien: Number(cel.dataset.d) };
    app.zapisz();
    arkuszZakupow(app, od);
  },
  zakupyGodzina(app, cel) {
    const { od } = wybranyTydzien(app);
    const plan = app.dane.tygodnie[od];
    plan.zakupy = { ...kiedyZakupy(plan, app.dane.profil), godzina: cel.dataset.g };
    app.zapisz();
    arkuszZakupow(app, od);
  },
  zakupyGotowe(app) {
    zamknijArkusz();
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
    const tekst = linieZakupow(app, od).linie.join("\n");
    powiadom((await kopiujTekst(tekst)) ? "Skopiowane. Wklej do Przypomnień." : "Nie udało się skopiować.");
  },
};
