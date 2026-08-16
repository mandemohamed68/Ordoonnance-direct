/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  auth, 
  db, 
  handleFirestoreError, 
  OperationType, 
  messaging,
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc,
  deleteDoc,
  getDocs,
  limit, 
  serverTimestamp, 
  orderBy, 
  arrayUnion, 
  increment, 
  writeBatch
} from './firebase';
import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect,
  GoogleAuthProvider, 
  signOut,
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile
} from 'firebase/auth';
import { VirtualListItem } from './components/VirtualListItem';
import { PaginatedList } from './components/PaginatedTable';
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const ReportsView = lazy(() => import('./components/ReportsView').then(m => ({ default: m.ReportsView })));
const MapComponent = lazy(() => import('./components/MapComponent'));
const OrderChat = lazy(() => import('./components/OrderChat').then(m => ({ default: m.OrderChat })));
const Legal = lazy(() => import('./components/Legal').then(m => ({ default: m.Legal })));
const ShowcaseLanding = lazy(() => import('./components/ShowcaseLanding').then(m => ({ default: m.ShowcaseLanding })));
import { getToken, onMessage } from 'firebase/messaging';
import { UserProfile, Prescription, Order, UserRole, Pharmacy, Settings, Transaction, WithdrawalRequest, City, OnCallRotation, Announcement } from './types';
import { 
  Camera, 
  Upload, 
  Package, 
  Truck, 
  User, 
  LogOut, 
  Activity,
  Plus, 
  CheckCircle, 
  Clock, 
  MapPin, 
  Hospital,
  Phone,
  FileText,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CreditCard,
  Search,
  ArrowRight,
  TrendingDown,
  Trash2,
  QrCode,
  ShieldCheck,
  Settings as SettingsIcon,
  Power,
  Smartphone,
  MessageCircle,
  MessageSquare,
  X,
  Menu,
  TrendingUp,
  Save,
  Bell,
  Megaphone,
  BellOff,
  Terminal,
  Store,
  ShoppingCart,
  Send,
  Building2,
  Navigation,
  PenTool,
  Mic,
  FlaskConical,
  CheckCircle2,
  Lock,
  Home,
  Info,
  Sparkles,
  Printer,
  Mail, PhoneCall, Volume2, VolumeX, Sun, Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { QRCodeCanvas } from 'qrcode.react';
import { toast } from 'sonner';
import ErrorBoundary from './components/ErrorBoundary';

import { logTransaction, createNotification, formatDate, isSuperAdminEmail, notifyDeliveryDrivers, compressImage, RAM_OPTIMIZED_COMPRESSION, getCurrentOnCallGroup, isCityOnCallNow, calculateDistance, findNearestCity, getPrescriptionStatusLabel, getOrderStatusLabel } from './utils/shared';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PullToRefresh } from './components/PullToRefresh';
import { getApiUrl } from './config';

// --- Global Helpers ---
let globalIsFirstLoad = true;
// Remove the forced timeout that might be blocking sound
// setTimeout(() => { globalIsFirstLoad = false; }, 3000);

const playNotificationSound = (settings: Settings | null, userSoundEnabled: boolean = true) => {
  // Check sound settings only
  if (settings && settings.soundEnabled === false) return;
  if (userSoundEnabled === false) return;
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContext) {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.16); // G5
      
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch (error) {
    console.warn('[Sound] Web Audio API context error:', error);
  }
  try {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.volume = 0.4;
    const promise = audio.play();
    if (promise !== undefined) {
      promise.catch(e => console.log('Audio autoplay blocked or failed:', e));
    }
  } catch (e) {
    console.error('Error playing sound:', e);
  }
};

// --- Super Admin Utilities moved to shared.ts ---

// --- Utilities moved to shared.ts ---

const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

const extractErrorMsg = (data: any, defaultMsg: string): string => {
  if (!data) return defaultMsg;
  if (typeof data === 'string' && data.length > 0) return data;
  if (data.error) {
    if (typeof data.error === 'string' && data.error.length > 0) return data.error;
    if (typeof data.error === 'object' && Object.keys(data.error).length > 0) {
      return data.error.message || data.error.description || JSON.stringify(data.error);
    }
  }
  if (typeof data.message === 'string' && data.message.length > 0) return data.message;
  if (data.response && typeof data.response.message === 'string') return data.response.message;
  return defaultMsg;
};

const loadImageAsBase64 = (url: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 300;
        canvas.height = img.naturalHeight || img.height || 300;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
          return;
        }
      } catch (e) {
        console.warn("Canvas export failed", e);
      }
      resolve('');
    };
    img.onerror = () => {
      resolve('');
    };
    img.src = url;
  });
};

const generateInvoice = async (order: Order, profile: UserProfile) => {
  const doc = new jsPDF();
  
  // Try loading logo
  let logoDataUrl = '';
  try {
    logoDataUrl = await loadImageAsBase64('/logoOD.png');
    if (!logoDataUrl) {
      logoDataUrl = await loadImageAsBase64('/logo-web.png');
    }
  } catch (e) {
    console.warn("Logo loading error for PDF", e);
  }

  // 1. Top Decorative Brand Bar
  doc.setFillColor(5, 150, 105); // Emerald-600
  doc.rect(0, 0, 210, 4, 'F');

  // Header Background
  doc.setFillColor(248, 250, 252); // Slate-50
  doc.rect(0, 4, 210, 44, 'F');

  // 2. Add Logo (Left Side)
  let textStartX = 14;
  if (logoDataUrl) {
    try {
      // Draw a white rounded box behind logo for contrast
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, 8, 30, 30, 3, 3, 'FD');
      doc.addImage(logoDataUrl, 'PNG', 16, 10, 26, 26);
      textStartX = 48;
    } catch (e) {
      console.warn("Could not render logo in jsPDF", e);
      textStartX = 14;
    }
  }

  // Brand Name & Subtitle
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text("Ordonnance Direct", textStartX, 18);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(5, 150, 105); // emerald-600
  doc.text("BURKINA FASO", textStartX, 23);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text("Plateforme Nationale de Télé-exécution d'Ordonnances", textStartX, 28);
  doc.text("Tél: +226 70 00 00 00 • Support: contact@ordonnance-direct.bf", textStartX, 33);

  // 3. Invoice Title & Metadata (Right Side)
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(5, 150, 105);
  doc.text("FACTURE", 196, 18, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(`Réf: #${order.id.slice(-8).toUpperCase()}`, 196, 24, { align: 'right' });

  let orderDateStr = "Date inconnue";
  try {
    if (order.createdAt) {
      const d = (order.createdAt as any).toDate ? (order.createdAt as any).toDate() : new Date(order.createdAt as any);
      if (!isNaN(d.getTime())) {
        orderDateStr = d.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      }
    }
  } catch (e) {}

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(`Date: ${orderDateStr}`, 196, 29, { align: 'right' });

  // Paid Status Pill
  doc.setFillColor(209, 250, 229); // emerald-100
  doc.setDrawColor(167, 243, 208); // emerald-200
  doc.roundedRect(148, 33, 48, 8, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(4, 120, 87); // emerald-800
  doc.text("PAIEMENT CONFIRMÉ", 172, 38.5, { align: 'center' });

  // 4. Horizontal Separator
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(14, 52, 196, 52);

  // 5. Billing & Issuer Info Cards
  // Client Card
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 57, 88, 34, 3, 3, 'FD');

  doc.setFillColor(241, 245, 249); // slate-100 header
  doc.roundedRect(14, 57, 88, 8, 3, 3, 'F');
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(51, 65, 85);
  doc.text("CLIENT (FACTURÉ À)", 18, 62.5);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(profile.name || "Client", 18, 70);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(`Téléphone: ${profile.phone || "Non spécifié"}`, 18, 75);
  doc.text(`Email: ${profile.email || "Non spécifié"}`, 18, 80);
  const deliveryAddr = order.deliveryAddress || order.landmark || order.hospitalLocation;
  if (deliveryAddr) {
    const trimmedAddress = deliveryAddr.length > 38 ? deliveryAddr.substring(0, 35) + '...' : deliveryAddr;
    doc.text(`Livraison: ${trimmedAddress}`, 18, 85);
  }

  // Issuer Card
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(108, 57, 88, 34, 3, 3, 'FD');

  doc.setFillColor(241, 245, 249);
  doc.roundedRect(108, 57, 88, 8, 3, 3, 'F');
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(51, 65, 85);
  doc.text("PHARMACIE ÉMETTRICE", 112, 62.5);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(order.pharmacyName || "Pharmacie Partenaire", 112, 70);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(`Ville: ${order.cityName || "Burkina Faso"}`, 112, 75);
  doc.text("Réseau Agréé Ordonnance Direct", 112, 80);
  doc.text(`Paiement: ${order.paymentMethod || "Mobile Money / Wallet"}`, 112, 85);

  // 6. Items Table
  const tableColumn = ["Désignation / Médicaments", "Prix Unitaire", "Qté", "Total (FCFA)"];
  const tableRows: any[] = [];

  if (order.items && order.items.length > 0) {
    order.items.forEach(item => {
      const itemData = [
        item.name,
        `${(item.price || 0).toLocaleString('fr-FR')} FCFA`,
        item.quantity || 1,
        `${((item.price || 0) * (item.quantity || 1)).toLocaleString('fr-FR')} FCFA`
      ];
      tableRows.push(itemData);
    });
  } else {
    tableRows.push(["Commande d'ordonnance complète", "-", "-", `${(order.medicationTotal || 0).toLocaleString('fr-FR')} FCFA`]);
  }

  // @ts-ignore
  autoTable(doc, {
    startY: 97,
    head: [tableColumn],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [5, 150, 105], // emerald-600
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 5
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 5,
      textColor: [30, 41, 59]
    },
    columnStyles: {
      0: { cellWidth: 95 },
      1: { halign: 'right', cellWidth: 32 },
      2: { halign: 'center', cellWidth: 15 },
      3: { halign: 'right', cellWidth: 40, fontStyle: 'bold' }
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 }
  });

  // @ts-ignore
  const finalY = doc.lastAutoTable?.finalY || 100;

  // 7. Security Stamp / Verification Box (Left)
  doc.setFillColor(240, 253, 244); // emerald-50
  doc.setDrawColor(187, 247, 208); // emerald-200
  doc.roundedRect(14, finalY + 8, 88, 44, 3, 3, 'FD');

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(4, 120, 87);
  doc.text("CERTIFICAT DE CONFORMITÉ", 18, finalY + 15);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text("• Document officiel généré informatiquement.", 18, finalY + 22);
  doc.text("• Certifié conforme aux normes pharmaceutiques.", 18, finalY + 27);
  doc.text("• Paiement sécurisé via réseau Agréé.", 18, finalY + 32);
  doc.text(`• ID Sécurité: OD-BF-${order.id.slice(-10).toUpperCase()}`, 18, finalY + 37);
  doc.text("• Conserver ce reçu pour tout remboursement.", 18, finalY + 42);

  // 8. Totals Breakdown Box (Right)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(108, finalY + 8, 88, 44, 3, 3, 'FD');

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);

  let currentY = finalY + 16;
  doc.text("Sous-total Médicaments :", 112, currentY);
  doc.text(`${(order.medicationTotal || 0).toLocaleString('fr-FR')} FCFA`, 190, currentY, { align: 'right' });

  if (order.deliveryFee !== undefined) {
    currentY += 6;
    doc.text("Frais de Livraison :", 112, currentY);
    doc.text(`${(order.deliveryFee || 0).toLocaleString('fr-FR')} FCFA`, 190, currentY, { align: 'right' });
  }

  if (order.serviceFee !== undefined) {
    currentY += 6;
    doc.text("Frais de Service :", 112, currentY);
    doc.text(`${(order.serviceFee || 0).toLocaleString('fr-FR')} FCFA`, 190, currentY, { align: 'right' });
  }

  currentY += 5;
  doc.setDrawColor(203, 213, 225);
  doc.line(112, currentY, 192, currentY);

  currentY += 7;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(5, 150, 105);
  doc.text("TOTAL PAYÉ :", 112, currentY);
  doc.text(`${(order.totalAmount || 0).toLocaleString('fr-FR')} FCFA`, 190, currentY, { align: 'right' });

  // 9. Page Footer
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184);
  doc.setDrawColor(226, 232, 240);
  doc.line(14, 280, 196, 280);

  doc.text("Ordonnance Direct - Plateforme de Télé-exécution Médicale • Burkina Faso", 105, 285, { align: 'center' });
  doc.text("Merci pour votre confiance ! Pour toute réclamation : support@ordonnance-direct.bf", 105, 289, { align: 'center' });

  doc.save(`Facture_${order.id.slice(-6).toUpperCase()}.pdf`);
};

function SignaturePad({ onSave, onCancel }: { onSave: (signature: string) => void, onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, []);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.beginPath();
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL());
  };

  return (
    <div className="space-y-4">
      <canvas
        ref={canvasRef}
        width={400}
        height={200}
        className="bg-white border-2 border-slate-200 rounded-2xl w-full touch-none cursor-crosshair"
        onMouseDown={startDrawing}
        onMouseUp={stopDrawing}
        onMouseMove={draw}
        onTouchStart={startDrawing}
        onTouchEnd={stopDrawing}
        onTouchMove={draw}
      />
      <div className="flex gap-2">
        <button onClick={clear} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold">Effacer</button>
        <button onClick={save} className="flex-1 py-2 bg-emerald-600 text-white rounded-xl font-bold">Enregistrer</button>
      </div>
    </div>
  );
}

const calculateDeliveryFee = (settings: Settings | null) => {
  if (!settings) return 0;
  const now = new Date();
  const hour = now.getHours();
  
  // Check if current hour is within night range
  let isNight = false;
  if (settings.nightStartHour > settings.nightEndHour) {
    // Night range crosses midnight (e.g., 20:00 to 06:00)
    isNight = hour >= settings.nightStartHour || hour < settings.nightEndHour;
  } else {
    // Night range is within one day (e.g., 01:00 to 05:00)
    isNight = hour >= settings.nightStartHour && hour < settings.nightEndHour;
  }
  
  return isNight ? settings.nightDeliveryFee : settings.dayDeliveryFee;
};

const StatusTrace = React.memo(({ history, defaultExpanded = false }: { history?: Order['history'], defaultExpanded?: boolean }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  if (!history || history.length === 0) return null;
  
  // Sort history by timestamp descending (newest first)
  const sortedHistory = [...history].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  
  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between group py-2"
      >
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-primary transition-colors">Historique de suivi</p>
        </div>
        <div className="text-slate-300 group-hover:text-primary transition-colors">
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-6 relative pb-2">
              <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-primary/50 to-slate-100"></div>
              {sortedHistory.map((h, i) => (
                <div key={`${h.timestamp}-${i}`} className="flex items-start gap-4 relative z-10">
                  <div className={`w-6 h-6 rounded-full border-4 border-white flex items-center justify-center ${
                    i === 0 ? 'bg-primary shadow-lg shadow-primary/30' : 'bg-slate-200'
                  } transition-all`}>
                    <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold leading-tight ${i === 0 ? 'text-slate-900' : 'text-slate-500'}`}>{h.label}</p>
                    <p className="text-[9px] text-slate-400 font-medium">
                      {formatDate(h.timestamp, 'short')} {formatDate(h.timestamp, 'time')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

const LogoIcon = React.memo(({ size = 32, className = "", logoUrl }: { size?: number, className?: string, logoUrl?: string }) => {
  const finalLogo = logoUrl || "/logoOD.png";
  return (
    <div style={{ width: size, height: size }} className={`flex items-center justify-center shrink-0 ${className}`}>
      <img 
        src={finalLogo} 
        alt="Ordonnance Direct Logo" 
        className="w-full h-full object-contain"
        onError={(e) => {
          // Fallback
          e.currentTarget.src = "/logoOD.png";
        }}
      />
    </div>
  );
});

function NotificationBell({ userId, profile }: { userId: string, profile?: UserProfile | null }) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  const isFirstRun = useRef(true);
  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const hasNewUnread = snapshot.docChanges().some(change => 
        change.type === 'added' && !change.doc.data().read
      );
      
      if (!isFirstRun.current && hasNewUnread && !snapshot.metadata.hasPendingWrites) {
        playNotificationSound(null, profile?.sound_enabled !== false);
      }
      isFirstRun.current = false;
      
      setNotifications(docs);
    }, (err) => console.error("Error fetching notifications:", err));
    return () => unsubscribe();
  }, [userId, profile?.sound_enabled]);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (err) {
      console.error("Error marking notification as read:", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unread = notifications.filter(n => !n.read);
      const promises = unread.map(n => updateDoc(doc(db, 'notifications', n.id), { read: true }));
      await Promise.all(promises);
    } catch (err) {
      console.error("Error marking all as read:", err);
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setShowDropdown(!showDropdown)}
        className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-primary hover:bg-primary/5 transition-all border border-slate-100 relative"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 w-5 h-5 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {showDropdown && (
          <>
            <div 
              className="fixed inset-0 z-[100]" 
              onClick={() => setShowDropdown(false)}
            ></div>
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-2 w-80 bg-white rounded-[2rem] shadow-2xl border border-slate-100 z-[101] overflow-hidden"
            >
              <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Notifications</h3>
                {unreadCount > 0 && (
                  <button 
                    onClick={markAllAsRead}
                    className="text-[10px] font-bold text-primary uppercase tracking-widest hover:underline"
                  >
                    Tout lire
                  </button>
                )}
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {notifications.length > 0 ? (
                  notifications.map(n => (
                    <div 
                      key={n.id} 
                      onClick={() => markAsRead(n.id)}
                      className={`p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer relative ${!n.read ? 'bg-primary/5' : ''}`}
                    >
                      {!n.read && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>}
                      <p className="font-bold text-sm text-slate-900 mb-1">{n.title}</p>
                      <p className="text-xs text-slate-500 leading-relaxed">{n.message}</p>
                      <p className="text-[10px] text-slate-400 mt-2">{n.createdAt ? (n.createdAt.toDate ? n.createdAt.toDate().toLocaleString() : new Date(n.createdAt).toLocaleString()) : 'A l\'instant'}</p>
                    </div>
                  ))
                ) : (
                  <div className="p-12 text-center">
                    <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mx-auto mb-4">
                      <BellOff size={24} />
                    </div>
                    <p className="text-sm text-slate-400">Aucune notification</p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

const BURKINA_HOSPITALS = [
  "CHU Yalgado Ouédraogo",
  "CHU Bogodogo",
  "CHU Blaise Compaoré",
  "CHU Sanou Souro",
  "Clinique Suka",
  "Clinique El Fateh-Suka",
  "Polyclinique Internationale de Ouagadougou",
  "CMA de Paul VI",
  "Hôpital de Schiphra",
  "Clinique Notre Dame de la Paix",
  "Hôpital de District de Bogodogo",
  "Clinique Farah",
  "CMA de Pissy",
  "CMA de Kossodo",
  "Hôpital Saint Camille",
  "Clinique des Genêts",
  "Clinique Médicale Le Printemps",
  "Clinique de l'Espérance",
  "CMU de Ouagadougou",
  "CHR de Kaya",
  "CHR de Fada",
  "CHR de Tenkodogo"
].sort();

const adjustColor = (hex: string, percent: number): string => {
  try {
    if (!hex || hex[0] !== '#') return hex;
    const cleanHex = hex.replace('#', '');
    let r = parseInt(cleanHex.substring(0, 2), 16);
    let g = parseInt(cleanHex.substring(2, 4), 16);
    let b = parseInt(cleanHex.length === 3 ? cleanHex.substring(2, 3) : cleanHex.substring(4, 6), 16);
    if (cleanHex.length === 3) {
      r = parseInt(cleanHex[0] + cleanHex[0], 16);
      g = parseInt(cleanHex[1] + cleanHex[1], 16);
      b = parseInt(cleanHex[2] + cleanHex[2], 16);
    }

    r = Math.max(0, Math.min(255, r + percent));
    g = Math.max(0, Math.min(255, g + percent));
    b = Math.max(0, Math.min(255, b + percent));

    const rHex = r.toString(16).padStart(2, '0');
    const gHex = g.toString(16).padStart(2, '0');
    const bHex = b.toString(16).padStart(2, '0');

    return `#${rHex}${gHex}${bHex}`;
  } catch (e) {
    return hex;
  }
};

const DynamicTheme = ({ settings }: { settings: Settings | null }) => {
  if (!settings) return null;
  
  const theme = settings.themeType || 'default';
  
  let primary = '#059669'; // Default emerald-600
  let secondary = '#10b981'; // Default emerald-500
  
  if (theme === 'christmas') {
    primary = '#dc2626'; // Rouge Noël
    secondary = '#15803d'; // Vert Sapin
  } else if (theme === 'new-year') {
    primary = '#d97706'; // Or ambré
    secondary = '#1e293b'; // Noir ardoise
  } else if (theme === 'valentine') {
    primary = '#db2777'; // Rose
    secondary = '#ec4899'; // Rose vif
  } else if (theme === 'ocean') {
    primary = '#0284c7'; // Bleu ciel pro
    secondary = '#1e3a8a'; // Bleu marine
  } else if (theme === 'royal') {
    primary = '#7c3aed'; // Violet
    secondary = '#5b21b6'; // Violet foncé
  } else if (theme === 'orange') {
    primary = '#ea580c'; // Orange
    secondary = '#9a3412'; // Orange foncé
  } else if (theme === 'rainy') {
    primary = '#0284c7'; // Bleu pluie
    secondary = '#0369a1';
  } else if (theme === 'harmattan') {
    primary = '#b45309'; // Sable ocre
    secondary = '#d97706';
  } else if (theme === 'ramadan') {
    primary = '#047857'; // Vert émeraude
    secondary = '#d97706'; // Or
  } else if (theme === 'burkina') {
    primary = '#059669'; // Vert patriotique
    secondary = '#dc2626'; // Rouge patriotique
  } else if (theme === 'spring') {
    primary = '#ec4899'; // Cerisier
    secondary = '#f472b6';
  } else if (theme === 'custom' && settings.primaryColor) {
    primary = settings.primaryColor;
    secondary = settings.secondaryColor || settings.primaryColor;
  } else {
    // Respect custom colors if set in settings even if theme is standard default
    if (settings.primaryColor) {
      primary = settings.primaryColor;
      secondary = settings.secondaryColor || settings.primaryColor;
    }
  }

  const dark = adjustColor(primary, -25);
  const light = adjustColor(primary, 235);
  const mediumLight = adjustColor(primary, 215);
  const borderCol = adjustColor(primary, 195);
  const hoverPrimary = adjustColor(primary, -15);
  const hoverSecondary = adjustColor(secondary, -15);

  // Synchronize Mobile & Web platform metadata in real-time
  useEffect(() => {
    try {
      // 1. Dynamic document title
      const titleSuffix = settings.countryName || settings.appTagline || 'Plateforme Médicale';
      document.title = settings.appName ? `${settings.appName} | ${titleSuffix}` : `Ordonnance Direct | ${titleSuffix}`;

      // 2. Mobile Browser & PWA theme-color meta tag
      let themeMeta = document.querySelector('meta[name="theme-color"]');
      if (!themeMeta) {
        themeMeta = document.createElement('meta');
        themeMeta.setAttribute('name', 'theme-color');
        document.head.appendChild(themeMeta);
      }
      themeMeta.setAttribute('content', primary);

      // 3. Apple Mobile Web App status bar & title
      let appleStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      if (!appleStatusBar) {
        appleStatusBar = document.createElement('meta');
        appleStatusBar.setAttribute('name', 'apple-mobile-web-app-status-bar-style');
        document.head.appendChild(appleStatusBar);
      }
      appleStatusBar.setAttribute('content', 'default');

      let appleAppTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (!appleAppTitle) {
        appleAppTitle = document.createElement('meta');
        appleAppTitle.setAttribute('name', 'apple-mobile-web-app-title');
        document.head.appendChild(appleAppTitle);
      }
      appleAppTitle.setAttribute('content', settings.appName || 'Ordonnance Direct');

      // 4. Dynamic Favicon and Apple Touch Icon
      const logoUrl = settings.appLogoUrl || '/logoOD.png';
      let favIcon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
      if (favIcon) {
        favIcon.href = logoUrl;
      }
      let appleIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
      if (appleIcon) {
        appleIcon.href = logoUrl;
      }

      // 5. Dynamic Web App Manifest injection (Updates mobile PWA install metadata in real-time)
      const dynamicManifest = {
        name: settings.appName || 'Ordonnance Direct',
        short_name: settings.appName || 'Ordonnance Direct',
        description: settings.appTagline || 'Plateforme de commande et livraison express de médicaments et ordonnances',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: primary,
        icons: [
          {
            src: logoUrl,
            sizes: '192x192 512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      };
      const manifestBlob = new Blob([JSON.stringify(dynamicManifest)], { type: 'application/json' });
      const manifestUrl = URL.createObjectURL(manifestBlob);
      let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
      if (!manifestLink) {
        manifestLink = document.createElement('link');
        manifestLink.setAttribute('rel', 'manifest');
        document.head.appendChild(manifestLink);
      }
      manifestLink.href = manifestUrl;

      // 6. Cache branding in LocalStorage for 0ms cold-start on mobile applications
      localStorage.setItem('cached_app_branding', JSON.stringify(settings));

      // 7. Post Message to Mobile Bridges (Capacitor / Cordova / React Native / Android Native WebView)
      const brandingPayload = {
        type: 'OD_BRANDING_SYNC',
        appName: settings.appName,
        appTagline: settings.appTagline,
        countryName: settings.countryName,
        appLogoUrl: settings.appLogoUrl,
        primaryColor: primary,
        secondaryColor: secondary,
        themeType: settings.themeType,
        effectType: settings.effectType,
        effectsIntensity: settings.effectsIntensity,
        decorationsEnabled: settings.decorationsEnabled
      };

      // Native Webview bridges
      if ((window as any).ReactNativeWebView) {
        (window as any).ReactNativeWebView.postMessage(JSON.stringify(brandingPayload));
      }
      if ((window as any).Capacitor?.Plugins?.StatusBar) {
        (window as any).Capacitor.Plugins.StatusBar.setBackgroundColor({ color: primary }).catch(() => {});
      }
      if ((window as any).android?.onBrandingChanged) {
        (window as any).android.onBrandingChanged(JSON.stringify(brandingPayload));
      }

      // Broadcast channel for multi-tab/multi-window synchronization
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('od_branding_sync_channel');
        bc.postMessage(brandingPayload);
        bc.close();
      }

      // Dispatch window event
      window.dispatchEvent(new CustomEvent('app:brandingUpdated', { detail: brandingPayload }));
    } catch (e) {
      console.warn('[DynamicTheme] Sync error:', e);
    }
  }, [settings, primary, secondary]);

  return (
    <style dangerouslySetInnerHTML={{ __html: `
      :root {
        --theme-primary: ${primary};
        --theme-secondary: ${secondary};
        --theme-dark: ${dark};
        --theme-light: ${light};
        --theme-medium-light: ${mediumLight};
        --theme-border: ${borderCol};
        --primary: ${primary};
        --primary-hover: ${hoverPrimary};
        --primary-light: ${light};
        --primary-medium: ${mediumLight};
        --primary-border: ${borderCol};
        --primary-dark: ${dark};
      }
      
      /* Core primary overrides */
      .text-primary { color: ${primary} !important; }
      .bg-primary { background-color: ${primary} !important; }
      .border-primary { border-color: ${primary} !important; }
      .hover\\:bg-primary:hover { background-color: ${hoverPrimary} !important; }
      .hover\\:text-primary:hover { color: ${primary} !important; }
      .hover\\:bg-primary-dark:hover { background-color: ${dark} !important; }
      .hover\\:bg-primary\\/5:hover { background-color: ${primary}0d !important; }
      .hover\\:bg-primary\\/10:hover { background-color: ${primary}1a !important; }
      .hover\\:bg-primary\\/20:hover { background-color: ${primary}33 !important; }
      
      /* Background overrides */
      .bg-emerald-50 { background-color: ${light} !important; }
      .bg-emerald-100 { background-color: ${mediumLight} !important; }
      .bg-emerald-200 { background-color: ${borderCol} !important; }
      .bg-emerald-500 { background-color: ${secondary} !important; }
      .bg-emerald-600 { background-color: ${primary} !important; }
      .bg-emerald-700 { background-color: ${dark} !important; }
      .bg-emerald-800 { background-color: ${dark}ee !important; }

      /* Gradient stops overrides */
      .from-emerald-500 { --tw-gradient-from: ${secondary} var(--tw-gradient-from-position) !important; --tw-gradient-to: ${secondary}00 var(--tw-gradient-to-position) !important; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important; }
      .to-emerald-600 { --tw-gradient-to: ${primary} var(--tw-gradient-to-position) !important; }
      .to-teal-600 { --tw-gradient-to: ${dark} var(--tw-gradient-to-position) !important; }
      .from-emerald-600 { --tw-gradient-from: ${primary} var(--tw-gradient-from-position) !important; --tw-gradient-to: ${primary}00 var(--tw-gradient-to-position) !important; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important; }
      
      /* Text overrides */
      .text-emerald-500 { color: ${secondary} !important; }
      .text-emerald-600 { color: ${primary} !important; }
      .text-emerald-700 { color: ${dark} !important; }
      .text-emerald-800 { color: ${dark} !important; }
      
      /* Border overrides */
      .border-emerald-100 { border-color: ${mediumLight} !important; }
      .border-emerald-200 { border-color: ${borderCol} !important; }
      .border-emerald-500 { border-color: ${secondary} !important; }
      .border-emerald-600 { border-color: ${primary} !important; }
      .border-emerald-700 { border-color: ${dark} !important; }
      
      /* Hover states */
      .hover\\:bg-emerald-50:hover { background-color: ${light} !important; }
      .hover\\:bg-emerald-100:hover { background-color: ${mediumLight} !important; }
      .hover\\:bg-emerald-500:hover { background-color: ${secondary} !important; }
      .hover\\:bg-emerald-600:hover { background-color: ${primary} !important; }
      .hover\\:bg-emerald-700:hover { background-color: ${dark} !important; }
      
      .hover\\:text-emerald-600:hover { color: ${primary} !important; }
      .hover\\:text-emerald-700:hover { color: ${dark} !important; }
      
      /* Ring and focus overrides */
      .focus\\:ring-emerald-500:focus { --tw-ring-color: ${secondary} !important; }
      .focus\\:border-emerald-500:focus { border-color: ${secondary} !important; }
      .ring-emerald-500 { --tw-ring-color: ${secondary} !important; }
      
      /* Shadows */
      .shadow-emerald-500\\/10 { box-shadow: 0 10px 15px -3px ${primary}1a, 0 4px 6px -4px ${primary}1a !important; }
      .shadow-emerald-500\\/20 { box-shadow: 0 10px 25px -5px ${primary}33, 0 8px 10px -6px ${primary}33 !important; }
      .shadow-emerald-500\\/25 { box-shadow: 0 20px 25px -5px ${primary}40, 0 8px 10px -6px ${primary}40 !important; }
    `}} />
  );
};

const Ornaments = ({ theme }: { theme: string | undefined }) => {
  if (!theme || theme === 'default') return null;
  
  if (theme === 'christmas') {
    return (
      <div className="fixed top-0 inset-x-0 pointer-events-none z-[60] flex justify-between px-3 sm:px-12 select-none">
        <div className="flex flex-col items-center animate-[bounce_3s_infinite_alternate]" style={{ transformOrigin: 'top center' }}>
          <div className="w-0.5 h-12 sm:h-16 bg-slate-300" />
          <div className="w-9 h-9 sm:w-11 sm:h-11 bg-gradient-to-br from-red-500 to-red-700 rounded-full border-2 border-red-300 shadow-lg flex items-center justify-center text-sm text-white">🎄</div>
        </div>
        <div className="hidden md:flex gap-12 lg:gap-20">
          <div className="flex flex-col items-center animate-[bounce_4s_infinite_alternate]" style={{ animationDelay: '0.4s' }}>
            <div className="w-0.5 h-10 bg-slate-300" />
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-full border-2 border-emerald-300 shadow-lg flex items-center justify-center text-xs">🔔</div>
          </div>
          <div className="flex flex-col items-center animate-[bounce_5s_infinite_alternate]" style={{ animationDelay: '0.9s' }}>
            <div className="w-0.5 h-16 bg-slate-300" />
            <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-full border-2 border-yellow-200 shadow-lg flex items-center justify-center text-sm">⭐</div>
          </div>
        </div>
        <div className="flex flex-col items-center animate-[bounce_3.5s_infinite_alternate]" style={{ transformOrigin: 'top center', animationDelay: '0.2s' }}>
          <div className="w-0.5 h-14 sm:h-18 bg-slate-300" />
          <div className="w-9 h-9 sm:w-11 sm:h-11 bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-full border-2 border-emerald-300 shadow-lg flex items-center justify-center text-sm text-white">❄</div>
        </div>
      </div>
    );
  }
  
  if (theme === 'new-year') {
    return (
      <div className="fixed top-0 inset-x-0 pointer-events-none z-[60] flex justify-center select-none pt-2 sm:pt-3">
        <motion.div 
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 120 }}
          className="bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 border-2 border-yellow-200 shadow-xl px-5 sm:px-8 py-1.5 sm:py-2 rounded-full flex items-center gap-2"
        >
          <span className="text-xs sm:text-sm font-black text-slate-950 tracking-wider">✨ Bonne Année 2026 ! ✨</span>
        </motion.div>
      </div>
    );
  }
  
  if (theme === 'valentine') {
    return (
      <div className="fixed top-0 inset-x-0 pointer-events-none z-[60] flex justify-between px-4 sm:px-16 select-none">
        <div className="flex flex-col items-center animate-[bounce_2.5s_infinite_alternate]">
          <div className="w-0.5 h-10 sm:h-14 bg-pink-400/50" />
          <span className="text-2xl sm:text-3xl filter drop-shadow-md animate-pulse">💖</span>
        </div>
        <div className="flex flex-col items-center animate-[bounce_3.2s_infinite_alternate]" style={{ animationDelay: '0.5s' }}>
          <div className="w-0.5 h-12 sm:h-16 bg-pink-400/50" />
          <span className="text-2xl sm:text-3xl filter drop-shadow-md animate-pulse">💘</span>
        </div>
      </div>
    );
  }
  
  if (theme === 'ramadan') {
    return (
      <div className="fixed top-0 inset-x-0 pointer-events-none z-[60] flex justify-between px-4 sm:px-16 select-none">
        <div className="flex flex-col items-center animate-[bounce_4s_infinite_alternate]">
          <div className="w-0.5 h-12 sm:h-16 bg-amber-400/50" />
          <span className="text-2xl sm:text-3xl text-amber-500 font-bold filter drop-shadow">🌙</span>
        </div>
        <div className="flex flex-col items-center animate-[bounce_4.5s_infinite_alternate]" style={{ animationDelay: '0.6s' }}>
          <div className="w-0.5 h-10 sm:h-14 bg-amber-400/50" />
          <span className="text-2xl sm:text-3xl text-amber-500 font-bold filter drop-shadow">🕌</span>
        </div>
      </div>
    );
  }
  
  if (theme === 'burkina') {
    return (
      <div className="fixed top-0 inset-x-0 pointer-events-none z-[60] flex justify-center select-none pt-2">
        <div className="flex items-center gap-2 bg-white/95 backdrop-blur border border-slate-200 px-4 py-1.5 rounded-full shadow-md text-xs font-black text-slate-800">
          <div className="flex flex-col w-4 h-3 rounded overflow-hidden shadow-inner">
            <span className="h-1.5 bg-[#dc2626]" />
            <span className="h-1.5 bg-[#059669]" />
          </div>
          <span>Fête Nationale du Burkina Faso 🇧🇫</span>
        </div>
      </div>
    );
  }
  
  return null;
};

interface SeasonalBrandingProps {
  theme?: string;
  effectType?: string;
  decorationsEnabled?: boolean;
  intensity?: 'low' | 'medium' | 'high';
  primaryColor?: string;
}

const SeasonalBranding = ({ 
  theme, 
  effectType, 
  decorationsEnabled, 
  intensity = 'medium',
  primaryColor = '#059669' 
}: SeasonalBrandingProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Compute effective effect
  const effect = (effectType && effectType !== 'auto') 
    ? effectType 
    : (theme === 'christmas' ? 'snow' 
      : theme === 'new-year' ? 'fireworks' 
      : theme === 'valentine' ? 'hearts' 
      : theme === 'rainy' ? 'rain' 
      : theme === 'harmattan' ? 'harmattan' 
      : theme === 'ramadan' ? 'ramadan' 
      : theme === 'burkina' ? 'burkina' 
      : theme === 'spring' ? 'sakura' 
      : (theme && theme !== 'default') ? 'sparkles'
      : 'none');
  
  useEffect(() => {
    if (!effect || effect === 'none') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let animationId: number;
    let particles: any[] = [];
    let fireworks: any[] = [];
    let ripples: any[] = [];
    let autoLaunchTimer = 0;
    
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    
    const spawnFireworksAt = (x: number, y: number) => {
      const colors = ['#f59e0b', '#fbbf24', '#fef08a', '#ef4444', '#10b981', '#3b82f6', '#ec4899', '#ffffff'];
      const count = intensity === 'high' ? 50 : intensity === 'low' ? 25 : 38;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 6 + 2;
        fireworks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: colors[Math.floor(Math.random() * colors.length)],
          alpha: 1,
          decay: Math.random() * 0.02 + 0.015,
          size: Math.random() * 3.5 + 2
        });
      }
    };
    
    const handleWindowClick = (e: MouseEvent) => {
      if (effect === 'fireworks') {
        spawnFireworksAt(e.clientX, e.clientY);
      }
    };
    
    window.addEventListener('mousedown', handleWindowClick);
    
    // Particle count multiplier
    const countMultiplier = intensity === 'high' ? 1.6 : intensity === 'low' ? 0.5 : 1.0;
    const baseCount = 45;
    const particleCount = Math.round(baseCount * countMultiplier);
    
    const initParticles = () => {
      particles = [];
      for (let i = 0; i < particleCount; i++) {
        if (effect === 'snow') {
          particles.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            r: Math.random() * 5 + 3,
            d: Math.random() * 100,
            vy: Math.random() * 1.6 + 0.8,
            vx: Math.random() * 1.2 - 0.6,
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.04,
            isCrystal: Math.random() > 0.4
          });
        } else if (effect === 'fireworks') {
          particles.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            size: Math.random() * 3.5 + 1.5,
            vy: -(Math.random() * 0.8 + 0.2),
            vx: Math.random() * 0.4 - 0.2,
            alpha: Math.random() * 0.6 + 0.4,
            twinkleSpeed: Math.random() * 0.03 + 0.015,
            color: Math.random() > 0.3 ? '#f59e0b' : '#fbbf24'
          });
        } else if (effect === 'hearts') {
          particles.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            size: Math.random() * 12 + 8,
            vy: -(Math.random() * 1.4 + 0.7),
            vx: Math.random() * 0.6 - 0.3,
            swing: Math.random() * Math.PI * 2,
            swingSpeed: Math.random() * 0.025 + 0.01,
            color: ['#f43f5e', '#ec4899', '#db2777', '#e11d48'][Math.floor(Math.random() * 4)],
            alpha: Math.random() * 0.45 + 0.55
          });
        } else if (effect === 'rain') {
          particles.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight - window.innerHeight,
            length: Math.random() * 20 + 20,
            vy: Math.random() * 14 + 10,
            vx: -2.5,
            opacity: Math.random() * 0.45 + 0.4
          });
        } else if (effect === 'harmattan') {
          particles.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            size: Math.random() * 3.5 + 1.5,
            vx: Math.random() * 5 + 3,
            vy: Math.random() * 1 - 0.5,
            opacity: Math.random() * 0.5 + 0.3,
            color: Math.random() > 0.5 ? '#d97706' : '#f59e0b'
          });
        } else if (effect === 'ramadan') {
          particles.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            size: Math.random() * 8 + 4,
            alpha: Math.random() * 0.7 + 0.3,
            twinkleSpeed: Math.random() * 0.025 + 0.01,
            type: Math.random() > 0.75 ? 'moon' : 'star'
          });
        } else if (effect === 'burkina') {
          particles.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            size: Math.random() * 10 + 6,
            vy: Math.random() * 2.2 + 1.2,
            vx: Math.random() * 1.2 - 0.6,
            color: Math.random() > 0.5 ? '#059669' : '#dc2626',
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: Math.random() * 0.06 + 0.02,
            type: Math.random() > 0.65 ? 'star' : 'confetti'
          });
        } else if (effect === 'sakura') {
          particles.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight - window.innerHeight,
            size: Math.random() * 12 + 7,
            vy: Math.random() * 1.8 + 0.9,
            vx: Math.random() * 1.2 + 0.6,
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: Math.random() * 0.04 + 0.01,
            swing: Math.random() * Math.PI * 2,
            swingSpeed: Math.random() * 0.025 + 0.01
          });
        } else if (effect === 'sparkles') {
          particles.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            size: Math.random() * 5 + 2,
            vy: -(Math.random() * 0.9 + 0.3),
            vx: Math.random() * 0.6 - 0.3,
            alpha: Math.random() * 0.6 + 0.3,
            twinkleSpeed: Math.random() * 0.03 + 0.01,
            type: Math.random() > 0.5 ? 'orb' : 'star'
          });
        }
      }
    };
    
    initParticles();
    
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      particles.forEach((p) => {
        if (effect === 'snow') {
          p.y += p.vy;
          p.x += p.vx + Math.sin(p.d / 10) * 0.3;
          p.d += 0.05;
          p.rotation += p.rotSpeed;
          
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          
          if (p.isCrystal) {
            // Draw 6-branched snowflake
            ctx.strokeStyle = 'rgba(147, 197, 253, 0.9)';
            ctx.lineWidth = 1.5;
            ctx.shadowColor = 'rgba(59, 130, 246, 0.5)';
            ctx.shadowBlur = 4;
            const s = p.r * 1.6;
            for (let b = 0; b < 3; b++) {
              ctx.beginPath();
              ctx.moveTo(-s, 0);
              ctx.lineTo(s, 0);
              ctx.stroke();
              ctx.rotate(Math.PI / 3);
            }
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, p.r * 0.5, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Glowing round snowflake
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.shadowColor = 'rgba(147, 197, 253, 0.8)';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(0, 0, p.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(147, 197, 253, 0.6)';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          ctx.restore();
          
          if (p.y > canvas.height + 15) {
            p.y = -15;
            p.x = Math.random() * canvas.width;
          }
        }
        else if (effect === 'fireworks') {
          p.alpha += p.twinkleSpeed;
          if (p.alpha > 0.95 || p.alpha < 0.25) {
            p.twinkleSpeed = -p.twinkleSpeed;
          }
          p.y += p.vy;
          p.x += p.vx;
          
          ctx.save();
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.max(0.1, Math.min(1, p.alpha));
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 8;
          
          // Draw 4-point star
          const s = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - s);
          ctx.quadraticCurveTo(p.x, p.y, p.x + s, p.y);
          ctx.quadraticCurveTo(p.x, p.y, p.x, p.y + s);
          ctx.quadraticCurveTo(p.x, p.y, p.x - s, p.y);
          ctx.quadraticCurveTo(p.x, p.y, p.x, p.y - s);
          ctx.fill();
          ctx.restore();
          
          if (p.y < -15) {
            p.y = canvas.height + 15;
            p.x = Math.random() * canvas.width;
          }
        }
        else if (effect === 'hearts') {
          p.swing += p.swingSpeed;
          p.x += Math.sin(p.swing) * 0.4;
          p.y += p.vy;
          
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.shadowColor = 'rgba(244, 63, 94, 0.4)';
          ctx.shadowBlur = 6;
          
          const x = p.x;
          const y = p.y;
          const s = p.size;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.bezierCurveTo(x - s/2, y - s/2, x - s, y + s/3, x, y + s);
          ctx.bezierCurveTo(x + s, y + s/3, x + s/2, y - s/2, x, y);
          ctx.fill();
          
          // Subtle glossy highlight
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.beginPath();
          ctx.arc(x - s * 0.25, y + s * 0.1, s * 0.15, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          
          if (p.y < -30) {
            p.y = canvas.height + 30;
            p.x = Math.random() * canvas.width;
          }
        }
        else if (effect === 'rain') {
          ctx.save();
          ctx.beginPath();
          ctx.strokeStyle = `rgba(2, 132, 199, ${p.opacity})`;
          ctx.lineWidth = 2;
          ctx.shadowColor = 'rgba(56, 189, 248, 0.4)';
          ctx.shadowBlur = 3;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.vx, p.y + p.length);
          ctx.stroke();
          ctx.restore();
          
          p.y += p.vy;
          p.x += p.vx;
          
          if (p.y > canvas.height) {
            ripples.push({
              x: p.x,
              y: canvas.height - 4,
              r: 1,
              maxR: Math.random() * 18 + 10,
              alpha: 0.7,
              decay: Math.random() * 0.03 + 0.02
            });
            
            p.y = -p.length;
            p.x = Math.random() * canvas.width;
          }
        }
        else if (effect === 'harmattan') {
          ctx.save();
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.opacity;
          ctx.shadowColor = '#d97706';
          ctx.shadowBlur = 4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          
          p.x += p.vx;
          p.y += p.vy + Math.sin(p.x / 30) * 0.15;
          
          if (p.x > canvas.width + 10) {
            p.x = -10;
            p.y = Math.random() * canvas.height;
          }
        }
        else if (effect === 'ramadan') {
          p.alpha += p.twinkleSpeed;
          if (p.alpha > 0.95 || p.alpha < 0.25) {
            p.twinkleSpeed = -p.twinkleSpeed;
          }
          
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = '#fbbf24';
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 8;
          
          if (p.type === 'moon') {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 1.4, -Math.PI / 2.8, Math.PI / 2.8, false);
            ctx.quadraticCurveTo(p.x + p.size * 0.6, p.y, p.x + p.size * 0.4, p.y - p.size * 1.2);
            ctx.fill();
          } else {
            const s = p.size;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - s);
            ctx.quadraticCurveTo(p.x, p.y, p.x + s, p.y);
            ctx.quadraticCurveTo(p.x, p.y, p.x, p.y + s);
            ctx.quadraticCurveTo(p.x, p.y, p.x - s, p.y);
            ctx.quadraticCurveTo(p.x, p.y, p.x, p.y - s);
            ctx.fill();
          }
          ctx.restore();
          
          p.y -= 0.15;
          if (p.y < -20) p.y = canvas.height + 20;
        }
        else if (effect === 'burkina') {
          p.rotation += p.rotSpeed;
          p.y += p.vy;
          p.x += p.vx;
          
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          
          if (p.type === 'star') {
            ctx.fillStyle = '#fbbf24';
            ctx.shadowColor = '#d97706';
            ctx.shadowBlur = 6;
            const s = p.size * 0.8;
            ctx.beginPath();
            for (let j = 0; j < 5; j++) {
              ctx.lineTo(Math.cos((18 + j * 72) * Math.PI / 180) * s, -Math.sin((18 + j * 72) * Math.PI / 180) * s);
              ctx.lineTo(Math.cos((54 + j * 72) * Math.PI / 180) * (s/2), -Math.sin((54 + j * 72) * Math.PI / 180) * (s/2));
            }
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 3;
            ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          }
          ctx.restore();
          
          if (p.y > canvas.height + 20) {
            p.y = -20;
            p.x = Math.random() * canvas.width;
          }
        }
        else if (effect === 'sakura') {
          p.rotation += p.rotSpeed;
          p.swing += p.swingSpeed;
          p.y += p.vy;
          p.x += p.vx + Math.sin(p.swing) * 0.5;
          
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = '#f472b6';
          ctx.shadowColor = '#fda4af';
          ctx.shadowBlur = 5;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.55 * Math.abs(Math.cos(p.rotation)), 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          
          if (p.y > canvas.height + 25 || p.x > canvas.width + 25) {
            p.y = -25;
            p.x = Math.random() * (canvas.width * 0.8);
          }
        }
        else if (effect === 'sparkles') {
          p.alpha += p.twinkleSpeed;
          if (p.alpha > 0.9 || p.alpha < 0.25) {
            p.twinkleSpeed = -p.twinkleSpeed;
          }
          p.y += p.vy;
          p.x += p.vx;
          
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = primaryColor;
          ctx.shadowColor = primaryColor;
          ctx.shadowBlur = 8;
          
          if (p.type === 'star') {
            const s = p.size;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - s);
            ctx.quadraticCurveTo(p.x, p.y, p.x + s, p.y);
            ctx.quadraticCurveTo(p.x, p.y, p.x, p.y + s);
            ctx.quadraticCurveTo(p.x, p.y, p.x - s, p.y);
            ctx.quadraticCurveTo(p.x, p.y, p.x, p.y - s);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          
          if (p.y < -15) {
            p.y = canvas.height + 15;
            p.x = Math.random() * canvas.width;
          }
        }
      });
      
      // Render fireworks bursts
      fireworks.forEach((f, idx) => {
        f.x += f.vx;
        f.y += f.vy;
        f.vy += 0.08;
        f.alpha -= f.decay;
        
        if (f.alpha <= 0) {
          fireworks.splice(idx, 1);
        } else {
          ctx.save();
          ctx.beginPath();
          ctx.fillStyle = f.color;
          ctx.globalAlpha = f.alpha;
          ctx.shadowColor = f.color;
          ctx.shadowBlur = 6;
          ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });
      
      // Render ripples
      ripples.forEach((r, idx) => {
        r.r += (r.maxR - r.r) * 0.09;
        r.alpha -= r.decay;
        
        if (r.alpha <= 0) {
          ripples.splice(idx, 1);
        } else {
          ctx.save();
          ctx.beginPath();
          ctx.strokeStyle = `rgba(2, 132, 199, ${r.alpha})`;
          ctx.lineWidth = 1.5;
          ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      });
      
      // Auto fireworks launcher
      if (effect === 'fireworks') {
        autoLaunchTimer++;
        if (autoLaunchTimer > 90) {
          autoLaunchTimer = 0;
          const x = Math.random() * canvas.width * 0.8 + canvas.width * 0.1;
          const y = Math.random() * canvas.height * 0.4 + canvas.height * 0.1;
          spawnFireworksAt(x, y);
        }
      }
      
      animationId = requestAnimationFrame(render);
    };
    
    render();
    
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousedown', handleWindowClick);
    };
  }, [effect, intensity, primaryColor]);
  
  return (
    <>
      {effect && effect !== 'none' && (
        <canvas 
          ref={canvasRef} 
          className="fixed inset-0 pointer-events-none z-[45]"
          style={{ width: '100vw', height: '100vh' }}
        />
      )}
      {decorationsEnabled && <Ornaments theme={theme} />}
    </>
  );
};

export default function App() {
  // Helper for haptic feedback
  const triggerHaptic = (style: ImpactStyle = ImpactStyle.Light) => {
    if (Capacitor.isNativePlatform()) {
      try {
        Haptics.impact({ style });
      } catch (e) {}
    }
  };

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [viewMode, setViewMode] = useState<UserRole | null>(null);
  const effectiveProfile = React.useMemo(() => {
    if (!profile) return null;
    if (profile.role === 'super-admin' && viewMode && viewMode !== 'super-admin') {
      return { ...profile, role: viewMode as UserRole };
    }
    return profile;
  }, [profile, viewMode]);

  const activeRole = effectiveProfile?.role;

  useEffect(() => {
    if (profile?.role === 'super-admin' && activeRole && activeRole !== 'super-admin' && !viewMode) {
      setViewMode(activeRole);
    }
  }, [profile, activeRole, viewMode]);
  const [settings, setSettings] = useState<Settings | null>(() => {
    try {
      const cached = localStorage.getItem('cached_app_branding');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const [rotation, setRotation] = useState<OnCallRotation | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('isDarkMode');
    return saved === 'true';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('isDarkMode', String(isDarkMode));
  }, [isDarkMode]);

  // Failsafe timeout to prevent infinite loading screen
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isAuthReady || loading) {
        console.warn("[App] Loading timeout reached, forcing UI to render");
        setLoading(false);
        setIsAuthReady(true);
      }
    }, 7000);
    return () => clearTimeout(timer);
  }, [isAuthReady, loading]);

  const [isResetting, setIsResetting] = useState(false);
  const [showSupportChat, setShowSupportChat] = useState(false);
  const [infoPage, setInfoPage] = useState<'how_it_works' | 'pharmacies' | 'delivery' | 'contact' | 'legal' | 'privacy' | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [prescriptionToDelete, setPrescriptionToDelete] = useState<string | null>(null);
  const [ordersToDelete, setOrdersToDelete] = useState<string[]>([]);
  const [isDeletingPrescription, setIsDeletingPrescription] = useState(false);
  const [supportMessages, setSupportMessages] = useState<any[]>([]);
  const [newSupportMessage, setNewSupportMessage] = useState('');
  const [supportChatMeta, setSupportChatMeta] = useState<any>(null);

  // Scroll to top on any core screen/mode/view/info-page transitions
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.scrollTop = 0;
  }, [viewMode, activeRole, showSupportChat, infoPage]);

  // Network connection state & listeners
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Connexion Internet rétablie !", {
        description: "Vous êtes de nouveau connecté à la plateforme.",
        duration: 4000
      });
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.error("Connexion Internet interrompue", {
        description: "Attention : vous n'avez plus accès au réseau. Veuillez vérifier votre connexion.",
        duration: 8000
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'support_messages'), 
      where('chatId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Reverse because we want newest at the bottom in the UI but fetched newest first
      setSupportMessages(messages.reverse() as any);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'support_messages'));

    const unsubMeta = onSnapshot(doc(db, 'support_chats', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setSupportChatMeta(docSnap.data());
      }
    });

    return () => {
      unsubscribe();
      unsubMeta();
    };
  }, [user]);

  // Reset unread count when opening chat
  useEffect(() => {
    if (showSupportChat && user && supportChatMeta?.unreadUserCount > 0) {
      setDoc(doc(db, 'support_chats', user.uid), {
        unreadUserCount: 0
      }, { merge: true }).catch(console.error);
    }
  }, [showSupportChat, user, supportChatMeta?.unreadUserCount]);

  const sendSupportMessage = async () => {
    if (!newSupportMessage.trim() || !user) return;
    
    if (supportChatMeta?.status === 'suspended') {
      toast.error("Ce chat a été suspendu par l'administrateur.");
      return;
    }

    try {
      await addDoc(collection(db, 'support_messages'), {
        chatId: user.uid,
        senderId: user.uid,
        senderName: profile?.name || user.email,
        text: newSupportMessage,
        isAdmin: false,
        createdAt: serverTimestamp()
      });
      
      await setDoc(doc(db, 'support_chats', user.uid), {
        chatId: user.uid,
        participantName: profile?.name || user.email,
        participantRole: profile?.role || 'user',
        lastMessage: newSupportMessage,
        lastTime: serverTimestamp(),
        unreadAdminCount: increment(1),
        status: supportChatMeta?.status || 'active'
      }, { merge: true });

      setNewSupportMessage('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'support_messages');
    }
  };

  const handleDeletePrescription = (pId: string, orderIds: string[] = []) => {
    setPrescriptionToDelete(pId);
    setOrdersToDelete(orderIds);
  };

  const confirmDeletePrescription = async () => {
    if (!prescriptionToDelete) return;
    const pId = prescriptionToDelete;
    setIsDeletingPrescription(true);
    
    try {
      const batch = writeBatch(db);
      
      // 1. Delete associated orders
      ordersToDelete.forEach(oId => {
        batch.delete(doc(db, 'orders', oId));
      });
      
      // 2. Delete the prescription
      batch.delete(doc(db, 'prescriptions', pId));
      
      await batch.commit();
      toast.success("Ordonnance supprimée avec succès.");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `prescriptions/${pId}`);
    } finally {
      setIsDeletingPrescription(false);
      setPrescriptionToDelete(null);
      setOrdersToDelete([]);
    }
  };
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [lastActivity, setLastActivity] = useState(Date.now());

  // Auto-logout logic (15 minutes of inactivity)
  useEffect(() => {
    if (!user) return;
    const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes
    const checkIdle = setInterval(() => {
      if (Date.now() - lastActivity > IDLE_TIMEOUT) {
        handleLogout();
        toast.info("Session fermée pour inactivité.");
      }
    }, 60000); // Check every minute

    const updateActivity = () => setLastActivity(Date.now());
    window.addEventListener('mousemove', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('click', updateActivity);
    window.addEventListener('touchstart', updateActivity);

    return () => {
      clearInterval(checkIdle);
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('click', updateActivity);
      window.removeEventListener('touchstart', updateActivity);
    };
  }, [lastActivity, user]);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showLegal, setShowLegal] = useState(false);
  const [legalTab, setLegalTab] = useState<'cgu' | 'privacy' | 'mentions'>('cgu');
  const [showShowcase, setShowShowcase] = useState(false);
  const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'announcements'), where('active', '==', true), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setAnnouncements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Announcement)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'announcements'));
    return () => unsub();
  }, [user]);

  // Request FCM Permission and Token
  useEffect(() => {
    if (!profile?.uid) return;

    const setupFCM = async () => {
      try {
        const msg = await messaging();
        if (!msg) return;

        if (!('Notification' in window)) {
          console.warn('This browser does not support desktop notification');
          return;
        }

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          // Note: In a real production app, you need to pass your VAPID key here
          // const token = await getToken(msg, { vapidKey: 'YOUR_VAPID_KEY' });
          const token = await getToken(msg);
          if (token) {
            await updateDoc(doc(db, 'users', profile.uid), {
              fcmToken: token
            });
          }
          
          onMessage(msg, (payload) => {
            toast.info(payload.notification?.title || 'Nouvelle notification', {
              description: payload.notification?.body,
              icon: <Bell className="text-primary" />
            });
            playNotificationSound(settings, profile?.sound_enabled !== false);
          });
        }
      } catch (error) {
        console.error('FCM Setup Error:', error);
      }
    };

    setupFCM();
  }, [profile?.uid]);

  // Track location for delivery and patients
  const lastLocationUpdate = useRef<number>(0);
  useEffect(() => {
    if (!profile?.uid || (activeRole !== 'delivery' && activeRole !== 'patient' && activeRole !== 'pharmacist')) return;

    if (!navigator.geolocation) {
      console.error("Geolocation is not supported by this browser.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now();
        // Throttle updates to once every 15 seconds to prevent spamming Firestore and freezing the UI
        if (now - lastLocationUpdate.current < 15000) return;
        lastLocationUpdate.current = now;

        const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(newLoc);
        
        // Update user profile location
        try {
          await updateDoc(doc(db, 'users', profile.uid), {
            location: newLoc,
            lastLocationUpdate: serverTimestamp()
          });

          // If delivery, update active orders too
          if (activeRole === 'delivery') {
            const q = query(
              collection(db, 'orders'), 
              where('deliveryId', '==', profile.uid),
              where('status', '==', 'delivering')
            );
            const activeOrdersSnap = await getDocs(q);
            activeOrdersSnap.forEach(async (orderDoc) => {
              await updateDoc(doc(db, 'orders', orderDoc.id), {
                driverLocation: newLoc
              });
            });
          }
        } catch (err) {
          console.error("Error updating location:", err);
        }
      },
      (err) => {
        const errorMessages = {
          1: "Permission de géolocalisation refusée.",
          2: "Position indisponible (vérifiez vos paramètres GPS).",
          3: "Délai d'attente de géolocalisation dépassé."
        };
        const msg = errorMessages[err.code as keyof typeof errorMessages] || err.message;
        console.error("Geolocation error:", msg, err);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [profile?.uid, activeRole]);

  useEffect(() => {
    if (profile && !viewMode) {
      setViewMode(profile.role);
    }
  }, [profile, viewMode]);

  useEffect(() => {
    // Native mobile initializations
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/status-bar').then(({ StatusBar }) => {
        StatusBar.setBackgroundColor({ color: '#059669' }); // emerald-600
      });
      import('@capacitor/app').then(({ App }) => {
        App.addListener('backButton', ({ canGoBack }) => {
          if (canGoBack) {
            window.history.back();
          } else {
            App.exitApp();
          }
        });
      });
    }
  }, []);

  // Handle SplashScreen hide
  useEffect(() => {
    if (isAuthReady && !loading && Capacitor.isNativePlatform()) {
      import('@capacitor/splash-screen').then(({ SplashScreen }) => {
        SplashScreen.hide();
      });
    }
  }, [isAuthReady, loading]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const docRef = doc(db, 'users', firebaseUser.uid);
        const unsubProfile = onSnapshot(docRef, (docSnap) => {
          try {
            if (docSnap.exists()) {
              const data = docSnap.data() as UserProfile;
              
              // Handle suspended/blocked users
              if (data.status === 'suspended' || data.status === 'blocked') {
                // If the user isn't a super-admin, we should notify them but not necessarily sign them out here
                // to allow them to see the suspended screen.
              }

              // Force super-admin role for the specific emails
              if (isSuperAdminEmail(firebaseUser.email) && data.role !== 'super-admin') {
                updateDoc(docRef, { role: 'super-admin', status: 'active' }).catch(console.error);
                setProfile({ ...data, role: 'super-admin', status: 'active' });
                setViewMode(prev => prev || 'super-admin');
              } else {
                const updates: any = {};
                let hasUpdates = false;

                if (data.walletBalance === undefined || data.walletBalance === null) {
                  updates.walletBalance = 0;
                  hasUpdates = true;
                }

                // Auto-activate patient accounts if they are pending
                if (data.role === 'patient' && data.status === 'pending') {
                  updates.status = 'active';
                  hasUpdates = true;
                }

                if (hasUpdates) {
                  updateDoc(docRef, updates).catch(console.error);
                  const updatedProfile = { ...data, ...updates };
                  setProfile(updatedProfile);
                  setViewMode(prev => prev || updatedProfile.role);
                } else {
                  setProfile(data);
                  setViewMode(prev => prev || data.role);
                }
              }
            } else if (isSuperAdminEmail(firebaseUser.email)) {
              // Auto-create super-admin profile if it doesn't exist
              const newProfile: UserProfile = {
                uid: firebaseUser.uid,
                name: firebaseUser.displayName || 'Super Admin',
                email: firebaseUser.email || '',
                role: 'super-admin',
                walletBalance: 0,
                pharmacistBalance: 0,
                deliveryBalance: 0,
                status: 'active',
                createdAt: serverTimestamp()
              };
              setDoc(docRef, newProfile).catch(console.error);
              setProfile(newProfile);
              setViewMode(prev => prev || 'super-admin');
            } else {
              setProfile(null);
              setViewMode(null);
            }
          } catch (err) {
            console.error("Error processing profile data:", err);
          } finally {
            setLoading(false);
            setIsAuthReady(true);
          }
        }, (error) => {
          console.error("Error fetching profile:", error);
          if (isSuperAdminEmail(firebaseUser.email)) {
            const fallbackProfile: UserProfile = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || 'Super Admin',
              email: firebaseUser.email || '',
              role: 'super-admin',
              walletBalance: 0,
              pharmacistBalance: 0,
              deliveryBalance: 0,
              status: 'active',
              createdAt: new Date() as any
            };
            setProfile(fallbackProfile);
            setViewMode(prev => prev || 'super-admin');
          }
          setLoading(false);
          setIsAuthReady(true);
        });
        return () => unsubProfile();
      } else {
        setProfile(null);
        setLoading(false);
        setIsAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Settings;
        setSettings(data);
      } else {
        // Initialize default settings if they don't exist
        const defaultSettings: Settings = {
          dayDeliveryFee: 1000,
          nightDeliveryFee: 2000,
          nightStartHour: 20,
          nightEndHour: 6,
          commissionPercentage: 10,
          deliveryCommissionPercentage: 10,
          appName: 'Ordonnance Direct',
          supportChatEnabled: true,
          maintenanceMode: false
        };
        setSettings(defaultSettings);
        if (user && isSuperAdminEmail(user.email)) {
          setDoc(doc(db, 'settings', 'global'), defaultSettings).catch(err => {
            console.error("Error initializing settings:", err);
          });
        }
      }
    }, (err) => {
      console.error("Settings listener error:", err);
      // Fallback
      setSettings({
        dayDeliveryFee: 1000,
        nightDeliveryFee: 2000,
        nightStartHour: 20,
        nightEndHour: 6,
        commissionPercentage: 10,
        deliveryCommissionPercentage: 10,
        appName: 'Ordonnance Direct',
        supportChatEnabled: true,
        maintenanceMode: false
      });
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsubCities = onSnapshot(collection(db, 'cities'), (snap) => {
      if (snap.empty) {
        const defaultCities: City[] = [
          {
            id: 'ouagadougou',
            name: 'Ouagadougou',
            onCallStartTime: '19:00',
            onCallEndTime: '08:00',
            status: 'active',
            location: { lat: 12.3714, lng: -1.5197 }
          },
          {
            id: 'bobo_dioulasso',
            name: 'Bobo-Dioulasso',
            onCallStartTime: '19:00',
            onCallEndTime: '08:00',
            status: 'active',
            location: { lat: 11.1714, lng: -4.2973 }
          }
        ];
        setCities(defaultCities);
        defaultCities.forEach(city => {
          setDoc(doc(db, 'cities', city.id), city).catch(err => console.error("Error auto-seeding city:", err));
        });
      } else {
        setCities(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as City)));
      }
    });
    const unsubRotation = onSnapshot(doc(db, 'on_call_rotation', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        setRotation({ id: docSnap.id, ...docSnap.data() } as OnCallRotation);
      } else {
        const defaultRotation: OnCallRotation = {
          id: 'global',
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          currentGroup: 1,
          baseMondayDate: new Date().toISOString().split('T')[0],
          baseGroup: 1
        };
        setDoc(doc(db, 'on_call_rotation', 'global'), defaultRotation).catch(console.error);
        setRotation(defaultRotation);
      }
    });
    return () => {
      unsubCities();
      unsubRotation();
    };
  }, [user]);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    
    // Check if Google Auth is globally enabled
    if (settings?.googleAuthEnabled === false) {
      toast.error("La connexion Google est actuellement désactivée par l'administrateur.");
      return;
    }

    setIsLoggingIn(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    
    try {
      // Use popup for both web and mobile webviews to avoid 'null' origin redirect errors in basic Capacitor setups.
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code !== 'auth/cancelled-popup-request' && error.code !== 'auth/popup-closed-by-user') {
        console.error("Login failed:", error);
        toast.error("La connexion a échoué. Veuillez réessayer.");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleSwitchRole = () => {
    setProfile(null);
  };

  const handleResetData = async () => {
    setIsResetting(true);
    setShowResetConfirm(false);
    
    try {
      const collectionsToDelete = ['prescriptions', 'orders', 'transactions', 'withdrawals', 'notifications', 'support_messages', 'pharmacies', 'system_logs'];
      const deletePromises: Promise<void>[] = [];

      for (const col of collectionsToDelete) {
        const snap = await getDocs(collection(db, col));
        snap.docs.forEach(d => deletePromises.push(deleteDoc(doc(db, col, d.id))));
      }

      // Delete users EXCEPT super-admin
      const usersSnap = await getDocs(collection(db, 'users'));
      usersSnap.docs.forEach(d => {
        if (d.data().role !== 'super-admin') {
          deletePromises.push(deleteDoc(doc(db, 'users', d.id)));
        }
      });
      
      await Promise.all(deletePromises);
      window.location.reload();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'all_collections');
      setIsResetting(false);
    }
  };

  const handleRoleSelection = async (role: UserRole, extraData: any) => {
    if (!user) return;
    const newProfile: UserProfile = {
      uid: user.uid,
      name: user.displayName || 'Utilisateur',
      email: user.email || '',
      role: role,
      walletBalance: 0,
      pharmacistBalance: 0,
      deliveryBalance: 0,
      status: (role === 'admin' || role === 'patient' || role === 'super-admin') ? 'active' : 'pending',
      ...extraData
    };
    try {
      await setDoc(doc(db, 'users', user.uid), newProfile);
      setProfile(newProfile);
      setViewMode(role);
      
      // Note: We cannot notify admins from the client side securely without exposing admin profiles.
      // In a production app, this should be handled by a Cloud Function triggered by user creation.
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  if (!isAuthReady || (user && loading)) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        {/* Decorative background for loader */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl opacity-50"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-secondary/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl opacity-50"></div>
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center justify-center relative z-10"
        >
          <motion.div 
            animate={{ 
              scale: [1, 1.05, 1],
              boxShadow: [
                "0 0 0 0 rgba(16, 185, 129, 0)",
                "0 0 0 30px rgba(16, 185, 129, 0.05)",
                "0 0 0 0 rgba(16, 185, 129, 0)"
              ]
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="w-32 h-32 bg-emerald-50 rounded-[3rem] flex items-center justify-center text-emerald-600 mb-8 border border-emerald-100 shadow-xl"
          >
            <LogoIcon size={80} logoUrl={settings?.appLogoUrl} />
          </motion.div>
          
          <div className="flex flex-col items-center gap-2">
            <h2 className="text-xl font-black text-slate-800 italic animate-pulse">{settings?.appName || 'Ordonnance Direct'}</h2>
            <div className="flex items-center gap-1.5 h-6">
              <motion.div 
                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                className="w-1.5 h-1.5 bg-primary rounded-full" 
              />
              <motion.div 
                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                className="w-1.5 h-1.5 bg-primary rounded-full" 
              />
              <motion.div 
                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                className="w-1.5 h-1.5 bg-primary rounded-full" 
              />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2">Sécurisation de session...</p>
          </div>
        </motion.div>
        
        <div className="absolute bottom-12 text-center">
          <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Technologie Santé • Burkina Faso</p>
        </div>
      </div>
    );
  }

  if (showShowcase) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center text-emerald-600 font-bold">Chargement du site vitrine...</div>}>
        <ShowcaseLanding 
          onGoToAuth={(mode) => {
            setShowShowcase(false);
          }} 
          onOpenLegal={(tab) => {
            if (tab) setLegalTab(tab);
            setShowLegal(true);
          }}
        />
      </Suspense>
    );
  }

  if (showLegal) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center text-emerald-600 font-bold">Chargement des documents légaux...</div>}>
        <Legal 
          onBack={() => setShowLegal(false)} 
          initialTab={legalTab}
        />
      </Suspense>
    );
  }

  if (!user) {
    if (settings?.maintenanceMode) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
          <div className="w-24 h-24 bg-red-100 rounded-3xl flex items-center justify-center text-red-500 mb-8">
            <Power size={48} />
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-4">Maintenance en cours</h1>
          <p className="text-slate-500 max-w-md text-lg mb-8">
                  {settings.maintenanceMessage || "Notre plateforme est actuellement en maintenance pour vous offrir une meilleure expérience. Veuillez revenir plus tard."}
          </p>
          <button 
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors"
          >
            {isLoggingIn ? "Connexion..." : "Connexion Admin"}
          </button>
        </div>
      );
    }
    return (
      <>
        <DynamicTheme settings={settings} />
        <SeasonalBranding 
          theme={settings?.themeType} 
          effectType={settings?.effectType}
          decorationsEnabled={settings?.decorationsEnabled}
          intensity={settings?.effectsIntensity}
          primaryColor={settings?.primaryColor}
        />
        <LoginView 
          onLogin={handleLogin} 
          isLoggingIn={isLoggingIn} 
          onOpenShowcase={() => setShowShowcase(true)}
          onOpenLegal={(tab) => {
            if (tab) setLegalTab(tab);
            setShowLegal(true);
          }}
          settings={settings}
        />
      </>
    );
  }

  if (settings?.maintenanceMode && profile?.role !== 'admin' && profile?.role !== 'super-admin' && !isSuperAdminEmail(user.email)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
        <DynamicTheme settings={settings} />
        <SeasonalBranding 
          theme={settings?.themeType} 
          effectType={settings?.effectType}
          decorationsEnabled={settings?.decorationsEnabled}
          intensity={settings?.effectsIntensity}
          primaryColor={settings?.primaryColor}
        />
        <div className="w-24 h-24 bg-red-100 rounded-3xl flex items-center justify-center text-red-500 mb-8">
          <Power size={48} />
        </div>
        <h1 className="text-4xl font-bold text-slate-900 mb-4">Maintenance en cours</h1>
        <p className="text-slate-500 max-w-md text-lg mb-8">
          {settings.maintenanceMessage || "Notre plateforme est actuellement en maintenance pour vous offrir une meilleure expérience. Veuillez revenir plus tard."}
        </p>
        <button 
          onClick={handleLogout}
          className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors"
        >
          Se déconnecter
        </button>
      </div>
    );
  }

  if (!profile) {
    return (
      <>
        <DynamicTheme settings={settings} />
        <SeasonalBranding 
          theme={settings?.themeType} 
          effectType={settings?.effectType}
          decorationsEnabled={settings?.decorationsEnabled}
          intensity={settings?.effectsIntensity}
          primaryColor={settings?.primaryColor}
        />
        <RoleSelectionView onSelect={handleRoleSelection} isAdmin={isSuperAdminEmail(user.email)} settings={settings} />
      </>
    );
  }

  if (profile?.status === 'suspended' && !isSuperAdminEmail(user?.email)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
        <div className="w-24 h-24 bg-amber-100 rounded-3xl flex items-center justify-center text-amber-500 mb-8">
          <AlertCircle size={48} />
        </div>
        <h1 className="text-4xl font-bold text-slate-900 mb-4">Compte Suspendu</h1>
        <p className="text-slate-500 max-w-md text-lg mb-8">
          Votre compte a été temporairement suspendu par l'administrateur. Veuillez contacter le support pour plus d'informations.
        </p>
        <button 
          onClick={handleLogout}
          className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors"
        >
          Se déconnecter
        </button>
      </div>
    );
  }

  if (profile?.status === 'blocked' && !isSuperAdminEmail(user?.email)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
        <div className="w-24 h-24 bg-red-100 rounded-3xl flex items-center justify-center text-red-500 mb-8">
          <X size={48} />
        </div>
        <h1 className="text-4xl font-bold text-slate-900 mb-4">Compte Bloqué</h1>
        <p className="text-slate-500 max-w-md text-lg mb-8">
          Votre accès à la plateforme a été bloqué définitivement pour non-respect des règles d'utilisation.
        </p>
        <button 
          onClick={handleLogout}
          className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors"
        >
          Se déconnecter
        </button>
      </div>
    );
  }

  if (profile.status === 'pending' && !isSuperAdminEmail(user?.email)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
        <div className="w-24 h-24 bg-amber-100 rounded-3xl flex items-center justify-center text-amber-500 mb-8">
          <AlertCircle size={48} />
        </div>
        <h1 className="text-4xl font-bold text-slate-900 mb-4">Compte en attente de validation</h1>
        <p className="text-slate-500 max-w-md text-lg mb-8">
          Votre compte est en cours d'examen par notre équipe. Vous recevrez une notification une fois qu'il sera validé.
        </p>
        <button 
          onClick={handleLogout}
          className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors"
        >
          Se déconnecter
        </button>
      </div>
    );
  }

  if (profile?.status === 'rejected' && !isSuperAdminEmail(user?.email)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
        <div className="w-24 h-24 bg-red-100 rounded-3xl flex items-center justify-center text-red-500 mb-8">
          <X size={48} />
        </div>
        <h1 className="text-4xl font-bold text-slate-900 mb-4">Demande refusée</h1>
        <p className="text-slate-500 max-w-md text-lg mb-8">
          Votre demande de création de compte a été refusée par l'administrateur.
        </p>
        <button 
          onClick={handleLogout}
          className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors"
        >
          Se déconnecter
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen h-[100dvh] flex flex-col bg-slate-50 font-sans selection:bg-primary/20 selection:text-primary relative overflow-hidden md:min-h-screen md:h-auto md:overflow-visible">
      <DynamicTheme settings={settings} />
      <SeasonalBranding 
        theme={settings?.themeType} 
        effectType={settings?.effectType}
        decorationsEnabled={settings?.decorationsEnabled}
        intensity={settings?.effectsIntensity}
        primaryColor={settings?.primaryColor}
      />
      {/* Background Magic Touch */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div 
          animate={{ 
            scale: [1, 1.1, 1],
            opacity: [0.03, 0.05, 0.03],
            x: [0, 30, 0],
            y: [0, -20, 0]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500 rounded-full blur-[140px]"
        />
        <motion.div 
          animate={{ 
            scale: [1.1, 1, 1.1],
            opacity: [0.05, 0.03, 0.05],
            x: [0, -40, 0],
            y: [0, 40, 0]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-sky-500 rounded-full blur-[140px]"
        />
      </div>

      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-[0_4px_25px_-5px_rgba(0,0,0,0.05)] gpu-accelerated" style={{ paddingTop: 'max(env(safe-area-inset-top), 0px)' }}>
        {/* Dynamic Top Brand Accent Bar */}
        <div className="h-1 sm:h-1.5 w-full bg-gradient-to-r from-primary via-secondary to-primary shadow-sm" />

        {!isOnline && (
          <div className="bg-rose-600 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider border-b border-rose-700 shadow-md animate-in fade-in slide-in-from-top duration-300">
            <div className="w-2.5 h-2.5 rounded-full bg-white animate-ping shrink-0" />
            <span>🔴 Mode Hors-Ligne : Connexion Internet perdue. Vérifiez votre réseau.</span>
          </div>
        )}
        {activeRole === 'delivery' && profile && (!profile.idCardFront || !profile.idCardBack || !profile.guarantorInfo?.name) && (
          <div className="bg-rose-50 text-rose-700 px-4 py-2 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider border-b border-rose-100">
            <AlertCircle size={14} /> Attention : Votre dossier est incomplet (ID ou Garant manquant).
          </div>
        )}
        <AnimatePresence>
          {announcements.filter(ann => {
            if (!activeRole) return false;
            return ann.targetRoles.includes('all') || ann.targetRoles.includes(activeRole);
          }).map(ann => (
            <motion.div
              key={ann.id}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className={`px-4 py-2 text-center text-xs font-bold border-b transition-colors flex items-center justify-center gap-2 ${
                ann.type === 'urgent' ? 'bg-rose-500 text-white border-rose-600' :
                ann.type === 'warning' ? 'bg-amber-500 text-white border-amber-600' :
                ann.type === 'success' ? 'bg-emerald-500 text-white border-emerald-600' :
                'bg-blue-600 text-white border-blue-700'
              }`}
            >
              <Megaphone size={14} className="flex-shrink-0 animate-bounce" />
              <span className="line-clamp-1">{ann.content}</span>
            </motion.div>
          ))}
        </AnimatePresence>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3.5 min-h-[72px] sm:min-h-[84px] md:min-h-[92px] flex items-center justify-between relative z-10 gap-2 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4 group cursor-pointer" onClick={() => { setViewMode(profile?.role || null); setIsMobileMenuOpen(false); }}>
            <motion.div 
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 flex items-center justify-center shrink-0 p-1.5 bg-white rounded-2xl sm:rounded-3xl border-2 border-primary/25 shadow-lg shadow-primary/15 group-hover:border-primary/60 transition-all"
            >
              <LogoIcon size={80} logoUrl={settings?.appLogoUrl} />
            </motion.div>
            <div className="flex flex-col">
              <span className="text-base sm:text-xl md:text-2xl font-black tracking-tight text-slate-900 leading-tight group-hover:text-primary transition-colors">{settings?.appName || 'Ordonnance Direct'}</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[9px] sm:text-[10px] font-black text-primary uppercase tracking-widest bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full inline-flex items-center">
                  {settings?.countryName || 'Burkina Faso'}
                </span>
                {settings?.appTagline && (
                  <span className="hidden md:inline text-[10px] font-bold text-slate-500 max-w-[200px] truncate">
                    • {settings.appTagline}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 md:gap-4">
            {profile?.role === 'super-admin' && (
              <div className="hidden lg:flex items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/80 shadow-inner">
                {(['super-admin', 'admin', 'patient', 'pharmacist', 'delivery'] as const).map((role) => (
                  <button
                    key={role}
                    onClick={() => {
                      setViewMode(role as UserRole);
                      toast.success(`Mode de vue : ${role.toUpperCase()}`);
                    }}
                    className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                      (viewMode === role || (role === 'super-admin' && (viewMode === 'super-admin' || !viewMode)))
                        ? 'bg-gradient-to-r from-primary to-primary-hover text-white shadow-lg shadow-primary/30 scale-105 z-10'
                        : 'text-slate-600 hover:text-primary hover:bg-primary/10'
                    }`}
                  >
                    {role === 'super-admin' ? 'Super Admin' : 
                     role === 'admin' ? 'Administrateur' : 
                     role === 'patient' ? 'Patient' : 
                     role === 'pharmacist' ? 'Pharmacien' : 'Livreur'}
                  </button>
                ))}
              </div>
            )}
            
            {/* Profil Utilisateur */}
            {profile && (
              <div 
                className="flex items-center gap-2 sm:gap-3 bg-white hover:bg-primary/5 p-1.5 sm:p-2 pr-2.5 sm:pr-4 rounded-2xl border border-slate-200/90 hover:border-primary/30 shadow-sm transition-all cursor-pointer shrink-0" 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
                title="Mon Profil"
              >
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center text-white font-black text-xs sm:text-sm shadow-md shadow-primary/20 shrink-0">
                  {profile?.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div className="flex flex-col text-left leading-tight hidden xs:flex sm:flex">
                  <span className="text-xs sm:text-sm font-extrabold text-slate-900 truncate max-w-[80px] sm:max-w-[140px]">{profile?.name}</span>
                  <span className="text-[9px] sm:text-[10px] font-black text-primary uppercase tracking-wider">
                    {activeRole === 'patient' ? 'Patient' : 
                     activeRole === 'pharmacist' ? 'Pharmacien' : 
                     activeRole === 'delivery' ? 'Livreur' : 
                     activeRole === 'super-admin' ? 'Super Admin' : 'Admin'}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-1 sm:gap-2">
              <NotificationBell userId={profile?.uid || ''} profile={profile} />
              
              <button
                onClick={() => {
                  triggerHaptic();
                  const newMode = !isDarkMode;
                  setIsDarkMode(newMode);
                  toast.success(newMode ? "Mode sombre activé" : "Mode clair activé", { duration: 2000 });
                }}
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center border transition-all ${
                  isDarkMode
                    ? "bg-slate-800 text-amber-400 border-slate-700 hover:bg-slate-700"
                    : "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                }`}
                title={isDarkMode ? "Activer le mode clair" : "Activer le mode sombre"}
              >
                {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              
              {profile && (
                <button
                  onClick={async () => {
                    const currentSound = profile.sound_enabled !== false;
                    try {
                      await updateDoc(doc(db, 'users', profile.uid), {
                        sound_enabled: !currentSound
                      });
                      toast.success(!currentSound ? "Sons activés" : "Sons désactivés", { duration: 3000 });
                      if (!currentSound) {
                        playNotificationSound(settings, true);
                      }
                    } catch (err) {
                      console.error("Error toggling sound:", err);
                    }
                  }}
                  className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center border transition-all ${
                    (profile.sound_enabled !== false)
                      ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                      : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100"
                  }`}
                  title={profile.sound_enabled !== false ? "Couper le son" : "Activer le son"}
                >
                  {profile.sound_enabled !== false ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </button>
              )}
              
              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden w-9 h-9 sm:w-10 sm:h-10 bg-slate-50 text-slate-600 rounded-xl flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-all border border-slate-200"
              >
                {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>

              {/* Bouton Déconnexion (Agrandie & Visible partout) */}
              <button 
                onClick={handleLogout}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm shadow-md shadow-rose-500/25 transition-all shrink-0 border border-rose-500"
                title="Déconnexion"
              >
                <LogOut size={18} className="sm:w-5 sm:h-5 shrink-0" />
                <span className="font-black text-xs sm:text-sm">Déconnexion</span>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu expanded */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-white border-b border-slate-100 overflow-hidden"
            >
              <div className="p-4 space-y-4">
                <div className="flex items-center gap-3 p-3.5 bg-primary/5 rounded-2xl border border-primary/15">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center text-white text-lg font-black shadow-md shadow-primary/20">
                    {profile?.name?.charAt(0)}
                  </div>
                  <div>
                    <p className="font-black text-slate-900 leading-none">{profile?.name}</p>
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest mt-1">
                      {activeRole === 'patient' ? 'Patient' : 
                       activeRole === 'pharmacist' ? 'Pharmacien' : 
                       activeRole === 'delivery' ? 'Livreur' : 'Administrateur'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {(profile?.role === 'super-admin' || isSuperAdminEmail(user?.email)) && (
                    <div className="space-y-3 mb-4 bg-slate-900/5 p-4 rounded-3xl border border-slate-900/10">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Mode de vue Super Admin</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(['super-admin', 'admin', 'patient', 'pharmacist', 'delivery'] as const).map((role) => (
                          <button
                            key={role}
                            onClick={() => { 
                              setViewMode(role as UserRole); 
                              setIsMobileMenuOpen(false); 
                              toast.success(`Mode : ${role.toUpperCase()}`);
                            }}
                            className={`flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                              (viewMode === role || (role === 'super-admin' && (viewMode === 'super-admin' || !viewMode)))
                                ? 'bg-gradient-to-r from-primary to-primary-hover text-white border-primary shadow-lg shadow-primary/25' 
                                : 'bg-white text-slate-600 border-slate-200 shadow-sm'
                            }`}
                          >
                            {role === 'super-admin' ? 'Super Admin' : 
                             role === 'admin' ? 'Admin' : 
                             role === 'patient' ? 'Patient' : 
                             role === 'pharmacist' ? 'Pharmacie' : 'Livreur'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={() => { setShowShowcase(true); setIsMobileMenuOpen(false); }}
                    className="w-full flex items-center gap-3 p-4 bg-primary/10 text-primary rounded-2xl font-bold text-xs shadow-sm border border-primary/20 hover:bg-primary/20 transition-all"
                  >
                    <Sparkles size={18} className="text-primary" /> Site Vitrine & Présentation
                  </button>

                  <button 
                    onClick={() => { setLegalTab('cgu'); setShowLegal(true); setIsMobileMenuOpen(false); }}
                    className="w-full flex items-center gap-3 p-4 bg-slate-50 text-slate-700 rounded-2xl font-bold text-xs shadow-sm border border-slate-200/80 hover:bg-slate-100 transition-all"
                  >
                    <FileText size={18} className="text-slate-600" /> CGU & Confidentialité
                  </button>

                  {settings?.supportChatEnabled !== false && (
                    <button 
                      onClick={() => { setShowSupportChat(true); setIsMobileMenuOpen(false); }}
                      className="w-full flex items-center gap-3 p-4 bg-secondary/10 text-secondary rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-sm border border-secondary/20 hover:bg-secondary/20 transition-all"
                    >
                      <MessageSquare size={18} /> Chat de Support
                    </button>
                  )}

                  <button 
                    onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }}
                    className="w-full flex items-center gap-3 p-4 bg-rose-50 text-rose-600 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-sm border border-rose-100 hover:bg-rose-100 transition-all"
                  >
                    <LogOut size={18} /> Se déconnecter
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-0 relative z-10 gpu-accelerated overflow-y-auto min-h-0 md:overflow-visible md:h-auto">
        {(activeRole === 'patient') && (
          <ErrorBoundary>
            <PatientDashboard 
              profile={effectiveProfile!} 
              settings={settings} 
              location={location} 
              cities={cities} 
              rotation={rotation} 
              onDeletePrescription={handleDeletePrescription}
            />
          </ErrorBoundary>
        )}
        {(activeRole === 'pharmacist') && (
          <ErrorBoundary>
            <PharmacistDashboard profile={effectiveProfile!} settings={settings} cities={cities} rotation={rotation} />
          </ErrorBoundary>
        )}
        {(activeRole === 'delivery') && (
          <ErrorBoundary>
            <DeliveryDashboard profile={effectiveProfile!} settings={settings} cities={cities} />
          </ErrorBoundary>
        )}
        {(activeRole === 'admin' || activeRole === 'super-admin') && (
          <ErrorBoundary>
          <Suspense fallback={<div className="flex items-center justify-center p-12 text-slate-400 font-medium">Chargement du tableau de bord...</div>}>
            <AdminDashboard profile={effectiveProfile!} settings={settings} />
          </Suspense>
          </ErrorBoundary>
        )}
        {!activeRole && (
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
            <div className="w-24 h-24 bg-rose-50 rounded-3xl flex items-center justify-center text-rose-500 shadow-xl shadow-rose-200/20">
              <AlertCircle size={48} />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-900">Accès restreint</h2>
              <p className="text-slate-500 max-w-sm mx-auto">
                Votre compte n'est pas encore associé à un rôle. 
                Veuillez contacter l'administrateur ou vous déconnecter.
              </p>
            </div>
            <button 
              onClick={handleLogout}
              className="px-8 py-3 bg-rose-600 text-white rounded-2xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-200"
            >
              Se déconnecter
            </button>
          </div>
        )}

        <footer className="max-w-7xl w-full mx-auto px-4 py-8 border-t border-slate-200 mt-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center p-1 border border-slate-200 shadow-sm">
                  <LogoIcon size={48} logoUrl={settings?.appLogoUrl} />
                </div>
                <div className="flex flex-col">
                  <span className="font-extrabold text-lg text-slate-900 leading-tight">{settings?.appName || 'Ordonnance Direct'}</span>
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{settings?.countryName || 'Burkina Faso'}</span>
                </div>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">
                {settings?.appTagline || "La première plateforme de télé-exécution d'ordonnances."}
              </p>
            </div>
            <div>
              <h5 className="font-bold mb-4 text-slate-900">Information & Services</h5>
              <ul className="space-y-2.5 text-sm text-slate-600">
                <li>
                  <button 
                    onClick={() => setShowShowcase(true)} 
                    className="flex items-center gap-2 text-emerald-700 font-extrabold hover:text-emerald-800 transition-colors bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100"
                  >
                    <Sparkles size={16} className="text-emerald-600" />
                    <span>Site Vitrine & Présentation</span>
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => { setLegalTab('cgu'); setShowLegal(true); }} 
                    className="flex items-center gap-2 text-slate-700 font-bold hover:text-emerald-600 transition-colors bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 mt-1"
                  >
                    <FileText size={16} className="text-slate-600" />
                    <span>CGU, Confidentialité & Législation</span>
                  </button>
                </li>
                <li><button onClick={() => setInfoPage('how_it_works')} className="hover:text-primary transition-colors text-left pt-1 block">Comment ça marche ?</button></li>
                <li><button onClick={() => setInfoPage('pharmacies')} className="hover:text-primary transition-colors text-left block">Pharmacies partenaires</button></li>
                <li><button onClick={() => setInfoPage('delivery')} className="hover:text-primary transition-colors text-left block">Devenir livreur</button></li>
                <li><button onClick={() => setInfoPage('contact')} className="hover:text-primary transition-colors text-left block">Contactez-nous</button></li>
              </ul>
            </div>
            <div>
              <h5 className="font-bold mb-4 text-slate-900">Urgence</h5>
              <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 shadow-xs">
                <p className="text-xs text-rose-600 font-bold uppercase mb-2">SOS Santé Burkina</p>
                <a href="tel:112" className="text-2xl font-black text-rose-700">112 / 17 / 18</a>
              </div>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs text-slate-400">© 2026 {settings?.appName || 'Ordonnance Direct'} par NME TECHNOLOGIE Group. Tous droits réservés.</p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 font-medium">
              <button onClick={() => setShowShowcase(true)} className="text-emerald-700 font-bold hover:underline flex items-center gap-1">
                <Sparkles size={12} /> Vitrine
              </button>
              <span className="text-slate-300">•</span>
              <button onClick={() => { setLegalTab('cgu'); setShowLegal(true); }} className="hover:text-slate-900 transition-colors">
                CGU
              </button>
              <span className="text-slate-300">•</span>
              <button onClick={() => { setLegalTab('privacy'); setShowLegal(true); }} className="hover:text-slate-900 transition-colors">
                Confidentialité
              </button>
              <span className="text-slate-300">•</span>
              <button onClick={() => { setLegalTab('mentions'); setShowLegal(true); }} className="hover:text-slate-900 transition-colors">
                Mentions légales
              </button>
              {(isSuperAdminEmail(user?.email) || profile?.role === 'admin') && (
                <>
                  <span className="text-slate-300">•</span>
                  <button onClick={() => setShowResetConfirm(true)} className="text-rose-500 hover:text-rose-700 font-bold">
                    Réinitialiser (Test)
                  </button>
                </>
              )}
            </div>
          </div>
        </footer>
      </main>

      {/* Delete Confirmation Modal */}
      <>
        {prescriptionToDelete && createPortal(
          <div className="fixed inset-0 bg-slate-900/75 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2rem] shadow-2xl max-w-sm w-full p-6 text-center"
            >
              <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold mb-2">Supprimer l'ordonnance ?</h3>
              <p className="text-sm text-slate-500 mb-6 px-4">
                Êtes-vous sûr de vouloir supprimer cette ordonnance et ses demandes de devis ? Cette action est irréversible.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setPrescriptionToDelete(null)}
                  disabled={isDeletingPrescription}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold"
                >
                  Annuler
                </button>
                <button 
                  onClick={confirmDeletePrescription}
                  disabled={isDeletingPrescription}
                  className="flex-1 py-3 bg-rose-500 text-white rounded-xl font-bold flex items-center justify-center gap-2"
                >
                  {isDeletingPrescription ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Supprimer"}
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </>

      {/* Support Chat FAB */}
      {settings?.supportChatEnabled !== false && (
        <>
          <button 
            onClick={() => setShowSupportChat(true)}
            className="fixed md:bottom-6 bottom-28 right-4 md:right-6 w-14 h-14 md:w-16 md:h-16 bg-primary text-white rounded-full shadow-2xl shadow-primary/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-[150]"
          >
            <MessageCircle size={24} className="md:w-7 md:h-7" />
            {supportChatMeta?.unreadUserCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] md:text-xs font-bold w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center border-2 border-white animate-bounce">
                {supportChatMeta.unreadUserCount}
              </span>
            )}
          </button>
          
          <AnimatePresence>
            {showSupportChat && (
              <motion.div 
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                className="fixed md:bottom-28 bottom-[130px] right-4 md:right-6 w-[calc(100vw-32px)] md:w-80 h-[450px] max-h-[60vh] bg-white rounded-[2rem] shadow-2xl shadow-slate-200/50 border border-slate-100 z-[200] overflow-hidden flex flex-col"
              >
                <div className="bg-primary p-5 md:p-6 text-white relative">
                  <button 
                    onClick={() => setShowSupportChat(false)}
                    className="absolute top-4 right-4 w-8 h-8 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-all"
                  >
                    <X size={16} />
                  </button>
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
                    <MessageCircle size={24} />
                  </div>
                  <h3 className="font-bold text-lg">Support Client</h3>
                  <p className="text-white/80 text-xs">Nous répondons généralement en quelques minutes.</p>
                  {supportChatMeta?.status === 'suspended' && (
                    <div className="mt-2 bg-rose-500/20 text-rose-100 text-xs px-2 py-1 rounded-lg inline-block">
                      Chat suspendu
                    </div>
                  )}
                </div>
                <div className="flex-1 bg-slate-50 p-6 flex flex-col gap-4 overflow-y-auto">
                  <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-100 text-sm text-slate-600 max-w-[85%]">
                    Bonjour ! Comment pouvons-nous vous aider aujourd'hui ?
                  </div>
                  {supportMessages.map((msg) => (
                    <div 
                      key={msg.id} 
                      className={`p-4 rounded-2xl text-sm max-w-[85%] shadow-sm border ${
                        msg.isAdmin 
                          ? 'bg-white rounded-tl-none border-slate-100 text-slate-600 self-start' 
                          : 'bg-primary text-white rounded-tr-none border-primary/10 self-end'
                      }`}
                    >
                      {msg.text}
                    </div>
                  ))}
                </div>
                <div className="p-4 bg-white border-t border-slate-100">
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendSupportMessage();
                    }}
                    className="relative"
                  >
                    <input 
                      type="text" 
                      value={newSupportMessage}
                      onChange={(e) => setNewSupportMessage(e.target.value)}
                      placeholder={supportChatMeta?.status === 'suspended' ? "Chat suspendu" : "Écrivez votre message..."}
                      disabled={supportChatMeta?.status === 'suspended'}
                      className="w-full bg-slate-50 border-none rounded-2xl py-3 pl-4 pr-12 text-sm focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50"
                    />
                    <button 
                      type="submit"
                      disabled={supportChatMeta?.status === 'suspended'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-primary text-white rounded-xl flex items-center justify-center hover:bg-primary-dark transition-all disabled:opacity-50"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </form>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}



      {/* Info Pages Modal */}
      <>
        {infoPage && createPortal(
          <div className="fixed inset-0 bg-slate-900/75 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full p-8 relative overflow-hidden"
            >
              <button 
                onClick={() => setInfoPage(null)}
                className="absolute top-6 right-6 w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                <X size={20} />
              </button>
              
              {infoPage === 'how_it_works' && (
                <div>
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6"><Info size={28} /></div>
                  <h3 className="text-2xl font-black text-slate-900 mb-6">Comment ça marche ?</h3>
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-slate-100 font-black text-sm flex items-center justify-center shrink-0">1</div>
                      <p className="text-slate-600"><strong className="text-slate-900">Prenez une photo.</strong> Photographiez votre ordonnance et envoyez-la sur notre plateforme.</p>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-slate-100 font-black text-sm flex items-center justify-center shrink-0">2</div>
                      <p className="text-slate-600"><strong className="text-slate-900">Recevez des devis.</strong> Les pharmacies partenaires consultent votre demande et vous proposent le meilleur prix.</p>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-slate-100 font-black text-sm flex items-center justify-center shrink-0">3</div>
                      <p className="text-slate-600"><strong className="text-slate-900">Payez en ligne.</strong> Optez pour le devis de votre choix et payez avec Orange Money, Moov, Telecel ou Coris Money.</p>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-slate-100 font-black text-sm flex items-center justify-center shrink-0">4</div>
                      <p className="text-slate-600"><strong className="text-slate-900">Faites-vous livrer.</strong> Recevez vos médicaments à domicile, de jour comme de nuit.</p>
                    </div>
                  </div>
                </div>
              )}

              {infoPage === 'pharmacies' && (
                <div>
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6"><ShieldCheck size={28} /></div>
                  <h3 className="text-2xl font-black text-slate-900 mb-4">Pharmacies partenaires</h3>
                  <p className="text-slate-600 leading-relaxed mb-4">
                    Notre réseau s'appuie exclusivement sur des <strong>pharmacies agréées et physiques</strong> situées au Burkina Faso. 
                  </p>
                  <p className="text-slate-600 leading-relaxed">
                    Afin d'assurer votre sécurité sanitaire, chaque pharmacie partenaire est vérifiée avec rigueur avant de pouvoir vous soumettre le moindre devis. Vous bénéficiez de médicaments authentiques avec la même expertise pharmaceutique qu'en officine.
                  </p>
                </div>
              )}

              {infoPage === 'delivery' && (
                <div>
                  <div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-2xl flex items-center justify-center mb-6"><Truck size={28} /></div>
                  <h3 className="text-2xl font-black text-slate-900 mb-4">Devenir Livreur</h3>
                  <p className="text-slate-600 leading-relaxed mb-6">
                    Rejoignez la flotte Ordonnance Direct et aidez à rendre la santé accessible à tous à tout moment !
                  </p>
                  <ul className="space-y-3 mb-6 text-sm text-slate-600">
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div> Permis de conduire valide</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div> CNI ou document d'identité</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div> Véhicule/Moto en bon état</li>
                  </ul>
                  <button onClick={() => setInfoPage('contact')} className="w-full bg-slate-900 text-white font-bold rounded-xl py-3 hover:bg-slate-800 transition-colors">Nous contacter</button>
                </div>
              )}

              {infoPage === 'contact' && (
                <div>
                  <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mb-6"><Phone size={28} /></div>
                  <h3 className="text-2xl font-black text-slate-900 mb-6">Contactez-nous</h3>
                  <div className="space-y-4">
                     <p className="flex items-center gap-4 text-slate-600"><span className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><Phone size={16}/></span> <strong>+226 72 56 76 06</strong></p>
                     <p className="flex items-center gap-4 text-slate-600"><span className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><Mail size={16}/></span> <strong>nmetechnologiegroup@gmail.com</strong></p>
                     <p className="flex items-center gap-4 text-slate-600"><span className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><MapPin size={16}/></span> <strong>Ouagadougou, Burkina Faso</strong></p>
                  </div>
                </div>
              )}
              
              {infoPage === 'legal' && (
                <div>
                  <h3 className="text-xl font-black text-slate-900 mb-4">Mentions Légales</h3>
                  <div className="text-sm text-slate-500 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    <p><strong>Éditeur du site :</strong> NME TECHNOLOGIE Group</p>
                    <p><strong>Directeur de la publication :</strong> Direction Générale</p>
                    <p><strong>Hébergement :</strong> Les services sont hébergés sur des serveurs sécurisés Google Firebase en stricte conformité avec les lois de protection en vigueur.</p>
                    <p>La plateforme Ordonnance Direct ne remplace pas une consultation médicale. Elle agit en qualité de simple intermédiaire technique de mise en relation de patients avec des professionnels de santé.</p>
                  </div>
                </div>
              )}

              {infoPage === 'privacy' && (
                <div>
                  <h3 className="text-xl font-black text-slate-900 mb-4">Politique de Confidentialité</h3>
                  <div className="text-sm text-slate-500 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    <p>Vos données sont protégées.</p>
                    <p>Les photographies d'ordonnances que vous déposez via la plateforme sont sécurisées et strictement transmises aux pharmacies de notre réseau avec pour unique objectif de vous établir une estimation (devis) tarifaire.</p>
                    <p>Aucune information médicale n'est revendue ou utilisée à des fins de prospection non consentie. Dans le cadre des livraisons, le livreur n'aura accès qu'à votre nom, votre numéro et votre position géographique brute.</p>
                  </div>
                </div>
              )}

            </motion.div>
          </div>,
          document.body
        )}
      </>

      {/* Reset Confirmation Modal */}
      <>
        {showResetConfirm && createPortal(
          <div className="fixed inset-0 bg-slate-900/75 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full p-8 text-center"
            >
              <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center text-rose-500 mx-auto mb-6">
                <Trash2 size={40} />
              </div>
              <h3 className="text-2xl font-bold mb-4">Tout réinitialiser ?</h3>
              <p className="text-slate-500 mb-8">
                Cette action supprimera toutes les ordonnances, les commandes et les profils utilisateurs. 
                <span className="block font-bold text-rose-600 mt-2">Cette action est irréversible.</span>
              </p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleResetData}
                  disabled={isResetting}
                  className="w-full bg-rose-600 text-white py-4 rounded-2xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 flex items-center justify-center gap-2"
                >
                  {isResetting ? "Réinitialisation en cours..." : "Oui, tout supprimer"}
                </button>
                <button 
                  onClick={() => setShowResetConfirm(false)}
                  disabled={isResetting}
                  className="w-full bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                >
                  Annuler
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </>
    </div>
  );
}

function LoginView({ 
  onLogin, 
  isLoggingIn,
  onOpenShowcase,
  onOpenLegal,
  settings
}: { 
  onLogin: () => void, 
  isLoggingIn: boolean,
  onOpenShowcase?: () => void,
  onOpenLegal?: (tab?: 'cgu' | 'privacy' | 'mentions') => void,
  settings?: Settings | null
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Load saved credentials on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem('remembered_email');
    const savedPassword = localStorage.getItem('remembered_password');
    if (savedEmail && savedPassword) {
      setEmail(savedEmail);
      setPassword(savedPassword);
      setRememberMe(true);
    }
  }, []);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    if (isSignup && !name) {
      toast.error("Veuillez saisir votre nom.");
      return;
    }
    setLoading(true);
    try {
      if (isSignup) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
        toast.success("Compte créé avec succès !");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        
        // Handle Remember Me
        if (rememberMe) {
          localStorage.setItem('remembered_email', email);
          localStorage.setItem('remembered_password', password);
        } else {
          localStorage.removeItem('remembered_email');
          localStorage.removeItem('remembered_password');
        }
        
        toast.success("Connexion réussie !");
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      let message = "Une erreur est survenue.";
      if (error.code === 'auth/user-not-found') message = "Utilisateur non trouvé.";
      if (error.code === 'auth/wrong-password') message = "Mot de passe incorrect.";
      if (error.code === 'auth/email-already-in-use') message = "Cet email est déjà utilisé.";
      if (error.code === 'auth/weak-password') message = "Le mot de passe est trop faible.";
      if (error.code === 'auth/operation-not-allowed') message = "L'authentification par email n'est pas activée dans Firebase.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      toast.error("Veuillez saisir votre adresse email pour réinitialiser le mot de passe.");
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success("Un email de réinitialisation a été envoyé à votre adresse.");
    } catch (error: any) {
      console.error("Reset password error:", error);
      let message = "Une erreur est survenue.";
      if (error.code === 'auth/user-not-found') message = "Aucun utilisateur trouvé avec cet email.";
      if (error.code === 'auth/invalid-email') message = "Adresse email invalide.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 relative overflow-hidden p-4 sm:p-6">
      {/* Subtle Ambient Light */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/5 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-sky-500/5 rounded-full blur-[120px]"></div>
      </div>
      
      <motion.div 
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="bg-white p-6 sm:p-10 rounded-3xl shadow-sm border border-slate-200/80 max-w-md w-full relative z-10"
      >
        {/* Header with Logo & Brand */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-3 bg-white p-2 border border-slate-200/80 shadow-md">
            <LogoIcon size={64} logoUrl={settings?.appLogoUrl} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {settings?.appName || 'Ordonnance Direct'}
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            {isSignup ? "Créez votre compte en quelques secondes" : (settings?.appTagline || "Plateforme de télétransmission & livraison médicale")}
          </p>
        </div>

        {/* Tab Switcher: Connexion / Inscription */}
        <div className="flex rounded-xl bg-slate-100 p-1 mb-6 border border-slate-200/60">
          <button
            type="button"
            onClick={() => setIsSignup(false)}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              !isSignup 
                ? 'bg-white text-slate-900 shadow-xs' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Se connecter
          </button>
          <button
            type="button"
            onClick={() => setIsSignup(true)}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              isSignup 
                ? 'bg-white text-slate-900 shadow-xs' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Créer un compte
          </button>
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-3.5 mb-5 text-left">
          {isSignup && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nom complet</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all outline-none"
                placeholder="Ex: Ousmane Ouedraogo"
                required={isSignup}
              />
            </div>
          )}
          
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Adresse Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all outline-none"
              placeholder="nom@exemple.com"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">Mot de passe</label>
              {!isSignup && (
                <button 
                  type="button" 
                  onClick={handleResetPassword}
                  className="text-[11px] text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                >
                  Oublié ?
                </button>
              )}
            </div>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all outline-none"
              placeholder="••••••••"
              required
            />
          </div>

          {!isSignup && (
            <div className="pt-0.5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 accent-emerald-600" 
                />
                <span className="text-xs text-slate-600">Se souvenir de moi</span>
              </label>
            </div>
          )}

          <button 
            type="submit"
            disabled={loading || isLoggingIn}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-all shadow-sm active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isSignup ? (
              <>Créer mon compte <ArrowRight size={15} /></>
            ) : (
              <>Se connecter <ArrowRight size={15} /></>
            )}
          </button>
        </form>
        
        {!Capacitor.isNativePlatform() && (
          <>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-[11px]">
                <span className="bg-white px-2.5 text-slate-400 font-medium">ou</span>
              </div>
            </div>

            <button 
              onClick={onLogin}
              disabled={isLoggingIn || loading}
              className="w-full py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-medium text-xs transition-all flex items-center justify-center gap-2.5 active:scale-[0.99] disabled:opacity-50 shadow-2xs"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4" alt="Google" />
              {isLoggingIn ? "Connexion..." : "Continuer avec Google"}
            </button>
          </>
        )}

        {/* Footer Navigation & Legal Links */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-center gap-3 text-[11px] text-slate-500">
          {onOpenShowcase && (
            <>
              <button 
                type="button" 
                onClick={onOpenShowcase} 
                className="hover:text-emerald-600 font-medium transition-colors"
              >
                Présentation
              </button>
              <span>•</span>
            </>
          )}
          <button 
            type="button" 
            onClick={() => onOpenLegal?.('cgu')} 
            className="hover:text-emerald-600 font-medium transition-colors"
          >
            CGU
          </button>
          <span>•</span>
          <button 
            type="button" 
            onClick={() => onOpenLegal?.('privacy')} 
            className="hover:text-emerald-600 font-medium transition-colors"
          >
            Confidentialité
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function RoleSelectionView({ onSelect, isAdmin, settings }: { onSelect: (role: UserRole, extraData: any) => void, isAdmin: boolean, settings?: Settings | null }) {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [formData, setFormData] = useState({
    authNumber: '',
    phone: '',
    address: '',
    pharmacyName: '',
    compensationPhone: '',
    compensationRIB: '',
    guarantorName: '',
    guarantorPhone: '',
    guarantorAddress: ''
  });
  const [deliveryExtra, setDeliveryExtra] = useState({
    idCardFront: '',
    idCardBack: '',
    cguAccepted: false
  });
  const [showCGU, setShowCGU] = useState(false);

  const roles = [
    { 
      role: 'patient' as UserRole, 
      icon: User, 
      label: 'Patient & Famille', 
      desc: 'Transmettre mes ordonnances, comparer les devis d\'officines et me faire livrer rapidement.', 
      badge: 'Particulier',
      color: 'bg-emerald-600 text-white', 
      accent: 'border-emerald-500/30 hover:border-emerald-500' 
    },
    { 
      role: 'pharmacist' as UserRole, 
      icon: Package, 
      label: 'Officine & Pharmacien', 
      desc: 'Réceptionner les ordonnances numériques, éditer des devis certifiés et gérer la dispensation.', 
      badge: 'Professionnel de santé',
      color: 'bg-sky-600 text-white', 
      accent: 'border-sky-500/30 hover:border-sky-500' 
    },
    { 
      role: 'delivery' as UserRole, 
      icon: Truck, 
      label: 'Livreur Santé Agréé', 
      desc: 'Prendre en charge les plis scellés en officine et assurer la livraison sécurisée au domicile.', 
      badge: 'Logistique sécurisée',
      color: 'bg-amber-600 text-white', 
      accent: 'border-amber-500/30 hover:border-amber-500' 
    },
  ];

  if (isAdmin) {
    roles.push({ role: 'admin' as UserRole, icon: ShieldCheck, label: 'Administration', desc: 'Pilotage de la plateforme, gestion des officines et modération.', badge: 'Supervision', color: 'bg-slate-800 text-white', accent: 'border-slate-400' });
    roles.push({ role: 'super-admin' as UserRole, icon: ShieldCheck, label: 'Super Admin', desc: 'Accès intégral à l\'infrastructure et aux paramètres système.', badge: 'Accès Total', color: 'bg-purple-800 text-white', accent: 'border-purple-400' });
  }

  const handleConfirm = () => {
    // Super Admin bypasses validation
    if (isAdmin) {
      if (selectedRole === 'delivery') {
        onSelect(selectedRole!, {
          authorizationNumber: formData.authNumber || 'SUPER-ADMIN',
          phone: formData.phone || '00000000',
          address: formData.address || 'SUPER-ADMIN-HQ',
          pharmacyName: formData.pharmacyName || 'Pharmacie Super Admin',
          compensationPhone: formData.compensationPhone || '',
          compensationRIB: formData.compensationRIB || '',
          idCardFront: deliveryExtra.idCardFront || '',
          idCardBack: deliveryExtra.idCardBack || '',
          guarantorInfo: {
            name: formData.guarantorName || '',
            phone: formData.guarantorPhone || '',
            address: formData.guarantorAddress || ''
          }
        });
        return;
      }
      onSelect(selectedRole!, {
        authorizationNumber: formData.authNumber || 'SUPER-ADMIN',
        phone: formData.phone || '00000000',
        address: formData.address || 'SUPER-ADMIN-HQ',
        pharmacyName: formData.pharmacyName || 'Pharmacie Super Admin'
      });
      return;
    }

    if (selectedRole === 'pharmacist') {
      if (!formData.authNumber || !formData.pharmacyName || !formData.address) {
        toast.error("Veuillez remplir tous les champs obligatoires.");
        return;
      }
    } else if (selectedRole === 'patient') {
      if (!formData.phone || !formData.address) {
        toast.error("Veuillez remplir tous les champs obligatoires.");
        return;
      }
    } else if (selectedRole === 'delivery') {
      if (!formData.phone || !formData.address) {
        toast.error("Veuillez remplir tous les champs obligatoires.");
        return;
      }
      if (!deliveryExtra.idCardFront || !deliveryExtra.idCardBack) {
        toast.error("Veuillez fournir le recto et le verso de votre pièce d'identité.");
        return;
      }
      if (!deliveryExtra.cguAccepted) {
        toast.error("Vous devez accepter les conditions d'utilisation du service.");
        return;
      }
    }
    
    if (selectedRole) {
      onSelect(selectedRole, {
        authorizationNumber: formData.authNumber,
        phone: formData.phone,
        address: formData.address,
        pharmacyName: formData.pharmacyName,
        compensationPhone: formData.compensationPhone,
        compensationRIB: formData.compensationRIB,
        ...(selectedRole === 'delivery' && {
          idCardFront: deliveryExtra.idCardFront,
          idCardBack: deliveryExtra.idCardBack,
          cguAccepted: deliveryExtra.cguAccepted,
          cguAcceptedAt: new Date().toISOString(),
          guarantorInfo: {
            name: formData.guarantorName,
            phone: formData.guarantorPhone,
            address: formData.guarantorAddress
          }
        })
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background decoration preserved */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-secondary/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl"></div>

      <>
        {showCGU && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="text-xl font-black text-slate-900">Conditions d'Utilisation (Livreur)</h3>
                <button onClick={() => setShowCGU(false)} className="text-slate-400 hover:text-rose-500 transition-colors">
                  <X size={24} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto prose prose-sm text-slate-600">
                <p><strong>1. Acceptation des conditions</strong><br/>En vous inscrivant comme livreur sur Ordonnance Direct, vous acceptez d'être lié par les présentes conditions générales.</p>
                <p><strong>2. Pièce d'identité et Vérification</strong><br/>Vous devez fournir une copie numérisée valide du recto et du verso de votre pièce nationale d'identité (CNI ou Passeport). Toute fausse déclaration entraînera la suspension immédiate du compte.</p>
                <p><strong>3. Responsabilité de Livraison</strong><br/>En tant que livreur, vous êtes responsable de la sécurité et de la confidentialité des médicaments et ordonnances qui vous sont confiés. Toute altération, perte ou vol doit être immédiatement signalé.</p>
                <p><strong>4. Confidentialité des Patients</strong><br/>Vous traiterez toute information (adresse, médicaments, nom du patient) avec une stricte confidentialité selon la loi sur la protection des données personnelles.</p>
                <p><strong>5. Paiements et Commissions</strong><br/>Les montants pour chaque livraison sont crédités sur le portefeuille intégré de votre compte une fois la livraison validée par un code secret au moment du dépôt. Ordonnance Direct prélève une commission transparente sur les frais de livraison.</p>
                <p><strong>6. Sécurisation</strong><br/>Les retraits doivent obligatoirement être validés physiquement par l'application pour déclencher les transactions. Vous vous engagez à respecter ce flux rigoureusement.</p>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100">
                <button 
                  onClick={() => setShowCGU(false)}
                  className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-all"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </>

      <div className="max-w-5xl w-full relative z-10 py-8">
        <motion.div 
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl border border-slate-100 p-2">
            <LogoIcon size={88} logoUrl={settings?.appLogoUrl} />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold uppercase tracking-wider mb-3">
            Configuration initiale du compte
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Bienvenue sur {settings?.appName || 'Ordonnance Direct'}
          </h2>
          <p className="text-slate-500 max-w-lg mx-auto font-normal text-base mt-2">
            Sélectionnez votre profil d'utilisation pour accéder à votre interface dédiée au {settings?.countryName || 'Burkina Faso'}.
          </p>
        </motion.div>

        {!selectedRole ? (
          <div className={`grid grid-cols-1 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-6`}>
            {roles.map((item, i) => (
              <motion.button
                key={item.role}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                onClick={() => setSelectedRole(item.role)}
                className={`group relative bg-white p-7 rounded-3xl text-left border-2 transition-all duration-300 shadow-sm hover:shadow-xl hover:-translate-y-1 flex flex-col justify-between ${item.accent}`}
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className={`w-14 h-14 rounded-2xl ${item.color} flex items-center justify-center shadow-md group-hover:scale-105 transition-transform duration-300`}>
                      <item.icon size={26} />
                    </div>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 uppercase tracking-wider">
                      {item.badge}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">{item.label}</h3>
                  <p className="text-slate-500 leading-relaxed text-sm">{item.desc}</p>
                </div>
                
                <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm mt-6 pt-4 border-t border-slate-100 group-hover:gap-3 transition-all">
                  Continuer comme {item.label} <ChevronRight size={16} />
                </div>
              </motion.button>
            ))}
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md mx-auto bg-white p-6 sm:p-8 rounded-3xl shadow-xl border border-slate-100"
          >
            <button 
              onClick={() => setSelectedRole(null)}
              className="text-slate-400 hover:text-slate-600 mb-5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-colors"
            >
              <X size={14} /> Retour
            </button>
            
            <h3 className="text-xl font-black mb-6 text-slate-900">
              {selectedRole === 'pharmacist' ? "Détails de l'officine" : "Confirmation"}
            </h3>
            
            {(selectedRole === 'pharmacist' || selectedRole === 'delivery') && (
              <div className="bg-slate-100/50 p-4 rounded-2xl border border-slate-200 mb-6 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="text-primary" size={16} />
                  <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Paiement (Optionnel)</h4>
                </div>
                <div className="space-y-3">
                  <input 
                    type="tel" 
                    value={formData.compensationPhone}
                    onChange={(e) => setFormData({...formData, compensationPhone: e.target.value})}
                    className="w-full bg-white border border-slate-100 rounded-xl px-4 py-3 text-sm text-slate-900 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                    placeholder="Téléphone de paiement (OM/Moov)"
                  />
                  <input 
                    type="text" 
                    value={formData.compensationRIB}
                    onChange={(e) => setFormData({...formData, compensationRIB: e.target.value})}
                    className="w-full bg-white border border-slate-100 rounded-xl px-4 py-3 text-sm text-slate-900 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                    placeholder="RIB Bancaire"
                  />
                </div>
              </div>
            )}

            {selectedRole === 'pharmacist' && (
              <div className="space-y-4 mb-6">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nom de la pharmacie *</label>
                  <input 
                    type="text" 
                    value={formData.pharmacyName}
                    onChange={(e) => setFormData({...formData, pharmacyName: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm text-slate-900 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                    placeholder="Ex: Pharmacie de la Paix"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Adresse de la pharmacie *</label>
                  <input 
                    type="text" 
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm text-slate-900 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                    placeholder="Ex: Ouagadougou, Secteur 10"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Numéro d'autorisation *</label>
                  <input 
                    type="text" 
                    value={formData.authNumber}
                    onChange={(e) => setFormData({...formData, authNumber: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm text-slate-900 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                    placeholder="Ex: AUTH-2024-XXXX"
                    required
                  />
                  <p className="text-[9px] text-slate-400 ml-1 italic">Vérifié par nos administrateurs.</p>
                </div>
              </div>
            )}

            {(selectedRole === 'patient' || selectedRole === 'delivery') && (
              <div className="space-y-4 mb-6">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Numéro de téléphone *</label>
                  <input 
                    type="tel" 
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm text-slate-900 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                    placeholder="Ex: +226 70 00 00 00"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Adresse complète *</label>
                  <input 
                    type="text" 
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm text-slate-900 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                    placeholder="Ex: Ouagadougou, Secteur 10"
                    required
                  />
                </div>
              </div>
            )}

            {selectedRole === 'delivery' && (
              <div className="space-y-5 mb-6 text-left">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="font-bold text-xs text-slate-900">Dossier Livreur (Optionnel pour l'instant)</h4>
                  <span className="text-[9px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full uppercase tracking-widest">Vérification</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">CNI Recto</label>
                    <div className="relative">
                      {deliveryExtra.idCardFront ? (
                        <div className="relative w-full aspect-[3/2] rounded-xl overflow-hidden border-2 border-emerald-500 shadow-sm">
                          <img src={deliveryExtra.idCardFront} className="w-full h-full object-cover" />
                          <button onClick={() => setDeliveryExtra({...deliveryExtra, idCardFront: ''})} className="absolute top-1 right-1 w-6 h-6 bg-rose-500/90 hover:bg-rose-500 text-white rounded-lg flex items-center justify-center shadow-lg transition-colors"><X size={12} /></button>
                        </div>
                      ) : (
                        <label className="w-full aspect-[3/2] bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:border-primary hover:text-primary transition-all group">
                          <Camera size={20} className="group-hover:scale-110 transition-transform mb-1" />
                          <span className="text-[8px] font-bold uppercase tracking-widest text-center px-1">Img Recto</span>
                          <input 
                            type="file" accept="image/*" capture="environment" className="hidden" 
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const base64 = await compressImage(file, RAM_OPTIMIZED_COMPRESSION.maxWidth, RAM_OPTIMIZED_COMPRESSION.maxHeight, RAM_OPTIMIZED_COMPRESSION.quality);
                                setDeliveryExtra({...deliveryExtra, idCardFront: base64});
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">CNI Verso</label>
                    <div className="relative">
                      {deliveryExtra.idCardBack ? (
                        <div className="relative w-full aspect-[3/2] rounded-xl overflow-hidden border-2 border-emerald-500 shadow-sm">
                          <img src={deliveryExtra.idCardBack} className="w-full h-full object-cover" />
                          <button onClick={() => setDeliveryExtra({...deliveryExtra, idCardBack: ''})} className="absolute top-1 right-1 w-6 h-6 bg-rose-500/90 hover:bg-rose-500 text-white rounded-lg flex items-center justify-center shadow-lg transition-colors"><X size={12} /></button>
                        </div>
                      ) : (
                        <label className="w-full aspect-[3/2] bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:border-primary hover:text-primary transition-all group">
                          <Camera size={20} className="group-hover:scale-110 transition-transform mb-1" />
                          <span className="text-[8px] font-bold uppercase tracking-widest text-center px-1">Img Verso</span>
                          <input 
                            type="file" accept="image/*" capture="environment" className="hidden" 
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const base64 = await compressImage(file, RAM_OPTIMIZED_COMPRESSION.maxWidth, RAM_OPTIMIZED_COMPRESSION.maxHeight, RAM_OPTIMIZED_COMPRESSION.quality);
                                setDeliveryExtra({...deliveryExtra, idCardBack: base64});
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="text-primary" size={16} />
                    <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Informations Garant (Optionnel)</h4>
                  </div>
                  <div className="space-y-3">
                    <input 
                      type="text" 
                      value={formData.guarantorName}
                      onChange={(e) => setFormData({...formData, guarantorName: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm text-slate-900 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                      placeholder="Nom complet du garant"
                    />
                    <input 
                      type="tel" 
                      value={formData.guarantorPhone}
                      onChange={(e) => setFormData({...formData, guarantorPhone: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm text-slate-900 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                      placeholder="Téléphone du garant"
                    />
                    <textarea 
                      value={formData.guarantorAddress}
                      onChange={(e) => setFormData({...formData, guarantorAddress: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm text-slate-900 focus:ring-2 focus:ring-primary/20 transition-all outline-none min-h-[60px]"
                      placeholder="Adresse du garant"
                    />
                  </div>
                </div>

                <div className="bg-amber-50 p-3 rounded-xl border border-amber-100">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="mt-0.5 w-4 h-4 rounded border-amber-300 text-amber-500 focus:ring-amber-500"
                      checked={deliveryExtra.cguAccepted}
                      onChange={(e) => setDeliveryExtra({...deliveryExtra, cguAccepted: e.target.checked})}
                    />
                    <span className="text-xs font-medium text-amber-900 leading-tight">
                      J'accepte les <button type="button" onClick={() => setShowCGU(true)} className="underline font-bold text-amber-700 hover:text-amber-800">C.G.U.</button> de la livraison. *
                    </span>
                  </label>
                </div>
              </div>
            )}
            
            <p className="text-slate-500 mb-6 text-xs leading-relaxed">
              {selectedRole === 'pharmacist' 
                ? "En tant que pharmacien, vous pourrez gérer vos stocks et ordonnances."
                : `Vous avez choisi le profil ${roles.find(r => r.role === selectedRole)?.label}.`}
            </p>
            
            <button 
              onClick={handleConfirm}
              className="w-full py-3.5 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg"
            >
              Confirmer
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function ImageViewerModal({ imageUrl, onClose }: { imageUrl: string, onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 bg-slate-950/95 z-[300] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-white hover:text-slate-300 bg-slate-800/50 rounded-full p-2 z-[310]">
        <X size={24} />
      </button>
      <img src={imageUrl} alt="Prescription Full" className="max-w-[95vw] max-h-[95vh] sm:max-w-full sm:max-h-[90vh] object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body
  );
}

const analyzeWithGemini = async (options: { image?: string, text?: string, prompt: string }) => {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return { success: false, error: "La clé API Gemini n'est pas configurée. Veuillez l'ajouter dans les secrets de Google AI Studio." };
    }
    
    const ai = new GoogleGenAI({ apiKey: key });
    let result;
    
    if (options.image) {
      let base64Data = options.image;
      if (options.image.startsWith("data:")) {
        base64Data = options.image.split(",")[1];
      }
      
      result = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: {
          parts: [
            { text: options.prompt },
            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
          ]
        }
      });
    } else {
      result = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: `${options.prompt} : "${options.text || ''}"`
      });
    }
    
    if (!result.text) {
      throw new Error("Aucune réponse de l'IA.");
    }
    
    return { success: true, text: result.text };
  } catch (error: any) {
    console.error("Gemini Error:", error);
    let msg = error.message || String(error);
    
    // Check for common error patterns
    if (msg.includes("API key not valid") || (error && error.status === 400)) {
      return { 
        success: false, 
        error: "La clé API Gemini configurée est invalide ou corrompue. Assurez-vous d'avoir entré la bonne clé dans les paramètres de l'application (Settings > Secrets)." 
      };
    }
    
    // Handle quota errors
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      return { 
        success: false, 
        error: "Le quota de l'API Gemini est épuisé. Veuillez vérifier vos crédits Google AI Studio." 
      };
    }

    return { success: false, error: `Erreur d'analyse: ${msg}` };
  }
};

const PatientPrescriptionCard = React.memo(({ 
  p, 
  orders, 
  onViewImage, 
  onRequestQuote, 
  onShowPartialSelect,
  onDelete
}: { 
  p: Prescription, 
  orders: Order[], 
  onViewImage: (url: string) => void, 
  onRequestQuote: (p: Prescription, type: 'all' | 'partial') => Promise<void> | void, 
  onShowPartialSelect: (p: Prescription) => void,
  onDelete: (id: string, associatedOrderIds: string[]) => void
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const isCompleted = orders.some(o => o.prescriptionId === p.id && o.status === 'completed');
  if (isCompleted) return null;

  const canDelete = !orders.some(o => o.prescriptionId === p.id && ['paid', 'preparing', 'ready', 'delivering', 'completed'].includes(o.status));

  // Extract medication names
  let medNames: string[] = [];
  try {
    if (p.extractedData) {
      const jsonStr = p.extractedData?.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0];
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        const meds = Array.isArray(parsed) ? parsed : (parsed.prescriptions || parsed.medications || parsed.medicaments || Object.values(parsed).find(v => Array.isArray(v)) || []);
        const displayMeds = p.requestType === 'partial' && p.selectedMedications ? meds.filter((m: any) => p.selectedMedications?.includes(typeof m === 'string' ? m : (m.nom_article || m.name || m.medicament))) : meds;
        medNames = displayMeds.map((m: any) => typeof m === 'string' ? m : (m.nom_article || m.name || m.medicament || 'Inconnu'));
      }
    }
  } catch (e) {
    // fallback
  }

  const displayStatus = p.status as string;

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-900/95 p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm hover:border-emerald-500/30 hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group relative"
    >
      {/* Left: Thumbnail + Core Metadata */}
      <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
        {/* Prescription Thumbnail */}
        <div 
          className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0 cursor-pointer group/img border border-slate-200/60 dark:border-slate-700/60"
          onClick={() => p.imageUrl && onViewImage(p.imageUrl)}
        >
          {p.imageUrl ? (
            <>
              <img src={p.imageUrl} alt="Prescription" className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300" loading="lazy" />
              <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-center justify-center">
                <div className="w-6 h-6 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                  <Search className="text-white" size={12} />
                </div>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
              <Camera size={20} />
              <span className="text-[9px] font-bold mt-0.5 uppercase">Saisie</span>
            </div>
          )}
        </div>
        
        {/* Main Details */}
        <div className="flex-1 min-w-0 space-y-1">
          {/* Header Row: ID + Date + Hospital */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md font-black uppercase tracking-tight">
              #{p.id.slice(-4).toUpperCase()}
            </span>
            <span className="text-[10px] text-slate-400 font-bold">
              {p.createdAt?.toDate ? formatDate(p.createdAt.toDate(), 'dateTime') : 'Récents'}
            </span>
            <span className={`inline-flex items-center text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${
              displayStatus === 'draft' || displayStatus === 'analyzed' ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-500' :
              displayStatus === 'submitted' ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 border border-amber-200/50 dark:border-amber-800/50' :
              displayStatus === 'validated' ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600' :
              displayStatus === 'preparing' ? 'bg-indigo-500 text-white' :
              displayStatus === 'ready' ? 'bg-emerald-500 text-white' :
              displayStatus === 'delivering' ? 'bg-sky-500 text-white' :
              displayStatus === 'completed' ? 'bg-slate-500 text-white' :
              'bg-rose-50 dark:bg-rose-950/50 text-rose-500'
            }`}>
              {getPrescriptionStatusLabel(p.status)}
            </span>
          </div>

          <h4 className="text-sm font-black text-slate-900 dark:text-white truncate">
            {p.hospitalLocation || "Ordonnance médicale externe"}
          </h4>

          {/* Medications Horizontal Pills */}
          {medNames.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mr-1">Médicaments :</span>
              {medNames.slice(0, 4).map((name, i) => (
                <span key={i} className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/40 text-[10px] px-2 py-0.5 rounded-md font-semibold truncate max-w-[150px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                  <span className="truncate">{name}</span>
                </span>
              ))}
              {medNames.length > 4 && (
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-md">
                  +{medNames.length - 4} autres
                </span>
              )}
            </div>
          ) : !p.extractedData && (p.status === 'draft' || p.status === 'analyzed') ? (
            <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
              <span>Analyse et extraction automatique en cours...</span>
            </div>
          ) : null}

          {/* Rejection notice */}
          {(p.status === 'rejected' || p.status === 'rejected_by_limit') && (
            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/60 p-2 rounded-xl flex items-center gap-2 mt-1">
              <AlertCircle className="text-rose-500 shrink-0" size={14} />
              <p className="text-[11px] font-bold text-rose-700 dark:text-rose-300 truncate">
                Rejet : {p.rejectionReason || "Motif non spécifié."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right: Actions in line */}
      <div className="flex items-center gap-2 self-stretch md:self-center shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
        {(p.status === 'draft' || p.status === 'analyzed') && p.extractedData && (
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button 
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                setIsLoading(true);
                try { await onRequestQuote(p, 'all'); } finally { setIsLoading(false); }
              }} 
              disabled={isLoading}
              className="flex-1 md:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-tight transition-all shadow-sm hover:shadow-emerald-600/20 active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isLoading ? <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div> : <CheckCircle size={14} />}
              Complet
            </button>
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onShowPartialSelect(p);
              }} 
              disabled={isLoading}
              className="flex-1 md:flex-initial bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-tight transition-all active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Plus size={14} />
              Partiel
            </button>
          </div>
        )}

        {canDelete && (
          <button 
            type="button"
            onClick={(e) => { 
              e.stopPropagation(); 
              const associatedOrderIds = orders.filter(o => o.prescriptionId === p.id).map(o => o.id);
              onDelete(p.id, associatedOrderIds); 
            }}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/50 flex items-center justify-center transition-all shrink-0"
            title="Supprimer l'ordonnance"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </motion.div>
  );
});

const PatientOrderCard = React.memo(({ 
  o, 
  settings, 
  profile, 
  onChat, 
  onViewImage, 
  onApproveQuote, 
  onSelectDeliveryMethod, 
  onShowMap,
  compact = false
}: { 
  o: Order, 
  settings: Settings | null, 
  profile: UserProfile, 
  onChat: (id: string) => void, 
  onViewImage: (url: string) => void, 
  onApproveQuote: (o: Order) => void, 
  onSelectDeliveryMethod: (id: string, method: 'pickup' | 'delivery') => void, 
  onShowMap: (o: Order) => void,
  compact?: boolean
}) => {
  const [availableDrivers, setAvailableDrivers] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (o.status === 'pending_quote' && !o.deliveryMethod) {
      const fetchDrivers = async () => {
        try {
          const q = query(collection(db, 'users'), where('role', '==', 'delivery'), where('status', '==', 'active'));
          const snap = await getDocs(q);
          setAvailableDrivers(snap.size);
        } catch (e) {
          console.error(e);
        }
      };
      fetchDrivers();
    }
  }, [o.status, o.deliveryMethod]);

  const stepsArr = ['submitted', 'validated', 'pending_quote', 'pending_payment', 'verifying_payment', 'paid', 'preparing', 'ready', 'delivering', 'completed'];
  const currentStepIdx = stepsArr.indexOf(o.status);

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/40 hover:shadow-sm transition-all text-slate-800 dark:text-slate-100 ${
        compact ? 'rounded-xl p-2.5 sm:p-3 shadow-2xs' : 'rounded-2xl p-3 sm:p-4 shadow-xs'
      }`}
    >
      {compact ? (
        /* TRULY COMPACT LAYOUT FOR HISTORY/LEDGER */
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              {o.prescriptionImageUrl ? (
                <div 
                  onClick={() => onViewImage(o.prescriptionImageUrl!)}
                  className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200/60 dark:border-slate-700 shrink-0 cursor-pointer hover:scale-105 transition-transform"
                  title="Voir l'ordonnance"
                >
                  <img src={o.prescriptionImageUrl} className="w-full h-full object-cover" loading="lazy" />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-500 font-bold text-[10px] shrink-0">
                  #{o.id.slice(-2).toUpperCase()}
                </div>
              )}

              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-extrabold text-slate-900 dark:text-white text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                    #{o.id.slice(-6).toUpperCase()}
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold">{formatDate(o.createdAt, 'dateTime')}</span>
                </div>
                <p className="font-bold text-slate-700 dark:text-slate-300 truncate text-[11px] flex items-center gap-1">
                  <Building2 size={11} className="text-slate-400 shrink-0" />
                  <span className="truncate">{o.pharmacyName || 'Pharmacie Partenaire'}</span>
                </p>
                {o.items && o.items.length > 0 && (
                  <p className="text-[10px] text-slate-400 truncate max-w-[180px] sm:max-w-md">
                    {o.items.map(item => `${item.name} x${item.quantity}`).join(', ')}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right">
                <span className="font-black text-emerald-600 dark:text-emerald-400 text-xs block">
                  {(o.totalAmount || 0).toLocaleString()} F
                </span>
                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider ${
                  o.status === 'completed' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {getOrderStatusLabel(o.status)}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button 
                  onClick={() => onChat(o.id)}
                  className="relative p-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-emerald-600 dark:text-slate-400 rounded-lg transition-colors border border-slate-200/50 dark:border-slate-700"
                  title="Chat"
                >
                  <MessageCircle size={13} />
                  {o.unreadCounts?.[profile?.role || 'patient'] > 0 && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-500 text-white text-[8px] font-bold flex items-center justify-center rounded-full">
                      {o.unreadCounts[profile?.role || 'patient']}
                    </span>
                  )}
                </button>

                {o.status === 'completed' && (
                  <button 
                    onClick={() => generateInvoice(o, profile)}
                    className="p-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg transition-colors border border-slate-200/50 dark:border-slate-700"
                    title="Facture PDF"
                  >
                    <FileText size={13} />
                  </button>
                )}

                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="p-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg border border-slate-200/50 dark:border-slate-700"
                  title="Détails"
                >
                  <ChevronDown size={12} className={`transition-transform duration-200 ${showDetails ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {showDetails && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs"
            >
              {(o.deliveryPhoto || o.deliverySignature) && (
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-500">Preuves :</span>
                  {o.deliveryPhoto && (
                    <button onClick={() => onViewImage(o.deliveryPhoto!)} className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200">
                      <img src={o.deliveryPhoto} className="w-full h-full object-cover" />
                    </button>
                  )}
                  {o.deliverySignature && (
                    <button onClick={() => onViewImage(o.deliverySignature!)} className="w-10 h-10 rounded-lg border border-slate-200 p-0.5 bg-white">
                      <img src={o.deliverySignature} className="w-full h-full object-contain" />
                    </button>
                  )}
                </div>
              )}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Historique des étapes</p>
                <StatusTrace history={o.history} />
              </div>
            </motion.div>
          )}
        </div>
      ) : (
        /* DETAILED LAYOUT FOR ACTIVE ORDERS - ALREADY MORE SLICK & COMPACT */
        <>
          {/* Sleek Header Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="text-[10px] font-black bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-2 py-0.5 rounded-lg tracking-wider shadow-xs">
                #{o.id.slice(-6).toUpperCase()}
              </span>
              <span className="text-[9px] text-slate-400 font-bold">
                {formatDate(o.createdAt, 'dateTime')}
              </span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 truncate max-w-[170px] sm:max-w-[240px]">
                <Building2 size={12} className="text-slate-400 shrink-0" />
                <span className="truncate">{o.pharmacyName || 'Pharmacie en attente'}</span>
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-lg border border-emerald-100/80 dark:border-emerald-900/50">
                {(o.totalAmount || 0).toLocaleString()} F
              </span>
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider ${
                o.status === 'ready' || o.status === 'delivering' || o.status === 'paid' || o.status === 'completed' ? 'bg-emerald-500 text-white shadow-xs' : 
                o.status === 'pending_payment' ? 'bg-amber-500 text-white' : 
                'bg-slate-800 text-white'
              }`}>
                {getOrderStatusLabel(o.status)}
              </span>
            </div>
          </div>

          {/* Main Body */}
          <div className="pt-2 space-y-2">
            {/* Horizontal Mini Progress Stepper */}
            <div className="flex items-center justify-between gap-1 bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-xl border border-slate-100 dark:border-slate-800/80 text-[8px] font-black uppercase text-slate-500">
              {[
                { label: 'Vérif', statusIdx: 4, icon: ShieldCheck },
                { label: 'Payé', statusIdx: 5, icon: CreditCard },
                { label: 'Prépa', statusIdx: 6, icon: FlaskConical },
                { label: 'Prêt', statusIdx: 7, icon: CheckCircle2 },
                { label: 'Livré', statusIdx: 9, icon: Home },
              ].map((s, idx) => {
                const isDone = currentStepIdx >= s.statusIdx;
                const isActive = currentStepIdx === s.statusIdx;
                return (
                  <div key={s.label} className="flex items-center gap-1 flex-1 justify-center min-w-0">
                    <div className={`w-4.5 h-4.5 rounded-md flex items-center justify-center shrink-0 transition-all ${
                      isDone ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                    } ${isActive ? 'ring-2 ring-emerald-400 scale-105' : ''}`}>
                      <s.icon size={10} />
                    </div>
                    <span className={`hidden sm:inline text-[8px] truncate ${isDone ? 'text-slate-900 dark:text-white font-extrabold' : 'text-slate-400'}`}>
                      {s.label}
                    </span>
                    {idx < 4 && <div className={`h-0.5 flex-1 rounded-full ${currentStepIdx > s.statusIdx ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} />}
                  </div>
                );
              })}
            </div>

            {/* Action Controls & Notifications */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="flex-1 min-w-0">
                {o.status === 'pending_quote' && !o.deliveryMethod && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-200 shrink-0">Réception :</span>
                    <button 
                      onClick={() => onSelectDeliveryMethod(o.id, 'pickup')}
                      className="bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-800 dark:text-slate-200 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 border border-slate-200/60 dark:border-slate-700"
                    >
                      <Store size={12} /> Retrait libre (Gratuit)
                    </button>
                    <button 
                      onClick={() => onSelectDeliveryMethod(o.id, 'delivery')}
                      className="bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-500 hover:text-white text-orange-700 dark:text-orange-300 border border-orange-200/80 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                    >
                      <Truck size={12} /> Livraison ({calculateDeliveryFee(settings)} F)
                    </button>
                  </div>
                )}

                {o.status === 'pending_payment' && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-extrabold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-lg border border-amber-200/60">
                      Devis prêt
                    </span>
                    <button 
                      onClick={() => onApproveQuote(o)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-xs hover:shadow-emerald-600/20 active:scale-95 transition-all flex items-center gap-1"
                    >
                      <CreditCard size={12} /> Payer {(o.totalAmount || 0).toLocaleString()} F
                    </button>
                  </div>
                )}

                {o.status === 'verifying_payment' && (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-xl border border-indigo-100 dark:border-indigo-900">
                    <ShieldCheck size={13} className="text-indigo-600 animate-pulse shrink-0" />
                    <span>Paiement en cours de vérification</span>
                  </div>
                )}

                {o.deliveryCode && (o.status === 'ready' || o.status === 'delivering') && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-2.5 py-1 rounded-xl flex items-center gap-1 text-xs font-bold shadow-xs">
                      <QrCode size={12} className="text-emerald-400 dark:text-emerald-600" />
                      <span>Code : <strong className="text-emerald-400 dark:text-emerald-700 font-black tracking-widest">#{o.deliveryCode}</strong></span>
                    </div>
                    {o.status === 'delivering' && o.deliveryId && (
                      <button onClick={() => onShowMap(o)} className="bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200/60 px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-sky-100 transition-colors">
                        <MapPin size={11} /> Suivre coursier
                      </button>
                    )}
                  </div>
                )}

                {o.status === 'completed' && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-lg">
                      <CheckCircle size={12} /> Livré
                    </span>
                    <button 
                      onClick={() => generateInvoice(o, profile)}
                      className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
                    >
                      <FileText size={12} /> Facture PDF
                    </button>
                  </div>
                )}

                {o.status === 'quote_rejected' && (
                  <div className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg inline-flex items-center gap-1">
                    <X size={12} /> Devis refusé
                  </div>
                )}
              </div>

              {/* Right Action Icons (Chat, Image, Toggle details) */}
              <div className="flex items-center gap-1 shrink-0">
                <button 
                  onClick={() => onChat(o.id)}
                  className="relative px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                >
                  <MessageCircle size={12} />
                  <span>Chat</span>
                  {o.unreadCounts?.[profile?.role || 'patient'] > 0 && (
                    <span className="w-3.5 h-3.5 bg-rose-500 text-white text-[8px] font-bold flex items-center justify-center rounded-full">
                      {o.unreadCounts[profile?.role || 'patient']}
                    </span>
                  )}
                </button>

                {o.prescriptionImageUrl && (
                  <button 
                    onClick={() => onViewImage(o.prescriptionImageUrl!)}
                    className="w-7 h-7 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 hover:scale-105 transition-transform shrink-0"
                    title="Voir l'ordonnance"
                  >
                    <img src={o.prescriptionImageUrl} className="w-full h-full object-cover" loading="lazy" />
                  </button>
                )}

                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="px-2 py-1.5 bg-slate-50 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 border border-slate-200/50 dark:border-slate-700"
                  title="Détails"
                >
                  <ChevronDown size={12} className={`transition-transform duration-200 ${showDetails ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {/* Collapsible Details */}
            {showDetails && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs"
              >
                {/* Driver warning info */}
                {o.status === 'pending_quote' && !o.deliveryMethod && availableDrivers !== null && (
                  <div className={`p-2 rounded-xl border flex items-center gap-1.5 ${
                    availableDrivers > 0 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}>
                    <Truck size={12} className="shrink-0" />
                    <span>{availableDrivers > 0 ? `${availableDrivers} livreur(s) disponible(s)` : 'Aucun livreur de garde. Choisissez le retrait direct.'}</span>
                  </div>
                )}

                {/* Proofs */}
                {(o.deliveryPhoto || o.deliverySignature) && (
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-500">Preuves :</span>
                    {o.deliveryPhoto && (
                      <button onClick={() => onViewImage(o.deliveryPhoto!)} className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200">
                        <img src={o.deliveryPhoto} className="w-full h-full object-cover" />
                      </button>
                    )}
                    {o.deliverySignature && (
                      <button onClick={() => onViewImage(o.deliverySignature!)} className="w-10 h-10 rounded-lg border border-slate-200 p-0.5 bg-white">
                        <img src={o.deliverySignature} className="w-full h-full object-contain" />
                      </button>
                    )}
                  </div>
                )}

                {/* Status History Trace */}
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Historique des étapes</p>
                  <StatusTrace history={o.history} />
                </div>
              </motion.div>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
});

// --- Patient Dashboard ---

const PatientDashboard = React.memo(({ profile, settings, location, cities, rotation, onDeletePrescription }: { profile: UserProfile, settings: Settings | null, location: { lat: number, lng: number } | null, cities: City[], rotation: OnCallRotation | null, onDeletePrescription: (id: string, orderIds: string[]) => void }) => {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'prescriptions' | 'orders' | 'pharmacies' | 'history'>('prescriptions');

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.scrollTop = 0;
  }, [activeTab]);
  const [hospitalLocation, setHospitalLocation] = useState('');
  const [hospitalSuggestions, setHospitalSuggestions] = useState<string[]>([]);
  const [showHospitalSuggestions, setShowHospitalSuggestions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPartialSelect, setShowPartialSelect] = useState<Prescription | null>(null);
  const [selectedMeds, setSelectedMeds] = useState<string[]>([]);
  const [showDeliveryConfirm, setShowDeliveryConfirm] = useState<{ orderId: string, fee: number } | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState<Order | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'orange' | 'moov' | 'telecel' | 'coris' | null>(null);
  const [paymentPhone, setPaymentPhone] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'method' | 'phone' | 'otp' | 'processing' | 'success'>('method');
  const [paymentStatusMessage, setPaymentStatusMessage] = useState<string>('');
  const [mmMode, setMmMode] = useState<'ussd' | 'otp' | null>(null);
  const [paymentOtp, setPaymentOtp] = useState('');
  const [paymentInvoiceId, setPaymentInvoiceId] = useState('');
  const [paymentProcessorId, setPaymentProcessorId] = useState('');
  const [paymentTransId, setPaymentTransId] = useState('');
  const [showMapForOrder, setShowMapForOrder] = useState<Order | null>(null);
  const [pharmacySearch, setPharmacySearch] = useState('');
  const [showManualEntryModal, setShowManualEntryModal] = useState(false);
  const [manualEntryText, setManualEntryText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [landmark, setLandmark] = useState('');
  const [facadePhoto, setFacadePhoto] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [activeChatOrderId, setActiveChatOrderId] = useState<string | null>(null);
  const [patientCityId, setPatientCityId] = useState(profile.cityId || '');
  const [isLocating, setIsLocating] = useState(false);

  // Auto-detect city and neighborhood from location prop 
  useEffect(() => {
    if (!patientCityId && location && cities.length > 0) {
      const nearest = findNearestCity(location.lat, location.lng, cities);
      if (nearest) {
        setPatientCityId(nearest.id);
        // Silently update profile if it's the first time
        if (!profile.cityId) {
          updateDoc(doc(db, 'users', profile.uid), { cityId: nearest.id }).catch(console.error);
        }
      }
    }

    if (location && !landmark) {
      // Background reverse geocoding to auto-fill neighborhood
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.lat}&lon=${location.lng}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.address) {
            const neighborhood = data.address.neighbourhood || data.address.suburb || data.address.residential || data.address.village;
            if (neighborhood) {
              setLandmark(neighborhood);
            }
          }
        })
        .catch(console.error);
    }
  }, [location, cities, patientCityId, profile.cityId, profile.uid]);

  const autoDetectCity = () => {
    if (!navigator.geolocation) {
      toast.error("La géolocalisation n'est pas supportée par votre appareil.");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude: lat, longitude: lon } = position.coords;
          const mapResponse = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
          if (!mapResponse.ok) throw new Error("Erreur cartographique");
          const data = await mapResponse.json();
          
          if (data && data.address) {
            const detectedName = data.address.city || data.address.town || data.address.village || data.address.county || data.address.state || "";
            if (!detectedName) {
              toast.error("Ville introuvable aux coordonnées actuelles.");
              return;
            }
            
            // Allow somewhat loose matching (e.g. Ouagadougou matches Ouagadougou)
            const matchedCity = cities.find(c =>
              c.name.toLowerCase().includes(detectedName.toLowerCase()) ||
              detectedName.toLowerCase().includes(c.name.toLowerCase())
            );

            if (matchedCity) {
              setPatientCityId(matchedCity.id);
              if (matchedCity.id !== profile.cityId) {
                 await updateDoc(doc(db, 'users', profile.uid), { cityId: matchedCity.id }).catch(console.error);
              }
              toast.success(`Position confirmée : ${matchedCity.name}`);
            } else {
              toast.error(`Ville détectée (${detectedName}) non couverte.`);
            }
          } else {
            toast.error("Impossible de déterminer la ville.");
          }
        } catch (error) {
          console.error(error);
          toast.error("Erreur d'analyse de la position.");
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        console.error(error);
        setIsLocating(false);
        toast.error("L'accès à la position géographique a été refusé.");
      },
      { timeout: 10000, enableHighAccuracy: false }
    );
  };

  useEffect(() => {
    // Shared Cities and Rotation are now provided as props from App level
  }, []);

  const [isRequestingQuote, setIsRequestingQuote] = useState(false);
  const handleRequestQuote = async (p: Prescription, type: 'all' | 'partial', meds?: string[]) => {
    setIsRequestingQuote(true);
    try {
      await updateDoc(doc(db, 'prescriptions', p.id), {
        requestType: type,
        selectedMedications: meds || [],
        status: 'submitted',
        lockedBy: null,
        lockedAt: null
      });
      setShowPartialSelect(null);
      toast.success("Demande de devis mise à jour !");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `prescriptions/${p.id}`);
      toast.error("Erreur lors de la mise à jour.");
    } finally {
      setIsRequestingQuote(false);
    }
  };

  const handleRejectQuote = async (orderId: string, prescriptionId?: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'quote_rejected',
        updatedAt: serverTimestamp(),
        history: arrayUnion({
          status: 'quote_rejected',
          timestamp: new Date().toISOString(),
          label: 'Devis rejeté par le patient'
        })
      });

      if (prescriptionId) {
        try {
            const pSnap = await getDoc(doc(db, 'prescriptions', prescriptionId));
            if (pSnap.exists()) {
              const currentCount = pSnap.data().quoteCount || 1;
              await updateDoc(doc(db, 'prescriptions', prescriptionId), {
                status: 'submitted',
                quoteCount: Math.max(0, currentCount - 1),
                lockedBy: null,
                lockedAt: null
              });
            }
        } catch (e) {
          console.warn("Could not update associated prescription (might be deleted)", e);
        }
      }
      toast.info("Devis rejeté. Votre ordonnance est de nouveau disponible pour d'autres pharmacies.");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const isFirstRunPatientPrescriptions = useRef(true);
  useEffect(() => {
    const q = query(
      collection(db, 'prescriptions'), 
      where('patientId', '==', profile.uid), 
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const hasChange = snapshot.docChanges().some(change => change.type === 'added' || change.type === 'modified');
      if (!isFirstRunPatientPrescriptions.current && hasChange && !snapshot.metadata.hasPendingWrites) {
        playNotificationSound(settings, profile?.sound_enabled !== false);
      }
      isFirstRunPatientPrescriptions.current = false;
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Prescription));
      setPrescriptions(docs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'prescriptions'));
    return () => unsubscribe();
  }, [profile.uid, settings, profile?.sound_enabled]);

  const isFirstRunPatientOrders = useRef(true);
  useEffect(() => {
    const q = query(
      collection(db, 'orders'), 
      where('patientId', '==', profile.uid), 
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Play sound for new orders or important updates (excluding initial load)
      const hasSignficantChange = snapshot.docChanges().some(change => {
        if (change.type === 'added') return true;
        if (change.type === 'modified') return true;
        return false;
      });

      if (!isFirstRunPatientOrders.current && hasSignficantChange && !snapshot.metadata.hasPendingWrites) {
        playNotificationSound(settings, profile?.sound_enabled !== false);
      }
      isFirstRunPatientOrders.current = false;
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      setOrders(docs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'orders'));
    return () => unsubscribe();
  }, [profile.uid, settings, profile?.sound_enabled]);

  useEffect(() => {
    const q = query(collection(db, 'pharmacies'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPharmacies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pharmacy)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'pharmacies'));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Vous êtes de nouveau en ligne. Synchronisation possible.");
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("Vous êtes hors ligne. Vos ordonnances seront enregistrées localement.");
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync offline prescriptions when coming online
  useEffect(() => {
    if (isOnline) {
      const offline = localStorage.getItem('offline_prescriptions');
      if (offline) {
        const list = JSON.parse(offline);
        if (list.length > 0) {
          toast.info(`Synchronisation de ${list.length} ordonnance(s) hors-ligne...`);
          const syncAll = async () => {
            const batch = writeBatch(db);
            list.forEach((p: any) => {
              const newDocRef = doc(collection(db, 'prescriptions'));
              const { id, ...data } = p;
              batch.set(newDocRef, {
                ...data,
                createdAt: serverTimestamp(),
                syncedAt: serverTimestamp()
              });
            });
            await batch.commit();
            localStorage.removeItem('offline_prescriptions');
            toast.success("Synchronisation terminée !");
          };
          syncAll().catch(console.error);
        }
      }
    }
  }, [isOnline]);

  const handleManualEntrySubmit = async () => {
    if (!manualEntryText.trim()) {
      toast.error("Veuillez entrer les médicaments.");
      return;
    }

    let finalCityId = patientCityId;
    if (!finalCityId && location && cities.length > 0) {
      const nearest = findNearestCity(location.lat, location.lng, cities);
      if (nearest) finalCityId = nearest.id;
    }

    if (!finalCityId) {
      toast.error("Veuillez sélectionner votre ville avant d'envoyer.");
      return;
    }

    setUploading(true);
    try {
      if (finalCityId !== profile.cityId) {
        await updateDoc(doc(db, 'users', profile.uid), { cityId: finalCityId }).catch(console.error);
      }

      const prescriptionData = {
        patientId: profile.uid,
        patientName: profile.name,
        cityId: finalCityId,
        hospitalLocation: hospitalLocation || "Non spécifié",
        patientLocation: location,
        landmark: landmark || "Renseigné via GPS Localisation",
        facadePhoto: facadePhoto || null,
        extractedData: manualEntryText,
        status: 'analyzed',
        createdAt: serverTimestamp(),
        distance: Math.floor(Math.random() * 5) + 1,
        quoteCount: 0
      };

      if (!isOnline) {
        const offline = localStorage.getItem('offline_prescriptions');
        const list = offline ? JSON.parse(offline) : [];
        list.push({ ...prescriptionData, id: 'temp_' + Date.now(), createdAt: new Date().toISOString() });
        localStorage.setItem('offline_prescriptions', JSON.stringify(list));
        setHospitalLocation('');
        setLandmark('');
        setFacadePhoto(null);
        setShowManualEntryModal(false);
        setManualEntryText('');
        setUploading(false);
        toast.success("Ordonnance enregistrée localement (Hors-ligne). Elle sera envoyée dès que vous aurez internet.");
        return;
      }

      const docRef = await addDoc(collection(db, 'prescriptions'), prescriptionData);

      setHospitalLocation('');
      setLandmark('');
      setFacadePhoto(null);
      setShowManualEntryModal(false);
      setManualEntryText('');
      setUploading(false);
      toast.success("Demande envoyée ! Analyse en cours...");

      // Run parsing with Gemini in the background
      (async () => {
        try {
          const data = await analyzeWithGemini({
            text: manualEntryText,
            prompt: "Tu es un assistant pharmacien au Burkina Faso. Voici une liste de médicaments dictée ou saisie manuellement par un patient. Extrait les noms des médicaments, les dosages et les posologies. Tente aussi d'identifier si un hôpital ou un médecin est mentionné. Réponds en français au format JSON structuré : { \"articles\": [ { \"nom_article\": \"...\", \"dosage\": \"...\", \"posologie\": \"...\" } ], \"etablissement\": \"nom de l'hôpital ou du médecin si trouvé, sinon vide\" }. Sois très rapide et précis."
          });

          if (!data.success) throw new Error(extractErrorMsg(data, "Erreur lors de l'analyse automatique."));
          
          let parsed;
          try {
            const cleanText = (data.text || '{}').replace(/```json/ig, '').replace(/```/g, '').trim();
            const jsonStr = cleanText.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0] || '{}';
            parsed = JSON.parse(jsonStr);
          } catch(e) {
            parsed = { articles: [], etablissement: "" };
          }

          if (parsed.etablissement && !hospitalLocation) {
            setHospitalLocation(parsed.etablissement);
          }

          await updateDoc(docRef, {
            extractedData: JSON.stringify(parsed.articles || []),
            hospitalLocation: parsed.etablissement || hospitalLocation || "Non spécifié",
            status: 'analyzed'
          });
          toast.success("Analyse terminée ! Veuillez maintenant choisir votre mode d'envoi (Complet ou Partiel).");
        } catch (error: any) {
          console.error("Gemini Parsing Error:", error);
          const errorMessage = error.message || "Erreur lors de l'analyse automatique.";

          await updateDoc(docRef, {
            extractedData: JSON.stringify([{ nom_article: "Saisie : " + manualEntryText, dosage: "", posologie: "Traitement manuel par un pharmacien" }]),
            status: 'analyzed'
          });
          toast.info(`${errorMessage}. Contenu saisi transmis directement aux pharmacies.`);
        }
      })();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'prescriptions');
      setUploading(false);
    }
  };

  const toggleVoiceInput = async () => {
    if (isListening) {
      setIsListening(false);
      if (Capacitor.isNativePlatform()) {
        try { await SpeechRecognition.stop(); } catch(e) {}
      }
      return;
    }

    if (Capacitor.isNativePlatform()) {
      try {
        const checkResult = await SpeechRecognition.available();
        if (!checkResult.available) {
          toast.error("La reconnaissance vocale n'est pas disponible sur cet appareil Android.");
          return;
        }

        const permStatus = await SpeechRecognition.requestPermissions();
        if (permStatus.speechRecognition !== 'granted') {
          toast.error("Permission MICROPHONE refusée. Veuillez l'activer dans les paramètres Android.");
          return;
        }

        setIsListening(true);
        toast.info("Écoute en cours... Parlez maintenant.");
        
        const result = await SpeechRecognition.start({
          language: 'fr-FR',
          maxResults: 1,
          prompt: "Dites votre besoin de soin...",
          popup: true,
          partialResults: false
        });

        if (result && result.matches && result.matches.length > 0) {
          const transcript = result.matches[0];
          setManualEntryText(prev => prev ? prev + ' ' + transcript : transcript);
          toast.success("Message capturé !");
        }
        setIsListening(false);
      } catch (err: any) {
        setIsListening(false);
        console.error("Speech recognition plugin error:", err);
        if (err?.message?.includes('not-allowed') || err?.message?.includes('permission')) {
          toast.error("Permission refusée ou annulée.");
        } else if (err?.message?.includes('No speech') || err?.message?.includes('no match')) {
          toast.error("Aucune voix détectée. Parlez plus fort !");
        } else {
           toast.error("Échec de l'écoute vocale (annulée).");
        }
      }
      return;
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error("La reconnaissance vocale n'est pas supportée par votre navigateur (ou WebView Android).");
      return;
    }

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRec();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
      toast.info("Écoute en cours... Parlez maintenant.");
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setManualEntryText(prev => prev ? prev + ' ' + transcript : transcript);
      setIsListening(false);
      toast.success("Message capturé !");
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        toast.error("Permission MICROPHONE refusée. Activez-la dans les réglages Android.");
      } else if (event.error === 'no-speech') {
        toast.error("Aucune voix détectée. Parlez plus fort !");
      } else {
        toast.error("Erreur vocale: " + event.error);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    let finalCityId = patientCityId;
    if (!finalCityId && location && cities.length > 0) {
      const nearest = findNearestCity(location.lat, location.lng, cities);
      if (nearest) finalCityId = nearest.id;
    }

    if (!finalCityId) {
      toast.error("Veuillez sélectionner votre ville avant d'envoyer.");
      return;
    }

    setUploading(true);
    await new Promise(resolve => setTimeout(resolve, 50)); // Allow UI to update
    try {
      if (finalCityId !== profile.cityId) {
        await updateDoc(doc(db, 'users', profile.uid), { cityId: finalCityId }).catch(console.error);
      }

      // Use a slightly smaller image for faster processing and to stay well within Firestore limits
      const base64 = await compressImage(file, RAM_OPTIMIZED_COMPRESSION.maxWidth, RAM_OPTIMIZED_COMPRESSION.maxHeight, RAM_OPTIMIZED_COMPRESSION.quality);
      
      const prescriptionData = {
        patientId: profile.uid,
        patientName: profile.name,
        cityId: finalCityId,
        hospitalLocation: hospitalLocation || "Non spécifié",
        patientLocation: location, // Real-time location of the patient
        landmark: landmark || "Renseigné via GPS Localisation",
        facadePhoto: facadePhoto || null,
        imageUrl: base64,
        extractedData: "", // Will be updated asynchronously
        status: 'draft',
        createdAt: serverTimestamp(),
        distance: Math.floor(Math.random() * 5) + 1, // Simulating distance in km
        quoteCount: 0
      };

      if (!isOnline) {
        const offline = localStorage.getItem('offline_prescriptions');
        const list = offline ? JSON.parse(offline) : [];
        list.push({ ...prescriptionData, id: 'temp_' + Date.now(), createdAt: new Date().toISOString() });
        localStorage.setItem('offline_prescriptions', JSON.stringify(list));
        setHospitalLocation('');
        setLandmark('');
        setFacadePhoto(null);
        setUploading(false);
        toast.success("Ordonnance enregistrée localement (Hors-ligne).");
        return;
      }

      // Add the document immediately to Firestore to show it in the UI
      const docRef = await addDoc(collection(db, 'prescriptions'), prescriptionData);

      setHospitalLocation('');
      setLandmark('');
      setFacadePhoto(null);
      setUploading(false);
      toast.success("Ordonnance ajoutée ! Analyse des médicaments en cours...");

      // Run OCR with Gemini in the background
      (async () => {
        try {
          const data = await analyzeWithGemini({
            image: base64.split(',')[1],
            prompt: `Tu es un assistant pharmacien expert au Burkina Faso. Analyse cette image qui est une ordonnance médicale.

Directives:
1. Extrait les noms des médicaments, les dosages et les posologies.
2. Identifie l\'établissement de santé ou le médecin figurant sur l\'en-tête.
3. Même si l\'image est légèrement floue ou sombre, FAIS DE TON MIEUX pour extraire les informations.
4. Si le document N'EST PAS une ordonnance médicale, retourne articles: [], etablissement: 'Document non reconnu'.

Réponds UNIQUEMENT via un format JSON strict, sans texte explicatif avant ou après.
Format JSON attendu (strict):
{
  "articles": [
    { "nom_article": "...", "dosage": "...", "posologie": "..." }
  ],
  "etablissement": "..."
}`
          });

          if (!data.success) throw new Error(extractErrorMsg(data, "Erreur lors de l'analyse OCR."));
          
          if (data.text) {
            let parsed;
            try {
              const cleanText = (data.text || '{}').replace(/```json/ig, '').replace(/```/g, '').trim();
              const jsonStr = cleanText.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0] || '{}';
              parsed = JSON.parse(jsonStr);
            } catch(e) {
              parsed = { articles: [], etablissement: "" };
            }

            if (parsed.etablissement && !hospitalLocation) {
              setHospitalLocation(parsed.etablissement);
            }

            await updateDoc(doc(db, 'prescriptions', docRef.id), {
              extractedData: JSON.stringify(parsed.articles || []),
              hospitalLocation: parsed.etablissement || hospitalLocation || "Non spécifié",
              status: 'analyzed'
            });
            toast.success("Analyse terminée ! Veuillez maintenant choisir votre mode d'envoi (Complet ou Partiel).");
          } else {
            throw new Error("Aucun texte extrait de l'ordonnance.");
          }
        } catch (err: any) {
          console.error("Gemini OCR failed:", err);
          const errorMessage = err.message || "Erreur lors de l'analyse automatique.";

          toast.info(`${errorMessage}. Veuillez choisir votre mode d'envoi.`);
          await updateDoc(doc(db, 'prescriptions', docRef.id), {
            extractedData: "En attente d'analyse manuelle par un pharmacien.",
            status: 'analyzed'
          });
        }
      })();

    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'prescriptions');
      setUploading(false);
      toast.error("Erreur lors de l'envoi de l'ordonnance.");
    }
  };

  const handleApproveQuote = (order: Order) => {
    setSelectedPaymentMethod(null);
    setPaymentPhone(profile?.phone || '');
    setPaymentStep('method');
    setMmMode(null);
    setPaymentOtp('');
    setPaymentInvoiceId('');
    setShowPaymentModal(order);
  };

  const simulatePayment = async (method: 'card' | 'bank') => {
    if (!showPaymentModal) return;
    setIsProcessingPayment(true);
    
    try {
      // Simulate payment processing delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      const order = showPaymentModal;
      // Calculate splits (Economic Model)
      const medicationTotal = order.medicationTotal || 0;
      const deliveryFee = order.deliveryFee || 0;
      // Use the serviceFee already saved in the order, or fallback to settings if not present
      const serviceFee = order.serviceFee !== undefined ? order.serviceFee : (settings?.serviceFee || 0);
      
      const pharmacyCommission = settings?.commissionPercentage || 10;
      const deliveryCommission = settings?.deliveryCommissionPercentage || 15;
      
      const platformMedFee = Math.round(medicationTotal * (pharmacyCommission / 100));
      const platformDeliveryFee = Math.round(deliveryFee * (deliveryCommission / 100));
      
      const pharmacyAmount = medicationTotal - platformMedFee;
      const deliveryAmount = deliveryFee - platformDeliveryFee;
      const totalPlatformFee = platformMedFee + platformDeliveryFee + serviceFee;
      
      // The totalToPay should be exactly what's in the order document to avoid discrepancies
      const totalToPay = order.totalAmount || (medicationTotal + deliveryFee + serviceFee);

      // Ensure amounts are never undefined or NaN
      const finalPharmacyAmount = isNaN(pharmacyAmount) ? 0 : pharmacyAmount;
      const finalDeliveryAmount = isNaN(deliveryAmount) ? 0 : deliveryAmount;
      const finalPlatformFee = isNaN(totalPlatformFee) ? 0 : totalPlatformFee;

      // Generate a 6-digit PIN for delivery verification
      const deliveryPin = generateCode();

      const batch = writeBatch(db);

      batch.update(doc(db, 'orders', order.id), {
        status: 'paid',
        paymentMethod: method,
        paymentStatus: 'completed',
        deliveryCode: deliveryPin,
        medicationTotal,
        deliveryFee,
        serviceFee,
        totalAmount: totalToPay,
        pharmacyAmount: finalPharmacyAmount,
        deliveryAmount: finalDeliveryAmount,
        platformFee: finalPlatformFee,
        updatedAt: serverTimestamp(),
        history: arrayUnion({
          status: 'paid',
          timestamp: new Date().toISOString(),
          label: `Paiement effectué via ${method === 'card' ? 'Carte Bancaire' : 'Virement Bancaire'}`
        })
      });

      // Update pharmacy load
      if (order.pharmacyId) {
        batch.update(doc(db, 'pharmacies', order.pharmacyId), {
          currentActiveOrders: increment(1)
        });
      }

      await batch.commit();
      
      if (order.prescriptionId) {
        try {
          await updateDoc(doc(db, 'prescriptions', order.prescriptionId), {
            status: 'paid',
            lockedBy: null,
            lockedAt: null
          });
        } catch (e) {
          console.warn("Could not update associated prescription (might be deleted)", e);
        }
      }

      await createNotification(order.patientId, "Paiement confirmé", `Votre paiement de ${totalToPay} FCFA pour la commande #${order.id.slice(-6).toUpperCase()} a été reçu.`, 'payment', order.id);
      if (order.pharmacistId) {
        await createNotification(order.pharmacistId, "Nouveau paiement", `Le patient a payé la commande #${order.id.slice(-6).toUpperCase()}. Vous pouvez commencer la préparation.`, 'payment', order.id);
      }
      
      if (order.deliveryMethod === 'delivery') {
        const cityName = cities.find(c => c.id === order.cityId)?.name || "";
        const deliveryDest = cityName ? `vers ${cityName}` : "pour livraison";
        await notifyDeliveryDrivers("Nouvelle livraison disponible", `Une livraison est prête de ${order.pharmacyName} ${deliveryDest}. (Prescription: ${order.hospitalLocation})`, order.id);
      }

      setShowPaymentModal(null);
      setSelectedPaymentMethod(null);
      setPaymentPhone('');
      toast.success("Paiement effectué avec succès !");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${showPaymentModal.id}`);
      toast.error("Erreur lors du paiement.");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const performDirectPayment = async (method: 'orange' | 'moov' | 'telecel' | 'coris') => {
    if (!showPaymentModal) return;
    if (!paymentPhone || !paymentOtp) {
      toast.error("Veuillez remplir tous les champs.");
      return;
    }
    
    setIsProcessingPayment(true);
    setPaymentStep('processing');
    setPaymentStatusMessage("Initialisation de la transaction...");
    
    try {
      const isTestMode = settings?.paymentConfig?.testMode || false;
      
      // 1. Init (Create Invoice but NO get-otp call for Orange/Telecel)
      const initResponse = await fetch(getApiUrl('/api/payment/init'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: showPaymentModal.totalAmount,
          phone: paymentPhone,
          email: profile.email,
          method: method,
          isTest: isTestMode
        })
      });

      const initData = await initResponse.json();
      if (!initData.success) throw new Error(extractErrorMsg(initData, "Échec de l'initialisation du paiement."));

      setPaymentInvoiceId(initData.invoiceId);
      if (initData.processorId) setPaymentProcessorId(initData.processorId);
      if (initData.transId) setPaymentTransId(initData.transId);

      // 2. Perform immediately with the user's OTP
      setPaymentStatusMessage("Validation du code et paiement...");
      const performResponse = await fetch(getApiUrl('/api/payment/perform'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: initData.invoiceId,
          processorId: initData.processorId,
          trans_id: initData.transId,
          phone: paymentPhone,
          otp: paymentOtp,
          method: method,
          isTest: isTestMode
        })
      });

      const performData = await performResponse.json();
      if (!performData.success) throw new Error(extractErrorMsg(performData, "Le paiement a échoué."));
      
      // Handle Success
      setPaymentStep('success');
      toast.success("Paiement validé avec succès !");
      
      // Finalize order record
      await finalizePaidOrder(method, initData.invoiceId, true);
      
    } catch (error) {
      console.error("Erreur de paiement:", error);
      toast.error(error instanceof Error ? error.message : "Erreur lors du paiement.");
      setPaymentStep('method'); // Go back to input
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const finalizePaidOrder = async (method: string, invoiceId: string, isAutomatic: boolean) => {
    try {
      const order = showPaymentModal;
      if (!order) return;
      
      const medicationTotal = order.medicationTotal || 0;
      const deliveryFee = order.deliveryFee || 0;
      const serviceFee = order.serviceFee !== undefined ? order.serviceFee : (settings?.serviceFee || 0);
      
      const pharmacyCommission = settings?.commissionPercentage || 10;
      const deliveryCommission = settings?.deliveryCommissionPercentage || 15;
      
      const platformMedFee = Math.round(medicationTotal * (pharmacyCommission / 100));
      const platformDeliveryFee = Math.round(deliveryFee * (deliveryCommission / 100));
      
      const pharmacyAmount = medicationTotal - platformMedFee;
      const deliveryAmount = deliveryFee - platformDeliveryFee;
      const totalPlatformFee = platformMedFee + platformDeliveryFee + serviceFee;
      
      const totalToPay = order.totalAmount || (medicationTotal + deliveryFee + serviceFee);

      const deliveryPin = generateCode();

      const orderUpdate: any = {
        status: 'paid',
        paymentMethod: method,
        paymentPhone: paymentPhone,
        paymentStatus: 'completed',
        sappayInvoiceId: invoiceId,
        medicationTotal,
        deliveryFee,
        serviceFee,
        totalAmount: totalToPay,
        pharmacyAmount: pharmacyAmount,
        deliveryAmount: deliveryAmount,
        platformFee: totalPlatformFee,
        updatedAt: serverTimestamp(),
        deliveryCode: deliveryPin,
        paymentConfirmedAt: serverTimestamp(),
        history: arrayUnion({
          status: 'paid',
          timestamp: new Date().toISOString(),
          label: `Paiement automatique ${method.toUpperCase()} (OTP) validé avec succès.`
        })
      };

      await updateDoc(doc(db, 'orders', order.id), orderUpdate);

      if (order.prescriptionId) {
        await updateDoc(doc(db, 'prescriptions', order.prescriptionId), {
          status: 'paid',
          lockedBy: null,
          lockedAt: null
        });
      }

      setTimeout(() => setShowPaymentModal(null), 2000);
    } catch (e) {
      console.error("Error finalizing order:", e);
    }
  };

  const initPayment = async (method: 'orange' | 'moov' | 'telecel' | 'coris') => {
    if (!showPaymentModal) return;
    if (!paymentPhone) {
      toast.error("Veuillez entrer votre numéro de téléphone.");
      return;
    }
    
    // Validate phone number (Burkina numbers are 8 digits usually, or 10 with country code)
    const cleanPhone = paymentPhone.replace(/\D/g, '');
    if (cleanPhone.length < 8) {
      toast.error("Numéro de téléphone invalide.");
      return;
    }

    setIsProcessingPayment(true);
    setPaymentStep('processing');
    setPaymentStatusMessage("Initialisation du paiement...");
    
    try {
      const isTestMode = settings?.paymentConfig?.testMode || false;
      if (isTestMode) setPaymentStatusMessage("Mode Test (Sandbox) : Création d'une facture fictive...");
      else setPaymentStatusMessage("Connexion sécurisée à Sappay...");

      const response = await fetch(getApiUrl('/api/payment/init'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: showPaymentModal.totalAmount,
          phone: paymentPhone,
          email: profile.email,
          method: method,
          isTest: isTestMode
        })
      });

      const data = await response.json();
      if (!data.success) throw new Error(extractErrorMsg(data, "Échec de l'envoi du code."));

      if (data.otpRequired) {
        setPaymentStatusMessage("Code de confirmation envoyé par SMS...");
      } else {
        setPaymentStatusMessage("Facture générée. Saisissez votre code OTP...");
      }

      setPaymentInvoiceId(data.invoiceId);
      if (data.transId) setPaymentTransId(data.transId);
      
      // Store processorId if returned for perform step
      if (data.processorId) {
        setPaymentProcessorId(data.processorId);
      }
      
      setPaymentStep('otp');
      
      if (method === 'orange' || method === 'telecel') {
        const syntax = method === 'orange' ? '*144*4*6*' : '*808*4*4*';
        toast.info(`Composez ${syntax}${showPaymentModal.totalAmount}# pour obtenir votre code OTP`, { duration: 6000 });
      }
    } catch (error) {
      console.error("Erreur d'initialisation du paiement:", error);
      toast.error(error instanceof Error ? error.message : "Erreur lors de l'initialisation du paiement.");
      setPaymentStep('method');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const performPayment = async (method: 'orange' | 'moov' | 'telecel' | 'coris') => {
    if (!showPaymentModal) {
      toast.error("Erreur: Aucune commande sélectionnée.");
      return;
    }
    
    if (!paymentOtp) {
      toast.error("Veuillez saisir le code de confirmation.");
      return;
    }
    
    setIsProcessingPayment(true);
    setPaymentStep('processing');
    setPaymentStatusMessage("Validation du code OTP...");
    
    const isAutomatic = mmMode === 'otp';
    const isTestMode = settings?.paymentConfig?.testMode || false;
    let apiSuccess = false;
    let apiData = null;

    try {
      if (isAutomatic) {
        if (!paymentInvoiceId) {
          throw new Error("L'identifiant de la transaction est manquant. Veuillez recommencer.");
        }
        
        if (isTestMode) setPaymentStatusMessage("Simulation du paiement en cours...");
        else setPaymentStatusMessage("Transaction en cours de traitement...");

        const response = await fetch(getApiUrl('/api/payment/perform'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: paymentInvoiceId,
            processorId: paymentProcessorId,
            trans_id: paymentTransId,
            phone: paymentPhone,
            otp: paymentOtp,
            method: method,
            amount: showPaymentModal.totalAmount.toString(),
            email: profile.email || "client@e-recharge.app",
            isTest: isTestMode
          })
        });

        const data = await response.json();
        if (data.success) {
          apiSuccess = true;
          apiData = data.data;
        } else {
          throw new Error(extractErrorMsg(data, "Le paiement a été rejeté. Vérifiez votre solde ou le code saisi."));
        }
      } else {
        // Mode USSD: Toujours considéré comme "à vérifier manuellement"
        apiSuccess = false;
      }
    } catch (e) {
      if (isAutomatic) {
        console.error("Erreur API de paiement:", e);
        toast.error(e instanceof Error ? e.message : "Erreur lors de la validation du paiement.");
        setIsProcessingPayment(false);
        setPaymentStep('otp');
        return;
      }
      apiSuccess = false;
    }

    
    try {
      const order = showPaymentModal;
      // Calculate splits (Economic Model)
      const medicationTotal = order.medicationTotal || 0;
      const deliveryFee = order.deliveryFee || 0;
      const serviceFee = order.serviceFee !== undefined ? order.serviceFee : (settings?.serviceFee || 0);
      
      const pharmacyCommission = settings?.commissionPercentage || 10;
      const deliveryCommission = settings?.deliveryCommissionPercentage || 15;
      
      const platformMedFee = Math.round(medicationTotal * (pharmacyCommission / 100));
      const platformDeliveryFee = Math.round(deliveryFee * (deliveryCommission / 100));
      
      const pharmacyAmount = medicationTotal - platformMedFee;
      const deliveryAmount = deliveryFee - platformDeliveryFee;
      const totalPlatformFee = platformMedFee + platformDeliveryFee + serviceFee;
      
      const totalToPay = order.totalAmount || (medicationTotal + deliveryFee + serviceFee);

      const finalPharmacyAmount = isNaN(pharmacyAmount) ? 0 : pharmacyAmount;
      const finalDeliveryAmount = isNaN(deliveryAmount) ? 0 : deliveryAmount;
      const finalPlatformFee = isNaN(totalPlatformFee) ? 0 : totalPlatformFee;

      const deliveryPin = generateCode();

      // NEW LOGIC: Only USSD or failed-API-in-sandbox counts as "manual check needed"
      // If it's OTP and we got here (apiSuccess or sandbox), it's considered PAID.
      const isManualCheckNeeded = mmMode === 'ussd' || !apiSuccess;
      const nextStatus = isManualCheckNeeded ? 'verifying_payment' : 'paid';

      const orderUpdate: any = {
        status: nextStatus,
        paymentMethod: method,
        paymentPhone: paymentPhone,
        paymentStatus: isManualCheckNeeded ? 'pending_verification' : 'completed',
        sappayInvoiceId: paymentInvoiceId,
        medicationTotal,
        deliveryFee,
        serviceFee,
        totalAmount: totalToPay,
        pharmacyAmount: finalPharmacyAmount,
        deliveryAmount: finalDeliveryAmount,
        platformFee: finalPlatformFee,
        updatedAt: serverTimestamp(),
        history: arrayUnion({
          status: nextStatus,
          timestamp: new Date().toISOString(),
          label: isManualCheckNeeded 
            ? `Paiement ${method.toUpperCase()} (USSD) déclaré. En attente de validation par l'administration.` 
            : `Paiement automatique ${method.toUpperCase()} (OTP) validé avec succès.`
        })
      };

      if (nextStatus === 'paid') {
        orderUpdate.deliveryCode = deliveryPin;
        orderUpdate.paymentConfirmedAt = serverTimestamp();
      }

      await updateDoc(doc(db, 'orders', order.id), orderUpdate);

      if (order.prescriptionId) {
        try {
          await updateDoc(doc(db, 'prescriptions', order.prescriptionId), {
            status: 'paid',
            lockedBy: null,
            lockedAt: null
          });
        } catch (e) {
          console.warn("Could not update associated prescription (might be deleted)", e);
        }
      }

      if (isManualCheckNeeded) {
        // Notify Admins
        const adminsQuery = query(collection(db, 'users'), where('role', 'in', ['admin', 'super-admin']));
        const adminsSnap = await getDocs(adminsQuery);
        adminsSnap.forEach(adminDoc => {
          createNotification(adminDoc.id, "Paiement à vérifier", `La commande #${order.id.slice(-6).toUpperCase()} attend votre validation.`, 'payment', order.id);
        });
        
        await createNotification(order.patientId, "Paiement en vérification", `Nous vérifions votre transaction de ${totalToPay} FCFA. Un agent validera votre commande dès réception du SMS de confirmation.`, 'payment', order.id);
      } else {
        if (order.pharmacyId) {
          await updateDoc(doc(db, 'pharmacies', order.pharmacyId), {
            currentActiveOrders: increment(1)
          });
        }
        
        await createNotification(order.patientId, "Paiement confirmé", `Votre paiement de ${totalToPay} FCFA pour la commande #${order.id.slice(-6).toUpperCase()} a été reçu.`, 'payment', order.id);
        if (order.pharmacistId) {
          await createNotification(order.pharmacistId, "Nouveau paiement", `Le patient a payé la commande #${order.id.slice(-6).toUpperCase()}. Vous pouvez commencer la préparation.`, 'payment', order.id);
        }
        
        if (order.deliveryMethod === 'delivery') {
          const cityName = cities.find(c => c.id === order.cityId)?.name || "";
          const deliveryDest = cityName ? `vers ${cityName}` : "pour livraison";
          await notifyDeliveryDrivers("Nouvelle livraison disponible", `Une livraison est prête de ${order.pharmacyName} ${deliveryDest}.`, order.id);
        }
      }

      setPaymentStep('success');
      toast.success(isManualCheckNeeded ? "Transaction envoyée pour vérification." : "Paiement effectué avec succès !");
      
      setTimeout(() => {
        setShowPaymentModal(null);
        setSelectedPaymentMethod(null);
        setPaymentStep('method');
        setPaymentPhone('');
        setPaymentOtp('');
        setPaymentInvoiceId('');
        setPaymentProcessorId('');
      }, 2000);
      
    } catch (error) {
      toast.error("Erreur lors du paiement. Vérifiez votre code OTP.");
      console.error(error);
      setPaymentStep('otp');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleSelectDeliveryMethod = async (orderId: string, method: 'delivery' | 'pickup') => {
    if (method === 'delivery') {
      const fee = calculateDeliveryFee(settings);
      setShowDeliveryConfirm({ orderId, fee });
      return;
    }

    try {
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);
      const orderData = orderSnap.data() as Order;
      const medicationTotal = orderData.medicationTotal || orderData.totalAmount || 0;
      const serviceFee = settings?.serviceFee || 0;
      const newTotal = medicationTotal + serviceFee;

      await updateDoc(orderRef, {
        deliveryMethod: method,
        status: 'pending_payment',
        deliveryFee: 0,
        serviceFee: serviceFee,
        totalAmount: newTotal,
        updatedAt: serverTimestamp(),
        history: arrayUnion({
          status: 'pending_payment',
          timestamp: new Date().toISOString(),
          label: 'Retrait en pharmacie choisi par le patient'
        })
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const confirmDelivery = async () => {
    if (!showDeliveryConfirm) return;
    const { orderId, fee } = showDeliveryConfirm;
    
    try {
      const deliveryCommission = settings?.deliveryCommissionPercentage || 15;
      const platformDeliveryFee = Math.round(fee * (deliveryCommission / 100));
      const deliveryAmount = fee - platformDeliveryFee;

      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);
      const orderData = orderSnap.data() as Order;
      const medicationTotal = orderData.medicationTotal || orderData.totalAmount || 0;
      const serviceFee = settings?.serviceFee || 0;
      const newTotal = medicationTotal + fee + serviceFee;

      await updateDoc(orderRef, {
        deliveryMethod: 'delivery',
        status: 'pending_payment',
        deliveryFee: fee,
        deliveryAmount: deliveryAmount,
        serviceFee: serviceFee,
        totalAmount: newTotal,
        updatedAt: serverTimestamp(),
        history: arrayUnion({
          status: 'pending_payment',
          timestamp: new Date().toISOString(),
          label: 'Livraison à domicile choisie par le patient'
        })
      });

      // Notify delivery drivers that a new delivery request has been made
      await notifyDeliveryDrivers(
        "Nouvelle demande de livraison",
        `Un patient a demandé une livraison. La commande sera disponible dès qu'elle sera prête.`,
        orderId
      );

      setShowDeliveryConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  return (
    <>
    <PullToRefresh onRefresh={async () => {
      // Refreshing logic - most data is real-time via onSnapshot, 
      // but we can force a small delay or re-fetch static settings if needed
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success("Données actualisées");
    }}>
      <div className="relative space-y-4 pb-8 pt-2 md:pt-1 transition-all">
        {viewImage && <ImageViewerModal imageUrl={viewImage} onClose={() => setViewImage(null)} />}
        {/* Background Decorative Element */}
        <div className="fixed inset-0 pharmacy-pattern pointer-events-none -z-10"></div>
        
        {/* Professional Healthcare Portal Header */}
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-emerald-800 via-emerald-900 to-slate-900 p-5 sm:p-6 text-white shadow-xl shadow-emerald-950/15 border border-emerald-600/30">
          <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[11px] font-bold uppercase tracking-wider">
                <ShieldCheck size={13} className="text-emerald-400" />
                <span>Espace Patient • Burkina Faso</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                Bonjour, <span className="capitalize">{profile.name || 'Patient'}</span>
              </h1>
            </div>

            {/* Essential Metrics */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 flex items-center gap-3">
                <div className="text-left">
                  <p className="text-[10px] font-bold text-emerald-200 uppercase tracking-wider">Ordonnances</p>
                  <p className="text-xl font-black text-white leading-none mt-1">{prescriptions.length}</p>
                </div>
              </div>
              <div className="px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 flex items-center gap-3">
                <div className="text-left">
                  <p className="text-[10px] font-bold text-sky-200 uppercase tracking-wider">En cours</p>
                  <p className="text-xl font-black text-white leading-none mt-1">{orders.filter(o => o.status !== 'completed').length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

      {/* Navigation Tabs (Desktop Side, Mobile Bottom) */}
      <div className="flex flex-col md:flex-row gap-8">
        {/* Desktop Sidebar */}
        <div className="hidden md:block w-64 flex-shrink-0">
          <div className="sticky top-24 space-y-2 p-3 bg-white rounded-[2.5rem] border border-emerald-100 shadow-xl shadow-emerald-500/5">
            {[
              { id: 'prescriptions', label: 'Ordonnances', icon: FileText, color: 'text-emerald-600', bg: 'bg-emerald-50', count: prescriptions.length },
              { id: 'orders', label: 'Commandes', icon: Package, color: 'text-sky-600', bg: 'bg-sky-50', count: orders.filter(o => o.status !== 'completed').length },
              { id: 'history', label: 'Historique', icon: Clock, color: 'text-indigo-600', bg: 'bg-indigo-50', count: orders.filter(o => o.status === 'completed').length },
              { id: 'pharmacies', label: 'Pharmacies', icon: MapPin, color: 'text-amber-600', bg: 'bg-amber-50' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => React.startTransition(() => setActiveTab(tab.id as any))}
                className={`w-full flex items-center justify-between gap-4 px-6 py-4 rounded-2xl font-bold transition-all duration-300 ${
                  activeTab === tab.id 
                    ? `${tab.bg} ${tab.color} shadow-sm` 
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-4">
                  <tab.icon size={20} />
                  {tab.label}
                </div>
                {tab.count !== undefined && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === tab.id ? 'bg-white/50' : 'bg-slate-100'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        {createPortal(
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-[49] px-4 pt-1.5 bg-white border-t border-slate-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05),0_-2px_4px_-1px_rgba(0,0,0,0.03)]" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}>
            <div className="flex items-center justify-around">
              {[
                { id: 'prescriptions', label: 'Ordos', icon: FileText, activeColor: 'bg-emerald-500', iconColor: 'text-emerald-500' },
                { id: 'orders', label: 'En cours', icon: Package, activeColor: 'bg-sky-500', iconColor: 'text-sky-500' },
                { id: 'history', label: 'Historique', icon: Clock, activeColor: 'bg-indigo-500', iconColor: 'text-indigo-500' },
                { id: 'pharmacies', label: 'Santé', icon: MapPin, activeColor: 'bg-amber-500', iconColor: 'text-amber-500' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => React.startTransition(() => setActiveTab(tab.id as any))}
                  className="flex flex-col items-center gap-1 min-w-[64px] relative py-1"
                >
                  <div className={`p-1.5 rounded-xl transition-all duration-300 ${
                    activeTab === tab.id 
                      ? `${tab.activeColor} text-white shadow-lg` 
                      : `text-slate-400`
                  }`}>
                    <tab.icon size={18} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
                  </div>
                  <span className={`text-[9px] font-bold ${activeTab === tab.id ? 'text-slate-900' : 'text-slate-400'}`}>
                    {tab.label}
                  </span>
                  {activeTab === tab.id && (
                    <motion.div 
                      layoutId="activeTabUnderline"
                      className={`absolute -bottom-1 w-1 h-1 rounded-full ${tab.iconColor.replace('text-', 'bg-')}`} 
                    />
                  )}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}

        <div className="flex-1 min-w-0 pb-32 md:pb-0">
          <div key={activeTab} className="space-y-6">
              {activeTab === 'prescriptions' && (
                <>
            {/* Prescription Creation Card */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600 mb-1">
                    <FileText size={14} /> Nouvelle Demande
                  </div>
                  <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                    Transmettre une Ordonnance
                  </h3>
                  <p className="text-slate-500 text-sm mt-0.5">
                    Prenez en photo votre ordonnance ou saisissez vos médicaments pour recevoir les offres des pharmacies.
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2 rounded-2xl border border-slate-200 text-xs font-semibold text-slate-700">
                    <MapPin size={15} className="text-emerald-600 shrink-0" />
                    <select
                      value={patientCityId}
                      onChange={(e) => setPatientCityId(e.target.value)}
                      className="bg-transparent outline-none font-bold text-slate-800 cursor-pointer pr-2"
                    >
                      <option value="">Ville (Burkina Faso)...</option>
                      {cities.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <button 
                      onClick={autoDetectCity}
                      disabled={isLocating}
                      title="Détecter ma position GPS"
                      className="p-1 rounded-lg hover:bg-emerald-100 text-emerald-600 transition-colors disabled:opacity-50"
                    >
                      {isLocating ? <div className="w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /> : <Navigation size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Optional details & landmarks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Établissement ou Médecin prescripteur (Optionnel)
                  </label>
                  <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-2xl border border-slate-200 focus-within:border-emerald-500 focus-within:bg-white transition-all">
                    <Hospital size={18} className="text-slate-400 shrink-0" />
                    <input 
                      type="text" 
                      placeholder="Ex: CHU Yalgado, Polyclinique..." 
                      value={hospitalLocation}
                      onChange={(e) => {
                        const val = e.target.value;
                        setHospitalLocation(val);
                        if (val.length > 1) {
                          const filtered = BURKINA_HOSPITALS.filter(h => h.toLowerCase().includes(val.toLowerCase()));
                          setHospitalSuggestions(filtered);
                          setShowHospitalSuggestions(filtered.length > 0);
                        } else {
                          setShowHospitalSuggestions(false);
                        }
                      }}
                      onFocus={() => {
                        if (hospitalLocation.length > 1) {
                          setShowHospitalSuggestions(hospitalSuggestions.length > 0);
                        }
                      }}
                      className="bg-transparent outline-none text-sm w-full font-medium text-slate-800 placeholder:text-slate-400"
                    />
                  </div>
                  
                  {showHospitalSuggestions && (
                    <div className="absolute top-full left-0 w-full bg-white mt-1.5 rounded-2xl shadow-xl border border-slate-100 z-50 max-h-48 overflow-y-auto py-1">
                      {hospitalSuggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 text-sm font-semibold text-slate-700 transition-colors"
                          onClick={() => {
                            setHospitalLocation(suggestion);
                            setShowHospitalSuggestions(false);
                          }}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Repères & Précisions pour la livraison
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-2xl border border-slate-200 focus-within:border-emerald-500 focus-within:bg-white transition-all">
                      <MapPin size={18} className="text-slate-400 shrink-0" />
                      <input 
                        type="text" 
                        placeholder="Quartier, carrefour, porte..." 
                        value={landmark}
                        onChange={(e) => setLandmark(e.target.value)}
                        className="bg-transparent outline-none text-sm w-full font-medium text-slate-800 placeholder:text-slate-400"
                      />
                    </div>
                    <button 
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.capture = 'environment';
                        input.onchange = async (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (file) {
                             const base64 = await compressImage(file, RAM_OPTIMIZED_COMPRESSION.maxWidth, RAM_OPTIMIZED_COMPRESSION.maxHeight, RAM_OPTIMIZED_COMPRESSION.quality);
                             setFacadePhoto(base64);
                             toast.success("Photo de repère enregistrée !");
                          }
                        };
                        input.click();
                      }}
                      className={`h-[46px] px-3.5 rounded-2xl flex items-center gap-1.5 font-bold text-xs transition-all shrink-0 ${facadePhoto ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
                      title="Prendre une photo de la façade ou du portail pour faciliter la livraison"
                    >
                      <Camera size={16} />
                      <span className="hidden sm:inline">{facadePhoto ? "Photo OK" : "Photo Façade"}</span>
                    </button>
                    {facadePhoto && (
                      <button onClick={() => setFacadePhoto(null)} className="w-8 h-8 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-100">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white p-5 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-3 disabled:opacity-50 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    {uploading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera size={20} />}
                  </div>
                  <div className="text-left">
                    <p className="text-base font-extrabold leading-tight">Scanner l'ordonnance</p>
                    <p className="text-xs text-emerald-100 font-normal">Appareil photo ou fichier image</p>
                  </div>
                </button>

                <button 
                  onClick={() => setShowManualEntryModal(true)}
                  disabled={uploading}
                  className="bg-white hover:bg-slate-50 active:scale-[0.99] border-2 border-slate-200 text-slate-800 p-5 rounded-2xl font-bold transition-all flex items-center justify-center gap-3 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 group-hover:scale-110 transition-transform">
                    <PenTool size={18} />
                  </div>
                  <div className="text-left">
                    <p className="text-base font-extrabold leading-tight text-slate-900">Saisie Manuelle / Dictée</p>
                    <p className="text-xs text-slate-500 font-normal">Tapez ou dictez vos médicaments</p>
                  </div>
                </button>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" capture="environment" className="hidden" />
            </div>

            {showManualEntryModal && createPortal(
              <div className="fixed inset-0 bg-slate-900/70 z-[9999] flex items-start sm:items-center justify-center p-4 overflow-y-auto pt-4 backdrop-blur-sm">
                <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl relative my-auto sm:my-0">
                  <button onClick={() => setShowManualEntryModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full p-2">
                    <X size={20} />
                  </button>
                  <h3 className="text-xl font-bold mb-4 text-slate-800">Saisie des médicaments</h3>
                  <p className="text-sm text-slate-500 mb-6">Tapez le nom de vos médicaments ou utilisez le micro pour les dicter.</p>
                  
                  <div className="relative mb-6">
                    <textarea 
                      value={manualEntryText}
                      onChange={(e) => setManualEntryText(e.target.value)}
                      placeholder="Ex: Paracétamol 500mg, 1 boite..."
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 min-h-[120px] text-slate-700 focus:border-primary outline-none transition-all resize-none"
                    />
                    <button 
                      onClick={toggleVoiceInput}
                      className={`absolute bottom-4 right-4 p-3 rounded-full text-white shadow-lg transition-all ${isListening ? 'bg-rose-500 animate-pulse' : 'bg-primary hover:bg-primary/90'}`}
                      title="Dicter"
                    >
                      <Mic size={20} />
                    </button>
                  </div>

                  <button 
                    onClick={handleManualEntrySubmit}
                    disabled={uploading || !manualEntryText.trim()}
                    className="w-full btn-primary py-4 disabled:opacity-50"
                  >
                    {uploading ? "Envoi en cours..." : "Demander des devis"}
                  </button>
                </div>
              </div>,
              document.body
            )}

            {prescriptions.filter(p => !orders.find(o => o.prescriptionId === p.id && o.status === 'completed')).length === 0 ? (
              <div className="bg-white p-10 rounded-[3.5rem] border-2 border-dashed border-slate-100 text-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center text-primary mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                  <FileText size={48} strokeWidth={1.5} />
                </div>
                <p className="text-slate-900 font-black text-2xl mb-2">Aucune ordonnance</p>
                <p className="text-slate-500 text-sm max-w-xs mx-auto mb-8">Prenez en photo votre ordonnance ou saisissez vos médicaments pour recevoir des devis de nos pharmacies partenaires.</p>
                
                <div className="flex flex-col sm:flex-row justify-center gap-4 relative z-10">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="btn-primary flex items-center justify-center gap-3 px-8"
                  >
                    {uploading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <Camera size={20} />}
                    Scanner une ordonnance
                  </button>
                  <button 
                    onClick={() => setShowManualEntryModal(true)}
                    disabled={uploading}
                    className="bg-white border-2 border-primary text-primary hover:bg-primary/5 font-bold rounded-2xl flex items-center justify-center gap-3 px-8 py-4 transition-all"
                  >
                    <PenTool size={20} />
                    Saisie Manuelle / Vocale
                  </button>
                </div>
              </div>
            ) : (
              <PaginatedList
                items={prescriptions.filter(p => !orders.find(o => o.prescriptionId === p.id && o.status === 'completed'))}
                pageSize={10}
                emptyMessage="Aucune ordonnance"
                emptyIcon={<FileText size={36} className="text-slate-400" />}
                renderItem={(p) => (
                  <PatientPrescriptionCard 
                    p={p} 
                    orders={orders} 
                    onViewImage={setViewImage} 
                    onRequestQuote={handleRequestQuote} 
                    onShowPartialSelect={(p) => { setShowPartialSelect(p); setSelectedMeds(p.selectedMedications || []); }} 
                    onDelete={onDeletePrescription}
                  />
                )}
              />
            )}
                </>
              )}

              {activeTab === 'orders' && (
                <div className="max-w-4xl mx-auto space-y-4">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">Mes Commandes</h3>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-10 bg-emerald-600 rounded-full"></div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {orders.filter(o => o.status !== 'completed' && o.status !== 'quote_rejected').length} commandes actives
                      </p>
                    </div>
                  </div>

                  <PaginatedList
                    items={orders.filter(o => o.status !== 'completed' && o.status !== 'quote_rejected')}
                    pageSize={10}
                    emptyMessage="Aucune commande en cours"
                    emptyIcon={<Package size={36} className="text-slate-400" />}
                    renderItem={(o) => (
                      <PatientOrderCard 
                        o={o} 
                        settings={settings} 
                        profile={profile} 
                        onChat={setActiveChatOrderId} 
                        onViewImage={setViewImage} 
                        onApproveQuote={handleApproveQuote} 
                        onSelectDeliveryMethod={handleSelectDeliveryMethod} 
                        onShowMap={setShowMapForOrder} 
                      />
                    )}
                  />
                </div>
              )}

              {activeTab === 'history' && (
                <div className="space-y-4">
                  <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">Historique de Santé</h3>
                  <PaginatedList
                    items={orders.filter(o => o.status === 'completed' || o.status === 'quote_rejected')}
                    pageSize={10}
                    emptyMessage="Historique vide"
                    emptyIcon={<Clock size={36} className="text-slate-400" />}
                    renderItem={(o) => (
                      <PatientOrderCard 
                        o={o} 
                        settings={settings} 
                        profile={profile} 
                        onChat={setActiveChatOrderId} 
                        onViewImage={setViewImage} 
                        onApproveQuote={handleApproveQuote} 
                        onSelectDeliveryMethod={handleSelectDeliveryMethod} 
                        onShowMap={setShowMapForOrder}
                        compact={true}
                      />
                    )}
                  />
                </div>
              )}

              {activeTab === 'pharmacies' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">Pharmacies à proximité</h3>
                    <div className="flex items-center gap-2 text-xs text-slate-500 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs">
                      <Search size={15} />
                      <input 
                        type="text" 
                        placeholder="Rechercher une pharmacie..." 
                        className="bg-transparent outline-none w-44 sm:w-60 text-slate-900"
                        value={pharmacySearch}
                        onChange={(e) => setPharmacySearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <PaginatedList
                    items={pharmacies
                      .filter(ph => {
                        const matchesSearch = ph.name.toLowerCase().includes(pharmacySearch.toLowerCase()) || 
                                              ph.address.toLowerCase().includes(pharmacySearch.toLowerCase()) ||
                                              (ph as any).locality?.toLowerCase().includes(pharmacySearch.toLowerCase());
                        
                        const city = cities.find(c => c.id === ph.cityId);
                        const isOnCallNow = city ? isCityOnCallNow(city.onCallStartTime, city.onCallEndTime) : false;
                        const currentGroup = rotation ? getCurrentOnCallGroup(rotation) : 1;
                        const isMyGroupOnCall = ph.groupId === currentGroup.toString();

                        if (isOnCallNow) {
                          return matchesSearch && isMyGroupOnCall;
                        } else {
                          return matchesSearch;
                        }
                      })
                      .sort((a, b) => {
                        if (!location) return 0;
                        const distA = a.location ? calculateDistance(location.lat, location.lng, a.location.lat, a.location.lng) : Infinity;
                        const distB = b.location ? calculateDistance(location.lat, location.lng, b.location.lat, b.location.lng) : Infinity;
                        return distA - distB;
                      })
                    }
                    pageSize={10}
                    emptyMessage="Aucune pharmacie trouvée"
                    emptyIcon={<MapPin size={36} className="text-slate-400" />}
                    renderItem={(ph) => {
                      const distance = location && ph.location ? calculateDistance(location.lat, location.lng, ph.location.lat, ph.location.lng) : null;
                      const city = cities.find(c => c.id === ph.cityId);
                      const isOnCallNow = city ? isCityOnCallNow(city.onCallStartTime, city.onCallEndTime) : false;
                      const currentGroup = rotation ? getCurrentOnCallGroup(rotation) : 1;
                      const isMyGroupOnCall = ph.groupId === currentGroup.toString();

                      const statusLabel = isOnCallNow ? (isMyGroupOnCall ? 'De Garde' : 'Ouvert') : (isMyGroupOnCall ? 'De Garde Ce Soir' : 'Standard');
                      const statusClasses = isMyGroupOnCall 
                        ? 'bg-amber-50 text-amber-700 border-amber-200/80' 
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200/80';

                      return (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 font-bold shrink-0 border border-emerald-100">
                              <Plus size={18} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-slate-900 text-sm">{ph.name}</h4>
                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusClasses}`}>
                                  {statusLabel}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">{ph.address} • {city?.name || 'Burkina Faso'}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3 justify-between sm:justify-end text-xs">
                            {distance !== null && (
                              <span className="font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
                                {distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}
                              </span>
                            )}
                            {ph.phone && (
                              <a 
                                href={`tel:${ph.phone}`} 
                                className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
                              >
                                <Phone size={13} />
                                <span>Appeler</span>
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    }}
                  />
                </div>
              )}
            </div>
        </div>
      </div>

      {/* Payment Modal */}
      <>
        {showPaymentModal && createPortal(
          <div className="fixed inset-0 bg-slate-900/75 z-[200] flex items-start sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white rounded-t-[2rem] sm:rounded-[2.5rem] shadow-2xl max-w-md w-full p-6 sm:p-8 text-center relative flex flex-col max-h-[85vh] overflow-y-auto pb-10 sm:pb-8"
            >
              <button 
                onClick={() => {
                  setShowPaymentModal(null);
                  setSelectedPaymentMethod(null);
                }}
                className="absolute top-4 right-4 w-8 h-8 sm:w-10 sm:h-10 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full flex items-center justify-center transition-colors z-50"
                aria-label="Fermer"
              >
                <X size={20} />
              </button>
              {isProcessingPayment && (
                <div className="absolute inset-0 bg-white/95 z-10 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="font-bold text-slate-700">Traitement du paiement...</p>
                  <p className="text-xs text-slate-500 mt-2">Veuillez patienter.</p>
                </div>
              )}
              
              {!selectedPaymentMethod && (
                <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mx-auto mb-4">
                  <CreditCard size={32} />
                </div>
              )}
              <h3 className="text-xl font-bold mb-2">Paiement Sécurisé</h3>
              
              {!selectedPaymentMethod && (
                <p className="text-slate-500 mb-4 text-xs">
                  Choisissez une méthode pour la commande <span className="font-bold text-slate-900">#{showPaymentModal.id.slice(-6).toUpperCase()}</span>
                </p>
              )}
              
              <div className="bg-slate-50 p-3 rounded-xl mb-6 flex justify-between items-center border border-slate-100 shadow-inner">
                <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Total</span>
                <span className="text-xl font-black text-emerald-600">{(showPaymentModal.totalAmount || 0).toLocaleString()} FCFA</span>
              </div>

              <div className="space-y-4">
                {(!settings?.paymentConfig || settings.paymentConfig.mobileMoneyEnabled) && !selectedPaymentMethod && (
                  <>
                    <p className="text-left text-sm font-bold text-slate-700 mb-2">Mobile Money (Burkina Faso)</p>
                    <div className="grid grid-cols-2 gap-3">
                      {(!settings?.paymentConfig?.enabledProcessors || settings.paymentConfig.enabledProcessors.orange !== false) && (
                        <button 
                          onClick={() => setSelectedPaymentMethod('orange')}
                          className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-slate-100 hover:border-orange-500 hover:bg-orange-50 transition-all gap-2"
                        >
                          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm overflow-hidden p-1 border border-slate-100">
                             <img src="/payments/orange.png" alt="Orange" referrerPolicy="no-referrer" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.src = "https://upload.wikimedia.org/wikipedia/commons/c/c8/Orange_logo.svg"; }} />
                          </div>
                          <span className="text-xs font-bold text-slate-700">Orange Money</span>
                        </button>
                      )}
                      {(!settings?.paymentConfig?.enabledProcessors || settings.paymentConfig.enabledProcessors.moov !== false) && (
                        <button 
                          onClick={() => setSelectedPaymentMethod('moov')}
                          className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-slate-100 hover:border-blue-600 hover:bg-blue-50 transition-all gap-2"
                        >
                          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm overflow-hidden p-2 border border-slate-100">
                             <img src="/payments/moov.png" alt="Moov" referrerPolicy="no-referrer" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.src = "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Moov_Africa_Logo.png/640px-Moov_Africa_Logo.png"; }} />
                          </div>
                          <span className="text-xs font-bold text-slate-700">Moov Money</span>
                        </button>
                      )}
                      {(!settings?.paymentConfig?.enabledProcessors || settings.paymentConfig.enabledProcessors.telecel !== false) && (
                        <button 
                          onClick={() => setSelectedPaymentMethod('telecel')}
                          className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-slate-100 hover:border-red-600 hover:bg-red-50 transition-all gap-2"
                        >
                          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm overflow-hidden p-1 border border-slate-100">
                             <img src="/payments/telecel-1.png" alt="Telecel" referrerPolicy="no-referrer" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.src = "/payments/telecel.png"; }} />
                          </div>
                          <span className="text-xs font-bold text-slate-700">Telecel Money</span>
                        </button>
                      )}
                      {(!settings?.paymentConfig?.enabledProcessors || settings.paymentConfig.enabledProcessors.coris !== false) && (
                        <button 
                          onClick={() => setSelectedPaymentMethod('coris')}
                          className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-slate-100 hover:border-sky-600 hover:bg-sky-50 transition-all gap-2"
                        >
                          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm overflow-hidden p-2 border border-slate-100">
                             <img src="/payments/coris.png" alt="Coris" referrerPolicy="no-referrer" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = '<span class="text-sky-600 font-black text-[12px]">CORIS</span>'; }} />
                          </div>
                          <span className="text-xs font-bold text-slate-700">Coris Money</span>
                        </button>
                      )}
                    </div>
                  </>
                )}

                {selectedPaymentMethod && (
                  <div className="space-y-4 text-left animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex flex-col gap-1">
                        <p className="font-bold text-slate-900 flex items-center gap-2">
                          <button onClick={() => {
                            setSelectedPaymentMethod(null);
                            setPaymentStep('method');
                            setMmMode(null);
                          }} className="p-1 hover:bg-slate-100 rounded-lg"><ChevronRight className="rotate-180" size={16}/></button>
                          Paiement {selectedPaymentMethod.toUpperCase()}
                        </p>
                        {settings?.paymentConfig?.testMode && (
                          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full border border-amber-200 self-start ml-8">
                            <AlertCircle size={10} />
                            <span className="text-[10px] font-black uppercase tracking-wider">Mode Test Actif</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Flow: Choosing Mode OR Processing Mode */}
                    {paymentStep === 'method' && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                        {!mmMode ? (
                          <div className="grid grid-cols-2 gap-3">
                            <button 
                              onClick={() => setMmMode('otp')}
                              className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-slate-100 hover:border-emerald-500 hover:bg-emerald-50 transition-all gap-2"
                            >
                              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-emerald-600">
                                <Smartphone size={20} />
                              </div>
                              <span className="text-xs font-bold text-slate-700">Code OTP</span>
                              <span className="text-[9px] text-slate-400">Automatique</span>
                            </button>
                            <button 
                              onClick={() => setMmMode('ussd')}
                              className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all gap-2"
                            >
                              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-blue-600">
                                <Phone size={20} />
                              </div>
                              <span className="text-xs font-bold text-slate-700">Saisie USSD</span>
                              <span className="text-[9px] text-slate-400">Confirmation manuelle</span>
                            </button>
                          </div>
                        ) : mmMode === 'otp' ? (
                          <div className="space-y-4 animate-in slide-in-from-right-4">
                            <div className="space-y-1.5 text-left">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Numéro de téléphone</label>
                              <input 
                                type="tel" 
                                placeholder="Ex: 70000000"
                                value={paymentPhone}
                                onChange={(e) => setPaymentPhone(e.target.value)}
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold focus:border-primary outline-none transition-all shadow-inner"
                              />
                            </div>
                            <button 
                              onClick={() => initPayment(selectedPaymentMethod)}
                              disabled={isProcessingPayment || !paymentPhone}
                              className="btn-primary w-full flex items-center justify-center gap-3 py-4"
                            >
                              {['moov', 'coris'].includes(selectedPaymentMethod) ? (
                                <>
                                  <Smartphone size={20} />
                                  Déclencher l'envoi SMS
                                </>
                              ) : (
                                <>
                                  <ArrowRight size={20} />
                                  Continuer le paiement
                                </>
                              )}
                            </button>
                            {['orange', 'telecel'].includes(selectedPaymentMethod) && (
                              <p className="text-[10px] text-slate-500 italic mt-2 text-center">
                                Note: Préparez votre code OTP en composant {selectedPaymentMethod === 'orange' ? '*144*4*6#' : '*808*4*4#'} sur votre mobile.
                              </p>
                            )}
                            {selectedPaymentMethod === 'coris' && mmMode === 'otp' && (
                              <p className="text-[10px] text-slate-500 italic mt-2 text-center">
                                Coris Money : Vous recevrez un SMS avec votre code de confirmation.
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-4 animate-in slide-in-from-right-4">
                            <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl space-y-3">
                              <p className="text-[11px] text-blue-800 font-bold text-left">Instructions USSD :</p>
                              <p className="text-[10px] text-blue-700 leading-relaxed font-mono bg-white p-2 rounded-lg border border-blue-100 text-center">
                                {selectedPaymentMethod === 'orange' ? '*144*4*6*' : selectedPaymentMethod === 'moov' ? '*555*2*1*' : selectedPaymentMethod === 'coris' ? '*550#' : '*808*4*4*'}{showPaymentModal.totalAmount}#
                              </p>
                              <p className="text-[10px] text-blue-700 italic text-left">
                                Une fois le transfert effectué, saisissez la référence de la transaction reçue par SMS.
                              </p>
                            </div>
                            <div className="space-y-1.5 text-left">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Référence Transaction / ID</label>
                              <input 
                                type="text" 
                                placeholder="ID de la transaction"
                                value={paymentOtp}
                                onChange={(e) => setPaymentOtp(e.target.value)}
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold focus:border-primary outline-none transition-all shadow-inner"
                              />
                            </div>
                            <button 
                              onClick={() => performPayment(selectedPaymentMethod)}
                              disabled={isProcessingPayment || !paymentOtp}
                              className="btn-primary w-full py-4 text-center"
                            >
                              Confirmer le paiement
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {paymentStep === 'otp' && (
                      <div className="space-y-4 animate-in zoom-in-95 text-left">
                        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex gap-3 shadow-sm">
                          <Smartphone className="text-emerald-500" size={18} />
                          <div className="flex flex-col gap-1">
                            <p className="text-[11px] text-emerald-800 font-bold">Code de sécurité reçu ?</p>
                            <p className="text-[10px] text-emerald-700 leading-relaxed font-medium">
                              Veuillez saisir le code reçu par SMS sur le numéro <span className="font-bold">{paymentPhone}</span>.
                            </p>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Code de confirmation (OTP)</label>
                          <input 
                            type="text" 
                            placeholder="000000"
                            value={paymentOtp}
                            onChange={(e) => setPaymentOtp(e.target.value)}
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-mono text-2xl font-black text-center tracking-widest focus:border-primary outline-none transition-all shadow-inner"
                          />
                        </div>
                        <button 
                          onClick={() => performPayment(selectedPaymentMethod)}
                          disabled={isProcessingPayment || !paymentOtp}
                          className="btn-primary w-full flex items-center justify-center gap-3 py-4"
                        >
                          <CheckCircle size={20} />
                          Finaliser le paiement
                        </button>
                        <button 
                          onClick={() => {
                            setPaymentStep('method');
                            setPaymentInvoiceId('');
                          }}
                          className="w-full text-center text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors py-2"
                        >
                          Modifier le numéro
                        </button>
                      </div>
                    )}

                    {/* SUCCESS STATE */}
                    {paymentStep === 'success' && (
                       <div className="py-10 flex flex-col items-center justify-center text-center gap-4 animate-in zoom-in">
                          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-inner"><CheckCircle size={32} /></div>
                          <p className="text-lg font-black text-emerald-600 uppercase tracking-widest">Paiement Validé !</p>
                       </div>
                    )}
                  </div>
                )}

                {/* Other payment methods removed as requested */}

                {/* Bank transfer logic removed as requested */}
                
                {!selectedPaymentMethod && (
                  <button 
                    onClick={() => {
                      setShowPaymentModal(null);
                      setSelectedPaymentMethod(null);
                      setPaymentPhone('');
                    }}
                    disabled={isProcessingPayment}
                    className="w-full bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all mt-4"
                  >
                    Annuler
                  </button>
                )}
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </>

      {/* Delivery Confirmation Modal */}
      <>
        {showDeliveryConfirm && createPortal(
          <div className="fixed inset-0 bg-slate-900/75 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full p-8 text-center"
            >
              <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center text-emerald-600 mx-auto mb-6">
                <Truck size={40} />
              </div>
              <h3 className="text-2xl font-bold mb-4">Confirmer la livraison</h3>
              <p className="text-slate-500 mb-8">
                Des frais de livraison de <span className="font-bold text-primary">{showDeliveryConfirm.fee} CFA</span> s'appliquent pour cette commande.
                <span className="block mt-2 text-xs">
                  {showDeliveryConfirm.fee === settings?.nightDeliveryFee ? 'Tarif de nuit appliqué (Risque)' : 'Tarif de journée appliqué'}
                </span>
              </p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={confirmDelivery}
                  className="btn-primary w-full"
                >
                  Confirmer et Payer {showDeliveryConfirm.fee} CFA
                </button>
                <button 
                  onClick={() => setShowDeliveryConfirm(null)}
                  className="w-full bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                >
                  Annuler
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </>

      {/* Payment Methods Section (Burkina Context) */}
      <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
        
        <div className="relative">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
              <ShieldCheck size={28} />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-900">Paiement Sécurisé</h3>
              <p className="text-slate-500 text-sm">Choisissez votre mode de paiement mobile préféré au Burkina Faso.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { id: 'om', name: 'Orange Money', color: 'bg-white', borderColor: 'border-slate-100', logo: '/payments/orange.png', desc: 'Paiement instantané' },
              { id: 'moov', name: 'Moov Money', color: 'bg-white', borderColor: 'border-slate-100', logo: '/payments/moov.png', desc: 'Simple et rapide' },
              { id: 'telecel', name: 'Telecel Money', color: 'bg-white', borderColor: 'border-slate-100', logo: '/payments/telecel.png', fallbackText: 'TELECEL', desc: 'Liberté de payer' },
              { id: 'coris', name: 'Coris Money', color: 'bg-white', borderColor: 'border-slate-100', logo: '/payments/coris.png', fallbackText: 'CORIS', desc: 'Solution bancaire' },
            ].map((m) => (
              <div key={m.id} className="group relative bg-white p-4 rounded-2xl border border-slate-100 ring-2 ring-transparent hover:border-transparent hover:ring-primary/20 hover:shadow-lg transition-all duration-300 cursor-default">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 shrink-0 ${m.color} border border-slate-100/50 rounded-xl flex items-center justify-center overflow-hidden p-1.5 group-hover:scale-105 transition-transform duration-300 shadow-sm`}>
                    {m.logo ? <img src={m.logo} alt={m.name} referrerPolicy="no-referrer" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = `<span class="text-[10px] font-black text-center leading-tight text-slate-600">${m.fallbackText || m.name}</span>`; }} /> : null}
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <span className="block text-[14px] font-black text-slate-900 leading-tight">{m.name}</span>
                    <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{m.desc}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <AlertCircle size={18} className="text-slate-400" />
            <p className="text-xs text-slate-500 italic">
              Le paiement est traité via une passerelle sécurisée. Vos informations bancaires ne sont jamais stockées sur nos serveurs.
            </p>
          </div>
        </div>
      </div>

      {/* Partial Selection Modal */}
      <>
        {showPartialSelect && createPortal(
          <div className="fixed inset-0 bg-slate-900/75 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-lg w-full p-8"
            >
              <h3 className="text-2xl font-bold mb-4">Choisir les médicaments</h3>
              <p className="text-slate-500 mb-6 text-sm">Sélectionnez les médicaments pour lesquels vous souhaitez un devis.</p>
              
              <div className="space-y-3 max-h-60 overflow-y-auto mb-8 pr-2">
                {(() => {
                  try {
                    const jsonStr = showPartialSelect.extractedData?.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0];
                    if (!jsonStr) return <p className="text-slate-400 italic">Aucun médicament détecté.</p>;
                    const parsed = JSON.parse(jsonStr);
                    const meds = Array.isArray(parsed) ? parsed : (parsed.articles || parsed.prescriptions || parsed.medications || parsed.medicaments || Object.values(parsed).find(v => Array.isArray(v)) || []);
                    
                    if (!meds || meds.length === 0) {
                      return <p className="text-slate-400 italic">Aucun médicament détecté ou format non reconnu.</p>;
                    }

                    return meds.map((m: any, i: number) => {
                      const name = typeof m === 'string' ? m : (m.nom_article || m.name || m.medicament || 'Médicament inconnu');
                      const dosage = typeof m === 'string' ? '' : (m.dosage || '');
                      const isSelected = selectedMeds.includes(name);
                      return (
                        <label key={`${name}-${i}`} className={`flex items-center gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${isSelected ? 'bg-primary/5 border-primary' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}>
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => {
                              if (isSelected) {
                                setSelectedMeds(selectedMeds.filter(sm => sm !== name));
                              } else {
                                setSelectedMeds([...selectedMeds, name]);
                              }
                            }}
                            className="w-5 h-5 rounded-lg border-slate-300 text-primary focus:ring-primary"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-bold text-slate-900">{name}</p>
                            {dosage && <p className="text-[10px] text-slate-500">{dosage}</p>}
                          </div>
                        </label>
                      );
                    });
                  } catch (e) { return null; }
                })()}
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => handleRequestQuote(showPartialSelect, selectedMeds.length > 0 ? 'partial' : 'all', selectedMeds)}
                  className="btn-primary w-full"
                >
                  {selectedMeds.length > 0 ? `Demander un devis pour ${selectedMeds.length} article(s)` : "Demander un devis pour TOUS les articles"}
                </button>
                <button 
                  onClick={() => setShowPartialSelect(null)}
                  className="w-full bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                >
                  Annuler
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </>

      {/* Map Modal for Patient */}
      <>
        {showMapForOrder && createPortal(
          <div className="fixed inset-0 bg-slate-900/75 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-2xl w-full p-8"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold">Localisation de la Pharmacie</h3>
                  <p className="text-slate-500 text-sm">{showMapForOrder.pharmacyName}</p>
                </div>
                <button onClick={() => setShowMapForOrder(null)} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>
              
              <React.Suspense fallback={<div className="h-[300px] w-full bg-slate-100 animate-pulse rounded-2xl flex items-center justify-center font-bold text-slate-400">Chargement de la carte...</div>}>
                <MapComponent 
                  center={showMapForOrder.deliveryLocation ? [showMapForOrder.deliveryLocation.lat, showMapForOrder.deliveryLocation.lng] : (showMapForOrder.pharmacyLocationCoords ? [showMapForOrder.pharmacyLocationCoords.lat, showMapForOrder.pharmacyLocationCoords.lng] : [12.3714, -1.5197])}
                  markers={[
                    { pos: location ? [location.lat, location.lng] : [12.3714, -1.5197], label: "Moi (Patient)", color: "red", type: 'patient' },
                    { 
                      pos: showMapForOrder.pharmacyLocationCoords ? [showMapForOrder.pharmacyLocationCoords.lat, showMapForOrder.pharmacyLocationCoords.lng] : [12.3800, -1.5100], 
                      label: `Pharmacie: ${showMapForOrder.pharmacyName}`, 
                      color: "green", 
                      type: 'pharmacy' 
                    },
                    ...(showMapForOrder.driverLocation ? [{
                      pos: [showMapForOrder.driverLocation.lat, showMapForOrder.driverLocation.lng] as [number, number],
                      label: "Livreur",
                      color: "blue",
                      type: 'delivery' as const
                    }] : [])
                  ]}
                />
              </React.Suspense>

              <div className="mt-6 p-6 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm">
                  <MapPin size={24} />
                </div>
                <div>
                  <p className="font-bold text-emerald-900">{showMapForOrder.pharmacyName}</p>
                  <p className="text-sm text-emerald-700">{showMapForOrder.pharmacyLocation}</p>
                </div>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </>
    </div>
  </PullToRefresh>
  {activeChatOrderId && (
    <Suspense fallback={null}>
      <OrderChat 
        orderId={activeChatOrderId} 
        userId={profile.uid} 
        userName={profile.name} 
        userRole={profile.role}
        onClose={() => setActiveChatOrderId(null)} 
      />
    </Suspense>
  )}
  </>
  );
});

function WithdrawalModal({ 
  profile, 
  onClose,
  availableBalance
}: { 
  profile: UserProfile, 
  onClose: () => void,
  availableBalance: number
}) {
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState('mobile_money');
  const [paymentDetails, setPaymentDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (paymentMethod === 'mobile_money') {
      setPaymentDetails(profile.compensationPhone || profile.phone || '');
    } else if (paymentMethod === 'bank_transfer') {
      setPaymentDetails(profile.compensationRIB || '');
    }
  }, [paymentMethod, profile.compensationPhone, profile.compensationRIB, profile.phone]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) {
      toast.error("Veuillez entrer un montant valide.");
      return;
    }
    if (amount > availableBalance) {
      toast.error("Gains insuffisants pour ce retrait.");
      return;
    }
    if (!paymentDetails) {
      toast.error("Veuillez fournir les détails de paiement.");
      return;
    }

    setIsSubmitting(true);
    try {
      const withdrawalRef = doc(collection(db, 'withdrawals'));
      await setDoc(withdrawalRef, {
        id: withdrawalRef.id,
        userId: profile.uid,
        userName: profile.name,
        userRole: profile.role,
        amount: Number(amount),
        status: 'pending',
        paymentMethod,
        paymentDetails,
        createdAt: serverTimestamp()
      });

      const balanceField = profile.role === 'pharmacist' ? 'pharmacistBalance' : 
                          profile.role === 'delivery' ? 'deliveryBalance' : 'walletBalance';
      
      await updateDoc(doc(db, 'users', profile.uid), {
        [balanceField]: increment(-Number(amount)),
        walletBalance: increment(-Number(amount))
      });

      await logTransaction(profile.uid, profile.name, profile.role, Number(amount), 'debit', `Demande de retrait via ${paymentMethod}`, withdrawalRef.id);
      await createNotification(profile.uid, "Demande de retrait", `Votre demande de retrait de ${amount} FCFA a été envoyée.`, 'withdrawal', withdrawalRef.id);

      toast.success("Demande de retrait envoyée avec succès.");
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'withdrawals');
      toast.error("Erreur lors de la demande.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl"
      >
        <h3 className="text-2xl font-bold mb-6">Demander un retrait</h3>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Montant (CFA)</label>
            <input 
              type="number" 
              value={amount}
              onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
              className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
              placeholder="Ex: 10000"
              min="1"
            />
            <p className="text-xs text-slate-400 text-right">Max: {availableBalance.toLocaleString()} CFA</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Méthode de paiement</label>
            <select 
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
            >
              <option value="mobile_money">Mobile Money (Orange/Moov/Telecel)</option>
              <option value="bank_transfer">Virement Bancaire</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">
              {paymentMethod === 'mobile_money' ? 'Numéro de téléphone' : 'RIB / IBAN'}
            </label>
            <input 
              type="text" 
              value={paymentDetails}
              onChange={(e) => setPaymentDetails(e.target.value)}
              className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
              placeholder={paymentMethod === 'mobile_money' ? "Ex: +226 70 00 00 00" : "Ex: BF000..."}
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-colors"
            >
              Annuler
            </button>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-emerald-600 text-white px-6 py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
            >
              {isSubmitting ? "Envoi..." : "Confirmer"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>,
    document.body
  );
}

const PharmacistPrescriptionCard = React.memo(({ 
  p, 
  onStartQuote, 
  onReject,
  onViewImage
}: { 
  p: Prescription, 
  onStartQuote: (p: Prescription) => Promise<void> | void, 
  onReject: (id: string, status: 'validated' | 'rejected', reason?: string) => Promise<void> | void,
  onViewImage: (url: string) => void
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('Ordonnance illisible ou endommagée');
  const [otherReason, setOtherReason] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const rejectionOptions = [
    "Ordonnance illisible ou endommagée",
    "Médicaments non disponibles en stock",
    "Ordonnance périmée",
    "Quantité de médicaments non conforme",
    "Signature ou cachet du médecin manquant",
    "Contenu de l'ordonnance non clair",
    "Ordonnance déjà traitée",
    "Autre"
  ];
  
  return (
    <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-all p-5 flex flex-col gap-4">
      {showRejectionModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-md space-y-6 shadow-2xl border border-slate-50 relative overflow-visible">
            <div>
              <h3 className="font-extrabold text-2xl text-slate-900 leading-tight">Motif du rejet</h3>
              <p className="text-sm text-slate-500 mt-1">Veuillez indiquer pourquoi vous rejetez cette ordonnance.</p>
            </div>

            <div className="relative">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Sélectionnez une raison</label>
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full p-4 rounded-2xl border border-slate-200 bg-slate-50 text-left font-extrabold text-slate-800 flex justify-between items-center hover:bg-slate-100/50 transition-all focus:ring-2 focus:ring-rose-500/20 active:scale-[0.99]"
              >
                <span className="truncate">{rejectionReason}</span>
                <ChevronDown size={20} className={`text-slate-400 transition-transform duration-300 shrink-0 ml-2 ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-[40]" 
                    onClick={() => setIsDropdownOpen(false)} 
                  />
                  <div className="absolute top-full left-0 w-full bg-white mt-2 rounded-2xl shadow-xl border border-slate-100 z-[50] max-h-60 overflow-y-auto py-2 animate-in fade-in slide-in-from-top-2 duration-200 scrollbar-thin">
                    {rejectionOptions.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setRejectionReason(opt);
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full text-left px-5 py-3 text-sm font-bold transition-colors flex items-center justify-between ${
                          rejectionReason === opt 
                            ? 'bg-rose-50 text-rose-600' 
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{opt}</span>
                        {rejectionReason === opt && <CheckCircle2 size={16} className="text-rose-600 shrink-0 ml-2" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {rejectionReason === 'Autre' && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Description personnalisée</label>
                <input 
                  value={otherReason} 
                  onChange={(e) => setOtherReason(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 focus:border-rose-500 outline-none rounded-2xl font-bold transition-all focus:ring-2 focus:ring-rose-500/20"
                  placeholder="Expliquez la raison en détails..."
                />
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => {
                  setShowRejectionModal(false);
                  setIsDropdownOpen(false);
                }} 
                className="flex-1 py-4 border border-slate-200 rounded-2xl font-extrabold text-slate-600 hover:bg-slate-50 active:scale-[0.98] transition-all"
              >
                Annuler
              </button>
              <button 
                disabled={isLoading || (rejectionReason === 'Autre' && !otherReason.trim())}
                onClick={async () => {
                  setIsLoading(true);
                  try {
                    await onReject(p.id, 'rejected', rejectionReason === 'Autre' ? otherReason : rejectionReason);
                    setShowRejectionModal(false);
                    setIsDropdownOpen(false);
                  } finally { setIsLoading(false); }
                }}
                className="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-4 rounded-2xl font-extrabold active:scale-[0.98] transition-all shadow-lg shadow-rose-500/10 disabled:opacity-50 disabled:pointer-events-none"
              >
                {isLoading ? 'Action...' : 'Confirmer le rejet'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">
          <div 
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shrink-0 cursor-pointer relative group/img"
            onClick={() => onViewImage(p.imageUrl)}
          >
            <img src={p.imageUrl} alt="Ordo" className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300" loading="lazy" />
            <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-center justify-center">
              <div className="w-6 h-6 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                <Search className="text-white" size={12} />
              </div>
            </div>
          </div>
          
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black text-slate-900 dark:text-white leading-none">#{p.id.slice(-6).toUpperCase()}</span>
              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                <Clock size={11} />
                {p.createdAt?.toDate ? formatDate(p.createdAt.toDate(), 'dateTime') : 'Récents'}
              </div>
              <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase">
                <MapPin size={10} />
                {p.distance || 2} km
              </div>
              {p.requestType === 'partial' ? (
                <span className="text-[9px] bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/50 px-2 py-0.5 rounded-lg font-black uppercase flex items-center gap-1">
                  <Package size={10} /> Partiel
                </span>
              ) : (
                <span className="text-[9px] bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/50 px-2 py-0.5 rounded-lg font-black uppercase flex items-center gap-1">
                  <CheckCircle size={10} /> Complet
                </span>
              )}
            </div>

            {p.landmark && (
              <div className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-lg font-medium border border-amber-200/40 dark:border-amber-800/40 w-fit max-w-full">
                <MapPin size={10} className="shrink-0" />
                <span className="truncate italic">Repère : {p.landmark}</span>
              </div>
            )}

            {/* Extracted meds horizontal pills */}
            <div className="text-[11px] text-slate-600 dark:text-slate-300">
              {p.extractedData ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Articles :</span>
                  {(() => {
                    try {
                      const jsonStr = p.extractedData?.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0];
                      if (!jsonStr) return <p className="text-slate-500 text-xs italic truncate">{p.extractedData || 'Non structuré'}</p>;
                      const parsed = JSON.parse(jsonStr);
                      const meds = Array.isArray(parsed) ? parsed : (parsed.prescriptions || parsed.medications || parsed.medicaments || Object.values(parsed).find(v => Array.isArray(v)) || []);
                      
                      const displayMeds = p.requestType === 'partial' && p.selectedMedications
                        ? meds.filter((m: any) => p.selectedMedications?.includes(typeof m === 'string' ? m : (m.nom_article || m.name || m.medicament)))
                        : meds;

                      return displayMeds.map((m: any, i: number) => {
                        const name = typeof m === 'string' ? m : (m.nom_article || m.name || m.medicament || 'Inconnu');
                        return (
                          <span key={`${name}-${i}`} className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded-md text-[10px] font-bold border border-slate-200/60 dark:border-slate-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                            <span className="truncate max-w-[140px]">{name}</span>
                          </span>
                        );
                      });
                    } catch (e) {
                      return <p className="truncate text-xs">{p.extractedData}</p>;
                    }
                  })()}
                </div>
              ) : (
                <span className="flex items-center gap-2 text-xs text-slate-400"><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div> Analyse et extraction en cours...</span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 self-stretch md:self-center shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
          <button 
            onClick={async () => {
              setIsLoading(true);
              try { await onStartQuote(p); } finally { setIsLoading(false); }
            }}
            disabled={isLoading}
            className="flex-1 md:flex-initial bg-primary hover:bg-primary/90 text-white px-5 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl shadow-md shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {isLoading ? '...' : 'Établir le Devis'}
          </button>
          <button 
            onClick={() => setShowRejectionModal(true)}
            disabled={isLoading}
            className="p-2.5 bg-rose-50 dark:bg-rose-950/40 text-rose-500 dark:text-rose-400 rounded-xl font-bold hover:bg-rose-500 hover:text-white transition-all border border-rose-200/50 dark:border-rose-900/50 disabled:opacity-50 flex items-center justify-center gap-1.5"
            title="Rejeter l'ordonnance"
          >
            <X size={16} />
            <span className="md:hidden text-xs font-black uppercase">Rejeter</span>
          </button>
        </div>
      </div>
    </div>
  );
});

const PharmacistOrderCard = React.memo(({ 
  o, 
  profile, 
  onChat, 
  onViewImage, 
  onHandover, 
  onUpdateStatus 
}: { 
  o: Order, 
  profile: any, 
  onChat: (id: string) => void, 
  onViewImage: (url: string) => void, 
  onHandover: (o: Order) => void, 
  onUpdateStatus: (o: Order) => void 
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 p-3 sm:p-3.5 rounded-xl shadow-xs border border-slate-200/80 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:border-emerald-500/40 hover:shadow-xs transition-all">
      {/* Left: Patient Info & Header */}
      <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
        {o.prescriptionImageUrl ? (
          <div 
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 cursor-pointer relative group/img"
            onClick={() => onViewImage(o.prescriptionImageUrl!)}
          >
            <img src={o.prescriptionImageUrl} alt="Ordo" className="w-full h-full object-cover group-hover/img:scale-105 transition-transform" loading="lazy" />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs flex items-center justify-center text-slate-500 dark:text-slate-400 font-black text-[11px] shrink-0">
            {o.id.slice(-2).toUpperCase()}
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-xs font-black text-slate-900 dark:text-white leading-none">#{o.id.slice(-6).toUpperCase()}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{o.patientName}</p>
            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider ${
              o.status === 'paid' ? 'bg-emerald-500 text-white' : 
              o.status === 'verifying_payment' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400' :
              o.status === 'preparing' ? 'bg-indigo-500 text-white' :
              o.status === 'ready' ? 'bg-emerald-600 text-white' :
              o.status === 'delivering' ? 'bg-sky-500 text-white' :
              'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}>
              {getOrderStatusLabel(o.status)}
            </span>
            {o.quoteType === 'partial' ? (
              <span className="text-[8px] bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 px-1 rounded-md font-black uppercase">Devis Partiel</span>
            ) : (
              <span className="text-[8px] bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 px-1 rounded-md font-black uppercase">Devis Complet</span>
            )}
          </div>

          {/* Articles pills */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Articles :</span>
            {o.items?.slice(0, 3).map((item, i) => (
              <span key={i} className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded-md font-semibold border border-slate-200/50 dark:border-slate-700 truncate max-w-[130px]">
                {item.name} x{item.quantity}
              </span>
            ))}
            {o.items && o.items.length > 3 && (
              <span className="text-[9px] text-slate-400 font-bold">+{o.items.length - 3} autres</span>
            )}
          </div>

          {/* Gain Net */}
          <div className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
            Gain Net Estimé : <span className="font-black text-xs">{o.pharmacyAmount?.toLocaleString()} FCFA</span>
          </div>
        </div>
      </div>

      {/* Right: Actions & Status */}
      <div className="flex flex-wrap items-center gap-1.5 self-stretch lg:self-center shrink-0 pt-1.5 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
        {o.deliveryId && !o.isHandedOver && o.deliveryMethod === 'delivery' && (
          <button 
            onClick={() => onHandover(o)}
            className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-xs"
          >
            <ShieldCheck size={14} />
            Remettre au livreur ({o.deliveryPersonName})
          </button>
        )}

        {o.status === 'ready' && o.deliveryMethod === 'pickup' && (
          <button 
            onClick={() => onHandover(o)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
          >
            <CheckCircle size={14} />
            Confirmer le retrait
          </button>
        )}

        {o.status === 'delivering' && o.isHandedOver && (
          <div className="bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-lg border border-emerald-200/50 dark:border-emerald-800/50 flex items-center gap-1 text-xs font-medium">
            <CheckCircle className="text-emerald-500" size={13} />
            Remis au livreur
          </div>
        )}

        {o.status === 'pending_quote' ? (
          <span className="text-xs text-slate-400 font-medium px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
            En attente de validation client
          </span>
        ) : o.status === 'pending_payment' ? (
          <span className="text-xs text-slate-400 font-medium px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
            En attente de paiement client
          </span>
        ) : o.status === 'verifying_payment' ? (
          <div className="px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 rounded-lg border border-indigo-200/50 dark:border-indigo-800/50 flex items-center gap-1 text-xs font-bold">
            <ShieldCheck size={13} />
            Validation Admin
          </div>
        ) : o.status === 'ready' && !o.deliveryMethod ? (
          <span className="text-xs text-amber-700 dark:text-amber-400 font-bold px-2.5 py-1.5 bg-amber-50 dark:bg-amber-950/50 rounded-lg">
            En attente choix livraison
          </span>
        ) : (o.status === 'paid' || o.status === 'preparing') ? (
          <button 
            onClick={() => onUpdateStatus(o)}
            className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-3 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-100 transition-all flex items-center gap-1"
          >
            {o.status === 'paid' ? 'Préparer' : 'Prêt'}
            <ChevronRight size={14} />
          </button>
        ) : null}

        <button 
          onClick={() => onChat(o.id)}
          className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-emerald-600 transition-all relative shrink-0"
          title="Ouvrir la discussion"
        >
          <MessageCircle size={14} />
          {o.unreadCounts?.[profile?.role || 'pharmacist'] > 0 && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-bold flex items-center justify-center rounded-full border border-white dark:border-slate-900">
              {o.unreadCounts[profile?.role || 'pharmacist']}
            </span>
          )}
        </button>
      </div>

      {o.status === 'completed' && (o.deliveryPhoto || o.deliverySignature) && (
        <div className="w-full mt-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Preuve de Livraison</p>
          <div className="flex gap-3">
            {o.deliveryPhoto && (
              <button onClick={() => onViewImage(o.deliveryPhoto!)} className="w-24 aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 relative group">
                <img src={o.deliveryPhoto} className="w-full h-full object-cover" />
              </button>
            )}
            {o.deliverySignature && (
              <button onClick={() => onViewImage(o.deliverySignature!)} className="w-24 aspect-video rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center p-1 group relative">
                <img src={o.deliverySignature} className="max-h-full object-contain" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

// --- Pharmacist Dashboard ---

const PharmacistDashboard = React.memo(({ profile, settings, cities, rotation }: { profile: UserProfile, settings: Settings | null, cities: City[], rotation: OnCallRotation | null }) => {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'active' | 'history' | 'wallet' | 'reports' | 'profile'>('pending');

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.scrollTop = 0;
  }, [activeTab]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [dailyGains, setDailyGains] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [phoneInput, setPhoneInput] = useState(profile.phone || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [activeChatOrderId, setActiveChatOrderId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'transactions'), 
      where('userId', '==', profile.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      const filtered = txs.filter(t => t.userRole === 'pharmacist');
      filtered.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      setTransactions(filtered.slice(0, 10));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'transactions'));
    return () => unsubscribe();
  }, [profile.uid]);

  useEffect(() => {
    const q = query(
      collection(db, 'withdrawals'),
      where('userId', '==', profile.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ws = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithdrawalRequest));
      setWithdrawals(ws.filter(w => w.userRole === 'pharmacist'));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawals'));
    return () => unsubscribe();
  }, [profile.uid]);

  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
  const [quoteItems, setQuoteItems] = useState<{ 
    id: string;
    name: string; 
    price: number | ''; 
    quantity: number | ''; 
    equivalent?: string;
    equivalentPrice?: number | '';
    equivalentQuantity?: number | '';
    isUnavailable?: boolean;
  }[]>([]);
  const [showHandoverVerify, setShowHandoverVerify] = useState<Order | null>(null);
  const [pickupCodeInput, setPickupCodeInput] = useState('');
  const [isVerifyingHandover, setIsVerifyingHandover] = useState(false);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [myPharmacy, setMyPharmacy] = useState<Pharmacy | null>(null);
  const [allPharmacies, setAllPharmacies] = useState<Pharmacy[]>([]);

  useEffect(() => {
    // Shared Cities and Rotation are now provided as props
  }, []);

  useEffect(() => {
    getDocs(collection(db, 'pharmacies')).then(snap => {
      setAllPharmacies(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pharmacy)));
    });
  }, []);

  useEffect(() => {
    if (!profile.uid) return;
    if (profile.pharmacyId) {
      getDoc(doc(db, 'pharmacies', profile.pharmacyId)).then(snap => {
        if (snap.exists()) {
          setMyPharmacy({ id: snap.id, ...snap.data() } as Pharmacy);
        }
      });
    } else {
      setMyPharmacy(null);
    }
  }, [profile.uid, profile.pharmacyId]);

  const isFirstRunPharmacistPrescriptions = useRef(true);
  useEffect(() => {
    const q = query(
      collection(db, 'prescriptions'), 
      where('status', '==', 'submitted'), 
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allPrescriptions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Prescription))
        .filter(p => !p.cityId || !myPharmacy?.cityId || p.cityId === myPharmacy.cityId);
      
      // Sort client side
      allPrescriptions.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });

      // Play sound for new prescriptions or modified state (excluding initial load)
      const hasChange = snapshot.docChanges().some(change => change.type === 'added' || change.type === 'modified');
      if (!isFirstRunPharmacistPrescriptions.current && hasChange && !snapshot.metadata.hasPendingWrites) {
        playNotificationSound(settings, profile?.sound_enabled !== false);
      }
      isFirstRunPharmacistPrescriptions.current = false;

      // Filter prescriptions:
      // 1. Not rejected by this pharmacy
      // 2. Not locked by another pharmacy (or lock expired > 5 mins)
      // 3. Rejection count < 5
      // 4. Quote count < 2 (Max quotes per prescription)
      // 5. Circle of proximity logic: > 3km hidden if prescription is < 10 mins old
      // 6. Strict Garde Logic: Only active group sees requests during garde time
      const currentLocality = cities.find(c => c.id === profile.cityId);
      const isGardeTimeNow = currentLocality ? isCityOnCallNow(currentLocality.onCallStartTime, currentLocality.onCallEndTime) : isCityOnCallNow("19:00", "08:00");
      let activeGroup = 1;
      if (rotation) {
        activeGroup = getCurrentOnCallGroup(rotation);
      }

      let filtered = allPrescriptions.filter(p => {
        const isRejectedByMe = p.rejectedBy?.includes(profile.uid);
        const isLockedByOther = p.lockedBy && p.lockedBy !== profile.uid;
        const lockExpired = p.lockedAt && (new Date().getTime() - (p.lockedAt.toDate ? p.lockedAt.toDate().getTime() : new Date(p.lockedAt).getTime()) > 5 * 60 * 1000);
        const isTooManyRejections = (p.rejectionCount || 0) >= 5;
        const hasMaxQuotes = (p.quoteCount || 0) >= 2;

        if (isRejectedByMe || isTooManyRejections || hasMaxQuotes) return false;
        if (isLockedByOther && !lockExpired) return false;

        // Garde Enforcement
        if (isGardeTimeNow && myPharmacy) {
          if (parseInt(myPharmacy.groupId) !== activeGroup) return false;
        }

        return true;
      });

      // Prioritization logic:
      const now = new Date();
      const hour = now.getHours();
      const isNight = settings ? (
        settings.nightStartHour > settings.nightEndHour 
          ? (hour >= settings.nightStartHour || hour < settings.nightEndHour)
          : (hour >= settings.nightStartHour && hour < settings.nightEndHour)
      ) : false;

      filtered.sort((a, b) => {
        // Night priority: On-duty pharmacies get priority
        if (isNight && myPharmacy?.isOnDuty) {
          // If I'm on duty, I should see closer ones first
          return (a.distance || 0) - (b.distance || 0);
        }
        // Day priority: Everyone sees closer ones first
        return (a.distance || 0) - (b.distance || 0);
      });

      setPrescriptions(filtered);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'prescriptions'));
    return () => unsubscribe();
  }, [profile.uid, settings, myPharmacy, profile?.sound_enabled, cities, rotation]);

  const isFirstRunPharmacistOrders = useRef(true);
  useEffect(() => {
    const q = query(
      collection(db, 'orders'), 
      where('pharmacistId', '==', profile.uid), 
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      
      // Play sound for new orders/updates (excluding initial load)
      const hasChange = snapshot.docChanges().some(change => change.type === 'added' || change.type === 'modified');
      if (!isFirstRunPharmacistOrders.current && hasChange && !snapshot.metadata.hasPendingWrites) {
        playNotificationSound(settings, profile?.sound_enabled !== false);
      }
      isFirstRunPharmacistOrders.current = false;

      setOrders(allOrders.filter(o => o.status !== 'completed'));
      
      const completed = allOrders.filter(o => o.status === 'completed');
      setHistoryOrders(completed);
      
      // Calculate gains
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let todayGains = 0;
      let totalGainsSum = 0;
      
      completed.forEach(o => {
        const amount = o.pharmacyAmount || 0;
        totalGainsSum += amount;
        
        const date = o.updatedAt?.toDate ? o.updatedAt.toDate() : (o.updatedAt ? new Date(o.updatedAt) : new Date());
        if (date.getTime() >= today.getTime()) {
          todayGains += amount;
        }
      });
      
      setDailyGains(todayGains);
      setTotalEarned(totalGainsSum);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'orders'));
    return () => unsubscribe();
  }, [profile.uid, settings, profile?.sound_enabled]);

  const handleStartQuote = async (p: Prescription) => {
    if ((myPharmacy?.currentActiveOrders || 0) >= (myPharmacy?.maxConcurrentOrders || 10)) {
      toast.error("Capacité maximale atteinte. Terminez vos commandes en cours avant d'en accepter de nouvelles.");
      return;
    }
    try {
      // Lock the prescription for 5 minutes
      await updateDoc(doc(db, 'prescriptions', p.id), {
        lockedBy: profile.uid,
        lockedAt: serverTimestamp()
      });

      setSelectedPrescription(p);
      let items = [];
      try {
        // Attempt to parse AI data
        const jsonStr = p.extractedData?.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0];
        if (jsonStr) {
          const parsed = JSON.parse(jsonStr);
          const meds = Array.isArray(parsed) ? parsed : (parsed.prescriptions || parsed.medications || parsed.medicaments || Object.values(parsed).find(v => Array.isArray(v)) || []);
          
          // If partial request, only include selected meds
          const filteredMeds = p.requestType === 'partial' && p.selectedMedications 
            ? meds.filter((m: any) => {
                const name = typeof m === 'string' ? m : (m.nom_article || m.name || m.medicament);
                return p.selectedMedications?.includes(name);
              })
            : meds;

          items = filteredMeds.map((m: any) => ({
            id: Math.random().toString(36).substr(2, 9),
            name: typeof m === 'string' ? m : (m.nom_article || m.name || m.medicament || "Médicament inconnu"),
            price: '',
            quantity: 1,
            equivalent: ''
          }));
        }
      } catch (e) {
        console.error("Failed to parse extracted data", e);
      }
      setQuoteItems(items.length > 0 ? items : [{ id: Math.random().toString(36).substr(2, 9), name: "", price: '', quantity: 1, equivalent: '' }]);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `prescriptions/${p.id}`);
      toast.error("Impossible de prendre en charge cette ordonnance.");
    }
  };

  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);
  const handleSubmitQuote = async () => {
    if (!selectedPrescription) return;
    
    // Validation
    const availableItems = quoteItems.filter(item => !item.isUnavailable);
    if (availableItems.length === 0 && !quoteItems.some(item => item.isUnavailable)) {
      toast.error("Veuillez ajouter au moins un article.");
      return;
    }
    
    const invalidItems = availableItems.filter(item => !item.name.trim() || item.price === '' || Number(item.price) <= 0);
    if (invalidItems.length > 0) {
      toast.error("Veuillez remplir le nom et un prix valide pour tous les articles disponibles.");
      return;
    }

    setIsSubmittingQuote(true);

    const totalAmount = quoteItems.reduce((sum, item) => {
      if (item.isUnavailable) return sum;
      const p = item.price === '' ? 0 : Number(item.price);
      const q = item.quantity === '' ? 0 : Number(item.quantity);
      const ep = (item.equivalentPrice === undefined || item.equivalentPrice === '') ? 0 : Number(item.equivalentPrice);
      const eq = (item.equivalentQuantity === undefined || item.equivalentQuantity === '') ? 1 : Number(item.equivalentQuantity);
      
      const price = item.equivalent ? ep : p;
      const quantity = item.equivalent ? eq : q;
      return sum + (price * quantity);
    }, 0);

    const isPartialQuote = quoteItems.some(item => item.isUnavailable) || selectedPrescription.requestType === 'partial';
    
    try {
      // Create Order
      await addDoc(collection(db, 'orders'), {
        prescriptionId: selectedPrescription.id,
        prescriptionImageUrl: selectedPrescription.imageUrl || null,
        patientId: selectedPrescription.patientId,
        patientName: selectedPrescription.patientName || "Anonyme",
        cityId: selectedPrescription.cityId || profile.cityId || null,
        hospitalLocation: selectedPrescription.hospitalLocation || "Non spécifié",
        patientLocation: selectedPrescription.patientLocation || null,
        landmark: selectedPrescription.landmark || "",
        facadePhoto: selectedPrescription.facadePhoto || null,
        pharmacistId: profile.uid,
        pharmacyName: profile.pharmacyName || profile.name,
        pharmacyLocation: profile.pharmacyLocation || "Non spécifiée",
        pharmacyLocationCoords: profile.location || null, // Real-time location of the pharmacy
        status: 'pending_quote',
        quoteType: isPartialQuote ? 'partial' : 'full',
        items: JSON.parse(JSON.stringify(quoteItems.filter(item => !item.isUnavailable), (k, v) => v === undefined ? null : v)),
        unavailableItems: JSON.parse(JSON.stringify(quoteItems.filter(item => item.isUnavailable), (k, v) => v === undefined ? null : v)),
        totalAmount,
        medicationTotal: totalAmount,
        deliveryFee: 0, // Will be calculated when patient selects delivery method
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        history: [{
          status: 'pending_quote',
          timestamp: new Date().toISOString(),
          label: 'Devis envoyé par la pharmacie'
        }]
      });

      // Update Prescription Status
      const newQuoteCount = (selectedPrescription.quoteCount || 0) + 1;
      await updateDoc(doc(db, 'prescriptions', selectedPrescription.id), {
        quoteCount: newQuoteCount,
        status: newQuoteCount >= 2 ? 'validated' : selectedPrescription.status,
        lockedBy: null,
        lockedAt: null
      });

      await createNotification(selectedPrescription.patientId, "Devis reçu", `La pharmacie ${profile.pharmacyName || profile.name} a envoyé un devis pour votre ordonnance.`, 'quote_request', selectedPrescription.id);

      setSelectedPrescription(null);
      setActiveTab('active');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'orders');
    } finally {
      setIsSubmittingQuote(false);
    }
  };

  const handleValidatePrescription = async (id: string, status: 'validated' | 'rejected', rejectionReason?: string) => {
    try {
      if (status === 'rejected') {
        const pRef = doc(db, 'prescriptions', id);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
          const pData = pSnap.data() as Prescription;
          const newRejectionCount = (pData.rejectionCount || 0) + 1;
          const newRejectedBy = arrayUnion(profile.uid);
          
          const updates: any = {
            rejectedBy: newRejectedBy,
            rejectionCount: newRejectionCount,
            lockedBy: null,
            lockedAt: null,
            rejectionReason: rejectionReason || 'Non spécifié',
            status: 'rejected'
          };

          if (newRejectionCount >= 5) {
            updates.status = 'rejected_by_limit';
          }

          await updateDoc(pRef, updates);
          toast.info("Ordonnance rejetée.");
        }
      } else {
        await updateDoc(doc(db, 'prescriptions', id), { status });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `prescriptions/${id}`);
    }
  };

  const totalWithdrawn = withdrawals
    .filter(w => w.status !== 'rejected')
    .reduce((sum, w) => sum + w.amount, 0);
  const availableGains = totalEarned - totalWithdrawn;

  const currentCity = cities.find(c => c.id === profile.cityId);
  const isOnCallNow = currentCity ? isCityOnCallNow(currentCity.onCallStartTime, currentCity.onCallEndTime) : false;
  const currentGroup = rotation ? getCurrentOnCallGroup(rotation) : 1;
  const isMyGroupOnCall = profile.groupId === currentGroup.toString();

  return (
    <>
    <PullToRefresh onRefresh={async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success("Données actualisées");
    }}>
      <div className="relative space-y-4 pb-8 pt-2 md:pt-1 transition-all">
        {viewImage && <ImageViewerModal imageUrl={viewImage} onClose={() => setViewImage(null)} />}
      
      {/* Role Header */}
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 p-5 sm:p-6 text-white shadow-xl border border-slate-700/50">
        <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/10 border border-white/15 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
              <Plus size={13} className="text-emerald-400" />
              <span>Espace Pharmacien</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              {myPharmacy?.name || "Officine Partenaire"}
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className={`px-3.5 py-2 rounded-xl flex items-center gap-2 border text-[11px] font-bold uppercase tracking-wider ${
              isOnCallNow && isMyGroupOnCall
                ? 'bg-amber-500/20 border-amber-400/40 text-amber-300 animate-pulse'
                : 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
            }`}>
              <div className={`w-2 h-2 rounded-full ${isOnCallNow && isMyGroupOnCall ? 'bg-amber-400 shadow-xs shadow-amber-400' : 'bg-emerald-400'}`} />
              <span>{isOnCallNow && isMyGroupOnCall ? 'Officine de Garde' : 'Service Ouvert'}</span>
            </div>
            <button 
              onClick={() => setShowWithdrawalModal(true)}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-900/30 transition-all active:scale-95"
            >
              <CreditCard size={14} />
              <span>Retrait</span>
            </button>
          </div>
        </div>
      </div>

      {/* On-Call Status Banner */}
      {currentCity && isMyGroupOnCall && isOnCallNow && (
        <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white p-5 sm:p-6 rounded-[2rem] shadow-xl flex items-center justify-between border border-amber-400/30">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
              <Navigation size={22} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Votre pharmacie est de garde cette nuit</h3>
              <p className="text-amber-100 text-xs sm:text-sm">Groupe {profile.groupId} • {currentCity.name} ({currentCity.onCallStartTime} - {currentCity.onCallEndTime})</p>
            </div>
          </div>
          <span className="hidden sm:inline-flex px-3.5 py-1.5 bg-white/20 rounded-full text-xs font-black uppercase tracking-wider">
            Priorité Urgences Nuit
          </span>
        </div>
      )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4">
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Gains Disponibles</p>
              <h3 className="text-lg sm:text-2xl font-extrabold text-slate-900">{availableGains.toLocaleString()} <span className="text-xs font-bold text-emerald-600">FCFA</span></h3>
            </div>
            <div className="w-11 h-11 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
              <CreditCard size={20} />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Gains du Jour</p>
              <h3 className="text-lg sm:text-2xl font-extrabold text-slate-900">{dailyGains.toLocaleString()} <span className="text-xs font-bold text-emerald-600">FCFA</span></h3>
            </div>
            <div className="w-11 h-11 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
              <TrendingUp size={20} />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">En attente de devis</p>
              <h3 className="text-lg sm:text-2xl font-extrabold text-slate-900">{prescriptions.length}</h3>
            </div>
            <div className="w-11 h-11 bg-sky-50 rounded-2xl flex items-center justify-center text-sky-600">
              <FileText size={20} />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Commandes Terminées</p>
              <h3 className="text-lg sm:text-2xl font-extrabold text-slate-900">{historyOrders.length}</h3>
            </div>
            <div className="w-11 h-11 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
              <Package size={20} />
            </div>
          </div>
          <div className={`p-4 sm:p-6 rounded-[2rem] shadow-sm border flex items-center justify-between group transition-all ${
            (myPharmacy?.currentActiveOrders || 0) >= (myPharmacy?.maxConcurrentOrders || 10) 
              ? 'bg-rose-50 border-rose-100' : 'bg-white border-slate-100'
          }`}>
            <div>
              <p className={`text-[8px] font-black uppercase tracking-widest mb-1 ${
                (myPharmacy?.currentActiveOrders || 0) >= (myPharmacy?.maxConcurrentOrders || 10) ? 'text-rose-400' : 'text-slate-400'
              }`}>Charge de travail</p>
              <h3 className={`text-sm sm:text-lg font-bold ${
                (myPharmacy?.currentActiveOrders || 0) >= (myPharmacy?.maxConcurrentOrders || 10) ? 'text-rose-600' : 'text-slate-900'
              }`}>
                {myPharmacy?.currentActiveOrders || 0} / {myPharmacy?.maxConcurrentOrders || 10}
              </h3>
            </div>
            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center ${
               (myPharmacy?.currentActiveOrders || 0) >= (myPharmacy?.maxConcurrentOrders || 10) 
                 ? 'bg-rose-100 text-rose-600' : 'bg-primary/10 text-primary'
            }`}>
              <Activity size={18} />
            </div>
          </div>
        </div>

      {/* Navigation Tabs (Desktop Side, Mobile Bottom) */}
      <div className="flex flex-col md:flex-row gap-8">
        {/* Desktop Sidebar */}
        <div className="hidden md:block w-64 flex-shrink-0">
          <div className="sticky top-24 space-y-2 p-2 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm">
            {[
              { id: 'pending', label: 'À Traiter', icon: FileText, count: prescriptions.length, color: 'text-primary', bg: 'bg-primary/5' },
              { id: 'active', label: 'Commandes', icon: Package, count: orders.length, color: 'text-secondary', bg: 'bg-secondary/5' },
              { id: 'history', label: 'Historique', icon: Clock, count: historyOrders.length, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { id: 'wallet', label: 'Portefeuille', icon: CreditCard, count: null, color: 'text-slate-600', bg: 'bg-slate-50' },
              { id: 'reports', label: 'Rapports', icon: TrendingUp, count: null, color: 'text-purple-600', bg: 'bg-purple-50' },
              { id: 'profile', label: 'Mon Profil', icon: User, count: null, color: 'text-blue-600', bg: 'bg-blue-50' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => React.startTransition(() => setActiveTab(tab.id as any))}
                className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl font-bold transition-all duration-300 ${
                  activeTab === tab.id 
                    ? `${tab.bg} ${tab.color} shadow-sm` 
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-4">
                  <tab.icon size={20} />
                  {tab.label}
                </div>
                {tab.count !== null && (
                  <span className={`text-[10px] px-2.5 py-1 rounded-full ${activeTab === tab.id ? 'bg-white shadow-sm' : 'bg-slate-100'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        {createPortal(
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-[49] px-3 pt-1 bg-slate-900/95 backdrop-blur-2xl border-t border-white/10 shadow-[0_-8px_16px_-2px_rgba(0,0,0,0.3)]" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }}>
            <div className="flex items-center justify-around">
              {[
                { id: 'pending', label: 'Ordos', icon: FileText, activeColor: 'bg-emerald-500' },
                { id: 'active', label: 'Commandes', icon: Package, activeColor: 'bg-sky-500' },
                { id: 'history', label: 'Archives', icon: Clock, activeColor: 'bg-indigo-500' },
                { id: 'profile', label: 'Profil', icon: User, activeColor: 'bg-slate-500' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => React.startTransition(() => setActiveTab(tab.id as any))}
                  className="flex flex-col items-center gap-1 min-w-[60px] relative transition-transform active:scale-90 py-1"
                >
                  <div className={`p-1.5 rounded-xl transition-all duration-300 ${
                    activeTab === tab.id 
                      ? `${tab.activeColor} text-white shadow-lg` 
                      : `text-slate-500`
                  }`}>
                    <tab.icon size={18} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-tight ${activeTab === tab.id ? 'text-white' : 'text-slate-500'}`}>
                    {tab.label}
                  </span>
                  {activeTab === tab.id && (
                    <motion.div 
                      layoutId="activeTabGlowPharmacist"
                      className="absolute -bottom-1 w-6 h-[2px] rounded-full bg-white/40" 
                    />
                  )}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}

        <div className="flex-1 min-w-0 pb-32 md:pb-0">
          <div key={activeTab}>
              {activeTab === 'pending' && (
                <PaginatedList
                  items={prescriptions}
                  pageSize={10}
                  emptyMessage="Aucune ordonnance en attente"
                  emptyIcon={<FileText size={36} className="text-slate-400" />}
                  renderItem={(p) => (
                    <PharmacistPrescriptionCard 
                      p={p} 
                      onStartQuote={handleStartQuote} 
                      onReject={handleValidatePrescription} 
                      onViewImage={setViewImage}
                    />
                  )}
                />
              )}

              {activeTab === 'active' && (
                <PaginatedList
                  items={orders}
                  pageSize={10}
                  emptyMessage="Aucune commande active"
                  emptyIcon={<Package size={36} className="text-slate-400" />}
                  renderItem={(o) => (
                    <PharmacistOrderCard 
                      o={o} 
                      profile={profile} 
                      onChat={setActiveChatOrderId} 
                      onViewImage={setViewImage} 
                      onHandover={setShowHandoverVerify} 
                      onUpdateStatus={async (order) => {
                        try {
                          const nextStatus = order.status === 'paid' ? 'preparing' : 'ready';
                          await updateDoc(doc(db, 'orders', order.id), { 
                            status: nextStatus, 
                            updatedAt: serverTimestamp(),
                            history: arrayUnion({
                              status: nextStatus,
                              timestamp: new Date().toISOString(),
                              label: nextStatus === 'preparing' ? 'Préparation commencée' : 'Commande prête'
                            })
                          });

                          if (nextStatus === 'ready' && order.deliveryMethod === 'delivery') {
                            await notifyDeliveryDrivers(
                              "Nouvelle mission de livraison",
                              `Une commande est prête pour livraison à ${order.pharmacyName || 'la pharmacie'}.`,
                              order.id
                            );
                          }
                        } catch (err) {
                          handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
                        }
                      }} 
                    />
                  )}
                />
              )}

        {/* Quote Modal */}
        {selectedPrescription && createPortal(
          <div className="fixed inset-0 bg-slate-900/75 z-[300] flex items-center justify-center p-2 md:p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl max-w-2xl w-full max-h-[95vh] flex flex-col overflow-hidden"
            >
              <div className="p-4 md:p-8 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-xl md:text-2xl font-bold">Établir un Devis</h3>
                  <p className="text-slate-500 text-sm">Patient: {selectedPrescription.patientName || "Anonyme"}</p>
                </div>
                <button onClick={() => setSelectedPrescription(null)} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100 shrink-0">
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>
              
              <div className="p-4 md:p-8 space-y-6 overflow-y-auto grow">
                {quoteItems.map((item, index) => (
                  <div key={item.id} className="bg-slate-50 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-100 space-y-4">
                    <div className="flex flex-col md:flex-row gap-4 md:items-end">
                      {/* Name input - full width on mobile, partial on desktop */}
                      <div className="w-full md:flex-[2] space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Désignation</label>
                        <input 
                          type="text" 
                          value={item.name}
                          onChange={(e) => {
                            const newItems = quoteItems.map(qi => qi.id === item.id ? { ...qi, name: e.target.value } : qi);
                            setQuoteItems(newItems);
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-primary"
                        />
                      </div>
                      
                      {/* Container for Price, Qty and Buttons, side-by-side on mobile */}
                      <div className="flex gap-2 items-end w-full md:flex-1">
                        <div className="w-24 md:w-32 shrink-0 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">Prix (FCFA)</label>
                          <input 
                            type="number" 
                            value={item.price}
                            disabled={item.isUnavailable}
                            onChange={(e) => {
                              const val = e.target.value === '' ? '' as const : Number(e.target.value);
                              const newItems = quoteItems.map(qi => qi.id === item.id ? { ...qi, price: val } : qi);
                              setQuoteItems(newItems);
                            }}
                            className="w-full bg-white border border-slate-200 rounded-xl px-2 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                          />
                        </div>
                        <div className="flex-1 min-w-0 md:w-20 shrink-0 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Qté</label>
                          <input 
                            type="number" 
                            value={item.quantity}
                            disabled={item.isUnavailable}
                            onChange={(e) => {
                              const val = e.target.value === '' ? '' as const : Number(e.target.value);
                              const newItems = quoteItems.map(qi => qi.id === item.id ? { ...qi, quantity: val } : qi);
                              setQuoteItems(newItems);
                            }}
                            className="w-full bg-white border border-slate-200 rounded-xl px-2 py-2 text-sm outline-none focus:border-primary text-center disabled:opacity-50"
                          />
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button 
                            onClick={() => {
                              const newItems = quoteItems.map(qi => qi.id === item.id ? { ...qi, isUnavailable: !qi.isUnavailable, price: '' as const, equivalent: '' } : qi);
                              setQuoteItems(newItems);
                            }}
                            className={`w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center transition-all ${item.isUnavailable ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-500'}`}
                            title={item.isUnavailable ? "Remettre en stock" : "Marquer comme indisponible"}
                          >
                            <BellOff size={18} />
                          </button>
                          <button 
                            onClick={() => setQuoteItems(quoteItems.filter(qi => qi.id !== item.id))}
                            className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500"
                          >
                            <Plus size={18} className="rotate-45" />
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {!item.isUnavailable && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Équivalent (si produit initial non disponible)</label>
                          <input 
                            type="text" 
                            value={item.equivalent || ''}
                            onChange={(e) => {
                              const newItems = quoteItems.map(qi => qi.id === item.id ? { ...qi, equivalent: e.target.value } : qi);
                              setQuoteItems(newItems);
                            }}
                            placeholder="Ex: Paracétamol 500mg au lieu de Doliprane"
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-primary italic"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-primary uppercase tracking-widest ml-1">Prix Équivalent (FCFA)</label>
                            <input 
                              type="number" 
                              value={item.equivalentPrice ?? ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? '' as const : Number(e.target.value);
                                const newItems = quoteItems.map(qi => qi.id === item.id ? { ...qi, equivalentPrice: val } : qi);
                                setQuoteItems(newItems);
                              }}
                              className="w-full bg-primary/5 border border-primary/20 rounded-xl px-4 py-2 text-sm outline-none focus:border-primary font-bold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-primary uppercase tracking-widest ml-1">Qté Équivalent</label>
                            <input 
                              type="number" 
                              value={item.equivalentQuantity ?? 1}
                              onChange={(e) => {
                                const val = e.target.value === '' ? '' as const : Number(e.target.value);
                                const newItems = quoteItems.map(qi => qi.id === item.id ? { ...qi, equivalentQuantity: val } : qi);
                                setQuoteItems(newItems);
                              }}
                              className="w-full bg-primary/5 border border-primary/20 rounded-xl px-4 py-2 text-sm outline-none focus:border-primary font-bold"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    {item.isUnavailable && (
                      <div className="bg-rose-50 text-rose-600 p-3 rounded-xl text-xs font-bold flex items-center gap-2">
                        <AlertCircle size={14} />
                        Ce produit sera marqué comme indisponible dans le devis.
                      </div>
                    )}
                  </div>
                ))}
                
                <button 
                  onClick={() => setQuoteItems([...quoteItems, { id: Math.random().toString(36).substr(2, 9), name: "", price: '', quantity: 1, equivalent: '' }])}
                  className="w-full py-3 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-bold hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2"
                >
                  <Plus size={18} />
                  Ajouter un article
                </button>
              </div>

              <div className="p-8 bg-slate-50 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex gap-8">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Total Patient</p>
                    <p className="text-xl font-bold text-slate-900">
                      {quoteItems.reduce((sum, item) => {
                        const p = item.price === '' ? 0 : Number(item.price);
                        const q = item.quantity === '' ? 0 : Number(item.quantity);
                        const ep = (item.equivalentPrice === undefined || item.equivalentPrice === '') ? 0 : Number(item.equivalentPrice);
                        const eq = (item.equivalentQuantity === undefined || item.equivalentQuantity === '') ? 1 : Number(item.equivalentQuantity);
                        
                        const price = item.equivalent ? ep : p;
                        const quantity = item.equivalent ? eq : q;
                        return sum + (price * quantity);
                      }, 0).toLocaleString()} FCFA
                    </p>
                  </div>
                  <div className="pl-8 border-l border-slate-200">
                    <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest mb-1">Votre Gain Net</p>
                    <p className="text-2xl font-black text-emerald-600">
                      {Math.floor(quoteItems.reduce((sum, item) => {
                        const p = item.price === '' ? 0 : Number(item.price);
                        const q = item.quantity === '' ? 0 : Number(item.quantity);
                        const ep = (item.equivalentPrice === undefined || item.equivalentPrice === '') ? 0 : Number(item.equivalentPrice);
                        const eq = (item.equivalentQuantity === undefined || item.equivalentQuantity === '') ? 1 : Number(item.equivalentQuantity);
                        
                        const price = item.equivalent ? ep : p;
                        const quantity = item.equivalent ? eq : q;
                        return sum + (price * quantity);
                      }, 0) * (1 - (settings?.commissionPercentage || 10) / 100)).toLocaleString()} FCFA
                    </p>
                  </div>
                </div>
                <button 
                  onClick={handleSubmitQuote}
                  disabled={isSubmittingQuote}
                  className="btn-primary px-10 w-full md:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingQuote ? "Envoi en cours..." : "Envoyer le Devis"}
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}

              {activeTab === 'history' && (
                <>
                  <div className="flex flex-col gap-3 sm:gap-3.5">
            {historyOrders.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 p-10 rounded-3xl border-2 border-dashed border-slate-100 dark:border-slate-800 text-center relative overflow-hidden group">
                <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-4 group-hover:scale-110 transition-transform duration-500">
                  <Clock size={40} strokeWidth={1.5} />
                </div>
                <p className="text-slate-900 dark:text-white font-black text-xl mb-1">Historique vide</p>
                <p className="text-slate-500 text-sm max-w-xs mx-auto">Les commandes terminées ou annulées apparaîtront ici.</p>
              </div>
            ) : (
              historyOrders.map(o => (
                <VirtualListItem key={o.id} estimatedHeight={100}>
                  <div className="bg-white dark:bg-slate-900 p-2.5 sm:p-3 rounded-xl shadow-2xs border border-slate-200/60 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-300 dark:hover:border-slate-700 transition-all">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {o.prescriptionImageUrl ? (
                        <div 
                          className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 cursor-pointer"
                          onClick={() => setViewImage(o.prescriptionImageUrl!)}
                        >
                          <img src={o.prescriptionImageUrl} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-[10px] shrink-0">
                          #{o.id.slice(-2).toUpperCase()}
                        </div>
                      )}

                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-black text-slate-900 dark:text-white">#{o.id.slice(-6).toUpperCase()}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{o.patientName}</span>
                          <span className="text-[9px] text-slate-400 font-semibold">{o.updatedAt ? formatDate(o.updatedAt, 'dateTime') : 'Date inconnue'}</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                          {o.hospitalLocation && (
                            <span className="flex items-center gap-1 text-[10px] text-slate-500 truncate max-w-[180px]">
                              <Hospital size={11} className="shrink-0" />
                              {o.hospitalLocation}
                            </span>
                          )}
                          {o.landmark && (
                            <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium italic truncate max-w-[180px]">
                              <MapPin size={11} className="shrink-0" />
                              {o.landmark}
                            </span>
                          )}
                          <span className="text-[9px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-bold text-slate-600 dark:text-slate-400">
                            {o.items?.length || 0} art.
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 sm:text-right shrink-0 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                      <div>
                        <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider block mb-0.5 text-center">TERMINÉE</span>
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 block">+{o.pharmacyAmount?.toLocaleString()} FCFA</span>
                      </div>
                    </div>
                  </div>
                </VirtualListItem>
              ))
            )}
                  </div>
                </>
              )}

              {activeTab === 'wallet' && (
                <>
                  <div className="space-y-6">
            <div className="bg-emerald-600 text-white p-6 rounded-[2.5rem] shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
              <div className="relative z-10">
                <p className="text-emerald-100 font-bold uppercase tracking-widest text-xs mb-2">Gains Disponibles</p>
                <h2 className="text-5xl font-black mb-6">{availableGains.toLocaleString()} FCFA</h2>
                <button 
                  onClick={() => setShowWithdrawalModal(true)}
                  className="bg-white text-emerald-600 px-8 py-4 rounded-2xl font-bold hover:bg-emerald-50 transition-all shadow-lg flex items-center gap-2"
                >
                  <CreditCard size={20} />
                  Demander un retrait
                </button>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h3 className="text-xl font-bold mb-6">Transactions Récentes</h3>
              <div className="space-y-4">
                {transactions.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        tx.type === 'credit' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                      }`}>
                        {tx.type === 'credit' ? <Plus size={24} /> : <TrendingDown size={24} />}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{tx.description}</p>
                        <p className="text-xs text-slate-500">{formatDate(tx.createdAt)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-black ${tx.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {tx.type === 'credit' ? '+' : '-'}{tx.amount.toLocaleString()} CFA
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">{tx.type === 'credit' ? 'Crédité' : 'Débité'}</p>
                    </div>
                  </div>
                ))}
                {transactions.length === 0 && (
                  <p className="text-center text-slate-400 py-8">Aucune transaction pour le moment.</p>
                )}
              </div>
            </div>
                  </div>
                </>
              )}

              {activeTab === 'reports' && (
                <>
                  <div>
                    <Suspense fallback={<div className="p-4 text-slate-400">Chargement des rapports...</div>}>
                      <ReportsView profile={profile} />
                    </Suspense>
                  </div>
                </>
              )}

              {activeTab === 'profile' && (
                <>
                  <div className="space-y-8">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <div className="flex items-center gap-6 mb-8">
                <div className="w-24 h-24 bg-blue-100 rounded-3xl flex items-center justify-center text-blue-600 text-3xl font-bold">
                  {profile.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">{profile.name}</h3>
                  <p className="text-slate-500">{profile.email}</p>
                  <div className="mt-2 inline-flex items-center px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold uppercase tracking-wider">
                    Pharmacien
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Numéro de Téléphone</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input 
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="Votre numéro de téléphone"
                      className="w-full pl-12 pr-6 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Pharmacie Associée</label>
                  <div className="space-y-4">
                    <select 
                      value={profile.pharmacyId || ''}
                      onChange={async (e) => {
                        const pharmacyId = e.target.value;
                        const pharmacy = allPharmacies.find(p => p.id === pharmacyId);
                        try {
                          await updateDoc(doc(db, 'users', profile.uid), {
                            pharmacyId,
                            pharmacyName: pharmacy?.name || ''
                          });
                          toast.success("Pharmacie mise à jour !");
                        } catch (err) {
                          handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}`);
                        }
                      }}
                      className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all font-bold text-slate-900"
                    >
                      <option value="">Sélectionner une pharmacie</option>
                      {allPharmacies.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    
                    {myPharmacy && (
                      <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-center gap-4">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                          <Plus size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{myPharmacy.name}</p>
                          <p className="text-xs text-slate-500">{myPharmacy.address}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Mobile Money de Compensation (Optionnel)</label>
                  <div className="relative">
                    <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input 
                      type="tel"
                      value={profile.compensationPhone || ''}
                      onChange={async (e) => {
                        try {
                          await updateDoc(doc(db, 'users', profile.uid), { compensationPhone: e.target.value });
                        } catch (err) {}
                      }}
                      placeholder="Ex: +226 70 00 00 00"
                      className="w-full pl-12 pr-6 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all font-bold"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">RIB Bancaire (Optionnel)</label>
                  <div className="relative">
                    <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input 
                      type="text"
                      value={profile.compensationRIB || ''}
                      onChange={async (e) => {
                        try {
                          await updateDoc(doc(db, 'users', profile.uid), { compensationRIB: e.target.value });
                        } catch (err) {}
                      }}
                      placeholder="Ex: BF000..."
                      className="w-full pl-12 pr-6 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-slate-100">
                <button 
                  onClick={async () => {
                    setIsUpdatingProfile(true);
                    try {
                      await updateDoc(doc(db, 'users', profile.uid), {
                        phone: phoneInput
                      });
                      toast.success("Profil mis à jour !");
                    } catch (err) {
                      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}`);
                    } finally {
                      setIsUpdatingProfile(false);
                    }
                  }}
                  disabled={isUpdatingProfile}
                  className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
                >
                  {isUpdatingProfile ? "Mise à jour..." : "Enregistrer les modifications"}
                </button>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h3 className="text-xl font-bold mb-6">Sécurité & Compte</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">Statut du compte</p>
                      <p className="text-xs text-emerald-600 font-bold uppercase">Actif & Vérifié</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
                  </div>
                </>
              )}
            </div>
        </div>
      </div>

      {/* Handover Verify Modal */}
      <>
        {showHandoverVerify && createPortal(
          <div className="fixed inset-0 bg-slate-900/65 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[2rem] shadow-2xl max-w-sm w-full p-6 text-center overflow-hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                    <ShieldCheck size={20} />
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-black text-slate-900 leading-tight">Vérification</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Remise Sécurisée</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setShowHandoverVerify(null);
                    setPickupCodeInput('');
                  }}
                  className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6 flex items-center gap-4 text-left">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-slate-400 overflow-hidden border border-slate-200 shrink-0 shadow-sm">
                  {showHandoverVerify.deliveryMethod === 'delivery' ? (
                    showHandoverVerify.deliveryPersonPhoto ? (
                      <img src={showHandoverVerify.deliveryPersonPhoto} alt={showHandoverVerify.deliveryPersonName} className="w-full h-full object-cover" />
                    ) : (
                      <Truck size={20} />
                    )
                  ) : (
                     <User size={20} />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 text-sm truncate">
                    {showHandoverVerify.deliveryMethod === 'delivery' ? showHandoverVerify.deliveryPersonName : showHandoverVerify.patientName}
                  </p>
                  <p className="text-xs text-slate-400 font-medium">
                    {showHandoverVerify.deliveryMethod === 'delivery' ? showHandoverVerify.deliveryPersonPhone : showHandoverVerify.patientPhone || 'Patient'}
                  </p>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left ml-1">
                  {showHandoverVerify.deliveryMethod === 'delivery' ? "Code de retrait du livreur" : "Code de retrait du patient"}
                </p>
                <input 
                  type="text" 
                  maxLength={6}
                  placeholder="000000"
                  value={pickupCodeInput}
                  onChange={(e) => setPickupCodeInput(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-center text-3xl font-black tracking-[0.2em] outline-none focus:border-amber-500 transition-all shadow-inner"
                />
              </div>

              <div className="flex flex-col gap-2">
                <button 
                  onClick={async () => {
                    const expectedCode = showHandoverVerify.deliveryMethod === 'delivery' ? showHandoverVerify.pickupCode : showHandoverVerify.deliveryCode;
                    
                    if (pickupCodeInput === expectedCode && expectedCode) {
                      setIsVerifyingHandover(true);
                      const toastId = toast.loading("Validation du code...");
                      try {
                        const order = showHandoverVerify;
                        const batch = writeBatch(db);
                        const orderRef = doc(db, 'orders', order.id);
                        const pharmacyAmount = order.pharmacyAmount || 0;

                        // 1. Credit Pharmacy Wallet (Pharmacy has done its part)
                        if (pharmacyAmount > 0) {
                          const pharmacistRef = doc(db, 'users', profile.uid);
                          batch.update(pharmacistRef, {
                            pharmacistBalance: increment(pharmacyAmount),
                            walletBalance: increment(pharmacyAmount)
                          });

                          // Log Transaction
                          const pharmacyTxRef = doc(collection(db, 'transactions'));
                          batch.set(pharmacyTxRef, {
                            id: pharmacyTxRef.id,
                            userId: profile.uid,
                            userName: profile.name,
                            userRole: 'pharmacist',
                            amount: pharmacyAmount,
                            type: 'credit',
                            description: `Gains médicaments pour commande #${order.id.slice(-6).toUpperCase()}`,
                            referenceId: order.id,
                            createdAt: serverTimestamp(),
                            metadata: {
                              method: order.deliveryMethod,
                              handoverType: order.deliveryMethod === 'delivery' ? 'to_delivery' : 'to_patient'
                            }
                          });

                          // Notification
                          const pharmacyNotifRef = doc(collection(db, 'notifications'));
                          batch.set(pharmacyNotifRef, {
                            userId: profile.uid,
                            title: "Paiement reçu",
                            message: `Vous avez reçu ${pharmacyAmount} FCFA pour la commande #${order.id.slice(-6).toUpperCase()}.`,
                            type: 'payment',
                            referenceId: order.id,
                            read: false,
                            createdAt: serverTimestamp()
                          });
                        }

                        // 2. Update Order Status
                        const nextStatus = order.deliveryMethod === 'delivery' ? 'delivering' : 'completed';
                        batch.update(orderRef, { 
                          status: nextStatus,
                          isHandedOver: true,
                          updatedAt: serverTimestamp(),
                          history: arrayUnion({
                            status: nextStatus,
                            timestamp: new Date().toISOString(),
                            label: order.deliveryMethod === 'delivery' 
                              ? 'Commande remise au livreur par la pharmacie' 
                              : 'Commande remise au patient (Retrait en pharmacie)'
                          })
                        });

                        await batch.commit();
                        toast.success("Remise confirmée !", { id: toastId });
                        setShowHandoverVerify(null);
                        setPickupCodeInput('');
                      } catch (err) {
                        handleFirestoreError(err, OperationType.UPDATE, `orders/${showHandoverVerify.id}`);
                        toast.error("Erreur lors de la validation.", { id: toastId });
                      } finally {
                        setIsVerifyingHandover(false);
                        }
                      } else {
                        toast.error("Code de retrait incorrect.");
                      }
                    }}
                    disabled={isVerifyingHandover || pickupCodeInput.length !== 6}
                    className="w-full bg-amber-500 text-white py-4 rounded-2xl font-bold hover:bg-amber-600 transition-all disabled:opacity-50"
                  >
                    {isVerifyingHandover ? "Vérification..." : "Confirmer la Remise"}
                  </button>
                </div>
              </motion.div>
            </div>,
            document.body
          )}
        </>
      

      {/* Withdrawal Modal */}
      <AnimatePresence>
        {showWithdrawalModal && (
          <WithdrawalModal 
            profile={profile} 
            availableBalance={availableGains}
            onClose={() => setShowWithdrawalModal(false)} 
          />
        )}
      </AnimatePresence>

    </div>
    </PullToRefresh>
    {activeChatOrderId && (
      <Suspense fallback={null}>
        <OrderChat 
          orderId={activeChatOrderId} 
          userId={profile.uid} 
          userName={profile.name} 
          userRole={profile.role}
          onClose={() => setActiveChatOrderId(null)} 
        />
      </Suspense>
    )}
    </>
    );
  });


const MissionCard = React.memo(({ 
  m, 
  onAccept, 
  onReject 
}: { 
  m: Order, 
  onAccept: (m: Order) => Promise<void> | void, 
  onReject: (id: string) => Promise<void> | void 
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showTrace, setShowTrace] = useState(false);

  return (
    <div className="bg-white p-3 sm:p-3.5 rounded-2xl shadow-xs border border-slate-200/90 hover:border-emerald-500/40 hover:shadow-sm transition-all space-y-2.5">
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <MapPin size={15} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black text-slate-900 truncate">
              {m.pharmacyName || "Pharmacie Partenaire"}
            </p>
            <p className="text-[11px] text-slate-500 font-medium truncate flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shrink-0"></span>
              <span className="truncate">{m.hospitalLocation || "Burkina Faso"}</span>
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <span className="text-sm font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200/60 inline-block">
            +{m.deliveryFee || 1500} <span className="text-[9px] font-bold">CFA</span>
          </span>
        </div>
      </div>

      {/* Info Pills Strip */}
      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-100/80">
        <div className="flex items-center gap-1.5 font-bold">
          <Package size={12} className="text-slate-400" />
          <span>{m.items?.length || 0} art.</span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-md font-bold uppercase tracking-wider text-[9px] ${
            m.status === 'pending_payment' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {m.status === 'pending_payment' ? 'Att. Paiement' : 'Prêt'}
          </span>

          {m.history && m.history.length > 0 && (
            <button 
              type="button"
              onClick={() => setShowTrace(!showTrace)}
              className="text-slate-400 hover:text-slate-700 p-0.5 transition-colors"
              title="Historique de suivi"
            >
              {showTrace ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* Optional Collapsible Trace */}
      {showTrace && m.history && m.history.length > 0 && (
        <div className="pt-1">
          <StatusTrace history={m.history} defaultExpanded={true} />
        </div>
      )}

      {/* Compact Action Buttons */}
      <div className="flex items-center gap-2 pt-0.5">
        <button 
          onClick={async () => {
             setIsLoading(true);
             try { await onAccept(m); } finally { setIsLoading(false); }
          }}
          disabled={isLoading}
          className="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-50"
        >
          <CheckCircle2 size={14} className="text-emerald-400" />
          <span>{isLoading ? 'Acceptation...' : 'Accepter'}</span>
        </button>
        <button 
          onClick={async () => {
             setIsLoading(true);
             try { await onReject(m.id); } finally { setIsLoading(false); }
          }}
          disabled={isLoading}
          className="p-2 bg-rose-50 text-rose-600 rounded-xl font-bold hover:bg-rose-500 hover:text-white transition-all border border-rose-100/80 active:scale-95 disabled:opacity-50"
          title="Refuser"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
});

const DeliveryActiveCard = React.memo(({ 
  m, 
  profile, 
  cities, 
  onChat, 
  onShowPickupQR, 
  onShowDeliveryVerify, 
  onShowMap 
}: { 
  m: Order, 
  profile: any, 
  cities: City[], 
  onChat: (id: string) => void, 
  onShowPickupQR: (m: Order) => void, 
  onShowDeliveryVerify: (m: Order) => void, 
  onShowMap: (m: Order) => void 
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200/80 dark:border-slate-800 overflow-hidden hover:shadow-xs transition-all">
      <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-white dark:bg-slate-800 rounded-lg shadow-2xs flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Truck size={14} />
          </div>
          <span className="text-xs font-black text-slate-900 dark:text-white leading-none tracking-tight">#{m.id.slice(-6).toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-1.5">
           <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
            m.status === 'pending_payment' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-500 text-white'
          }`}>
            {m.status === 'pending_payment' ? 'Att. Paiement' : 'En Livraison'}
          </span>
          <button 
            onClick={() => onChat(m.id)}
            className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 hover:text-emerald-600 transition-all relative"
          >
            <MessageCircle size={13} />
            {m.unreadCounts?.[profile?.role || 'delivery'] > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-bold flex items-center justify-center rounded-full border border-white">
                {m.unreadCounts[profile?.role || 'delivery']}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="p-3.5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
              <Hospital size={10} /> Origine
            </p>
            <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 leading-tight truncate">{m.hospitalLocation}</p>
          </div>
          <div>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
              <MapPin size={10} /> Ville
            </p>
            <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 leading-tight truncate">{cities.find(c => c.id === m.cityId)?.name || "Non précisée"}</p>
          </div>
          
          <div className="col-span-2 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 flex items-start gap-3">
             {m.facadePhoto && (
               <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700">
                 <img src={m.facadePhoto} className="w-full h-full object-cover" />
               </div>
             )}
             <div className="min-w-0 flex-1">
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1"><User size={10} /> Client</p>
               <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{m.patientName || "Client"}</p>
               <div className="flex gap-1.5 mt-1">
                 <a href={`tel:${m.patientPhone || ''}`} className="inline-flex items-center justify-center gap-1 text-[11px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-950/40 px-2 py-1 rounded-md border border-blue-100/50 flex-1">
                   <Phone size={10} />
                   Appeler
                 </a>
                 <a href={`https://wa.me/${(m.patientPhone || '').replace(/\D/g, '')}?text=Bonjour%2C%20je%20suis%20votre%20livreur%2E%20Pouvez-vous%20m'envoyer%20votre%20position%20en%20direct%20%3F`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1 text-[11px] text-emerald-600 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-md border border-emerald-100/50 flex-1 group" title="Demander position via WhatsApp">
                   <MapPin size={10} className="group-hover:animate-bounce" />
                   WhatsApp GPS
                 </a>
               </div>
             </div>
          </div>
          
          {m.landmark && (
            <div className="col-span-2 bg-amber-50 dark:bg-amber-950/20 p-2 rounded-xl border border-amber-100/30 dark:border-amber-900/40 flex items-start gap-2">
              <MapPin size={12} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-[8px] font-black text-amber-600/70 uppercase tracking-widest">Secteur / Quartier / Repère</p>
                <p className="text-xs font-bold text-amber-950 dark:text-amber-300 leading-tight">{m.landmark}</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100/50 dark:border-slate-850">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><Package size={10} /> Colis</p>
          <div className="space-y-1">
            {m.items?.slice(0, 1).map((item, i) => (
              <div key={i} className="flex justify-between text-[10px]">
                <span className="text-slate-600 dark:text-slate-300 truncate mr-2">{item.name}</span>
                <span className="font-bold shrink-0 text-slate-900 dark:text-white">x{item.quantity}</span>
              </div>
            ))}
            {m.items && m.items.length > 1 && (
              <p className="text-[9px] text-slate-400 italic">+{m.items.length - 1} autres</p>
            )}
          </div>
        </div>

      <div className="flex flex-col gap-2 mt-2">
        {!m.isHandedOver ? (
          <button 
            onClick={() => onShowPickupQR(m)}
            className="w-full py-2 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition-all shadow-sm flex items-center justify-center gap-1.5"
          >
            <QrCode size={13} />
            Code Retrait
          </button>
        ) : (
          <button 
            onClick={() => onShowDeliveryVerify(m)}
            className="w-full py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm flex items-center justify-center gap-1.5"
          >
            <ShieldCheck size={13} />
            Valider Livr.
          </button>
        )}
        <button 
          onClick={() => onShowMap(m)}
          className="w-full py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-1.5"
        >
          <Search size={13} /> Carte
        </button>
      </div>
    </div>
  </div>
  );
});

// --- Delivery Dashboard ---

const printReceipt = (order: Order) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    toast.error("Veuillez autoriser les fenêtres pop-up");
    return;
  }
  
  const dateStr = order.updatedAt 
    ? (order.updatedAt.toDate ? order.updatedAt.toDate().toLocaleDateString('fr-FR') : new Date(order.updatedAt).toLocaleDateString('fr-FR'))
    : new Date().toLocaleDateString('fr-FR');
  
  const itemsHtml = order.items && order.items.length > 0 
    ? order.items.map(item => `
        <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #e2e8f0; font-size: 13px;">
          <span>${item.name} x${item.quantity}</span>
          <span>${item.price * item.quantity} FCFA</span>
        </div>
      `).join('')
    : '<div style="font-size: 13px; color: #718096; text-align: center; padding: 8px 0;">Aucun article individuel listé</div>';

  printWindow.document.write(`
    <html>
      <head>
        <title>RECU DE LIVRAISON DIRECTE - #${order.id.slice(-6).toUpperCase()}</title>
        <style>
          body {
            font-family: 'Courier New', Courier, monospace;
            padding: 20px;
            max-width: 320px;
            margin: 0 auto;
            color: #1a202c;
            background: #fff;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #000;
            padding-bottom: 10px;
            margin-bottom: 15px;
          }
          .title {
            font-size: 18px;
            font-weight: bold;
            margin: 5px 0;
            text-transform: uppercase;
          }
          .details-row {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            margin: 4px 0;
          }
          .divider {
            border-top: 2px dashed #000;
            margin: 15px 0;
          }
          .total-box {
            text-align: right;
            font-size: 16px;
            font-weight: bold;
            margin-top: 15px;
          }
          .footer {
            text-align: center;
            font-size: 10px;
            color: #718096;
            margin-top: 30px;
            border-top: 1px solid #000;
            padding-top: 10px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <img id="receipt-logo" src="${window.location.origin}/logoOD.png" alt="Logo" onerror="this.onerror=null; this.src='${window.location.origin}/logo-web.png';" style="height: 55px; width: auto; object-fit: contain; margin-bottom: 8px;" />
          <div class="title">ORDONNANCE DIRECT</div>
          <div style="font-size: 11px; font-weight: bold; margin-top: 4px;">REÇU DE LIVRAISON SÉCURISÉE</div>
        </div>
        
        <div style="font-size: 12px; margin-bottom: 10px; text-align: center; font-weight: bold;">
          RECU N°: ODR-${order.id.slice(-8).toUpperCase()}
        </div>
        
        <div class="details-row"><strong>Date:</strong> <span>${dateStr}</span></div>
        <div class="details-row"><strong>Statut:</strong> <span style="text-transform: uppercase;">${order.status}</span></div>
        
        <div class="divider"></div>
        
        <div style="font-size: 14px; font-weight: bold; margin-bottom: 6px;">PARTIES CONCERNÉES :</div>
        <div class="details-row"><strong>Client:</strong> <span>${order.patientName || "Anonyme"}</span></div>
        <div class="details-row"><strong>Tél Client:</strong> <span>${order.patientPhone || "Non spécifié"}</span></div>
        <div class="details-row"><strong>Livreur:</strong> <span>${order.deliveryPersonName || "Non spécifié"}</span></div>
        <div class="details-row"><strong>Tél Livreur:</strong> <span>${order.deliveryPersonPhone || "Non spécifié"}</span></div>
        
        <div class="divider"></div>
        
        <div style="font-size: 14px; font-weight: bold; margin-bottom: 6px;">ITINÉRAIRE & TRAJET :</div>
        <div style="font-size: 11.5px; margin-bottom: 4px;"><strong>Départ:</strong> ${order.pharmacyName || "Pharmacie"}</div>
        <div style="font-size: 11.5px; margin-bottom: 8px; color: #4a5568;">(${order.pharmacyLocation || "Adresse Pharmacie"})</div>
        <div style="font-size: 11.5px; margin-bottom: 4px;"><strong>Arrivée:</strong> ${order.hospitalLocation || "Destination Patient"}</div>
        <div style="font-size: 11.5px; margin-bottom: 8px; color: #4a5568;">(${order.landmark || "Aucun point de repère fourni"})</div>
        
        <div class="divider"></div>
        
        <div style="font-size: 14px; font-weight: bold; margin-bottom: 8px;">MÉDICAMENTS LIVRÉS :</div>
        ${itemsHtml}
        
        <div class="divider"></div>
        
        <div class="details-row"><span>Total Panier:</span> <span>${order.medicationTotal || 0} FCFA</span></div>
        <div class="details-row"><span>Frais de Service:</span> <span>${order.serviceFee || order.platformFee || 0} FCFA</span></div>
        <div class="details-row"><span>Frais de Livraison:</span> <span>${order.deliveryFee || 0} FCFA</span></div>
        
        <div class="total-box">
          TOTAL PAYÉ: ${order.totalAmount || 0} FCFA
        </div>
        <div class="details-row" style="font-size: 11px; margin-top: 5px;">
          <span>Mode Paiement:</span> 
          <span style="text-transform: uppercase; font-weight: bold;">${order.paymentMethod ? order.paymentMethod.replace('_', ' ') : 'Mobile Money'}</span>
        </div>
        
        <div class="footer">
          <p>Merci pour votre confiance !</p>
          <p>Ordonnance Direct - Votre Santé, Notre Priorité</p>
          <p>&copy; ${new Date().getFullYear()} Tous droits réservés.</p>
        </div>
        
        <script>
          function startPrint() {
            window.print();
            window.onafterprint = function() {
              window.close();
            };
          }
          window.onload = function() {
            const img = document.getElementById('receipt-logo');
            if (img && !img.complete) {
              img.onload = startPrint;
              img.onerror = startPrint;
            } else {
              startPrint();
            }
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};

const DeliveryDashboard = React.memo(({ profile, settings, cities }: { profile: UserProfile, settings: Settings | null, cities: City[] }) => {
  const [missions, setMissions] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'available' | 'active' | 'history' | 'wallet' | 'profile' | 'reports'>('available');

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.scrollTop = 0;
  }, [activeTab]);

  const [showPickupQR, setShowPickupQR] = useState<Order | null>(null);
  const [showDeliveryVerify, setShowDeliveryVerify] = useState<Order | null>(null);
  const [deliveryCodeInput, setDeliveryCodeInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [phoneInput, setPhoneInput] = useState(profile.phone || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [historyMissions, setHistoryMissions] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [deliveryPhoto, setDeliveryPhoto] = useState<string | null>(null);
  const [deliverySignature, setDeliverySignature] = useState<string | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [activeChatOrderId, setActiveChatOrderId] = useState<string | null>(null);

  const isFirstRunDeliveryMissions = useRef(true);
  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', 'in', ['paid', 'preparing', 'ready', 'delivering']),
      limit(50)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Filter and sort in JS to avoid composite index requirement
      const allMissions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order))
        .filter(m => !m.cityId || m.cityId === profile.cityId);
      
      // Play sound for new missions or status updates (excluding initial load)
      const hasChange = snapshot.docChanges().some(change => change.type === 'added' || change.type === 'modified');
      if (!isFirstRunDeliveryMissions.current && hasChange && !snapshot.metadata.hasPendingWrites) {
        playNotificationSound(settings, profile?.sound_enabled !== false);
      }
      isFirstRunDeliveryMissions.current = false;

      // Sort by createdAt desc
      allMissions.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });

      setMissions(allMissions);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'orders'));
    return () => unsubscribe();
  }, [profile.uid, profile.cityId, settings, profile?.sound_enabled]);

  const availableMissions = missions.filter(m => ['pending_payment', 'paid', 'preparing', 'ready'].includes(m.status) && m.deliveryMethod === 'delivery' && !m.deliveryId && !m.rejectedBy?.includes(profile.uid));
  const activeMissions = missions.filter(m => ['pending_payment', 'paid', 'preparing', 'ready', 'delivering'].includes(m.status) && m.deliveryId === profile.uid);
  
  const [dailyGains, setDailyGains] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'transactions'), 
      where('userId', '==', profile.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      const filtered = txs.filter(t => t.userRole === 'delivery');
      filtered.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      setTransactions(filtered.slice(0, 10));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'transactions'));
    return () => unsubscribe();
  }, [profile.uid]);

  useEffect(() => {
    const q = query(
      collection(db, 'withdrawals'),
      where('userId', '==', profile.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ws = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithdrawalRequest));
      setWithdrawals(ws.filter(w => w.userRole === 'delivery'));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawals'));
    return () => unsubscribe();
  }, [profile.uid]);

  const [completedMissionsCount, setCompletedMissionsCount] = useState(0);
  const [showMapForOrder, setShowMapForOrder] = useState<Order | null>(null);

  useEffect(() => {
    let watchId: number;
    const deliveringMissions = activeMissions.filter(m => m.status === 'delivering');
    
    if (deliveringMissions.length > 0 && navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          deliveringMissions.forEach(async (mission) => {
            try {
              await updateDoc(doc(db, 'orders', mission.id), {
                driverLocation: { lat: latitude, lng: longitude }
              });
            } catch (error) {
              console.error("Error updating driver location:", error);
            }
          });
        },
        (error) => {
          const errorMessages = {
            1: "Permission de géolocalisation refusée.",
            2: "Position indisponible (vérifiez vos paramètres GPS).",
            3: "Délai d'attente de géolocalisation dépassé."
          };
          const msg = errorMessages[error.code as keyof typeof errorMessages] || error.message;
          console.error("Error watching position:", msg, error);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
      );
    }

    return () => {
      if (watchId !== undefined && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [activeMissions]);

  const handleRejectMission = async (orderId: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        rejectedBy: arrayUnion(profile.uid)
      });
      toast.info("Mission refusée. Elle ne vous sera plus proposée.");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  useEffect(() => {
    const q = query(
      collection(db, 'orders'), 
      where('deliveryId', '==', profile.uid),
      limit(150)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      const docs = allDocs.filter(d => d.status === 'completed');
      
      // Sort in JS
      docs.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let todayGains = 0;
      let totalGainsSum = 0;
      
      docs.forEach(o => {
        const amount = o.deliveryAmount || 0;
        totalGainsSum += amount;
        
        const date = o.updatedAt?.toDate ? o.updatedAt.toDate() : (o.updatedAt ? new Date(o.updatedAt) : new Date());
        if (date.getTime() >= today.getTime()) {
          todayGains += amount;
        }
      });
        
      setDailyGains(todayGains);
      setTotalEarned(totalGainsSum);
      setCompletedMissionsCount(docs.length);
      setHistoryMissions(docs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'orders'));
    return () => unsubscribe();
  }, [profile.uid]);

  const totalWithdrawn = withdrawals
    .filter(w => w.status !== 'rejected')
    .reduce((sum, w) => sum + w.amount, 0);
  const availableGains = totalEarned - totalWithdrawn;

  return (
    <>
    <PullToRefresh onRefresh={async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success("Données actualisées");
    }}>
      <div className="space-y-4 pb-8 transition-all">
      
      {/* Role Header (Android Style) */}
      <div className="bg-emerald-600 rounded-[2rem] p-4 relative overflow-hidden shadow-xl shadow-emerald-600/10">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-md">
              <Truck size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight text-white leading-none">Espace Livreur Partenaire</h1>
              <p className="text-emerald-300 text-xs font-bold uppercase tracking-wider mt-1.5">Réseau Logistique Santé • Burkina Faso</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${availableMissions.length > 0 ? 'bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse' : 'bg-slate-500'}`}></div>
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">{availableMissions.length > 0 ? `${availableMissions.length} Mission(s) Prête(s)` : 'En attente'}</span>
          </div>
        </div>
      </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-8">
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Gains du jour</p>
              <h3 className="text-lg sm:text-2xl font-extrabold text-slate-900">{dailyGains.toLocaleString()} <span className="text-xs font-bold text-emerald-600">FCFA</span></h3>
            </div>
            <div className="w-11 h-11 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
              <TrendingUp size={20} />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Disponible</p>
              <h3 className="text-lg sm:text-2xl font-extrabold text-slate-900">{availableGains.toLocaleString()} <span className="text-xs font-bold text-emerald-600">FCFA</span></h3>
            </div>
            <div className="w-11 h-11 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-700">
              <CreditCard size={20} />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Missions Disponibles</p>
              <h3 className="text-lg sm:text-2xl font-extrabold text-slate-900">{availableMissions.length}</h3>
            </div>
            <div className="w-11 h-11 bg-sky-50 rounded-2xl flex items-center justify-center text-sky-600">
              <MapPin size={20} />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Courses Réalisées</p>
              <h3 className="text-lg sm:text-2xl font-extrabold text-slate-900">{completedMissionsCount}</h3>
            </div>
            <div className="w-11 h-11 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
              <Package size={20} />
            </div>
          </div>
        </div>

      {/* Navigation Tabs (Desktop Side, Mobile Bottom) */}
      <div className="flex flex-col md:flex-row gap-8">
        {/* Desktop Sidebar */}
        <div className="hidden md:block w-64 flex-shrink-0">
          <div className="sticky top-24 space-y-2 p-2 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm">
            {[
              { id: 'available', label: 'Disponibles', icon: MapPin, count: availableMissions.length, color: 'text-primary', bg: 'bg-primary/5' },
              { id: 'active', label: 'En cours', icon: Truck, count: activeMissions.length, color: 'text-secondary', bg: 'bg-secondary/5' },
              { id: 'history', label: 'Historique', icon: Clock, count: historyMissions.length, color: 'text-amber-600', bg: 'bg-amber-50' },
              { id: 'wallet', label: 'Portefeuille', icon: CreditCard, count: null, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { id: 'reports', label: 'Rapports', icon: TrendingUp, count: null, color: 'text-purple-600', bg: 'bg-purple-50' },
              { id: 'profile', label: 'Mon Profil', icon: User, count: null, color: 'text-slate-600', bg: 'bg-slate-50' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => React.startTransition(() => setActiveTab(tab.id as any))}
                className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl font-bold transition-all duration-300 ${
                  activeTab === tab.id 
                    ? `${tab.bg} ${tab.color} shadow-sm` 
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-4">
                  <tab.icon size={20} />
                  {tab.label}
                </div>
                {tab.count !== null && (
                  <span className={`text-[10px] px-2.5 py-1 rounded-full ${activeTab === tab.id ? 'bg-white shadow-sm' : 'bg-slate-100'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Bottom Navigation (Android Native Feel) */}
        {createPortal(
          <div className="md:hidden fixed bottom-1 left-1 right-1 z-[9999] px-3 pt-1.5 bg-slate-900/95 backdrop-blur-2xl rounded-[1.75rem] shadow-2xl shadow-black/20 border border-white/5 mx-2 mb-2" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.25rem)' }}>
            <div className="flex items-center justify-around">
              {[
                { id: 'available', label: 'Mission', icon: MapPin, activeColor: 'bg-emerald-500' },
                { id: 'active', label: 'En cours', icon: Truck, activeColor: 'bg-sky-500' },
                { id: 'history', label: 'Missions', icon: Clock, activeColor: 'bg-indigo-500' },
                { id: 'profile', label: 'Profil', icon: User, activeColor: 'bg-slate-500' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => React.startTransition(() => setActiveTab(tab.id as any))}
                  className="flex flex-col items-center gap-1 min-w-[60px] relative transition-transform active:scale-90"
                >
                  <div className={`p-2.5 rounded-xl transition-all duration-300 ${
                    activeTab === tab.id 
                      ? `${tab.activeColor} text-white shadow-lg` 
                      : `text-slate-500`
                  }`}>
                    <tab.icon size={22} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-tight ${activeTab === tab.id ? 'text-white' : 'text-slate-500'}`}>
                    {tab.label}
                  </span>
                  {activeTab === tab.id && (
                    <motion.div 
                      layoutId="activeTabGlowDelivery"
                      className="absolute -top-1 w-8 h-[2px] rounded-full bg-white/30" 
                    />
                  )}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}

        <div className="flex-1 min-w-0 pb-36 md:pb-0">
          <div key={activeTab}>
              {activeTab === 'available' && (
                <PaginatedList
                  items={availableMissions}
                  pageSize={10}
                  emptyMessage="Aucune mission disponible"
                  emptyIcon={<Truck size={36} className="text-slate-400" />}
                  renderItem={(m) => (
                    <MissionCard 
                      key={m.id} 
                      m={m} 
                      onAccept={async (mission) => {
                        try {
                          await updateDoc(doc(db, 'orders', mission.id), { 
                            deliveryId: profile.uid,
                            deliveryPersonName: profile.name,
                            deliveryPersonPhone: profile.phone || "Non spécifié",
                            deliveryPersonPhoto: profile.photoUrl || null,
                            pickupCode: generateCode(),
                            isHandedOver: false,
                            updatedAt: serverTimestamp(),
                            history: arrayUnion({
                              status: mission.status,
                              timestamp: new Date().toISOString(),
                              label: 'Mission acceptée par le livreur'
                            })
                          });
                        } catch (err) {
                          handleFirestoreError(err, OperationType.UPDATE, `orders/${mission.id}`);
                        }
                      }} 
                      onReject={handleRejectMission} 
                    />
                  )}
                />
              )}

              {activeTab === 'active' && (
                <PaginatedList
                  items={activeMissions}
                  pageSize={10}
                  emptyMessage="Aucune livraison en cours"
                  emptyIcon={<Package size={36} className="text-slate-400" />}
                  renderItem={(m) => (
                    <DeliveryActiveCard 
                      key={m.id} 
                      m={m} 
                      profile={profile} 
                      cities={cities} 
                      onChat={setActiveChatOrderId} 
                      onShowPickupQR={setShowPickupQR} 
                      onShowDeliveryVerify={setShowDeliveryVerify} 
                      onShowMap={setShowMapForOrder} 
                    />
                  )}
                />
              )}

      {activeTab === 'history' && (
        <PaginatedList
          items={historyMissions}
          pageSize={10}
          emptyMessage="Aucun historique de livraison"
          emptyIcon={<Clock size={36} className="text-slate-400" />}
          renderItem={(m) => (
            <div key={m.id} onClick={() => setSelectedOrder(m)} className="flex items-center justify-between gap-3 p-1 cursor-pointer hover:bg-slate-50 transition-colors">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-sm">Commande #{m.id.slice(-6).toUpperCase()}</span>
                  <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">LIVRÉE</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{m.pharmacyName} → {m.patientName}</p>
              </div>
              <div className="text-right">
                <span className="font-bold text-emerald-700 text-xs block">{m.deliveryFee ? `${m.deliveryFee.toLocaleString('fr-FR')} FCFA` : '-'}</span>
                <span className="text-[10px] text-slate-400">{m.updatedAt ? formatDate(m.updatedAt, 'dateTime') : ''}</span>
              </div>
            </div>
          )}
        />
      )}

      {activeTab === 'wallet' && (
        <>
          <div className="space-y-8">
          <div className="bg-slate-900 text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
              <div>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mb-2">Gains Disponibles</p>
                <h2 className="text-5xl font-black">{availableGains.toLocaleString()} <span className="text-2xl text-slate-500">FCFA</span></h2>
              </div>
              <button 
                onClick={() => setShowWithdrawalModal(true)}
                className="btn-primary px-10 py-5 rounded-[2rem] flex items-center gap-3 group"
              >
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <CreditCard size={20} />
                </div>
                Retirer mes gains
              </button>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <h3 className="text-xl font-bold mb-6">Transactions Récentes</h3>
            <div className="space-y-4">
              {transactions.map(tx => (
                <div key={tx.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      tx.type === 'credit' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                    }`}>
                      {tx.type === 'credit' ? <Plus size={24} /> : <TrendingDown size={24} />}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{tx.description}</p>
                      <p className="text-xs text-slate-500">{formatDate(tx.createdAt)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-black ${tx.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {tx.type === 'credit' ? '+' : '-'}{tx.amount.toLocaleString()} CFA
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{tx.type === 'credit' ? 'Crédité' : 'Débité'}</p>
                  </div>
                </div>
              ))}
              {transactions.length === 0 && (
                <p className="text-center text-slate-400 py-8">Aucune transaction pour le moment.</p>
              )}
            </div>
          </div>
                  </div>
                </>
              )}

      {activeTab === 'reports' && (
        <>
          <div>
            <ReportsView profile={profile} />
          </div>
        </>
      )}

      {activeTab === 'profile' && (
        <>
          <div className="max-w-md mx-auto bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <div className="text-center mb-8">
              <div className="relative w-24 h-24 mx-auto mb-4">
                <div className="w-full h-full bg-slate-100 rounded-[2rem] flex items-center justify-center text-slate-400 overflow-hidden border-4 border-white shadow-lg">
                  {profile.photoUrl ? (
                    <img src={profile.photoUrl} alt={profile.name} className="w-full h-full object-cover" />
                  ) : (
                    <User size={48} />
                  )}
                </div>
                <label className="absolute -bottom-2 -right-2 w-10 h-10 bg-primary text-white rounded-xl flex items-center justify-center cursor-pointer hover:bg-primary-dark transition-all shadow-lg border-2 border-white">
                  <Camera size={18} />
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment"
                    className="hidden" 
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsUpdatingProfile(true);
                      try {
                        const base64 = await compressImage(file);
                        await updateDoc(doc(db, 'users', profile.uid), { photoUrl: base64 });
                        setIsUpdatingProfile(false);
                        toast.success("Photo de profil mise à jour !");
                      } catch (err) {
                        handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}`);
                        setIsUpdatingProfile(false);
                        toast.error("Erreur lors de la mise à jour de la photo.");
                      }
                    }}
                  />
                </label>
              </div>
              <h3 className="text-xl font-bold">{profile.name}</h3>
              <p className="text-slate-500 text-sm">{profile.email}</p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-2">Numéro de téléphone</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="tel" 
                    placeholder="Ex: +226 70 00 00 00"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl pl-12 pr-6 py-4 outline-none focus:border-primary transition-all font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-2">Paiement : Mobile Money (Optionnel)</label>
                  <div className="relative">
                    <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="tel" 
                      placeholder="N° de compensation"
                      value={profile.compensationPhone || ''}
                      onChange={async (e) => {
                        try {
                          await updateDoc(doc(db, 'users', profile.uid), { compensationPhone: e.target.value });
                        } catch (err) {}
                      }}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl pl-12 pr-6 py-4 outline-none focus:border-primary transition-all font-bold"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-2">Paiement : RIB Bancaire (Optionnel)</label>
                  <div className="relative">
                    <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="RIB compensation"
                      value={profile.compensationRIB || ''}
                      onChange={async (e) => {
                        try {
                          await updateDoc(doc(db, 'users', profile.uid), { compensationRIB: e.target.value });
                        } catch (err) {}
                      }}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl pl-12 pr-6 py-4 outline-none focus:border-primary transition-all font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-6">
                <div className="flex items-center gap-3">
                  <FileText className="text-primary" size={20} />
                  <h4 className="font-bold text-slate-900">Dossier Livreur</h4>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CNI Recto</label>
                    <div className="relative">
                      {profile.idCardFront ? (
                        <div className="relative w-full aspect-[3/2] rounded-xl overflow-hidden border-2 border-emerald-500 shadow-sm group">
                          <img src={profile.idCardFront} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <label className="cursor-pointer p-2 bg-white/20 backdrop-blur-md rounded-full text-white">
                              <Camera size={20} />
                              <input type="file" accept="image/*" capture="environment" className="hidden" 
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const base64 = await compressImage(file);
                                    await updateDoc(doc(db, 'users', profile.uid), { idCardFront: base64 });
                                  }
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      ) : (
                        <label className="w-full aspect-[3/2] bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:border-primary hover:text-primary transition-all">
                          <Camera size={20} />
                          <span className="text-[9px] font-bold mt-1 uppercase tracking-tighter">Photo</span>
                          <input type="file" accept="image/*" capture="environment" className="hidden" 
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const base64 = await compressImage(file);
                                await updateDoc(doc(db, 'users', profile.uid), { idCardFront: base64 });
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CNI Verso</label>
                    <div className="relative">
                      {profile.idCardBack ? (
                        <div className="relative w-full aspect-[3/2] rounded-xl overflow-hidden border-2 border-emerald-500 shadow-sm group">
                          <img src={profile.idCardBack} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <label className="cursor-pointer p-2 bg-white/20 backdrop-blur-md rounded-full text-white">
                              <Camera size={20} />
                              <input type="file" accept="image/*" capture="environment" className="hidden" 
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const base64 = await compressImage(file);
                                    await updateDoc(doc(db, 'users', profile.uid), { idCardBack: base64 });
                                  }
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      ) : (
                        <label className="w-full aspect-[3/2] bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:border-primary hover:text-primary transition-all">
                          <Camera size={20} />
                          <span className="text-[9px] font-bold mt-1 uppercase tracking-tighter">Photo</span>
                          <input type="file" accept="image/*" capture="environment" className="hidden" 
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const base64 = await compressImage(file);
                                await updateDoc(doc(db, 'users', profile.uid), { idCardBack: base64 });
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Informations Garant</label>
                  <input 
                    type="text" 
                    placeholder="Nom du garant"
                    value={profile.guarantorInfo?.name || ''}
                    onChange={async (e) => {
                      try {
                        await updateDoc(doc(db, 'users', profile.uid), { 
                          guarantorInfo: { ...profile.guarantorInfo || { phone: '', address: '' }, name: e.target.value } 
                        });
                      } catch (err) {}
                    }}
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                  />
                  <input 
                    type="tel" 
                    placeholder="Téléphone du garant"
                    value={profile.guarantorInfo?.phone || ''}
                    onChange={async (e) => {
                      try {
                        await updateDoc(doc(db, 'users', profile.uid), { 
                          guarantorInfo: { ...profile.guarantorInfo || { name: '', address: '' }, phone: e.target.value } 
                        });
                      } catch (err) {}
                    }}
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                  />
                  <textarea 
                    placeholder="Adresse du garant"
                    value={profile.guarantorInfo?.address || ''}
                    onChange={async (e) => {
                      try {
                        await updateDoc(doc(db, 'users', profile.uid), { 
                          guarantorInfo: { ...profile.guarantorInfo || { name: '', phone: '' }, address: e.target.value } 
                        });
                      } catch (err) {}
                    }}
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 min-h-[60px]"
                  />
                </div>
              </div>

              <button 
                onClick={async () => {
                  setIsUpdatingProfile(true);
                  try {
                    await updateDoc(doc(db, 'users', profile.uid), { phone: phoneInput });
                    toast.success("Profil mis à jour !");
                  } catch (err) {
                    handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}`);
                    toast.error("Erreur lors de la mise à jour du profil.");
                  }
                  setIsUpdatingProfile(false);
                }}
                disabled={isUpdatingProfile}
                className="btn-primary w-full"
              >
                {isUpdatingProfile ? "Mise à jour..." : "Enregistrer les modifications"}
              </button>
            </div>
          </div>
        </>
      )}
            </div>
        </div>
      </div>

   {/* Pickup QR Modal */}
   <>
     {showPickupQR && createPortal(
       <div className="fixed inset-0 bg-slate-900/65 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
         <motion.div 
           initial={{ scale: 0.95, opacity: 0, y: 20 }}
           animate={{ scale: 1, opacity: 1, y: 0 }}
           exit={{ scale: 0.95, opacity: 0, y: 20 }}
           className="bg-white rounded-[2rem] shadow-2xl max-w-sm w-full p-6 text-center overflow-hidden"
         >
           <div className="flex items-center justify-between mb-6">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                 <QrCode size={20} />
               </div>
               <div className="text-left">
                 <h3 className="text-lg font-black text-slate-900 leading-tight">Code de Retrait</h3>
                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Commande #{showPickupQR.id.slice(-6).toUpperCase()}</p>
               </div>
             </div>
             <button 
               onClick={() => setShowPickupQR(null)}
               className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-colors"
             >
               <X size={20} />
             </button>
           </div>
           
           <div className="bg-slate-50 p-6 rounded-3xl mb-6 flex flex-col items-center justify-center border border-slate-100 ring-4 ring-slate-50/50">
             <div className="bg-white p-4 rounded-2xl shadow-sm">
               <QRCodeCanvas value={showPickupQR.pickupCode || ""} size={160} />
             </div>
             <div className="mt-4 text-center">
               <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-1">Code numérique</p>
               <p className="text-3xl font-black tracking-[0.3em] text-slate-900 leading-tight">{showPickupQR.pickupCode}</p>
             </div>
           </div>

           <p className="text-slate-500 text-xs font-medium leading-relaxed px-4 mb-2">
             Présentez ce QR Code au pharmacien pour valider le retrait de votre commande en officine.
           </p>
         </motion.div>
       </div>,
       document.body
     )}
   </>

  {/* Delivery Verify Modal */}
  <>
    {showDeliveryVerify && createPortal(
       <div className="fixed inset-0 bg-slate-900/65 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
         <motion.div 
           initial={{ scale: 0.95, opacity: 0, y: 20 }}
           animate={{ scale: 1, opacity: 1, y: 0 }}
           exit={{ scale: 0.95, opacity: 0, y: 20 }}
           className="bg-white rounded-[2rem] shadow-2xl max-w-sm w-full p-6 text-center overflow-hidden"
         >
           <div className="flex items-center justify-between mb-6">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                 <ShieldCheck size={20} />
               </div>
               <div className="text-left">
                 <h3 className="text-lg font-black text-slate-900 leading-tight">Vérification Patient</h3>
                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Finalisation Livraison</p>
               </div>
             </div>
             <button 
               onClick={() => {
                 setShowDeliveryVerify(null);
                 setDeliveryCodeInput('');
               }}
               className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-colors"
             >
               <X size={20} />
             </button>
           </div>
           
           <div className="grid grid-cols-2 gap-3 mb-6">
             <div className="space-y-2">
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-left ml-1">Preuve Photo</p>
               <div className="relative">
                 {deliveryPhoto ? (
                   <div className="relative w-full aspect-square rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-sm">
                     <img src={deliveryPhoto} className="w-full h-full object-cover" />
                     <button onClick={() => setDeliveryPhoto(null)} className="absolute top-1 right-1 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg"><X size={12} /></button>
                   </div>
                 ) : (
                   <label className="w-full aspect-square bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:border-primary hover:text-primary transition-all group">
                     <Camera size={24} className="group-hover:scale-110 transition-transform" />
                     <span className="text-[9px] font-bold mt-1 uppercase tracking-tighter">Photo</span>
                     <input 
                       type="file" 
                       accept="image/*" 
                       capture="environment" 
                       className="hidden" 
                       onChange={async (e) => {
                         const file = e.target.files?.[0];
                         if (file) {
                           const base64 = await compressImage(file, RAM_OPTIMIZED_COMPRESSION.maxWidth, RAM_OPTIMIZED_COMPRESSION.maxHeight, RAM_OPTIMIZED_COMPRESSION.quality);
                           setDeliveryPhoto(base64);
                         }
                       }}
                     />
                   </label>
                 )}
               </div>
             </div>

             <div className="space-y-2">
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-left ml-1">Signature</p>
               <div className="relative">
                 {deliverySignature ? (
                   <div className="relative w-full aspect-square bg-slate-50 border-2 border-emerald-500 rounded-2xl overflow-hidden shadow-sm">
                     <img src={deliverySignature} className="w-full h-full object-contain" />
                     <button onClick={() => setDeliverySignature(null)} className="absolute top-1 right-1 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg"><X size={12} /></button>
                   </div>
                 ) : (
                   <button 
                     onClick={() => setShowSignaturePad(true)}
                     className="w-full aspect-square bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:border-primary hover:text-primary transition-all group"
                   >
                     <PenTool size={24} className="group-hover:scale-110 transition-transform" />
                     <span className="text-[9px] font-bold mt-1 uppercase tracking-tighter">Signer</span>
                   </button>
                 )}
               </div>
             </div>
           </div>

           <div className="space-y-3 mb-6">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left ml-1">Code de Livraison (6 chiffres)</p>
             <input 
               type="text" 
               maxLength={6}
               placeholder="000000"
               value={deliveryCodeInput}
               onChange={(e) => setDeliveryCodeInput(e.target.value)}
               className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-center text-3xl font-black tracking-[0.2em] outline-none focus:border-emerald-500 transition-all shadow-inner"
             />
           </div>

           <div className="flex flex-col gap-2">
             <button 
               onClick={async () => {
                 if (deliveryCodeInput === showDeliveryVerify.deliveryCode) {
                   setIsVerifying(true);
                   const toastId = toast.loading("Validation du code...");
                  try {
                    const order = showDeliveryVerify;
                    const batch = writeBatch(db);
                    const orderRef = doc(db, 'orders', order.id);
                    const deliveryAmount = order.deliveryAmount || 0;
                    const pharmacyAmount = order.pharmacyAmount || 0;
                    
                    // 1. Credit Delivery Driver Wallet and Update Stats
                    if (deliveryAmount > 0) {
                      const deliveryRef = doc(db, 'users', profile.uid);

                      batch.update(deliveryRef, {
                        deliveryBalance: increment(deliveryAmount),
                        walletBalance: increment(deliveryAmount)
                      });
                      
                      // Log Transaction
                      const deliveryTxRef = doc(collection(db, 'transactions'));
                      batch.set(deliveryTxRef, {
                        id: deliveryTxRef.id,
                        userId: profile.uid,
                        userName: profile.name,
                        userRole: 'delivery',
                        amount: deliveryAmount,
                        type: 'credit',
                        description: `Gains livraison pour commande #${order.id.slice(-6).toUpperCase()}`,
                        referenceId: order.id,
                        createdAt: serverTimestamp()
                      });

                      // Notification
                      const deliveryNotifRef = doc(collection(db, 'notifications'));
                      batch.set(deliveryNotifRef, {
                        userId: profile.uid,
                        title: "Paiement reçu",
                        message: `Vous avez reçu ${deliveryAmount} FCFA pour la livraison #${order.id.slice(-6).toUpperCase()}.`,
                        type: 'payment',
                        referenceId: order.id,
                        read: false,
                        createdAt: serverTimestamp()
                      });
                    }

                    // Update pharmacy load (decrement)
                    if (order.pharmacyId) {
                      batch.update(doc(db, 'pharmacies', order.pharmacyId), {
                        currentActiveOrders: increment(-1)
                      });
                    }

                    // 2. Confirm Delivery and Finish Mission
                    batch.update(orderRef, { 
                      status: 'completed', 
                      updatedAt: serverTimestamp(),
                      deliveryPhoto: deliveryPhoto || null,
                      deliverySignature: deliverySignature || null,
                      history: arrayUnion({
                        status: 'completed',
                        timestamp: new Date().toISOString(),
                        label: 'Livraison effectuée avec succès'
                      })
                    });

                    await batch.commit();
                    console.log(`[DEBUG] Batch commit SUCCESS for order ${order.id}`);
                    toast.success("Livraison confirmée et mission terminée !", { id: toastId });
                    setShowDeliveryVerify(null);
                    setDeliveryCodeInput('');
                  } catch (err: any) {
                    console.error(`[DEBUG] Batch commit ERROR for order ${showDeliveryVerify.id}:`, err);
                    if (err.message?.includes('permission-denied')) {
                      console.error("[DEBUG] SECURITY RULE REJECTION detected.");
                    }
                    handleFirestoreError(err, OperationType.UPDATE, `orders/${showDeliveryVerify.id}`);
                    toast.error("Erreur lors du processus. Veuillez réessayer.", { id: toastId });
                  } finally {
                    setIsVerifying(false);
                  }
                } else {
                  toast.error("Code incorrect. Veuillez vérifier avec le patient.");
                }
              }}
              disabled={isVerifying || deliveryCodeInput.length !== 6}
              className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
            >
              {isVerifying ? "Vérification..." : "Confirmer la Livraison"}
            </button>
            <button 
              onClick={() => {
                setShowDeliveryVerify(null);
                setDeliveryCodeInput('');
              }}
              className="w-full bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold"
            >
              Annuler
            </button>
          </div>
        </motion.div>
      </div>,
      document.body
    )}
  </>

  {/* Map Modal */}
  <>
    {showMapForOrder && createPortal(
      <div className="fixed inset-0 bg-slate-900/75 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-[2.5rem] shadow-2xl max-w-2xl w-full p-8"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold">Itinéraire de Livraison</h3>
            <button onClick={() => setShowMapForOrder(null)} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
              <Plus size={24} className="rotate-45" />
            </button>
          </div>
          
          <React.Suspense fallback={<div className="h-[300px] w-full bg-slate-100 animate-pulse rounded-2xl flex items-center justify-center font-bold text-slate-400">Chargement de la carte...</div>}>
            <MapComponent 
              center={showMapForOrder.driverLocation ? [showMapForOrder.driverLocation.lat, showMapForOrder.driverLocation.lng] : [12.3714, -1.5197]}
              markers={[
                { 
                  pos: showMapForOrder.driverLocation ? [showMapForOrder.driverLocation.lat, showMapForOrder.driverLocation.lng] : [12.3714, -1.5197], 
                  label: "Livreur (Moi)", 
                  color: "blue", 
                  type: 'delivery' 
                },
                { 
                  pos: showMapForOrder.pharmacyLocationCoords ? [showMapForOrder.pharmacyLocationCoords.lat, showMapForOrder.pharmacyLocationCoords.lng] : [12.3800, -1.5100], 
                  label: `Pharmacie: ${showMapForOrder.pharmacyName}`, 
                  color: "green", 
                  type: 'pharmacy' 
                },
                { 
                  pos: showMapForOrder.patientLocation ? [showMapForOrder.patientLocation.lat, showMapForOrder.patientLocation.lng] : [12.3600, -1.5300], 
                  label: `Patient: ${showMapForOrder.patientName}`, 
                  color: "red", 
                  type: 'patient' 
                }
              ]}
            />
          </React.Suspense>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Pharmacie</p>
              <p className="text-sm font-bold">{showMapForOrder.pharmacyName}</p>
              <p className="text-xs text-slate-500">{showMapForOrder.pharmacyLocation}</p>
            </div>
            <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
              <p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest mb-1">Patient</p>
              <p className="text-sm font-bold">{showMapForOrder.patientName}</p>
              <p className="text-xs text-slate-500">{showMapForOrder.hospitalLocation}</p>
            </div>
          </div>
        </motion.div>
      </div>,
      document.body
    )}
  </>


    {showSignaturePad && createPortal(
      <div className="fixed inset-0 bg-slate-900/75 z-[210] flex items-center justify-center p-4 backdrop-blur-sm">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full p-8"
        >
          <h3 className="text-xl font-bold mb-6">Signature du Patient</h3>
          <SignaturePad 
            onSave={(sig) => {
              setDeliverySignature(sig);
              setShowSignaturePad(false);
            }}
            onCancel={() => setShowSignaturePad(false)}
          />
          <button 
            onClick={() => setShowSignaturePad(false)}
            className="w-full mt-4 py-3 text-slate-400 font-bold"
          >
            Annuler
          </button>
        </motion.div>
      </div>,
      document.body
    )}
    </div>
  </PullToRefresh>
  {activeChatOrderId && (
    <Suspense fallback={null}>
      <OrderChat 
        orderId={activeChatOrderId} 
        userId={profile?.uid} 
        userName={profile?.name} 
        userRole={profile?.role}
        onClose={() => setActiveChatOrderId(null)} 
      />
    </Suspense>
  )}

  {/* Order Details/Receipt Modal */}
  {selectedOrder && createPortal(
    <div className="fixed inset-0 bg-slate-900/75 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-[2.5rem] shadow-2xl max-w-lg w-full p-8 overflow-y-auto max-h-[90vh]"
      >
        <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full">Course #{selectedOrder.id.slice(-6).toUpperCase()}</span>
            <h3 className="text-2xl font-black text-slate-900 mt-2 text-left">Détails de la course</h3>
          </div>
          <button onClick={() => setSelectedOrder(null)} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 text-left">
          {/* Status and Big Earnings Indicator */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-emerald-500 text-white p-5 rounded-3xl relative overflow-hidden">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/70 block mb-1">Votre gain</span>
              <span className="text-2xl font-black">+{selectedOrder.deliveryFee || 1500} FCFA</span>
              <div className="absolute top-1/2 right-4 -translate-y-1/2 opacity-20"><CreditCard size={40} /></div>
            </div>
            <div className="bg-slate-900 text-white p-5 rounded-3xl relative overflow-hidden">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Statut actuel</span>
              <span className="text-lg font-black uppercase tracking-tight block mt-1">
                {selectedOrder.status === 'completed' ? 'Livrée' : 
                 selectedOrder.status === 'delivering' ? 'En cours' : 
                 selectedOrder.status === 'ready' ? 'Prête' : 'En attente'}
              </span>
              <div className="absolute top-1/2 right-4 -translate-y-1/2 opacity-20"><Truck size={40} /></div>
            </div>
          </div>

          {/* Client profile */}
          <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Patient Destinataire</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-extrabold text-slate-900 text-base">{selectedOrder.patientName || "Client Ordonnance Direct"}</p>
                <p className="text-xs text-slate-500 mt-1">{selectedOrder.patientPhone || "Pas de numéro"}</p>
              </div>
              {selectedOrder.patientPhone && (
                <a 
                  href={`tel:${selectedOrder.patientPhone}`}
                  className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center hover:bg-emerald-100 transition-all shadow-sm shadow-emerald-600/5 animate-pulse"
                >
                  <PhoneCall size={20} />
                </a>
              )}
            </div>
          </div>

          {/* Departure and Destination Route details */}
          <div className="relative border-l-2 border-dashed border-slate-200 pl-6 ml-3 space-y-6">
            <div className="relative">
              <span className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-emerald-500 border-4 border-white shadow-md"></span>
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Point de départ (Pharmacie)</p>
              <p className="font-bold text-slate-800">{selectedOrder.pharmacyName || "Pharmacie Partenaire"}</p>
              <p className="text-xs text-slate-500 mt-0.5">{selectedOrder.pharmacyLocation || "Adresse de retrait"}</p>
            </div>

            <div className="relative">
              <span className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-rose-500 border-4 border-white shadow-md"></span>
              <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">Point d'arrivée (Patient)</p>
              <p className="font-bold text-slate-800">{selectedOrder.hospitalLocation || "Adresse de livraison"}</p>
              {selectedOrder.landmark && (
                <p className="text-xs text-slate-500 mt-0.5 bg-rose-50/50 inline-block px-2 py-0.5 rounded border border-rose-100/30">Repère : {selectedOrder.landmark}</p>
              )}
            </div>
          </div>

          {/* Route distance estimation */}
          <div className="bg-slate-50 p-4 rounded-3xl grid grid-cols-2 gap-4 text-center border border-slate-100">
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">Distance Estimée</p>
              <p className="text-base font-extrabold text-slate-800 mt-1 font-mono">~5.2 km</p>
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">Durée de Course</p>
              <p className="text-base font-extrabold text-slate-800 mt-1 font-mono">~15-20 min</p>
            </div>
          </div>

          {/* Items Summary */}
          {selectedOrder.items && selectedOrder.items.length > 0 && (
            <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Articles de la commande</p>
              <div className="max-h-24 overflow-y-auto space-y-2">
                {selectedOrder.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between text-xs font-medium text-slate-700">
                    <span>{it.name} <span className="text-slate-400">x{it.quantity}</span></span>
                    <span className="font-bold text-slate-900">{it.price * it.quantity} FCFA</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            {selectedOrder.status === 'completed' && (
              <button 
                onClick={() => printReceipt(selectedOrder)}
                className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2"
              >
                <Printer size={18} /> Imprimer le reçu (PDF)
              </button>
            )}
            
            <button 
              onClick={() => setSelectedOrder(null)}
              className="w-full bg-slate-100 text-slate-700 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all border border-slate-200"
            >
              Fermer
            </button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  )}
  </>
  );
});
