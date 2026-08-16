#!/usr/bin/env bash

# ==============================================================================
# Script Let's Encrypt Certbot Automatisé - Ordonnance Direct
# Permet d'obtenir et renouveler des certificats SSL gratuits valides mondialement
# ==============================================================================

set -e

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage : $0 <nom_de_domaine> <email_administrateur>"
    echo "Exemple : $0 app.ordonnancedirect.com admin@ordonnancedirect.com"
    exit 1
fi

DOMAIN="$1"
EMAIL="$2"
SSL_DIR="./nginx/ssl"

echo "🌐 Configuration de Let's Encrypt pour $DOMAIN..."

mkdir -p "$SSL_DIR"

# Vérifier si certbot est installé
if command -v certbot &> /dev/null; then
    echo "📦 Obtention du certificat via Certbot autonome..."
    certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"

    # Copier ou lier vers le dossier nginx/ssl
    cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$SSL_DIR/server.crt"
    cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$SSL_DIR/server.key"

    echo "✅ Certificat Let's Encrypt installé dans $SSL_DIR/"
else
    echo "ℹ️ Certbot n'est pas installé sur l'hôte. Utilisation de Docker Certbot..."
    docker run -it --rm --name certbot \
        -v "$(pwd)/nginx/certbot/conf:/etc/letsencrypt" \
        -v "$(pwd)/nginx/certbot/www:/var/www/certbot" \
        certbot/certbot certonly --webroot -w /var/www/certbot \
        -d "$DOMAIN" --email "$EMAIL" --agree-tos --no-eff-email

    cp "$(pwd)/nginx/certbot/conf/live/$DOMAIN/fullchain.pem" "$SSL_DIR/server.crt"
    cp "$(pwd)/nginx/certbot/conf/live/$DOMAIN/privkey.pem" "$SSL_DIR/server.key"

    echo "✅ Certificat Let's Encrypt configuré avec succès !"
fi
