# Guide de Génération de l'APK - Ordonnance Direct

Ce document explique les étapes pour générer un APK fluide et optimisé pour le Burkina Faso.

## 1. Pré-requis
- Node.js 20+
- Android Studio avec SDK 34+
- `npm install` effectué

## 2. Optimisations RAM incluses
L'application utilise désormais :
- **Compression d'image automatique** : Les photos d'ordonnances sont compressées avant l'envoi pour éviter de saturer la RAM et respecter la limite de 1 Mo par document de Firestore.
- **Gestion des abonnements Firestore** : Les écouteurs temps réel sont optimisés pour ne charger que les données récentes.
- **Nettoyage automatique** : Les ressources inutilisées sont libérées lors du changement de page.

## 3. Étapes de Build
Pour générer l'APK :

```bash
# 1. Compiler le frontend (Vite)
npm run build

# 2. Synchroniser avec Capacitor (Android)
npx cap sync android

# 3. Ouvrir dans Android Studio pour la signature
npx cap open android
```

Dans Android Studio :
1. Allez dans **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
2. Une fois terminé, cliquez sur **Locate** dans la notification en bas à droite.

## 4. Navigation et Fluidité
- L'application utilise **Framer Motion** (`motion/react`) pour des transitions fluides entre les onglets.
- Des **retours haptiques** (vibrations discrètes) ont été configurés pour les actions importantes sur mobile (nécessite le plugin Capacitor Haptics, déjà installé).
- Le mode hors-ligne de Firestore est activé pour permettre une consultation rapide même avec une connexion instable.

## 5. Maintenance
Si vous modifiez le code, n'oubliez pas de relancer `npm run build` et `npx cap copy android` avant de tester sur votre téléphone.
