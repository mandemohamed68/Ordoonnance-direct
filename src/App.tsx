/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
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
import { 
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
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType, messaging } from './firebase';
import { getToken, onMessage } from 'firebase/messaging';
import { UserProfile, Prescription, Order, UserRole, Pharmacy, Settings, Transaction, WithdrawalRequest, City, OnCallRotation } from './types';
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
  Home,
  Info,
  Mail, PhoneCall
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeCanvas } from 'qrcode.react';
import { toast } from 'sonner';
import ErrorBoundary from './components/ErrorBoundary';

import { logTransaction, createNotification, formatDate, isSuperAdminEmail, notifyDeliveryDrivers, compressImage, RAM_OPTIMIZED_COMPRESSION, getCurrentOnCallGroup, isCityOnCallNow, calculateDistance, findNearestCity } from './utils/shared';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PullToRefresh } from './components/PullToRefresh';
import { OrderChat } from './components/OrderChat';
import { getApiUrl } from './config';
import { GoogleGenAI, ThinkingLevel, Modality } from "@google/genai";
import { AdminDashboard } from './components/AdminDashboard';
import { Legal } from './components/Legal';
import { ReportsView } from './components/ReportsView';

const MapComponent = React.lazy(() => import('./components/MapComponent'));

// --- Global Helpers ---
let globalIsFirstLoad = true;
setTimeout(() => { globalIsFirstLoad = false; }, 3000);

const playNotificationSound = () => {
  if (globalIsFirstLoad) return;
  try {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.volume = 0.6;
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

const generateInvoice = (order: Order, profile: UserProfile) => {
  const doc = new jsPDF();
  
  // Custom styling elements
  doc.setFillColor(248, 250, 252); // slate-50
  doc.rect(0, 0, 210, 45, 'F');
  
  // Header
  doc.setFontSize(26);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(16, 185, 129); // emerald-600
  doc.text("FACTURE", 14, 25);
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Réf: #${order.id.slice(-8).toUpperCase()}`, 14, 33);
  
  let orderDateStr = "Date inconnue";
  try {
    if (order.createdAt) {
      // Handle Firebase Timestamp or fallback to standard Date parsing
      const d = (order.createdAt as any).toDate ? (order.createdAt as any).toDate() : new Date(order.createdAt as any);
      if (!isNaN(d.getTime())) {
        orderDateStr = d.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      }
    }
  } catch (e) {}
  doc.text(`Date: ${orderDateStr}`, 14, 38);
  
  // Patient & Pharmacy Info Area
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(50);
  doc.text("Facturé à :", 14, 55);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.text(profile.name || "Client", 14, 62);
  if (profile.phone) doc.text(profile.phone, 14, 67);
  if (profile.email) doc.text(profile.email, 14, 72);
  
  doc.setFont("helvetica", "bold");
  doc.setTextColor(50);
  doc.text("Émis par (Pharmacie) :", 110, 55);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.text(order.pharmacyName || "Pharmacie Partenaire", 110, 62);
  doc.text("Ordonnance Direct - Burkina Faso", 110, 67);
  
  // Items Table
  const tableColumn = ["Désignation", "Prix Unitaire", "Quantité", "Total"];
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
    tableRows.push(["Commande globale", "-", "-", `${(order.medicationTotal || 0).toLocaleString('fr-FR')} FCFA`]);
  }
  
  // @ts-ignore
  autoTable(doc, {
    startY: 85,
    head: [tableColumn],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 6 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { top: 10, left: 14, right: 14 }
  });
  
  // Totals
  // @ts-ignore
  const finalY = doc.lastAutoTable?.finalY || 85;
  
  // Background for totals block
  doc.setFillColor(248, 250, 252);
  doc.rect(96, finalY + 10, 100, 50, 'F');
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  
  let currentY = finalY + 20;
  
  doc.text("Sous-total Médicaments :", 102, currentY);
  doc.text(`${(order.medicationTotal || 0).toLocaleString('fr-FR')} FCFA`, 190, currentY, { align: 'right' });
  currentY += 8;
  
  if (order.deliveryFee) {
    doc.text("Frais de Livraison :", 102, currentY);
    doc.text(`${(order.deliveryFee).toLocaleString('fr-FR')} FCFA`, 190, currentY, { align: 'right' });
    currentY += 8;
  }
  
  if (order.serviceFee) {
    doc.text("Frais de Service :", 102, currentY);
    doc.text(`${(order.serviceFee).toLocaleString('fr-FR')} FCFA`, 190, currentY, { align: 'right' });
    currentY += 8;
  }
  
  // Separator line
  doc.setDrawColor(200, 200, 200);
  doc.line(102, currentY - 3, 190, currentY - 3);
  
  currentY += 5;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(16, 185, 129);
  doc.text("TOTAL PAYÉ :", 102, currentY);
  doc.text(`${(order.totalAmount || 0).toLocaleString('fr-FR')} FCFA`, 190, currentY, { align: 'right' });
  
  // Footer
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(150);
  doc.text("Document généré informatiquement par Ordonnance Direct.", 105, 275, { align: 'center' });
  doc.text("Merci de votre confiance !", 105, 280, { align: 'center' });
  
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

const LogoIcon = React.memo(({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <div style={{ width: size, height: size }} className={`flex items-center justify-center shrink-0 ${className}`}>
    <img 
      src="/logo192.png" 
      alt="Ordonnance Direct Logo" 
      className="w-full h-full object-contain rounded-full border-2 border-white/20 shadow-sm"
      onError={(e) => {
        // Fallback to old cross icon if image is missing
        e.currentTarget.style.display = 'none';
        const svg = `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="${className}"><rect width="100" height="100" rx="24" fill="#10b981" /><path d="M35 25C35 22.2386 37.2386 20 40 20H60C62.7614 20 65 22.2386 65 25V75C65 77.7614 62.7614 80 60 80H40C37.2386 80 35 77.7614 35 75V25Z" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/><path d="M42 20V25H58V20" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/><path d="M30 50H70" stroke="white" strokeWidth="12" strokeLinecap="round"/><path d="M50 30V70" stroke="white" strokeWidth="12" strokeLinecap="round"/><path d="M35 75V85H65L75 75" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/><path d="M65 85L75 75L65 65" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/></svg>`;
        if (e.currentTarget.parentElement) {
          e.currentTarget.parentElement.innerHTML = svg;
        }
      }}
    />
  </div>
));

function NotificationBell({ userId }: { userId: string }) {
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
        playNotificationSound();
      }
      isFirstRun.current = false;
      
      setNotifications(docs);
    }, (err) => console.error("Error fetching notifications:", err));
    return () => unsubscribe();
  }, [userId]);

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

export default function App() {
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
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const [rotation, setRotation] = useState<OnCallRotation | null>(null);
  
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
  const [supportMessages, setSupportMessages] = useState<any[]>([]);
  const [newSupportMessage, setNewSupportMessage] = useState('');
  const [supportChatMeta, setSupportChatMeta] = useState<any>(null);

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

  const handleDeletePrescription = async (pId: string) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cette ordonnance et ses demandes de devis ?")) return;
    
    try {
      // Find associated orders
      const q = query(collection(db, 'orders'), where('prescriptionId', '==', pId));
      const orderDocs = await getDocs(q);
      
      // Check if any order is paid or beyond awaits
      const hasPaidOrder = orderDocs.docs.some(docSnap => {
        const o = docSnap.data() as Order;
        return ['preparing', 'ready', 'delivering', 'completed'].includes(o.status);
      });

      if (hasPaidOrder) {
        toast.error("Impossible de supprimer une ordonnance dont la commande est déjà en préparation ou payée.");
        return;
      }

      const batch = writeBatch(db);
      
      // 1. Delete associated orders
      orderDocs.docs.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });
      
      // 2. Delete the prescription
      batch.delete(doc(db, 'prescriptions', pId));
      
      await batch.commit();
      toast.success("Ordonnance supprimée avec succès.");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `prescriptions/${pId}`);
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
  const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null);

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
            playNotificationSound();
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
      import('@capacitor/splash-screen').then(({ SplashScreen }) => {
        SplashScreen.hide();
      });
      
      import('@capacitor/status-bar').then(({ StatusBar }) => {
        StatusBar.setBackgroundColor({ color: '#059669' }); // emerald-600
      });
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const docRef = doc(db, 'users', firebaseUser.uid);
        const unsubProfile = onSnapshot(docRef, (docSnap) => {
          console.log("[Auth] Profile snapshot for", firebaseUser.email, ":", docSnap.exists() ? "exists" : "not found");
          try {
            if (docSnap.exists()) {
              const data = docSnap.data() as UserProfile;
              console.log("[Auth] Profile role:", data.role, "status:", data.status);
              
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
            console.log("[Auth] Setting isAuthReady to true");
            setLoading(false);
            setIsAuthReady(true);
          }
        }, (error) => {
          console.error("Error fetching profile:", error);
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
    if (!user) {
      setSettings(null);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      console.log("[Settings] Snapshot received:", docSnap.exists() ? "exists" : "not found");
      if (docSnap.exists()) {
        const data = docSnap.data() as Settings;
        console.log("[Settings] Data loaded:", data.appName || "Ordonnance Direct");
        setSettings(data);
      } else if (isSuperAdminEmail(user.email)) {
        // Initialize default settings if they don't exist (only for admin)
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
        // Set local settings immediately so UI doesn't hang
        setSettings(defaultSettings);
        setDoc(doc(db, 'settings', 'global'), defaultSettings).catch(err => {
          console.error("Error initializing settings:", err);
        });
      }
    }, (err) => {
      console.error("Settings listener error:", err);
      // Fallback for admin if listener fails
      if (isSuperAdminEmail(user.email)) {
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
      }
    });
    return () => unsubscribe();
  }, [isAuthReady, user]);

  useEffect(() => {
    if (!user) return;
    const unsubCities = onSnapshot(collection(db, 'cities'), (snap) => {
      setCities(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as City)));
    });
    const unsubRotation = onSnapshot(doc(db, 'on_call_rotation', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        setRotation({ id: docSnap.id, ...docSnap.data() } as OnCallRotation);
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

  useEffect(() => {
    console.log("[App] State Update:", {
      isAuthReady,
      loading,
      hasUser: !!user,
      hasProfile: !!profile,
      activeRole,
      viewMode,
      hasSettings: !!settings
    });
  }, [isAuthReady, loading, user, profile, activeRole, viewMode, settings]);

  if (!isAuthReady || (user && loading)) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
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
                "0 0 0 30px rgba(16, 185, 129, 0.03)",
                "0 0 0 0 rgba(16, 185, 129, 0)"
              ]
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="w-28 h-28 bg-emerald-50 rounded-[2.5rem] flex items-center justify-center text-emerald-600 mb-4"
          >
            <LogoIcon size={64} />
          </motion.div>
        </motion.div>
      </div>
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
    return <LoginView onLogin={handleLogin} isLoggingIn={isLoggingIn} />;
  }

  if (settings?.maintenanceMode && profile?.role !== 'admin' && profile?.role !== 'super-admin' && !isSuperAdminEmail(user.email)) {
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
          onClick={handleLogout}
          className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors"
        >
          Se déconnecter
        </button>
      </div>
    );
  }

  if (showLegal) {
    return <Legal onBack={() => setShowLegal(false)} />;
  }

  if (!profile) {
    return <RoleSelectionView onSelect={handleRoleSelection} isAdmin={isSuperAdminEmail(user.email)} />;
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
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-primary/20 selection:text-primary relative overflow-x-hidden">
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

      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-2xl border-b border-slate-100/50" style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}>
        <div className="max-w-7xl mx-auto px-4 h-14 md:h-16 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => { setViewMode(profile?.role || null); setIsMobileMenuOpen(false); }}>
            <motion.div 
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="w-12 h-12 flex items-center justify-center shadow-lg shadow-emerald-500/20 rounded-full"
            >
              <LogoIcon size={36} />
            </motion.div>
            <div className="flex flex-col">
              <span className="text-lg font-black tracking-tighter text-slate-900 leading-none">Ordonnance Direct</span>
              <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-1">Burkina Faso</span>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-6">
            {profile?.role === 'super-admin' && (
              <div className="hidden lg:flex items-center gap-2 bg-slate-900/5 p-1 rounded-2xl border border-slate-900/10">
                {(['super-admin', 'admin', 'patient', 'pharmacist', 'delivery'] as const).map((role) => (
                  <button
                    key={role}
                    onClick={() => {
                      setViewMode(role as UserRole);
                      toast.success(`Mode de vue : ${role.toUpperCase()}`);
                    }}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                      (viewMode === role || (role === 'super-admin' && (viewMode === 'super-admin' || !viewMode)))
                        ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/20 scale-105 z-10'
                        : 'text-slate-500 hover:bg-slate-900/5'
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
            
            <div className="hidden md:flex items-center gap-4">
              {(isSuperAdminEmail(user?.email) || profile?.role === 'super-admin') && (
                <button 
                  onClick={handleSwitchRole}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all border border-slate-200"
                >
                  <SettingsIcon size={14} /> Changer
                </button>
              )}
              <div className="flex flex-col items-end">
                <span className="text-sm font-black text-slate-900 truncate max-w-[120px]">{profile?.name}</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5 whitespace-nowrap">
                  {activeRole === 'patient' ? 'Patient' : 
                   activeRole === 'pharmacist' ? 'Pharmacien' : 
                   activeRole === 'delivery' ? 'Livreur' : 
                   activeRole === 'super-admin' ? 'Super Admin' : 'Admin'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <NotificationBell userId={profile?.uid || ''} />
              
              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden w-10 h-10 bg-slate-50 text-slate-600 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-all border border-slate-200"
              >
                {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>

              <button 
                onClick={handleLogout}
                className="hidden md:flex w-10 h-10 sm:w-11 sm:h-11 bg-white border border-rose-100 text-rose-500 rounded-xl sm:rounded-2xl items-center justify-center hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                title="Déconnexion"
              >
                <LogOut size={18} className="sm:w-5 sm:h-5" />
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
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl">
                  <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center text-white text-lg font-black">
                    {profile?.name?.charAt(0)}
                  </div>
                  <div>
                    <p className="font-black text-slate-900 leading-none">{profile?.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
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
                                ? 'bg-slate-900 text-white border-slate-900 shadow-lg' 
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
                    onClick={() => { setShowLegal(true); setIsMobileMenuOpen(false); }}
                    className="w-full flex items-center gap-3 p-4 bg-slate-50 text-slate-600 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-sm border border-slate-100"
                  >
                    <FileText size={18} /> Mentions Légales
                  </button>

                  {settings?.supportChatEnabled !== false && (
                    <button 
                      onClick={() => { setShowSupportChat(true); setIsMobileMenuOpen(false); }}
                      className="w-full flex items-center gap-3 p-4 bg-secondary/5 text-secondary rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-sm border border-secondary/10"
                    >
                      <MessageSquare size={18} /> Chat de Support
                    </button>
                  )}

                  <button 
                    onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }}
                    className="w-full flex items-center gap-3 p-4 bg-rose-50 text-rose-600 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-sm border border-rose-100"
                  >
                    <LogOut size={18} /> Se déconnecter
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-0 relative z-10">
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
            <AdminDashboard profile={effectiveProfile!} settings={settings} />
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
      </main>

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

      <footer className="max-w-7xl mx-auto px-4 py-8 border-t border-slate-200 mt-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-primary rounded-lg flex items-center justify-center text-white">
                <LogoIcon size={14} />
              </div>
              <span className="font-bold">Ordonnance Direct</span>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed">
              La première plateforme de télé-exécution d'ordonnances au Burkina Faso. 
              Qualité, rapidité et sécurité pour votre santé.
            </p>
          </div>
          <div>
            <h5 className="font-bold mb-4">Support & Aide</h5>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><button onClick={() => setInfoPage('how_it_works')} className="hover:text-primary transition-colors text-left">Comment ça marche ?</button></li>
              <li><button onClick={() => setInfoPage('pharmacies')} className="hover:text-primary transition-colors text-left">Pharmacies partenaires</button></li>
              <li><button onClick={() => setInfoPage('delivery')} className="hover:text-primary transition-colors text-left">Devenir livreur</button></li>
              <li><button onClick={() => setInfoPage('contact')} className="hover:text-primary transition-colors text-left">Contactez-nous</button></li>
            </ul>
          </div>
          <div>
            <h5 className="font-bold mb-4">Urgence</h5>
            <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100">
              <p className="text-xs text-rose-600 font-bold uppercase mb-2">SOS Santé Burkina</p>
              <a href="tel:112" className="text-2xl font-bold text-rose-700">112 / 17 / 18</a>
            </div>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-slate-400">© 2026 Ordonnance Direct. Tous droits réservés.</p>
          <div className="flex gap-6 text-xs text-slate-400">
            {(isSuperAdminEmail(user?.email) || profile?.role === 'admin') && (
              <button onClick={() => setShowResetConfirm(true)} className="text-rose-400 hover:text-rose-600 font-bold">Réinitialiser les données (Test)</button>
            )}
            <button onClick={() => setInfoPage('legal')} className="hover:text-slate-600">Mentions légales</button>
            <button onClick={() => setInfoPage('privacy')} className="hover:text-slate-600">Confidentialité</button>
          </div>
        </div>
      </footer>

      {/* Info Pages Modal */}
      <AnimatePresence>
        {infoPage && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
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
                      <p className="text-slate-600"><strong className="text-slate-900">Payez en ligne.</strong> Optez pour le devis de votre choix et payez avec Orange Money, Moov, Sank Money ou Carte bancaire.</p>
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
                     <p className="flex items-center gap-4 text-slate-600"><span className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><Phone size={16}/></span> <strong>+226 00 00 00 00</strong></p>
                     <p className="flex items-center gap-4 text-slate-600"><span className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><Mail size={16}/></span> <strong>contact@ordonnancedirect.bf</strong></p>
                     <p className="flex items-center gap-4 text-slate-600"><span className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><MapPin size={16}/></span> <strong>Ouagadougou, Burkina Faso</strong></p>
                  </div>
                </div>
              )}
              
              {infoPage === 'legal' && (
                <div>
                  <h3 className="text-xl font-black text-slate-900 mb-4">Mentions Légales</h3>
                  <div className="text-sm text-slate-500 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    <p><strong>Éditeur du site :</strong> Ordonnance Direct BF</p>
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
          </div>
        )}
      </AnimatePresence>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
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
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LoginView({ onLogin, isLoggingIn }: { onLogin: () => void, isLoggingIn: boolean }) {
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
    <div className="min-h-screen flex items-center justify-center bg-emerald-950 relative overflow-hidden p-4">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-sky-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(#ffffff05_1px,transparent_1px)] [background-size:32px_32px] pharmacy-pattern opacity-10"></div>
      </div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="bg-white/5 backdrop-blur-2xl p-10 sm:p-16 rounded-[3.5rem] shadow-[0_32px_64px_-15px_rgba(0,0,0,0.5)] max-w-xl w-full text-center relative z-10 border border-white/10"
      >
        <motion.div 
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_30px_rgba(16,185,129,0.3)] bg-white"
        >
          <LogoIcon size={96} />
        </motion.div>
        
        <h1 className="text-4xl font-bold mb-2 text-white tracking-tight">Ordonnance Direct</h1>
        <p className="text-slate-300 mb-8 leading-relaxed text-sm">
          Votre santé, notre priorité au Burkina Faso. 
        </p>

        <form onSubmit={handleEmailAuth} className="space-y-4 mb-8 text-left">
          {isSignup && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nom complet</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded-2xl p-4 text-white focus:ring-2 focus:ring-emerald-500/50 transition-all outline-none"
                placeholder="Jean Dupont"
                required={isSignup}
              />
            </div>
          )}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/10 border border-white/10 rounded-2xl p-4 text-white focus:ring-2 focus:ring-emerald-500/50 transition-all outline-none"
              placeholder="votre@email.com"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Mot de passe</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/10 border border-white/10 rounded-2xl p-4 text-white focus:ring-2 focus:ring-emerald-500/50 transition-all outline-none"
              placeholder="••••••••"
              required
            />
            {!isSignup && (
              <div className="flex items-center justify-between mt-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${rememberMe ? 'bg-emerald-500 border-emerald-500' : 'border-white/20 hover:border-white/40'}`}>
                    <input 
                      type="checkbox" 
                      className="hidden" 
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    {rememberMe && <CheckCircle size={14} className="text-white" />}
                  </div>
                  <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">Se souvenir de moi</span>
                </label>
                <button 
                  type="button" 
                  onClick={handleResetPassword}
                  className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  Mot de passe oublié ?
                </button>
              </div>
            )}
          </div>
          <button 
            type="submit"
            disabled={loading || isLoggingIn}
            className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black text-sm hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/20 disabled:opacity-50"
          >
            {loading ? "Chargement..." : isSignup ? "Créer mon compte" : "Se connecter"}
          </button>
          
          <button 
            type="button"
            onClick={() => setIsSignup(!isSignup)}
            className="w-full text-center text-xs text-slate-400 hover:text-white transition-colors"
          >
            {isSignup ? "Déjà un compte ? Se connecter" : "Pas encore de compte ? S'inscrire"}
          </button>
        </form>
        
        {!Capacitor.isNativePlatform() && (
          <>
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-emerald-950 px-2 text-slate-500 font-bold">Ou continuer avec</span>
              </div>
            </div>

            <div className="space-y-6">
              <button 
                onClick={onLogin}
                disabled={isLoggingIn || loading}
                className="w-full py-4 bg-white text-emerald-950 rounded-2xl font-black text-sm hover:bg-emerald-50 transition-all flex items-center justify-center gap-4 shadow-2xl active:scale-95 disabled:opacity-50 group"
              >
                <div className="bg-white p-1 rounded-lg shadow-sm group-hover:rotate-12 transition-transform">
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                </div>
                {isLoggingIn ? "Connexion..." : "Continuer avec Google"}
              </button>
            </div>
          </>
        )}
        
        <div className="mt-12 pt-8 border-t border-white/5 grid grid-cols-3 gap-4">
          {[
            { icon: Truck, label: 'Livraison', color: 'text-emerald-400' },
            { icon: Package, label: 'Qualité', color: 'text-sky-400' },
            { icon: CheckCircle, label: 'Certifié', color: 'text-amber-400' }
          ].map((item, i) => (
            <div key={item.label} className="flex flex-col items-center gap-2">
              <div className={`w-8 h-8 bg-white/5 rounded-xl flex items-center justify-center ${item.color}`}>
                <item.icon size={16} />
              </div>
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">{item.label}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function RoleSelectionView({ onSelect, isAdmin }: { onSelect: (role: UserRole, extraData: any) => void, isAdmin: boolean }) {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [formData, setFormData] = useState({
    authNumber: '',
    phone: '',
    address: '',
    pharmacyName: ''
  });
  const [deliveryExtra, setDeliveryExtra] = useState({
    idCardFront: '',
    idCardBack: '',
    cguAccepted: false
  });
  const [showCGU, setShowCGU] = useState(false);

  const roles = [
    { role: 'patient' as UserRole, icon: User, label: 'Patient', desc: 'Commander mes médicaments et me faire livrer.', color: 'from-emerald-500 to-teal-600', light: 'bg-emerald-50' },
    { role: 'pharmacist' as UserRole, icon: Package, label: 'Pharmacien', desc: 'Gérer une officine et traiter des ordonnances.', color: 'from-blue-500 to-indigo-600', light: 'bg-blue-50' },
    { role: 'delivery' as UserRole, icon: Truck, label: 'Livreur', desc: 'Effectuer des livraisons et gagner des revenus.', color: 'from-amber-500 to-orange-600', light: 'bg-amber-50' },
  ];

  if (isAdmin) {
    roles.push({ role: 'admin' as UserRole, icon: ShieldCheck, label: 'Admin', desc: 'Gestion de la plateforme et configuration.', color: 'from-slate-700 to-slate-900', light: 'bg-slate-100' });
    roles.push({ role: 'super-admin' as UserRole, icon: ShieldCheck, label: 'Super Admin', desc: 'Accès total à toutes les fonctionnalités.', color: 'from-purple-700 to-purple-900', light: 'bg-purple-100' });
  }

  const handleConfirm = () => {
    // Super Admin bypasses validation
    if (isAdmin) {
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
        ...(selectedRole === 'delivery' && {
          idCardFront: deliveryExtra.idCardFront,
          idCardBack: deliveryExtra.idCardBack,
          cguAccepted: deliveryExtra.cguAccepted,
          cguAcceptedAt: new Date().toISOString()
        })
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background decoration preserved */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-secondary/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl"></div>

      <AnimatePresence>
        {showCGU && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
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
          </div>
        )}
      </AnimatePresence>

      <div className="max-w-6xl w-full relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-emerald-500 mx-auto mb-8 shadow-xl border border-emerald-50">
            <LogoIcon size={96} />
          </div>
          <h2 className="text-5xl font-bold mb-4 text-slate-900 tracking-tight text-center">Bienvenue sur Ordonnance Direct</h2>
          <p className="text-slate-500 max-w-md mx-auto font-medium text-lg text-center">Choisissez votre profil pour continuer votre expérience au Burkina Faso.</p>
        </motion.div>

        {!selectedRole ? (
          <div className={`grid grid-cols-1 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-6`}>
            {roles.map((item, i) => (
              <motion.button
                key={item.role}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => setSelectedRole(item.role)}
                className="group relative bg-white p-6 sm:p-8 rounded-3xl text-left border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center text-white mb-6 shadow-md group-hover:scale-105 transition-transform duration-300`}>
                  <item.icon size={28} />
                </div>
                <h3 className="text-xl font-bold mb-2 text-slate-900">{item.label}</h3>
                <p className="text-slate-500 leading-relaxed mb-6 text-xs">{item.desc}</p>
                
                <div className="flex items-center gap-2 text-primary font-bold text-xs group-hover:gap-3 transition-all">
                  Choisir <ChevronRight size={14} />
                </div>

                {/* Decorative element */}
                <div className={`absolute top-4 right-4 w-10 h-10 rounded-full ${item.light} opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center`}>
                  <ChevronRight size={16} className="text-current" />
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
                  <h4 className="font-bold text-xs text-slate-900">Documents Requis</h4>
                  <span className="text-[9px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full uppercase tracking-widest">Livreur</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">CNI Recto *</label>
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
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">CNI Verso *</label>
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
  return (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-white hover:text-slate-300 bg-slate-800/50 rounded-full p-2">
        <X size={24} />
      </button>
      <img src={imageUrl} alt="Prescription Full" className="max-w-full max-h-[90vh] object-contain rounded-xl" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

const analyzeWithGemini = async (options: { image?: string, text?: string, prompt: string }) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("Clé API Gemini non configurée.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    let response;
    
    // Simple retry logic for 503 errors
    let attempts = 0;
    const maxAttempts = 2;
    
    while (attempts < maxAttempts) {
      try {
        if (options.image) {
          response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
              { inlineData: { mimeType: "image/jpeg", data: options.image } },
              { text: options.prompt }
            ],
            config: { 
              responseMimeType: "application/json"
            }
          });
        } else {
          response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `${options.prompt} : "${options.text}"`,
            config: { 
              responseMimeType: "application/json"
            }
          });
        }
        return { success: true, text: response.text };
      } catch (e: any) {
        attempts++;
        const isUnavailable = e.message?.includes("503") || e.message?.includes("UNAVAILABLE") || e.message?.includes("high demand");
        if (isUnavailable && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
          continue;
        }
        throw e;
      }
    }
    throw new Error("Service temporairement indisponible après plusieurs tentatives.");
  } catch (error: any) {
    console.error("Gemini Error:", error);
    let msg = error.message || String(error);
    const isUnavailable = msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand");
    
    if (isUnavailable) {
      msg = "SERVICE_UNAVAILABLE"; // Special code for professional handling
    } else if (msg.includes("API key not valid") || msg.includes("400")) {
      msg = "Clé API Gemini invalide ou absente. Assurez-vous qu'elle est configurée dans les paramètres de AI Studio.";
    }
    return { success: false, error: msg };
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
  onDelete: (id: string) => void
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const isCompleted = orders.some(o => o.prescriptionId === p.id && o.status === 'completed');
  if (isCompleted) return null;

  const canDelete = !orders.some(o => o.prescriptionId === p.id && ['preparing', 'ready', 'delivering', 'completed'].includes(o.status));

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white p-3 sm:p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-3 group relative"
    >
      {canDelete && (
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-500 flex items-center justify-center transition-all z-10 opacity-0 group-hover:opacity-100"
        >
          <Trash2 size={16} />
        </button>
      )}
      <div className="flex gap-3 sm:gap-4">
        <div 
          className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-slate-50 flex-shrink-0 cursor-pointer group/img"
          onClick={() => onViewImage(p.imageUrl)}
        >
          {p.imageUrl ? (
            <>
              <img src={p.imageUrl} alt="Prescription" className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-500" loading="lazy" />
              <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors flex items-center justify-center">
                <div className="w-8 h-8 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                  <Search className="text-white" size={16} />
                </div>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100/50 text-slate-400">
              <Camera size={24} />
              <span className="text-[10px] font-bold mt-1 uppercase">Saisie</span>
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0 py-0.5 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex justify-between items-start">
              <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg font-black uppercase tracking-tighter">#{p.id.slice(-4).toUpperCase()}</span>
              <span className="text-[9px] text-slate-400 font-bold">{p.createdAt?.toDate ? formatDate(p.createdAt.toDate(), 'short') : 'Récents'}</span>
            </div>
            <h4 className="text-sm font-black text-slate-900 pr-2 mt-1 line-clamp-2 leading-tight h-10">{p.hospitalLocation || "Ordonnance externe"}</h4>
          </div>
          
          <div className="mt-auto">
            {(() => {
              const displayStatus = p.status as string;
              return (
                <span className={`inline-flex items-center text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider ${
                  displayStatus === 'draft' ? 'bg-indigo-50 text-indigo-500' :
                  displayStatus === 'submitted' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                  displayStatus === 'validated' ? 'bg-emerald-50 text-emerald-600' :
                  displayStatus === 'preparing' ? 'bg-indigo-500 text-white shadow-sm shadow-indigo-200' :
                  displayStatus === 'ready' ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-200' :
                  displayStatus === 'delivering' ? 'bg-sky-500 text-white shadow-sm shadow-sky-200' :
                  displayStatus === 'completed' ? 'bg-slate-500 text-white shadow-sm shadow-slate-200' :
                  'bg-rose-50 text-rose-500'
                }`}>
                  {displayStatus === 'draft' ? 'Analyse reçue' :
                   displayStatus === 'submitted' ? 'En recherche' :
                   displayStatus === 'validated' ? 'Prête' :
                   displayStatus === 'preparing' ? 'Préparation' :
                   displayStatus === 'ready' ? 'Prête' :
                   displayStatus === 'delivering' ? 'En livraison' :
                   displayStatus === 'completed' ? 'Livrée' :
                   displayStatus === 'rejected_by_limit' ? 'Rejetée (Limite)' : 'Refusée'}
                </span>
              );
            })()}
          </div>
        </div>
      </div>

      {!p.extractedData && p.status === 'draft' && (
        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-center gap-2">
          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Analyse en cours...</p>
        </div>
      )}

      {p.extractedData && (
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center justify-between">
            Médicaments
            {p.requestType === 'partial' && <span className="text-primary italic flex items-center gap-1"><Plus size={10} /> Partiel</span>}
          </p>
          <div className="space-y-1.5 overflow-hidden">
            {(() => {
              try {
                const jsonStr = p.extractedData?.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0];
                if (!jsonStr) return null;
                const parsed = JSON.parse(jsonStr);
                const meds = Array.isArray(parsed) ? parsed : (parsed.prescriptions || parsed.medications || parsed.medicaments || Object.values(parsed).find(v => Array.isArray(v)) || []);
                const displayMeds = p.requestType === 'partial' && p.selectedMedications ? meds.filter((m: any) => p.selectedMedications?.includes(typeof m === 'string' ? m : (m.nom_article || m.name || m.medicament))) : meds;

                return displayMeds.slice(0, 3).map((m: any, i: number) => {
                  const name = typeof m === 'string' ? m : (m.nom_article || m.name || m.medicament || 'Inconnu');
                  return (
                    <div key={i} className="flex items-center gap-2 text-[10px] sm:text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0"></div>
                      <span className="font-bold text-slate-700 truncate">{name}</span>
                    </div>
                  );
                });
              } catch (e) { return null; }
            })()}
          </div>
        </div>
      )}

      {p.status === 'draft' && p.extractedData && (
        <div className="flex gap-3 mt-1">
          <button 
            onClick={async () => {
              setIsLoading(true);
              try { await onRequestQuote(p, 'all'); } finally { setIsLoading(false); }
            }} 
            disabled={isLoading}
            className="flex-1 bg-primary text-white py-4 rounded-2xl text-[11px] font-black uppercase tracking-tight hover:bg-primary/90 transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : <CheckCircle size={14} />}
            Complet
          </button>
          <button 
            onClick={() => onShowPartialSelect(p)} 
            disabled={isLoading}
            className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl text-[11px] font-black uppercase tracking-tight hover:bg-slate-200 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Plus size={14} />
            Partiel
          </button>
        </div>
      )}
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
  onShowMap 
}: { 
  o: Order, 
  settings: Settings | null, 
  profile: UserProfile, 
  onChat: (id: string) => void, 
  onViewImage: (url: string) => void, 
  onApproveQuote: (o: Order) => void, 
  onSelectDeliveryMethod: (id: string, method: 'pickup' | 'delivery') => void, 
  onShowMap: (o: Order) => void 
}) => {
  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-all duration-300 group"
    >
      <div className="flex flex-col md:flex-row h-full">
        {/* Left Summary Pane */}
        <div className="md:w-56 bg-slate-50/50 p-4 sm:p-5 border-b md:border-b-0 md:border-r border-slate-100 flex flex-col justify-between shrink-0">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100">
                <Package size={18} className="text-primary" />
              </div>
              <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest ${
                o.status === 'ready' || o.status === 'delivering' ? 'bg-emerald-500 text-white shadow-sm' : 
                o.status === 'pending_payment' ? 'bg-rose-500 text-white shadow-sm' : 
                'bg-slate-900 text-white text-center min-w-[60px]'
              }`}>
                {o.status === 'pending_quote' ? 'En attente' : 
                 o.status === 'pending_payment' ? 'A Payer' : 
                 o.status === 'paid' ? 'Payé' :
                 o.status === 'preparing' ? 'Prépa' :
                 o.status === 'ready' ? 'Prêt' :
                 o.status === 'delivering' ? 'En livraison' : o.status}
              </span>
            </div>
            <h4 className="text-base font-black text-slate-900 leading-tight">#{o.id.slice(-6).toUpperCase()}</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Créée le {formatDate(o.createdAt, 'dateTime')}</p>
            
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-600 font-bold">
                <Building2 size={14} className="text-slate-400 shrink-0" />
                <span className="truncate">{o.pharmacyName || 'Pharmacie en attente'}</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Total</span>
                <span className="text-sm font-black text-primary">{(o.totalAmount || 0).toLocaleString()} F</span>
              </div>
            </div>
          </div>

          <div className="mt-4 md:mt-2 flex gap-2">
            <button 
              onClick={() => onChat(o.id)}
              className="relative flex-1 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest"
            >
              <MessageCircle size={14} /> Chat
              {o.unreadCounts?.[profile?.role || 'patient'] > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold flex items-center justify-center rounded-full border-2 border-white shadow-sm">
                  {o.unreadCounts[profile?.role || 'patient']}
                </span>
              )}
            </button>
            {o.prescriptionImageUrl && (
              <button 
                onClick={() => onViewImage(o.prescriptionImageUrl!)}
                className="w-10 h-10 rounded-xl overflow-hidden border border-slate-200 hover:scale-105 transition-transform shrink-0"
              >
                <img src={o.prescriptionImageUrl} className="w-full h-full object-cover" loading="lazy" />
              </button>
            )}
          </div>
        </div>

        {/* Right Tracking Pane */}
        <div className="flex-1 p-4 sm:p-5 flex flex-col justify-center min-w-0">
          {/* Horizontal Minimal Stepper */}
          <div className="relative mb-6 px-1">
            <div className="absolute top-[14px] left-0 w-full h-[2px] bg-slate-100 rounded-full"></div>
            <div 
              className="absolute top-[14px] left-0 h-[2px] bg-primary rounded-full transition-all duration-1000"
              style={{ 
                width: (() => {
                  const stepsArr = ['submitted', 'validated', 'pending_quote', 'pending_payment', 'paid', 'preparing', 'ready', 'delivering', 'completed'];
                  const idx = stepsArr.indexOf(o.status);
                  if (idx < 4) return '0%';
                  if (idx === 4) return '25%';
                  if (idx === 5) return '50%';
                  if (idx === 6) return '75%';
                  return '100%';
                })()
              }}
            ></div>
            <div className="flex justify-between relative z-10 w-full">
              {[
                { label: 'Payé', status: 'paid', icon: CreditCard },
                { label: 'Prépa', status: 'preparing', icon: FlaskConical },
                { label: 'Prêt', status: 'ready', icon: CheckCircle2 },
                { label: 'Livré', status: 'completed', icon: Home },
              ].map((s, idx) => {
                const stepsArr = ['submitted', 'validated', 'pending_quote', 'pending_payment', 'paid', 'preparing', 'ready', 'delivering', 'completed'];
                const currentStepIdx = stepsArr.indexOf(o.status);
                const targetStepIdx = stepsArr.indexOf(s.status);
                const isDone = currentStepIdx >= targetStepIdx && targetStepIdx !== -1;
                const isActive = o.status === s.status;
                
                return (
                  <div key={s.label} className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-500 scale-100 shrink-0 ${
                      isDone ? 'bg-primary text-white shadow-sm' : 'bg-white border text-slate-200'
                    } ${isActive ? 'ring-2 ring-primary/20 scale-110' : ''}`}>
                      <s.icon size={12} />
                    </div>
                    <span className={`text-[8px] sm:text-[9px] font-black uppercase tracking-tight text-center w-full truncate ${isDone ? 'text-slate-900' : 'text-slate-300'}`}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            {o.status === 'completed' && (
              <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-900">Commande terminée</p>
                    <p className="text-xs text-slate-500 font-medium">Votre santé est notre priorité.</p>
                  </div>
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                    <CheckCircle size={20} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => generateInvoice(o, profile)}
                    className="flex-1 bg-slate-900 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                  >
                    <FileText size={14} /> Facture PDF
                  </button>
                  {o.deliveryPhoto && (
                    <button 
                      onClick={() => onViewImage(o.deliveryPhoto!)}
                      className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 hover:scale-105 transition-transform shrink-0"
                    >
                      <img src={o.deliveryPhoto} className="w-full h-full object-cover" loading="lazy" />
                    </button>
                  )}
                  {o.deliverySignature && (
                    <button 
                      onClick={() => onViewImage(o.deliverySignature!)}
                      className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center p-1 hover:scale-105 transition-transform shrink-0"
                    >
                      <img src={o.deliverySignature} className="max-h-full object-contain" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {o.status === 'pending_payment' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-primary/5 border border-primary/10 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4"
              >
                <div className="text-center sm:text-left">
                  <p className="text-sm font-black text-slate-900">Devis disponible !</p>
                  <p className="text-xs text-slate-500">Validez et payez pour lancer la préparation.</p>
                </div>
                <button 
                  onClick={() => onApproveQuote(o)}
                  className="w-full sm:w-auto px-6 py-2.5 bg-primary text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-sm hover:scale-105 transition-all"
                >
                  Payer {(o.totalAmount || 0).toLocaleString()} F
                </button>
              </motion.div>
            )}

            {o.status === 'pending_quote' && !o.deliveryMethod && (
              <div className="bg-amber-50/50 border border-amber-100 p-5 rounded-2xl space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-amber-600 shadow-sm shrink-0 border border-amber-100/50">
                    <Package size={24} />
                  </div>
                  <div>
                    <h5 className="text-sm font-black text-slate-900 tracking-tight">Comment recevoir ?</h5>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">Choisissez pour passer au paiement.</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button 
                    onClick={() => onSelectDeliveryMethod(o.id, 'pickup')}
                    className="group bg-white p-4 rounded-xl border border-slate-100 hover:border-primary hover:bg-primary/[0.02] transition-all text-left flex items-start gap-3 shadow-sm hover:shadow-md"
                  >
                    <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-all">
                      <Store size={16} />
                    </div>
                    <div>
                      <p className="font-black text-xs text-slate-900 group-hover:text-primary transition-colors">Sur place</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Gratuit</p>
                    </div>
                  </button>

                  <button 
                    onClick={() => onSelectDeliveryMethod(o.id, 'delivery')}
                    className="group bg-white p-4 rounded-xl border border-slate-100 hover:border-orange-500 hover:bg-orange-500/[0.02] transition-all text-left flex items-start gap-3 shadow-sm hover:shadow-md"
                  >
                    <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 group-hover:bg-orange-500/10 group-hover:text-orange-500 transition-all">
                      <Truck size={16} />
                    </div>
                    <div>
                      <p className="font-black text-xs text-slate-900 group-hover:text-orange-500 transition-colors">Livraison</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{calculateDeliveryFee(settings)} F</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {o.deliveryCode && (o.status === 'ready' || o.status === 'delivering') && (
              <div className="bg-slate-900 rounded-2xl p-4 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center border border-white/10 backdrop-blur-md">
                    <QrCode size={24} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-0.5">Code de securité</p>
                    <p className="text-2xl font-black tracking-widest">#{o.deliveryCode}</p>
                  </div>
                </div>
                {o.status === 'delivering' && o.deliveryId && (
                  <div className="flex items-center gap-3 bg-white/5 p-2 pr-3 rounded-xl border border-white/10">
                    <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/20 shrink-0 bg-white/10 flex items-center justify-center">
                      {o.deliveryPersonPhoto ? <img src={o.deliveryPersonPhoto} className="w-full h-full object-cover" /> : <User size={16} />}
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-[8px] font-black text-white/40 uppercase tracking-widest leading-none mb-0.5">Coursier</p>
                      <p className="text-[10px] font-black truncate max-w-[80px]">{o.deliveryPersonName}</p>
                    </div>
                    <button onClick={() => onShowMap(o)} className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white hover:bg-primary/80 transition-all shrink-0">
                      <MapPin size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-50">
            <details className="group">
              <summary className="list-none flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Historique du statut</span>
                  <div className="h-[1px] w-8 bg-slate-100"></div>
                </div>
                <ChevronDown size={14} className="text-slate-400 group-open:rotate-180 transition-transform" />
              </summary>
              <div className="mt-4">
                <StatusTrace history={o.history} />
              </div>
            </details>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

// --- Patient Dashboard ---

const PatientDashboard = React.memo(({ profile, settings, location, cities, rotation, onDeletePrescription }: { profile: UserProfile, settings: Settings | null, location: { lat: number, lng: number } | null, cities: City[], rotation: OnCallRotation | null, onDeletePrescription: (id: string) => Promise<void> }) => {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'prescriptions' | 'orders' | 'pharmacies' | 'history'>('prescriptions');
  const [hospitalLocation, setHospitalLocation] = useState('');
  const [hospitalSuggestions, setHospitalSuggestions] = useState<string[]>([]);
  const [showHospitalSuggestions, setShowHospitalSuggestions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPartialSelect, setShowPartialSelect] = useState<Prescription | null>(null);
  const [selectedMeds, setSelectedMeds] = useState<string[]>([]);
  const [showDeliveryConfirm, setShowDeliveryConfirm] = useState<{ orderId: string, fee: number } | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState<Order | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'orange' | 'moov' | 'telecel' | 'card' | 'bank' | 'sank' | 'coris' | null>(null);
  const [paymentPhone, setPaymentPhone] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'method' | 'phone' | 'otp' | 'processing' | 'success'>('method');
  const [mmMode, setMmMode] = useState<'ussd' | 'otp' | null>(null);
  const [paymentOtp, setPaymentOtp] = useState('');
  const [paymentInvoiceId, setPaymentInvoiceId] = useState('');
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
      isFirstRunPatientPrescriptions.current = false;
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Prescription));
      // Client-side sort as fallback if order is weird, but query should handle it
      setPrescriptions(docs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'prescriptions'));
    return () => unsubscribe();
  }, [profile.uid]);

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
        if (change.type === 'modified') {
          const oldData = change.doc.data();
          const newData = change.doc.data(); // This is the same in snapshot.docChanges()
          // In practice, we'd need to compare if we had the previous state
          // For now, let's play sound on any modification if not local
          return true;
        }
        return false;
      });

      if (!isFirstRunPatientOrders.current && hasSignficantChange && !snapshot.metadata.hasPendingWrites) {
        playNotificationSound();
      }
      isFirstRunPatientOrders.current = false;
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      setOrders(docs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'orders'));
    return () => unsubscribe();
  }, [profile.uid]);

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
        extractedData: "",
        status: 'draft',
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

          if (!data.success) throw new Error(data.error);

          let parsed;
          try {
            parsed = JSON.parse(data.text || '{}');
          } catch(e) {
            parsed = { articles: [], etablissement: "" };
          }

          if (parsed.etablissement && !hospitalLocation) {
            setHospitalLocation(parsed.etablissement);
          }

          await updateDoc(docRef, {
            extractedData: JSON.stringify(parsed.articles || []),
            hospitalLocation: parsed.etablissement || hospitalLocation || "Non spécifié"
          });
          toast.success("Analyse terminée ! Choisissez votre type de devis.");
        } catch (error: any) {
          console.error("Gemini Parsing Error:", error);
          const isUnavailable = error.message === 'SERVICE_UNAVAILABLE';
          const errorMessage = isUnavailable 
            ? "L'analyse automatique est temporairement indisponible."
            : `L'analyse automatique a rencontré un problème (${error.message || "Erreur AI"}).`;

          await updateDoc(docRef, {
            extractedData: JSON.stringify([{ nom_article: "Analyse en attente", dosage: "", posologie: "Traitement manuel par un pharmacien" }]),
            status: 'submitted'
          });
          toast.info(`${errorMessage} Votre ordonnance sera traitée manuellement par un pharmacien.`);
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
            prompt: "Tu es un assistant pharmacien au Burkina Faso. Extrait les noms des médicaments, les dosages et les posologies de cette ordonnance. Identifie également l'établissement de santé ou le médecin figurant sur l'en-tête. Réponds en français au format JSON structuré : { \"articles\": [ { \"nom_article\": \"...\", \"dosage\": \"...\", \"posologie\": \"...\" } ], \"etablissement\": \"nom de l'hôpital ou du médecin si trouvé, sinon vide\" }. Sois très rapide et précis."
          });

          if (!data.success) throw new Error(data.error);
          
          if (data.text) {
            let parsed;
            try {
              parsed = JSON.parse(data.text || '{}');
            } catch(e) {
              parsed = { articles: [], etablissement: "" };
            }

            if (parsed.etablissement && !hospitalLocation) {
              setHospitalLocation(parsed.etablissement);
            }

            await updateDoc(doc(db, 'prescriptions', docRef.id), {
              extractedData: JSON.stringify(parsed.articles || []),
              hospitalLocation: parsed.etablissement || hospitalLocation || "Non spécifié"
            });
            toast.success("Analyse de l'ordonnance terminée ! Choisissez votre type de devis.");
          } else {
            throw new Error("Aucun texte extrait de l'ordonnance.");
          }
        } catch (err: any) {
          console.error("Gemini OCR failed:", err);
          const isUnavailable = err.message === 'SERVICE_UNAVAILABLE';
          const errorMessage = isUnavailable 
            ? "L'analyse automatique est temporairement indisponible."
            : `L'analyse automatique a rencontré un problème (${err.message || "Erreur AI"}).`;

          toast.info(`${errorMessage} Un pharmacien traitera votre ordonnance manuellement.`);
          await updateDoc(doc(db, 'prescriptions', docRef.id), {
            extractedData: "En attente d'analyse manuelle par un pharmacien.",
            status: 'submitted'
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

  const initPayment = async (method: 'orange' | 'moov' | 'telecel' | 'coris' | 'sank') => {
    if (!showPaymentModal) return;
    if (!paymentPhone) {
      toast.error("Veuillez entrer votre numéro de téléphone.");
      return;
    }
    setIsProcessingPayment(true);
    setPaymentStep('processing');
    
    try {
      const response = await fetch(getApiUrl('/api/payment/init'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: showPaymentModal.totalAmount,
          phone: paymentPhone,
          email: profile.email,
          method: method
        })
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      setPaymentInvoiceId(data.invoiceId);
      setPaymentStep('otp');
    } catch (error) {
      // Create a mock invoice for manual validation when in local environment without real backend
      setPaymentInvoiceId('MOCK_' + Math.random().toString(36).substring(7));
      setPaymentStep('otp');
      toast.info("Validation manuelle (Sandbox / API Indisponible).");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const performPayment = async (method: 'orange' | 'moov' | 'telecel' | 'coris' | 'sank') => {
    if (!showPaymentModal || !paymentInvoiceId || !paymentOtp) return;
    setIsProcessingPayment(true);
    setPaymentStep('processing');
    
    try {
      const response = await fetch(getApiUrl('/api/payment/perform'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: paymentInvoiceId,
          phone: paymentPhone,
          otp: paymentOtp,
          method: method
        })
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);
    } catch (e) {
      console.log("Mock / Manual payment recorded.");
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

      await updateDoc(doc(db, 'orders', order.id), {
        status: 'paid',
        paymentMethod: method,
        paymentPhone: paymentPhone,
        paymentStatus: 'completed',
        sappayInvoiceId: paymentInvoiceId,
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
          label: `Paiement effectué via ${method.toUpperCase()}`
        })
      });

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

      setPaymentStep('success');
      toast.success("Paiement effectué avec succès !");
      
      setTimeout(() => {
        setShowPaymentModal(null);
        setSelectedPaymentMethod(null);
        setPaymentStep('method');
        setPaymentPhone('');
        setPaymentOtp('');
        setPaymentInvoiceId('');
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
    <PullToRefresh onRefresh={async () => {
      // Refreshing logic - most data is real-time via onSnapshot, 
      // but we can force a small delay or re-fetch static settings if needed
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success("Données actualisées");
    }}>
      <div className="relative space-y-4 pb-8 pt-1 transition-all">
        {viewImage && <ImageViewerModal imageUrl={viewImage} onClose={() => setViewImage(null)} />}
        {/* Background Decorative Element */}
        <div className="fixed inset-0 pharmacy-pattern pointer-events-none -z-10"></div>
        
        {/* Pharmacy Header (Android style) */}
        <div className="bg-emerald-600 rounded-[2rem] p-4 relative overflow-hidden shadow-xl shadow-emerald-600/10">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
        <div className="relative flex items-center gap-4 text-white">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
            <Plus size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight uppercase leading-none">Portail Patient</h1>
            <p className="text-emerald-100 text-[9px] font-bold uppercase tracking-widest mt-1 opacity-80 underline underline-offset-2">Santé & Pharmacie Online</p>
          </div>
        </div>
      </div>

      {/* Welcome & Stats */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">Salut, {profile.name} 👋</h2>
            <p className="text-slate-500 mt-1 text-base sm:text-lg">Gérez vos ordonnances simplement.</p>
          </motion.div>
          
          <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
            <div className="medical-card p-4 sm:p-6 flex items-center gap-3 sm:gap-4 min-w-[140px] sm:min-w-[180px]">
              <div className="w-10 h-10 sm:w-14 sm:h-14 bg-emerald-100 rounded-xl sm:rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm">
                <FileText size={20} className="sm:hidden" />
                <FileText size={28} className="hidden sm:block" />
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ordos</p>
                <p className="text-xl sm:text-3xl font-black text-slate-900">{prescriptions.length}</p>
              </div>
            </div>
            <div className="medical-card p-4 sm:p-6 flex items-center gap-3 sm:gap-4 min-w-[140px] sm:min-w-[180px]">
              <div className="w-10 h-10 sm:w-14 sm:h-14 bg-sky-100 rounded-xl sm:rounded-2xl flex items-center justify-center text-sky-600 shadow-sm">
                <Package size={20} className="sm:hidden" />
                <Package size={28} className="hidden sm:block" />
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Suivi</p>
                <p className="text-xl sm:text-3xl font-black text-slate-900">{orders.filter(o => o.status !== 'completed').length}</p>
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
              { id: 'prescriptions', label: 'Ordonnances', icon: FileText, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { id: 'orders', label: 'Commandes', icon: Package, color: 'text-sky-600', bg: 'bg-sky-50' },
              { id: 'history', label: 'Historique', icon: Clock, color: 'text-indigo-600', bg: 'bg-indigo-50' },
              { id: 'pharmacies', label: 'Pharmacies', icon: MapPin, color: 'text-amber-600', bg: 'bg-amber-50' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => React.startTransition(() => setActiveTab(tab.id as any))}
                className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl font-bold transition-all duration-300 ${
                  activeTab === tab.id 
                    ? `${tab.bg} ${tab.color} shadow-sm` 
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                <tab.icon size={20} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Bottom Navigation (Android Native Feel) */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-[200] px-4 pt-2 bg-white/80 backdrop-blur-xl border-t border-slate-100 shadow-[0_-8px_30px_rgb(0,0,0,0.04)]" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)' }}>
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
                className="flex flex-col items-center gap-1 min-w-[64px] relative py-2"
              >
                <div className={`p-2 rounded-xl transition-all duration-300 ${
                  activeTab === tab.id 
                    ? `${tab.activeColor} text-white shadow-lg` 
                    : `text-slate-400`
                }`}>
                  <tab.icon size={22} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
                </div>
                <span className={`text-[10px] font-bold ${activeTab === tab.id ? 'text-slate-900' : 'text-slate-400'}`}>
                  {tab.label}
                </span>
                {activeTab === tab.id && (
                  <motion.div 
                    layoutId="activeTabUnderline"
                    className={`absolute -top-2 w-1 h-1 rounded-full ${tab.iconColor.replace('text-', 'bg-')}`} 
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-0 pb-32 md:pb-0">
          <div key={activeTab} className="space-y-6">
              {activeTab === 'prescriptions' && (
                <>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Mes Ordonnances</h3>
                <p className="text-slate-500 text-sm">Envoyez vos ordonnances pour recevoir des devis.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
                <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-2xl border border-slate-100 shadow-sm focus-within:border-primary transition-colors min-w-[200px] relative">
                  <MapPin size={20} className="text-primary shrink-0" />
                  <select
                    value={patientCityId}
                    onChange={(e) => setPatientCityId(e.target.value)}
                    className="bg-transparent outline-none text-sm w-full font-bold text-slate-700 cursor-pointer appearance-none pr-10"
                  >
                    <option value="">📍 Choisissez votre ville...</option>
                    {cities.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button 
                    onClick={autoDetectCity}
                    disabled={isLocating}
                    title="Détecter ma position"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-primary/5 text-primary rounded-xl hover:bg-primary/20 transition-all disabled:opacity-50"
                  >
                    {isLocating ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div> : <Navigation size={16} />}
                  </button>
                </div>
                <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-2xl border border-slate-100 shadow-sm focus-within:border-primary transition-all relative">
                  <Hospital size={20} className="text-primary shrink-0" />
                  <input 
                    type="text" 
                    placeholder="Établissement ou Médecin (Optionnel)" 
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
                    className="bg-transparent outline-none text-sm w-full sm:w-64 font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-normal"
                  />
                  
                  {showHospitalSuggestions && (
                    <div className="absolute top-full left-0 w-full bg-white mt-2 rounded-2xl shadow-xl border border-slate-100 z-[100] max-h-48 overflow-y-auto overflow-x-hidden py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                      {hospitalSuggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          className="w-full text-left px-4 py-2 hover:bg-primary/5 text-sm font-bold text-slate-700 transition-colors"
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

                {/* Proposition 1: Landmarks & Facade Photo */}
                <div className="flex flex-col sm:flex-row gap-4 w-full">
                  <div className="flex-1 flex items-center gap-3 bg-white px-6 py-3 rounded-2xl border border-slate-100 shadow-sm focus-within:border-primary transition-all">
                    <MapPin size={20} className="text-primary shrink-0" />
                    <input 
                      type="text" 
                      placeholder="Quartier / Repère / Instructions (ex: appeler à l'arrivée) *" 
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                      className="bg-transparent outline-none text-sm w-full font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-normal"
                    />
                  </div>
                  <div className="flex items-center gap-2">
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
                             toast.success("Photo de façade enregistrée !");
                          }
                        };
                        input.click();
                      }}
                      className={`h-12 px-4 rounded-2xl flex items-center gap-2 font-bold text-sm transition-all ${facadePhoto ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-100 border'}`}
                    >
                      <Camera size={18} />
                      {facadePhoto ? "Photo Façade OK" : "Photo Façade (Optionnel)"}
                    </button>
                    {facadePhoto && (
                      <button onClick={() => setFacadePhoto(null)} className="w-8 h-8 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="btn-primary flex items-center justify-center gap-3 px-6"
                  >
                    {uploading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <Camera size={20} />}
                    Scanner
                  </button>
                  <button 
                    onClick={() => setShowManualEntryModal(true)}
                    disabled={uploading}
                    className="bg-white border-2 border-primary text-primary hover:bg-primary/5 font-bold rounded-2xl flex items-center justify-center gap-3 px-6 py-4 transition-all"
                  >
                    <PenTool size={20} />
                    Saisie Manuelle / Vocale
                  </button>
                </div>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" capture="environment" className="hidden" />
            </div>

            {showManualEntryModal && (
              <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
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
              </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                {prescriptions.filter(p => !orders.find(o => o.prescriptionId === p.id && o.status === 'completed')).map(p => (
                  <PatientPrescriptionCard 
                    key={p.id} 
                    p={p} 
                    orders={orders} 
                    onViewImage={setViewImage} 
                    onRequestQuote={handleRequestQuote} 
                    onShowPartialSelect={(p) => { setShowPartialSelect(p); setSelectedMeds(p.selectedMedications || []); }} 
                    onDelete={onDeletePrescription}
                  />
                ))}
              </div>
            )}
                </>
              )}

              {activeTab === 'orders' && (
                <div className="max-w-4xl mx-auto space-y-8">
                  <div className="flex flex-col gap-2">
                    <h3 className="text-3xl font-black text-slate-900 tracking-tight">Mes Commandes</h3>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-12 bg-primary rounded-full"></div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        {orders.filter(o => o.status !== 'completed' && o.status !== 'quote_rejected').length} commandes actives
                      </p>
                    </div>
                  </div>

                  {orders.filter(o => o.status !== 'completed' && o.status !== 'quote_rejected').length === 0 ? (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white p-10 rounded-[3rem] border border-slate-100 text-center shadow-xl shadow-slate-200/50"
                    >
                      <div className="w-24 h-24 bg-blue-50 rounded-[2.5rem] flex items-center justify-center text-blue-500 mx-auto mb-8 rotate-3 hover:rotate-0 transition-transform duration-500">
                        <Package size={48} strokeWidth={1.5} />
                      </div>
                      <h4 className="text-slate-900 font-black text-2xl mb-3">Aucune commande en cours</h4>
                      <p className="text-slate-500 text-sm max-w-xs mx-auto leading-relaxed">
                        Vos commandes actives et leur suivi en temps réel apparaîtront ici dès que vous aurez soumis une ordonnance.
                      </p>
                    </motion.div>
                  ) : (
                    <div className="grid grid-cols-1 gap-6">
                      {orders.filter(o => o.status !== 'completed' && o.status !== 'quote_rejected').map(o => (
                         <PatientOrderCard 
                            key={o.id} 
                            o={o} 
                            settings={settings} 
                            profile={profile} 
                            onChat={setActiveChatOrderId} 
                            onViewImage={setViewImage} 
                            onApproveQuote={handleApproveQuote} 
                            onSelectDeliveryMethod={handleSelectDeliveryMethod} 
                            onShowMap={setShowMapForOrder} 
                         />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'history' && (
                <>
                  <h3 className="text-xl font-bold">Historique de Santé</h3>
                  {orders.filter(o => o.status === 'completed' || o.status === 'quote_rejected').length === 0 ? (
                    <div className="bg-white p-10 rounded-[3.5rem] border-2 border-dashed border-slate-100 text-center relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                      <div className="w-24 h-24 bg-indigo-500/10 rounded-full flex items-center justify-center text-indigo-500 mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                        <Clock size={48} strokeWidth={1.5} />
                      </div>
                      <p className="text-slate-900 font-black text-2xl mb-2">Historique vide</p>
                      <p className="text-slate-500 text-sm max-w-xs mx-auto">Vos commandes terminées ou annulées apparaîtront ici.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {orders.filter(o => o.status === 'completed' || o.status === 'quote_rejected').map(o => (
                         <PatientOrderCard 
                            key={o.id} 
                            o={o} 
                            settings={settings} 
                            profile={profile} 
                            onChat={setActiveChatOrderId} 
                            onViewImage={setViewImage} 
                            onApproveQuote={handleApproveQuote} 
                            onSelectDeliveryMethod={handleSelectDeliveryMethod} 
                            onShowMap={setShowMapForOrder} 
                         />
                      ))}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'pharmacies' && (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold">Pharmacies à proximité</h3>
                    <div className="flex items-center gap-2 text-sm text-slate-500 bg-white px-4 py-2 rounded-xl border border-slate-100">
                <Search size={16} />
                <input 
                  type="text" 
                  placeholder="Rechercher une pharmacie ou un quartier..." 
                  className="bg-transparent outline-none"
                  value={pharmacySearch}
                  onChange={(e) => setPharmacySearch(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pharmacies
                .filter(ph => {
                  const matchesSearch = ph.name.toLowerCase().includes(pharmacySearch.toLowerCase()) || 
                                        ph.address.toLowerCase().includes(pharmacySearch.toLowerCase()) ||
                                        (ph as any).locality?.toLowerCase().includes(pharmacySearch.toLowerCase());
                  
                  const city = cities.find(c => c.id === ph.cityId);
                  const isOnCallNow = city ? isCityOnCallNow(city.onCallStartTime, city.onCallEndTime) : false;
                  const currentGroup = rotation ? getCurrentOnCallGroup(rotation) : 1;
                  const isMyGroupOnCall = ph.groupId === currentGroup.toString();

                  if (isOnCallNow) {
                    // La nuit : uniquement celles de garde
                    return matchesSearch && isMyGroupOnCall;
                  } else {
                    // Le jour : toutes les pharmacies (standard et de garde ce soir)
                    return matchesSearch;
                  }
                })
                .sort((a, b) => {
                  if (!location) return 0;
                  const distA = a.location ? calculateDistance(location.lat, location.lng, a.location.lat, a.location.lng) : Infinity;
                  const distB = b.location ? calculateDistance(location.lat, location.lng, b.location.lat, b.location.lng) : Infinity;
                  return distA - distB;
                })
                .slice(0, 20)
                .map((ph) => {
                  const distance = location && ph.location ? calculateDistance(location.lat, location.lng, ph.location.lat, ph.location.lng) : null;
                  
                  const city = cities.find(c => c.id === ph.cityId);
                  const isOnCallNow = city ? isCityOnCallNow(city.onCallStartTime, city.onCallEndTime) : false;
                  const currentGroup = rotation ? getCurrentOnCallGroup(rotation) : 1;
                  const isMyGroupOnCall = ph.groupId === currentGroup.toString();

                  const statusLabel = isOnCallNow ? (isMyGroupOnCall ? 'De Garde' : 'Ouvert') : (isMyGroupOnCall ? 'De Garde Ce Soir' : 'Standard');
                  const statusClasses = isMyGroupOnCall 
                    ? 'bg-amber-100 text-amber-700' 
                    : 'bg-emerald-100 text-emerald-700';

                  return (
                  <div key={ph.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:border-primary/30 transition-all">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                        <Plus size={24} />
                      </div>
                      <div className="flex items-center gap-2">
                        {distance !== null && (
                          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                            {distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}
                          </span>
                        )}
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${statusClasses}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                    <h4 className="font-bold text-lg mb-1">{ph.name}</h4>
                    <p className="text-slate-500 text-sm flex items-center gap-1 mb-4">
                      <MapPin size={14} /> {ph.address}
                    </p>
                    <div className="flex gap-2">
                      {ph.phone && (
                        <a href={`tel:${ph.phone}`} className="flex-1 py-2.5 bg-slate-50 text-slate-700 rounded-xl text-center text-sm font-bold hover:bg-slate-100 transition-all flex items-center justify-center gap-2">
                          <Phone size={14} /> Appeler
                        </a>
                      )}
                      <button 
                        onClick={() => {
                          if (ph.location?.lat && ph.location?.lng) {
                            window.open(`https://www.google.com/maps/dir/?api=1&destination=${ph.location.lat},${ph.location.lng}`, '_blank');
                          } else {
                            window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ph.name + ' ' + (cities.find(c => c.id === ph.cityId)?.name || ''))}`, '_blank');
                          }
                        }}
                        className="flex-1 py-2.5 bg-primary/10 text-primary rounded-xl text-sm font-bold hover:bg-primary/20 transition-all flex items-center justify-center gap-2"
                      >
                        <MapPin size={14} /> Itinéraire
                      </button>
                    </div>
                  </div>
                );
              })}
              {pharmacies.filter(ph => {
                  const city = cities.find(c => c.id === ph.cityId);
                  const isOnCallNow = city ? isCityOnCallNow(city.onCallStartTime, city.onCallEndTime) : false;
                  const currentGroup = rotation ? getCurrentOnCallGroup(rotation) : 1;
                  const isMyGroupOnCall = ph.groupId === currentGroup.toString();
                  return isOnCallNow ? isMyGroupOnCall : true;
                }).length === 0 && (
                <div className="col-span-full bg-white p-10 rounded-[3.5rem] border-2 border-dashed border-slate-100 text-center relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500 mx-auto mb-4 group-hover:scale-110 transition-transform duration-500">
                    <LogoIcon size={36} />
                  </div>
                  <p className="text-slate-900 font-black text-2xl mb-2">Aucune pharmacie</p>
                  <p className="text-slate-500 text-sm max-w-xs mx-auto">Il n'y a actuellement aucune pharmacie correspondante à votre recherche ou ouverte dans votre zone.</p>
                </div>
              )}
            </div>
                </>
              )}
            </div>
        </div>
      </div>

      {/* Payment Modal */}
      <AnimatePresence>
        {showPaymentModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
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
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
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
              
              {/* SANDBOX MODE BANNER */}
              {(!settings?.paymentConfig || settings.paymentConfig.testMode !== false) && (
                <div className="mb-4 bg-amber-50 border border-amber-200 flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg w-fit mx-auto shadow-sm">
                  <AlertCircle size={14} className="text-amber-500 shrink-0" />
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-tighter">Mode Sandbox Actif</span>
                </div>
              )}

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
                    <p className="text-left text-sm font-bold text-slate-700 mb-2">Mobile Money</p>
                    <div className="grid grid-cols-3 gap-3">
                      <button 
                        onClick={() => setSelectedPaymentMethod('orange')}
                        className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-slate-100 hover:border-orange-500 hover:bg-orange-50 transition-all gap-2"
                      >
                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm overflow-hidden p-1 border border-slate-100">
                           <img src="https://upload.wikimedia.org/wikipedia/commons/c/c8/Orange_logo.svg" alt="Orange" referrerPolicy="no-referrer" className="w-full h-full object-contain" />
                        </div>
                        <span className="text-xs font-bold text-slate-700">Orange Money</span>
                      </button>
                      <button 
                        onClick={() => setSelectedPaymentMethod('moov')}
                        className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-slate-100 hover:border-blue-600 hover:bg-blue-50 transition-all gap-2"
                      >
                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm overflow-hidden p-2 border border-slate-100">
                           <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Moov_Africa_Logo.png/640px-Moov_Africa_Logo.png" alt="Moov" referrerPolicy="no-referrer" className="w-full h-full object-contain" />
                        </div>
                        <span className="text-xs font-bold text-slate-700">Moov Money</span>
                      </button>
                      <button 
                        onClick={() => setSelectedPaymentMethod('sank')}
                        className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-slate-100 hover:border-red-600 hover:bg-red-50 transition-all gap-2"
                      >
                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm overflow-hidden p-1 border border-slate-100">
                           <img src="https://sankmoney.com/wp-content/uploads/2022/10/Logo-Sank-Money-1.png" alt="Sank" referrerPolicy="no-referrer" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = '<span class="text-red-600 font-black text-[10px]">SANK</span>'; }} />
                        </div>
                        <span className="text-xs font-bold text-slate-700">Sank Money</span>
                      </button>
                    </div>
                  </>
                )}

                {selectedPaymentMethod && selectedPaymentMethod !== 'bank' && selectedPaymentMethod !== 'card' && (
                  <div className="space-y-4 text-left animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between mb-4">
                      <p className="font-bold text-slate-900 flex items-center gap-2">
                        <button onClick={() => {
                          setSelectedPaymentMethod(null);
                          setPaymentStep('method');
                          setMmMode(null);
                        }} className="p-1 hover:bg-slate-100 rounded-lg"><ChevronRight className="rotate-180" size={16}/></button>
                        Paiement {selectedPaymentMethod.toUpperCase()}
                      </p>
                    </div>
                    
                    {paymentStep === 'method' && !mmMode && (
                      <div className="space-y-3">
                        <p className="text-sm text-slate-600 font-medium">Comment souhaitez-vous payer ?</p>
                        <div className="grid grid-cols-2 gap-3">
                          <button onClick={() => setMmMode('ussd')} className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-slate-100 hover:border-primary hover:bg-emerald-50 transition-all gap-2 text-center text-slate-700">
                            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                              <PhoneCall size={20} />
                            </div>
                            <span className="text-xs font-bold leading-tight mt-1">Code USSD<br/><span className="text-[10px] font-normal text-slate-500">Appel direct</span></span>
                          </button>
                          <button onClick={() => setMmMode('otp')} className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-slate-100 hover:border-primary hover:bg-emerald-50 transition-all gap-2 text-center text-slate-700">
                            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                              <Smartphone size={20} />
                            </div>
                            <span className="text-xs font-bold leading-tight mt-1">Direct / OTP<br/><span className="text-[10px] font-normal text-slate-500">Code SMS</span></span>
                          </button>
                        </div>
                      </div>
                    )}

                    {paymentStep === 'method' && mmMode === 'otp' && (
                      <div className="space-y-4 animate-in fade-in">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Numéro de téléphone</label>
                          <input 
                            type="tel" 
                            placeholder="Ex: 0102030405"
                            value={paymentPhone}
                            onChange={(e) => setPaymentPhone(e.target.value)}
                            onFocus={(e) => {
                              setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
                            }}
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold focus:border-primary outline-none transition-all"
                          />
                        </div>
                        <button 
                          onClick={() => initPayment(selectedPaymentMethod)}
                          disabled={isProcessingPayment || !paymentPhone}
                          className="btn-primary w-full flex items-center justify-center gap-3"
                        >
                          <Smartphone size={20} />
                          Demander le paiement (OTP)
                        </button>
                      </div>
                    )}

                    {paymentStep === 'method' && mmMode === 'ussd' && (
                      <div className="space-y-4 animate-in fade-in">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                          <p className="text-xs text-slate-500 mb-2">Syntaxe USSD (Composez ce code) :</p>
                          <p className="font-mono font-bold text-slate-900 text-center bg-white py-2 rounded-lg border border-slate-200">
                            {(() => {
                              let syntax = "";
                              let account = "";
                              if (selectedPaymentMethod === 'orange') {
                                syntax = settings?.paymentConfig?.ussdSyntaxes?.orange || '*144*4*6*{amount}*#';
                                account = settings?.paymentConfig?.paymentAccounts?.orangeMoney || '';
                              } else if (selectedPaymentMethod === 'moov') {
                                syntax = settings?.paymentConfig?.ussdSyntaxes?.moov || '*555*2*1*{amount}#';
                                account = settings?.paymentConfig?.paymentAccounts?.moovMoney || '';
                              } else if (selectedPaymentMethod === 'telecel') {
                                syntax = settings?.paymentConfig?.ussdSyntaxes?.telecel || '*160*2*1*{amount}#';
                                account = settings?.paymentConfig?.paymentAccounts?.telecelCash || '';
                              }
                              return syntax
                                .replace('{amount}', String(showPaymentModal.totalAmount))
                                .replace('{account}', account);
                            })()}
                          </p>
                          {(() => {
                            let account = "";
                            if (selectedPaymentMethod === 'orange') account = settings?.paymentConfig?.paymentAccounts?.orangeMoney || '';
                            else if (selectedPaymentMethod === 'moov') account = settings?.paymentConfig?.paymentAccounts?.moovMoney || '';
                            else if (selectedPaymentMethod === 'telecel') account = settings?.paymentConfig?.paymentAccounts?.telecelCash || '';
                            
                            return account ? (
                              <p className="text-[10px] text-slate-400 mt-2 text-center">
                                Compte Marchand : <span className="font-bold text-slate-600">{account}</span>
                              </p>
                            ) : null;
                          })()}
                        </div>
                        
                        {(() => {
                          let syntax = "";
                          let account = "";
                          if (selectedPaymentMethod === 'orange') {
                            syntax = settings?.paymentConfig?.ussdSyntaxes?.orange || '*144*4*6*{amount}*#';
                            account = settings?.paymentConfig?.paymentAccounts?.orangeMoney || '';
                          } else if (selectedPaymentMethod === 'moov') {
                            syntax = settings?.paymentConfig?.ussdSyntaxes?.moov || '*555*2*1*{amount}#';
                            account = settings?.paymentConfig?.paymentAccounts?.moovMoney || '';
                          } else if (selectedPaymentMethod === 'telecel') {
                            syntax = settings?.paymentConfig?.ussdSyntaxes?.telecel || '*160*2*1*{amount}#';
                            account = settings?.paymentConfig?.paymentAccounts?.telecelCash || '';
                          }
                          const rawCode = syntax
                            .replace('{amount}', String(showPaymentModal.totalAmount))
                            .replace('{account}', account);
                            
                          const telCode = rawCode.replace(/#/g, '%23');
                          
                          return (
                            <a 
                              href={`tel:${telCode}`}
                              className="w-full flex items-center justify-center p-3 rounded-xl border border-primary/20 bg-primary/10 text-primary font-bold hover:bg-primary/20 transition-all gap-2"
                            >
                              <PhoneCall size={18} />
                              Composer directement
                            </a>
                          );
                        })()}

                        <button 
                          onClick={() => setPaymentStep('otp')}
                          className="btn-primary w-full flex items-center justify-center gap-3"
                        >
                          <CheckCircle size={20} />
                          J'ai payé, valider la transaction
                        </button>
                      </div>
                    )}

                    {paymentStep === 'otp' && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                        <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex gap-3">
                          <AlertCircle className="text-blue-500 shrink-0" size={20} />
                          <p className="text-[10px] text-blue-700 leading-relaxed">
                            Un code OTP a été envoyé sur votre téléphone ou généré via USSD. Veuillez le saisir ci-dessous pour valider le paiement.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Code OTP</label>
                          <input 
                            type="text" 
                            placeholder="Ex: 12345"
                            value={paymentOtp}
                            onChange={(e) => setPaymentOtp(e.target.value)}
                            onFocus={(e) => {
                              // Scroll into view on mobile keyboard popups
                              setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
                            }}
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-center tracking-widest focus:border-primary outline-none transition-all"
                          />
                        </div>
                        <button 
                          onClick={() => performPayment(selectedPaymentMethod)}
                          disabled={isProcessingPayment || !paymentOtp}
                          className="btn-primary w-full flex items-center justify-center gap-3"
                        >
                          <CheckCircle size={20} />
                          Valider le paiement
                        </button>
                      </div>
                    )}

                    {paymentStep === 'processing' && (
                      <div className="py-8 flex flex-col items-center justify-center gap-4">
                        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        <p className="font-bold text-slate-600">Traitement en cours...</p>
                      </div>
                    )}

                    {paymentStep === 'success' && (
                      <div className="py-8 flex flex-col items-center justify-center gap-4 animate-in zoom-in">
                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                          <CheckCircle size={32} />
                        </div>
                        <p className="font-bold text-emerald-600 text-lg">Paiement réussi !</p>
                      </div>
                    )}
                  </div>
                )}

                {(!settings?.paymentConfig || settings.paymentConfig.cardEnabled) && !selectedPaymentMethod && (
                  <>
                    <div className="relative py-2">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
                      <div className="relative flex justify-center"><span className="bg-white px-4 text-xs text-slate-400 font-bold uppercase">Ou</span></div>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <button 
                        onClick={() => simulatePayment('card')}
                        disabled={isProcessingPayment}
                        className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 flex items-center justify-center gap-3"
                      >
                        <CreditCard size={20} />
                        Payer par Carte Bancaire
                      </button>
                      
                      {settings?.paymentConfig?.paymentAccounts?.bankAccountNumber && (
                        <button 
                          onClick={() => setSelectedPaymentMethod('bank')}
                          disabled={isProcessingPayment}
                          className="w-full bg-white text-slate-900 border-2 border-slate-200 py-4 rounded-2xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-3"
                        >
                          <Building2 size={20} />
                          Virement Bancaire
                        </button>
                      )}
                    </div>
                  </>
                )}

                {selectedPaymentMethod === 'bank' && (
                  <div className="space-y-4 text-left animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between mb-4">
                      <p className="font-bold text-slate-900 flex items-center gap-2">
                        <button onClick={() => setSelectedPaymentMethod(null)} className="p-1 hover:bg-slate-100 rounded-lg"><ChevronRight className="rotate-180" size={16}/></button>
                        Virement Bancaire
                      </p>
                    </div>
                    
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-4">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Banque</p>
                        <p className="font-bold text-slate-900">{settings?.paymentConfig?.paymentAccounts?.bankName}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Nom du Compte</p>
                        <p className="font-bold text-slate-900">{settings?.paymentConfig?.paymentAccounts?.bankAccountName}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Numéro de Compte</p>
                        <p className="font-mono font-bold text-slate-900 bg-white p-2 rounded-lg border border-slate-100">{settings?.paymentConfig?.paymentAccounts?.bankAccountNumber}</p>
                      </div>
                      {settings?.paymentConfig?.paymentAccounts?.bankIBAN && (
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-slate-400 uppercase">IBAN / RIB</p>
                          <p className="font-mono font-bold text-slate-900 bg-white p-2 rounded-lg border border-slate-100">{settings?.paymentConfig?.paymentAccounts?.bankIBAN}</p>
                        </div>
                      )}
                    </div>

                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3">
                      <AlertCircle className="text-amber-500 shrink-0" size={20} />
                      <p className="text-[10px] text-amber-700 leading-relaxed">
                        Veuillez effectuer le virement puis cliquer sur le bouton ci-dessous. Votre commande sera validée après réception des fonds.
                      </p>
                    </div>

                    <button 
                      onClick={() => simulatePayment('bank')}
                      disabled={isProcessingPayment}
                      className="btn-primary w-full flex items-center justify-center gap-3"
                    >
                      <CheckCircle size={20} />
                      J'ai effectué le virement
                    </button>
                  </div>
                )}
                
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
          </div>
        )}
      </AnimatePresence>

      {/* Delivery Confirmation Modal */}
      <AnimatePresence>
        {showDeliveryConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
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
                  {showDeliveryConfirm.fee === settings?.nightDeliveryFee ? '🌙 Tarif de nuit appliqué (Risque)' : '☀️ Tarif de journée appliqué'}
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
          </div>
        )}
      </AnimatePresence>

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
              { id: 'om', name: 'Orange Money', color: 'bg-white', borderColor: 'border-slate-100', logo: 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Orange_logo.svg', desc: 'Paiement instantané' },
              { id: 'moov', name: 'Moov Money', color: 'bg-white', borderColor: 'border-slate-100', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Moov_Africa_Logo.png/640px-Moov_Africa_Logo.png', desc: 'Simple et rapide' },
              { id: 'sank', name: 'Sank Money', color: 'bg-white', borderColor: 'border-slate-100', logo: 'https://sankmoney.com/wp-content/uploads/2022/10/Logo-Sank-Money-1.png', fallbackText: 'SANK', desc: 'Solution locale' },
              { id: 'card', name: 'Carte Bancaire', color: 'bg-slate-900', borderColor: 'border-slate-900', icon: CreditCard, desc: 'Visa / Mastercard' },
            ].map((m) => (
              <div key={m.id} className="group relative bg-white p-4 rounded-2xl border border-slate-100 ring-2 ring-transparent hover:border-transparent hover:ring-primary/20 hover:shadow-lg transition-all duration-300 cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 shrink-0 ${m.color} border border-slate-100/50 rounded-xl flex items-center justify-center overflow-hidden p-1.5 group-hover:scale-105 transition-transform duration-300 shadow-sm`}>
                    {m.logo ? <img src={m.logo} alt={m.name} referrerPolicy="no-referrer" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = `<span class="text-[10px] font-black text-center leading-tight ${m.id === 'sank' ? 'text-red-600' : ''}">${m.fallbackText || m.name}</span>`; }} /> : m.icon && <m.icon className="text-white" size={24} />}
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <span className="block text-[14px] font-black text-slate-900 leading-tight">{m.name}</span>
                    <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{m.desc}</span>
                  </div>
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
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
      <AnimatePresence>
        {showPartialSelect && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
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
                    const meds = Array.isArray(parsed) ? parsed : (parsed.prescriptions || parsed.medications || parsed.medicaments || Object.values(parsed).find(v => Array.isArray(v)) || []);
                    
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
          </div>
        )}
      </AnimatePresence>

      {/* Map Modal for Patient */}
      <AnimatePresence>
        {showMapForOrder && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
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
          </div>
        )}
      </AnimatePresence>
    </div>
    {activeChatOrderId && (
      <OrderChat 
        orderId={activeChatOrderId} 
        userId={profile.uid} 
        userName={profile.name} 
        userRole={profile.role}
        onClose={() => setActiveChatOrderId(null)} 
      />
    )}
  </PullToRefresh>
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
  const [paymentDetails, setPaymentDetails] = useState(profile.phone || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (paymentMethod === 'mobile_money' && profile.phone) {
      setPaymentDetails(profile.phone);
    }
  }, [paymentMethod, profile.phone]);

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

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
    </div>
  );
}

const PharmacistPrescriptionCard = React.memo(({ 
  p, 
  onStartQuote, 
  onReject 
}: { 
  p: Prescription, 
  onStartQuote: (p: Prescription) => Promise<void> | void, 
  onReject: (id: string, status: string) => Promise<void> | void 
}) => {
  const [isLoading, setIsLoading] = useState(false);
  
  return (
    <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-all p-5 flex flex-col gap-4">
      <div className="flex gap-4">
        <div 
          className="w-16 h-16 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 shrink-0 cursor-pointer relative group"
        >
          <img src={p.imageUrl} alt="Ordo" className="w-full h-full object-cover" loading="lazy" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-black text-slate-900 leading-none truncate">#{p.id.slice(-6).toUpperCase()}</p>
            <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
              <Clock size={10} />
              {p.createdAt?.toDate ? formatDate(p.createdAt.toDate(), 'short') : 'Récents'}
            </div>
          </div>
          
          <div className="flex items-center gap-2 mt-auto">
            <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase">
              <MapPin size={10} />
              {p.distance || 2} km
            </div>
            {p.requestType === 'partial' ? (
              <span className="text-[9px] bg-amber-50 text-amber-600 border border-amber-100 px-2 py-0.5 rounded-lg font-black uppercase flex items-center gap-1">
                <Package size={10} /> Partiel
              </span>
            ) : (
              <span className="text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-lg font-black uppercase flex items-center gap-1">
                <CheckCircle size={10} /> Complet
              </span>
            )}
          </div>
          {p.landmark && (
            <div className="mt-1 flex items-start gap-1 text-[9px] text-amber-700 bg-amber-50 px-2 py-1 rounded-lg font-medium border border-amber-100/50">
              <MapPin size={10} className="shrink-0 mt-0.5" />
              <span className="truncate italic">Repère: {p.landmark}</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100/50 max-h-24 overflow-hidden relative">
        <div className="text-[10px] text-slate-600">
          {p.extractedData ? (
            <div className="space-y-1">
              {(() => {
                try {
                  const jsonStr = p.extractedData?.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0];
                  if (!jsonStr) return <p className="italic text-slate-400">Non structuré</p>;
                  const parsed = JSON.parse(jsonStr);
                  const meds = Array.isArray(parsed) ? parsed : (parsed.prescriptions || parsed.medications || parsed.medicaments || Object.values(parsed).find(v => Array.isArray(v)) || []);
                  
                  const displayMeds = p.requestType === 'partial' && p.selectedMedications
                    ? meds.filter((m: any) => p.selectedMedications?.includes(typeof m === 'string' ? m : (m.nom_article || m.name || m.medicament)))
                    : meds;

                  return displayMeds.map((m: any, i: number) => {
                    const name = typeof m === 'string' ? m : (m.nom_article || m.name || m.medicament || 'Inconnu');
                    return (
                      <div key={`${name}-${i}`} className="flex items-center gap-1.5 truncate">
                        <div className="w-1 h-1 rounded-full bg-slate-300 shrink-0"></div>
                        <span className="font-bold text-slate-700">{name}</span>
                      </div>
                    );
                  });
                } catch (e) {
                  return <p className="truncate">{p.extractedData}</p>;
                }
              })()}
            </div>
          ) : (
            <span className="flex items-center gap-2"><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div> Analyse...</span>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none"></div>
      </div>

      <div className="flex gap-2">
        <button 
          onClick={async () => {
            setIsLoading(true);
            try { await onStartQuote(p); } finally { setIsLoading(false); }
          }}
          disabled={isLoading}
          className="flex-1 bg-primary text-white py-3 text-[11px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
        >
          {isLoading ? '...' : 'Devis'}
        </button>
        <button 
          onClick={async () => {
             setIsLoading(true);
             try { await onReject(p.id, 'rejected'); } finally { setIsLoading(false); }
          }}
          disabled={isLoading}
          className="px-4 bg-rose-50 text-rose-500 rounded-xl font-bold hover:bg-rose-500 hover:text-white transition-all shadow-sm disabled:opacity-50"
          title="Rejeter"
        >
          <X size={16} />
        </button>
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
    <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-all">
      <div className="px-5 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center text-slate-400 font-black text-[10px]">
            {o.id.slice(-2).toUpperCase()}
          </div>
          <div>
            <p className="text-xs font-black text-slate-900 leading-none mb-1">#{o.id.slice(-6).toUpperCase()}</p>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{o.patientName}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {o.quoteType === 'partial' ? (
                <span className="text-[8px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-md font-black uppercase flex items-center gap-1">Devis Partiel</span>
              ) : (
                <span className="text-[8px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-md font-black uppercase flex items-center gap-1">Devis Complet</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[8px] font-black px-2 py-1 rounded-lg uppercase tracking-wider ${
            o.status === 'paid' ? 'bg-emerald-500 text-white' : 
            o.status === 'preparing' ? 'bg-indigo-500 text-white' :
            o.status === 'ready' ? 'bg-emerald-600 text-white' :
            o.status === 'delivering' ? 'bg-sky-500 text-white' :
            'bg-slate-200 text-slate-600'
          }`}>
            {o.status === 'paid' ? 'À Préparer' :
             o.status === 'preparing' ? 'En cours' :
             o.status === 'ready' ? 'Prêt' :
             o.status === 'delivering' ? 'En cours de livr.' :
             o.status}
          </span>
          <button 
            onClick={() => onChat(o.id)}
            className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-emerald-600 transition-all relative"
          >
            <MessageCircle size={14} />
            {o.unreadCounts?.[profile?.role || 'pharmacist'] > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-bold flex items-center justify-center rounded-full border-2 border-white">
                {o.unreadCounts[profile?.role || 'pharmacist']}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex gap-4">
          {o.prescriptionImageUrl && (
            <div 
              className="w-16 h-16 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 shrink-0 cursor-pointer relative group"
              onClick={() => onViewImage(o.prescriptionImageUrl!)}
            >
              <img src={o.prescriptionImageUrl} alt="Ordo" className="w-full h-full object-cover" loading="lazy" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-slate-400 leading-tight mb-2 uppercase tracking-tight">Articles & Traitement</p>
            <div className="space-y-1">
              {o.items?.slice(0, 2).map((item, i) => (
                <p key={i} className="text-xs text-slate-600 truncate flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                  {item.name} x{item.quantity}
                </p>
              ))}
              {o.items && o.items.length > 2 && (
                <p className="text-[10px] text-slate-400 italic">+{o.items.length - 2} autres articles</p>
              )}
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-50 flex flex-col gap-1">
          <div className="flex justify-between text-[8px] font-bold text-emerald-600 uppercase tracking-widest">
            <span>Gain Net Estimé</span>
            <span>{o.pharmacyAmount?.toLocaleString()} FCFA</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {o.deliveryId && !o.isHandedOver && o.deliveryMethod === 'delivery' && (
            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 mb-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 overflow-hidden border border-amber-200">
                  {o.deliveryPersonPhoto ? (
                    <img src={o.deliveryPersonPhoto} alt={o.deliveryPersonName} className="w-full h-full object-cover" />
                  ) : (
                    <Truck size={24} />
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Livreur assigné</p>
                  <p className="font-bold text-slate-900">{o.deliveryPersonName}</p>
                  <p className="text-xs text-slate-500">{o.deliveryPersonPhone}</p>
                </div>
              </div>
              <button 
                onClick={() => onHandover(o)}
                className="w-full py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
              >
                <ShieldCheck size={18} />
                Vérifier l'identité et remettre
              </button>
            </div>
          )}

          {o.status === 'ready' && o.deliveryMethod === 'pickup' && (
            <button 
              onClick={() => onHandover(o)}
              className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle size={18} />
              Confirmer le retrait physique
            </button>
          )}

          {o.status === 'delivering' && o.isHandedOver && (
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex items-center gap-3 mb-2">
              <CheckCircle className="text-emerald-500" size={20} />
              <p className="text-sm font-medium text-emerald-700">Remis au livreur</p>
            </div>
          )}

          {o.status === 'pending_quote' ? (
            <div className="text-center p-4 bg-slate-50 rounded-2xl">
              <p className="text-xs text-slate-400 font-medium">En attente de validation par le client</p>
            </div>
          ) : o.status === 'pending_payment' ? (
            <div className="text-center p-4 bg-slate-50 rounded-2xl">
              <p className="text-xs text-slate-400 font-medium">En attente de paiement par le client</p>
            </div>
          ) : o.status === 'ready' && !o.deliveryMethod ? (
            <div className="text-center p-4 bg-amber-50 rounded-2xl border border-amber-100">
              <p className="text-xs text-amber-700 font-bold">En attente du choix de livraison du client</p>
            </div>
          ) : (o.status === 'paid' || o.status === 'preparing') ? (
            <button 
              onClick={() => onUpdateStatus(o)}
              className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
            >
              {o.status === 'paid' ? 'Commencer la préparation' : 'Marquer comme prêt'}
              <ChevronRight size={18} />
            </button>
          ) : null}

          {o.status === 'completed' && (o.deliveryPhoto || o.deliverySignature) && (
            <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Preuve de Livraison</p>
              <div className="flex gap-4">
                {o.deliveryPhoto && (
                  <button onClick={() => onViewImage(o.deliveryPhoto!)} className="flex-1 aspect-video rounded-xl overflow-hidden border border-slate-200 relative group">
                    <img src={o.deliveryPhoto} className="w-full h-full object-cover" />
                  </button>
                )}
                {o.deliverySignature && (
                  <button onClick={() => onViewImage(o.deliverySignature!)} className="flex-1 aspect-video rounded-xl bg-white border border-slate-200 flex items-center justify-center p-2 group relative">
                    <img src={o.deliverySignature} className="max-h-full object-contain" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// --- Pharmacist Dashboard ---

const PharmacistDashboard = React.memo(({ profile, settings, cities, rotation }: { profile: UserProfile, settings: Settings | null, cities: City[], rotation: OnCallRotation | null }) => {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'active' | 'history' | 'wallet' | 'reports' | 'profile'>('pending');
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

      // Play sound for new prescriptions (excluding initial load)
      const hasNew = snapshot.docChanges().some(change => change.type === 'added');
      if (!isFirstRunPharmacistPrescriptions.current && hasNew && !snapshot.metadata.hasPendingWrites) {
        playNotificationSound();
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

        // Proximity Logic (Only applies if pharmacy has coordinates and order has distance/location)
        const prescriptionAgeMins = (new Date().getTime() - (p.createdAt?.toDate ? p.createdAt.toDate().getTime() : new Date(p.createdAt || 0).getTime())) / (1000 * 60);
        if (prescriptionAgeMins < 10 && (p.distance || 0) > 3) {
           return false; // Hide if > 3km and younger than 10 mins
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
  }, [profile.uid, settings, myPharmacy]);

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
      const hasNew = snapshot.docChanges().some(change => change.type === 'added');
      if (!isFirstRunPharmacistOrders.current && hasNew && !snapshot.metadata.hasPendingWrites) {
        playNotificationSound();
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
  }, [profile.uid]);

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
        prescriptionImageUrl: selectedPrescription.imageUrl,
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
        items: quoteItems.filter(item => !item.isUnavailable),
        unavailableItems: quoteItems.filter(item => item.isUnavailable),
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

  const handleValidatePrescription = async (id: string, status: 'validated' | 'rejected') => {
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
            lockedAt: null
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
    <PullToRefresh onRefresh={async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success("Données actualisées");
    }}>
      <div className="relative space-y-4 pb-8 pt-1 transition-all">
        {viewImage && <ImageViewerModal imageUrl={viewImage} onClose={() => setViewImage(null)} />}
      
      {/* Role Header (Android Style) */}
      <div className="bg-slate-900 rounded-[2rem] p-4 relative overflow-hidden shadow-xl shadow-slate-900/10">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-md">
              <Plus size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-white uppercase leading-none">Portail Pharmacien</h1>
              <p className="text-white/40 text-[9px] font-bold uppercase tracking-widest mt-1">{myPharmacy?.name || "Pharmacie Partenaire"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isOnCallNow && isMyGroupOnCall ? 'bg-indigo-400 animate-pulse' : 'bg-slate-500 opacity-30'}`}></div>
            <span className="text-[10px] font-black text-white/60 uppercase racking-widest">{isOnCallNow && isMyGroupOnCall ? 'En garde' : 'Standard'}</span>
          </div>
        </div>
      </div>

      {/* On-Call Status Banner */}
      {currentCity && isMyGroupOnCall && isOnCallNow && (
        <div className="bg-indigo-600 text-white p-6 rounded-[2rem] shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <Navigation size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold">Votre pharmacie est de garde !</h3>
              <p className="text-indigo-100 text-sm">Groupe {profile.groupId} • {currentCity.name} ({currentCity.onCallStartTime} - {currentCity.onCallEndTime})</p>
            </div>
          </div>
          <div className="hidden md:block">
            <span className="px-4 py-2 bg-white/20 rounded-full text-sm font-bold animate-pulse">
              En service
            </span>
          </div>
        </div>
      )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4">
          <div className="bg-slate-900 p-4 sm:p-6 rounded-[2rem] shadow-xl flex items-center justify-between group relative overflow-hidden">
            <div className="relative z-10">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Gains</p>
              <h3 className="text-sm sm:text-lg font-bold text-white">{availableGains.toLocaleString()} <span className="text-[8px] text-slate-400">FCFA</span></h3>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/5 rounded-xl flex items-center justify-center text-emerald-400">
              <CreditCard size={18} />
            </div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between group">
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Jour</p>
              <h3 className="text-sm sm:text-lg font-bold text-slate-900">{dailyGains.toLocaleString()} <span className="text-[8px] text-slate-400">FCFA</span></h3>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between group">
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Attente</p>
              <h3 className="text-sm sm:text-lg font-bold text-slate-900">{prescriptions.length}</h3>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
              <FileText size={18} />
            </div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between group">
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Total</p>
              <h3 className="text-sm sm:text-lg font-bold text-slate-900">{historyOrders.length}</h3>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-secondary/10 rounded-xl flex items-center justify-center text-secondary">
              <Package size={18} />
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

        {/* Mobile Bottom Navigation (Android Native Feel) */}
        <div className="md:hidden fixed bottom-1 left-1 right-1 z-[200] px-3 pt-1.5 bg-slate-900/95 backdrop-blur-2xl rounded-[1.75rem] shadow-2xl shadow-black/20 border border-white/5 mx-2 mb-2" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.25rem)' }}>
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
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div key={activeTab}>
              {activeTab === 'pending' && (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {prescriptions.length === 0 ? (
              <div className="lg:col-span-2 bg-white p-10 rounded-[3.5rem] border-2 border-dashed border-slate-100 text-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center text-primary mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                  <FileText size={48} strokeWidth={1.5} />
                </div>
                <p className="text-slate-900 font-black text-2xl mb-2">Aucune ordonnance en attente</p>
                <p className="text-slate-500 text-sm max-w-xs mx-auto">Les nouvelles ordonnances soumises par les patients apparaîtront ici.</p>
              </div>
            ) : (
              prescriptions.map(p => (
                <PharmacistPrescriptionCard 
                  key={p.id} 
                  p={p} 
                  onStartQuote={handleStartQuote} 
                  onReject={handleValidatePrescription} 
                />
              ))
            )}
                  </div>
                </>
              )}

              {activeTab === 'active' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {orders.length === 0 ? (
              <div className="lg:col-span-3 bg-white p-10 rounded-[3.5rem] border-2 border-dashed border-slate-100 text-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500 mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                  <Package size={48} strokeWidth={1.5} />
                </div>
                <p className="text-slate-900 font-black text-2xl mb-2">Aucune commande active</p>
                <p className="text-slate-500 text-sm max-w-xs mx-auto">Les commandes payées et en attente de préparation apparaîtront ici.</p>
              </div>
            ) : (
              orders.map(o => (
                <PharmacistOrderCard 
                  key={o.id} 
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
              ))
            )}
                  </div>
                </>
              )}

        {/* Quote Modal */}
        {selectedPrescription && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-2 md:p-4">
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
          </div>
        )}

              {activeTab === 'history' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {historyOrders.length === 0 ? (
              <div className="lg:col-span-3 bg-white p-10 rounded-[3.5rem] border-2 border-dashed border-slate-100 text-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                  <Clock size={48} strokeWidth={1.5} />
                </div>
                <p className="text-slate-900 font-black text-2xl mb-2">Historique vide</p>
                <p className="text-slate-500 text-sm max-w-xs mx-auto">Les commandes terminées ou annulées apparaîtront ici.</p>
              </div>
            ) : (
              historyOrders.map(o => (
                <div key={o.id} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col opacity-80 hover:opacity-100 transition-opacity">
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
                    <div>
                      <span className="font-bold text-sm block">#{o.id.slice(-6).toUpperCase()}</span>
                      <span className="text-[10px] text-slate-500">{o.updatedAt ? formatDate(o.updatedAt, 'date') : 'Date inconnue'}</span>
                    </div>
                    <div className="text-right">
                      <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md text-[10px] font-bold block mb-1">TERMINÉE</span>
                      <span className="text-xs font-black text-emerald-600">+{o.pharmacyAmount?.toLocaleString()} FCFA</span>
                    </div>
                  </div>
                  
                  <div className="flex-1 flex flex-col gap-4">
                    <div className="flex gap-4">
                      {o.prescriptionImageUrl && (
                        <div 
                          className="w-16 h-16 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 shrink-0 cursor-pointer"
                          onClick={() => setViewImage(o.prescriptionImageUrl!)}
                        >
                          <img src={o.prescriptionImageUrl} className="w-full h-full object-cover" />
                        </div>
                      )}
                      {o.facadePhoto && (
                        <div 
                          className="w-16 h-16 rounded-xl overflow-hidden bg-slate-50 border border-emerald-200 shrink-0 cursor-pointer relative"
                          onClick={() => setViewImage(o.facadePhoto!)}
                        >
                          <img src={o.facadePhoto} className="w-full h-full object-cover" />
                          <div className="absolute top-0 right-0 bg-emerald-500 text-white p-0.5 rounded-bl-lg">
                            <Home size={8} />
                          </div>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{o.patientName}</p>
                        <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-1">
                          <Hospital size={10} className="shrink-0" />
                          <p className="truncate">{o.hospitalLocation}</p>
                        </div>
                        {o.landmark && (
                          <div className="flex items-center gap-1 text-[9px] text-amber-600 mb-1 font-medium italic truncate">
                             <MapPin size={10} className="shrink-0" />
                             {o.landmark}
                          </div>
                        )}
                        <p className="text-xs text-slate-700 font-medium truncate">{o.items?.length || 0} article(s)</p>
                      </div>
                    </div>
                  </div>
                </div>
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
                    <ReportsView profile={profile} />
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
      <AnimatePresence>
        {showHandoverVerify && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
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
          </div>
        )}
      </AnimatePresence>
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
    {activeChatOrderId && (
      <OrderChat 
        orderId={activeChatOrderId} 
        userId={profile.uid} 
        userName={profile.name} 
        userRole={profile.role}
        onClose={() => setActiveChatOrderId(null)} 
      />
    )}
  </PullToRefresh>
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
  return (
    <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-md transition-all flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
          <MapPin size={20} />
        </div>
        <div className="text-right">
          <span className="text-lg font-black text-emerald-600 block leading-none">+{m.deliveryFee || 1500} <span className="text-[10px]">CFA</span></span>
        </div>
      </div>
      
      <div className="space-y-3">
        <div className="flex gap-3">
          <div className="flex flex-col items-center gap-1 py-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
            <div className="w-0.5 flex-1 bg-slate-100"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
          </div>
          <div className="flex flex-col gap-3 min-w-0">
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Pharmacie</p>
              <p className="text-xs font-bold text-slate-800 truncate">{m.pharmacyName || "Pharmacie Partenaire"}</p>
            </div>
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Patient</p>
              <p className="text-xs font-bold text-slate-800 truncate">{m.hospitalLocation}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-3 pt-3 border-t border-slate-50">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
            <Package size={12} /> {m.items?.length || 0} art.
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg ml-auto">
            {m.status === 'pending_payment' ? 'En attente paiement' : 'Prêt'}
          </div>
        </div>
      </div>

      <StatusTrace history={m.history} />

      <div className="flex gap-2">
        <button 
          onClick={async () => {
             setIsLoading(true);
             try { await onAccept(m); } finally { setIsLoading(false); }
          }}
          disabled={isLoading}
          className="flex-1 bg-slate-900 text-white py-3.5 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-90 shadow-lg shadow-slate-900/10 disabled:opacity-50"
        >
          {isLoading ? '...' : 'Accepter'}
        </button>
        <button 
          onClick={async () => {
             setIsLoading(true);
             try { await onReject(m.id); } finally { setIsLoading(false); }
          }}
          disabled={isLoading}
          className="px-4 bg-rose-50 text-rose-500 rounded-xl font-bold hover:bg-rose-500 hover:text-white transition-all shadow-sm active:scale-90 disabled:opacity-50"
        >
          <X size={16} />
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
    <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-all">
      <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-white rounded-lg shadow-sm flex items-center justify-center text-blue-600">
            <Truck size={14} />
          </div>
          <span className="text-xs font-black text-slate-900 leading-none tracking-tight">#{m.id.slice(-6).toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-2">
           <span className={`text-[8px] font-black px-2 py-1 rounded-lg uppercase tracking-wider ${
            m.status === 'pending_payment' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-500 text-white'
          }`}>
            {m.status === 'pending_payment' ? 'Att. Paiement' : 'En Livraison'}
          </span>
          <button 
            onClick={() => onChat(m.id)}
            className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-emerald-600 transition-all relative"
          >
            <MessageCircle size={14} />
            {m.unreadCounts?.[profile?.role || 'delivery'] > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-bold flex items-center justify-center rounded-full border-2 border-white">
                {m.unreadCounts[profile?.role || 'delivery']}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Hospital size={10} /> Origine
            </p>
            <p className="text-[11px] font-bold text-slate-700 leading-tight truncate">{m.hospitalLocation}</p>
          </div>
          <div>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <MapPin size={10} /> Ville
            </p>
            <p className="text-[11px] font-bold text-slate-700 leading-tight truncate">{cities.find(c => c.id === m.cityId)?.name || "Non précisée"}</p>
          </div>
          
          <div className="col-span-2 bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-start gap-3">
             {m.facadePhoto && (
               <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-slate-200">
                 <img src={m.facadePhoto} className="w-full h-full object-cover" />
               </div>
             )}
             <div className="min-w-0 flex-1">
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><User size={10} /> Client</p>
               <p className="text-sm font-bold text-slate-900 truncate">{m.patientName || "Client"}</p>
               <div className="flex flex-col sm:flex-row gap-1.5 mt-1">
                 <a href={`tel:${m.patientPhone || ''}`} className="inline-flex items-center justify-center gap-1 text-xs text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded-md border border-blue-100 flex-1">
                   <Phone size={10} />
                   Appeler
                 </a>
                 <a href={`https://wa.me/${(m.patientPhone || '').replace(/\D/g, '')}?text=Bonjour%2C%20je%20suis%20votre%20livreur%2E%20Pouvez-vous%20m'envoyer%20votre%20position%20en%20direct%20%3F`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1 text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100 flex-1 group" title="Demander position via WhatsApp">
                   <MapPin size={10} className="group-hover:animate-bounce" />
                   WhatsApp GPS
                 </a>
               </div>
             </div>
          </div>
          
          {m.landmark && (
            <div className="col-span-2 bg-amber-50 p-2.5 rounded-xl border border-amber-100/50 flex items-start gap-2">
              <MapPin size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-[9px] font-black text-amber-600/70 uppercase tracking-widest">Secteur / Quartier / Repère</p>
                <p className="text-xs font-bold text-amber-900 leading-tight">{m.landmark}</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100/50">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Package size={10} /> Colis</p>
          <div className="space-y-1">
            {m.items?.slice(0, 1).map((item, i) => (
              <div key={i} className="flex justify-between text-[10px]">
                <span className="text-slate-600 truncate mr-2">{item.name}</span>
                <span className="font-bold shrink-0">x{item.quantity}</span>
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
            className="w-full py-2.5 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <QrCode size={14} />
            Code Retrait
          </button>
        ) : (
          <button 
            onClick={() => onShowDeliveryVerify(m)}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <ShieldCheck size={14} />
            Valider Livr.
          </button>
        )}
        <button 
          onClick={() => onShowMap(m)}
          className="w-full py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
        >
          <Search size={14} /> Carte
        </button>
      </div>
    </div>
  </div>
  );
});

// --- Delivery Dashboard ---

const DeliveryDashboard = React.memo(({ profile, settings, cities }: { profile: UserProfile, settings: Settings | null, cities: City[] }) => {
  const [missions, setMissions] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'available' | 'active' | 'history' | 'wallet' | 'profile' | 'reports'>('available');

  const [showPickupQR, setShowPickupQR] = useState<Order | null>(null);
  const [showDeliveryVerify, setShowDeliveryVerify] = useState<Order | null>(null);
  const [deliveryCodeInput, setDeliveryCodeInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [phoneInput, setPhoneInput] = useState(profile.phone || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [historyMissions, setHistoryMissions] = useState<Order[]>([]);
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
      
      // Play sound for new missions (excluding initial load)
      const hasNew = snapshot.docChanges().some(change => change.type === 'added');
      if (!isFirstRunDeliveryMissions.current && hasNew && !snapshot.metadata.hasPendingWrites) {
        playNotificationSound();
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
  }, []);

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
              <h1 className="text-lg font-black tracking-tight text-white uppercase leading-none">Espace Livreur</h1>
              <p className="text-white/60 text-[9px] font-bold uppercase tracking-widest mt-1">Prêt pour livraison</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${availableMissions.length > 0 ? 'bg-white animate-pulse' : 'bg-white/30'}`}></div>
            <span className="text-[10px] font-black text-white/60 uppercase racking-widest">Actif</span>
          </div>
        </div>
      </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6 mb-8">
          <div className="bg-slate-900 p-4 sm:p-6 rounded-[2rem] shadow-xl flex items-center justify-between group relative overflow-hidden">
            <div className="relative z-10">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Gains</p>
              <h3 className="text-sm sm:text-lg font-bold text-white">{availableGains.toLocaleString()} <span className="text-[8px] text-slate-400">FCFA</span></h3>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/5 rounded-xl flex items-center justify-center text-emerald-400">
              <CreditCard size={18} />
            </div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between group">
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Missions</p>
              <h3 className="text-sm sm:text-lg font-bold text-slate-900">{availableMissions.length}</h3>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
              <MapPin size={18} />
            </div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between group">
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Total</p>
              <h3 className="text-sm sm:text-lg font-bold text-slate-900">{completedMissionsCount}</h3>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
              <Package size={18} />
            </div>
          </div>
        </div>
      <div className="bg-primary p-8 rounded-[2.5rem] shadow-xl shadow-primary/20 text-white flex items-center justify-between group">
        <div>
          <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-2">Missions disponibles</p>
          <h3 className="text-4xl font-bold">{availableMissions.length}</h3>
        </div>
        <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center text-white group-hover:scale-110 transition-transform">
          <Package size={32} />
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
        <div className="md:hidden fixed bottom-1 left-1 right-1 z-[200] px-3 pt-1.5 bg-slate-900/95 backdrop-blur-2xl rounded-[1.75rem] shadow-2xl shadow-black/20 border border-white/5 mx-2 mb-2" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.25rem)' }}>
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
        </div>

        <div className="flex-1 min-w-0">
          <div key={activeTab}>
              {activeTab === 'available' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {availableMissions.length === 0 ? (
              <div className="md:col-span-2 lg:col-span-3 bg-white p-10 rounded-[3.5rem] border-2 border-dashed border-slate-100 text-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="w-24 h-24 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500 mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                  <Truck size={48} strokeWidth={1.5} />
                </div>
                <p className="text-slate-900 font-black text-2xl mb-2">Aucune mission</p>
                <p className="text-slate-500 text-sm max-w-xs mx-auto">Les nouvelles commandes prêtes à être livrées apparaîtront ici.</p>
              </div>
            ) : (
              availableMissions.map(m => (
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
                        pickupCode: Math.random().toString(36).substr(2, 6).toUpperCase(), // Use simple random code if generateCode not available
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
              ))
            )}
                  </div>
                </>
              )}

              {activeTab === 'active' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeMissions.length === 0 ? (
              <div className="lg:col-span-3 bg-white p-20 rounded-[3.5rem] border-2 border-dashed border-slate-100 text-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500 mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                  <Truck size={48} strokeWidth={1.5} />
                </div>
                <p className="text-slate-900 font-black text-2xl mb-2">Aucune livraison en cours</p>
                <p className="text-slate-500 text-sm max-w-xs mx-auto">Acceptez une mission pour commencer une livraison.</p>
              </div>
            ) : (
              activeMissions.map(m => (
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
              ))
            )}
                  </div>
                </>
              )}

      {activeTab === 'history' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {historyMissions.length === 0 ? (
            <div className="lg:col-span-3 bg-white p-20 rounded-[3.5rem] border-2 border-dashed border-slate-100 text-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-slate-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                <Clock size={48} strokeWidth={1.5} />
              </div>
              <p className="text-slate-900 font-black text-2xl mb-2">Historique vide</p>
              <p className="text-slate-500 text-sm max-w-xs mx-auto">Les livraisons terminées apparaîtront ici.</p>
            </div>
          ) : (
            historyMissions.map(m => (
              <div key={m.id} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col opacity-80 hover:opacity-100 transition-opacity">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
                  <div>
                    <span className="font-bold text-sm block">#{m.id.slice(-6).toUpperCase()}</span>
                    <span className="text-[10px] text-slate-500">{m.updatedAt ? formatDate(m.updatedAt, 'date') : 'Date inconnue'}</span>
                  </div>
                  <div className="text-right">
                    <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md text-[10px] font-bold block mb-1">LIVRÉE</span>
                    <span className="text-xs font-black text-emerald-600">+{m.deliveryFee || 1500} FCFA</span>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center text-slate-400 shrink-0">
                      <MapPin size={14} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Secteur / Quartier</p>
                      <p className="font-bold text-xs text-slate-600 truncate">Secteur 15, Rue 15.22</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-8 h-8 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center text-slate-400 shrink-0">
                      <Package size={14} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Articles</p>
                      <p className="font-bold text-xs text-slate-600 truncate">{m.items?.length || 0} article(s)</p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
                  </div>
                </>
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
   <AnimatePresence>
     {showPickupQR && (
       <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
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
       </div>
     )}
   </AnimatePresence>

  {/* Delivery Verify Modal */}
  <AnimatePresence>
    {showDeliveryVerify && (
       <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
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
      </div>
    )}
  </AnimatePresence>

  {/* Map Modal */}
  <AnimatePresence>
    {showMapForOrder && (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
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
      </div>
    )}
  </AnimatePresence>

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
    {showSignaturePad && (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[210] flex items-center justify-center p-4">
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
      </div>
    )}
      {activeChatOrderId && (
        <OrderChat 
          orderId={activeChatOrderId} 
          userId={profile.uid} 
          userName={profile.name} 
          userRole={profile.role}
          onClose={() => setActiveChatOrderId(null)} 
        />
      )}
  </PullToRefresh>
  );
});
