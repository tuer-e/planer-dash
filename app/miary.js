// Miary kuchenne: „½ puszki”, „2 ząbki”, „5 łyżek”. Przy zmianie przepisu ilość zmieniasz w tej samej mierze,
// a gramy (do listy zakupów i kalorii) planer liczy w tle: gramy = ilość × ile waży jedna miara.

// Odmiana: [1, 2–4, 5 i więcej, ułamek (dopełniacz)]
const FORMY = {
  łyżka: ["łyżka", "łyżki", "łyżek", "łyżki"],
  łyżeczka: ["łyżeczka", "łyżeczki", "łyżeczek", "łyżeczki"],
  szklanka: ["szklanka", "szklanki", "szklanek", "szklanki"],
  ząbek: ["ząbek", "ząbki", "ząbków", "ząbka"],
  puszka: ["puszka", "puszki", "puszek", "puszki"],
  garść: ["garść", "garście", "garści", "garści"],
  opakowanie: ["opakowanie", "opakowania", "opakowań", "opakowania"],
  kromka: ["kromka", "kromki", "kromek", "kromki"],
  kostka: ["kostka", "kostki", "kostek", "kostki"],
  kubeczek: ["kubeczek", "kubeczki", "kubeczków", "kubeczka"],
  plaster: ["plaster", "plastry", "plastrów", "plastra"],
  pęczek: ["pęczek", "pęczki", "pęczków", "pęczka"],
  woreczek: ["woreczek", "woreczki", "woreczków", "woreczka"],
  butelka: ["butelka", "butelki", "butelek", "butelki"],
  główka: ["główka", "główki", "główek", "główki"],
  filet: ["filet", "filety", "filetów", "filetu"],
  kawałek: ["kawałek", "kawałki", "kawałków", "kawałka"],
  sztuka: ["sztuka", "sztuki", "sztuk", "sztuki"],
  jajko: ["jajko", "jajka", "jajek", "jajka"],
  białko: ["białko", "białka", "białek", "białka"],
  udko: ["udko", "udka", "udek", "udka"],
  tortilla: ["tortilla", "tortille", "tortilli", "tortilli"],
  kulka: ["kulka", "kulki", "kulek", "kulki"],
  brykiet: ["brykiet", "brykiety", "brykietów", "brykietu"],
  połówka: ["połówka", "połówki", "połówek", "połówki"],
  liść: ["liść", "liście", "liści", "liścia"],
  szczypta: ["szczypta", "szczypty", "szczypt", "szczypty"],
  papryka: ["papryka", "papryki", "papryk", "papryki"],
  marchewka: ["marchewka", "marchewki", "marchewek", "marchewki"],
  cebula: ["cebula", "cebule", "cebul", "cebuli"],
  cytryna: ["cytryna", "cytryny", "cytryn", "cytryny"],
  limonka: ["limonka", "limonki", "limonek", "limonki"],
  ogórek: ["ogórek", "ogórki", "ogórków", "ogórka"],
  gruszka: ["gruszka", "gruszki", "gruszek", "gruszki"],
  jabłko: ["jabłko", "jabłka", "jabłek", "jabłka"],
  banan: ["banan", "banany", "bananów", "banana"],
  cukinia: ["cukinia", "cukinie", "cukinii", "cukinii"],
  owoc: ["owoc", "owoce", "owoców", "owocu"],
  porcja: ["porcja", "porcje", "porcji", "porcji"],
  stek: ["stek", "steki", "steków", "steku"],
  kotlet: ["kotlet", "kotlety", "kotletów", "kotleta"],
  burak: ["burak", "buraki", "buraków", "buraka"],
  korzeń: ["korzeń", "korzenie", "korzeni", "korzenia"],
  dynia: ["dynia", "dynie", "dyń", "dyni"],
  pomarańcza: ["pomarańcza", "pomarańcze", "pomarańczy", "pomarańczy"],
  oliwka: ["oliwka", "oliwki", "oliwek", "oliwki"],
  torebka: ["torebka", "torebki", "torebek", "torebki"],
  bakłażan: ["bakłażan", "bakłażany", "bakłażanów", "bakłażana"],
  ziemniak: ["ziemniak", "ziemniaki", "ziemniaków", "ziemniaka"],
};
// „1 mała” (cebula), „2 duże” (jabłka): rozmiar zamiast miary. Odmiana według rodzaju słowa z przepisu.
const ROZMIARY = {
  mała: ["mała", "małe", "małych", "małej"], mały: ["mały", "małe", "małych", "małego"], małe: ["małe", "małe", "małych", "małego"],
  duża: ["duża", "duże", "dużych", "dużej"], duży: ["duży", "duże", "dużych", "dużego"], duże: ["duże", "duże", "dużych", "dużego"],
  średnia: ["średnia", "średnie", "średnich", "średniej"], średni: ["średni", "średnie", "średnich", "średniego"],
  średnie: ["średnie", "średnie", "średnich", "średniego"],
};
Object.assign(FORMY, ROZMIARY);
const LEMAT = {};
for (const [j, f] of Object.entries(FORMY)) if (!(j in ROZMIARY)) for (const w of f) LEMAT[w] ??= j;
for (const j of Object.keys(ROZMIARY)) LEMAT[j] = j;
Object.assign(LEMAT, { małej: "mała", małych: "małe", dużej: "duża", dużych: "duże", średniej: "średnia", średnich: "średnie" });

const ULAMKI = { "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8 };
const ZNAKI = [[0.25, "¼"], [1 / 3, "⅓"], [0.5, "½"], [2 / 3, "⅔"], [0.75, "¾"], [0.2, "⅕"], [0.4, "⅖"], [0.6, "⅗"], [0.8, "⅘"]];
export const ILOSCI = [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30];

// „1½ puszki” → { ile: 1.5, jedn: "puszka", dopisek: "" }; „garść szczypiorku” → { ile: 1, jedn: "garść", dopisek: "szczypiorku" }.
// Gdy miary nie da się odczytać („sok z ¼ cytryny”): { ile: 1, jedn: null, tekst: "sok z ¼ cytryny" }.
export function czytajMiare(miara) {
  const t = String(miara ?? "").trim();
  const m = /^(pół|\d+(?:[.,]\d+)?)?\s*([¼½¾⅓⅔⅕⅖⅗⅘])?\s*(.*)$/u.exec(t);
  let ile = null;
  if (m[1] === "pół") ile = 0.5;
  else if (m[1]) ile = Number(m[1].replace(",", "."));
  if (m[2]) ile = (ile ?? 0) + ULAMKI[m[2]];
  const [slowo = "", ...reszta] = m[3].split(/\s+/);
  // „papryka, kmin” albo „papryka słodka, ziele angielskie” to lista przypraw, nie miara.
  const lista = ile === null && m[3].includes(",");
  const jedn = lista ? undefined : LEMAT[slowo.replace(/[.;:]$/, "").toLowerCase()];
  if (jedn) return { ile: ile ?? 1, jedn, dopisek: reszta.join(" ") };
  // „2 × kumin, płatki chili” — wcześniej zmieniona ilość przy mierze, której nie da się odczytać.
  if (ile !== null && /^×\s/.test(m[3])) return { ile, jedn: null, tekst: m[3].replace(/^×\s+/, "") };
  if (ile !== null && m[3] === "g") return { ile, jedn: "g", dopisek: "" };
  return { ile: 1, jedn: null, tekst: t };
}

function liczba(ile) {
  const cale = Math.floor(ile + 1e-9);
  const reszta = ile - cale;
  if (reszta < 0.01) return { txt: String(cale), ulamek: false };
  const znak = ZNAKI.find(([v]) => Math.abs(v - reszta) < 0.02);
  if (znak) return { txt: `${cale || ""}${znak[1]}`, ulamek: true };
  return { txt: String(Math.round(ile * 10) / 10).replace(".", ","), ulamek: true };
}

// { ile: 1.5, jedn: "puszka" } → „1½ puszki”
export function piszMiare({ ile, jedn, dopisek = "", tekst = "" }) {
  const { txt, ulamek } = liczba(ile);
  if (!jedn) return ile === 1 ? tekst : `${txt} × ${tekst}`;
  if (jedn === "g") return `${Math.round(ile)} g`;
  const f = FORMY[jedn];
  const n = Math.round(ile);
  const forma = ulamek ? f[3] : n === 1 ? f[0] : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? f[1] : f[2];
  return [txt, forma, dopisek].filter(Boolean).join(" ");
}

// Następna / poprzednia ilość w tej samej mierze (¼, ⅓, ½, ⅔, ¾, 1, 1½, 2…). Gramy: krok 10 albo 25 g.
// Tych miar nie dzieli się na części: „1½ ząbka” czy „½ kromki” nie mają sensu w kuchni.
const CALE = new Set(["ząbek", "kromka", "jajko", "białko", "oliwka", "liść", "plaster", "tortilla", "brykiet", "torebka", "kotlet", "stek"]);

export function krokIlosci(ile, jedn, kierunek) {
  if (CALE.has(jedn)) return Math.max(1, Math.round(ile) + kierunek);
  if (jedn === "g") {
    const krok = ile < 100 ? 10 : 25;
    return Math.max(krok, Math.round(ile / krok) * krok + kierunek * krok);
  }
  if (kierunek > 0) return ILOSCI.find((x) => x > ile + 1e-6) ?? ile;
  return [...ILOSCI].reverse().find((x) => x < ile - 1e-6) ?? ile;
}

// Jak zwykle odmierza się dany produkt w przepisach: najczęstsza miara i ile waży jedna.
export function zwyklaMiara(idProduktu, przepisy, produkt) {
  const licz = {};
  for (const p of Object.values(przepisy)) {
    for (const [id, gramy, miara] of p.skladniki) {
      if (id !== idProduktu) continue;
      const m = czytajMiare(miara);
      if (!m.jedn || m.jedn === "g" || !(m.ile > 0)) continue;
      const w = (licz[m.jedn] ??= { n: 0, g: 0 });
      w.n += 1;
      w.g += gramy / m.ile;
    }
  }
  const [jedn, w] = Object.entries(licz).sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1))[0] ?? [];
  if (jedn) return { jedn, gNaJedn: w.g / w.n };
  // Produkt, którego nie ma w żadnym przepisie: miara z rodzaju produktu.
  if (produkt?.sztuka_g && produkt.sztuka_g < (produkt.opakowanie_g ?? Infinity)) return { jedn: "sztuka", gNaJedn: produkt.sztuka_g };
  if (/puszk/i.test(produkt?.nazwa ?? "")) return { jedn: "puszka", gNaJedn: (produkt.opakowanie_g ?? 400) * 0.6 };
  if (produkt?.dzial === "tluszcze_dodatki") return { jedn: "łyżka", gNaJedn: 10 };
  if (produkt?.dzial === "suche") return { jedn: "szklanka", gNaJedn: 180 };
  if (produkt?.dzial === "nabial") return { jedn: "łyżka", gNaJedn: 20 };
  return { jedn: "garść", gNaJedn: 30 };
}

// „Płatki owsiane górskie 500 g” → „Płatki owsiane górskie” (bez wielkości opakowania).
export function nazwaProduktu(nazwa) {
  return String(nazwa ?? "").replace(/\s+\d[\d,.]*(\s*[×x]\s*\d[\d,.]*)?\s*(g|kg|ml|l|szt\.?)(?=\s|$).*$/i, "").trim();
}

// Do szukania: małe litery, bez polskich znaków.
export function doSzukania(tekst) {
  return String(tekst ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
}
