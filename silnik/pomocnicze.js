// Drobne narzędzia, dzięki którym silnik liczy dokładnie tak jak wersja na Maca (Python):
// zaokrąglanie „do parzystej”, porównywanie krotek przy sortowaniu, daty bez stref czasowych i SHA-1.

// round(x, n) z Pythona: najbliższa wartość dziesiętna, a przy idealnym remisie — parzysta cyfra.
export function zaokr(x, n = 0) {
  if (!Number.isFinite(x)) return x;
  const ujemna = x < 0;
  const [calk, ulamek] = Math.abs(x).toFixed(100).split(".");
  const zostaje = ulamek.slice(0, n);
  const reszta = ulamek.slice(n);
  let wGore;
  if (reszta[0] > "5") wGore = true;
  else if (reszta[0] < "5") wGore = false;
  else if (/[1-9]/.test(reszta.slice(1))) wGore = true;
  else wGore = Number((calk + zostaje).slice(-1)) % 2 === 1;
  let cyfry = calk + zostaje;
  if (wGore) cyfry = (BigInt(cyfry) + 1n).toString().padStart(cyfry.length, "0");
  const tekst = n > 0 ? cyfry.slice(0, cyfry.length - n) + "." + cyfry.slice(-n) : cyfry;
  const wynik = Number(tekst);
  return ujemna && wynik !== 0 ? -wynik : wynik;
}

// Porównanie jak w Pythonie: liczby, napisy (po kodach znaków), wartości logiczne i krotki (tablice).
export function porownaj(a, b) {
  if (Array.isArray(a)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const c = porownaj(a[i], b[i]);
      if (c) return c;
    }
    return a.length - b.length;
  }
  if (typeof a === "boolean") return Number(a) - Number(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

// sorted(lista, key=...) — sortowanie stabilne.
export function posortuj(lista, klucz = (x) => x) {
  return lista.map((x, i) => [klucz(x), i, x]).sort((p, q) => porownaj(p[0], q[0]) || p[1] - q[1]).map((t) => t[2]);
}

export function kopia(x) {
  return JSON.parse(JSON.stringify(x));
}

export function zawiera(lista, element) {
  return lista.some((x) => porownaj(x, element) === 0);
}

// --- Daty jako napisy RRRR-MM-DD, liczone w UTC (bez przesunięć czasu letniego) ---

function naDate(iso) {
  const [r, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(r, m - 1, d));
}

export function dodajDni(iso, dni) {
  const d = naDate(iso);
  d.setUTCDate(d.getUTCDate() + dni);
  return d.toISOString().slice(0, 10);
}

export function roznicaDni(a, b) {
  return Math.round((naDate(a) - naDate(b)) / 86400000);
}

// 0 = poniedziałek, jak date.weekday() w Pythonie.
export function dzienTygodnia(iso) {
  return (naDate(iso).getUTCDay() + 6) % 7;
}

export function miesiac(iso) {
  return Number(iso.slice(5, 7));
}

// --- SHA-1 (do stałego „rozrzutu”: ten sam tydzień zawsze daje ten sam plan) ---

export function sha1(tekst) {
  const bajty = new TextEncoder().encode(tekst);
  const dl = bajty.length;
  const slowa = new Uint32Array((((dl + 8) >> 6) + 1) * 16);
  for (let i = 0; i < dl; i++) slowa[i >> 2] |= bajty[i] << (24 - (i % 4) * 8);
  slowa[dl >> 2] |= 0x80 << (24 - (dl % 4) * 8);
  slowa[slowa.length - 1] = dl * 8;
  let [h0, h1, h2, h3, h4] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  const rot = (x, n) => (x << n) | (x >>> (32 - n));
  for (let blok = 0; blok < slowa.length; blok += 16) {
    for (let t = 0; t < 16; t++) w[t] = slowa[blok + t];
    for (let t = 16; t < 80; t++) w[t] = rot(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let t = 0; t < 80; t++) {
      let f, k;
      if (t < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (t < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (t < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const tmp = (rot(a, 5) + f + e + k + w[t]) >>> 0;
      e = d; d = c; c = rot(b, 30) >>> 0; b = a; a = tmp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, "0")).join("");
}

// Format „:g” z Pythona dla liczb, które występują w przepisach (np. 350 → „350”, 52.5 → „52.5”).
export function liczbaG(x) {
  return Number(x.toPrecision(6)).toString();
}
