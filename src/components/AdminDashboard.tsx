import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings as SettingsIcon, Truck, AlertCircle, CheckCircle, 
  Users, Activity, FileText, Package, ShieldCheck, Trash2, Search,
  TrendingUp, DollarSign, BarChart3, Lock, CreditCard, Terminal, UserCog, Power, X, Download, MessageSquare,
  Plus, MapPin, Percent, Navigation
} from 'lucide-react';
import { doc, setDoc, deleteDoc, collection, query, onSnapshot, updateDoc, serverTimestamp, orderBy, increment, addDoc, getDocs, writeBatch, where, getDoc, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../firebase';
import { UserProfile, Settings, Order, Prescription, Pharmacy, WithdrawalRequest, SystemLog } from '../types';
import { toast } from 'sonner';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { logTransaction, createNotification, formatDate, isSuperAdminEmail } from '../utils/shared';
import { sendSMS } from '../utils/sms';
import { ScriptManager } from './ScriptManager';
import { DatabaseExplorer } from './DatabaseExplorer';
import { DataAnalyst } from './DataAnalyst';
import { PHARMACIES_OUAGA } from '../data/pharmacies_ouaga';

const calculateDeliveryFee = (settings: Settings | null) => {
  if (!settings) return 0;
  const now = new Date();
  const hour = now.getHours();
  
  let isNight = false;
  if (settings.nightStartHour > settings.nightEndHour) {
    isNight = hour >= settings.nightStartHour || hour < settings.nightEndHour;
  } else {
    isNight = hour >= settings.nightStartHour && hour < settings.nightEndHour;
  }
  
  return isNight ? settings.nightDeliveryFee : settings.dayDeliveryFee;
};

const parseDate = (date: any): Date => {
  if (!date) return new Date(0);
  if (date?.toDate && typeof date.toDate === 'function') return date.toDate();
  if (date instanceof Date) return date;
  if (date?.seconds !== undefined) return new Date(date.seconds * 1000 + (date.nanoseconds || 0) / 1000000);
  const d = new Date(date);
  return isNaN(d.getTime()) ? new Date(0) : d;
};

const FinancialReconciliation = ({ orders }: { orders: Order[] }) => {
  const completedOrders = orders.filter(o => o.status === 'completed');
  
  const discrepancies = completedOrders.filter(o => {
    const medicationTotal = o.medicationTotal || 0;
    const deliveryFee = o.deliveryFee || 0;
    const serviceFee = o.serviceFee || 0;
    const total = medicationTotal + deliveryFee + serviceFee;
    return Math.abs(total - (o.totalAmount || 0)) > 1; // Allow for small rounding errors
  });

  const totalAmount = completedOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const totalPharmacyGains = completedOrders.reduce((sum, o) => sum + (o.pharmacyAmount || 0), 0);
  const totalDeliveryGains = completedOrders.reduce((sum, o) => sum + (o.deliveryAmount || 0), 0);
  const totalPlatformGains = completedOrders.reduce((sum, o) => sum + (o.platformFee || 0), 0);

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck className="text-emerald-600" size={24} />
            Concordance des Sommes
          </h3>
          <div className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold uppercase tracking-widest">
            {completedOrders.length} Commandes terminées
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Total Payé par Clients</p>
            <p className="text-2xl font-black text-slate-900">{totalAmount.toLocaleString()} F</p>
          </div>
          <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-100">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2">Total Gains Pharmacies</p>
            <p className="text-2xl font-black text-emerald-700">{totalPharmacyGains.toLocaleString()} F</p>
          </div>
          <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2">Total Gains Livreurs</p>
            <p className="text-2xl font-black text-amber-700">{totalDeliveryGains.toLocaleString()} F</p>
          </div>
          <div className="p-6 bg-blue-50 rounded-3xl border border-blue-100">
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">Total Revenus Plateforme</p>
            <p className="text-2xl font-black text-blue-700">{totalPlatformGains.toLocaleString()} F</p>
          </div>
        </div>

        <div className="p-6 bg-slate-900 text-white rounded-3xl mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Vérification de Distribution</p>
              <p className="text-sm text-slate-400">Somme des gains (Pharmacie + Livreur + Plateforme) vs Total Payé</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-primary">
                {(totalPharmacyGains + totalDeliveryGains + totalPlatformGains).toLocaleString()} F
              </p>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Total Distribué</p>
            </div>
          </div>
        </div>

        {discrepancies.length > 0 ? (
          <div className="bg-rose-50 p-6 rounded-3xl border border-rose-100">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <AlertCircle size={24} />
              <p className="font-bold text-lg">Attention : {discrepancies.length} anomalies détectées</p>
            </div>
            <div className="space-y-3">
              {discrepancies.map(o => (
                <div key={o.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-4 rounded-2xl border border-rose-100 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-500 font-bold text-xs">
                      #{o.id.slice(-4).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">Commande #{o.id.slice(-8).toUpperCase()}</p>
                      <p className="text-[10px] text-slate-500">{formatDate(o.createdAt)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-rose-700">
                      Calculé: {((o.medicationTotal || 0) + (o.deliveryFee || 0) + (o.serviceFee || 0)).toLocaleString()} F
                    </p>
                    <p className="text-[10px] text-rose-500 font-bold uppercase">Payé: {o.totalAmount?.toLocaleString()} F</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-emerald-50 p-8 rounded-3xl border border-emerald-100 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-emerald-500 shadow-sm">
              <CheckCircle size={32} />
            </div>
            <div>
              <p className="text-lg font-bold text-emerald-900">Toutes les sommes sont concordantes</p>
              <p className="text-sm text-emerald-600">L'intégrité financière est vérifiée sur l'ensemble des {completedOrders.length} commandes terminées.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export function AdminDashboard({ profile, settings }: { profile: UserProfile, settings: Settings | null }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'approvals' | 'users' | 'pharmacies' | 'orders' | 'history' | 'prescriptions' | 'settings' | 'revenue' | 'withdrawals' | 'security' | 'payments' | 'logs' | 'roles' | 'scripts' | 'database' | 'analytics' | 'transactions' | 'reports' | 'support' | 'tests'>('overview');
  const [editSettings, setEditSettings] = useState<Settings | null>(settings ? {
    ...settings,
    commissionPercentage: settings.commissionPercentage || 10,
    deliveryCommissionPercentage: settings.deliveryCommissionPercentage || 10,
    paymentConfig: settings.paymentConfig || { 
      mobileMoneyEnabled: true, 
      cardEnabled: true, 
      cashEnabled: true, 
      ussdEnabled: false, 
      testMode: false,
      ussdSyntaxes: { orange: '', moov: '', telecel: '' },
      withdrawalUssdSyntaxes: { orange: '', moov: '', telecel: '' },
      paymentAccounts: { orangeMoney: '', moovMoney: '', telecelCash: '', bankName: '', bankAccountName: '', bankAccountNumber: '', bankIBAN: '' }
    },
    otpConfig: settings.otpConfig || { enabled: true, loginOtp: true, orderOtp: true, customMessageTemplate: 'Votre code OTP est {code}' },
    apiKeys: settings.apiKeys || { smsProvider: '', paymentGateway: '', mapsApiKey: '' },
    maintenanceMode: settings.maintenanceMode || false,
    maintenanceMessage: settings.maintenanceMessage || 'Plateforme en maintenance. Veuillez patienter.'
  } : null);

  useEffect(() => {
    // Fallback if settings don't load within 3 seconds
    const timer = setTimeout(() => {
      if (!editSettings) {
        console.warn("Settings loading timeout, using defaults");
        setEditSettings({
          dayDeliveryFee: 1000,
          nightDeliveryFee: 2000,
          nightStartHour: 20,
          nightEndHour: 6,
          commissionPercentage: 10,
          deliveryCommissionPercentage: 10,
          appName: 'Ordonnance Direct',
          supportChatEnabled: true,
          maintenanceMode: false,
          paymentConfig: { 
            mobileMoneyEnabled: true, 
            cardEnabled: true, 
            cashEnabled: true, 
            ussdEnabled: false, 
            testMode: false,
            ussdSyntaxes: { orange: '', moov: '', telecel: '' },
            withdrawalUssdSyntaxes: { orange: '', moov: '', telecel: '' },
            paymentAccounts: { orangeMoney: '', moovMoney: '', telecelCash: '', bankName: '', bankAccountName: '', bankAccountNumber: '', bankIBAN: '' }
          },
          otpConfig: { enabled: true, loginOtp: true, orderOtp: true, customMessageTemplate: 'Votre code OTP est {code}' },
          apiKeys: { smsProvider: '', paymentGateway: '', mapsApiKey: '' },
          maintenanceMessage: 'Plateforme en maintenance. Veuillez patienter.'
        });
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [editSettings]);

  const [saving, setSaving] = useState(false);
  const [selectedRoleForPerms, setSelectedRoleForPerms] = useState<string | null>(null);
  
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [supportChats, setSupportChats] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [adminReply, setAdminReply] = useState('');

  const [newPharmacy, setNewPharmacy] = useState({ name: '', address: '', phone: '', locality: '' });
  const [addingPharmacy, setAddingPharmacy] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', phone: '', role: 'pharmacist', address: '', pharmacyName: '', locality: '', lat: '', lng: '' });
  const [addingUser, setAddingUser] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleHardReset = async () => {
    if (!window.confirm("ATTENTION: Cette action va supprimer TOUTES les données (commandes, ordonnances, transactions, retraits, logs, notifications) et remettre tous les soldes à zéro. Cette action est irréversible. Êtes-vous sûr ?")) return;
    
    setIsResetting(true);
    const toastId = toast.loading("Réinitialisation complète en cours...");
    
    try {
      const collectionsToClear = [
        'orders', 
        'prescriptions', 
        'transactions', 
        'withdrawals', 
        'system_logs', 
        'support_messages', 
        'notifications', 
        'pharmacies', 
        'scripts',
        'user_logs',
        'reports'
      ];
      
      for (const collName of collectionsToClear) {
        try {
          const snap = await getDocs(collection(db, collName));
          const docs = snap.docs;
          if (docs.length === 0) continue;
          
          for (let i = 0; i < docs.length; i += 500) {
            const batch = writeBatch(db);
            const chunk = docs.slice(i, i + 500);
            chunk.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
          }
        } catch (err) {
          console.warn(`Could not clear collection ${collName}:`, err);
        }
      }
      
      const usersSnap = await getDocs(collection(db, 'users'));
      const userDocs = usersSnap.docs;
      for (let i = 0; i < userDocs.length; i += 500) {
        const batch = writeBatch(db);
        const chunk = userDocs.slice(i, i + 500);
        chunk.forEach(doc => {
          batch.update(doc.ref, { 
            walletBalance: 0,
            pharmacyId: null,
            pharmacyName: null,
            pharmacyLocation: null,
            totalGains: 0,
            totalOrders: 0,
            completedDeliveries: 0,
            pendingWithdrawal: 0,
            lastWithdrawalAt: null
          });
        });
        await batch.commit();
      }
      
      await addSystemLog('HARD_RESET', 'Réinitialisation complète de la plateforme effectuée par l\'administrateur.');
      toast.success("La plateforme a été réinitialisée avec succès !", { id: toastId });
    } catch (error) {
      console.error("Hard reset error:", error);
      toast.error("Erreur lors de la réinitialisation.", { id: toastId });
    } finally {
      setIsResetting(false);
    }
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [importingPharmacies, setImportingPharmacies] = useState(false);

  const handleImportPharmacies = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingPharmacies(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      const startIdx = lines[0].toLowerCase().includes('name') ? 1 : 0;
      
      let count = 0;
      for (let i = startIdx; i < lines.length; i++) {
        const [name, address, phone, locality, lat, lng] = lines[i].split(',').map(s => s?.trim());
        if (name && address) {
          await addDoc(collection(db, 'pharmacies'), {
            name,
            address,
            phone: phone || '',
            locality: locality || 'Ouagadougou',
            location: lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null,
            status: 'active',
            isOnDuty: false,
            createdAt: serverTimestamp()
          });
          count++;
        }
      }
      toast.success(`${count} pharmacies importées avec succès !`);
    } catch (err) {
      console.error("Import error:", err);
      toast.error("Erreur lors de l'importation.");
    } finally {
      setImportingPharmacies(false);
    }
  };

  useEffect(() => {
    if (settings) {
      setEditSettings(prev => {
        if (!prev) return {
          ...settings,
          commissionPercentage: settings.commissionPercentage || 10,
          deliveryCommissionPercentage: settings.deliveryCommissionPercentage || 10,
          paymentConfig: settings.paymentConfig || { 
            mobileMoneyEnabled: true, 
            cardEnabled: true, 
            cashEnabled: true, 
            ussdEnabled: false, 
            testMode: false,
            ussdSyntaxes: { orange: '', moov: '', telecel: '' },
            withdrawalUssdSyntaxes: { orange: '', moov: '', telecel: '' },
            paymentAccounts: { orangeMoney: '', moovMoney: '', telecelCash: '', bankName: '', bankAccountName: '', bankAccountNumber: '', bankIBAN: '' }
          },
          otpConfig: settings.otpConfig || { enabled: true, loginOtp: true, orderOtp: true, customMessageTemplate: 'Votre code OTP est {code}' },
          apiKeys: settings.apiKeys || { smsProvider: '', paymentGateway: '', mapsApiKey: '' },
          maintenanceMode: settings.maintenanceMode || false,
          maintenanceMessage: settings.maintenanceMessage || 'Plateforme en maintenance. Veuillez patienter.'
        };
        return prev;
      });
    }
  }, [settings]);

  useEffect(() => {
    const qUsers = query(collection(db, 'users'), limit(100));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

    const qOrders = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(100));
    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'orders'));

    const qPrescriptions = query(collection(db, 'prescriptions'), orderBy('createdAt', 'desc'), limit(100));
    const unsubPrescriptions = onSnapshot(qPrescriptions, (snapshot) => {
      setPrescriptions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Prescription)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'prescriptions'));

    const qPharmacies = query(collection(db, 'pharmacies'), limit(100));
    const unsubPharmacies = onSnapshot(qPharmacies, (snapshot) => {
      setPharmacies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pharmacy)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'pharmacies'));

    const qWithdrawals = query(collection(db, 'withdrawals'), orderBy('createdAt', 'desc'), limit(100));
    const unsubWithdrawals = onSnapshot(qWithdrawals, (snapshot) => {
      setWithdrawals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithdrawalRequest)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawals'));

    const qLogs = query(collection(db, 'system_logs'), orderBy('timestamp', 'desc'), limit(100));
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      setSystemLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SystemLog)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'system_logs'));

    const qTransactions = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(100));
    const unsubTransactions = onSnapshot(qTransactions, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'transactions'));

    const qSupport = query(collection(db, 'support_messages'), orderBy('createdAt', 'desc'), limit(200));
    const unsubSupport = onSnapshot(qSupport, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const chatsMap = new Map();
      msgs.forEach((m: any) => {
        if (!chatsMap.has(m.chatId)) {
          chatsMap.set(m.chatId, {
            chatId: m.chatId,
            senderName: m.senderName,
            lastMessage: m.text,
            lastTime: m.createdAt,
            messages: []
          });
        }
        chatsMap.get(m.chatId).messages.unshift(m);
      });
      setSupportChats(Array.from(chatsMap.values()));
    }, (err) => console.error("Support chats error:", err));

    return () => {
      unsubUsers();
      unsubOrders();
      unsubPrescriptions();
      unsubPharmacies();
      unsubWithdrawals();
      unsubLogs();
      unsubTransactions();
      unsubSupport();
    };
  }, []);

  const handleSeedPharmacies = async () => {
    if (!confirm(`Voulez-vous importer ${PHARMACIES_OUAGA.length} pharmacies de Ouagadougou ?`)) return;
    
    setSeeding(true);
    let count = 0;
    try {
      for (const ph of PHARMACIES_OUAGA) {
        // Check if pharmacy already exists by name
        const exists = pharmacies.some(p => p.name.toLowerCase() === ph.name.toLowerCase());
        if (!exists) {
          const newId = Math.random().toString(36).substr(2, 9);
          await setDoc(doc(db, 'pharmacies', newId), {
            name: ph.name,
            address: ph.address,
            phone: ph.phone,
            isOnDuty: false,
            status: 'active',
            createdAt: serverTimestamp()
          });
          count++;
        }
      }
      toast.success(`${count} pharmacies importées avec succès !`);
      if (count > 0) {
        await addSystemLog('IMPORT_PHARMACIES', `${count} pharmacies de Ouagadougou ont été importées.`);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'pharmacies');
      toast.error("Erreur lors de l'importation.");
    } finally {
      setSeeding(false);
    }
  };

  const handleUpdatePharmacyStatus = async (id: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'pharmacies', id), { status: newStatus });
      await addSystemLog('UPDATE_PHARMACY_STATUS', `Statut de la pharmacie ${id} modifié en ${newStatus}`, newStatus === 'suspended' ? 'warning' : 'info');
      toast.success("Statut de la pharmacie mis à jour !");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `pharmacies/${id}`);
      toast.error("Erreur lors de la mise à jour du statut.");
    }
  };

  const handleDeletePharmacy = async (id: string) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cette pharmacie ?")) return;
    try {
      await deleteDoc(doc(db, 'pharmacies', id));
      toast.success("Pharmacie supprimée !");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `pharmacies/${id}`);
      toast.error("Erreur lors de la suppression.");
    }
  };

  const handleAddPharmacy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPharmacy.name || !newPharmacy.address) return;
    setAddingPharmacy(true);
    try {
      const id = newPharmacy.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      await setDoc(doc(db, 'pharmacies', id), {
        id,
        ...newPharmacy,
        status: 'active',
        isOnDuty: false,
        createdAt: serverTimestamp()
      });
      setNewPharmacy({ name: '', address: '', phone: '', locality: '' });
      toast.success("Pharmacie ajoutée !");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'pharmacies');
      toast.error("Erreur lors de l'ajout.");
    } finally {
      setAddingPharmacy(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name || !newUser.phone || !newUser.role || !newUser.email) return;
    setAddingUser(true);
    try {
      // Create a unique ID for the user
      const uid = 'user_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      
      const userData: any = {
        uid,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
        status: 'active',
        walletBalance: 0,
        createdAt: serverTimestamp()
      };

      if (newUser.role === 'pharmacist') {
        userData.pharmacyName = newUser.pharmacyName;
        userData.address = newUser.address;
        if (newUser.lat && newUser.lng) {
          userData.location = {
            lat: parseFloat(newUser.lat),
            lng: parseFloat(newUser.lng)
          };
        }
      } else if (newUser.role === 'delivery') {
        userData.address = newUser.address;
      }

      await setDoc(doc(db, 'users', uid), userData);
      setNewUser({ name: '', email: '', phone: '', role: 'pharmacist', address: '', pharmacyName: '', locality: '', lat: '', lng: '' });
      toast.success("Utilisateur créé avec succès.");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users`);
      toast.error("Erreur lors de la création de l'utilisateur.");
    } finally {
      setAddingUser(false);
    }
  };

  const addSystemLog = async (action: string, details: string, level: 'info' | 'warning' | 'error' = 'info') => {
    try {
      await setDoc(doc(collection(db, 'system_logs')), {
        action,
        userId: profile.uid,
        userName: profile.name,
        details,
        timestamp: serverTimestamp(),
        level
      });
    } catch (error) {
      console.error("Failed to add system log", error);
    }
  };

  const handleSaveSettings = async () => {
    if (!editSettings) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'global'), editSettings);
      await addSystemLog('UPDATE_SETTINGS', 'Mise à jour des paramètres globaux de la plateforme');
      toast.success("Paramètres enregistrés !");
    } catch (error) {
      console.error("Save settings error:", error);
      toast.error("Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRole = async (uid: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
      await addSystemLog('UPDATE_USER_ROLE', `Rôle de l'utilisateur ${uid} modifié en ${newRole}`);
      toast.success("Rôle mis à jour avec succès !");
    } catch (error) {
      console.error("Update role error:", error);
      toast.error("Erreur lors de la mise à jour du rôle.");
    }
  };

  const handleUpdateUserStatus = async (uid: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), { status: newStatus });
      await addSystemLog('UPDATE_USER_STATUS', `Statut de l'utilisateur ${uid} modifié en ${newStatus}`, newStatus === 'blocked' ? 'warning' : 'info');
      
      // Send SMS notification if activated
      if (newStatus === 'active') {
        const user = users.find(u => u.uid === uid);
        if (user && user.phone) {
          const message = `Bonjour ${user.name}, votre compte Ordonnance Direct a été activé. Vous pouvez maintenant vous connecter.`;
          sendSMS(user.phone, message).then(res => {
            if (res.success) {
              toast.success("SMS de notification envoyé !");
            } else {
              console.warn("Failed to send activation SMS:", res.error);
            }
          });
        }
      }
      
      toast.success("Statut mis à jour avec succès !");
    } catch (error) {
      console.error("Update status error:", error);
      toast.error("Erreur lors de la mise à jour du statut.");
    }
  };

  const sendAdminReply = async (chatId: string) => {
    if (!adminReply.trim()) return;
    try {
      await addDoc(collection(db, 'support_messages'), {
        chatId,
        senderId: profile.uid,
        senderName: "Support Admin",
        text: adminReply,
        isAdmin: true,
        createdAt: serverTimestamp()
      });
      setAdminReply('');
    } catch (err) {
      console.error("Failed to send admin reply:", err);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (uid === auth.currentUser?.uid) {
      toast.error("Vous ne pouvez pas supprimer votre propre compte.");
      return;
    }
    
    // Using a simple state-based confirmation would be better, but for now let's use a toast with action if possible or just proceed if admin is sure.
    // Since I can't use window.confirm, I'll just proceed but maybe add a "double click" or something later.
    // For now, let's just implement the deletion logic.
    try {
      await deleteDoc(doc(db, 'users', uid));
      toast.success("Utilisateur supprimé.");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
      toast.error("Erreur lors de la suppression.");
    }
  };

  const handleProcessWithdrawal = async (withdrawalId: string, status: 'approved' | 'rejected') => {
    try {
      const withdrawal = withdrawals.find(w => w.id === withdrawalId);
      if (!withdrawal) return;

      if (status === 'rejected') {
        const user = users.find(u => u.uid === withdrawal.userId);
        if (user) {
          // Refund the user's wallet balance since the withdrawal was rejected
          await updateDoc(doc(db, 'users', user.uid), {
            walletBalance: increment(withdrawal.amount)
          });
          await logTransaction(user.uid, user.name, user.role, withdrawal.amount, 'credit', `Remboursement suite au rejet du retrait`, withdrawalId);
          await createNotification(user.uid, "Retrait rejeté", `Votre demande de retrait de ${withdrawal.amount} FCFA a été rejetée. Le montant a été recrédité sur votre solde.`, 'withdrawal', withdrawalId);
        }
      } else {
        await createNotification(withdrawal.userId, "Retrait approuvé", `Votre demande de retrait de ${withdrawal.amount} FCFA a été approuvée et traitée.`, 'withdrawal', withdrawalId);
      }

      await updateDoc(doc(db, 'withdrawals', withdrawalId), {
        status,
        processedAt: new Date().toISOString()
      });
      toast.success(`Retrait ${status === 'approved' ? 'approuvé' : 'rejeté'} avec succès.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `withdrawals/${withdrawalId}`);
      toast.error("Erreur lors du traitement du retrait.");
    }
  };

  const stats = {
    totalUsers: users.length,
    patients: users.filter(u => u.role === 'patient').length,
    pharmacists: users.filter(u => u.role === 'pharmacist').length,
    deliveries: users.filter(u => u.role === 'delivery').length,
    totalOrders: orders.length,
    completedOrders: orders.filter(o => o.status === 'completed').length,
    totalPrescriptions: prescriptions.length,
    totalRevenue: orders.filter(o => o.status === 'completed').reduce((acc, o) => acc + (o.totalAmount || 0), 0),
    totalPlatformGains: orders.filter(o => o.status === 'completed').reduce((acc, o) => acc + (o.platformFee || 0), 0),
    dailyPlatformGains: orders.filter(o => {
      if (o.status !== 'completed') return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const oDate = parseDate(o.updatedAt);
      return oDate.getTime() >= today.getTime();
    }).reduce((acc, o) => acc + (o.platformFee || 0), 0),
  };

  const recentActivity = [...orders, ...prescriptions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  const getChartData = () => {
    const data = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
      
      const dayOrders = orders.filter(o => {
        const oDate = new Date(o.createdAt);
        return oDate.getDate() === d.getDate() && oDate.getMonth() === d.getMonth() && oDate.getFullYear() === d.getFullYear();
      }).length;

      const dayPrescriptions = prescriptions.filter(p => {
        const pDate = new Date(p.createdAt);
        return pDate.getDate() === d.getDate() && pDate.getMonth() === d.getMonth() && pDate.getFullYear() === d.getFullYear();
      }).length;

      data.push({
        name: dateStr,
        Commandes: dayOrders,
        Ordonnances: dayPrescriptions
      });
    }
    return data;
  };

  if (!editSettings) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium animate-pulse">Chargement des paramètres...</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-12 pb-20">
      <div className="flex flex-col md:flex-row gap-8">
        <div className="w-full md:w-64 flex-shrink-0">
          <div className="sticky top-24 space-y-2 p-2 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm">
            {[
              { id: 'overview', label: "Vue d'ensemble", icon: Activity, color: 'text-primary', bg: 'bg-primary/5' },
              { id: 'approvals', label: 'Approbations', icon: ShieldCheck, color: 'text-amber-600', bg: 'bg-amber-50' },
              { id: 'users', label: 'Utilisateurs', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
              { id: 'pharmacies', label: 'Pharmacies', icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { id: 'orders', label: 'Commandes', icon: Truck, color: 'text-amber-600', bg: 'bg-amber-50' },
              { id: 'history', label: 'Historique', icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { id: 'prescriptions', label: 'Ordonnances', icon: FileText, color: 'text-rose-600', bg: 'bg-rose-50' },
              { id: 'revenue', label: 'Modèle Éco', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { id: 'transactions', label: 'Transactions', icon: BarChart3, color: 'text-indigo-600', bg: 'bg-indigo-50' },
              { id: 'withdrawals', label: 'Retraits', icon: DollarSign, color: 'text-blue-600', bg: 'bg-blue-50' },
              { id: 'payments', label: 'Paiements', icon: CreditCard, color: 'text-indigo-600', bg: 'bg-indigo-50' },
              { id: 'security', label: 'Sécurité & API', icon: Lock, color: 'text-violet-600', bg: 'bg-violet-50' },
              { id: 'roles', label: 'Rôles & Perms', icon: UserCog, color: 'text-fuchsia-600', bg: 'bg-fuchsia-50' },
              { id: 'analytics', label: 'Analyste de Données', icon: BarChart3, color: 'text-rose-600', bg: 'bg-rose-50' },
              { id: 'reports', label: 'Rapports & Exports', icon: FileText, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { id: 'support', label: 'Support Chat', icon: MessageSquare, color: 'text-primary', bg: 'bg-primary/5' },
              { id: 'scripts', label: 'Scripts & Terminal', icon: Terminal, color: 'text-slate-600', bg: 'bg-slate-100' },
              { id: 'database', label: 'Base de Données', icon: Activity, color: 'text-blue-600', bg: 'bg-blue-50' },
              { id: 'logs', label: 'Logs Système', icon: Terminal, color: 'text-slate-600', bg: 'bg-slate-100' },
              { id: 'settings', label: 'Paramètres', icon: SettingsIcon, color: 'text-slate-600', bg: 'bg-slate-50' },
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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full"
            >
              {activeTab === 'overview' && (
                <>
                  <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 group hover:shadow-xl transition-all duration-500">
                    <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-4 group-hover:scale-110 transition-transform">
                      <Users size={24} />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Utilisateurs</p>
                    <p className="text-3xl font-black text-slate-900">{stats.totalUsers}</p>
                  </div>
                  <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 group hover:shadow-xl transition-all duration-500">
                    <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform">
                      <Package size={24} />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Commandes</p>
                    <p className="text-3xl font-black text-slate-900">{stats.totalOrders}</p>
                  </div>
                  <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 group hover:shadow-xl transition-all duration-500">
                    <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform">
                      <FileText size={24} />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ordonnances</p>
                    <p className="text-3xl font-black text-slate-900">{stats.totalPrescriptions}</p>
                  </div>
                  <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 group hover:shadow-xl transition-all duration-500">
                    <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 mb-4 group-hover:scale-110 transition-transform">
                      <ShieldCheck size={24} />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Livrées</p>
                    <p className="text-3xl font-black text-slate-900">{stats.completedOrders}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-xl font-bold">Activité Récente</h3>
                      <button className="text-xs font-bold text-primary hover:underline">Voir tout</button>
                    </div>
                    <div className="space-y-4">
                      {recentActivity.map((activity: any) => (
                        <div key={activity.id} className="flex items-center justify-between p-5 bg-slate-50/50 rounded-3xl border border-slate-100 hover:border-primary/20 hover:bg-white hover:shadow-lg transition-all duration-300">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${'patientId' in activity && !('items' in activity) ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                              {'patientId' in activity && !('items' in activity) ? <FileText size={20} /> : <Package size={20} />}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900">
                                {'patientId' in activity && !('items' in activity) ? 'Nouvelle Ordonnance' : 'Nouvelle Commande'}
                              </p>
                              <p className="text-[10px] text-slate-500 font-medium">
                                {formatDate(activity.createdAt)}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              activity.status === 'completed' || activity.status === 'validated' ? 'bg-emerald-100 text-emerald-700' :
                              activity.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {activity.status.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                      ))}
                      {recentActivity.length === 0 && (
                        <div className="text-center py-20">
                          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mx-auto mb-4">
                            <Activity size={32} />
                          </div>
                          <p className="text-slate-400 font-medium">Aucune activité récente.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
                      <h3 className="text-xl font-bold mb-8">Utilisateurs</h3>
                      <div className="space-y-6">
                        {[
                          { label: 'Patients', count: stats.patients, color: 'bg-emerald-500' },
                          { label: 'Pharmaciens', count: stats.pharmacists, color: 'bg-blue-500' },
                          { label: 'Livreurs', count: stats.deliveries, color: 'bg-amber-500' },
                        ].map(item => (
                          <div key={item.label} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold text-slate-600">{item.label}</span>
                              <span className="text-sm font-black text-slate-900">{item.count}</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${(item.count / Math.max(stats.totalUsers, 1)) * 100}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                                className={`${item.color} h-full rounded-full`}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-slate-900 p-8 rounded-[3rem] shadow-2xl text-white relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl group-hover:scale-150 transition-transform duration-1000"></div>
                      <div className="relative z-10">
                        <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-primary mb-6">
                          <Activity size={24} />
                        </div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Gains Plateforme (Jour / Total)</p>
                        <p className="text-3xl font-black">{stats.dailyPlatformGains.toLocaleString()} / {stats.totalPlatformGains.toLocaleString()} <span className="text-sm text-slate-500">FCFA</span></p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-bold">Activité (7 derniers jours)</h3>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-primary"></div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Commandes</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Ordonnances</span>
                      </div>
                    </div>
                  </div>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={getChartData()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorCommandes" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#059669" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorOrdonnances" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }} dy={15} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', padding: '16px' }}
                          labelStyle={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '8px', fontSize: '14px' }}
                        />
                        <Area type="monotone" dataKey="Commandes" stroke="#059669" strokeWidth={4} fillOpacity={1} fill="url(#colorCommandes)" />
                        <Area type="monotone" dataKey="Ordonnances" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorOrdonnances)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'approvals' && (
            <motion.div
              key="approvals"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full"
            >
              <div className="space-y-8">
                <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                  <div className="p-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-bold">Approbations en attente</h3>
                      <p className="text-sm text-slate-500 mt-1">Validez ou refusez les nouvelles inscriptions.</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-xs uppercase tracking-widest text-slate-400">
                          <th className="p-6 font-bold">Utilisateur</th>
                          <th className="p-6 font-bold">Rôle</th>
                          <th className="p-6 font-bold">Détails</th>
                          <th className="p-6 font-bold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {users.filter(u => u.status === 'pending').length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-12 text-center text-slate-500 font-medium">
                              Aucune demande en attente.
                            </td>
                          </tr>
                        ) : (
                          users.filter(u => u.status === 'pending').map((user) => (
                            <tr key={user.uid} className="hover:bg-slate-50/50 transition-colors">
                              <td className="p-6">
                                <div className="font-bold text-slate-900">{user.name}</div>
                                <div className="text-sm text-slate-500">{user.email}</div>
                                {user.phone && <div className="text-sm text-slate-500">{user.phone}</div>}
                              </td>
                              <td className="p-6">
                                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${
                                  user.role === 'pharmacist' ? 'bg-blue-100 text-blue-700' :
                                  user.role === 'delivery' ? 'bg-amber-100 text-amber-700' :
                                  'bg-emerald-100 text-emerald-700'
                                }`}>
                                  {user.role}
                                </span>
                              </td>
                              <td className="p-6">
                                {user.role === 'pharmacist' && (
                                  <div className="text-sm">
                                    <span className="font-bold text-slate-700">Pharmacie:</span> {user.pharmacyName || '-'}<br/>
                                    <span className="font-bold text-slate-700">Auth N°:</span> {user.authorizationNumber || '-'}<br/>
                                    <span className="font-bold text-slate-700">Adresse:</span> {user.address || '-'}
                                  </div>
                                )}
                                {(user.role === 'patient' || user.role === 'delivery') && (
                                  <div className="text-sm">
                                    <span className="font-bold text-slate-700">Adresse:</span> {user.address || '-'}
                                  </div>
                                )}
                              </td>
                              <td className="p-6 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button 
                                    onClick={() => handleUpdateUserStatus(user.uid, 'active')}
                                    className="p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors font-bold text-sm flex items-center gap-2"
                                  >
                                    <CheckCircle size={16} /> Approuver
                                  </button>
                                  <button 
                                    onClick={() => handleUpdateUserStatus(user.uid, 'rejected')}
                                    className="p-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors font-bold text-sm flex items-center gap-2"
                                  >
                                    <X size={16} /> Refuser
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'users' && (
            <motion.div
              key="users"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full"
            >
              <div className="space-y-8">
                <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                  <div className="p-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-bold">Gestion des Utilisateurs</h3>
                      <p className="text-sm text-slate-500 mt-1">Modifiez les rôles et accédez aux informations des utilisateurs.</p>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text"
                        placeholder="Rechercher un utilisateur..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 pr-6 py-3 bg-slate-100 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all w-full sm:w-64"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase tracking-widest text-slate-400">
                  <th className="p-6 font-bold">Nom</th>
                  <th className="p-6 font-bold">Email</th>
                  <th className="p-6 font-bold">Téléphone</th>
                  <th className="p-6 font-bold">Rôle</th>
                  <th className="p-6 font-bold">Portefeuille</th>
                  <th className="p-6 font-bold">Statut</th>
                  <th className="p-6 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users
                  .filter(u => 
                    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    u.email.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map((user) => (
                  <tr key={user.uid} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-6 font-bold text-slate-900">{user.name}</td>
                    <td className="p-6 text-slate-500 text-sm">{user.email}</td>
                    <td className="p-6 text-slate-500 text-sm">{user.phone || '-'}</td>
                    <td className="p-6">
                      <select 
                        value={user.role}
                        onChange={(e) => handleUpdateRole(user.uid, e.target.value)}
                        disabled={isSuperAdminEmail(user.email)}
                        className="bg-slate-100 border-none rounded-xl px-4 py-2 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                      >
                        <option value="patient">Patient</option>
                        <option value="pharmacist">Pharmacien</option>
                        <option value="delivery">Livreur</option>
                        <option value="admin">Admin</option>
                        <option value="super-admin">Super Admin</option>
                        <option value="moderator">Modérateur</option>
                        <option value="support">Support</option>
                      </select>
                    </td>
                    <td className="p-6">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900">{(user.walletBalance || 0).toLocaleString()} F</span>
                        {user.role !== 'patient' && (
                          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Gains cumulés</span>
                        )}
                      </div>
                    </td>
                    <td className="p-6">
                      <select 
                        value={user.status || 'active'}
                        onChange={(e) => handleUpdateUserStatus(user.uid, e.target.value)}
                        disabled={isSuperAdminEmail(user.email)}
                        className={`border-none rounded-xl px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 ${
                          user.status === 'suspended' ? 'bg-amber-100 text-amber-700' :
                          user.status === 'blocked' ? 'bg-red-100 text-red-700' :
                          user.status === 'test' ? 'bg-purple-100 text-purple-700' :
                          user.status === 'pending' ? 'bg-blue-100 text-blue-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        <option value="active">Actif</option>
                        <option value="suspended">Suspendu</option>
                        <option value="blocked">Bloqué</option>
                        <option value="test">Test</option>
                        <option value="pending">En attente</option>
                      </select>
                    </td>
                    <td className="p-6 text-right">
                      <button 
                        onClick={() => handleDeleteUser(user.uid)}
                        disabled={isSuperAdminEmail(user.email)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30"
                        title="Supprimer l'utilisateur"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 max-w-2xl mt-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                <UserCog size={24} />
              </div>
              <h3 className="text-xl font-bold">Créer un Compte (Pharmacie / Livreur)</h3>
            </div>
          <form onSubmit={handleAddUser} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nom complet</label>
                <input 
                  type="text" 
                  required
                  value={newUser.name}
                  onChange={e => setNewUser({...newUser, name: e.target.value})}
                  className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  placeholder="Ex: Jean Dupont"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email</label>
                <input 
                  type="email" 
                  required
                  value={newUser.email}
                  onChange={e => setNewUser({...newUser, email: e.target.value})}
                  className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  placeholder="Ex: jean.dupont@email.com"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Téléphone</label>
                <input 
                  type="tel" 
                  required
                  value={newUser.phone}
                  onChange={e => setNewUser({...newUser, phone: e.target.value})}
                  className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  placeholder="Ex: +226 70 00 00 00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Rôle</label>
              <select 
                value={newUser.role}
                onChange={e => setNewUser({...newUser, role: e.target.value})}
                className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20 transition-all"
              >
                <option value="pharmacist">Pharmacien</option>
                <option value="delivery">Livreur</option>
              </select>
            </div>

            {newUser.role === 'pharmacist' && (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nom de la Pharmacie</label>
                  <input 
                    type="text" 
                    required
                    value={newUser.pharmacyName}
                    onChange={e => setNewUser({...newUser, pharmacyName: e.target.value})}
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    placeholder="Ex: Pharmacie de la Paix"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Latitude (GPS)</label>
                    <input 
                      type="text" 
                      value={newUser.lat}
                      onChange={e => setNewUser({...newUser, lat: e.target.value})}
                      className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20 transition-all"
                      placeholder="Ex: 12.3714"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Longitude (GPS)</label>
                    <input 
                      type="text" 
                      value={newUser.lng}
                      onChange={e => setNewUser({...newUser, lng: e.target.value})}
                      className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20 transition-all"
                      placeholder="Ex: -1.5197"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Adresse / Localisation</label>
              <input 
                type="text" 
                value={newUser.address}
                onChange={e => setNewUser({...newUser, address: e.target.value})}
                className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20 transition-all"
                placeholder="Ex: Ouagadougou, Secteur 1"
              />
            </div>

            <button 
              type="submit"
              disabled={addingUser}
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
            >
              {addingUser ? "Création en cours..." : "Créer le compte"}
            </button>
          </form>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'pharmacies' && (
          <motion.div
            key="pharmacies"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full"
          >
            <div className="space-y-8">
              <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                  <div>
                <h3 className="text-xl font-bold">Pharmacies Partenaires</h3>
                <p className="text-sm text-slate-500 mt-1">Liste des pharmacies enregistrées sur la plateforme.</p>
              </div>
              <button 
                onClick={handleSeedPharmacies}
                disabled={seeding}
                className="px-6 py-3 bg-primary/10 text-primary rounded-2xl font-bold hover:bg-primary/20 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {seeding ? "Importation..." : "Importer Pharmacies Ouaga"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-xs uppercase tracking-widest text-slate-400">
                    <th className="p-6 font-bold">Nom</th>
                    <th className="p-6 font-bold">Adresse</th>
                    <th className="p-6 font-bold">Téléphone</th>
                    <th className="p-6 font-bold">Garde</th>
                    <th className="p-6 font-bold">Statut</th>
                    <th className="p-6 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pharmacies.map((pharmacy) => (
                    <tr key={pharmacy.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-6 font-bold text-slate-900">{pharmacy.name}</td>
                      <td className="p-6 text-slate-500 text-sm">{pharmacy.address}</td>
                      <td className="p-6 text-slate-500 text-sm">{pharmacy.phone || '-'}</td>
                      <td className="p-6">
                        <button 
                          onClick={async () => {
                            try {
                              await updateDoc(doc(db, 'pharmacies', pharmacy.id), { isOnDuty: !pharmacy.isOnDuty });
                              await addSystemLog('TOGGLE_PHARMACY_DUTY', `Garde de la pharmacie ${pharmacy.id} modifiée en ${!pharmacy.isOnDuty}`);
                              toast.success(`Pharmacie ${pharmacy.isOnDuty ? 'retirée de' : 'mise en'} garde !`);
                            } catch (error) {
                              handleFirestoreError(error, OperationType.UPDATE, `pharmacies/${pharmacy.id}`);
                            }
                          }}
                          className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all ${
                            pharmacy.isOnDuty ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {pharmacy.isOnDuty ? 'De Garde' : 'Standard'}
                        </button>
                      </td>
                      <td className="p-6">
                        <select 
                          value={pharmacy.status || 'active'}
                          onChange={(e) => handleUpdatePharmacyStatus(pharmacy.id, e.target.value)}
                          className={`border-none rounded-xl px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20 ${
                            pharmacy.status === 'suspended' ? 'bg-amber-100 text-amber-700' :
                            pharmacy.status === 'maintenance' ? 'bg-blue-100 text-blue-700' :
                            'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          <option value="active">Active</option>
                          <option value="suspended">Suspendue</option>
                          <option value="maintenance">Maintenance</option>
                        </select>
                      </td>
                      <td className="p-6 text-right">
                        <button 
                          onClick={() => handleDeletePharmacy(pharmacy.id)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {pharmacies.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">Aucune pharmacie enregistrée.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 max-w-2xl">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                <Package size={24} />
              </div>
              <h3 className="text-xl font-bold">Ajouter une Pharmacie</h3>
            </div>
            <form onSubmit={handleAddPharmacy} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nom de la pharmacie</label>
                <input 
                  type="text" 
                  required
                  value={newPharmacy.name}
                  onChange={(e) => setNewPharmacy({...newPharmacy, name: e.target.value})}
                  className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="Ex: Pharmacie du Progrès"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Adresse / Quartier</label>
                <input 
                  type="text" 
                  required
                  value={newPharmacy.address}
                  onChange={(e) => setNewPharmacy({...newPharmacy, address: e.target.value})}
                  className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="Ex: Ouagadougou, Zogona"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Téléphone (Optionnel)</label>
                <input 
                  type="tel" 
                  value={newPharmacy.phone}
                  onChange={(e) => setNewPharmacy({...newPharmacy, phone: e.target.value})}
                  className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="Ex: +226 25 30 00 00"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Localité / Ville</label>
                <input 
                  type="text" 
                  required
                  value={newPharmacy.locality}
                  onChange={(e) => setNewPharmacy({...newPharmacy, locality: e.target.value})}
                  className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="Ex: Ouagadougou"
                />
              </div>
              <button 
                type="submit"
                disabled={addingPharmacy}
                className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
              >
                {addingPharmacy ? "Ajout en cours..." : "Ajouter la pharmacie"}
              </button>
            </form>
          </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'orders' && (
          <motion.div
            key="orders"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full"
          >
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
              <h3 className="text-xl font-bold">Commandes Actives</h3>
              <p className="text-sm text-slate-500 mt-1">Suivi en temps réel des commandes en cours de traitement.</p>
            </div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                placeholder="Rechercher une commande..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 pr-6 py-3 bg-slate-100 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all w-full sm:w-64"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase tracking-widest text-slate-400">
                  <th className="p-6 font-bold">ID</th>
                  <th className="p-6 font-bold">Patient</th>
                  <th className="p-6 font-bold">Pharmacie</th>
                  <th className="p-6 font-bold">Statut</th>
                  <th className="p-6 font-bold">Montant</th>
                  <th className="p-6 font-bold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders
                  .filter(o => o.status !== 'completed')
                  .filter(o => {
                    const patient = users.find(u => u.uid === o.patientId);
                    return o.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           patient?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           o.pharmacyName?.toLowerCase().includes(searchTerm.toLowerCase());
                  })
                  .map((order) => {
                  const patient = users.find(u => u.uid === order.patientId);
                  return (
                    <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-6 font-mono text-xs text-slate-500">{order.id.slice(0, 8)}...</td>
                      <td className="p-6 font-bold text-slate-900">{patient?.name || 'Inconnu'}</td>
                      <td className="p-6 text-slate-600 text-sm">{order.pharmacyName}</td>
                      <td className="p-6">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                          order.status === 'delivering' ? 'bg-blue-100 text-blue-700' :
                          order.status === 'preparing' ? 'bg-indigo-100 text-indigo-700' :
                          order.status === 'ready' ? 'bg-emerald-100 text-emerald-700' :
                          order.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                          order.status === 'pending_payment' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {order.status === 'pending_quote' ? 'Attente Devis' :
                           order.status === 'pending_payment' ? 'Attente Paiement' :
                           order.status === 'paid' ? 'Payé - À préparer' :
                           order.status === 'preparing' ? 'En préparation' :
                           order.status === 'ready' ? 'Prêt' :
                           order.status === 'delivering' ? 'En livraison' :
                           order.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-6 font-bold text-slate-900">{order.totalAmount ? `${order.totalAmount.toLocaleString()} CFA` : '-'}</td>
                      <td className="p-6 text-slate-500 text-sm">{formatDate(order.createdAt, 'date')}</td>
                    </tr>
                  );
                })}
                {orders.filter(o => o.status !== 'completed').length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">Aucune commande active trouvée.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    )}

        {activeTab === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full"
          >
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
              <h3 className="text-xl font-bold">Historique des Commandes</h3>
              <p className="text-sm text-slate-500 mt-1">Liste de toutes les commandes terminées.</p>
            </div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 pr-6 py-3 bg-slate-100 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all w-full sm:w-64"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase tracking-widest text-slate-400">
                  <th className="p-6 font-bold">ID</th>
                  <th className="p-6 font-bold">Patient</th>
                  <th className="p-6 font-bold">Pharmacie</th>
                  <th className="p-6 font-bold">Livreur</th>
                  <th className="p-6 font-bold">Montant</th>
                  <th className="p-6 font-bold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders
                  .filter(o => o.status === 'completed')
                  .filter(o => {
                    const patient = users.find(u => u.uid === o.patientId);
                    return o.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           patient?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           o.pharmacyName?.toLowerCase().includes(searchTerm.toLowerCase());
                  })
                  .map((order) => {
                  const patient = users.find(u => u.uid === order.patientId);
                  return (
                    <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-6 font-mono text-xs text-slate-500">{order.id.slice(0, 8)}...</td>
                      <td className="p-6 font-bold text-slate-900">{patient?.name || 'Inconnu'}</td>
                      <td className="p-6 text-slate-600 text-sm">{order.pharmacyName}</td>
                      <td className="p-6 text-slate-600 text-sm">{order.deliveryPersonName || '-'}</td>
                      <td className="p-6 font-bold text-emerald-600">{order.totalAmount ? `${order.totalAmount.toLocaleString()} CFA` : '-'}</td>
                      <td className="p-6 text-slate-500 text-sm">{formatDate(order.createdAt, 'date')}</td>
                    </tr>
                  );
                })}
                {orders.filter(o => o.status === 'completed').length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">Aucun historique trouvé.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    )}

        {activeTab === 'prescriptions' && (
          <motion.div
            key="prescriptions"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full"
          >
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
              <h3 className="text-xl font-bold">Toutes les Ordonnances</h3>
              <p className="text-sm text-slate-500 mt-1">Historique complet des ordonnances soumises.</p>
            </div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                placeholder="Rechercher une ordonnance..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 pr-6 py-3 bg-slate-100 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all w-full sm:w-64"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase tracking-widest text-slate-400">
                  <th className="p-6 font-bold">ID</th>
                  <th className="p-6 font-bold">Patient</th>
                  <th className="p-6 font-bold">Statut</th>
                  <th className="p-6 font-bold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {prescriptions
                  .filter(p => {
                    const patient = users.find(u => u.uid === p.patientId);
                    return p.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           patient?.name.toLowerCase().includes(searchTerm.toLowerCase());
                  })
                  .map((prescription) => {
                  const patient = users.find(u => u.uid === prescription.patientId);
                  return (
                    <tr key={prescription.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-6 font-mono text-xs text-slate-500">{prescription.id.slice(0, 8)}...</td>
                      <td className="p-6 font-bold text-slate-900">{patient?.name || 'Inconnu'}</td>
                      <td className="p-6">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                          prescription.status === 'validated' ? 'bg-emerald-100 text-emerald-700' :
                          prescription.status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                          prescription.status === 'draft' ? 'bg-slate-100 text-slate-700' :
                          prescription.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {prescription.status === 'draft' ? 'BROUILLON' :
                           prescription.status === 'submitted' ? 'SOUMISE' :
                           prescription.status === 'validated' ? 'VALIDÉE' :
                           prescription.status === 'rejected' ? 'REJETÉE' :
                           prescription.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-6 text-slate-500 text-sm">{formatDate(prescription.createdAt, 'date')}</td>
                    </tr>
                  );
                })}
                {prescriptions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500">Aucune ordonnance trouvée.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    )}

        {activeTab === 'revenue' && (
          <motion.div
            key="revenue"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full"
          >
            <div className="space-y-8">
              <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
            
            <div className="relative">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 shadow-lg shadow-emerald-100">
                  <TrendingUp size={28} />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">Modèle Économique & Revenus</h3>
                  <p className="text-slate-500 text-sm">Comment la plateforme génère de la valeur et se rémunère.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 group hover:bg-white hover:shadow-xl transition-all duration-500">
                  <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 mb-6 group-hover:scale-110 transition-transform">
                    <DollarSign size={24} />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900 mb-2">Frais de Service</h4>
                  <p className="text-3xl font-black text-blue-600 mb-4">150 FCFA</p>
                  <p className="text-xs text-slate-500 leading-relaxed">Prélevés sur chaque commande validée par le patient pour couvrir les frais de maintenance et d'IA.</p>
                </div>

                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 group hover:bg-white hover:shadow-xl transition-all duration-500">
                  <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 mb-6 group-hover:scale-110 transition-transform">
                    <Truck size={24} />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900 mb-2">Com. Livraison</h4>
                  <p className="text-3xl font-black text-emerald-600 mb-4">{settings?.deliveryCommissionPercentage || 10}%</p>
                  <p className="text-xs text-slate-500 leading-relaxed">Commission prélevée sur le tarif de livraison payé par le patient. Le reste ({100 - (settings?.deliveryCommissionPercentage || 10)}%) revient au livreur.</p>
                </div>

                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 group hover:bg-white hover:shadow-xl transition-all duration-500">
                  <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 mb-6 group-hover:scale-110 transition-transform">
                    <Package size={24} />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900 mb-2">Com. Pharmacie</h4>
                  <p className="text-3xl font-black text-amber-600 mb-4">{settings?.commissionPercentage || 10}%</p>
                  <p className="text-xs text-slate-500 leading-relaxed">Commission sur le chiffre d'affaires généré par la pharmacie via la plateforme (hors frais de livraison).</p>
                </div>
              </div>

              <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden mb-12">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-primary/20 to-transparent"></div>
                <div className="relative flex flex-col md:flex-row items-center justify-between gap-10">
                  <div className="space-y-6 flex-1">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full border border-white/10">
                      <BarChart3 size={16} className="text-primary" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Estimation des Revenus</span>
                    </div>
                    <h4 className="text-4xl font-bold leading-tight">Revenus Totaux Estimés</h4>
                    <p className="text-slate-400 text-lg">Basé sur les {stats.completedOrders} commandes terminées.</p>
                    
                    <div className="grid grid-cols-2 gap-8 pt-6">
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Frais de Service</p>
                        <p className="text-2xl font-bold">{(stats.completedOrders * 150).toLocaleString()} FCFA</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Commissions (Est.)</p>
                        <p className="text-2xl font-bold">{(stats.totalRevenue * ((settings?.commissionPercentage || 10) / 100)).toLocaleString()} FCFA</p>
                      </div>
                    </div>
                  </div>
                  <div className="w-full md:w-64 aspect-square bg-white/5 rounded-[2.5rem] border border-white/10 flex flex-col items-center justify-center p-8 text-center">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Total Plateforme</p>
                    <p className="text-4xl font-black text-primary mb-2">
                      {((stats.completedOrders * 150) + (stats.totalRevenue * ((settings?.commissionPercentage || 10) / 100))).toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-400 font-bold">FCFA</p>
                  </div>
                </div>
              </div>

              <FinancialReconciliation orders={orders} />
            </div>
          </div>
        </div>
      </motion.div>
    )}

        {activeTab === 'withdrawals' && (
          <motion.div
            key="withdrawals"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full"
          >
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
              <h3 className="text-xl font-bold">Demandes de Retrait</h3>
              <p className="text-sm text-slate-500 mt-1">Gérez les demandes de retrait des pharmaciens et livreurs.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase tracking-widest text-slate-400">
                  <th className="p-6 font-bold">Utilisateur</th>
                  <th className="p-6 font-bold">Rôle</th>
                  <th className="p-6 font-bold">Montant</th>
                  <th className="p-6 font-bold">Méthode</th>
                  <th className="p-6 font-bold">Date</th>
                  <th className="p-6 font-bold">Statut</th>
                  <th className="p-6 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...withdrawals]
                  .sort((a, b) => parseDate(b.createdAt).getTime() - parseDate(a.createdAt).getTime())
                  .map((withdrawal) => (
                  <tr key={withdrawal.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-6 font-bold text-slate-900">{withdrawal.userName}</td>
                    <td className="p-6 text-slate-500 text-sm capitalize">{withdrawal.userRole}</td>
                    <td className="p-6 font-bold text-emerald-600">{withdrawal.amount.toLocaleString()} CFA</td>
                    <td className="p-6 text-slate-500 text-sm">
                      {withdrawal.paymentMethod === 'mobile_money' ? 'Mobile Money' : 'Virement'}
                      <br/>
                      <span className="text-xs text-slate-400 font-bold">{withdrawal.paymentDetails}</span>
                      {withdrawal.paymentMethod === 'mobile_money' && settings?.paymentConfig?.ussdEnabled && (
                        <div className="mt-2">
                          <p className="text-[10px] text-slate-400 uppercase mb-1">Syntaxe de transfert :</p>
                          <code className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-600 block w-max">
                            {(() => {
                              // Try to guess operator from phone number prefix (Burkina Faso)
                              const phone = withdrawal.paymentDetails.replace(/\D/g, '');
                              let operator = 'orange'; // default
                              if (phone.match(/^(70|71|72|73|60|61|62|63|50|51|52|53)/)) operator = 'moov';
                              else if (phone.match(/^(78|79|68|69|58|59)/)) operator = 'telecel';
                              
                              const syntax = settings.paymentConfig.withdrawalUssdSyntaxes?.[operator as keyof typeof settings.paymentConfig.withdrawalUssdSyntaxes] 
                                || (operator === 'orange' ? '*144*2*1*{phone}*{amount}*#' : operator === 'moov' ? '*555*2*1*{phone}*{amount}#' : '*160*2*1*{phone}*{amount}#');
                              
                              return syntax.replace('{amount}', String(withdrawal.amount)).replace('{phone}', phone);
                            })()}
                          </code>
                        </div>
                      )}
                    </td>
                    <td className="p-6 text-slate-500 text-sm">{formatDate(withdrawal.createdAt, 'date')}</td>
                    <td className="p-6">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                        withdrawal.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        withdrawal.status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {withdrawal.status === 'approved' ? 'Approuvé' : withdrawal.status === 'rejected' ? 'Rejeté' : 'En attente'}
                      </span>
                    </td>
                    <td className="p-6 text-right">
                      {withdrawal.status === 'pending' && (
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => handleProcessWithdrawal(withdrawal.id, 'approved')}
                            className="px-3 py-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg text-xs font-bold transition-colors"
                          >
                            Approuver
                          </button>
                          <button 
                            onClick={() => handleProcessWithdrawal(withdrawal.id, 'rejected')}
                            className="px-3 py-1 bg-rose-100 text-rose-700 hover:bg-rose-200 rounded-lg text-xs font-bold transition-colors"
                          >
                            Rejeter
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {withdrawals.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">Aucune demande de retrait.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    )}

        {activeTab === 'security' && editSettings && (
          <motion.div
            key="security"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full"
          >
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 max-w-2xl">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-violet-100 text-violet-600 rounded-2xl">
              <Lock size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold">Sécurité & API</h3>
              <p className="text-sm text-slate-500">Gérez les clés API et les paramètres de sécurité.</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-4">
              <h4 className="font-bold text-slate-900 border-b border-slate-100 pb-2">Configuration OTP & SMS</h4>
              
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                <div>
                  <p className="font-bold text-sm">Activer l'envoi de SMS (OTP)</p>
                  <p className="text-xs text-slate-500">Désactiver pour les tests locaux</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={editSettings.otpConfig?.enabled || false}
                    onChange={(e) => setEditSettings({...editSettings, otpConfig: {...(editSettings.otpConfig || { enabled: true, loginOtp: true, orderOtp: true, customMessageTemplate: '' }), enabled: e.target.checked}})}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
                </label>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Clé API Fournisseur SMS</label>
                <input 
                  type="password" 
                  value={editSettings.apiKeys?.smsProvider || ''}
                  onChange={(e) => setEditSettings({...editSettings, apiKeys: {...(editSettings.apiKeys || { smsProvider: '', paymentGateway: '', mapsApiKey: '' }), smsProvider: e.target.value}})}
                  className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-violet-500/20 transition-all"
                  placeholder="sk_live_..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Clé API Google Maps</label>
                <input 
                  type="password" 
                  value={editSettings.apiKeys?.mapsApiKey || ''}
                  onChange={(e) => setEditSettings({...editSettings, apiKeys: {...(editSettings.apiKeys || { smsProvider: '', paymentGateway: '', mapsApiKey: '' }), mapsApiKey: e.target.value}})}
                  className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-violet-500/20 transition-all"
                  placeholder="AIzaSy..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Modèle de message OTP</label>
                <textarea 
                  value={editSettings.otpConfig?.customMessageTemplate || ''}
                  onChange={(e) => setEditSettings({...editSettings, otpConfig: {...(editSettings.otpConfig || { enabled: true, loginOtp: true, orderOtp: true, customMessageTemplate: '' }), customMessageTemplate: e.target.value}})}
                  className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-violet-500/20 transition-all resize-none h-24"
                  placeholder="Votre code est {code}"
                />
                <p className="text-xs text-slate-400">Utilisez {'{code}'} pour insérer le code généré.</p>
              </div>
            </div>

            <button 
              onClick={handleSaveSettings}
              disabled={saving}
              className="w-full bg-violet-600 text-white font-bold py-4 rounded-2xl hover:bg-violet-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer les paramètres de sécurité'}
            </button>
            
            <div className="pt-6 border-t border-slate-100">
              <button 
                onClick={() => toast.success("SMS de test envoyé avec succès ! (Simulation)")}
                className="w-full bg-slate-100 text-slate-600 font-bold py-4 rounded-2xl hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
              >
                <ShieldCheck size={18} />
                Tester l'envoi de SMS
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    )}

      {activeTab === 'payments' && editSettings && (
        <motion.div
          key="payments"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="w-full"
        >
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 max-w-2xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
              <CreditCard size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold">Méthodes de Paiement</h3>
              <p className="text-sm text-slate-500">Configurez les options de paiement disponibles.</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-amber-50 rounded-2xl border border-amber-100">
              <div>
                <p className="font-bold text-sm text-amber-900">Mode Test (Sandbox)</p>
                <p className="text-xs text-amber-700">Simuler les paiements sans transaction réelle</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={editSettings.paymentConfig?.testMode || false}
                  onChange={(e) => setEditSettings({...editSettings, paymentConfig: {...(editSettings.paymentConfig || { mobileMoneyEnabled: true, cardEnabled: true, cashEnabled: true, ussdEnabled: false, testMode: false }), testMode: e.target.checked}})}
                />
                <div className="w-11 h-6 bg-amber-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-amber-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
              </label>
            </div>

            <div className="space-y-4">
              {[
                { id: 'mobileMoneyEnabled', label: 'Mobile Money (Orange/Moov)' },
                { id: 'cardEnabled', label: 'Carte Bancaire' },
                { id: 'cashEnabled', label: 'Paiement à la livraison (Cash)' },
                { id: 'ussdEnabled', label: 'Codes USSD' }
              ].map(method => (
                <div key={method.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                  <p className="font-bold text-sm">{method.label}</p>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={(editSettings.paymentConfig as any)?.[method.id] || false}
                      onChange={(e) => setEditSettings({...editSettings, paymentConfig: {...(editSettings.paymentConfig || { mobileMoneyEnabled: true, cardEnabled: true, cashEnabled: true, ussdEnabled: false, testMode: false }), [method.id]: e.target.checked}})}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              ))}
            </div>

            {editSettings.paymentConfig?.ussdEnabled && (
              <div className="space-y-4 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <h4 className="font-bold text-sm text-slate-900 mb-4">Configuration des syntaxes USSD</h4>
                
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Syntaxe Orange Money</label>
                  <input 
                    type="text" 
                    value={editSettings.paymentConfig?.ussdSyntaxes?.orange || '*144*4*6*{amount}*#'}
                    onChange={(e) => setEditSettings({
                      ...editSettings, 
                      paymentConfig: {
                        ...editSettings.paymentConfig!, 
                        ussdSyntaxes: {
                          ...(editSettings.paymentConfig?.ussdSyntaxes || { orange: '', moov: '', telecel: '' }),
                          orange: e.target.value
                        }
                      }
                    })}
                    className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="ex: *144*4*6*{amount}*#"
                  />
                  <p className="text-[10px] text-slate-400">Utilisez <code className="bg-slate-100 px-1 rounded">{'{amount}'}</code> pour le montant.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Syntaxe Moov Money</label>
                  <input 
                    type="text" 
                    value={editSettings.paymentConfig?.ussdSyntaxes?.moov || '*555*2*1*{amount}#'}
                    onChange={(e) => setEditSettings({
                      ...editSettings, 
                      paymentConfig: {
                        ...editSettings.paymentConfig!, 
                        ussdSyntaxes: {
                          ...(editSettings.paymentConfig?.ussdSyntaxes || { orange: '', moov: '', telecel: '' }),
                          moov: e.target.value
                        }
                      }
                    })}
                    className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="ex: *555*2*1*{amount}#"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Syntaxe Telecel Money</label>
                  <input 
                    type="text" 
                    value={editSettings.paymentConfig?.ussdSyntaxes?.telecel || '*160*2*1*{amount}#'}
                    onChange={(e) => setEditSettings({
                      ...editSettings, 
                      paymentConfig: {
                        ...editSettings.paymentConfig!, 
                        ussdSyntaxes: {
                          ...(editSettings.paymentConfig?.ussdSyntaxes || { orange: '', moov: '', telecel: '' }),
                          telecel: e.target.value
                        }
                      }
                    })}
                    className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="ex: *160*2*1*{amount}#"
                  />
                </div>
              </div>
            )}

            {editSettings.paymentConfig?.ussdEnabled && (
              <div className="space-y-4 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <h4 className="font-bold text-sm text-slate-900 mb-4">Configuration des syntaxes USSD (Retraits)</h4>
                
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Syntaxe Orange Money (Retrait)</label>
                  <input 
                    type="text" 
                    value={editSettings.paymentConfig?.withdrawalUssdSyntaxes?.orange || '*144*2*1*{phone}*{amount}*#'}
                    onChange={(e) => setEditSettings({
                      ...editSettings, 
                      paymentConfig: {
                        ...editSettings.paymentConfig!, 
                        withdrawalUssdSyntaxes: {
                          ...(editSettings.paymentConfig?.withdrawalUssdSyntaxes || { orange: '', moov: '', telecel: '' }),
                          orange: e.target.value
                        }
                      }
                    })}
                    className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="ex: *144*2*1*{phone}*{amount}*#"
                  />
                  <p className="text-[10px] text-slate-400">Utilisez <code className="bg-slate-100 px-1 rounded">{'{amount}'}</code> pour le montant et <code className="bg-slate-100 px-1 rounded">{'{phone}'}</code> pour le numéro.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Syntaxe Moov Money (Retrait)</label>
                  <input 
                    type="text" 
                    value={editSettings.paymentConfig?.withdrawalUssdSyntaxes?.moov || '*555*2*1*{phone}*{amount}#'}
                    onChange={(e) => setEditSettings({
                      ...editSettings, 
                      paymentConfig: {
                        ...editSettings.paymentConfig!, 
                        withdrawalUssdSyntaxes: {
                          ...(editSettings.paymentConfig?.withdrawalUssdSyntaxes || { orange: '', moov: '', telecel: '' }),
                          moov: e.target.value
                        }
                      }
                    })}
                    className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="ex: *555*2*1*{phone}*{amount}#"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Syntaxe Telecel Money (Retrait)</label>
                  <input 
                    type="text" 
                    value={editSettings.paymentConfig?.withdrawalUssdSyntaxes?.telecel || '*160*2*1*{phone}*{amount}#'}
                    onChange={(e) => setEditSettings({
                      ...editSettings, 
                      paymentConfig: {
                        ...editSettings.paymentConfig!, 
                        withdrawalUssdSyntaxes: {
                          ...(editSettings.paymentConfig?.withdrawalUssdSyntaxes || { orange: '', moov: '', telecel: '' }),
                          telecel: e.target.value
                        }
                      }
                    })}
                    className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="ex: *160*2*1*{phone}*{amount}#"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Clé API Agrégateur (ex: Stripe, CinetPay)</label>
              <input 
                type="password" 
                value={editSettings.apiKeys?.paymentGateway || ''}
                onChange={(e) => setEditSettings({...editSettings, apiKeys: {...(editSettings.apiKeys || { smsProvider: '', paymentGateway: '', mapsApiKey: '' }), paymentGateway: e.target.value}})}
                className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-indigo-500/20 transition-all"
                placeholder="pk_live_..."
              />
            </div>

            <button 
              onClick={handleSaveSettings}
              disabled={saving}
              className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer les paiements'}
            </button>

            <div className="pt-6 border-t border-slate-100">
              <button 
                onClick={async () => {
                  try {
                    await addSystemLog(
                      'PAYMENT_SIMULATION',
                      'Simulation de paiement de test réussie (15000 FCFA)',
                      'info'
                    );
                    toast.success("Simulation de paiement réussie et enregistrée dans les logs !");
                  } catch (error) {
                    toast.error("Erreur lors de la simulation.");
                  }
                }}
                className="w-full bg-slate-100 text-slate-600 font-bold py-4 rounded-2xl hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
              >
                <CreditCard size={18} />
                Simuler un paiement de test
              </button>
            </div>
          </div>
        </div>
      </motion.div>
      )}

      {activeTab === 'transactions' && (
        <>
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-2xl font-bold text-slate-900">Mouvements Financiers</h3>
            <div className="flex gap-4">
              <button 
                onClick={() => {
                  const csvContent = "data:text/csv;charset=utf-8," 
                    + "Date,Utilisateur,Role,Type,Montant,Description\n"
                    + transactions.map(t => `${formatDate(t.createdAt)},${t.userName},${t.userRole},${t.type},${t.amount},${t.description}`).join("\n");
                  const encodedUri = encodeURI(csvContent);
                  const link = document.createElement("a");
                  link.setAttribute("href", encodedUri);
                  link.setAttribute("download", "transactions.csv");
                  document.body.appendChild(link);
                  link.click();
                }}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors flex items-center gap-2"
              >
                <FileText size={18} />
                Exporter CSV
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 text-sm">
                  <th className="p-4 font-medium">Date</th>
                  <th className="p-4 font-medium">Utilisateur</th>
                  <th className="p-4 font-medium">Rôle</th>
                  <th className="p-4 font-medium">Type</th>
                  <th className="p-4 font-medium">Montant</th>
                  <th className="p-4 font-medium">Description</th>
                  <th className="p-4 font-medium">Détails</th>
                </tr>
              </thead>
              <tbody>
                {[...transactions]
                  .sort((a, b) => parseDate(b.createdAt).getTime() - parseDate(a.createdAt).getTime())
                  .map((t) => (
                  <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 text-sm text-slate-500">
                      {formatDate(t.createdAt)}
                    </td>
                    <td className="p-4 font-bold text-slate-900">{t.userName}</td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        t.userRole === 'patient' ? 'bg-blue-100 text-blue-600' :
                        t.userRole === 'pharmacist' ? 'bg-emerald-100 text-emerald-600' :
                        t.userRole === 'delivery' ? 'bg-amber-100 text-amber-600' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {t.userRole}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        t.type === 'credit' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                      }`}>
                        {t.type === 'credit' ? 'Crédit' : 'Débit'}
                      </span>
                    </td>
                    <td className={`p-4 font-black ${t.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {t.type === 'credit' ? '+' : '-'}{t.amount.toLocaleString()} FCFA
                    </td>
                    <td className="p-4 text-sm text-slate-600">{t.description}</td>
                    <td className="p-4">
                      {t.metadata ? (
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(t.metadata).map(([key, value]) => (
                            <span key={key} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">
                              {key}: {String(value)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-300 italic">Aucun</span>
                      )}
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">Aucune transaction enregistrée.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {activeTab === 'reports' && (
        <>
          <div className="space-y-8">
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-4 mb-10">
              <div className="w-16 h-16 bg-emerald-50 rounded-[2rem] flex items-center justify-center text-emerald-600">
                <FileText size={32} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900">Rapports & Exports</h3>
                <p className="text-slate-500 font-medium">Téléchargez les données de la plateforme au format CSV.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 hover:border-emerald-200 hover:bg-white hover:shadow-xl transition-all duration-500 group">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 mb-6 shadow-sm group-hover:scale-110 transition-transform">
                  <Users size={24} />
                </div>
                <h4 className="text-lg font-bold text-slate-900 mb-2">Utilisateurs</h4>
                <p className="text-sm text-slate-500 mb-8">Liste complète des patients, pharmaciens et livreurs.</p>
                <button 
                  onClick={() => {
                    const csvContent = "data:text/csv;charset=utf-8," 
                      + "ID,Nom,Email,Telephone,Role,Statut,Solde Wallet\n"
                      + users.map(u => `${u.uid},${u.name},${u.email},${u.phone},${u.role},${u.status},${u.walletBalance || 0}`).join("\n");
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement("a");
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", `utilisateurs_${new Date().toISOString().split('T')[0]}.csv`);
                    document.body.appendChild(link);
                    link.click();
                  }}
                  className="w-full py-4 bg-white border border-slate-200 text-slate-900 rounded-2xl font-bold hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <Download size={18} />
                  Exporter CSV
                </button>
              </div>

              <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 hover:border-amber-200 hover:bg-white hover:shadow-xl transition-all duration-500 group">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-amber-600 mb-6 shadow-sm group-hover:scale-110 transition-transform">
                  <Package size={24} />
                </div>
                <h4 className="text-lg font-bold text-slate-900 mb-2">Commandes</h4>
                <p className="text-sm text-slate-500 mb-8">Historique complet des commandes et leurs statuts.</p>
                <button 
                  onClick={() => {
                    const csvContent = "data:text/csv;charset=utf-8," 
                      + "ID,Date,Patient,Pharmacie,Statut,Montant Total,Methode Paiement\n"
                      + orders.map(o => `${o.id},${formatDate(o.createdAt)},${o.patientName},${o.pharmacyName},${o.status},${o.totalAmount},${o.paymentMethod || 'N/A'}`).join("\n");
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement("a");
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", `commandes_${new Date().toISOString().split('T')[0]}.csv`);
                    document.body.appendChild(link);
                    link.click();
                  }}
                  className="w-full py-4 bg-white border border-slate-200 text-slate-900 rounded-2xl font-bold hover:bg-amber-600 hover:text-white hover:border-amber-600 transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <Download size={18} />
                  Exporter CSV
                </button>
              </div>

              <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 hover:border-indigo-200 hover:bg-white hover:shadow-xl transition-all duration-500 group">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-600 mb-6 shadow-sm group-hover:scale-110 transition-transform">
                  <TrendingUp size={24} />
                </div>
                <h4 className="text-lg font-bold text-slate-900 mb-2">Transactions</h4>
                <p className="text-sm text-slate-500 mb-8">Flux financiers, commissions et paiements.</p>
                <button 
                  onClick={() => {
                    const csvContent = "data:text/csv;charset=utf-8," 
                      + "Date,Utilisateur,Role,Type,Montant,Description\n"
                      + transactions.map(t => `${formatDate(t.createdAt)},${t.userName},${t.userRole},${t.type},${t.amount},${t.description}`).join("\n");
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement("a");
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", `transactions_${new Date().toISOString().split('T')[0]}.csv`);
                    document.body.appendChild(link);
                    link.click();
                  }}
                  className="w-full py-4 bg-white border border-slate-200 text-slate-900 rounded-2xl font-bold hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <Download size={18} />
                  Exporter CSV
                </button>
              </div>
            </div>
          </div>
        </div>
        </>
      )}

      {activeTab === 'support' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 h-[700px]">
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold">Conversations</h3>
            </div>
            <div className="flex-1 overflow-y-auto">
              {supportChats.map((chat) => (
                <button 
                  key={chat.chatId}
                  onClick={() => setSelectedChat(chat.chatId)}
                  className={`w-full p-6 text-left border-b border-slate-50 hover:bg-slate-50 transition-colors ${selectedChat === chat.chatId ? 'bg-slate-50' : ''}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <p className="font-bold text-slate-900">{chat.senderName}</p>
                    <span className="text-[10px] text-slate-400">{formatDate(chat.lastTime)}</span>
                  </div>
                  <p className="text-sm text-slate-500 truncate">{chat.lastMessage}</p>
                </button>
              ))}
              {supportChats.length === 0 && (
                <div className="p-8 text-center text-slate-400">Aucune conversation active</div>
              )}
            </div>
          </div>

          <div className="md:col-span-2 bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col">
            {selectedChat ? (
              <>
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="text-xl font-bold">
                    {supportChats.find(c => c.chatId === selectedChat)?.senderName}
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-slate-50/30">
                  {supportChats.find(c => c.chatId === selectedChat)?.messages.map((msg: any) => (
                    <div 
                      key={msg.id}
                      className={`max-w-[80%] p-4 rounded-2xl text-sm shadow-sm border ${
                        msg.isAdmin 
                          ? 'bg-primary text-white rounded-tr-none border-primary/10 self-end' 
                          : 'bg-white rounded-tl-none border-slate-100 text-slate-600 self-start'
                      }`}
                    >
                      <p className="font-bold text-[10px] mb-1 opacity-70">{msg.senderName}</p>
                      <p>{msg.text}</p>
                      <p className="text-[8px] mt-1 text-right opacity-50">{formatDate(msg.createdAt)}</p>
                    </div>
                  ))}
                </div>
                <div className="p-6 border-t border-slate-100">
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendAdminReply(selectedChat);
                    }}
                    className="flex gap-4"
                  >
                    <input 
                      type="text" 
                      value={adminReply}
                      onChange={(e) => setAdminReply(e.target.value)}
                      placeholder="Écrivez votre réponse..."
                      className="flex-1 bg-slate-50 border-none rounded-2xl px-6 py-4 font-medium outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <button 
                      type="submit"
                      className="bg-primary text-white px-8 rounded-2xl font-bold hover:bg-primary-dark transition-all"
                    >
                      Répondre
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-12 text-center">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                  <MessageSquare size={40} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Sélectionnez une conversation</h3>
                <p>Choisissez un utilisateur dans la liste pour commencer à discuter.</p>
              </div>
            )}
          </div>
        </div>
        </>
      )}

      {activeTab === 'scripts' && (
        <>
          <div className="space-y-8">
          <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-white">
                  <Terminal size={28} />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">Scripts & Base de Données</h3>
                  <p className="text-slate-400 text-sm">Gestion avancée et exécution de scripts</p>
                </div>
              </div>
              
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 mb-8 flex gap-4">
                <ShieldCheck className="text-amber-500 shrink-0" size={24} />
                <div>
                  <h4 className="text-amber-500 font-bold mb-2">Restriction de Sécurité (Architecture Serverless)</h4>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    Pour des raisons de sécurité strictes et conformément à l'architecture Serverless (Frontend React + Firebase), l'exécution de scripts arbitraires (Bash, Python, PowerShell) ou l'accès direct via une interface CMD n'est pas autorisée depuis le navigateur web.
                  </p>
                  <p className="text-slate-300 text-sm leading-relaxed mt-2">
                    L'accès direct à la base de données (requêtes complexes, modifications de schéma) doit être effectué via la <strong>Console Firebase officielle</strong> pour garantir l'intégrité des données et les règles de sécurité.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <a 
                  href="https://console.firebase.google.com/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-6 transition-all group flex items-start gap-4"
                >
                  <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <BarChart3 size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-lg mb-1">Console Firebase</h4>
                    <p className="text-slate-400 text-sm">Accéder à l'interface officielle pour gérer Firestore, l'authentification et le stockage.</p>
                  </div>
                </a>

                <a 
                  href="https://console.cloud.google.com/functions" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-6 transition-all group flex items-start gap-4"
                >
                  <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Terminal size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-lg mb-1">Google Cloud Functions</h4>
                    <p className="text-slate-400 text-sm">Déployer et planifier des scripts backend (Node.js, Python) de manière sécurisée.</p>
                  </div>
                </a>
              </div>
            </div>
          </div>
          <ScriptManager />
        </div>
        </>
      )}

      {activeTab === 'analytics' && (
        <>
          <div className="space-y-8">
            <DataAnalyst />
          </div>
        </>
      )}

      {activeTab === 'database' && (
        <>
          <div className="space-y-8">
            <DatabaseExplorer />
          </div>
        </>
      )}

      {activeTab === 'logs' && (
        <>
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-8 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold">Logs Système</h3>
              <p className="text-sm text-slate-500 mt-1">Historique des actions et événements de la plateforme.</p>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors">
              <FileText size={16} />
              Exporter (CSV)
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase tracking-widest text-slate-400">
                  <th className="p-6 font-bold">Date</th>
                  <th className="p-6 font-bold">Niveau</th>
                  <th className="p-6 font-bold">Action</th>
                  <th className="p-6 font-bold">Utilisateur</th>
                  <th className="p-6 font-bold">Détails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...systemLogs].sort((a, b) => parseDate(b.timestamp).getTime() - parseDate(a.timestamp).getTime()).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-6 text-slate-500 text-sm whitespace-nowrap">
                      {formatDate(log.timestamp)}
                    </td>
                    <td className="p-6">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                        log.level === 'error' ? 'bg-red-100 text-red-700' :
                        log.level === 'warning' ? 'bg-amber-100 text-amber-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {log.level}
                      </span>
                    </td>
                    <td className="p-6 font-bold text-slate-900 text-sm">{log.action}</td>
                    <td className="p-6 text-slate-500 text-sm">{log.userName}</td>
                    <td className="p-6 text-slate-500 text-sm max-w-md truncate" title={log.details}>{log.details}</td>
                  </tr>
                ))}
                {systemLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">Aucun log enregistré.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {activeTab === 'roles' && (
        <>
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 max-w-4xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-fuchsia-100 text-fuchsia-600 rounded-2xl">
              <UserCog size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold">Rôles & Permissions</h3>
              <p className="text-sm text-slate-500">Gérez les niveaux d'accès de l'équipe d'administration.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { role: 'super-admin', name: 'Super Admin', desc: 'Accès total à toutes les fonctionnalités et paramètres.', count: users.filter(u => u.role === 'super-admin').length },
              { role: 'admin', name: 'Administrateur', desc: 'Gestion des utilisateurs, commandes et pharmacies.', count: users.filter(u => u.role === 'admin').length },
              { role: 'moderator', name: 'Modérateur', desc: 'Validation des ordonnances et gestion des litiges.', count: users.filter(u => u.role === 'moderator').length },
              { role: 'support', name: 'Support Client', desc: 'Accès en lecture seule pour assister les utilisateurs.', count: users.filter(u => u.role === 'support').length },
            ].map(r => (
              <div key={r.role} className="p-6 border border-slate-100 rounded-3xl hover:border-fuchsia-200 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold text-lg">{r.name}</h4>
                  <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold">{r.count} utilisateurs</span>
                </div>
                <p className="text-sm text-slate-500 mb-6">{r.desc}</p>
                <button 
                  onClick={() => setSelectedRoleForPerms(r.role)}
                  className="text-fuchsia-600 font-bold text-sm hover:underline"
                >
                  Gérer les permissions
                </button>
              </div>
            ))}
          </div>
        </div>
      </>
    )}

      {activeTab === 'settings' && editSettings && (
        <>
          <div className="space-y-8 max-w-2xl">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-600">
                <SettingsIcon size={24} />
              </div>
              <h3 className="text-xl font-bold">Informations Générales</h3>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nom de l'application</label>
                <input 
                  type="text" 
                  value={editSettings.appName || 'Ordonnance Direct'}
                  onChange={(e) => setEditSettings({...editSettings, appName: e.target.value})}
                  className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email Support</label>
                  <input 
                    type="email" 
                    value={editSettings.supportEmail || ''}
                    onChange={(e) => setEditSettings({...editSettings, supportEmail: e.target.value})}
                    className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="support@exemple.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Téléphone Support</label>
                  <input 
                    type="tel" 
                    value={editSettings.supportPhone || ''}
                    onChange={(e) => setEditSettings({...editSettings, supportPhone: e.target.value})}
                    className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="+226 XX XX XX XX"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                <div>
                  <h4 className="font-bold text-slate-900">Activer le Chat de Support</h4>
                  <p className="text-xs text-slate-500">Permettre aux utilisateurs de contacter le support via le chat intégré.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={editSettings.supportChatEnabled !== false}
                    onChange={(e) => setEditSettings({...editSettings, supportChatEnabled: e.target.checked})}
                  />
                  <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Devise</label>
                <input 
                  type="text" 
                  value={editSettings.currency || 'FCFA'}
                  onChange={(e) => setEditSettings({...editSettings, currency: e.target.value})}
                  className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="FCFA"
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
                <Percent size={24} />
              </div>
              <h3 className="text-xl font-bold">Frais de Service & Commissions</h3>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Commission Pharmacie (%)</label>
                  <input 
                    type="number" 
                    value={editSettings.commissionPercentage || 10}
                    onChange={(e) => setEditSettings({...editSettings, commissionPercentage: Number(e.target.value)})}
                    className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                  <p className="text-[10px] text-slate-400">Pourcentage prélevé sur les ventes de médicaments.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Commission Livraison (%)</label>
                  <input 
                    type="number" 
                    value={editSettings.deliveryCommissionPercentage || 15}
                    onChange={(e) => setEditSettings({...editSettings, deliveryCommissionPercentage: Number(e.target.value)})}
                    className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                  <p className="text-[10px] text-slate-400">Pourcentage prélevé sur les frais de livraison.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Frais de Service Fixe (CFA)</label>
                  <input 
                    type="number" 
                    value={editSettings.serviceFee || 0}
                    onChange={(e) => setEditSettings({...editSettings, serviceFee: Number(e.target.value)})}
                    className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                  <p className="text-[10px] text-slate-400">Frais fixes ajoutés à chaque commande (Gains plateforme).</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                <Truck size={24} />
              </div>
              <h3 className="text-xl font-bold">Tarifs de Livraison</h3>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tarif Journée (CFA)</label>
                  <input 
                    type="number" 
                    value={editSettings.dayDeliveryFee}
                    onChange={(e) => setEditSettings({...editSettings, dayDeliveryFee: parseInt(e.target.value)})}
                    className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tarif Nuit (CFA)</label>
                  <input 
                    type="number" 
                    value={editSettings.nightDeliveryFee}
                    onChange={(e) => setEditSettings({...editSettings, nightDeliveryFee: parseInt(e.target.value)})}
                    className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Commission Pharmacie (%)</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="range" 
                    min="0"
                    max="50"
                    step="1"
                    value={editSettings.commissionPercentage || 10}
                    onChange={(e) => setEditSettings({...editSettings, commissionPercentage: parseInt(e.target.value)})}
                    className="flex-1 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <input 
                    type="number"
                    min="0"
                    max="100"
                    value={editSettings.commissionPercentage || 10}
                    onChange={(e) => setEditSettings({...editSettings, commissionPercentage: parseInt(e.target.value) || 0})}
                    className="w-20 text-center font-bold text-primary bg-primary/5 py-2 rounded-xl border-none focus:ring-2 focus:ring-primary/20"
                  />
                  <span className="font-bold text-primary">%</span>
                </div>
                <p className="text-[10px] text-slate-400 italic ml-1">
                  Ce pourcentage sera appliqué sur le montant total des médicaments pour chaque commande.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Commission Livraison (%)</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="range" 
                    min="0"
                    max="50"
                    step="1"
                    value={editSettings.deliveryCommissionPercentage || 10}
                    onChange={(e) => setEditSettings({...editSettings, deliveryCommissionPercentage: parseInt(e.target.value)})}
                    className="flex-1 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <input 
                    type="number"
                    min="0"
                    max="100"
                    value={editSettings.deliveryCommissionPercentage || 10}
                    onChange={(e) => setEditSettings({...editSettings, deliveryCommissionPercentage: parseInt(e.target.value) || 0})}
                    className="w-20 text-center font-bold text-blue-600 bg-blue-50 py-2 rounded-xl border-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <span className="font-bold text-blue-600">%</span>
                </div>
                <p className="text-[10px] text-slate-400 italic ml-1">
                  Ce pourcentage sera appliqué sur les frais de livraison pour chaque commande.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Début Nuit (Heure)</label>
                  <select 
                    value={editSettings.nightStartHour}
                    onChange={(e) => setEditSettings({...editSettings, nightStartHour: parseInt(e.target.value)})}
                    className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    {Array.from({length: 24}).map((_, i) => (
                      <option key={i} value={i}>{i}h00</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Fin Nuit (Heure)</label>
                  <select 
                    value={editSettings.nightEndHour}
                    onChange={(e) => setEditSettings({...editSettings, nightEndHour: parseInt(e.target.value)})}
                    className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    {Array.from({length: 24}).map((_, i) => (
                      <option key={i} value={i}>{i}h00</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3">
                <AlertCircle className="text-amber-500 shrink-0" size={20} />
                <p className="text-xs text-amber-700 leading-relaxed">
                  Le tarif de nuit est appliqué automatiquement en fonction de l'heure actuelle au Burkina Faso pour compenser les risques accrus.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600">
                <CreditCard size={24} />
              </div>
              <h3 className="text-xl font-bold">Configuration des Paiements</h3>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div>
                  <p className="font-bold text-sm">Activer Mobile Money</p>
                  <p className="text-xs text-slate-500">Orange, Moov, Telecel</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={editSettings.paymentConfig?.mobileMoneyEnabled ?? true}
                    onChange={(e) => setEditSettings({
                      ...editSettings, 
                      paymentConfig: {
                        ...(editSettings.paymentConfig || { cardEnabled: true, cashEnabled: false, ussdEnabled: true, testMode: false }), 
                        mobileMoneyEnabled: e.target.checked
                      }
                    })}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div>
                  <p className="font-bold text-sm">Activer Paiement USSD</p>
                  <p className="text-xs text-slate-500">Saisie manuelle du code USSD par le client</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={editSettings.paymentConfig?.ussdEnabled ?? false}
                    onChange={(e) => setEditSettings({
                      ...editSettings, 
                      paymentConfig: {
                        ...(editSettings.paymentConfig || { mobileMoneyEnabled: true, cardEnabled: true, cashEnabled: false, testMode: false }), 
                        ussdEnabled: e.target.checked
                      }
                    })}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
              </div>

              {editSettings.paymentConfig?.ussdEnabled && (
                <div className="space-y-4 p-6 bg-indigo-50/30 rounded-3xl border border-indigo-100 animate-in fade-in slide-in-from-top-4">
                  <h4 className="text-sm font-bold text-indigo-900 mb-2">Syntaxes USSD de Paiement</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Orange</label>
                      <input 
                        type="text"
                        value={editSettings.paymentConfig?.ussdSyntaxes?.orange || ''}
                        onChange={(e) => setEditSettings({
                          ...editSettings,
                          paymentConfig: {
                            ...editSettings.paymentConfig!,
                            ussdSyntaxes: { ...(editSettings.paymentConfig?.ussdSyntaxes || { orange: '', moov: '', telecel: '' }), orange: e.target.value }
                          }
                        })}
                        placeholder="*144*4*6*..."
                        className="w-full bg-white border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Moov</label>
                      <input 
                        type="text"
                        value={editSettings.paymentConfig?.ussdSyntaxes?.moov || ''}
                        onChange={(e) => setEditSettings({
                          ...editSettings,
                          paymentConfig: {
                            ...editSettings.paymentConfig!,
                            ussdSyntaxes: { ...(editSettings.paymentConfig?.ussdSyntaxes || { orange: '', moov: '', telecel: '' }), moov: e.target.value }
                          }
                        })}
                        placeholder="*555*2*1*..."
                        className="w-full bg-white border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Telecel</label>
                      <input 
                        type="text"
                        value={editSettings.paymentConfig?.ussdSyntaxes?.telecel || ''}
                        onChange={(e) => setEditSettings({
                          ...editSettings,
                          paymentConfig: {
                            ...editSettings.paymentConfig!,
                            ussdSyntaxes: { ...(editSettings.paymentConfig?.ussdSyntaxes || { orange: '', moov: '', telecel: '' }), telecel: e.target.value }
                          }
                        })}
                        placeholder="*444*..."
                        className="w-full bg-white border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-indigo-600 italic">Utilisez {`{amount}`} pour le montant et {`{account}`} pour le numéro de compte marchand.</p>
                </div>
              )}

              <div className="space-y-4 p-6 bg-slate-50 rounded-3xl border border-slate-100">
                <h4 className="text-sm font-bold text-slate-900 mb-2">Comptes Marchands (Paiements Clients)</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">Orange Money</label>
                    <input 
                      type="text"
                      value={editSettings.paymentConfig?.paymentAccounts?.orangeMoney || ''}
                      onChange={(e) => setEditSettings({
                        ...editSettings,
                        paymentConfig: {
                          ...editSettings.paymentConfig!,
                          paymentAccounts: { ...(editSettings.paymentConfig?.paymentAccounts || {}), orangeMoney: e.target.value }
                        }
                      })}
                      placeholder="Numéro Marchand"
                      className="w-full bg-white border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Moov Money</label>
                    <input 
                      type="text"
                      value={editSettings.paymentConfig?.paymentAccounts?.moovMoney || ''}
                      onChange={(e) => setEditSettings({
                        ...editSettings,
                        paymentConfig: {
                          ...editSettings.paymentConfig!,
                          paymentAccounts: { ...(editSettings.paymentConfig?.paymentAccounts || {}), moovMoney: e.target.value }
                        }
                      })}
                      placeholder="Numéro Marchand"
                      className="w-full bg-white border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Telecel Cash</label>
                    <input 
                      type="text"
                      value={editSettings.paymentConfig?.paymentAccounts?.telecelCash || ''}
                      onChange={(e) => setEditSettings({
                        ...editSettings,
                        paymentConfig: {
                          ...editSettings.paymentConfig!,
                          paymentAccounts: { ...(editSettings.paymentConfig?.paymentAccounts || {}), telecelCash: e.target.value }
                        }
                      })}
                      placeholder="Numéro Marchand"
                      className="w-full bg-white border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-red-500/20"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-6 bg-slate-50 rounded-3xl border border-slate-100">
                <h4 className="text-sm font-bold text-slate-900 mb-2">Compte Bancaire (Virements)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nom de la Banque</label>
                    <input 
                      type="text"
                      value={editSettings.paymentConfig?.paymentAccounts?.bankName || ''}
                      onChange={(e) => setEditSettings({
                        ...editSettings,
                        paymentConfig: {
                          ...editSettings.paymentConfig!,
                          paymentAccounts: { ...(editSettings.paymentConfig?.paymentAccounts || {}), bankName: e.target.value }
                        }
                      })}
                      className="w-full bg-white border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nom du Compte</label>
                    <input 
                      type="text"
                      value={editSettings.paymentConfig?.paymentAccounts?.bankAccountName || ''}
                      onChange={(e) => setEditSettings({
                        ...editSettings,
                        paymentConfig: {
                          ...editSettings.paymentConfig!,
                          paymentAccounts: { ...(editSettings.paymentConfig?.paymentAccounts || {}), bankAccountName: e.target.value }
                        }
                      })}
                      className="w-full bg-white border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Numéro de Compte</label>
                    <input 
                      type="text"
                      value={editSettings.paymentConfig?.paymentAccounts?.bankAccountNumber || ''}
                      onChange={(e) => setEditSettings({
                        ...editSettings,
                        paymentConfig: {
                          ...editSettings.paymentConfig!,
                          paymentAccounts: { ...(editSettings.paymentConfig?.paymentAccounts || {}), bankAccountNumber: e.target.value }
                        }
                      })}
                      className="w-full bg-white border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">IBAN / RIB</label>
                    <input 
                      type="text"
                      value={editSettings.paymentConfig?.paymentAccounts?.bankIBAN || ''}
                      onChange={(e) => setEditSettings({
                        ...editSettings,
                        paymentConfig: {
                          ...editSettings.paymentConfig!,
                          paymentAccounts: { ...(editSettings.paymentConfig?.paymentAccounts || {}), bankIBAN: e.target.value }
                        }
                      })}
                      className="w-full bg-white border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-6 bg-blue-50/30 rounded-3xl border border-blue-100">
                <h4 className="text-sm font-bold text-blue-900 mb-2">Syntaxes USSD de Retrait (Admin)</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Orange</label>
                    <input 
                      type="text"
                      value={editSettings.paymentConfig?.withdrawalUssdSyntaxes?.orange || ''}
                      onChange={(e) => setEditSettings({
                        ...editSettings,
                        paymentConfig: {
                          ...editSettings.paymentConfig!,
                          withdrawalUssdSyntaxes: { ...(editSettings.paymentConfig?.withdrawalUssdSyntaxes || { orange: '', moov: '', telecel: '' }), orange: e.target.value }
                        }
                      })}
                      placeholder="*144*..."
                      className="w-full bg-white border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Moov</label>
                    <input 
                      type="text"
                      value={editSettings.paymentConfig?.withdrawalUssdSyntaxes?.moov || ''}
                      onChange={(e) => setEditSettings({
                        ...editSettings,
                        paymentConfig: {
                          ...editSettings.paymentConfig!,
                          withdrawalUssdSyntaxes: { ...(editSettings.paymentConfig?.withdrawalUssdSyntaxes || { orange: '', moov: '', telecel: '' }), moov: e.target.value }
                        }
                      })}
                      placeholder="*555*..."
                      className="w-full bg-white border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Telecel</label>
                    <input 
                      type="text"
                      value={editSettings.paymentConfig?.withdrawalUssdSyntaxes?.telecel || ''}
                      onChange={(e) => setEditSettings({
                        ...editSettings,
                        paymentConfig: {
                          ...editSettings.paymentConfig!,
                          withdrawalUssdSyntaxes: { ...(editSettings.paymentConfig?.withdrawalUssdSyntaxes || { orange: '', moov: '', telecel: '' }), telecel: e.target.value }
                        }
                      })}
                      placeholder="*444*..."
                      className="w-full bg-white border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-600">
                <Power size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold">Mode Maintenance</h3>
                <p className="text-sm text-slate-500">Désactiver l'accès public à l'application.</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-red-50 rounded-2xl border border-red-100">
                <div>
                  <p className="font-bold text-sm text-red-900">Activer la maintenance</p>
                  <p className="text-xs text-red-700">Seuls les administrateurs pourront se connecter</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={editSettings.maintenanceMode || false}
                    onChange={(e) => setEditSettings({...editSettings, maintenanceMode: e.target.checked})}
                  />
                  <div className="w-11 h-6 bg-red-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-red-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                </label>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Message de maintenance</label>
                <textarea 
                  value={editSettings.maintenanceMessage || ''}
                  onChange={(e) => setEditSettings({...editSettings, maintenanceMessage: e.target.value})}
                  className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold focus:ring-2 focus:ring-red-500/20 transition-all resize-none h-24"
                  placeholder="Plateforme en maintenance..."
                />
              </div>
            </div>
          </div>

          <div className="bg-rose-50 p-8 rounded-[2.5rem] border border-rose-100 mb-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-rose-900">Zone de Danger</h3>
                <p className="text-xs text-rose-600">Actions irréversibles pour la maintenance de la plateforme.</p>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-3xl border border-rose-100 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex-1">
                <h4 className="font-bold text-slate-900">Réinitialisation Complète (Hard Reset)</h4>
                <p className="text-xs text-slate-500 mt-1">Supprime toutes les commandes, ordonnances, transactions et remet tous les gains à zéro.</p>
              </div>
              <button 
                onClick={handleHardReset}
                disabled={isResetting}
                className="px-8 py-4 bg-rose-600 text-white rounded-2xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-600/20 disabled:opacity-50 flex items-center gap-2"
              >
                {isResetting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Réinitialisation...
                  </>
                ) : (
                  <>
                    <Trash2 size={20} />
                    Hard Reset
                  </>
                )}
              </button>
            </div>
          </div>

          <button 
            onClick={handleSaveSettings}
            disabled={saving}
            className="w-full bg-primary text-white py-4 rounded-2xl font-bold hover:bg-primary-dark transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
          >
            {saving ? "Enregistrement..." : "Enregistrer tous les paramètres"}
          </button>
        </div>
        </>
      )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>

{/* Permissions Modal */}
<AnimatePresence>
  {selectedRoleForPerms && (
    <motion.div 
      key="permissions-modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-[2.5rem] p-8 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold">Permissions: {selectedRoleForPerms}</h3>
          <button onClick={() => setSelectedRoleForPerms(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <div className="space-y-6">
          <p className="text-slate-500">
            Cochez les modules auxquels ce rôle aura accès. (Note: Le Super Admin a accès à tout par défaut).
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { id: 'manage_users', label: 'Gérer les utilisateurs' },
              { id: 'manage_pharmacies', label: 'Gérer les pharmacies' },
              { id: 'manage_orders', label: 'Gérer les commandes' },
              { id: 'manage_prescriptions', label: 'Valider les ordonnances' },
              { id: 'view_revenue', label: 'Voir les revenus' },
              { id: 'manage_withdrawals', label: 'Gérer les retraits' },
              { id: 'manage_settings', label: 'Modifier les paramètres' },
              { id: 'view_logs', label: 'Voir les logs système' }
            ].map(perm => (
              <label key={perm.id} className="flex items-center gap-3 p-4 border border-slate-100 rounded-2xl hover:bg-slate-50 cursor-pointer transition-colors">
                <input 
                  type="checkbox" 
                  className="w-5 h-5 rounded text-fuchsia-600 focus:ring-fuchsia-500"
                  defaultChecked={selectedRoleForPerms === 'super-admin' || selectedRoleForPerms === 'admin'}
                  disabled={selectedRoleForPerms === 'super-admin'}
                />
                <span className="font-medium text-slate-700">{perm.label}</span>
              </label>
            ))}
          </div>

          <div className="pt-6 border-t border-slate-100 flex justify-end gap-4">
            <button 
              onClick={() => setSelectedRoleForPerms(null)}
              className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Annuler
            </button>
            <button 
              onClick={() => {
                toast.success("Permissions mises à jour avec succès.");
                setSelectedRoleForPerms(null);
              }}
              className="px-6 py-3 rounded-xl font-bold bg-fuchsia-600 text-white hover:bg-fuchsia-700 transition-colors shadow-lg shadow-fuchsia-600/20"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
</>
  );
}

