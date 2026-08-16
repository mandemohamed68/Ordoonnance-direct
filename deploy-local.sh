#!/usr/bin/env bash

# ==============================================================================
# Script de Déploiement Local Automatisé (1-Click) - Ordonnance Direct
# Configure SSL, build l'application et démarre via Docker Compose ou Node
# ==============================================================================

set -e

MODE="${1:-docker}" # 'docker' ou 'node'

echo "============================================================"
echo "🚀 Déploiement Local d'Ordonnance Direct"
echo "Mode : $MODE (docker / node)"
echo "============================================================"

# 1. Vérification et Génération des certificats SSL si absents
if [ ! -f "./nginx/ssl/server.crt" ] || [ ! -f "./nginx/ssl/server.key" ]; then
    echo "🔒 Génération des certificats SSL locaux..."
    chmod +x ./scripts/generate-ssl.sh
    ./scripts/generate-ssl.sh localhost 127.0.0.1
fi

if [ "$MODE" = "docker" ]; then
    echo "🐳 Démarrage avec Docker Compose..."
    if ! command -v docker &> /dev/null; then
        echo "❌ Docker n'est pas installé sur votre machine."
        echo "👉 Vous pouvez utiliser le mode standard : ./deploy-local.sh node"
        exit 1
    fi

    # Build et lancement
    docker compose down || true
    docker compose build --no-cache
    docker compose up -d

    echo "============================================================"
    echo "🎉 Ordonnance Direct est en ligne !"
    echo "🔒 URL HTTPS Sécurisée : https://localhost"
    echo "🌐 URL HTTP (Redirige) : http://localhost"
    echo "📊 Logs des conteneurs : docker compose logs -f"
    echo "🛑 Arrêter le serveur   : docker compose down"
    echo "============================================================"
else
    echo "📦 Installation des dépendances et build local..."
    npm install
    npm run build

    echo "============================================================"
    echo "🚀 Démarrage du serveur Node.js..."
    echo "👉 URL Directe : http://localhost:3000"
    echo "💡 Pour activer HTTPS direct, lancez Nginx ou utilisez Docker Compose."
    echo "============================================================"
    npm start
fi
