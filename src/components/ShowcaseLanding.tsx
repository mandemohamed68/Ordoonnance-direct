import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, 
  Clock, 
  Truck, 
  Building2, 
  Smartphone, 
  Lock, 
  CheckCircle2, 
  ArrowRight, 
  Users, 
  Phone, 
  Mail, 
  MapPin, 
  ChevronDown,
  Check, 
  Zap, 
  Activity
} from 'lucide-react';
import { LogoIcon } from './LogoIcon';

interface ShowcaseLandingProps {
  onGoToAuth: (mode?: 'login' | 'signup') => void;
  onOpenLegal: (tab?: 'cgu' | 'privacy' | 'mentions') => void;
}

export const ShowcaseLanding: React.FC<ShowcaseLandingProps> = ({ onGoToAuth, onOpenLegal }) => {
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [selectedRoleTab, setSelectedRoleTab] = useState<'patient' | 'pharmacist' | 'delivery'>('patient');

  const faqs = [
    {
      q: "Comment fonctionne la transmission d'une ordonnance sur la plateforme ?",
      a: "Il vous suffit de prendre en photo votre ordonnance médicale ou de saisir le nom de vos médicaments. Notre système transmet de manière sécurisée et chiffrée votre demande aux officines agréées les plus proches de votre position au Burkina Faso. Vous recevez un devis clair en moins de 15 minutes."
    },
    {
      q: "Les médicaments proviennent-ils d'officines agréées ?",
      a: "Absolument. Ordonnance Direct collabore exclusivement avec des pharmacies d'officine titulaires d'une autorisation officielle d'exercice et inscrites à l'Ordre National des Pharmaciens du Burkina Faso. Aucun médicament ne provient de circuits non certifiés."
    },
    {
      q: "Comment est garantie la confidentialité de mes données médicales ?",
      a: "Toutes vos ordonnances et données de santé sont chiffrées de bout en bout (AES-256). Seul le pharmacien d'officine assigné a accès à votre ordonnance pour la dispensation. Le livreur ne transporte qu'un colis opaque scellé avec un code de sécurité à 6 chiffres."
    },
    {
      q: "Quels sont les modes de paiement acceptés ?",
      a: "Nous acceptons tous les moyens de paiement locaux : Orange Money, Moov Money, Telecel Money, Coris Money ainsi que le paiement sécurisé à la livraison après inspection du scellé de conformité."
    },
    {
      q: "Le service fonctionne-t-il la nuit et les jours fériés ?",
      a: "Oui. Ordonnance Direct intègre automatiquement le calendrier officiel des pharmacies de garde de Ouagadougou, Bobo-Dioulasso, Koudougou et des principales villes pour assurer vos besoins urgents 24h/24 et 7j/7."
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-emerald-500/20 selection:text-emerald-900">
      {/* 1. Header / Navigation */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center p-1 border border-slate-200 shadow-sm shrink-0">
              <LogoIcon size={48} />
            </div>
            <div>
              <span className="text-xl font-extrabold tracking-tight text-slate-900 flex items-center gap-1.5">
                Ordonnance <span className="text-emerald-600">Direct</span>
              </span>
              <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                e-Santé • Burkina Faso
              </span>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
            <a href="#fonctionnement" className="hover:text-emerald-600 transition-colors">Comment ça marche</a>
            <a href="#avantages" className="hover:text-emerald-600 transition-colors">Avantages</a>
            <a href="#acteurs" className="hover:text-emerald-600 transition-colors">Pour qui ?</a>
            <a href="#faq" className="hover:text-emerald-600 transition-colors">Questions fréquentes</a>
            <button 
              onClick={() => onOpenLegal('cgu')} 
              className="text-slate-500 hover:text-slate-900 transition-colors"
            >
              CGU & Légal
            </button>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onGoToAuth('login')}
              className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-all"
            >
              Se connecter
            </button>
            <button
              onClick={() => onGoToAuth('signup')}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 active:scale-[0.98] transition-all flex items-center gap-2"
            >
              <span>Accéder au service</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="relative pt-12 pb-20 overflow-hidden bg-gradient-to-b from-emerald-50/50 via-white to-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            <motion.div 
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-100/80 border border-emerald-300 text-emerald-800 text-xs font-bold uppercase tracking-wider"
            >
              <ShieldCheck size={15} className="text-emerald-700" />
              Réseau Officinal Agréé • Burkina Faso
            </motion.div>

            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.15]"
            >
              Vos médicaments prescrits, livrés en toute <span className="text-emerald-600">sécurité et discrétion</span>.
            </motion.h1>

            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg sm:text-xl text-slate-600 font-normal leading-relaxed max-w-2xl mx-auto"
            >
              Transmettez votre ordonnance en un clic. Les pharmacies agréées de votre ville vous répondent avec un devis précis et nos livreurs certifiés vous apportent vos médicaments scellés à domicile.
            </motion.p>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
            >
              <button
                onClick={() => onGoToAuth('signup')}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base shadow-lg shadow-emerald-600/25 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
              >
                <span>Commander mes médicaments</span>
                <ArrowRight size={18} />
              </button>
              <button
                onClick={() => {
                  const el = document.getElementById('fonctionnement');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="w-full sm:w-auto px-7 py-4 rounded-2xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-base transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Découvrir le fonctionnement</span>
                <ChevronDown size={18} />
              </button>
            </motion.div>

            {/* Key Trust Pillars */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="pt-10 grid grid-cols-2 sm:grid-cols-4 gap-4 text-left"
            >
              {[
                { icon: Clock, title: "Devis < 15 min", desc: "Traitement express garanti" },
                { icon: ShieldCheck, title: "100% Officines", desc: "Pharmacies certifiées ONPBF" },
                { icon: Lock, title: "Secret Médical", desc: "Pli opaque scellé & chiffré" },
                { icon: Zap, title: "Garde 24h/7j", desc: "Urgences de nuit assurées" }
              ].map((item, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                    <item.icon size={20} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">{item.title}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* 3. Section: Comment ça marche (Step by Step) */}
      <section id="fonctionnement" className="py-20 bg-white border-y border-slate-200 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Processus Simple & Sécurisé</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-2 tracking-tight">
              Comment fonctionne Ordonnance Direct ?
            </h2>
            <p className="text-slate-600 text-sm sm:text-base mt-3">
              En 4 étapes claires, de la prescription du médecin jusqu'à la remise à votre porte.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
            {[
              {
                step: "01",
                icon: Smartphone,
                title: "1. Photographiez ou Dictez",
                desc: "Prenez une photo nette de votre ordonnance ou dictez vos médicaments avec vos repères de livraison."
              },
              {
                step: "02",
                icon: Building2,
                title: "2. Réception du Devis",
                desc: "Les pharmacies agréées vérifient la disponibilité des stocks et vous envoient leur devis détaillé en quelques minutes."
              },
              {
                step: "03",
                icon: CheckCircle2,
                title: "3. Confirmation & Paiement",
                desc: "Validez le devis de votre choix et payez en toute sécurité par Orange Money, Moov Money ou à la livraison."
              },
              {
                step: "04",
                icon: Truck,
                title: "4. Livraison Scellée",
                desc: "Votre colis médical scellé vous est remis en main propre contre saisie de votre code de sécurité unique à 6 chiffres."
              }
            ].map((s, idx) => (
              <div key={idx} className="relative p-6 rounded-3xl bg-slate-50 border border-slate-200 hover:border-emerald-400 hover:shadow-md transition-all duration-300 flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-2xl font-black text-slate-300 group-hover:text-emerald-600 transition-colors font-mono">{s.step}</span>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-100/60 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <s.icon size={22} />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{s.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Section: Pour qui ? (Roles breakdown) */}
      <section id="acteurs" className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Écosystème de Santé Intégré</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-2 tracking-tight">
              Une solution pour chaque acteur de santé
            </h2>
          </div>

          {/* Role switcher tabs */}
          <div className="flex justify-center mb-10">
            <div className="p-1.5 rounded-2xl bg-white border border-slate-200 shadow-sm flex gap-2">
              {[
                { id: 'patient', label: 'Patients & Familles', icon: Users },
                { id: 'pharmacist', label: 'Officines & Pharmaciens', icon: Building2 },
                { id: 'delivery', label: 'Livreurs Partenaires', icon: Truck }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedRoleTab(tab.id as any)}
                  className={`px-4 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all ${
                    selectedRoleTab === tab.id 
                      ? 'bg-emerald-600 text-white shadow-sm' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <tab.icon size={16} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content Display */}
          <AnimatePresence mode="wait">
            {selectedRoleTab === 'patient' && (
              <motion.div 
                key="patient"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-6"
              >
                <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                    <Clock size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Gain de temps considérable</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Fini les trajets sous la chaleur et les longues files d'attente. Vos médicaments viennent à vous rapidement, que vous soyez chez vous ou au travail.
                  </p>
                </div>
                <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
                    <Zap size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Garde de Nuit Automatisée</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Accédez aux pharmacies de garde actives de votre ville en pleine nuit sans avoir à chercher manuellement les listes de garde.
                  </p>
                </div>
                <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                    <ShieldCheck size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Transparence des Prix</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Visualisez chaque médicament, son prix unitaire officiel et les frais de livraison clairs sans mauvaise surprise avant de valider.
                  </p>
                </div>
              </motion.div>
            )}

            {selectedRoleTab === 'pharmacist' && (
              <motion.div 
                key="pharmacist"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-6"
              >
                <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
                    <Building2 size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Digitalisation de l'Officine</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Recevez les ordonnances numérisées en haute définition, éditez vos devis certifiés et développez votre patientèle de quartier.
                  </p>
                </div>
                <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                    <Lock size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Respect Déontologique</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Conformité totale avec les règles de dispensation de l'Ordre des Pharmaciens du Burkina Faso et validation par pharmacien diplômé.
                  </p>
                </div>
                <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                    <Zap size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Versements Mobiles Automatiques</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Suivez vos gains en temps réel et demandez vos reversements instantanés sur Orange Money, Moov Money ou compte bancaire.
                  </p>
                </div>
              </motion.div>
            )}

            {selectedRoleTab === 'delivery' && (
              <motion.div 
                key="delivery"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-6"
              >
                <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                    <Truck size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Missions Rémunérées Justement</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Prenez en charge des courses médicales optimisées avec géolocalisation précise et photos de repères/façades.
                  </p>
                </div>
                <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                    <ShieldCheck size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Sécurité de Remise par Code OTP</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Aucune contestation possible : la mission est validée uniquement lorsque le patient vous fournit son code secret à 6 chiffres.
                  </p>
                </div>
                <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
                    <Zap size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Retraits de Gains Flexibles</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Encaissez vos frais de livraison directement sur votre compte mobile money à la fin de votre journée de tournée.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* 5. Section: FAQ */}
      <section id="faq" className="py-20 bg-white border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Foire Aux Questions</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-2 tracking-tight">
              Tout ce que vous devez savoir
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => {
              const isOpen = activeFaq === index;
              return (
                <div 
                  key={index} 
                  className="rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden transition-all"
                >
                  <button
                    onClick={() => setActiveFaq(isOpen ? null : index)}
                    className="w-full p-6 text-left flex items-center justify-between gap-4 font-bold text-base sm:text-lg text-slate-900 hover:text-emerald-700 transition-colors"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown size={20} className={`text-slate-500 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-emerald-600' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-6 text-slate-600 text-sm leading-relaxed border-t border-slate-200 pt-4">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 6. Call to Action Banner */}
      <section className="py-20 relative overflow-hidden bg-slate-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="relative rounded-[3rem] bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-8 sm:p-14 text-center text-white shadow-xl shadow-emerald-900/20 border border-emerald-500/40 overflow-hidden">
            <div className="relative z-10 space-y-6 max-w-2xl mx-auto">
              <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
                Prenez soin de votre santé dès aujourd'hui
              </h2>
              <p className="text-emerald-100 text-base sm:text-lg font-normal">
                Rejoignez des milliers de patients et les meilleures pharmacies d'officine du Burkina Faso sur Ordonnance Direct.
              </p>
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => onGoToAuth('signup')}
                  className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-white text-emerald-950 font-extrabold text-base hover:bg-emerald-50 transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <span>Créer mon compte patient</span>
                  <ArrowRight size={18} />
                </button>
                <button
                  onClick={() => onGoToAuth('login')}
                  className="w-full sm:w-auto px-7 py-4 rounded-2xl bg-emerald-800/60 hover:bg-emerald-800/90 border border-emerald-400/40 text-white font-bold text-base transition-all"
                >
                  Espace Professionnels (Pharmacie & Livreur)
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Comprehensive Professional Footer */}
      <footer className="bg-slate-100 border-t border-slate-200 text-slate-600 text-sm py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
            {/* Col 1: Brand & Presentation */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center p-1 border border-slate-200 shadow-sm">
                  <LogoIcon size={32} />
                </div>
                <span className="text-lg font-extrabold text-slate-900">
                  Ordonnance <span className="text-emerald-600">Direct</span>
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Première plateforme numérique de télétransmission d'ordonnances et de logistique médicale sécurisée au Burkina Faso.
              </p>
              <div className="flex items-center gap-2 text-xs text-emerald-700 font-semibold">
                <ShieldCheck size={16} />
                Officines 100% Agréées
              </div>
            </div>

            {/* Col 2: Navigation rapide */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Navigation</h4>
              <ul className="space-y-2 text-xs">
                <li><a href="#fonctionnement" className="hover:text-emerald-600 transition-colors">Comment ça marche</a></li>
                <li><a href="#acteurs" className="hover:text-emerald-600 transition-colors">Pour les Patients</a></li>
                <li><a href="#acteurs" className="hover:text-emerald-600 transition-colors">Pour les Pharmaciens</a></li>
                <li><a href="#acteurs" className="hover:text-emerald-600 transition-colors">Pour les Livreurs</a></li>
                <li><a href="#faq" className="hover:text-emerald-600 transition-colors">Foire Aux Questions</a></li>
              </ul>
            </div>

            {/* Col 3: Documents Juridiques & Réglementaires */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Cadre Juridique</h4>
              <ul className="space-y-2 text-xs">
                <li>
                  <button 
                    onClick={() => onOpenLegal('cgu')} 
                    className="hover:text-emerald-600 transition-colors text-left"
                  >
                    Conditions Générales d'Utilisation (CGU)
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => onOpenLegal('privacy')} 
                    className="hover:text-emerald-600 transition-colors text-left"
                  >
                    Politique de Confidentialité & Santé
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => onOpenLegal('mentions')} 
                    className="hover:text-emerald-600 transition-colors text-left"
                  >
                    Mentions Légales & Agréments
                  </button>
                </li>
                <li>
                  <span className="text-slate-500 text-[11px] block mt-1">
                    Conforme au Code de la Santé Publique du Burkina Faso
                  </span>
                </li>
              </ul>
            </div>

            {/* Col 4: Contact & Urgences */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Assistance & Urgences</h4>
              <p className="text-xs text-slate-600">
                Support patient & officines disponible 7j/7 :
              </p>
              <div className="space-y-1.5 text-xs text-slate-700">
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-emerald-600" />
                  <span>+226 25 30 00 00 / +226 70 00 00 00</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-emerald-600" />
                  <span>contact@ordonnance-direct.bf</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="text-emerald-600" />
                  <span>Ouagadougou, Burkina Faso</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <p>© {new Date().getFullYear()} Ordonnance Direct SARL. Tous droits réservés.</p>
            <div className="flex gap-4">
              <button onClick={() => onOpenLegal('cgu')} className="hover:text-slate-800">CGU</button>
              <span>•</span>
              <button onClick={() => onOpenLegal('privacy')} className="hover:text-slate-800">Confidentialité</button>
              <span>•</span>
              <button onClick={() => onOpenLegal('mentions')} className="hover:text-slate-800">Agréments</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
