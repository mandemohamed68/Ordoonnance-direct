# 🚀 Guide de Déploiement Local avec PM2 & Génération Mobile (Android & iOS)

Ce guide complet vous explique pas à pas comment :
1. **Déployer l'application sur votre serveur local / VPS avec PM2 (Cluster haute performance) et SSL (HTTPS).**
2. **Générer le fichier APK Android (Debug & Release) pour smartphones et tablettes.**
3. **Générer l'application iOS (iPhone/iPad) pour Xcode, TestFlight et l'App Store.**

---

## 📋 Table des Matières
- [Partie 1 : Déploiement Local avec PM2 & SSL (HTTPS)](#partie-1--déploiement-local-avec-pm2--ssl-https)
  - [Lancement Automatisé avec PM2](#1-lancement-automatisé-avec-pm2)
  - [Configuration du Reverse Proxy Nginx Sécurisé (HTTPS)](#2-configuration-du-reverse-proxy-nginx-sécurisé-https)
  - [Commandes de Gestion PM2 au Quotidien](#3-commandes-de-gestion-pm2-au-quotidien)
  - [Lancement Automatique au Démarrage du Serveur](#4-lancement-automatique-au-démarrage-du-serveur)
  - [Certificats SSL (Local vs Let's Encrypt Public)](#5-certificats-ssl)
- [Partie 2 : Génération de l'Application Android (APK & AAB)](#partie-2--génération-de-lapplication-android-apk--aab)
  - [Génération APK Debug](#1-génération-de-lapk-debug-prêt-à-installer)
  - [Génération APK Release & AAB](#2-génération-de-lapk-release--aab-pour-google-play)
- [Partie 3 : Génération de l'Application iOS (iPhone / iPad)](#partie-3--génération-de-lapplication-ios-iphone--ipad)

---

# Partie 1 : Déploiement Local avec PM2 & SSL (HTTPS)

### Fichiers de configuration inclus dans le projet :
- `ecosystem.config.cjs` : Configuration PM2 (mode `cluster`, gestion automatique CPU multi-cœurs, rotation des logs, redémarrage automatique en cas de panne).
- `deploy-pm2.sh` : Script automatisé de build et de lancement PM2.
- `nginx/ordonnance-direct-host.conf` : Configuration Nginx sécurisée pour relier le port 443 HTTPS vers le cluster PM2 (port 3000).
- `scripts/install-nginx-pm2.sh` : Script d'installation et de rechargement Nginx en 1 clic.
- `nginx/ssl/` : Certificats SSL générés prêts à l'emploi.

---

### 1. Lancement Automatisé avec PM2

Exécutez simplement la commande suivante dans le dossier du projet :
```bash
./deploy-pm2.sh
```
*(Ou via npm : `npm run pm2:start`)*

Ce script effectue automatiquement :
1. La vérification de Node.js et l'installation de PM2 si nécessaire.
2. La génération des clés et certificats SSL locaux.
3. La compilation complète du frontend Vite et du serveur backend.
4. Le démarrage ou rechargement sans coupure (`startOrReload`) du cluster PM2.

L'application est immédiatement active sur le port interne `http://127.0.0.1:3000`.

---

### 2. Configuration du Reverse Proxy Nginx Sécurisé (HTTPS)

Pour activer le protocole sécurisé **HTTPS (Port 443)** avec vos certificats SSL :
```bash
sudo ./scripts/install-nginx-pm2.sh
```

Ce script configure Nginx pour :
- Rediriger automatiquement le trafic HTTP (Port 80) vers HTTPS.
- Terminer le chiffrement SSL moderne (TLS 1.2 / 1.3).
- Supporter les connexions WebSockets et Server-Sent Events (SSE) en temps réel.
- Autoriser l'envoi d'images et ordonnances jusqu'à 50 Mo.

Accédez à :
- 🔒 **HTTPS :** `https://localhost` (ou l'adresse IP de votre serveur `https://192.168.x.x`)

---

### 3. Commandes de Gestion PM2 au Quotidien

| Action | Commande Script / Directe | Commande NPM |
|---|---|---|
| **Voir l'état des processus** | `pm2 status` | `npm run pm2:status` |
| **Voir les logs en direct** | `pm2 logs ordonnance-direct` | `npm run pm2:logs` |
| **Moniteur CPU & Mémoire** | `pm2 monit` | `npm run pm2:monit` |
| **Recharger sans interruption** | `./deploy-pm2.sh reload` | `npm run pm2:reload` |
| **Redémarrer le service** | `pm2 restart ordonnance-direct` | `pm2 restart ordonnance-direct` |
| **Arrêter l'application** | `./deploy-pm2.sh stop` | `npm run pm2:stop` |

Les fichiers de logs sont stockés dans le dossier `./logs/` :
- `logs/pm2-out.log` : Logs standards
- `logs/pm2-error.log` : Logs d'erreurs

---

### 4. Lancement Automatique au Démarrage du Serveur

Pour que PM2 redémarre automatiquement l'application si votre machine / serveur redémarre :
```bash
pm2 startup
pm2 save
```
*(Copiez et exécutez la ligne `sudo env PATH=...` affichée par la commande `pm2 startup`).*

---

### 5. Certificats SSL

#### A. Régénérer un certificat local personnalisé (IP locale ou nom d'hôte) :
```bash
./scripts/generate-ssl.sh mon-serveur.local 192.168.1.100
sudo ./scripts/install-nginx-pm2.sh
```

#### B. Obtenir un certificat public gratuit Let's Encrypt (Nom de domaine public) :
```bash
./scripts/setup-letsencrypt.sh votredomaine.com contact@votredomaine.com
sudo ./scripts/install-nginx-pm2.sh
```

---

# Partie 2 : Génération de l'Application Android (APK & AAB)

### Prérequis :
- **Node.js** (v18+)
- **Java JDK 17+** (`openjdk-17-jdk`)
- **Android Studio**

---

### 1. Génération de l'APK Debug (Prêt à installer)

```bash
./scripts/build-android-apk.sh debug
```
*(Ou : `npm run build:apk`)*

📍 **Fichier généré :** `android/app/build/outputs/apk/debug/app-debug.apk`  
Transférez ce fichier sur votre téléphone Android pour l'installer directement.

---

### 2. Génération de l'APK Release & AAB (Pour Google Play)

1. Générer la clé de signature :
   ```bash
   ./scripts/generate-keystore.sh
   ```
2. Compiler le bundle :
   ```bash
   ./scripts/build-android-apk.sh release
   ```

📍 **Fichiers générés :**
- APK Release : `android/app/build/outputs/apk/release/app-release-unsigned.apk`
- Google Play Bundle (AAB) : `android/app/build/outputs/bundle/release/app-release.aab`

---

# Partie 3 : Génération de l'Application iOS (iPhone / iPad)

### Prérequis :
- Un ordinateur **Mac** avec **macOS**
- **Xcode** (depuis le Mac App Store)
- **CocoaPods** (`sudo gem install cocoapods`)

---

### Étapes :
1. **Préparer et synchroniser le projet :**
   ```bash
   ./scripts/build-ios.sh
   ```
2. **Ouvrir le projet dans Xcode :**
   ```bash
   npm run cap:open:ios
   ```
3. Dans Xcode :
   - Sélectionnez votre équipe Apple Developer dans l'onglet **"Signing & Capabilities"**.
   - Choisissez votre iPhone ou un simulateur.
   - Cliquez sur **Play (▶️)** pour exécuter ou **Product > Archive** pour exporter le fichier IPA / TestFlight.
