#!/usr/bin/env bash

# ==============================================================================
# Script de Préparation et Compilation iOS (iPhone/iPad) - Ordonnance Direct
# Nécessite un Mac avec macOS, Xcode et CocoaPods
# ==============================================================================

set -e

echo "============================================================"
echo "🍏 Préparation du projet iOS Ordonnance Direct"
echo "============================================================"

# 1. Compilation Web
echo "📦 1/4 - Compilation des fichiers Web..."
npm run build

# 2. Initialisation iOS si non présent
if [ ! -d "ios" ]; then
    echo "📱 Création du conteneur natif iOS..."
    npx cap add ios
fi

# 3. Synchronisation Capacitor iOS
echo "🔄 2/4 - Synchronisation des plugins & code dans iOS..."
npx cap sync ios

# 4. Installation des Pods CocoaPods
if [ -d "ios/App" ]; then
    echo "📦 3/4 - Installation des dépendances CocoaPods..."
    cd ios/App
    pod install || true
    cd ../..
fi

echo "============================================================"
echo "✅ Projet iOS prêt !"
echo "👉 Pour ouvrir le projet dans Xcode :"
echo "   npx cap open ios"
echo ""
echo "📱 Dans Xcode :"
echo "   1. Sélectionnez votre équipe de développement dans 'Signing & Capabilities'."
echo "   2. Choisissez votre appareil ou simulateur iOS."
echo "   3. Cliquez sur 'Run' (Bouton ▶️) pour tester."
echo "   4. Pour générer l'archive IPA / TestFlight : Menu 'Product' > 'Archive'."
echo "============================================================"
