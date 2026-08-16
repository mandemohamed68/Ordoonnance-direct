import React, { useState } from 'react';
import { 
  Shield, 
  ArrowLeft, 
  Lock, 
  CheckCircle, 
  Building2, 
  Scale, 
  Printer, 
  Search
} from 'lucide-react';
import { motion } from 'motion/react';
import { LogoIcon } from './LogoIcon';

interface LegalProps {
  onBack: () => void;
  initialTab?: 'cgu' | 'privacy' | 'mentions';
}

export const Legal: React.FC<LegalProps> = ({ onBack, initialTab = 'cgu' }) => {
  const [activeTab, setActiveTab] = useState<'cgu' | 'privacy' | 'mentions'>(initialTab);
  const [searchTerm, setSearchTerm] = useState('');

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-emerald-500/20 selection:text-emerald-900">
      {/* Header Bar */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="w-10 h-10 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-colors"
              title="Retour"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center p-1 border border-slate-200 shadow-sm shrink-0">
                <LogoIcon size={40} />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 leading-tight">
                  Centre Juridique & Réglementaire
                </h1>
                <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
                  Ordonnance Direct • Burkina Faso
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold flex items-center gap-2 transition-colors hidden sm:flex"
            >
              <Printer size={15} />
              <span>Imprimer</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 border-t border-slate-200 flex gap-2 sm:gap-6 overflow-x-auto py-2">
          {[
            { id: 'cgu', label: "Conditions Générales (CGU)", icon: Scale },
            { id: 'privacy', label: "Politique de Confidentialité", icon: Lock },
            { id: 'mentions', label: "Mentions Légales & Agréments", icon: Building2 }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                setSearchTerm('');
              }}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <tab.icon size={16} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        {/* Search Bar within Document */}
        <div className="mb-8 relative">
          <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm shadow-sm">
            <Search size={18} className="text-slate-400 shrink-0" />
            <input 
              type="text" 
              placeholder="Rechercher un article (ex: secret médical, livraison, remboursement, pharmacie)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent text-slate-900 placeholder:text-slate-400 w-full outline-none text-sm font-medium"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="text-xs text-slate-400 hover:text-slate-700 font-semibold">
                Effacer
              </button>
            )}
          </div>
        </div>

        {/* 1. CONDITIONS GÉNÉRALES D'UTILISATION (CGU) */}
        {activeTab === 'cgu' && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold uppercase tracking-wider">
                <Scale size={14} />
                Document Contractuel Officiel
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Conditions Générales d'Utilisation et de Vente (CGU/CGV)
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Dernière mise à jour : <strong>1er Août 2026</strong> • Applicable sur le territoire du Burkina Faso.
              </p>
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs leading-relaxed flex items-start gap-3">
                <CheckCircle size={18} className="shrink-0 mt-0.5 text-emerald-600" />
                <span>
                  En accédant à la plateforme <strong>Ordonnance Direct</strong>, vous acceptez sans réserve les présentes conditions générales régissant la télétransmission d'ordonnances médicales, la préparation en officine et la livraison sécurisée.
                </span>
              </div>
            </div>

            {/* Articles List */}
            <div className="space-y-6">
              {[
                {
                  num: "Article 1",
                  title: "Objet et Champ d'Application",
                  content: `La plateforme numérique "Ordonnance Direct", exploitée par la société Ordonnance Direct SARL (Ouagadougou, Burkina Faso), a pour objet exclusif de faciliter la mise en relation sécurisée entre les patients, les pharmacies d'officine dûment agréées par le Ministère de la Santé et l'Ordre National des Pharmaciens du Burkina Faso (ONPBF), et des services de livraison médicale agréés.

Ordonnance Direct n'est pas une officine de pharmacie et ne se substitue en aucun cas à la décision médicale du prescripteur ni au monopole pharmaceutique de dispensation réservé aux pharmaciens d'officine.`
                },
                {
                  num: "Article 2",
                  title: "Conditions d'Accès et Création de Compte",
                  content: `L'accès aux services nécessite la création d'un compte utilisateur personnel. L'utilisateur s'engage à fournir des informations exactes, sincères et complètes (nom, prénom, numéro de téléphone fonctionnel au Burkina Faso, adresse de livraison précise).

Pour les Professionnels de Santé (Pharmaciens) : La validation du compte est conditionnée par la présentation de la licence d'exploitation de l'officine et de l'inscription au tableau de l'Ordre.
Pour les Livreurs Partenaires : La validation requiert une pièce d'identité en cours de validité, un casier judiciaire vierge et un engagement formel au respect du secret médical.`
                },
                {
                  num: "Article 3",
                  title: "Transmission et Validité des Ordonnances",
                  content: `Le patient télétransmet une copie numérisée (photo nette) ou la saisie de son ordonnance médicale délivrée par un professionnel de santé habilité (médecin, sage-femme, dentiste).

L'ordonnance doit comporter : l'identité du praticien, la date de prescription, la signature et le cachet de l'établissement, ainsi que le nom du patient et les posologies.
Le pharmacien d'officine conserve son droit légal de refus de dispensation s'il estime que la prescription présente un risque pour la santé du patient ou si le document semble falsifié.`
                },
                {
                  num: "Article 4",
                  title: "Établissement du Devis Officinal et Tarifs",
                  content: `Dès réception de l'ordonnance, l'officine de garde ou de proximité vérifie la disponibilité des médicaments et établit un devis clair comprenant :
1. Le prix public réglementé de chaque médicament (conforme à la nomenclature officielle des prix au Burkina Faso).
2. Les éventuels substituts génériques autorisés par le prescripteur ou validés par le patient.
3. Les frais de livraison forfaitaires ou géolocalisés.

Le devis est valable pendant une durée maximale de 2 heures en journée et 30 minutes en service de garde de nuit.`
                },
                {
                  num: "Article 5",
                  title: "Modalités de Paiement et Sécurité des Transactions",
                  content: `Le règlement des commandes s'effectue via les moyens de paiement autorisés :
- Portefeuilles mobiles : Orange Money, Moov Money, Telecel Money, Coris Money.
- Paiement comptant à la livraison (sous réserve d'acceptation par l'officine).

Toutes les transactions électroniques sont sécurisées et chiffrées. Les fonds des médicaments sont reversés directement à l'officine dispensatrice, minorés des éventuels frais de service de la plateforme.`
                },
                {
                  num: "Article 6",
                  title: "Conditionnement, Scellé et Logistique Sécurisée",
                  content: `Les médicaments sont préparés et emballés exclusivement dans l'enceinte de la pharmacie d'officine dans un sac opaque scellé inviolable portant une étiquette d'identification codée.

Le livreur partenaire n'a en aucun cas connaissance du contenu médical du pli scellé et a interdiction absolue de l'ouvrir ou de le modifier.`
                },
                {
                  num: "Article 7",
                  title: "Procédure de Remise et Code de Sécurité (OTP)",
                  content: `La remise du pli scellé au patient ou à son représentant légal s'effectue exclusivement contre la communication et validation du Code de Sécurité Unique à 6 chiffres (Code OTP) transmis dans l'application du patient.

La saisie de ce code par le livreur dans son interface constitue la preuve juridique irréfutable de la livraison conforme.`
                },
                {
                  num: "Article 8",
                  title: "Absence de Droit de Rétractation sur les Médicaments",
                  content: `Conformément aux dispositions du Code de la Santé Publique et de la réglementation pharmaceutique en vigueur au Burkina Faso, aucun retour ni échange de médicaments ne peut être accepté une fois le pli scellé remis au patient, afin de garantir l'intégrité de la chaîne du médicament et d'éviter tout risque de contamination ou d'altération thermique.`
                },
                {
                  num: "Article 9",
                  title: "Pharmacies de Garde et Urgences Médicales",
                  content: `En dehors des heures d'ouverture standard, les commandes sont orientées automatiquement vers les officines assurant le tour de garde officiel de la ville (Ouagadougou, Bobo-Dioulasso, etc.).

AVERTISSEMENT : En cas d'urgence vitale immédiate, le patient doit immédiatement contacter les services de secours d'urgence (SAMU 15, Sapeurs-Pompiers 18) ou se rendre directement au centre hospitalier le plus proche.`
                },
                {
                  num: "Article 10",
                  title: "Responsabilité et Force Majeure",
                  content: `La responsabilité de la société éditrice est strictement limitée à la fourniture technique de la plateforme logicielle.
L'officine est seule responsable de la conformité de la dispensation pharmaceutique et de la qualité des produits.
Le livreur est responsable de l'acheminement diligent du pli scellé.
Aucune partie ne pourra être tenue responsable en cas de force majeure (intempéries exceptionnelles, pannes généralisées des réseaux télécoms ou bancaires nationaux, troubles civils).`
                },
                {
                  num: "Article 11",
                  title: "Règlement des Litiges et Droit Applicable",
                  content: `Les présentes CGU sont exclusivement régies par le droit burkinabè. Tout litige relatif à leur validité, interprétation ou exécution sera soumis en priorité à une tentative de médiation amiable. À défaut d'accord sous 30 jours, compétence expresse est attribuée aux tribunaux compétents de Ouagadougou (Burkina Faso).`
                }
              ].filter(art => 
                !searchTerm || 
                art.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                art.content.toLowerCase().includes(searchTerm.toLowerCase())
              ).map((art, idx) => (
                <div key={idx} className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-emerald-600 text-xs font-black uppercase tracking-widest font-mono">
                    <span>{art.num}</span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">{art.title}</h3>
                  <div className="text-slate-600 text-sm leading-relaxed whitespace-pre-line">
                    {art.content}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* 2. POLITIQUE DE CONFIDENTIALITÉ & DONNÉES DE SANTÉ */}
        {activeTab === 'privacy' && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-200 text-xs font-bold uppercase tracking-wider">
                <Lock size={14} />
                Protection des Données de Santé & Secret Médical
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Politique de Confidentialité et Protection des Données Personnelles
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Conforme aux dispositions de la Loi n° 001-2021/AN portant protection des personnes à l'égard du traitement des données à caractère personnel au Burkina Faso et supervisée par la Commission de l'Informatique et des Libertés (CIL).
              </p>
              <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200 text-sky-900 text-xs leading-relaxed flex items-start gap-3">
                <Shield size={18} className="shrink-0 mt-0.5 text-sky-600" />
                <span>
                  Vos ordonnances et antécédents médicaux relèvent du <strong>secret médical absolu</strong>. Ils ne sont jamais revendus, cédés ou utilisés à des fins publicitaires.
                </span>
              </div>
            </div>

            {/* Privacy Articles */}
            <div className="space-y-6">
              {[
                {
                  num: "Section 1",
                  title: "Responsable du Traitement des Données",
                  content: `Le responsable du traitement des données collectées via l'application et le site web est la société Ordonnance Direct SARL, ayant son siège à Ouagadougou, Burkina Faso.

Contact Délégué à la Protection des Données (DPO) : dpo@ordonnance-direct.bf.`
                },
                {
                  num: "Section 2",
                  title: "Nature des Données Collectées",
                  content: `Nous collectons strictement les données nécessaires au bon traitement de votre demande de santé :
1. Données d'identité et contact : Nom, prénom, numéro de téléphone, adresse email, adresse de livraison et repères urbains.
2. Données de santé à caractère sensible : Images numérisées des ordonnances, noms des médicaments prescrits, posologies et informations du médecin prescripteur.
3. Données de géolocalisation : Position GPS ponctuelle pour identifier les officines à proximité et guider le livreur partenaire jusqu'au domicile.
4. Données de transaction : Historique des commandes, montants, statut de paiement Mobile Money.`
                },
                {
                  num: "Section 3",
                  title: "Finalités et Bases Légales du Traitement",
                  content: `Vos données sont traitées pour les finalités exclusives suivantes :
- La transmission chiffrée de votre ordonnance à l'officine pour vérification et devis (exécution du contrat de service).
- La délivrance pharmaceutique conforme et l'édition de la facture officielle.
- L'acheminement sécurisé par le livreur certifié.
- Le respect des obligations légales et comptables imposées par la législation burkinabè.

Base légale : Consentement explicite du patient lors du téléversement de l'ordonnance et exécution des prestations demandées.`
                },
                {
                  num: "Section 4",
                  title: "Secret Professionnel et Destinataires Stricts",
                  content: `L'accès à vos données médicales est rigoureusement compartimenté :
- Pharmaciens diplômés de l'officine sélectionnée : Accès complet à l'ordonnance pour validation thérapeutique.
- Livreurs partenaires : Accès UNIQUEMENT au nom, à l'adresse de livraison et au numéro de téléphone de contact. Ils n'ont AUCUN accès à la prescription ni à la liste des médicaments.
- Équipe technique et hébergeur : Données chiffrées au repos (AES-256) et en transit (TLS 1.3).`
                },
                {
                  num: "Section 5",
                  title: "Durée de Conservation des Données",
                  content: `Les données sont conservées conformément aux durées réglementaires en vigueur :
- Images des ordonnances : Conservées dans l'espace sécurisé du patient pour son suivi, ou archivées selon les obligations légales de traçabilité pharmaceutique.
- Données de géolocalisation en direct : Supprimées immédiatement dès la finalisation de la course.
- Données comptables et factures : Conservées 5 ans conformément au droit commercial de l'OHADA.`
                },
                {
                  num: "Section 6",
                  title: "Vos Droits sur Vos Données Personnelles",
                  content: `Conformément à la législation sur la protection des données personnelles au Burkina Faso, vous disposez des droits suivants :
- Droit d'accès et de copie de vos données de santé.
- Droit de rectification des informations inexactes.
- Droit à l'effacement de vos données (droit à l'oubli), sous réserve des obligations légales d'archivage des ordonnances.
- Droit d'opposition ou de limitation du traitement.

Pour exercer ces droits, adressez un message avec une copie de pièce d'identité à : contact@ordonnance-direct.bf.`
                },
                {
                  num: "Section 7",
                  title: "Sécurité Technique et Mesures de Sauvegarde",
                  content: `Nous appliquons les standards de cybersécurité les plus élevés :
- Chiffrement symétrique AES-256 pour le stockage des documents d'ordonnances.
- Communications HTTPS / TLS 1.3 chiffrées de bout en bout.
- Authentification et validation par code OTP pour les remises de colis.
- Audits de sécurité réguliers et sauvegardes quotidiennes répliquées.`
                }
              ].filter(sec => 
                !searchTerm || 
                sec.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                sec.content.toLowerCase().includes(searchTerm.toLowerCase())
              ).map((sec, idx) => (
                <div key={idx} className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-sky-600 text-xs font-black uppercase tracking-widest font-mono">
                    <span>{sec.num}</span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">{sec.title}</h3>
                  <div className="text-slate-600 text-sm leading-relaxed whitespace-pre-line">
                    {sec.content}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* 3. MENTIONS LÉGALES & AGRÉMENTS */}
        {activeTab === 'mentions' && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold uppercase tracking-wider">
                <Building2 size={14} />
                Informations Légales & Réglementaires
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Mentions Légales, Agréments & Propriété Intellectuelle
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Informations légales relatives à l'éditeur et aux agréments des partenaires du réseau Ordonnance Direct au Burkina Faso.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Éditeur */}
              <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                  <Building2 size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Éditeur de la Plateforme</h3>
                <div className="text-sm text-slate-600 space-y-2">
                  <p><strong>Raison Sociale :</strong> Ordonnance Direct SARL</p>
                  <p><strong>Forme Juridique :</strong> Société à Responsabilité Limitée</p>
                  <p><strong>Siège Social :</strong> Secteur 15, Ouagadougou, Burkina Faso</p>
                  <p><strong>RCCM :</strong> BF-OUA-01-2026-B12-00482</p>
                  <p><strong>IFU :</strong> 00194820P</p>
                  <p><strong>Email :</strong> contact@ordonnance-direct.bf</p>
                  <p><strong>Téléphone :</strong> +226 25 30 00 00</p>
                </div>
              </div>

              {/* Hébergement & Infrastructure */}
              <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
                <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
                  <Shield size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Hébergement & Certifications</h3>
                <div className="text-sm text-slate-600 space-y-2">
                  <p><strong>Hébergeur Cloud :</strong> Google Cloud Platform (GCP)</p>
                  <p><strong>Région d'hébergement :</strong> Europe West (Haute sécurité données de santé)</p>
                  <p><strong>Certifications :</strong> ISO 27001, SOC 2 Type II, Chiffrement TLS 1.3</p>
                  <p><strong>Sauvegardes :</strong> Réplication géographique automatique quotidienne</p>
                </div>
              </div>

              {/* Cadre Déontologique & Pharmacies */}
              <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4 md:col-span-2">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                  <Scale size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Cadre Déontologique & Respect du Monopole Pharmaceutique</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Toutes les opérations de dispensation de médicaments sont assurées exclusivement par des pharmaciens titulaires d'une officine légalement autorisée au Burkina Faso et inscrits au tableau de l'Ordre National des Pharmaciens du Burkina Faso (ONPBF), sous le contrôle du Ministère de la Santé.
                </p>
                <p className="text-sm text-slate-600 leading-relaxed">
                  L'application Ordonnance Direct n'effectue aucune vente directe de médicaments et agit exclusivement en qualité de prestataire de services technologiques et d'intermédiation de transport sécurisé.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </main>

      {/* Footer info */}
      <footer className="max-w-4xl mx-auto px-4 sm:px-6 py-8 border-t border-slate-200 text-center text-xs text-slate-500">
        <p>© {new Date().getFullYear()} Ordonnance Direct SARL. Tous droits réservés • Ouagadougou, Burkina Faso.</p>
      </footer>
    </div>
  );
};
