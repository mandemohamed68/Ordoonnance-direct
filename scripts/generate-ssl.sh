#!/usr/bin/env bash

# ==============================================================================
# Script de Génération de Certificats SSL (HTTPS) - Ordonnance Direct
# Génère un certificat X.509 sécurisé avec Subject Alternative Name (SAN)
# Fonctionne pour: localhost, 127.0.0.1, adresse IP locale ou nom de domaine
# ==============================================================================

set -e

SSL_DIR="./nginx/ssl"
DOMAIN="${1:-localhost}"
IP_ADDRESS="${2:-127.0.0.1}"

echo "🔒 Préparation des certificats SSL pour : $DOMAIN ($IP_ADDRESS)..."

mkdir -p "$SSL_DIR"

CONFIG_FILE="$SSL_DIR/openssl.cnf"

cat > "$CONFIG_FILE" <<EOF
[req]
default_bits        = 2048
default_keyfile     = server.key
distinguished_name  = req_distinguished_name
req_extensions      = req_ext
x509_extensions     = v3_ca
string_mask         = utf8only
prompt              = no

[req_distinguished_name]
C  = BF
ST = Kadiogo
L  = Ouagadougou
O  = Ordonnance Direct
OU = IT Security
CN = $DOMAIN

[req_ext]
subjectAltName = @alt_names

[v3_ca]
subjectAltName = @alt_names
basicConstraints = critical, CA:true
keyUsage = critical, digitalSignature, keyEncipherment, keyCertSign

[alt_names]
DNS.1   = $DOMAIN
DNS.2   = localhost
DNS.3   = *.localhost
IP.1    = 127.0.0.1
IP.2    = $IP_ADDRESS
EOF

echo "🔑 Génération de la clé privée (server.key) et du certificat (server.crt)..."

openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "$SSL_DIR/server.key" \
    -out "$SSL_DIR/server.crt" \
    -config "$CONFIG_FILE"

# Permissions
chmod 600 "$SSL_DIR/server.key"
chmod 644 "$SSL_DIR/server.crt"
rm -f "$CONFIG_FILE"

echo "✅ Certificat SSL généré avec succès dans : $SSL_DIR/"
echo "   - Clé privée  : $SSL_DIR/server.key"
echo "   - Certificat  : $SSL_DIR/server.crt"
echo "   - Validité    : 10 ans (3650 jours)"
echo "   - Domaines/IP : $DOMAIN, localhost, 127.0.0.1, $IP_ADDRESS"
