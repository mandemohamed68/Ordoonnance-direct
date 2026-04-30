import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const assetsDir = path.resolve('assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// 1024x1024 scale = 10.24
const svgForegroundStr = `
<svg width="1024" height="1024" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M35 25C35 22.2386 37.2386 20 40 20H60C62.7614 20 65 22.2386 65 25V75C65 77.7614 62.7614 80 60 80H40C37.2386 80 35 77.7614 35 75V25Z" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M42 20V25H58V20" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M30 50H70" stroke="white" stroke-width="12" stroke-linecap="round"/>
  <path d="M50 30V70" stroke="white" stroke-width="12" stroke-linecap="round"/>
  <path d="M35 75V85H65L75 75" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M65 85L75 75L65 65" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

const svgIconStr = `
<svg width="1024" height="1024" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" rx="24" fill="#10b981" />
  <path d="M35 25C35 22.2386 37.2386 20 40 20H60C62.7614 20 65 22.2386 65 25V75C65 77.7614 62.7614 80 60 80H40C37.2386 80 35 77.7614 35 75V25Z" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M42 20V25H58V20" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M30 50H70" stroke="white" stroke-width="12" stroke-linecap="round"/>
  <path d="M50 30V70" stroke="white" stroke-width="12" stroke-linecap="round"/>
  <path d="M35 75V85H65L75 75" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M65 85L75 75L65 65" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

const svgBackgroundStr = `
<svg width="1024" height="1024" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" fill="#10b981" />
</svg>
`;

// Splash Screen - 2732x2732. Use background color and place icon in center.
const svgSplashStr = `
<svg width="2732" height="2732" viewBox="0 0 2732 2732" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="2732" height="2732" fill="#10b981" />
  <g transform="translate(854, 854) scale(10.24)">
    <path d="M35 25C35 22.2386 37.2386 20 40 20H60C62.7614 20 65 22.2386 65 25V75C65 77.7614 62.7614 80 60 80H40C37.2386 80 35 77.7614 35 75V25Z" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M42 20V25H58V20" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M30 50H70" stroke="white" stroke-width="12" stroke-linecap="round"/>
    <path d="M50 30V70" stroke="white" stroke-width="12" stroke-linecap="round"/>
    <path d="M35 75V85H65L75 75" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M65 85L75 75L65 65" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>
`;

async function generate() {
  const logoPath = path.join(process.cwd(), 'public', 'logo-web.png');
  let iconSource = Buffer.from(svgIconStr);
  let splashSource = Buffer.from(svgSplashStr);
  let foregroundSource = Buffer.from(svgForegroundStr);

  if (fs.existsSync(logoPath) && fs.statSync(logoPath).size > 0) {
    console.log('Utilisation du logo-web.png trouvé...');
    try {
      iconSource = await sharp(logoPath)
        .resize(1024, 1024, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .toBuffer();
        
      splashSource = await sharp(logoPath)
        .resize(2732, 2732, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .toBuffer();
        
      foregroundSource = iconSource;
    } catch (e) {
      console.warn('Erreur lors de la lecture du logo PNG, passage au mode secours :', e.message);
    }
  } else {
    console.log('Aucun logo-web.png valide trouvé, utilisation du logo de secours...');
  }

  await sharp(iconSource).png().toFile(path.join(assetsDir, 'icon.png'));
  await sharp(iconSource).png().toFile(path.join(assetsDir, 'icon-only.png'));
  await sharp(foregroundSource).png().toFile(path.join(assetsDir, 'icon-foreground.png'));
  await sharp(Buffer.from(svgBackgroundStr)).png().toFile(path.join(assetsDir, 'icon-background.png'));
  await sharp(splashSource).png().toFile(path.join(assetsDir, 'splash.png'));
  
  // also add them to public to overwrite PWA icons
  const publicDir = path.resolve('public');
  if (fs.existsSync(publicDir)) {
      await sharp(iconSource).resize(32, 32).png().toFile(path.join(publicDir, 'favicon-32x32.png'));
      await sharp(iconSource).resize(180, 180).png().toFile(path.join(publicDir, 'apple-touch-icon.png'));
      await sharp(iconSource).resize(512, 512).png().toFile(path.join(publicDir, 'android-chrome-512x512.png'));
  }
  
  console.log('Icons and splash screens generated successfully.');
}

generate().catch(console.error);
