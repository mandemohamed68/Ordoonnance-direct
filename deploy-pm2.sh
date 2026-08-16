#!/usr/bin/env bash

# ==============================================================================
# Script de Déploiement Local & VPS avec PM2 - Ordonnance Direct
# Build complet, gestion de processus PM2 Cluster & Certificats SSL
# ==============================================================================

set -e

ACTION="${1:-start}" # 'start', 'restart', 'reload', 'stop', 'status', 'logs'

echo "============================================================"
echo "🚀 Déploiement Ordonnance Direct avec PM2"
echo "Action : $ACTION"
echo "============================================================"

# Création des dossiers nécessaires
mkdir -p logs nginx/ssl

# 1. Vérification de Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Erreur : Node.js n'est pas installé sur cette machine."
    exit 1
fi

echo "🟢 Version Node.js : $(node -v)"
echo "🟢 Version NPM     : $(npm -v)"

# 2. Vérification et installation globale de PM2 si absent
if ! command -v pm2 &> /dev/null; then
    echo "📦 PM2 non détecté. Installation globale de PM2..."
    npm install -g pm2 || sudo npm install -g pm2 || true
fi

# Commandes simples sans build si demandé
if [ "$ACTION" = "stop" ]; then
    echo "🛑 Arrêt du service PM2..."
    npx pm2 stop ecosystem.config.cjs || pm2 stop ordonnance-direct || true
    exit 0
elif [ "$ACTION" = "status" ]; then
    npx pm2 status || pm2 status
    exit 0
elif [ "$ACTION" = "logs" ]; then
    npx pm2 logs ordonnance-direct || pm2 logs ordonnance-direct
    exit 0
fi

# 3. Génération des certificats SSL si absents
if [ ! -f "./nginx/ssl/server.crt" ] || [ ! -f "./nginx/ssl/server.key" ]; then
    echo "🔒 Génération des certificats SSL..."
    chmod +x ./scripts/generate-ssl.sh
    ./scripts/generate-ssl.sh localhost 127.0.0.1
fi

# 4. Installation des dépendances et compilation
echo "📦 1/3 - Installation des dépendances NPM..."
npm install

echo "🔨 2/3 - Compilation du frontend (Vite) et du backend (Node)..."
npm run build

# 5. Démarrage ou Rechargement à Chaud avec PM2
echo "⚡ 3/3 - Lancement avec PM2 en mode Cluster Haute Disponibilité..."

if command -v pm2 &> /dev/null; then
    pm2 startOrReload ecosystem.config.cjs --env production
    pm2 save
    PM2_CMD="pm2"
else
    npx pm2 startOrReload ecosystem.config.cjs --env production
    npx pm2 save
    PM2_CMD="npx pm2"
fi

echo "============================================================"
echo "🎉 Ordonnance Direct fonctionne maintenant avec PM2 !"
echo "============================================================"
echo "📍 Port Node.js interne : http://127.0.0.1:3000"
echo "🔒 Certificats SSL générés dans : ./nginx/ssl/"
echo ""
echo "📊 Commandes utiles PM2 :"
echo "   - Voir le statut      : $PM2_CMD status"
echo "   - Voir les logs live  : $PM2_CMD logs ordonnance-direct"
echo "   - Dashboard CPU/RAM   : $PM2_CMD monit"
echo "   - Recharger sans coupure : $PM2_CMD reload ecosystem.config.cjs"
echo "   - Redémarrer          : $PM2_CMD restart ordonnance-direct"
echo "   - Arrêter             : $PM2_CMD stop ordonnance-direct"
echo "   - Activer au démarrage du serveur : $PM2_CMD startup"
echo ""
echo "🌐 Pour connecter Nginx avec SSL (HTTPS sur port 443) :"
echo "   sudo ./scripts/install-nginx-pm2.sh"
echo "============================================================"
