// Facebook/Gmail-style tab badge: unread messages + unread notifications
// (the bell) combined into one number, shown in both the browser tab title
// and the favicon, and cleared automatically once nothing's unread.
const BASE_ICON_URL = '/brand/logo-primary-circle-green.png';
const APP_NAME = 'Sparrow Staff Portal';
const BADGE_RED = '#DC2626'; // priority-p1, same red as every other unread badge in the app

let cachedImage: HTMLImageElement | null = null;
let lastCount = -1;

function loadBaseImage(): Promise<HTMLImageElement> {
  if (cachedImage) return Promise.resolve(cachedImage);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      cachedImage = img;
      resolve(img);
    };
    img.onerror = reject;
    img.src = BASE_ICON_URL;
  });
}

function setFaviconHref(href: string) {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
}

export async function setTabBadge(count: number) {
  if (count === lastCount) return;
  lastCount = count;

  document.title = count > 0 ? `(${count > 99 ? '99+' : count}) ${APP_NAME}` : APP_NAME;

  try {
    const img = await loadBaseImage();
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, size, size);

    if (count > 0) {
      const r = size * 0.32;
      const cx = size - r * 0.85;
      const cy = r * 0.85;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = BADGE_RED;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = size * 0.035;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${r * 1.15}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(count > 9 ? '9+' : String(count), cx, cy + r * 0.05);
    }

    setFaviconHref(canvas.toDataURL('image/png'));
  } catch {
    // Favicon badge is a nice-to-have; the tab title above already carries
    // the count, so a canvas/image failure here is silently non-fatal.
  }
}
