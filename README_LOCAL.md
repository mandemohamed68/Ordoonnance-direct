# Ordonnance Direct - Guide de Déploiement Local et Mobile

Ce guide explique comment configurer et lancer le projet sur votre machine locale, ainsi que comment générer l'APK pour Android.

## 1. Prérequis

- **Node.js** (v20 ou supérieur)
- **npm** (v10 ou supérieur)
- **Android Studio** (pour la génération de l'APK)
- **Java JDK 17** (requis pour Android)

## 2. Configuration Locale

### Installation des dépendances
```bash
npm install
```

### Configuration des variables d'environnement
1. Copiez le fichier `.env.example` vers un nouveau fichier nommé `.env` :
   ```bash
   cp .env.example .env
   ```
2. Ouvrez le fichier `.env` et remplissez les valeurs nécessaires :
   - `GEMINI_API_KEY` : Votre clé API Google Gemini.
   - `VITE_API_BASE_URL` : L'URL de votre serveur local (par défaut `http://localhost:3000`).
   - `SMS_API_USER`, `SMS_API_HASH` : Vos identifiants pour l'API SMS.
   - `SAPPAY_*` : Vos identifiants pour la passerelle de paiement Sappay.

### Lancement du serveur de développement
```bash
npm run dev
```
Le serveur sera accessible sur `http://localhost:3000`.

## 3. Génération de l'APK (Android)

Le projet utilise **Capacitor** pour transformer l'application web en application mobile native.

### Étape 1 : Construire l'application web
```bash
npm run build
```

### Étape 2 : Synchroniser avec le projet Android
```bash
npx cap sync
```

### Étape 3 : Ouvrir dans Android Studio
```bash
npx cap open android
```

### Étape 4 : Générer l'APK dans Android Studio
1. Une fois Android Studio ouvert, attendez que le projet soit indexé.
2. Allez dans le menu **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
3. Android Studio générera l'APK. Une notification apparaîtra en bas à droite une fois terminé. Cliquez sur **locate** pour trouver le fichier `app-debug.apk`.

### Étape 5 : Générer un APK signé (pour la production)
1. Allez dans **Build** > **Generate Signed Bundle / APK...**
2. Choisissez **APK** et suivez les instructions pour créer ou utiliser un keystore.

## 4. Notes Importantes pour le Mobile

- **API Base URL** : Assurez-vous que `VITE_API_BASE_URL` dans votre `.env` pointe vers l'adresse IP de votre machine (ex: `http://192.168.1.10:3000`) si vous testez sur un vrai téléphone connecté au même réseau Wi-Fi. `localhost` ne fonctionnera pas sur un appareil physique.
- **Firebase** : La configuration Firebase est déjà incluse dans `firebase-applet-config.json`. Assurez-vous que les domaines autorisés dans votre console Firebase incluent `localhost` et les adresses IP de test.
- **Firebase Android** : Pour que Firebase fonctionne sur l'APK, vous devez télécharger le fichier `google-services.json` depuis votre console Firebase (Paramètres du projet > Vos applications > Android) et le placer dans le dossier `android/app/`.
