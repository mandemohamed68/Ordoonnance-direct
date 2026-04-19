# Ordonnance Direct - Plateforme de Santé au Burkina Faso

Ordonnance Direct est une solution full-stack (Web & Mobile) moderne conçue pour simplifier la gestion des ordonnances médicales et la livraison de médicaments au Burkina Faso.

## 🚀 Fonctionnalités Clés

- **Patient Dashboard** : Scan d'ordonnances via caméra, détection automatique de la ville par GPS, et suivi des devis en temps réel.
- **Pharmacist View** : Gestion des demandes de devis, soumission de propositions tarifaires et gestion de stock.
- **Delivery App** : Système de livraison avec suivi GPS en temps réel pour les livreurs.
- **Super Admin Panel** : Contrôle total sur les réglages, les utilisateurs, les pharmacies et la réconciliation financière.
- **AI-Powered OCR** : Utilisation de Google Gemini pour l'extraction automatique des médicaments depuis les photos d'ordonnances.
- **Support Chat** : Messagerie intégrée pour l'assistance aux utilisateurs.
- **Paiements Sécurisés** : Intégration de Mobile Money et Cartes via Sappay.

## 🛠️ Stack Technique

- **Frontend** : React 18, TypeScript, Tailwind CSS, Framer Motion (motion/react).
- **Mobile** : Capacitor (Android/iOS).
- **Backend & DB** : Firebase (Auth, Firestore, Messaging).
- **AI** : Google Gemini API.
- **Cartographie** : Leaflet & React-Leaflet.

## 📦 Installation et Déploiement

### Prérequis
- Node.js (v20+)
- npm
- Compte Firebase configuré

### Installation
1. Clonez le dépôt :
   ```bash
   git clone <votre-repo-url>
   cd ordonnance-direct
   ```
2. Installez les dépendances :
   ```bash
   npm install
   ```
3. Configurez les variables d'environnement :
   Copiez `.env.example` en `.env` et remplissez vos clés API.

### Lancement Local
```bash
npm run dev
```

### Build Mobile (Android APK)
Consultez le fichier `README_LOCAL.md` pour les instructions détaillées sur la génération de l'APK via Android Studio.

## 📜 Licence
Ce projet est sous licence Apache-2.0.
