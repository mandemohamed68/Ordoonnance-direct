import fs from 'fs';
import path from 'path';
import { createCanvas } from 'canvas';

function generateIcon() {
  const size = 1024; // standard icon size
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background - emerald-500 (#10b981)
  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, 200); // slight rounded corners if transparent but we'll fill the whole thing
  ctx.fill();

  // Draw Logo (Cross / Shield)
  ctx.strokeStyle = 'white';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const s = size / 100; // scale factor to match original 100x100 SVG

  // Box
  ctx.lineWidth = 6 * s;
  ctx.beginPath();
  //  M35 25C35 22.2386 37.2386 20 40 20H60C62.7614 20 65 22.2386 65 25V75C65 77.7614 62.7614 80 60 80H40C37.2386 80 35 77.7614 35 75V25Z
  ctx.roundRect(35 * s, 20 * s, 30 * s, 60 * s, 5 * s);
  ctx.stroke();

  // Top lines
  ctx.beginPath();
  ctx.moveTo(42 * s, 20 * s);
  ctx.lineTo(42 * s, 25 * s);
  ctx.lineTo(58 * s, 25 * s);
  ctx.lineTo(58 * s, 20 * s);
  ctx.stroke();

  // Cross (Horizontal)
  ctx.lineWidth = 12 * s;
  ctx.beginPath();
  ctx.moveTo(30 * s, 50 * s);
  ctx.lineTo(70 * s, 50 * s);
  ctx.stroke();

  // Cross (Vertical)
  ctx.beginPath();
  ctx.moveTo(50 * s, 30 * s);
  ctx.lineTo(50 * s, 70 * s);
  ctx.stroke();

  // Bottom flap
  ctx.lineWidth = 6 * s;
  ctx.beginPath();
  ctx.moveTo(35 * s, 75 * s);
  ctx.lineTo(35 * s, 85 * s);
  ctx.lineTo(65 * s, 85 * s);
  ctx.lineTo(75 * s, 75 * s);
  ctx.stroke();

  // Bottom corner fold
  ctx.beginPath();
  ctx.moveTo(65 * s, 85 * s);
  ctx.lineTo(75 * s, 75 * s);
  ctx.lineTo(65 * s, 65 * s);
  ctx.stroke();

  // Ensure assets dir exists
  const assetsDir = path.resolve('assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir);
  }

  // Save icon.png
  const iconBuffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(assetsDir, 'icon.png'), iconBuffer);
  
  // Splash screen (2732x2732)
  const splashSize = 2732;
  const splashCanvas = createCanvas(splashSize, splashSize);
  const sCtx = splashCanvas.getContext('2d');
  
  // White background for splash
  sCtx.fillStyle = '#ffffff';
  sCtx.fillRect(0, 0, splashSize, splashSize);
  
  // Draw the icon in the center of splash screen
  const iconSizeInSplash = 800;
  const offset = (splashSize - iconSizeInSplash) / 2;
  sCtx.drawImage(canvas, offset, offset, iconSizeInSplash, iconSizeInSplash);

  // Write text
  sCtx.fillStyle = '#0f172a'; // slate-900
  sCtx.font = 'bold 120px Inter, sans-serif';
  sCtx.textAlign = 'center';
  sCtx.fillText('Ordonnance Direct', splashSize / 2, offset + iconSizeInSplash + 160);
  
  sCtx.fillStyle = '#10b981'; // primary
  sCtx.font = 'bold 60px Inter, sans-serif';
  sCtx.fillText('BURKINA FASO', splashSize / 2, offset + iconSizeInSplash + 260);

  const splashBuffer = splashCanvas.toBuffer('image/png');
  fs.writeFileSync(path.join(assetsDir, 'splash.png'), splashBuffer);
  
  console.log('Icon and splash generated in /assets folder.');
}

generateIcon();
