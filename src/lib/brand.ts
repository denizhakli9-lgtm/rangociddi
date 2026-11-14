export const slogans = [
  'Randevunun yeni yolu.',
  "Planla, Rango'la!",
  'Randevun bir tık uzağında.',
  'Rango it. Book it.',
  "Rango'yla her şey takviminde.",
  'Sen seç, Rango ayarlasın.',
  'Randevuda yeni bir dönem.',
];

export function nextVisitSlogan(): string {
  let index = 0;
  try {
    const previous = localStorage.getItem('rango.slogan');
    const parsed = previous === null ? -1 : Number(previous);
    if (Number.isInteger(parsed) && parsed >= -1 && parsed < slogans.length) {
      index = (parsed + 1) % slogans.length;
    }
    localStorage.setItem('rango.slogan', String(index));
  } catch {
    index = Math.floor(Math.random() * slogans.length);
  }
  return slogans[index];
}
