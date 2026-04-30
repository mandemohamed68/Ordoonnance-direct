const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('--- Préparation des assets Ordonnance Direct ---');

try {
  // Exécuter la génération des assets avec tsx
  console.log('Génération des icônes et splash screens...');
  execSync('npx tsx generate-assets.js', { stdio: 'inherit' });
  
  console.log('Synchronisation avec Capacitor Android...');
  execSync('npx capacitor-assets generate --android', { stdio: 'inherit' });

  console.log('--- Assets préparés avec succès ---');
} catch (error) {
  console.error('Erreur lors de la préparation des assets :', error.message);
  process.exit(1);
}
