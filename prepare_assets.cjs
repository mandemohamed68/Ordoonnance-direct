const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Préparation des ressources pour Ordonnance Direct...');

try {
  // Vérifier si build-icons.js existe
  if (fs.existsSync('build-icons.js')) {
    console.log('📦 Génération des icônes et écrans de démarrage...');
    // On utilise tsx car build-icons.js est un module ES
    execSync('npx tsx build-icons.js', { stdio: 'inherit' });
  }

  // Générer les ressources Capacitor si le dossier android existe
  if (fs.existsSync('android')) {
    try {
      console.log('📱 Génération des ressources Capacitor (Android)...');
      execSync('npx capacitor-assets generate --android', { stdio: 'inherit' });
    } catch (e) {
      console.warn('⚠️  Note: capacitor-assets a échoué ou n\'est pas installé. Vérifiez votre environnement local.');
    }
  } else {
    console.log('ℹ️  Dossier "android" non trouvé, saut de la génération Capacitor Assets.');
  }

  console.log('✅ Préparation terminée avec succès !');
} catch (error) {
  console.error('❌ Erreur lors de la préparation :', error.message);
  process.exit(1);
}
