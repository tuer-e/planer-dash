// Planer działa bez internetu: przy instalacji zapisuje wszystkie swoje pliki w pamięci telefonu.
// Nowa wersja planera = nowa nazwa pamięci (WERSJA); stara jest usuwana przy aktywacji.
const WERSJA = "planer-dash-3";
const PLIKI = [
  "./", "index.html", "styl.css", "manifest.webmanifest", "ikona.svg", "ikona-180.png", "ikona-512.png",
  "app/main.js", "app/stan.js", "app/narzedzia.js", "app/harmonogram.js",
  "app/ekrany/lodowka.js", "app/ekrany/gotowanie.js", "app/ekrany/tydzien.js", "app/ekrany/wiecej.js", "app/ekrany/przepis.js",
  "silnik/pomocnicze.js", "silnik/cele.js", "silnik/katalog.js", "silnik/generator.js", "silnik/zakupy.js",
  "dane/produkty.json", "dane/przepisy.json", "dane/reguly-dash.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(WERSJA).then((c) => c.addAll(PLIKI)).then(() => self.skipWaiting()));
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
    const zSieci = fetch(e.request).then((odp) => {
      if (odp.ok && new URL(e.request.url).origin === self.location.origin) c.put(e.request, odp.clone());
      return odp;
    }).catch(() => zapisane);
    return zapisane || zSieci;
  }));
});
