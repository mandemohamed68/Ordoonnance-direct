import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X, ChevronRight } from 'lucide-react';
import { doc, collection, query, where, onSnapshot, addDoc, updateDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { formatDate } from '../utils/shared';

interface OrderChatProps {
  orderId: string;
  userId: string;
  userName: string;
  userRole: string;
  onClose: () => void;
}

export function OrderChat({ orderId, userId, userName, userRole, onClose }: OrderChatProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [order, setOrder] = useState<any>(null);

  useEffect(() => {
    const orderRef = doc(db, 'orders', orderId);
    const unsubOrder = onSnapshot(orderRef, (doc) => {
      if (doc.exists()) {
        setOrder({ id: doc.id, ...doc.data() });
        // Reset unread count for current user role when chat is open
        const data = doc.data();
        if (data.unreadCounts?.[userRole] > 0) {
          updateDoc(orderRef, {
            [`unreadCounts.${userRole}`]: 0
          }).catch(err => console.error("Error resetting unread count:", err));
        }
      }
    });

    const q = query(
      collection(db, 'chat_messages'),
      where('orderId', '==', orderId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'chat_messages'));
    
    return () => {
      unsubOrder();
      unsubscribe();
    };
  }, [orderId, userRole]);

  const sortedMessages = React.useMemo(() => {
    return [...messages].sort((a: any, b: any) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
      return dateA - dateB;
    });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    try {
      await addDoc(collection(db, 'chat_messages'), {
        orderId,
        senderId: userId,
        senderName: userName,
        senderRole: userRole,
        text: newMessage,
        createdAt: serverTimestamp()
      });

      // Increment unread counts for other participants
      const orderRef = doc(db, 'orders', orderId);
      const updates: any = {};
      const roles = ['patient', 'pharmacist', 'delivery', 'admin'];
      roles.forEach(role => {
        if (role !== userRole) {
          updates[`unreadCounts.${role}`] = increment(1);
        }
      });
      await updateDoc(orderRef, updates);

      setNewMessage('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'chat_messages');
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'patient': return 'bg-emerald-600';
      case 'pharmacist': return 'bg-blue-600';
      case 'delivery': return 'bg-amber-600';
      case 'admin':
      case 'super-admin': return 'bg-purple-600';
      default: return 'bg-slate-600';
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full overflow-hidden flex flex-col h-[80vh]"
      >
        <div className={`p-6 border-b border-slate-100 flex items-center justify-between text-white ${getRoleColor(userRole)}`}>
          <div className="flex items-center gap-3">
            <MessageCircle size={24} />
            <div>
              <h3 className="font-bold">Discussion Commande</h3>
              <p className="text-[10px] opacity-80">#{orderId.slice(-6).toUpperCase()}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50">
          <AnimatePresence mode="popLayout">
            {sortedMessages.map((m, idx) => (
              <motion.div 
                key={m.id || idx} 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex flex-col ${m.senderId === userId ? 'items-end' : 'items-start'}`}
              >
                <div className={`max-w-[80%] p-4 rounded-2xl text-sm ${
                  m.senderId === userId ? `${getRoleColor(m.senderRole || userRole)} text-white rounded-tr-none` : 'bg-white text-slate-800 rounded-tl-none shadow-sm'
                }`}>
                  <div className="flex items-center gap-2 mb-1 opacity-70">
                    <span className="font-bold text-[10px]">{m.senderName}</span>
                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-black/10 uppercase tracking-wider">{m.senderRole || 'User'}</span>
                  </div>
                  <p>{m.text}</p>
                </div>
                <p className="text-[9px] text-slate-400 mt-1">{m.createdAt ? formatDate(m.createdAt, 'time') : 'Envoi...'}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="p-4 bg-white border-t border-slate-100 flex gap-2">
          <input 
            type="text" 
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Écrivez votre message..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500"
          />
          <button 
            onClick={sendMessage}
            className={`w-12 h-12 text-white rounded-xl flex items-center justify-center transition-all ${getRoleColor(userRole)} hover:opacity-90`}
          >
            <ChevronRight size={24} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
