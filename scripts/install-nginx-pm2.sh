#!/usr/bin/env bash

# ==============================================================================
# Script de Configuration Automatisée Nginx HTTPS pour PM2 - Ordonnance Direct
# Compatible : Ubuntu, Debian, CentOS, RHEL, Fedora, Arch Linux, macOS
# ==============================================================================

set -e

PROJECT_DIR="$(pwd)"
SSL_SRC="$PROJECT_DIR/nginx/ssl"
CONF_SRC="$PROJECT_DIR/nginx/ordonnance-direct-host.conf"

echo "============================================================"
echo "🔒 Configuration Nginx Reverse Proxy (HTTPS -> PM2 Port 3000)"
echo "============================================================"

# 1. Vérifier si Nginx est installé
if ! command -v nginx &> /dev/null; then
    echo "📦 Nginx non détecté. Installation en cours..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y nginx
    elif command -v yum &> /dev/null; then
        sudo yum install -y nginx
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y nginx
    elif command -v brew &> /dev/null; then
        brew install nginx
    else
        echo "❌ Veuillez installer Nginx manuellement sur votre système."
        exit 1
    fi
fi

# 2. Copier les certificats SSL dans /etc/nginx/ssl
echo "🔑 Installation des certificats SSL dans /etc/nginx/ssl/..."
sudo mkdir -p /etc/nginx/ssl
sudo cp "$SSL_SRC/server.crt" /etc/nginx/ssl/ordonnance-direct.crt
sudo cp "$SSL_SRC/server.key" /etc/nginx/ssl/ordonnance-direct.key
sudo chmod 600 /etc/nginx/ssl/ordonnance-direct.key
sudo chmod 644 /etc/nginx/ssl/ordonnance-direct.crt

# 3. Installer la configuration Nginx
if [ -d "/etc/nginx/sites-available" ]; then
    echo "📋 Installation du site dans /etc/nginx/sites-available/ordonnance-direct..."
    sudo cp "$CONF_SRC" /etc/nginx/sites-available/ordonnance-direct
    sudo ln -sf /etc/nginx/sites-available/ordonnance-direct /etc/nginx/sites-enabled/
    # Supprimer default si nécessaire
    sudo rm -f /etc/nginx/sites-enabled/default || true
elif [ -d "/etc/nginx/conf.d" ]; then
    echo "📋 Installation du site dans /etc/nginx/conf.d/ordonnance-direct.conf..."
    sudo cp "$CONF_SRC" /etc/nginx/conf.d/ordonnance-direct.conf
fi

# 4. Tester la configuration Nginx
echo "🧪 Test de la configuration Nginx..."
sudo nginx -t

# 5. Redémarrer / Recharger Nginx
echo "🔄 Rechargement de Nginx..."
if command -v systemctl &> /dev/null; then
    sudo systemctl restart nginx || sudo systemctl reload nginx
    sudo systemctl enable nginx || true
else
    sudo nginx -s reload || sudo nginx
fi

echo "============================================================"
echo "✅ Nginx est configuré et actif avec SSL !"
echo "🔒 Accès Sécurisé HTTPS : https://localhost"
echo "🌐 Accès HTTP (Redirigé) : http://localhost"
echo "============================================================"
