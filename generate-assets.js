import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const assetsDir = path.join(process.cwd(), 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir);
}

const logoPath = path.join(process.cwd(), 'public', 'logo192.png');

async function generateAssets() {
  if (fs.existsSync(logoPath)) {
    console.log(`Utilisation du logo ${logoPath} pour générer les assets Android...`);
    try {
      // Icon: Resize to 1024x1024 with white background padding if needed
      await sharp(logoPath, { failOnError: false })
        .resize(1024, 1024, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .toFile(path.join(assetsDir, 'icon.png'));

      // Splash: Resize to square but Capacitor-assets will handle proportions, 
      // typically we want a large source.
      await sharp(logoPath)
        .resize(2732, 2732, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .toFile(path.join(assetsDir, 'splash.png'));

      // Copy for foreground/background needs
      const iconBuffer = await sharp(logoPath)
        .resize(1024, 1024, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .toBuffer();
      
      fs.writeFileSync(path.join(assetsDir, 'icon-only.png'), iconBuffer);
      fs.writeFileSync(path.join(assetsDir, 'icon-foreground.png'), iconBuffer);
      
      // Plain white for background
      await sharp({
        create: {
          width: 1024,
          height: 1024,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
      })
      .png()
      .toFile(path.join(assetsDir, 'icon-background.png'));
      
      console.log('Assets générés avec succès avec SHARP !');
      return;
    } catch(e) {
      console.error("Erreur lors de la génération avec SHARP :", e);
    }
  }

  console.log('Logo source manquant ou erreur, génération de secours...');
  
  // Fallback if logo512.png is missing or sharp fails
  const svg = `
    <svg width="1024" height="1024" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="20" fill="#10b981"/>
      <rect x="40" y="20" width="20" height="60" fill="white"/>
      <rect x="20" y="40" width="60" height="20" fill="white"/>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(path.join(assetsDir, 'icon.png'));
    
  await sharp(Buffer.from(svg))
    .png()
    .toFile(path.join(assetsDir, 'splash.png'));

  console.log('Assets de secours générés avec succès !');
}

generateAssets();
