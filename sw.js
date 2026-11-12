// Planer działa bez internetu: przy instalacji zapisuje wszystkie swoje pliki w pamięci telefonu.
// Nowa wersja planera = nowa nazwa pamięci (WERSJA); stara jest usuwana przy aktywacji.
const WERSJA = "planer-dash-10";
const PLIKI = [
  "./", "index.html", "styl.css", "manifest.webmanifest", "ikona.svg", "ikona-180.png", "ikona-512.png",
  "app/main.js", "app/stan.js", "app/narzedzia.js", "app/harmonogram.js", "app/wyjazdy.js", "app/razem.js",
  "app/ekrany/lodowka.js", "app/ekrany/gotowanie.js", "app/ekrany/tydzien.js", "app/ekrany/wiecej.js", "app/ekrany/przepis.js",
  "silnik/pomocnicze.js", "silnik/cele.js", "silnik/katalog.js", "silnik/generator.js", "silnik/zakupy.js",
  "dane/produkty.json", "dane/przepisy.json", "dane/reguly-dash.json",
];

self.addEventListener("install", (e) => {
  // cache: "reload" — zawsze świeże pliki z GitHuba, nie z 10-minutowej pamięci przeglądarki
  // (inaczej nowa wersja mogłaby dostać stary wygląd).
  e.waitUntil(caches.open(WERSJA).then((c) => c.addAll(PLIKI.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((nazwy) => Promise.all(nazwy.filter((n) => n !== WERSJA).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

// Najpierw pamięć telefonu (działa offline), w tle odświeżenie z sieci.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.open(WERSJA).then(async (c) => {
    const zapisane = await c.match(e.request, { ignoreSearch: true });
    const swoj = new URL(e.request.url).origin === self.location.origin;
    const zSieci = (swoj ? fetch(e.request.url, { cache: "no-cache" }) : fetch(e.request)).then((odp) => {
      if (odp.ok && swoj) c.put(e.request, odp.clone());
      return odp;
    }).catch(() => zapisane);
    return zapisane || zSieci;
  }));
});
