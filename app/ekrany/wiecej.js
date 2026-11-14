// Więcej: przepisy, profil, kopia zapasowa i mała „Zgłoś uwagę”.
import { AKTYWNOSC, celeDzienne } from "../../silnik/cele.js";
import { eksport, importuj, kontekst, przepisy, tenTydzien, wczytajKatalog } from "../stan.js";
import { godzinyPosilkow, minuty, POSILKI_KUCHNI } from "../kuchnia.js";
import { dzis, esc, kopiujTekst, odmiana, pokazArkusz, powiadom, roznica, zamknijArkusz } from "../narzedzia.js";

let szukaj = "";

const NAZWY_AKTYWNOSCI = { siedzaca: "Siedząca", lekka: "Lekka (codzienny ruch ok. 30 min)", umiarkowana: "Umiarkowana", wysoka: "Wysoka" };
const POSILKI = { sniadanie: "śniadanie", przekaska: "przekąska", obiad: "obiad", kolacja: "kolacja", deser: "deser" };

export function rysuj(app) {
  const [widok, ...reszta] = (app.argument ?? "").split("/");
  if (widok === "przepisy") return rysujPrzepisy();
  if (widok === "przepis") {
    location.replace(`#przepis/${reszta.join("/")}`);
    return "";
  }
  if (widok === "profil") return rysujProfil(app);
  if (widok === "kopia") return rysujKopie(app);
  if (widok === "uwaga") return rysujUwage(app);
  const kopia = app.dane.ostatnia_kopia;
  const dawnoKopia = !kopia || roznica(dzis(), kopia) >= 7;
  return `<header class="naglowek"><h1>Więcej</h1></header>
    <nav class="lista" aria-label="Więcej">
      <a class="wiersz duzy" href="#wiecej/przepisy">Przepisy</a>
      <a class="wiersz duzy" href="#wiecej/profil">Profil i cele</a>
      <a class="wiersz duzy" href="#wiecej/kopia"><span>Kopia zapasowa</span>${dawnoKopia ? `<span class="opis">warto zrobić</span>` : ""}</a>
    </nav>
    <a class="link wyciszony" href="#wiecej/uwaga" style="align-self:flex-start">Zgłoś uwagę</a>
    <p class="wyciszony maly">Wersja ${app.wersja}${app.pomiar ? ` · ${app.pomiar}` : ""}</p>`;
}

// --- Przepisy ---

function rysujPrzepisy() {
  const fraza = szukaj.trim().toLowerCase();
  const lista = Object.values(przepisy())
    .filter((p) => !p.wycofany && !(p.okazja?.length) && (!fraza || p.nazwa.toLowerCase().includes(fraza)))
    .sort((a, b) => (a.nazwa < b.nazwa ? -1 : 1));
  return `<header class="naglowek"><a class="link" href="#wiecej">‹ Więcej</a><h1>Przepisy</h1></header>
    <label class="pole">Szukaj<input type="search" data-zmiana="szukaj" value="${esc(szukaj)}" placeholder="np. gulasz, łosoś, soczewica" autocomplete="off"></label>
    <div class="lista">${lista.map((p) => `<a class="karta" style="text-decoration:none" href="#przepis/${encodeURIComponent(p.id)}">
      <b>${esc(p.nazwa)}</b><span class="wyciszony maly">${p.posilek.map((x) => POSILKI[x]).join(", ")} · ok. ${p.czas_min} min${p.na_zapas ? " · na zapas" : ""}${p.bez_garnkow ? " · bez gotowania" : ""}</span></a>`).join("")}</div>`;
}

// --- Profil ---

function rysujProfil(app) {
  const p = app.dane.profil;
  const pierwszy = !app.dane.profil_ustawiony;
  const godziny = godzinyPosilkow(p);
  let cele = null;
  try { cele = celeDzienne(p, kontekst(app.dane, tenTydzien()).reguly); } catch { /* niepełny profil */ }
  // Pola liczbowe: tylko dodatnie liczby w rozsądnym zakresie (klawiatura bez minusa).
  const pole = (nazwa, etykieta, typ = "number") => {
    const zakres = LIMITY[nazwa] ? `min="${LIMITY[nazwa][0]}" max="${LIMITY[nazwa][1]}" step="${nazwa.startsWith("waga") ? "0.1" : "1"}"` : "";
    const klawiatura = typ !== "number" ? "text" : nazwa.startsWith("waga") ? "decimal" : "numeric";
    return `<label class="pole">${etykieta}<input name="${nazwa}" type="${typ}" inputmode="${klawiatura}" ${zakres} value="${esc(p[nazwa] ?? "")}" data-zmiana="sprawdzPole"></label>`;
  };
  return `<header class="naglowek">${pierwszy ? "" : `<a class="link" href="#wiecej">‹ Więcej</a>`}<h1>${pierwszy ? "Witaj" : "Profil i cele"}</h1>
      ${pierwszy ? `<p class="wyciszony">Wpisz swoje dane, żeby planer policzył kalorie i porcje. Wszystko zostaje tylko w tym telefonie.</p>` : ""}</header>
    ${pierwszy ? `<section class="karta obrys"><h3>Masz planer na Macu?</h3><p class="wyciszony maly">Wczytaj kopię zapasową z Maca (Ustawienia › Kopia zapasowa › Pobierz kopię), a profil, zamiany produktów i ostatnie tygodnie przejdą tutaj.</p>
      <label class="link">wczytaj kopię z pliku<input type="file" accept="application/json,.json" data-zmiana="importuj" hidden></label></section>` : ""}
    ${cele ? `<p class="karta"><b>${cele.kcal} kcal dziennie</b><span class="wyciszony maly">sód do ${cele.sod_mg_max} mg · białko ok. ${cele.bialko_g} g</span></p>` : ""}
    <form class="sekcja" data-wyslij="zapiszProfil" novalidate>
      <div class="siatka2">
        <label class="pole">Płeć<select name="plec"><option value="M"${p.plec === "M" ? " selected" : ""}>mężczyzna</option><option value="K"${p.plec === "K" ? " selected" : ""}>kobieta</option></select></label>
        ${pole("wiek", "Wiek")}
        ${pole("wzrost_cm", "Wzrost (cm)")}
        ${pole("waga_kg", "Waga (kg)")}
        ${pole("waga_docelowa_kg", "Waga docelowa (kg)")}
        ${pole("budzet_tydzien_zl", "Budżet na tydzień (zł)")}
      </div>
      <label class="pole">Aktywność<select name="aktywnosc">${Object.keys(AKTYWNOSC).map((k) => `<option value="${k}"${p.aktywnosc === k ? " selected" : ""}>${NAZWY_AKTYWNOSCI[k]}</option>`).join("")}</select></label>
      <div class="siatka2">
        ${pole("dom", "Twój dom (miasto)", "text")}
        ${pole("wyjazd", "Dokąd jeździsz", "text")}
        ${pole("zamrazarka_pudelka", "Pudełek w zamrażarce")}
        ${pole("limit_sodu_mg", "Limit sodu (mg)")}
      </div>
      <h2 class="ciemny maly" style="margin:8px 0 0">Pory posiłków</h2>
      <div class="siatka2">
        ${POSILKI_KUCHNI.map((k) => `<label class="pole">${POSILKI[k].replace(/^./, (z) => z.toUpperCase())}<input name="godz_${k}" type="time" value="${esc(godziny[k])}"></label>`).join("")}
      </div>
      <p class="wyciszony maly">Według nich Kuchnia podpowiada: rano blat, w porze przekąski plecak, w porze obiadu i kolacji lodówkę.</p>
      <label class="pole">Czego nie jesz (po przecinku)<input name="wykluczone" type="text" value="${esc((p.wykluczone ?? []).join(", "))}"></label>
      <p class="wyciszony maly">Planer pomija dania, w których jest taki produkt, np. „wieprzowina”, „łosoś”, „soczewica”. Działa od następnego układania tygodnia.</p>
      <p id="bledy-profilu" class="karta odwrocona" hidden></p>
      <button type="submit" class="przycisk glowny szeroki">Zapisz</button>
    </form>`;
}

const LIMITY = {
  wiek: [16, 100, "Wiek"], wzrost_cm: [120, 230, "Wzrost"], waga_kg: [35, 250, "Waga"], waga_docelowa_kg: [35, 250, "Waga docelowa"],
  budzet_tydzien_zl: [30, 2000, "Budżet"], zamrazarka_pudelka: [0, 40, "Pudełka w zamrażarce"], limit_sodu_mg: [500, 5000, "Limit sodu"],
};

// --- Kopia zapasowa ---

function rysujKopie(app) {
  const kopia = app.dane.ostatnia_kopia;
  return `<header class="naglowek"><a class="link" href="#wiecej">‹ Więcej</a><h1>Kopia zapasowa</h1>
      <p class="wyciszony">Dane planera są tylko w tym telefonie. Raz w tygodniu zapisz kopię w Plikach (iCloud Drive). Gdy zmienisz telefon albo dane znikną, wczytasz ją z powrotem.</p></header>
    <p class="karta">${kopia ? `Ostatnia kopia: ${esc(kopia)}` : "Nie masz jeszcze żadnej kopii."}</p>
    <button type="button" class="przycisk glowny szeroki" data-akcja="zapiszKopie">Zapisz kopię</button>
    <label class="link">wczytaj kopię z pliku<input type="file" accept="application/json,.json" data-zmiana="importuj" hidden></label>
    <p class="wyciszony maly">Wczytanie kopii zastępuje obecne dane w telefonie.</p>`;
}

// --- Uwagi ---

function rysujUwage(app) {
  return `<header class="naglowek"><a class="link" href="#wiecej">‹ Więcej</a><h1>Zgłoś uwagę</h1>
      <p class="wyciszony">Co przeszkadza albo czego brakuje? Uwagi zostają w telefonie; możesz je potem wysłać albo skopiować.</p></header>
    <form class="sekcja" data-wyslij="zapiszUwage"><textarea name="tresc" rows="5" required aria-label="Treść uwagi"></textarea>
      <button type="submit" class="przycisk glowny szeroki">Zapisz uwagę</button></form>
    ${app.dane.uwagi.length ? `<section class="sekcja"><h2>Twoje uwagi (${app.dane.uwagi.length})</h2>
      ${app.dane.uwagi.slice().reverse().map((u) => `<p class="karta"><span class="wyciszony maly">${esc(u.data)}</span>${esc(u.tresc)}</p>`).join("")}
      <button type="button" class="link" data-akcja="udostepnijUwagi">wyślij lub skopiuj uwagi</button></section>` : ""}`;
}

export const akcje = {
  // Od razu przy wpisywaniu: liczba spoza zakresu dostaje komunikat i obramowanie.
  sprawdzPole(app, cel) {
    const zakres = LIMITY[cel.name];
    if (!zakres) return;
    const v = Number(String(cel.value).replace(",", "."));
    const zle = !Number.isFinite(v) || v < zakres[0] || v > zakres[1];
    cel.setAttribute("aria-invalid", String(zle));
    cel.style.borderColor = zle ? "#FFFFFF" : "";
    cel.style.borderWidth = zle ? "3px" : "";
    const pole = document.getElementById("bledy-profilu");
    pole.hidden = !zle;
    pole.textContent = zle ? `${zakres[2]}: od ${zakres[0]} do ${zakres[1]}.` : "";
  },
  szukaj(app, cel) {
    szukaj = cel.value;
    app.odswiez();
    const pole = document.querySelector('input[type="search"]');
    pole?.focus();
    pole?.setSelectionRange(pole.value.length, pole.value.length);
  },
  zapiszProfil(app, formularz) {
    const f = new FormData(formularz);
    const bledy = [];
    const profil = { ...app.dane.profil };
    for (const [k, [od, do_, nazwa]] of Object.entries(LIMITY)) {
      const v = Number(String(f.get(k)).replace(",", "."));
      if (!Number.isFinite(v) || v < od || v > do_) bledy.push(`${nazwa}: od ${od} do ${do_}.`);
      else profil[k] = v;
    }
    profil.plec = f.get("plec");
    profil.aktywnosc = f.get("aktywnosc");
    profil.dom = String(f.get("dom")).trim() || "dom";
    profil.wyjazd = String(f.get("wyjazd")).trim() || "wyjazd";
    // Godziny posiłków: pozostałe pola z Maca (np. godzina zakupów) zostają bez zmian.
    profil.godziny = { ...(profil.godziny ?? {}) };
    for (const k of POSILKI_KUCHNI) {
      const v = String(f.get(`godz_${k}`) ?? "").slice(0, 5);
      if (minuty(v) !== null) profil.godziny[k] = v;
      else bledy.push(`Godzina: ${POSILKI[k]}.`);
    }
    const kolejno = POSILKI_KUCHNI.map((k) => minuty(profil.godziny[k]));
    if (!bledy.length && kolejno.some((m, i) => i && m <= kolejno[i - 1])) bledy.push("Pory posiłków muszą iść po kolei: śniadanie, przekąska, obiad, kolacja.");
    profil.wykluczone = String(f.get("wykluczone")).split(",").map((s) => s.trim()).filter(Boolean);
    const pole = document.getElementById("bledy-profilu");
    if (bledy.length) {
      pole.textContent = bledy.join(" ");
      pole.hidden = false;
      return;
    }
    const pierwszy = !app.dane.profil_ustawiony;
    app.dane.profil = profil;
    app.dane.profil_ustawiony = true;
    app.zapisz();
    powiadom("Zapisano.");
    if (pierwszy) app.idz("#tydzien");
    else app.odswiez();
  },
  async importuj(app, cel) {
    const plik = cel.files?.[0];
    if (!plik) return;
    try {
      const dane = importuj(await plik.text());
      await wczytajKatalog();
      app.dane = dane;
      app.zapisz();
      powiadom("Kopia wczytana.");
      app.idz("#lodowka");
    } catch (e) {
      powiadom(e.message || "Nie udało się wczytać pliku.");
    }
  },
  async zapiszKopie(app) {
    const tekst = eksport(app.dane);
    const nazwa = `planer-dash-${dzis()}.json`;
    const plik = new File([tekst], nazwa, { type: "application/json" });
    try {
      if (navigator.canShare?.({ files: [plik] })) {
        await navigator.share({ files: [plik], title: "Kopia planera" });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(plik);
        a.download = nazwa;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
      app.dane.ostatnia_kopia = dzis();
      app.zapisz();
      app.odswiez();
    } catch { /* anulowane */ }
  },
  zapiszUwage(app, formularz) {
    const tresc = String(new FormData(formularz).get("tresc")).trim();
    if (!tresc) return;
    app.dane.uwagi.push({ data: dzis(), tresc, ekran: "telefon" });
    app.zapisz();
    powiadom("Uwaga zapisana.");
    app.odswiez();
  },
  async udostepnijUwagi(app) {
    const tekst = app.dane.uwagi.map((u) => `${u.data}: ${u.tresc}`).join("\n");
    try {
      if (navigator.share) return await navigator.share({ title: "Uwagi do planera", text: tekst });
    } catch { return; }
    powiadom((await kopiujTekst(tekst)) ? "Uwagi skopiowane." : "Nie udało się skopiować.");
  },
};

export { zamknijArkusz, pokazArkusz };
