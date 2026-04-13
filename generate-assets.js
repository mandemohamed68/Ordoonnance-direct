// Script to generate a basic logo using canvas
import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';

const width = 1024;
const height = 1024;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');

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
const assetsDir = path.join(process.cwd(), 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir);
}

fs.writeFileSync(path.join(assetsDir, 'icon.png'), buffer);
fs.writeFileSync(path.join(assetsDir, 'splash.png'), buffer);
fs.writeFileSync(path.join(assetsDir, 'icon-only.png'), buffer);
fs.writeFileSync(path.join(assetsDir, 'icon-foreground.png'), buffer);
fs.writeFileSync(path.join(assetsDir, 'icon-background.png'), buffer);

console.log('Assets generated successfully!');
