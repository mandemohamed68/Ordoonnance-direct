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
import { GoogleGenAI } from "@google/genai";
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
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { UserProfile, Prescription, Order, UserRole, Pharmacy, Settings, Transaction, WithdrawalRequest, City, OnCallRotation } from './types';
import { 
  Camera, 
  Upload, 
  Package, 
  Truck, 
  User, 
  LogOut, 
  Plus, 
  CheckCircle, 
  Clock, 
  MapPin, 
  Phone,
  FileText,
  ChevronRight,
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
  X,
  TrendingUp,
  Save,
  Bell,
  BellOff,
  Building2,
  Navigation
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeCanvas } from 'qrcode.react';
import { toast } from 'sonner';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { logTransaction, createNotification, formatDate, isSuperAdminEmail, notifyDeliveryDrivers, compressImage, getCurrentOnCallGroup, isCityOnCallNow, calculateDistance } from './utils/shared';
import { Capacitor } from '@capacitor/core';
import { PullToRefresh } from './components/PullToRefresh';
import { AdminDashboard } from './components/AdminDashboard';
import { Legal } from './components/Legal';
import { ReportsView } from './components/ReportsView';

// Fix Leaflet default icon issue
// @ts-ignore
import icon from 'leaflet/dist/images/marker-icon.png?url';
// @ts-ignore
import iconShadow from 'leaflet/dist/images/marker-shadow.png?url';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// --- Super Admin Utilities moved to shared.ts ---

// --- Utilities moved to shared.ts ---

const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}

function MapComponent({ center, markers, zoom = 13 }: { center: [number, number], markers: { pos: [number, number], label: string, color?: string, type?: 'patient' | 'pharmacy' | 'delivery' | 'self' }[], zoom?: number }) {
  return (
    <div className="h-[300px] w-full rounded-2xl overflow-hidden border border-slate-100 shadow-inner relative z-0">
      <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RecenterMap center={center} />
        {markers.map((marker, idx) => (
          <Marker 
            key={idx} 
            position={marker.pos}
            icon={L.icon({
              iconUrl: icon,
              shadowUrl: iconShadow,
              iconSize: [25, 41],
              iconAnchor: [12, 41],
              popupAnchor: [1, -34],
              shadowSize: [41, 41]
            })}
          >
            <Popup>
              <div className="font-bold">{marker.label}</div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
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

function StatusTrace({ history }: { history?: Order['history'] }) {
  if (!history || history.length === 0) return null;
  
  // Sort history by timestamp descending (newest first)
  const sortedHistory = [...history].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  
  return (
    <div className="mt-8 pt-8 border-t border-slate-100">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Historique de suivi</p>
      </div>
      <div className="space-y-6 relative">
        <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-primary/50 to-slate-100"></div>
        {sortedHistory.map((h, i) => (
          <div key={`${h.timestamp}-${i}`} className="flex items-start gap-4 relative z-10">
            <div className={`w-6 h-6 rounded-full border-4 border-white flex items-center justify-center ${
              i === 0 ? 'bg-primary shadow-lg shadow-primary/30 scale-110' : 'bg-slate-200'
            } transition-all`}>
              <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
            </div>
            <div>
              <p className={`text-xs font-bold ${i === 0 ? 'text-slate-900' : 'text-slate-500'}`}>{h.label}</p>
              <p className="text-[10px] text-slate-400 font-medium">
                {formatDate(h.timestamp, 'short')} {formatDate(h.timestamp, 'time')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const LogoIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect width="100" height="100" rx="24" fill="#10b981" />
    <path d="M35 25C35 22.2386 37.2386 20 40 20H60C62.7614 20 65 22.2386 65 25V75C65 77.7614 62.7614 80 60 80H40C37.2386 80 35 77.7614 35 75V25Z" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M42 20V25H58V20" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M30 50H70" stroke="white" strokeWidth="12" strokeLinecap="round"/>
    <path d="M50 30V70" stroke="white" strokeWidth="12" strokeLinecap="round"/>
    <path d="M35 75V85H65L75 75" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M65 85L75 75L65 65" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

function NotificationBell({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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
                      <p className="text-[10px] text-slate-400 mt-2">{n.createdAt ? new Date(n.createdAt.toDate()).toLocaleString() : 'A l\'instant'}</p>
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

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [viewMode, setViewMode] = useState<UserRole | null>(null);
  const activeRole = (profile?.role === 'super-admin' && viewMode && viewMode !== 'super-admin') ? viewMode : profile?.role;
  const effectiveProfile = (profile?.role === 'super-admin' && viewMode && viewMode !== 'super-admin') 
    ? { ...profile, role: viewMode as UserRole } 
    : profile;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showSupportChat, setShowSupportChat] = useState(false);
  const [supportMessages, setSupportMessages] = useState<any[]>([]);
  const [newSupportMessage, setNewSupportMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'support_messages'),
      where('chatId', '==', user.uid),
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSupportMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'support_messages'));
    return () => unsubscribe();
  }, [user]);

  const sendSupportMessage = async () => {
    if (!newSupportMessage.trim() || !user) return;
    try {
      await addDoc(collection(db, 'support_messages'), {
        chatId: user.uid,
        senderId: user.uid,
        senderName: profile?.name || user.email,
        text: newSupportMessage,
        isAdmin: false,
        createdAt: serverTimestamp()
      });
      setNewSupportMessage('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'support_messages');
    }
  };
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showLegal, setShowLegal] = useState(false);
  const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null);

  // Track location for delivery and patients
  useEffect(() => {
    if (!profile?.uid || (activeRole !== 'delivery' && activeRole !== 'patient' && activeRole !== 'pharmacist')) return;

    if (!navigator.geolocation) {
      console.error("Geolocation is not supported by this browser.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
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
            const activeOrders = await getDocs(q);
            activeOrders.forEach(async (orderDoc) => {
              await updateDoc(doc(db, 'orders', orderDoc.id), {
                deliveryLocation: newLoc
              });
            });
          }
        } catch (err) {
          console.error("Error updating location:", err);
        }
      },
      (err) => {
        console.error("Geolocation error:", err);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
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
        const unsubProfile = onSnapshot(docRef, async (docSnap) => {
          console.log("[Auth] Profile snapshot for", firebaseUser.email, ":", docSnap.exists() ? "exists" : "not found");
          try {
            if (docSnap.exists()) {
              const data = docSnap.data() as UserProfile;
              console.log("[Auth] Profile role:", data.role, "status:", data.status);
              
              // Force super-admin role for the specific emails
              if (isSuperAdminEmail(firebaseUser.email) && data.role !== 'super-admin') {
                await updateDoc(docRef, { role: 'super-admin', status: 'active' });
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
                  await updateDoc(docRef, updates);
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
                email: firebaseUser.email,
                role: 'super-admin',
                walletBalance: 0,
                pharmacistBalance: 0,
                deliveryBalance: 0,
                status: 'active',
                createdAt: serverTimestamp()
              };
              await setDoc(docRef, newProfile);
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
    if (!isAuthReady || !user) {
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

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    const provider = new GoogleAuthProvider();
    try {
      // Check if running in Capacitor (mobile app)
      const isNative = Capacitor.isNativePlatform();
      if (isNative) {
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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

  if (profile.status === 'rejected' && !isSuperAdminEmail(user?.email)) {
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
    <div className="min-h-screen bg-[#F8FAFC] font-sans selection:bg-primary/20 selection:text-primary relative overflow-hidden">
      {/* Background Magic Touch */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/5 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-[20%] right-[10%] w-[20%] h-[20%] bg-amber-500/5 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '4s' }}></div>
      </div>

      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-2xl border-b border-slate-100/50">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3 group cursor-pointer">
            <motion.div 
              whileHover={{ rotate: 180 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20"
            >
              <LogoIcon size={24} />
            </motion.div>
            <div className="flex flex-col">
              <span className="text-lg font-black tracking-tighter text-slate-900 leading-none">Ordonnance Direct</span>
              <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-1">Burkina Faso</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {profile.role === 'super-admin' && (
              <div className="hidden lg:flex items-center gap-2 bg-emerald-50/50 p-1 rounded-2xl border border-emerald-100/50">
                {(['super-admin', 'patient', 'pharmacist', 'delivery'] as const).map((role) => (
                  <button
                    key={role}
                    onClick={() => setViewMode(role as UserRole)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                      (viewMode === role || (role === 'super-admin' && viewMode === 'super-admin'))
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                        : 'text-emerald-600 hover:bg-emerald-100/50'
                    }`}
                  >
                    {role === 'super-admin' ? 'Admin' : role === 'patient' ? 'Patient' : role === 'pharmacist' ? 'Pharmacie' : 'Livreur'}
                  </button>
                ))}
              </div>
            )}
            {(isSuperAdminEmail(user.email) || profile.role === 'super-admin') && (
              <button 
                onClick={handleSwitchRole}
                className="hidden sm:flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all border border-slate-200"
              >
                <SettingsIcon size={14} /> Changer de rôle
              </button>
            )}
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-black text-slate-900">{profile.name}</span>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                {activeRole === 'patient' ? 'Patient' : 
                 activeRole === 'pharmacist' ? 'Pharmacien' : 
                 activeRole === 'delivery' ? 'Livreur' : 
                 activeRole === 'super-admin' ? 'Super Admin' : 'Administrateur'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell userId={profile.uid} />
              <button onClick={() => setShowLegal(true)} className="px-4 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all border border-slate-100 font-bold text-sm">
                Mentions Légales
              </button>
              <button onClick={handleLogout} className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all border border-slate-100 group">
                <LogOut size={20} className="group-hover:-translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-12 relative z-10">
        <AnimatePresence mode="wait">
          {activeRole === 'patient' && (
            <motion.div
              key="patient"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5, ease: "circOut" }}
            >
              <PatientDashboard profile={effectiveProfile!} settings={settings} location={location} />
            </motion.div>
          )}
          {activeRole === 'pharmacist' && (
            <motion.div
              key="pharmacist"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5, ease: "circOut" }}
            >
              <PharmacistDashboard profile={effectiveProfile!} settings={settings} />
            </motion.div>
          )}
          {activeRole === 'delivery' && (
            <motion.div
              key="delivery"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5, ease: "circOut" }}
            >
              <DeliveryDashboard profile={effectiveProfile!} settings={settings} />
            </motion.div>
          )}
          {(activeRole === 'admin' || activeRole === 'super-admin') && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5, ease: "circOut" }}
            >
              <AdminDashboard profile={effectiveProfile!} settings={settings} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Support Chat FAB */}
      {profile.role !== 'admin' && profile.role !== 'super-admin' && settings?.supportChatEnabled !== false && (
        <>
          <button 
            onClick={() => setShowSupportChat(true)}
            className="fixed bottom-6 right-6 w-16 h-16 bg-primary text-white rounded-full shadow-2xl shadow-primary/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-40"
          >
            <MessageCircle size={28} />
          </button>
          
          <AnimatePresence>
            {showSupportChat && (
              <motion.div 
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                className="fixed bottom-28 right-6 w-80 h-[450px] bg-white rounded-[2rem] shadow-2xl shadow-slate-200/50 border border-slate-100 z-50 overflow-hidden flex flex-col"
              >
                <div className="bg-primary p-6 text-white relative">
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
                      placeholder="Écrivez votre message..." 
                      className="w-full bg-slate-50 border-none rounded-2xl py-3 pl-4 pr-12 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    <button 
                      type="submit"
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-primary text-white rounded-xl flex items-center justify-center hover:bg-primary-dark transition-all"
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

      <footer className="max-w-7xl mx-auto px-4 py-12 border-t border-slate-200 mt-20">
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
              <li><button className="hover:text-primary transition-colors">Comment ça marche ?</button></li>
              <li><button className="hover:text-primary transition-colors">Pharmacies partenaires</button></li>
              <li><button className="hover:text-primary transition-colors">Devenir livreur</button></li>
              <li><button className="hover:text-primary transition-colors">Contactez-nous</button></li>
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
            <button className="hover:text-slate-600">Mentions légales</button>
            <button className="hover:text-slate-600">Confidentialité</button>
          </div>
        </div>
      </footer>

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
          className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-sky-400 rounded-3xl flex items-center justify-center text-white mx-auto mb-8 shadow-2xl shadow-emerald-500/40"
        >
          <LogoIcon size={40} />
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
              <div className="flex justify-end mt-2">
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

        <div className="relative mb-8">
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
    } else if (selectedRole === 'patient' || selectedRole === 'delivery') {
      if (!formData.phone || !formData.address) {
        toast.error("Veuillez remplir tous les champs obligatoires.");
        return;
      }
    }
    
    if (selectedRole) {
      onSelect(selectedRole, {
        authorizationNumber: formData.authNumber,
        phone: formData.phone,
        address: formData.address,
        pharmacyName: formData.pharmacyName
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Abstract Background Elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-secondary/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl"></div>

      <div className="max-w-6xl w-full relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-emerald-500 mx-auto mb-8 shadow-xl border border-emerald-50">
            <LogoIcon size={40} />
          </div>
          <h2 className="text-5xl font-bold mb-4 text-slate-900 tracking-tight text-center">Bienvenue sur Ordonnance Direct</h2>
          <p className="text-slate-500 max-w-md mx-auto font-medium text-lg text-center">Choisissez votre profil pour continuer votre expérience au Burkina Faso.</p>
        </motion.div>

        {!selectedRole ? (
          <div className={`grid grid-cols-1 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-8`}>
            {roles.map((item, i) => (
              <motion.button
                key={item.role}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => setSelectedRole(item.role)}
                className="group relative bg-white p-10 rounded-[3rem] text-left border border-slate-100 shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500"
              >
                <div className={`w-20 h-20 rounded-[2rem] bg-gradient-to-br ${item.color} flex items-center justify-center text-white mb-8 shadow-lg group-hover:scale-110 transition-transform duration-500`}>
                  <item.icon size={36} />
                </div>
                <h3 className="text-2xl font-bold mb-3 text-slate-900">{item.label}</h3>
                <p className="text-slate-500 leading-relaxed mb-8 text-sm">{item.desc}</p>
                
                <div className="flex items-center gap-2 text-primary font-bold text-sm group-hover:gap-4 transition-all">
                  Choisir <ChevronRight size={16} />
                </div>

                {/* Decorative element */}
                <div className={`absolute top-6 right-6 w-12 h-12 rounded-full ${item.light} opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-center justify-center`}>
                  <LogoIcon size={16} className="text-current" />
                </div>
              </motion.button>
            ))}
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md mx-auto bg-white p-10 rounded-[3rem] shadow-2xl border border-slate-100"
          >
            <button 
              onClick={() => setSelectedRole(null)}
              className="text-slate-400 hover:text-slate-600 mb-6 flex items-center gap-2 text-xs font-bold uppercase"
            >
              <X size={14} /> Retour
            </button>
            
            <h3 className="text-2xl font-bold mb-6 text-slate-900">
              {selectedRole === 'pharmacist' ? "Détails de l'officine" : "Confirmation"}
            </h3>
            
            {selectedRole === 'pharmacist' && (
              <div className="space-y-4 mb-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nom de la pharmacie *</label>
                  <input 
                    type="text" 
                    value={formData.pharmacyName}
                    onChange={(e) => setFormData({...formData, pharmacyName: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-900 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                    placeholder="Ex: Pharmacie de la Paix"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Adresse de la pharmacie *</label>
                  <input 
                    type="text" 
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-900 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                    placeholder="Ex: Ouagadougou, Secteur 10"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Numéro d'autorisation *</label>
                  <input 
                    type="text" 
                    value={formData.authNumber}
                    onChange={(e) => setFormData({...formData, authNumber: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-900 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                    placeholder="Ex: AUTH-2024-XXXX"
                    required
                  />
                  <p className="text-[10px] text-slate-400 ml-4 italic">Ce numéro sera vérifié par nos administrateurs.</p>
                </div>
              </div>
            )}

            {(selectedRole === 'patient' || selectedRole === 'delivery') && (
              <div className="space-y-4 mb-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Numéro de téléphone *</label>
                  <input 
                    type="tel" 
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-900 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                    placeholder="Ex: +226 70 00 00 00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Adresse complète *</label>
                  <input 
                    type="text" 
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-900 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                    placeholder="Ex: Ouagadougou, Secteur 10"
                    required
                  />
                </div>
              </div>
            )}
            
            <p className="text-slate-500 mb-8 text-sm leading-relaxed">
              {selectedRole === 'pharmacist' 
                ? "En tant que pharmacien, vous pourrez gérer vos stocks, traiter les ordonnances et recevoir des paiements sécurisés."
                : `Vous avez choisi le profil ${roles.find(r => r.role === selectedRole)?.label}. Souhaitez-vous continuer ?`}
            </p>
            
            <button 
              onClick={handleConfirm}
              className="w-full py-4 bg-primary text-white rounded-2xl font-black text-sm hover:bg-primary/90 transition-all shadow-xl shadow-primary/20"
            >
              Confirmer et continuer
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

// --- Patient Dashboard ---

function PatientDashboard({ profile, settings, location }: { profile: UserProfile, settings: Settings | null, location: { lat: number, lng: number } | null }) {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'prescriptions' | 'orders' | 'pharmacies'>('prescriptions');
  const [hospitalLocation, setHospitalLocation] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPartialSelect, setShowPartialSelect] = useState<Prescription | null>(null);
  const [selectedMeds, setSelectedMeds] = useState<string[]>([]);
  const [showDeliveryConfirm, setShowDeliveryConfirm] = useState<{ orderId: string, fee: number } | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState<Order | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'orange' | 'moov' | 'telecel' | 'card' | 'bank' | null>(null);
  const [paymentPhone, setPaymentPhone] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'method' | 'phone' | 'otp' | 'processing' | 'success'>('method');
  const [paymentOtp, setPaymentOtp] = useState('');
  const [paymentInvoiceId, setPaymentInvoiceId] = useState('');
  const [showMapForOrder, setShowMapForOrder] = useState<Order | null>(null);
  const [pharmacySearch, setPharmacySearch] = useState('');
  const [cities, setCities] = useState<City[]>([]);
  const [rotation, setRotation] = useState<OnCallRotation | null>(null);
  const [viewImage, setViewImage] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

  const handleDeletePrescription = async (id: string) => {
    try {
      // Check if there is a paid order for this prescription
      const associatedOrder = orders.find(o => o.prescriptionId === id);
      const isPaid = associatedOrder && (
        associatedOrder.status === 'paid' || 
        associatedOrder.status === 'preparing' || 
        associatedOrder.status === 'ready' || 
        associatedOrder.status === 'delivering' || 
        associatedOrder.status === 'completed'
      );

      if (isPaid) {
        toast.error("Cette ordonnance a déjà été payée et ne peut plus être supprimée.");
        return;
      }

      await deleteDoc(doc(db, 'prescriptions', id));
      toast.success("Ordonnance supprimée.");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `prescriptions/${id}`);
      toast.error("Erreur lors de la suppression.");
    }
  };

  const handleRequestQuote = async (p: Prescription, type: 'all' | 'partial', meds?: string[]) => {
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
        await updateDoc(doc(db, 'prescriptions', prescriptionId), {
          status: 'submitted',
          lockedBy: null,
          lockedAt: null
        });
      }
      toast.info("Devis rejeté. Votre ordonnance est de nouveau disponible pour d'autres pharmacies.");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'prescriptions'), where('patientId', '==', profile.uid), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPrescriptions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Prescription)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'prescriptions'));
    return () => unsubscribe();
  }, [profile.uid]);

  useEffect(() => {
    const q = query(collection(db, 'orders'), where('patientId', '==', profile.uid), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'orders'));
    return () => unsubscribe();
  }, [profile.uid]);

  useEffect(() => {
    const q = query(collection(db, 'pharmacies'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPharmacies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pharmacy)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'pharmacies'));
    return () => unsubscribe();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Use a slightly smaller image for faster processing and to stay well within Firestore limits
      const base64 = await compressImage(file, 800, 800, 0.6);
      
      // Add the document immediately to Firestore to show it in the UI
      const docRef = await addDoc(collection(db, 'prescriptions'), {
        patientId: profile.uid,
        patientName: profile.name,
        hospitalLocation: hospitalLocation || "Non spécifié",
        patientLocation: location, // Real-time location of the patient
        imageUrl: base64,
        extractedData: "", // Will be updated asynchronously
        status: 'draft',
        createdAt: serverTimestamp(),
        distance: Math.floor(Math.random() * 5) + 1 // Simulating distance in km
      });

      setHospitalLocation('');
      setUploading(false);
      toast.success("Ordonnance ajoutée ! Analyse des médicaments en cours...");

      // Run OCR with Gemini in the background
      (async () => {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: base64.split(',')[1]
                  }
                },
                {
                  text: "Tu es un assistant pharmacien au Burkina Faso. Extrait les noms des médicaments, les dosages et les posologies de cette ordonnance. Réponds en français au format JSON structuré avec une liste d'objets contenant 'nom_article', 'dosage', 'posologie'. Sois très rapide et précis."
                }
              ]
            }
          });
          
          if (response.text) {
            await updateDoc(doc(db, 'prescriptions', docRef.id), {
              extractedData: response.text
            });
            toast.success("Analyse de l'ordonnance terminée !");
          } else {
            throw new Error("Aucun texte extrait de l'ordonnance.");
          }
        } catch (err: any) {
          console.error("Gemini OCR failed:", err);
          toast.error(`L'analyse automatique a échoué: ${err.message || "Erreur inconnue"}. Un pharmacien traitera votre ordonnance manuellement.`);
          await updateDoc(doc(db, 'prescriptions', docRef.id), {
            extractedData: "Erreur d'analyse automatique. Traitement manuel requis."
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

      await updateDoc(doc(db, 'orders', order.id), {
        status: 'paid',
        paymentMethod: method,
        paymentStatus: 'completed',
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

      if (order.prescriptionId) {
        await updateDoc(doc(db, 'prescriptions', order.prescriptionId), {
          status: 'paid',
          lockedBy: null,
          lockedAt: null
        });
      }

      await createNotification(order.patientId, "Paiement confirmé", `Votre paiement de ${totalToPay} FCFA pour la commande #${order.id.slice(-6).toUpperCase()} a été reçu.`, 'payment', order.id);
      if (order.pharmacistId) {
        await createNotification(order.pharmacistId, "Nouveau paiement", `Le patient a payé la commande #${order.id.slice(-6).toUpperCase()}. Vous pouvez commencer la préparation.`, 'payment', order.id);
      }
      
      if (order.deliveryMethod === 'delivery') {
        await notifyDeliveryDrivers("Nouvelle livraison disponible", `Une commande est prête pour livraison à ${order.hospitalLocation}.`, order.id);
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

  const initPayment = async (method: 'orange' | 'moov' | 'telecel' | 'coris') => {
    if (!showPaymentModal) return;
    if (!paymentPhone) {
      toast.error("Veuillez entrer votre numéro de téléphone.");
      return;
    }
    setIsProcessingPayment(true);
    setPaymentStep('processing');
    
    try {
      const response = await fetch('/api/payment/init', {
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
      toast.error("Erreur lors de l'initialisation du paiement.");
      console.error(error);
      setPaymentStep('phone');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const performPayment = async (method: 'orange' | 'moov' | 'telecel' | 'coris') => {
    if (!showPaymentModal || !paymentInvoiceId || !paymentOtp) return;
    setIsProcessingPayment(true);
    setPaymentStep('processing');
    
    try {
      const response = await fetch('/api/payment/perform', {
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

      await updateDoc(doc(db, 'orders', order.id), {
        status: 'paid',
        paymentMethod: method,
        paymentPhone: paymentPhone,
        paymentStatus: 'completed',
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
          status: 'paid',
          timestamp: new Date().toISOString(),
          label: `Paiement effectué via ${method.toUpperCase()}`
        })
      });

      if (order.prescriptionId) {
        await updateDoc(doc(db, 'prescriptions', order.prescriptionId), {
          status: 'paid',
          lockedBy: null,
          lockedAt: null
        });
      }

      await createNotification(order.patientId, "Paiement confirmé", `Votre paiement de ${totalToPay} FCFA pour la commande #${order.id.slice(-6).toUpperCase()} a été reçu.`, 'payment', order.id);
      if (order.pharmacistId) {
        await createNotification(order.pharmacistId, "Nouveau paiement", `Le patient a payé la commande #${order.id.slice(-6).toUpperCase()}. Vous pouvez commencer la préparation.`, 'payment', order.id);
      }
      
      if (order.deliveryMethod === 'delivery') {
        await notifyDeliveryDrivers("Nouvelle livraison disponible", `Une commande est prête pour livraison à ${order.hospitalLocation}.`, order.id);
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
      <div className="space-y-12 pb-20 relative">
      {viewImage && <ImageViewerModal imageUrl={viewImage} onClose={() => setViewImage(null)} />}
      {/* Background Decorative Element */}
      <div className="fixed inset-0 pharmacy-pattern pointer-events-none -z-10"></div>
      
      {/* Pharmacy Header */}
      <div className="bg-emerald-600 rounded-[2rem] p-8 mb-12 relative overflow-hidden shadow-lg shadow-emerald-600/10">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
        <div className="relative flex items-center gap-4 text-white">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
            <Plus size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter uppercase">Portail Patient Santé</h1>
            <p className="text-emerald-100 text-xs font-bold uppercase tracking-widest opacity-80">Services Pharmaceutiques & Livraison</p>
          </div>
        </div>
      </div>

      {/* Welcome & Stats */}
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h2 className="text-4xl font-bold tracking-tight text-slate-900">Bonjour, {profile.name} 👋</h2>
            <p className="text-slate-500 mt-2 text-lg">Gérez vos ordonnances et vos livraisons en toute simplicité.</p>
          </motion.div>
          
          <div className="flex gap-4">
            <div className="medical-card p-6 flex items-center gap-4 min-w-[180px]">
              <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 shadow-lg shadow-emerald-100">
                <FileText size={28} />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ordonnances</p>
                <p className="text-3xl font-black text-slate-900">{prescriptions.length}</p>
              </div>
            </div>
            <div className="medical-card p-6 flex items-center gap-4 min-w-[180px]">
              <div className="w-14 h-14 bg-sky-100 rounded-2xl flex items-center justify-center text-sky-600 shadow-lg shadow-sky-100">
                <Package size={28} />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Commandes</p>
                <p className="text-3xl font-black text-slate-900">{orders.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-col md:flex-row gap-8">
        <div className="w-full md:w-64 flex-shrink-0">
          <div className="sticky top-24 space-y-2 p-3 bg-white rounded-[2.5rem] border border-emerald-100 shadow-xl shadow-emerald-500/5">
            {[
              { id: 'prescriptions', label: 'Ordonnances', icon: FileText, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { id: 'orders', label: 'Commandes', icon: Package, color: 'text-sky-600', bg: 'bg-sky-50' },
              { id: 'pharmacies', label: 'Pharmacies', icon: MapPin, color: 'text-amber-600', bg: 'bg-amber-50' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
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

        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {activeTab === 'prescriptions' && (
                <>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Mes Ordonnances</h3>
                <p className="text-slate-500 text-sm">Envoyez vos ordonnances pour recevoir des devis.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-2xl border border-slate-100 shadow-sm focus-within:border-primary transition-colors">
                  <MapPin size={20} className="text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Hôpital / Clinique (Optionnel)" 
                    value={hospitalLocation}
                    onChange={(e) => setHospitalLocation(e.target.value)}
                    className="bg-transparent outline-none text-sm w-full sm:w-48 font-medium"
                  />
                </div>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="btn-primary flex items-center gap-3 px-8"
                >
                  {uploading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <Camera size={20} />}
                  Scanner une ordonnance
                </button>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" capture="environment" className="hidden" />
            </div>

            {prescriptions.length === 0 ? (
              <div className="bg-white p-20 rounded-[3.5rem] border-2 border-dashed border-slate-100 text-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center text-primary mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                  <FileText size={48} strokeWidth={1.5} />
                </div>
                <p className="text-slate-900 font-black text-2xl mb-2">Aucune ordonnance</p>
                <p className="text-slate-500 text-sm max-w-xs mx-auto">Prenez en photo votre ordonnance pour recevoir des devis de nos pharmacies partenaires.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {prescriptions.map(p => (
                  <motion.div 
                    key={p.id} 
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="medical-card p-8 group"
                  >
                    <div 
                      className="relative aspect-[3/4] rounded-[2rem] overflow-hidden mb-6 bg-slate-50 shadow-inner cursor-pointer"
                      onClick={() => setViewImage(p.imageUrl)}
                    >
                      <img src={p.imageUrl} alt="Prescription" className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-700 ease-out" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                        <Search className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md transition-opacity" size={32} />
                      </div>
                      <div className="absolute top-4 right-4 flex flex-col gap-2 items-end">
                        {(() => {
                          const associatedOrder = orders.find(o => o.prescriptionId === p.id);
                          const displayStatus = associatedOrder ? associatedOrder.status : p.status;
                          
                          return (
                            <span className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-2xl shadow-xl backdrop-blur-md ${
                              displayStatus === 'draft' ? 'bg-slate-500/90 text-white' : 
                              displayStatus === 'submitted' ? 'bg-amber-500/90 text-white' : 
                              displayStatus === 'validated' || displayStatus === 'pending_quote' || displayStatus === 'pending_payment' ? 'bg-emerald-500/90 text-white' : 
                              ['paid', 'preparing', 'ready', 'delivering', 'completed'].includes(displayStatus) ? 'bg-blue-500/90 text-white' :
                              'bg-rose-500/90 text-white'
                            }`}>
                              {displayStatus === 'draft' ? 'Brouillon - À soumettre' : 
                               displayStatus === 'submitted' ? (p.requestType === 'partial' ? 'Analyse en cours (Devis partiel)' : 'Analyse en cours (Devis complet)') : 
                               displayStatus === 'validated' || displayStatus === 'pending_quote' ? 'Devis Établi' : 
                               displayStatus === 'pending_payment' ? 'Attente Paiement' :
                               displayStatus === 'paid' ? 'Payée' :
                               displayStatus === 'preparing' ? 'En préparation' :
                               displayStatus === 'ready' ? 'Prête' :
                               displayStatus === 'delivering' ? 'En livraison' :
                               displayStatus === 'completed' ? 'Livrée' :
                               displayStatus === 'rejected_by_limit' ? 'Rejetée (Limite atteinte)' : 'Refusée'}
                            </span>
                          );
                        })()}
                        {(() => {
                          const associatedOrder = orders.find(o => o.prescriptionId === p.id);
                          const isPaid = associatedOrder && (
                            associatedOrder.status === 'paid' || 
                            associatedOrder.status === 'preparing' || 
                            associatedOrder.status === 'ready' || 
                            associatedOrder.status === 'delivering' || 
                            associatedOrder.status === 'completed'
                          );
                          
                          if (!isPaid) {
                            return (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePrescription(p.id);
                                }}
                                className="w-10 h-10 bg-white/90 backdrop-blur-md text-rose-500 rounded-xl flex items-center justify-center shadow-lg hover:bg-rose-500 hover:text-white transition-all duration-300"
                                title="Supprimer l'ordonnance"
                              >
                                <Trash2 size={18} />
                              </button>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-400 font-bold">{formatDate(p.createdAt, 'date')}</p>
                        <span className="text-[10px] font-black text-primary bg-primary/5 px-3 py-1 rounded-xl">ID: {p.id.slice(-4).toUpperCase()}</span>
                      </div>

                      {p.status === 'rejected_by_limit' && (
                        <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
                          <p className="text-xs text-rose-700 font-bold leading-relaxed">Cette ordonnance a été rejetée par 5 pharmacies. Veuillez contacter le support.</p>
                        </div>
                      )}
                      
                      {!p.extractedData && p.status === 'draft' && (
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex items-center justify-center gap-3">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Analyse en cours...</p>
                        </div>
                      )}
                      
                      {p.extractedData && (
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Médicaments détectés</p>
                          <div className="space-y-2">
                            {(() => {
                              try {
                                const jsonStr = p.extractedData?.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0];
                                if (!jsonStr) return null;
                                const parsed = JSON.parse(jsonStr);
                                const meds = Array.isArray(parsed) ? parsed : (parsed.prescriptions || parsed.medications || parsed.medicaments || Object.values(parsed).find(v => Array.isArray(v)) || []);
                                
                                const displayMeds = p.requestType === 'partial' && p.selectedMedications
                                  ? meds.filter((m: any) => {
                                      const name = typeof m === 'string' ? m : (m.nom_article || m.name || m.medicament);
                                      return p.selectedMedications?.includes(name);
                                    })
                                  : meds;

                                return displayMeds.slice(0, 3).map((m: any, i: number) => {
                                  const name = typeof m === 'string' ? m : (m.nom_article || m.name || m.medicament || 'Médicament inconnu');
                                  return (
                                    <div key={`${name}-${i}`} className="flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 rounded-full bg-primary/40"></div>
                                      <p className="text-xs text-slate-700 font-bold truncate">{name}</p>
                                    </div>
                                  );
                                });
                              } catch (e) { return null; }
                            })()}
                            {p.requestType === 'partial' && (
                              <p className="text-[10px] font-black text-primary mt-2 italic flex items-center gap-1">
                                <Plus size={10} /> Demande partielle
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {p.status === 'draft' && (
                        <div className="flex flex-col gap-3 pt-2">
                          <button 
                            onClick={() => handleRequestQuote(p, 'all')}
                            className="btn-primary w-full py-4 text-sm"
                          >
                            Soumettre pour devis complet
                          </button>
                          <button 
                            onClick={() => {
                              setShowPartialSelect(p);
                              setSelectedMeds(p.selectedMedications || []);
                            }}
                            className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all"
                          >
                            Soumettre pour devis partiel
                          </button>
                        </div>
                      )}

                      {p.status === 'submitted' && (
                        <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100 mt-4">
                          <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center text-white shrink-0">
                            <Clock size={16} />
                          </div>
                          <p className="text-xs text-amber-700 font-medium leading-relaxed">
                            En attente du retour de la pharmacie. Vous recevrez une notification dès qu'un devis sera disponible.
                          </p>
                        </div>
                      )}

                      {p.status === 'validated' && (
                        <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                          <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-white">
                            <CheckCircle size={18} />
                          </div>
                          <p className="text-xs text-emerald-700 font-bold">Prête pour commande</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
                </>
              )}

              {activeTab === 'orders' && (
                <>
                  <h3 className="text-xl font-bold">Suivi de Commandes</h3>
                  {orders.length === 0 ? (
              <div className="bg-white p-20 rounded-[3.5rem] border-2 border-dashed border-slate-100 text-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500 mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                  <Package size={48} strokeWidth={1.5} />
                </div>
                <p className="text-slate-900 font-black text-2xl mb-2">Aucune commande en cours</p>
                <p className="text-slate-500 text-sm max-w-xs mx-auto">Vos commandes en cours de préparation ou de livraison apparaîtront ici.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map(o => (
                  <div key={o.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-secondary/10 rounded-xl flex items-center justify-center text-secondary">
                            <Package size={20} />
                          </div>
                          <div>
                            <h4 className="font-bold">Commande #{o.id.slice(-6).toUpperCase()}</h4>
                            <p className="text-xs text-slate-400">{formatDate(o.createdAt)}</p>
                          </div>
                        </div>
                        <span className={`px-4 py-1 rounded-full text-xs font-bold ${
                          o.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 
                          o.status === 'pending_quote' ? 'bg-amber-100 text-amber-700' : 
                          o.status === 'pending_payment' ? 'bg-amber-100 text-amber-700' : 
                          o.status === 'paid' ? 'bg-blue-100 text-blue-700' :
                          o.status === 'preparing' ? 'bg-indigo-100 text-indigo-700' :
                          o.status === 'ready' ? 'bg-emerald-100 text-emerald-700' :
                          o.status === 'delivering' ? 'bg-secondary/10 text-secondary' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {o.status === 'pending_quote' ? 'DEVIS REÇU - CHOIX DE LIVRAISON' : 
                           o.status === 'pending_payment' ? 'ATTENTE DE PAIEMENT' : 
                           o.status === 'paid' ? 'PAYÉ - PRÉPARATION À COMMENCER' :
                           o.status === 'preparing' ? 'PRÉPARATION EN COURS' :
                           o.status === 'ready' ? 'COMMANDE PRÊTE' :
                           o.status === 'delivering' ? 'LIVRAISON EN COURS' :
                           o.status === 'completed' ? 'LIVRÉE ET TERMINÉE' :
                           'STATUT INCONNU'}
                        </span>
                      </div>
                      
                      {o.prescriptionImageUrl && (
                        <div 
                          className="w-full h-32 rounded-2xl overflow-hidden bg-slate-50 border border-slate-100 mb-4 cursor-pointer relative group"
                          onClick={() => setViewImage(o.prescriptionImageUrl!)}
                        >
                          <img src={o.prescriptionImageUrl} alt="Prescription" className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-700 ease-out" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                            <Search className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md transition-opacity" size={24} />
                          </div>
                        </div>
                      )}

                      <div className="space-y-2 mb-4">
                        {o.items?.map((item, i) => (
                          <div key={`${item.name}-${i}`} className="flex flex-col text-sm bg-slate-50/50 p-3 rounded-2xl border border-slate-100/50">
                            <div className="flex justify-between items-start">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-800">
                                  {item.equivalent ? (
                                    <span className="flex flex-col">
                                      <span className="line-through text-slate-400 text-[10px]">{item.name}</span>
                                      <span className="text-amber-700">{item.equivalent}</span>
                                    </span>
                                  ) : (
                                    item.name
                                  )}
                                </span>
                                <span className="text-[10px] text-slate-500 mt-1">
                                  {item.equivalent ? (
                                    `${(item.equivalentPrice || item.price).toLocaleString()} FCFA x ${item.equivalentQuantity || item.quantity}`
                                  ) : (
                                    `${item.price.toLocaleString()} FCFA x ${item.quantity}`
                                  )}
                                </span>
                              </div>
                              <span className="font-black text-primary">
                                {(item.equivalent ? ((item.equivalentPrice || item.price) * (item.equivalentQuantity || item.quantity)) : (item.price * item.quantity)).toLocaleString()} FCFA
                              </span>
                            </div>
                            {item.equivalent && (
                              <span className="text-[9px] text-amber-600 font-medium italic bg-amber-50 px-2 py-0.5 rounded-full w-fit mt-2 border border-amber-100">
                                Proposé comme équivalent
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                        <div className="flex flex-col">
                          <span className="text-slate-400 text-sm">Total à payer</span>
                          {o.deliveryFee && o.deliveryFee > 0 && (
                            <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest">
                              Inclut {o.deliveryFee} CFA de livraison
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          {['paid', 'preparing', 'ready', 'delivering'].includes(o.status) && (
                            <button 
                              onClick={() => setShowMapForOrder(o)}
                              className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-primary hover:bg-primary/5 transition-all"
                              title="Voir la pharmacie sur la carte"
                            >
                              <MapPin size={20} />
                            </button>
                          )}
                          <span className="text-xl font-bold text-primary">{(o.totalAmount || 0).toLocaleString()} FCFA</span>
                        </div>
                      </div>

                      <StatusTrace history={o.history} />

                      {o.status === 'delivering' && o.deliveryId && (
                        <div className="mt-6 p-6 bg-slate-900 text-white rounded-[2.5rem] shadow-xl shadow-slate-200">
                          <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-4">
                              <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 overflow-hidden border border-slate-700">
                                {o.deliveryPersonPhoto ? (
                                  <img src={o.deliveryPersonPhoto} alt={o.deliveryPersonName} className="w-full h-full object-cover" />
                                ) : (
                                  <Truck size={28} />
                                )}
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Votre livreur</p>
                                <h5 className="text-lg font-bold">{o.deliveryPersonName}</h5>
                                <p className="text-xs text-slate-400">{o.deliveryPersonPhone}</p>
                              </div>
                            </div>
                            <div className="bg-emerald-500/10 text-emerald-400 p-3 rounded-2xl border border-emerald-500/20">
                              <ShieldCheck size={24} />
                            </div>
                          </div>
                          
                          <div className="bg-white/5 p-6 rounded-3xl border border-white/10 text-center">
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-3">Code de livraison à donner au livreur</p>
                            <div className="flex items-center justify-center gap-4">
                              <div className="bg-white text-slate-900 px-6 py-3 rounded-2xl text-3xl font-black tracking-[0.3em]">
                                {o.deliveryCode}
                              </div>
                              <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white">
                                <QrCode size={24} />
                              </div>
                            </div>
                            <p className="mt-4 text-[10px] text-slate-500 italic">Ne donnez ce code qu'une fois la commande reçue et vérifiée.</p>
                          </div>
                        </div>
                      )}

                      {o.status === 'pending_quote' && !o.deliveryMethod && (
                        <div className="mt-6 space-y-3">
                          <p className="text-sm text-amber-800 p-4 bg-amber-50 rounded-2xl border border-amber-100">Un pharmacien a analysé votre ordonnance et vous propose ce devis. Comment souhaitez-vous récupérer vos médicaments ?</p>
                          <div className="grid grid-cols-2 gap-4">
                            <button 
                              onClick={() => handleSelectDeliveryMethod(o.id, 'delivery')}
                              className="flex flex-col items-center gap-3 p-4 bg-white rounded-2xl border border-emerald-200 hover:border-emerald-500 transition-all group"
                            >
                              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                                <Truck size={24} />
                              </div>
                              <span className="text-xs font-bold text-center">Livraison à domicile</span>
                            </button>
                            <button 
                              onClick={() => handleSelectDeliveryMethod(o.id, 'pickup')}
                              className="flex flex-col items-center gap-3 p-4 bg-white rounded-2xl border border-emerald-200 hover:border-emerald-500 transition-all group"
                            >
                              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                                <Package size={24} />
                              </div>
                              <span className="text-xs font-bold text-center">Retrait en pharmacie</span>
                            </button>
                          </div>
                          <button 
                            onClick={() => handleRejectQuote(o.id, o.prescriptionId)}
                            className="w-full py-4 bg-rose-50 text-rose-600 rounded-xl font-bold hover:bg-rose-100 transition-all mt-2"
                          >
                            Rejeter le devis
                          </button>
                        </div>
                      )}

                      {o.status === 'pending_payment' && (
                        <div className="mt-6 space-y-3">
                          <p className="text-sm text-amber-800 p-4 bg-amber-50 rounded-2xl border border-amber-100">Veuillez procéder au paiement pour valider votre commande.</p>
                          <button 
                            onClick={() => handleApproveQuote(o)}
                            className="btn-primary w-full"
                          >
                            Payer {o.totalAmount?.toLocaleString()} FCFA
                          </button>
                        </div>
                      )}

                      {o.status === 'ready' && o.deliveryMethod === 'pickup' && (
                        <div className="mt-6 p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-center gap-4">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 shrink-0">
                            <MapPin size={20} />
                          </div>
                          <p className="text-xs text-blue-800 font-medium">Vous avez choisi le retrait physique. Veuillez vous présenter à la pharmacie avec votre ID de commande.</p>
                        </div>
                      )}
                    </div>

                    <div className="md:w-64 bg-slate-50 p-6 rounded-2xl space-y-4">
                      <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest">État de livraison</h5>
                      <div className="space-y-4">
                        {[
                          { label: 'Devis reçu', done: ['pending_quote', 'pending_payment', 'paid', 'preparing', 'ready', 'delivering', 'completed'].includes(o.status) },
                          { label: 'Payé / Validé', done: ['paid', 'preparing', 'ready', 'delivering', 'completed'].includes(o.status) },
                          { label: 'Préparation', done: ['preparing', 'ready', 'delivering', 'completed'].includes(o.status) },
                          { label: 'En route', done: ['delivering', 'completed'].includes(o.status) },
                          { label: 'Livré', done: o.status === 'completed' },
                        ].map((step) => (
                          <div key={step.label} className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${step.done ? 'bg-emerald-500 text-white' : 'bg-slate-200'}`}>
                              {step.done && <CheckCircle size={12} />}
                            </div>
                            <span className={`text-sm font-medium ${step.done ? 'text-slate-900' : 'text-slate-400'}`}>{step.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
                </>
              )}

              {activeTab === 'pharmacies' && (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold">Pharmacies de Garde</h3>
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
                  
                  // On-call logic
                  const city = cities.find(c => c.id === ph.cityId);
                  if (!city) return matchesSearch; // If no city assigned, just use search filter
                  
                  const isOnCallNow = isCityOnCallNow(city.onCallStartTime, city.onCallEndTime);
                  const currentGroup = rotation ? getCurrentOnCallGroup(rotation.baseMondayDate, rotation.baseGroup) : 1;
                  const isMyGroupOnCall = ph.groupId === currentGroup.toString();

                  // Only show pharmacies that are currently on call
                  return matchesSearch && isOnCallNow && isMyGroupOnCall;
                })
                .sort((a, b) => {
                  if (!location) return 0;
                  const distA = a.location ? calculateDistance(location.lat, location.lng, a.location.lat, a.location.lng) : Infinity;
                  const distB = b.location ? calculateDistance(location.lat, location.lng, b.location.lat, b.location.lng) : Infinity;
                  return distA - distB;
                })
                .map((ph) => {
                  const distance = location && ph.location ? calculateDistance(location.lat, location.lng, ph.location.lat, ph.location.lng) : null;
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
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700`}>
                          Ouvert
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
                      <button className="flex-1 py-2.5 bg-primary/10 text-primary rounded-xl text-sm font-bold hover:bg-primary/20 transition-all">
                        Itinéraire
                      </button>
                    </div>
                  </div>
                );
              })}
              {pharmacies.filter(ph => {
                  const city = cities.find(c => c.id === ph.cityId);
                  if (!city) return true;
                  const isOnCallNow = isCityOnCallNow(city.onCallStartTime, city.onCallEndTime);
                  const currentGroup = rotation ? getCurrentOnCallGroup(rotation.baseMondayDate, rotation.baseGroup) : 1;
                  const isMyGroupOnCall = ph.groupId === currentGroup.toString();
                  return isOnCallNow && isMyGroupOnCall;
                }).length === 0 && (
                <div className="col-span-full bg-white p-20 rounded-[3.5rem] border-2 border-dashed border-slate-100 text-center relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500 mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                    <LogoIcon size={48} />
                  </div>
                  <p className="text-slate-900 font-black text-2xl mb-2">Aucune pharmacie de garde</p>
                  <p className="text-slate-500 text-sm max-w-xs mx-auto">Il n'y a actuellement aucune pharmacie de garde disponible dans votre zone.</p>
                </div>
              )}
            </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Payment Modal */}
      <AnimatePresence>
        {showPaymentModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full p-8 text-center relative overflow-hidden"
            >
              {isProcessingPayment && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="font-bold text-slate-700">Traitement du paiement...</p>
                  <p className="text-xs text-slate-500 mt-2">Veuillez patienter.</p>
                </div>
              )}
              
              <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center text-emerald-600 mx-auto mb-6">
                <CreditCard size={40} />
              </div>
              <h3 className="text-2xl font-bold mb-2">Paiement Sécurisé</h3>
              <p className="text-slate-500 mb-6 text-sm">
                Choisissez votre méthode de paiement pour la commande <span className="font-bold text-slate-900">#{showPaymentModal.id.slice(-6).toUpperCase()}</span>
              </p>
              
              <div className="bg-slate-50 p-4 rounded-2xl mb-8 flex justify-between items-center border border-slate-100">
                <span className="text-slate-600 font-medium">Total à payer</span>
                <span className="text-2xl font-black text-emerald-600">{(showPaymentModal.totalAmount || 0).toLocaleString()} FCFA</span>
              </div>

              <div className="space-y-4">
                {(!settings.paymentConfig || settings.paymentConfig.mobileMoneyEnabled) && !selectedPaymentMethod && (
                  <>
                    <p className="text-left text-sm font-bold text-slate-700 mb-2">Mobile Money</p>
                    <div className="grid grid-cols-3 gap-3">
                      <button 
                        onClick={() => setSelectedPaymentMethod('orange')}
                        className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-slate-100 hover:border-orange-500 hover:bg-orange-50 transition-all gap-2"
                      >
                        <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center text-white font-black text-xl">O</div>
                        <span className="text-xs font-bold text-slate-700">Orange Money</span>
                      </button>
                      <button 
                        onClick={() => setSelectedPaymentMethod('moov')}
                        className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-slate-100 hover:border-blue-600 hover:bg-blue-50 transition-all gap-2"
                      >
                        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-xl">Mo</div>
                        <span className="text-xs font-bold text-slate-700">Moov Money</span>
                      </button>
                      <button 
                        onClick={() => setSelectedPaymentMethod('telecel')}
                        className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-slate-100 hover:border-red-600 hover:bg-red-50 transition-all gap-2"
                      >
                        <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center text-white font-black text-xl">T</div>
                        <span className="text-xs font-bold text-slate-700">Telecel Money</span>
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
                        }} className="p-1 hover:bg-slate-100 rounded-lg"><ChevronRight className="rotate-180" size={16}/></button>
                        Paiement {selectedPaymentMethod.toUpperCase()}
                      </p>
                    </div>
                    
                    {paymentStep === 'method' && (
                      <>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Numéro de téléphone</label>
                          <input 
                            type="tel" 
                            placeholder="Ex: 0102030405"
                            value={paymentPhone}
                            onChange={(e) => setPaymentPhone(e.target.value)}
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold focus:border-primary outline-none transition-all"
                          />
                        </div>

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

                        <button 
                          onClick={() => initPayment(selectedPaymentMethod)}
                          disabled={isProcessingPayment || !paymentPhone}
                          className="btn-primary w-full flex items-center justify-center gap-3"
                        >
                          <Smartphone size={20} />
                          Initier le paiement
                        </button>
                      </>
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

                {(!settings.paymentConfig || settings.paymentConfig.cardEnabled) && !selectedPaymentMethod && (
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
              { id: 'om', name: 'Orange Money', color: 'bg-[#FF6600]', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Orange_logo.svg/1200px-Orange_logo.svg.png', desc: 'Paiement instantané' },
              { id: 'moov', name: 'Moov Money', color: 'bg-[#00529B]', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Moov_Africa_Logo.png/640px-Moov_Africa_Logo.png', desc: 'Simple et rapide' },
              { id: 'sank', name: 'Sank Money', color: 'bg-red-600', logo: 'https://sankmoney.com/wp-content/uploads/2022/10/Logo-Sank-Money-1.png', desc: 'Solution locale' },
              { id: 'card', name: 'Carte Bancaire', color: 'bg-slate-800', icon: CreditCard, desc: 'Visa / Mastercard' },
            ].map((m) => (
              <div key={m.id} className="group relative bg-slate-50 p-6 rounded-[2rem] border-2 border-transparent hover:border-primary/20 hover:bg-white hover:shadow-xl transition-all duration-500 cursor-pointer">
                <div className="flex items-center gap-4 mb-4">
                  <div className={`w-14 h-14 ${m.color} rounded-2xl flex items-center justify-center overflow-hidden p-2 group-hover:scale-110 transition-transform duration-500 shadow-lg`}>
                    {m.logo ? <img src={m.logo} alt={m.name} className="w-full h-full object-contain" /> : <m.icon className="text-white" size={28} />}
                  </div>
                  <div className="flex-1">
                    <span className="block text-sm font-black text-slate-900">{m.name}</span>
                    <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">{m.desc}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400">Frais: 0%</span>
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-primary group-hover:translate-x-1 transition-all" />
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
                  ...(showMapForOrder.deliveryLocation ? [{
                    pos: [showMapForOrder.deliveryLocation.lat, showMapForOrder.deliveryLocation.lng] as [number, number],
                    label: "Livreur",
                    color: "blue",
                    type: 'delivery' as const
                  }] : [])
                ]}
              />

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
  </PullToRefresh>
  );
}

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

// --- Pharmacist Dashboard ---

function PharmacistDashboard({ profile, settings }: { profile: UserProfile, settings: Settings | null }) {
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

  useEffect(() => {
    const q = query(
      collection(db, 'transactions'), 
      where('userId', '==', profile.uid),
      where('userRole', '==', 'pharmacist')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      txs.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      setTransactions(txs.slice(0, 10));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'transactions'));
    return () => unsubscribe();
  }, [profile.uid]);

  useEffect(() => {
    const q = query(
      collection(db, 'withdrawals'),
      where('userId', '==', profile.uid),
      where('userRole', '==', 'pharmacist')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ws = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithdrawalRequest));
      setWithdrawals(ws);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawals'));
    return () => unsubscribe();
  }, [profile.uid]);

  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
  const [quoteItems, setQuoteItems] = useState<{ 
    id: string;
    name: string; 
    price: number; 
    quantity: number; 
    equivalent?: string;
    equivalentPrice?: number;
    equivalentQuantity?: number;
  }[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [showHandoverVerify, setShowHandoverVerify] = useState<Order | null>(null);
  const [pickupCodeInput, setPickupCodeInput] = useState('');
  const [isVerifyingHandover, setIsVerifyingHandover] = useState(false);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [myPharmacy, setMyPharmacy] = useState<Pharmacy | null>(null);
  const [allPharmacies, setAllPharmacies] = useState<Pharmacy[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [rotation, setRotation] = useState<OnCallRotation | null>(null);

  useEffect(() => {
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

  useEffect(() => {
    const q = query(collection(db, 'orders'), where('pharmacistId', '==', profile.uid), where('status', '==', 'completed'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCompletedCount(snapshot.size);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'orders'));
    return () => unsubscribe();
  }, [profile.uid]);

  useEffect(() => {
    const q = query(collection(db, 'prescriptions'), where('status', '==', 'submitted'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allPrescriptions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Prescription));
      
      // Filter prescriptions:
      // 1. Not rejected by this pharmacy
      // 2. Not locked by another pharmacy (or lock expired > 5 mins)
      // 3. Rejection count < 5
      let filtered = allPrescriptions.filter(p => {
        const isRejectedByMe = p.rejectedBy?.includes(profile.uid);
        const isLockedByOther = p.lockedBy && p.lockedBy !== profile.uid;
        const lockExpired = p.lockedAt && (new Date().getTime() - new Date(p.lockedAt.toDate()).getTime() > 5 * 60 * 1000);
        const isTooManyRejections = (p.rejectionCount || 0) >= 5;

        if (isRejectedByMe || isTooManyRejections) return false;
        if (isLockedByOther && !lockExpired) return false;
        
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

  useEffect(() => {
    const q = query(collection(db, 'orders'), where('pharmacistId', '==', profile.uid), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
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
            price: 0,
            quantity: 1,
            equivalent: ''
          }));
        }
      } catch (e) {
        console.error("Failed to parse extracted data", e);
      }
      setQuoteItems(items.length > 0 ? items : [{ id: Math.random().toString(36).substr(2, 9), name: "", price: 0, quantity: 1, equivalent: '' }]);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `prescriptions/${p.id}`);
      toast.error("Impossible de prendre en charge cette ordonnance.");
    }
  };

  const handleSubmitQuote = async () => {
    if (!selectedPrescription) return;

    const totalAmount = quoteItems.reduce((sum, item) => {
      const price = item.equivalent ? (item.equivalentPrice || 0) : item.price;
      const quantity = item.equivalent ? (item.equivalentQuantity || 1) : item.quantity;
      return sum + (price * quantity);
    }, 0);
    
    try {
      // Create Order
      await addDoc(collection(db, 'orders'), {
        prescriptionId: selectedPrescription.id,
        prescriptionImageUrl: selectedPrescription.imageUrl,
        patientId: selectedPrescription.patientId,
        patientName: selectedPrescription.patientName || "Anonyme",
        hospitalLocation: selectedPrescription.hospitalLocation || "Non spécifié",
        patientLocation: selectedPrescription.patientLocation || null,
        pharmacistId: profile.uid,
        pharmacyName: profile.pharmacyName || profile.name,
        pharmacyLocation: profile.pharmacyLocation || "Non spécifiée",
        pharmacyLocationCoords: profile.location || null, // Real-time location of the pharmacy
        status: 'pending_quote',
        items: quoteItems,
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
      await updateDoc(doc(db, 'prescriptions', selectedPrescription.id), {
        status: 'validated',
        lockedBy: null,
        lockedAt: null
      });

      await createNotification(selectedPrescription.patientId, "Devis reçu", `La pharmacie ${profile.pharmacyName || profile.name} a envoyé un devis pour votre ordonnance.`, 'quote_request', selectedPrescription.id);

      setSelectedPrescription(null);
      setActiveTab('active');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'orders');
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
  const currentGroup = rotation ? getCurrentOnCallGroup(rotation.baseMondayDate, rotation.baseGroup) : 1;
  const isMyGroupOnCall = profile.groupId === currentGroup.toString();

  return (
    <PullToRefresh onRefresh={async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success("Données actualisées");
    }}>
      <div className="space-y-12 pb-20">
        {viewImage && <ImageViewerModal imageUrl={viewImage} onClose={() => setViewImage(null)} />}
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
        <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl flex items-center justify-between group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
          <div className="relative z-10">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Gains Disponibles</p>
            <h3 className="text-3xl font-bold text-white">{availableGains.toLocaleString()} <span className="text-sm text-slate-400">FCFA</span></h3>
          </div>
          <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform relative z-10">
            <CreditCard size={28} />
          </div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex items-center justify-between group hover:shadow-xl transition-all duration-500">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
              <Plus size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Gains du jour / Total</p>
              <h3 className="text-xl font-bold text-slate-900">
                {dailyGains.toLocaleString()} / {totalEarned.toLocaleString()} <span className="text-[10px] text-slate-400">FCFA</span>
              </h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex items-center justify-between group hover:shadow-xl transition-all duration-500">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">À Traiter</p>
            <h3 className="text-3xl font-bold text-slate-900">{prescriptions.length}</h3>
          </div>
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
            <FileText size={28} />
          </div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex items-center justify-between group hover:shadow-xl transition-all duration-500">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Commandes traitées</p>
            <h3 className="text-3xl font-bold text-slate-900">{completedCount}</h3>
          </div>
          <div className="w-14 h-14 bg-secondary/10 rounded-2xl flex items-center justify-center text-secondary group-hover:scale-110 transition-transform">
            <Package size={28} />
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        <div className="w-full md:w-64 flex-shrink-0">
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
                onClick={() => setActiveTab(tab.id as any)}
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

        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              {activeTab === 'pending' && (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {prescriptions.length === 0 ? (
              <div className="lg:col-span-2 bg-white p-20 rounded-[3.5rem] border-2 border-dashed border-slate-100 text-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center text-primary mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                  <FileText size={48} strokeWidth={1.5} />
                </div>
                <p className="text-slate-900 font-black text-2xl mb-2">Aucune ordonnance en attente</p>
                <p className="text-slate-500 text-sm max-w-xs mx-auto">Les nouvelles ordonnances soumises par les patients apparaîtront ici.</p>
              </div>
            ) : (
              prescriptions.map(p => (
                <div key={p.id} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col sm:flex-row gap-8">
                  <div 
                    className="sm:w-48 aspect-[3/4] rounded-2xl overflow-hidden bg-slate-50 border border-slate-100 cursor-pointer relative group"
                    onClick={() => setViewImage(p.imageUrl)}
                  >
                    <img src={p.imageUrl} alt="Prescription" className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-700 ease-out" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                      <Search className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md transition-opacity" size={32} />
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col">
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Patient & Lieu</h4>
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            <MapPin size={10} />
                            {p.distance || 2} km
                          </div>
                          {p.requestType === 'partial' && (
                            <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                              Demande Partielle
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm font-bold text-slate-900">{p.patientName || "Anonyme"}</p>
                      <p className="text-xs text-slate-500">{p.hospitalLocation || "Lieu non spécifié"}</p>
                    </div>

                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Analyse Assistée par IA</h4>
                        <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold">Burkina Faso</span>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-2xl text-sm text-slate-600 max-h-48 overflow-auto border border-slate-100">
                        {p.extractedData ? (
                          <div className="space-y-3">
                            {(() => {
                              try {
                                const jsonStr = p.extractedData?.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0];
                                if (!jsonStr) return <p className="italic text-slate-400">Données non structurées</p>;
                                const parsed = JSON.parse(jsonStr);
                                const meds = Array.isArray(parsed) ? parsed : (parsed.prescriptions || parsed.medications || parsed.medicaments || Object.values(parsed).find(v => Array.isArray(v)) || []);
                                
                                const displayMeds = p.requestType === 'partial' && p.selectedMedications
                                  ? meds.filter((m: any) => {
                                      const name = typeof m === 'string' ? m : (m.nom_article || m.name || m.medicament);
                                      return p.selectedMedications?.includes(name);
                                    })
                                  : meds;

                                return displayMeds.map((m: any, i: number) => {
                                  const name = typeof m === 'string' ? m : (m.nom_article || m.name || m.medicament || 'Médicament inconnu');
                                  const dosage = typeof m === 'string' ? '' : (m.dosage || '');
                                  const posologie = typeof m === 'string' ? '' : (m.posologie || '');
                                  return (
                                    <div key={`${name}-${i}`} className="pb-2 border-b border-slate-200 last:border-0">
                                      <p className="font-bold text-slate-800">{name}</p>
                                      {(dosage || posologie) && <p className="text-xs text-slate-500">{dosage} {posologie && `• ${posologie}`}</p>}
                                    </div>
                                  );
                                });
                              } catch (e) {
                                return <p className="text-xs">{p.extractedData}</p>;
                              }
                            })()}
                          </div>
                        ) : "Analyse en cours..."}
                      </div>
                    </div>
                    <div className="mt-auto flex flex-col gap-3">
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 mb-1">
                        <p className="text-[10px] text-amber-700 font-medium flex items-center gap-2">
                          <Clock size={12} />
                          Limite de 5 minutes pour établir le devis après clic.
                        </p>
                      </div>
                      <button 
                        onClick={() => handleStartQuote(p)}
                        className="btn-primary w-full flex items-center justify-center gap-2"
                      >
                        <FileText size={18} />
                        Établir un Devis
                      </button>
                      <button 
                        onClick={() => handleValidatePrescription(p.id, 'rejected')}
                        className="w-full bg-rose-50 text-rose-600 py-3 rounded-2xl font-bold hover:bg-rose-100 transition-all text-sm"
                      >
                        Rejeter l'ordonnance
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
                  </div>
                </>
              )}

              {activeTab === 'active' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {orders.length === 0 ? (
              <div className="lg:col-span-3 bg-white p-20 rounded-[3.5rem] border-2 border-dashed border-slate-100 text-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500 mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                  <Package size={48} strokeWidth={1.5} />
                </div>
                <p className="text-slate-900 font-black text-2xl mb-2">Aucune commande active</p>
                <p className="text-slate-500 text-sm max-w-xs mx-auto">Les commandes payées et en attente de préparation apparaîtront ici.</p>
              </div>
            ) : (
              orders.map(o => (
                <div key={o.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-secondary/10 rounded-lg flex items-center justify-center text-secondary">
                        <Package size={16} />
                      </div>
                      <span className="font-bold text-sm">#{o.id.slice(-6).toUpperCase()}</span>
                    </div>
                    <span className={`text-[10px] font-bold px-3 py-1 rounded-full ${
                      o.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 
                      o.status === 'pending_quote' ? 'bg-amber-100 text-amber-700' : 
                      o.status === 'pending_payment' ? 'bg-amber-100 text-amber-700' : 
                      o.status === 'preparing' ? 'bg-indigo-100 text-indigo-700' :
                      o.status === 'ready' ? 'bg-emerald-100 text-emerald-700' :
                      o.status === 'delivering' ? 'bg-secondary/10 text-secondary' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {o.status === 'pending_quote' ? 'DEVIS ENVOYÉ - ATTENTE VALIDATION' : 
                       o.status === 'pending_payment' ? 'ATTENTE PAIEMENT' : 
                       o.status === 'paid' ? 'PAYÉ - À PRÉPARER' :
                       o.status === 'preparing' ? 'PRÉPARATION EN COURS' :
                       o.status === 'ready' ? 'PRÊT POUR LIVRAISON' :
                       o.status === 'delivering' ? 'LIVRAISON EN COURS' :
                       o.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>

                  {o.prescriptionImageUrl && (
                    <div 
                      className="w-full h-32 rounded-2xl overflow-hidden bg-slate-50 border border-slate-100 mb-6 cursor-pointer relative group"
                      onClick={() => setViewImage(o.prescriptionImageUrl!)}
                    >
                      <img src={o.prescriptionImageUrl} alt="Prescription" className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-700 ease-out" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                        <Search className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md transition-opacity" size={24} />
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-3 mb-8">
                    {o.items?.map((item, i) => (
                      <div key={`${item.name}-${i}`} className="flex flex-col text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-600">
                            {item.equivalent ? (
                              <span className="flex flex-col">
                                <span className="line-through text-slate-400 text-[10px]">{item.name}</span>
                                <span className="font-bold text-amber-700">{item.equivalent} x{item.equivalentQuantity || item.quantity}</span>
                              </span>
                            ) : (
                              `${item.name} x${item.quantity}`
                            )}
                          </span>
                          <span className="font-bold">
                            {(item.equivalent ? (item.equivalentPrice || item.price) : item.price).toLocaleString()} F
                          </span>
                        </div>
                        {item.equivalent && (
                          <span className="text-[9px] text-amber-600 font-medium italic bg-amber-50 px-2 py-0.5 rounded-full w-fit mt-1 border border-amber-100">
                            Équivalent: {item.equivalent}
                          </span>
                        )}
                      </div>
                    ))}
                    <div className="pt-3 border-t border-slate-50 flex flex-col gap-1">
                      <div className="flex justify-between text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                        <span>Votre Gain Net (Médicaments - Commission)</span>
                        <span>{o.pharmacyAmount?.toLocaleString()} FCFA</span>
                      </div>
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
                          onClick={() => setShowHandoverVerify(o)}
                          className="w-full py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
                        >
                          <ShieldCheck size={18} />
                          Vérifier l'identité et remettre
                        </button>
                      </div>
                    )}

                    {o.status === 'ready' && o.deliveryMethod === 'pickup' && (
                      <button 
                        onClick={async () => {
                          const toastId = toast.loading("Confirmation du retrait...");
                          try {
                            const batch = writeBatch(db);
                            const orderRef = doc(db, 'orders', o.id);
                            const pharmacyAmount = o.pharmacyAmount || 0;

                            // 1. Update order status
                            batch.update(orderRef, { 
                              status: 'completed', 
                              updatedAt: serverTimestamp(),
                              history: arrayUnion({
                                status: 'completed',
                                timestamp: new Date().toISOString(),
                                label: 'Commande retirée en pharmacie'
                              })
                            });

                            // 2. Credit Pharmacy Wallet and Update Stats
                            if (pharmacyAmount > 0 && o.pharmacistId) {
                              const pharmacistRef = doc(db, 'users', o.pharmacistId);
                              
                              batch.update(pharmacistRef, {
                                pharmacistBalance: increment(pharmacyAmount),
                                walletBalance: increment(pharmacyAmount)
                              });

                              // 3. Log Transaction
                              const transactionRef = doc(collection(db, 'transactions'));
                              batch.set(transactionRef, {
                                userId: o.pharmacistId,
                                userName: o.pharmacyName || 'Pharmacie',
                                userRole: 'pharmacist',
                                amount: pharmacyAmount,
                                type: 'credit',
                                description: `Gains médicaments (net de commission) pour commande #${o.id.slice(-6).toUpperCase()}`,
                                referenceId: o.id,
                                createdAt: serverTimestamp()
                              });

                              // 4. Create Notification
                              const notificationRef = doc(collection(db, 'notifications'));
                              batch.set(notificationRef, {
                                userId: o.pharmacistId,
                                title: "Paiement reçu",
                                message: `Vous avez reçu ${pharmacyAmount} FCFA (montant net après commission) pour la commande #${o.id.slice(-6).toUpperCase()}.`,
                                type: 'payment',
                                referenceId: o.id,
                                read: false,
                                createdAt: serverTimestamp()
                              });
                            }

                            await batch.commit();
                            console.log(`[DEBUG] Batch commit SUCCESS for order ${o.id}`);
                            toast.success("Retrait confirmé ! Vos gains ont été crédités.", { id: toastId });
                          } catch (err: any) {
                            console.error(`[DEBUG] Batch commit ERROR for order ${o.id}:`, err);
                            if (err.message?.includes('permission-denied')) {
                              console.error("[DEBUG] SECURITY RULE REJECTION detected.");
                            }
                            handleFirestoreError(err, OperationType.UPDATE, `orders/${o.id}`);
                            toast.error("Erreur lors de la confirmation du retrait.", { id: toastId });
                          }
                        }}
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
                        onClick={async () => {
                          try {
                            const nextStatus = o.status === 'paid' ? 'preparing' : 'ready';
                            await updateDoc(doc(db, 'orders', o.id), { 
                              status: nextStatus, 
                              updatedAt: serverTimestamp(),
                              history: arrayUnion({
                                status: nextStatus,
                                timestamp: new Date().toISOString(),
                                label: nextStatus === 'preparing' ? 'Préparation commencée' : 'Commande prête'
                              })
                            });

                            if (nextStatus === 'ready' && o.deliveryMethod === 'delivery') {
                              await notifyDeliveryDrivers(
                                "Nouvelle mission de livraison",
                                `Une commande est prête pour livraison à ${o.pharmacyName || 'la pharmacie'}.`,
                                o.id
                              );
                            }
                          } catch (err) {
                            handleFirestoreError(err, OperationType.UPDATE, `orders/${o.id}`);
                          }
                        }}
                        className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                      >
                        {o.status === 'paid' ? 'Commencer la préparation' : 'Marquer comme prêt'}
                        <ChevronRight size={18} />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
                  </div>
                </>
              )}

        {/* Quote Modal */}
        {selectedPrescription && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-2xl w-full overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold">Établir un Devis</h3>
                  <p className="text-slate-500 text-sm">Patient: {selectedPrescription.patientName || "Anonyme"}</p>
                </div>
                <button onClick={() => setSelectedPrescription(null)} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100">
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>
              
              <div className="p-8 space-y-6 max-h-[60vh] overflow-auto">
                {quoteItems.map((item, index) => (
                  <div key={item.id} className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
                    <div className="grid grid-cols-12 gap-4 items-end">
                      <div className="col-span-6 space-y-1">
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
                      <div className="col-span-3 space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Prix (FCFA)</label>
                        <input 
                          type="number" 
                          value={item.price}
                          onChange={(e) => {
                            const newItems = quoteItems.map(qi => qi.id === item.id ? { ...qi, price: Number(e.target.value) } : qi);
                            setQuoteItems(newItems);
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-primary"
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Qté</label>
                        <input 
                          type="number" 
                          value={item.quantity}
                          onChange={(e) => {
                            const newItems = quoteItems.map(qi => qi.id === item.id ? { ...qi, quantity: Number(e.target.value) } : qi);
                            setQuoteItems(newItems);
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-primary"
                        />
                      </div>
                      <div className="col-span-1">
                        <button 
                          onClick={() => setQuoteItems(quoteItems.filter(qi => qi.id !== item.id))}
                          className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-100"
                        >
                          <Plus size={18} className="rotate-45" />
                        </button>
                      </div>
                    </div>
                    
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
                            value={item.equivalentPrice || 0}
                            onChange={(e) => {
                              const newItems = quoteItems.map(qi => qi.id === item.id ? { ...qi, equivalentPrice: Number(e.target.value) } : qi);
                              setQuoteItems(newItems);
                            }}
                            className="w-full bg-primary/5 border border-primary/20 rounded-xl px-4 py-2 text-sm outline-none focus:border-primary font-bold"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-primary uppercase tracking-widest ml-1">Qté Équivalent</label>
                          <input 
                            type="number" 
                            value={item.equivalentQuantity || 1}
                            onChange={(e) => {
                              const newItems = quoteItems.map(qi => qi.id === item.id ? { ...qi, equivalentQuantity: Number(e.target.value) } : qi);
                              setQuoteItems(newItems);
                            }}
                            className="w-full bg-primary/5 border border-primary/20 rounded-xl px-4 py-2 text-sm outline-none focus:border-primary font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                <button 
                  onClick={() => setQuoteItems([...quoteItems, { id: Math.random().toString(36).substr(2, 9), name: "", price: 0, quantity: 1, equivalent: '' }])}
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
                        const price = item.equivalent ? (item.equivalentPrice || 0) : item.price;
                        const quantity = item.equivalent ? (item.equivalentQuantity || 1) : item.quantity;
                        return sum + (price * quantity);
                      }, 0).toLocaleString()} FCFA
                    </p>
                  </div>
                  <div className="pl-8 border-l border-slate-200">
                    <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest mb-1">Votre Gain Net</p>
                    <p className="text-2xl font-black text-emerald-600">
                      {Math.floor(quoteItems.reduce((sum, item) => {
                        const price = item.equivalent ? (item.equivalentPrice || 0) : item.price;
                        const quantity = item.equivalent ? (item.equivalentQuantity || 1) : item.quantity;
                        return sum + (price * quantity);
                      }, 0) * (1 - (settings?.commissionPercentage || 10) / 100)).toLocaleString()} FCFA
                    </p>
                  </div>
                </div>
                <button 
                  onClick={handleSubmitQuote}
                  className="btn-primary px-10 w-full md:w-auto"
                >
                  Envoyer le Devis
                </button>
              </div>
            </motion.div>
          </div>
        )}

              {activeTab === 'history' && (
                <>
                  <div className="space-y-6">
            {historyOrders.length === 0 ? (
              <div className="bg-white p-20 rounded-[3.5rem] border-2 border-dashed border-slate-100 text-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                  <Clock size={48} strokeWidth={1.5} />
                </div>
                <p className="text-slate-900 font-black text-2xl mb-2">Historique vide</p>
                <p className="text-slate-500 text-sm max-w-xs mx-auto">Les commandes terminées ou annulées apparaîtront ici.</p>
              </div>
            ) : (
              historyOrders.map(o => (
                <div key={o.id} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                  <div className="flex flex-col md:flex-row justify-between gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                          <CheckCircle size={24} />
                        </div>
                        <div>
                          <h4 className="text-lg font-bold">Commande #{o.id.slice(-6).toUpperCase()}</h4>
                          <p className="text-sm text-slate-500">Terminée le {o.updatedAt ? formatDate(o.updatedAt, 'date') : 'Date inconnue'}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
                        <div className="space-y-3">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Détails Client</p>
                          <p className="font-bold text-slate-900">{o.patientName}</p>
                          <p className="text-sm text-slate-500">{o.hospitalLocation}</p>
                          
                          {o.prescriptionImageUrl && (
                            <div 
                              className="w-full h-24 mt-4 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 cursor-pointer relative group"
                              onClick={() => setViewImage(o.prescriptionImageUrl!)}
                            >
                              <img src={o.prescriptionImageUrl} alt="Prescription" className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-700 ease-out" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                                <Search className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md transition-opacity" size={20} />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="space-y-3">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Articles</p>
                          {o.items?.map((item, i) => (
                            <div key={`${item.name}-${i}`} className="flex justify-between text-sm">
                              <span className="text-slate-600">
                                {item.equivalent ? (
                                  <span className="flex flex-col">
                                    <span className="line-through text-slate-400 text-[10px]">{item.name}</span>
                                    <span className="font-bold text-amber-700">{item.equivalent}</span>
                                  </span>
                                ) : item.name}
                              </span>
                              <span className="font-bold">x{item.equivalent ? (item.equivalentQuantity || item.quantity) : item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    <div className="md:w-64 bg-slate-50 p-6 rounded-3xl border border-slate-100 flex flex-col justify-between">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Votre Gain Net</p>
                        <p className="text-2xl font-bold text-emerald-600">{o.pharmacyAmount?.toLocaleString()} FCFA</p>
                      </div>
                      <div className="mt-4 pt-4 border-t border-slate-200">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Statut Final</p>
                        <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs">
                          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                          LIVRÉ / TERMINÉ
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Order Status Tracking Timeline */}
                  <div className="mt-8 pt-8 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Suivi des étapes</p>
                    <div className="flex flex-wrap gap-4">
                      {o.history?.map((step: any, i: number) => (
                        <div key={`${step.timestamp}-${i}`} className="flex items-center gap-3">
                          <div className="flex flex-col items-center">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              i === (o.history.length - 1) ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-600'
                            }`}>
                              {i + 1}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900">{step.label}</p>
                            <p className="text-[10px] text-slate-500">{formatDate(step.timestamp, 'time')}</p>
                          </div>
                          {i < (o.history.length - 1) && (
                            <ChevronRight size={14} className="text-slate-300 mx-2" />
                          )}
                        </div>
                      ))}
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
            <div className="bg-emerald-600 text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden">
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
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Handover Verify Modal */}
      <AnimatePresence>
        {showHandoverVerify && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full p-8 text-center"
            >
              <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 mx-auto mb-6">
                <ShieldCheck size={32} />
              </div>
              <h3 className="text-2xl font-bold mb-2">Vérification d'Identité</h3>
              <p className="text-slate-500 mb-6 text-sm">Assurez-vous que la personne devant vous correspond à ce profil avant de remettre la commande.</p>
              
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-8 flex items-center gap-4 text-left">
                <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center text-slate-400 overflow-hidden border border-slate-200 shrink-0">
                  {showHandoverVerify.deliveryPersonPhoto ? (
                    <img src={showHandoverVerify.deliveryPersonPhoto} alt={showHandoverVerify.deliveryPersonName} className="w-full h-full object-cover" />
                  ) : (
                    <Truck size={24} />
                  )}
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-lg">{showHandoverVerify.deliveryPersonName}</p>
                  <p className="text-sm text-slate-500">{showHandoverVerify.deliveryPersonPhone}</p>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-left">Code de retrait du livreur</p>
                <input 
                  type="text" 
                  maxLength={6}
                  placeholder="Code à 6 chiffres"
                  value={pickupCodeInput}
                  onChange={(e) => setPickupCodeInput(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-center text-3xl font-bold tracking-[0.2em] outline-none focus:border-amber-500 transition-all"
                />
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={async () => {
                    if (pickupCodeInput === showHandoverVerify.pickupCode) {
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
                <button 
                  onClick={() => {
                    setShowHandoverVerify(null);
                    setPickupCodeInput('');
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
);
}

// --- Delivery Dashboard ---

function DeliveryDashboard({ profile, settings }: { profile: UserProfile, settings: Settings | null }) {
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

  useEffect(() => {
    const q = query(
      collection(db, 'orders'), 
      where('status', 'in', ['pending_payment', 'paid', 'preparing', 'ready', 'delivering'])
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Filter and sort in JS to avoid composite index requirement
      const allMissions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      
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
      where('userId', '==', profile.uid),
      where('userRole', '==', 'delivery')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      txs.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      setTransactions(txs.slice(0, 10));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'transactions'));
    return () => unsubscribe();
  }, [profile.uid]);

  useEffect(() => {
    const q = query(
      collection(db, 'withdrawals'),
      where('userId', '==', profile.uid),
      where('userRole', '==', 'delivery')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ws = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithdrawalRequest));
      setWithdrawals(ws);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawals'));
    return () => unsubscribe();
  }, [profile.uid]);

  const [completedMissionsCount, setCompletedMissionsCount] = useState(0);
  const [showMapForOrder, setShowMapForOrder] = useState<Order | null>(null);

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
      where('status', '==', 'completed'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      
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
      <div className="space-y-12 pb-20">
        {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl flex items-center justify-between group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
          <div className="relative z-10">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Gains Disponibles</p>
            <h3 className="text-3xl font-bold text-white">{availableGains.toLocaleString()} <span className="text-sm text-slate-400">FCFA</span></h3>
          </div>
          <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform relative z-10">
            <CreditCard size={32} />
          </div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex items-center justify-between group hover:shadow-xl transition-all duration-500">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
              <Plus size={28} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Gains du jour / Total</p>
              <h3 className="text-2xl font-bold text-slate-900">
                {dailyGains.toLocaleString()} / {totalEarned.toLocaleString()} <span className="text-xs text-slate-400">FCFA</span>
              </h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex items-center justify-between group hover:shadow-xl transition-all duration-500">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
              <Truck size={28} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Livraisons terminées</p>
              <h3 className="text-2xl font-bold text-slate-900">{completedMissionsCount}</h3>
            </div>
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

      <div className="flex flex-col md:flex-row gap-8">
        <div className="w-full md:w-64 flex-shrink-0">
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
                onClick={() => setActiveTab(tab.id as any)}
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

        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {activeTab === 'available' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {availableMissions.length === 0 ? (
              <div className="md:col-span-2 lg:col-span-3 bg-white p-20 rounded-[3.5rem] border-2 border-dashed border-slate-100 text-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="w-24 h-24 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500 mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                  <Truck size={48} strokeWidth={1.5} />
                </div>
                <p className="text-slate-900 font-black text-2xl mb-2">Aucune mission</p>
                <p className="text-slate-500 text-sm max-w-xs mx-auto">Les nouvelles commandes prêtes à être livrées apparaîtront ici.</p>
              </div>
            ) : (
              availableMissions.map(m => (
                <div key={m.id} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-all">
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                      <MapPin size={24} />
                    </div>
                    <div className="text-right">
                      <span className="text-xl font-bold text-emerald-600 block">+{m.deliveryFee || 1500} FCFA</span>
                      {m.status === 'pending_payment' && (
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-tighter">Attente Paiement</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-4 mb-8">
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-primary"></div>
                        <div className="w-0.5 h-8 bg-slate-100"></div>
                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      </div>
                      <div className="flex flex-col gap-4">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Départ (Pharmacie)</p>
                          <p className="font-bold text-slate-800">{m.pharmacyName || "Pharmacie Partenaire"}</p>
                          <p className="text-xs text-slate-500">{m.pharmacyLocation || "Ouagadougou"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Arrivée (Patient)</p>
                          <p className="font-bold text-slate-800">{m.patientName}</p>
                          <p className="text-xs text-slate-500">{m.hospitalLocation}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-4 pt-4 border-t border-slate-50">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Clock size={14} /> 15 min
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Package size={14} /> {m.items?.length || 0} articles
                      </div>
                    </div>
                  </div>

                  <StatusTrace history={m.history} />

                  <div className="flex gap-3">
                    <button 
                      onClick={async () => {
                        try {
                          await updateDoc(doc(db, 'orders', m.id), { 
                            deliveryId: profile.uid,
                            deliveryPersonName: profile.name,
                            deliveryPersonPhone: profile.phone || "Non spécifié",
                            deliveryPersonPhoto: profile.photoUrl || null,
                            pickupCode: generateCode(),
                            deliveryCode: generateCode(),
                            isHandedOver: false,
                            updatedAt: serverTimestamp(),
                            history: arrayUnion({
                              status: m.status, // Keep current status
                              timestamp: new Date().toISOString(),
                              label: 'Mission acceptée par le livreur'
                            })
                          });
                        } catch (err) {
                          handleFirestoreError(err, OperationType.UPDATE, `orders/${m.id}`);
                        }
                      }}
                      className="btn-primary flex-1"
                    >
                      Accepter
                    </button>
                    <button 
                      onClick={() => handleRejectMission(m.id)}
                      className="px-6 py-4 bg-rose-50 text-rose-600 rounded-2xl font-bold hover:bg-rose-100 transition-all"
                    >
                      Refuser
                    </button>
                  </div>
                </div>
              ))
            )}
                  </div>
                </>
              )}

              {activeTab === 'active' && (
                <>
                  <div className="space-y-6">
            {activeMissions.length === 0 ? (
              <div className="bg-white p-20 rounded-[3.5rem] border-2 border-dashed border-slate-100 text-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500 mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                  <Truck size={48} strokeWidth={1.5} />
                </div>
                <p className="text-slate-900 font-black text-2xl mb-2">Aucune livraison en cours</p>
                <p className="text-slate-500 text-sm max-w-xs mx-auto">Acceptez une mission pour commencer une livraison.</p>
              </div>
            ) : (
              activeMissions.map(m => (
                <div key={m.id} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row gap-8">
                  <div className="flex-1 space-y-6">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xl font-bold">Livraison #{m.id.slice(-6).toUpperCase()}</h4>
                      <span className={`px-4 py-1 rounded-full text-xs font-bold uppercase ${
                        m.status === 'pending_payment' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {m.status === 'pending_payment' ? 'Attente Paiement' : 'En cours'}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="flex gap-3">
                          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500">
                            <MapPin size={20} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-400 uppercase">Adresse de livraison</p>
                            <p className="font-medium">Secteur 15, Rue 15.22, Porte 102</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500">
                            <Phone size={20} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-400 uppercase">Contact client</p>
                            <p className="font-medium">+226 70 00 00 00</p>
                          </div>
                        </div>
                      </div>
                      <div className="bg-slate-50 p-6 rounded-2xl">
                        <h5 className="text-xs font-bold text-slate-400 uppercase mb-3">Résumé commande</h5>
                        <div className="space-y-2">
                          {m.items?.map((item, i) => (
                            <div key={`${item.name}-${i}`} className="flex justify-between text-sm">
                              <span className="text-slate-600">
                                {item.equivalent ? (
                                  <span className="flex flex-col">
                                    <span className="line-through text-slate-400 text-[10px]">{item.name}</span>
                                    <span className="font-bold text-amber-700">{item.equivalent}</span>
                                  </span>
                                ) : item.name}
                              </span>
                              <span className="font-bold">x{item.equivalent ? (item.equivalentQuantity || item.quantity) : item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="md:w-72 flex flex-col gap-3">
                    {!m.isHandedOver ? (
                      <button 
                        onClick={() => setShowPickupQR(m)}
                        className="w-full py-4 bg-amber-500 text-white rounded-2xl font-bold hover:bg-amber-600 transition-all shadow-lg shadow-amber-100 flex items-center justify-center gap-2"
                      >
                        <QrCode size={18} />
                        Code de Retrait (Pharmacie)
                      </button>
                    ) : (
                      <button 
                        onClick={() => setShowDeliveryVerify(m)}
                        className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
                      >
                        <ShieldCheck size={18} />
                        Confirmer la Livraison
                      </button>
                    )}
                    <button 
                      onClick={() => setShowMapForOrder(m)}
                      className="w-full py-4 bg-slate-100 text-slate-700 rounded-2xl font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                    >
                      <Search size={18} /> Voir sur la carte
                    </button>
                  </div>
                </div>
              ))
            )}
                  </div>
                </>
              )}

      {activeTab === 'history' && (
        <>
          <div className="space-y-6">
          <h3 className="text-2xl font-black text-slate-900 px-4">Historique des Missions</h3>
          {historyMissions.length === 0 ? (
            <div className="bg-white p-20 rounded-[3.5rem] border-2 border-dashed border-slate-100 text-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-slate-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                <Clock size={48} strokeWidth={1.5} />
              </div>
              <p className="text-slate-900 font-black text-2xl mb-2">Historique vide</p>
              <p className="text-slate-500 text-sm max-w-xs mx-auto">Les livraisons terminées apparaîtront ici.</p>
            </div>
          ) : (
            historyMissions.map(m => (
              <div key={m.id} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row gap-8 opacity-75">
                <div className="flex-1 space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xl font-bold">Livraison #{m.id.slice(-6).toUpperCase()}</h4>
                    <span className="px-4 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold uppercase flex items-center gap-1">
                      <CheckCircle size={14} /> Terminée
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500">
                          <MapPin size={20} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase">Adresse de livraison</p>
                          <p className="font-medium text-slate-600">Secteur 15, Rue 15.22, Porte 102</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500">
                          <Phone size={20} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase">Contact client</p>
                          <p className="font-medium text-slate-600">+226 70 00 00 00</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-2xl">
                      <h5 className="text-xs font-bold text-slate-400 uppercase mb-3">Détails</h5>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Date</span>
                          <span className="font-bold">{m.createdAt ? formatDate(m.createdAt, 'date') : 'Date inconnue'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Gain</span>
                          <span className="font-bold text-emerald-600">+{m.deliveryFee || 1500} FCFA</span>
                        </div>
                      </div>
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
                        const base64 = await compressImage(file, 512, 512, 0.8);
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
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

  {/* Pickup QR Modal */}
  <AnimatePresence>
    {showPickupQR && (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full p-8 text-center"
        >
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 mx-auto mb-6">
            <QrCode size={32} />
          </div>
          <h3 className="text-2xl font-bold mb-2">Code de Retrait</h3>
          <p className="text-slate-500 mb-8 text-sm">Montrez ce code au pharmacien pour récupérer la commande.</p>
          
          <div className="bg-slate-50 p-8 rounded-3xl mb-8 flex flex-col items-center justify-center border border-slate-100">
            <QRCodeCanvas value={showPickupQR.pickupCode || ""} size={200} />
            <p className="mt-6 text-4xl font-black tracking-[0.5em] text-slate-900">{showPickupQR.pickupCode}</p>
          </div>

          <button 
            onClick={() => setShowPickupQR(null)}
            className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold"
          >
            Fermer
          </button>
        </motion.div>
      </div>
    )}
  </AnimatePresence>

  {/* Delivery Verify Modal */}
  <AnimatePresence>
    {showDeliveryVerify && (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full p-8 text-center"
        >
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mx-auto mb-6">
            <ShieldCheck size={32} />
          </div>
          <h3 className="text-2xl font-bold mb-2">Vérification Patient</h3>
          <p className="text-slate-500 mb-8 text-sm">Demandez le code de livraison au patient pour finaliser.</p>
          
          <div className="space-y-4 mb-8">
            <input 
              type="text" 
              maxLength={6}
              placeholder="Entrez le code à 6 chiffres"
              value={deliveryCodeInput}
              onChange={(e) => setDeliveryCodeInput(e.target.value)}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-center text-3xl font-bold tracking-[0.2em] outline-none focus:border-primary transition-all"
            />
          </div>

          <div className="flex flex-col gap-3">
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

                    // 2. Confirm Delivery and Finish Mission
                    batch.update(orderRef, { 
                      status: 'completed', 
                      updatedAt: serverTimestamp(),
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
          
          <MapComponent 
            center={showMapForOrder.deliveryLocation ? [showMapForOrder.deliveryLocation.lat, showMapForOrder.deliveryLocation.lng] : [12.3714, -1.5197]}
            markers={[
              { 
                pos: showMapForOrder.deliveryLocation ? [showMapForOrder.deliveryLocation.lat, showMapForOrder.deliveryLocation.lng] : [12.3714, -1.5197], 
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
  </PullToRefresh>
);
};
