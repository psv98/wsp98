// Завантаження та кешування зображень. Кожна текстура завантажується один раз і використовується повторно.
const cache = new Map<string, Promise<HTMLImageElement>>();

export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

export function loadImage(path: string): Promise<HTMLImageElement> {
  let p = cache.get(path);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Не вдалося завантажити ${path}`));
      img.src = assetUrl(path);
    });
    cache.set(path, p);
  }
  return p;
}
