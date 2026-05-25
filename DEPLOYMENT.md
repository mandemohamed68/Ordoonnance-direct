# Guide de Déploiement Ordonnance Direct

Ce projet est prêt pour le déploiement en tant qu'application web et application mobile Android (via Capacitor).

## 1. Déploiement Web
L'application est configurée pour être déployée sur des plateformes comme Vercel, Firebase Hosting ou Netlify.
- Exécutez `npm run build` pour générer les fichiers statiques dans le dossier `dist`.
- Le serveur Express (`server.ts`) peut être utilisé pour un déploiement Node.js complet.

## 2. Génération de l'APK (Android)
En raison des restrictions de l'environnement de développement actuel (absence de Java/Android SDK), l'APK ne peut pas être généré directement ici. 

**Procédure pour générer l'APK sur votre machine :**

### Prérequis
- [Node.js](https://nodejs.org/) installé.
- [Android Studio](https://developer.android.com/studio) installé et configuré.
- [Java JDK 17+](https://www.oracle.com/java/technologies/downloads/) installé.

### Étapes
1. **Exporter le code :** Téléchargez le projet (ZIP) ou clonez-le depuis votre dépôt.
2. **Installer les dépendances :**
   ```bash
   npm install
   ```
3. **Construire le projet web :**
   ```bash
   npm run build
   ```
4. **Synchroniser Capacitor :**
   ```bash
   npx cap sync android
   ```
5. **Ouvrir dans Android Studio :**
   ```bash
   npx cap open android
   ```
6. **Générer l'APK :**
   - Dans Android Studio, allez dans **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
   - Une fois terminé, Android Studio affichera une notification avec un lien vers l'APK généré.

## 3. Configuration Firebase
Assurez-vous que les informations dans `firebase-applet-config.json` sont correctes. Pour la production mobile, vous devrez peut-être ajouter l'empreinte SHA-1 de votre certificat de signature Android dans la console Firebase.

## 4. Notifications SMS
Le système utilise un service de simulation SMS dans `src/utils/sms.ts`. Pour la production, intégrez un fournisseur comme Twilio ou Infobip.
