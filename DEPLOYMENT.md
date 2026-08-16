# 🚀 Ordonnance Direct - Déploiement Local avec PM2 & Mobile

Pour le guide complet et détaillé, consultez **[`GUIDE_DEPLOIEMENT_LOCAL_ET_MOBILE.md`](./GUIDE_DEPLOIEMENT_LOCAL_ET_MOBILE.md)**.

## ⚡ 1. Déploiement Local avec PM2 & SSL (1-Clic)

```bash
# 🚀 1. Lancer ou Recharger l'application avec PM2
./deploy-pm2.sh

# 🔒 2. Configurer Nginx avec SSL (HTTPS sur port 443 -> PM2)
sudo ./scripts/install-nginx-pm2.sh
```

### 📊 Commandes PM2 usuelles :
```bash
npm run pm2:status    # Voir l'état des processus
npm run pm2:logs      # Voir les logs en temps réel
npm run pm2:monit     # Dashboard interactif CPU / Mémoire
npm run pm2:reload    # Recharger le code sans coupure de service
npm run pm2:stop      # Arrêter l'application
```
- **Accès HTTPS Sécurisé :** `https://localhost`
- **Accès Direct Node.js :** `http://localhost:3000`

---

## 📱 2. Générer l'APK Android (Debug ou Release)

```bash
# Générer l'APK Debug (prêt à installer sur smartphone)
./scripts/build-android-apk.sh debug

# Générer l'APK Release & AAB pour le Play Store
./scripts/build-android-apk.sh release

# Ouvrir dans Android Studio
npm run cap:open:android
```

---

## 🍏 3. Générer l'application iOS (iPhone/iPad)

```bash
# Préparer et synchroniser le projet iOS
./scripts/build-ios.sh

# Ouvrir dans Xcode (sur Mac)
npm run cap:open:ios
```
