#!/usr/bin/env bash

# ==============================================================================
# Script de Génération d'APK Android (Debug & Release) - Ordonnance Direct
# ==============================================================================

set -e

BUILD_TYPE="${1:-debug}"

echo "============================================================"
echo "🚀 Génération de l'application Android Ordonnance Direct"
echo "Mode de build : $BUILD_TYPE (debug / release)"
echo "============================================================"

# 1. Vérification des outils nécessaires
if ! command -v node &> /dev/null; then
    echo "❌ Erreur : Node.js n'est pas installé."
    exit 1
fi

# 2. Build du frontend Web
echo "📦 1/4 - Compilation des fichiers Web (Vite)..."
npm run build

# 3. Synchronisation Capacitor
echo "🔄 2/4 - Synchronisation Capacitor Android..."
npx cap sync android

# 4. Compilation Android avec Gradle
cd android

# Rendre gradlew exécutable si sous Unix/macOS/Linux
chmod +x ./gradlew || true

if [ "$BUILD_TYPE" = "release" ]; then
    echo "🔨 3/4 - Compilation de l'APK Release & Bundle (AAB)..."
    ./gradlew assembleRelease
    ./gradlew bundleRelease || true

    echo "============================================================"
    echo "✅ APK Release généré avec succès !"
    echo "📍 Emplacement APK : android/app/build/outputs/apk/release/app-release-unsigned.apk"
    echo "📍 Emplacement AAB (Google Play) : android/app/build/outputs/bundle/release/app-release.aab"
    echo "💡 Pour signer l'APK pour le Play Store, utilisez le script : ./scripts/generate-keystore.sh"
    echo "============================================================"
else
    echo "🔨 3/4 - Compilation de l'APK Debug..."
    ./gradlew assembleDebug

    echo "============================================================"
    echo "✅ APK Debug généré avec succès !"
    echo "📍 Emplacement APK : android/app/build/outputs/apk/debug/app-debug.apk"
    echo "📱 Vous pouvez copier ce fichier direct sur votre téléphone Android et l'installer !"
    echo "============================================================"
fi
