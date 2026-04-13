import React from 'react';
import { Shield, FileText, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';

export const Legal = ({ onBack }: { onBack: () => void }) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-200 selection:text-blue-900">
      <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-20 flex items-center gap-4">
          <button 
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
              <Shield size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Mentions Légales & Confidentialité</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 space-y-12">
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-sm border border-slate-100"
        >
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-600">
              <FileText size={24} />
            </div>
            <h2 className="text-2xl font-bold">Mentions Légales</h2>
          </div>
          
          <div className="space-y-6 text-slate-600 leading-relaxed">
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">1. Éditeur du site</h3>
              <p>Le présent site est édité par PharmaLiv, société par actions simplifiée au capital de 10 000 euros, immatriculée au Registre du Commerce et des Sociétés sous le numéro [Numéro RCS], dont le siège social est situé à [Adresse du siège social].</p>
            </div>
            
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">2. Directeur de la publication</h3>
              <p>Le directeur de la publication est [Nom du directeur], en sa qualité de Président.</p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">3. Hébergement</h3>
              <p>Ce site est hébergé par Google Cloud Platform (GCP), dont le siège social est situé au 1600 Amphitheatre Parkway, Mountain View, CA 94043, États-Unis.</p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">4. Propriété intellectuelle</h3>
              <p>L'ensemble de ce site relève de la législation française et internationale sur le droit d'auteur et la propriété intellectuelle. Tous les droits de reproduction sont réservés, y compris pour les documents téléchargeables et les représentations iconographiques et photographiques.</p>
            </div>
          </div>
        </motion.section>

        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-sm border border-slate-100"
        >
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
              <Shield size={24} />
            </div>
            <h2 className="text-2xl font-bold">Politique de Confidentialité</h2>
          </div>
          
          <div className="space-y-6 text-slate-600 leading-relaxed">
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">1. Collecte des données</h3>
              <p>Nous collectons les informations suivantes lors de votre utilisation de notre service : nom, prénom, adresse email, numéro de téléphone, adresse postale, et données de géolocalisation (pour les livreurs et pharmacies).</p>
            </div>
            
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">2. Utilisation des données</h3>
              <p>Les données collectées sont utilisées pour :</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>La gestion de vos commandes et livraisons</li>
                <li>La mise en relation entre patients, pharmacies et livreurs</li>
                <li>L'amélioration de nos services</li>
                <li>Le respect de nos obligations légales</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">3. Protection des données</h3>
              <p>Nous mettons en œuvre des mesures de sécurité techniques et organisationnelles appropriées pour protéger vos données personnelles contre toute destruction, perte, altération, accès ou divulgation non autorisée.</p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">4. Vos droits</h3>
              <p>Conformément à la réglementation applicable (RGPD), vous disposez d'un droit d'accès, de rectification, de suppression et d'opposition au traitement de vos données personnelles. Vous pouvez exercer ces droits en nous contactant à l'adresse email : privacy@pharmaliv.com.</p>
            </div>
          </div>
        </motion.section>
      </main>
    </div>
  );
};
