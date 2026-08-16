#!/usr/bin/env bash

# ==============================================================================
# Script de Génération de Clé de Signature (Keystore) Android - Ordonnance Direct
# ==============================================================================

set -e

KEYSTORE_PATH="./android/ordonnance-direct-release-key.jks"
ALIAS="ordonnancedirect"

if [ -f "$KEYSTORE_PATH" ]; then
    echo "⚠️ Le fichier keystore existe déjà à : $KEYSTORE_PATH"
    exit 0
fi

echo "🔑 Génération d'une nouvelle clé de signature Android (Keystore)..."

keytool -genkey -v \
    -keystore "$KEYSTORE_PATH" \
    -alias "$ALIAS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -dname "CN=Ordonnance Direct, OU=Mobile, O=Ordonnance Direct, L=Ouagadougou, ST=Kadiogo, C=BF"

echo "✅ Keystore généré avec succès dans : $KEYSTORE_PATH"
echo "ℹ️ Alias de clé : $ALIAS"
echo "⚠️ CONSERVEZ CE FICHIER PRÉCIEUSEMENT DANS UN ENDROIT SÛR !"
