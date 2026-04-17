// Script to generate a basic logo using canvas
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';

const width = 1024;
const height = 1024;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');

const assetsDir = path.join(process.cwd(), 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir);
}

const logoPath = path.join(process.cwd(), 'public', 'logo.png');

async function generateAssets() {
  if (fs.existsSync(logoPath)) {
    // Try to load the user's provided logo
    console.log('Utilisation du logo public/logo.png pour générer les assets Android...');
    try {
      const img = await loadImage(logoPath);
      // Background (White)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      // Draw image in the center
      ctx.drawImage(img, 0, 0, width, height);

      const buffer = canvas.toBuffer('image/png');
      fs.writeFileSync(path.join(assetsDir, 'icon.png'), buffer);
      fs.writeFileSync(path.join(assetsDir, 'splash.png'), buffer);
      fs.writeFileSync(path.join(assetsDir, 'icon-only.png'), buffer);
      fs.writeFileSync(path.join(assetsDir, 'icon-foreground.png'), buffer);
      fs.writeFileSync(path.join(assetsDir, 'icon-background.png'), buffer);
      
      console.log('Assets générés avec succès depuis le vrai logo !');
      return;
    } catch(e) {
      console.log("Erreur lors de la lecture du logo, fallback à la croix par défaut.");
    }
  }

  console.log('Logo public/logo.png manquant. Génération du logo de remplacement manuel...');
  
  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Green Cross
  ctx.fillStyle = '#10b981'; // emerald-500
  // Vertical bar
  ctx.fillRect(width / 2 - 100, height / 2 - 300, 200, 600);
  // Horizontal bar
  ctx.fillRect(width / 2 - 300, height / 2 - 100, 600, 200);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(assetsDir, 'icon.png'), buffer);
  fs.writeFileSync(path.join(assetsDir, 'splash.png'), buffer);
  fs.writeFileSync(path.join(assetsDir, 'icon-only.png'), buffer);
  fs.writeFileSync(path.join(assetsDir, 'icon-foreground.png'), buffer);
  fs.writeFileSync(path.join(assetsDir, 'icon-background.png'), buffer);

  console.log('Assets de base générés avec succès!');
}

generateAssets();
