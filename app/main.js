// Planer DASH na telefon: ekrany i nawigacja. Każdy ekran to funkcja rysuj(app) → HTML i obsługa kliknięć.
import { porzadkuj, poprosOTrwalosc, wczytaj, wczytajKatalog, zapisz } from "./stan.js";
import { esc, zamknijArkusz } from "./narzedzia.js";
import * as lodowka from "./ekrany/lodowka.js";
import * as gotowanie from "./ekrany/gotowanie.js";
import * as tydzien from "./ekrany/tydzien.js";
import * as wiecej from "./ekrany/wiecej.js";
import * as przepis from "./ekrany/przepis.js";

const EKRANY = { lodowka, gotowanie, tydzien, wiecej, przepis };
// Przepis otwiera się nad zakładką, z której przyszedłeś — ta zakładka zostaje podświetlona.
let zakladka = "lodowka";
const ekran = document.getElementById("ekran");

export const app = {
  wersja: "12",
  pomiar: "",
  dane: wczytaj(),
  ekran: "lodowka",
  argument: null,
  zapisz() {
    if (!zapisz(this.dane)) this.blad = "Nie udało się zapisać danych w telefonie.";
  },
  odswiez() {
    rysuj();
  },
  idz(adres) {
    // Ten sam adres nie wywoła zmiany — wtedy tylko przerysuj ekran.
    if (location.hash === adres) rysuj();
    else location.hash = adres;
  },
};

function rysuj() {
  const modul = EKRANY[app.ekran] ?? lodowka;
  try {
    ekran.innerHTML = modul.rysuj(app);
  } catch (e) {
    console.error(e);
    ekran.innerHTML = `<div class="naglowek"><h1>Coś poszło nie tak</h1><p class="wyciszony">${esc(e.message)}</p></div>`;
  }
  if (app.ekran !== "przepis") zakladka = app.ekran;
  document.querySelectorAll(".nawigacja a").forEach((a) => {
    if (a.dataset.ekran === zakladka) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  modul.poNarysowaniu?.(app, ekran);
}

function zAdresu() {
  const [nazwa, ...reszta] = (location.hash.slice(1) || "lodowka").split("/");
  const poprzedni = app.ekran;
  app.ekran = nazwa in EKRANY ? nazwa : "lodowka";
  app.argument = reszta.join("/") || null;
  if (poprzedni !== app.ekran) EKRANY[poprzedni]?.poOpuszczeniu?.(app);
  zamknijArkusz();
  rysuj();
  if (poprzedni !== app.ekran) document.getElementById("ekran").scrollTop = 0;
}

// Jedna obsługa kliknięć dla całej apki: element z data-akcja wywołuje funkcję ekranu o tej nazwie.
document.addEventListener("click", (e) => {
  const cel = e.target.closest("[data-akcja]");
  // Zwykły link wewnątrz elementu z akcją (np. przepis w szufladzie lodówki) ma pierwszeństwo.
  const link = e.target.closest("a[href]");
  if (cel && link && cel.contains(link)) return;
  if (!cel) {
    if (e.target.id === "arkusz") zamknijArkusz();
    return;
  }
  const modul = EKRANY[app.ekran];
  const akcja = modul.akcje?.[cel.dataset.akcja];
  if (cel.dataset.akcja === "zamknij") return zamknijArkusz();
  if (!akcja) return;
  e.preventDefault();
  akcja(app, cel, e);
});

document.addEventListener("change", (e) => {
  const cel = e.target.closest("[data-zmiana]");
  if (!cel) return;
  EKRANY[app.ekran].akcje?.[cel.dataset.zmiana]?.(app, cel, e);
});

document.addEventListener("submit", (e) => {
  const cel = e.target.closest("[data-wyslij]");
  if (!cel) return;
  e.preventDefault();
  EKRANY[app.ekran].akcje?.[cel.dataset.wyslij]?.(app, cel, e);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.getElementById("arkusz").hidden) zamknijArkusz();
});

// iPhone z planerem na ekranie początkowym czasem sam kończy ekran nad kreską na dole, a mimo to podaje,
// że trzeba zostawić pod nią miejsce. Wtedy pasek zakładek wisiał wysoko i był dwa razy za gruby.
// Mierzymy, czy ekran planera sięga do samego dołu; jeśli nie, nie dokładamy już miejsca pod paskiem.
function dopasujDol() {
  const sonda = document.createElement("div");
  sonda.style.cssText = "position:fixed;left:0;bottom:0;width:1px;height:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none";
  document.body.append(sonda);
  const margines = sonda.offsetHeight;
  sonda.remove();
  const naEkranie = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const pionowo = innerHeight >= innerWidth;
  const wysEkranu = pionowo ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
  const brakuje = wysEkranu - innerHeight;
  const krotszy = naEkranie && margines > 0 && brakuje >= margines - 2;
  document.documentElement.style.setProperty("--dol", krotszy ? "0px" : `${margines}px`);
  app.pomiar = `ekran ${wysEkranu}, planer ${innerHeight}, dół ${margines}${krotszy ? ", poprawka" : ""}`;
}

async function start() {
  dopasujDol();
  addEventListener("resize", dopasujDol);
  addEventListener("orientationchange", () => setTimeout(dopasujDol, 300));
  ekran.innerHTML = `<p class="wyciszony">Wczytuję…</p>`;
  try {
    await wczytajKatalog();
  } catch {
    ekran.innerHTML = `<div class="naglowek"><h1>Brak danych planera</h1><p class="wyciszony">Otwórz planer raz z internetem, żeby zapisał się w telefonie.</p></div>`;
    return;
  }
  porzadkuj(app.dane);
  app.zapisz();
  if (!app.dane.profil_ustawiony && !location.hash) location.hash = "#wiecej/profil";
  window.addEventListener("hashchange", zAdresu);
  zAdresu();
  poprosOTrwalosc();
  // Wersja offline: tylko poza komputerem dewelopera, żeby zmiany w kodzie od razu było widać.
  if ("serviceWorker" in navigator && !["localhost", "127.0.0.1"].includes(location.hostname)) {
    // Gdy na GitHubie jest nowa wersja: sprawdź przy każdym powrocie do planera, a po podmianie przeładuj raz.
    const mialStara = Boolean(navigator.serviceWorker.controller);
    let przeladowano = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (mialStara && !przeladowano) { przeladowano = true; location.reload(); }
    });
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((rej) => {
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") rej.update().catch(() => {}); });
    }).catch(() => {});
  }
}

start();
