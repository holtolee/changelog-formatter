// Génère src/assets/backdrop.jpg : le décor synthwave (soleil, horizon, grille) rendu une fois
// en image fixe, pour éviter de le recalculer en continu dans l'interface.
// Usage : npm run render:backdrop
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');

// Rendu 1600×960 en ×1,5 → image 2400×1440. La fenêtre de rendu ne peut pas dépasser l'écran
// en pixels physiques : lancer le script sur un écran d'au moins 2400×1440.
const WIDTH = 1600;
const HEIGHT = 960;
const SCALE = 1.5;
const OUTPUT = path.join(__dirname, '..', 'src', 'assets', 'backdrop.jpg');

app.commandLine.appendSwitch('force-device-scale-factor', String(SCALE));

const html = `<!DOCTYPE html>
<html><head><style>
  :root { --cyan-rgb: 0, 229, 255; --magenta-rgb: 230, 5, 123; }
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
  .backdrop {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background:
      radial-gradient(ellipse 80% 50% at 50% 0%, rgba(92, 20, 150, 0.55), transparent 70%),
      radial-gradient(ellipse 60% 40% at 50% 64%, rgba(var(--magenta-rgb), 0.22), transparent 70%),
      linear-gradient(180deg, #07030f 0%, #10061f 45%, #1b0934 64%, #07030f 100%);
  }
  .sun {
    position: absolute;
    left: 50%;
    bottom: 36vh;
    width: min(46vw, 520px);
    aspect-ratio: 1;
    transform: translate(-50%, 50%);
    border-radius: 50%;
    background: linear-gradient(180deg, #ffe46b 0%, #ff9a3d 30%, #e6057b 62%, #6a0bb0 100%);
    opacity: 0.32;
    filter: drop-shadow(0 0 60px rgba(var(--magenta-rgb), 0.8));
    mask-image:
      linear-gradient(#000 0 48%, transparent 48%),
      repeating-linear-gradient(180deg, #000 0 14px, transparent 14px 22px);
  }
  .horizon {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 36vh;
    height: 2px;
    background: linear-gradient(90deg, transparent, #e6057b 20%, #00e5ff 50%, #e6057b 80%, transparent);
    box-shadow: 0 0 24px 4px rgba(var(--magenta-rgb), 0.55), 0 0 60px 10px rgba(var(--cyan-rgb), 0.18);
    opacity: 0.85;
  }
  .floor {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 36vh;
    overflow: hidden;
    perspective: 220px;
    perspective-origin: 50% 0%;
    mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.35), #000 55%);
  }
  .floor-grid {
    position: absolute;
    left: -100%;
    right: -100%;
    top: 0;
    height: 300%;
    transform-origin: 50% 0%;
    transform: rotateX(68deg);
    background-image:
      linear-gradient(90deg, rgba(var(--magenta-rgb), 0.7) 1.5px, transparent 1.5px),
      linear-gradient(180deg, rgba(var(--cyan-rgb), 0.55) 1.5px, transparent 1.5px);
    background-size: 64px 64px;
    background-position: center top;
  }
</style></head>
<body>
  <div class="backdrop">
    <div class="sun"></div>
    <div class="horizon"></div>
    <div class="floor"><div class="floor-grid"></div></div>
  </div>
</body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: WIDTH, height: HEIGHT, show: false, useContentSize: true });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(OUTPUT, image.toJPEG(90));
  const { width, height } = image.getSize();
  if (width < Math.round(WIDTH * SCALE) || height < Math.round(HEIGHT * SCALE)) {
    console.warn(`Attention : rendu tronqué par la taille de l'écran (${width}×${height}).`);
  }
  console.log(`${path.relative(process.cwd(), OUTPUT)} : ${width}×${height}, ${Math.round(fs.statSync(OUTPUT).size / 1024)} Ko`);
  app.quit();
});
