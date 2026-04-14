import { doc, collection, setDoc, serverTimestamp, getDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { sendSMS } from './sms';

export const SUPER_ADMIN_EMAILS = ["mandemohamed68@gmail.com", "nmetechnologiegroup@gmail.com"];

export const isSuperAdminEmail = (email: string | null | undefined) => 
  email ? SUPER_ADMIN_EMAILS.includes(email) : false;

export const formatDate = (date: any, format: 'full' | 'date' | 'time' | 'short' = 'full') => {
  if (!date) return 'Date inconnue';
  
  let d: Date;
  if (date?.toDate && typeof date.toDate === 'function') {
    d = date.toDate();
  } else if (date instanceof Date) {
    d = date;
  } else if (date?.seconds !== undefined) {
    d = new Date(date.seconds * 1000 + (date.nanoseconds || 0) / 1000000);
  } else {
    d = new Date(date);
  }

  if (isNaN(d.getTime())) return 'Date inconnue';

  switch (format) {
    case 'date':
      return d.toLocaleDateString('fr-FR');
    case 'time':
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    case 'short':
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    default:
      return d.toLocaleString('fr-FR');
  }
};

export const logTransaction = async (userId: string, userName: string, userRole: string, amount: number, type: 'credit' | 'debit', description: string, referenceId?: string) => {
  try {
    const txRef = doc(collection(db, 'transactions'));
    await setDoc(txRef, {
      id: txRef.id,
      userId,
      userName,
      userRole,
      amount,
      type,
      description,
      referenceId: referenceId || null,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Failed to log transaction", error);
  }
};

export const createNotification = async (userId: string, title: string, message: string, type: 'quote_request' | 'new_mission' | 'system' | 'payment' | 'withdrawal', referenceId?: string) => {
  try {
    const notifRef = doc(collection(db, 'notifications'));
    await setDoc(notifRef, {
      id: notifRef.id,
      userId,
      title,
      message,
      read: false,
      type,
      referenceId: referenceId || null,
      createdAt: serverTimestamp()
    });

    // Send SMS notification
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data() as UserProfile;
        if (userData.phone) {
          await sendSMS(userData.phone, `${title}: ${message}`);
        }
      }
    } catch (smsErr) {
      console.warn("Failed to send SMS notification:", smsErr);
    }
  } catch (error) {
    console.error("Failed to create notification", error);
  }
};

export const notifyDeliveryDrivers = async (title: string, message: string, orderId: string) => {
  try {
    const driversQuery = query(collection(db, 'users'), where('role', '==', 'delivery'));
    const driversSnapshot = await getDocs(driversQuery);
    
    const notifications = driversSnapshot.docs.map(driverDoc => {
      const driverId = driverDoc.id;
      return createNotification(driverId, title, message, 'new_mission', orderId);
    });
    
    await Promise.all(notifications);
  } catch (error) {
    console.error("Failed to notify delivery drivers", error);
  }
};

/**
 * Compresses an image to a maximum dimension and quality to avoid hitting Firestore 1MB document limit.
 */
export const compressImage = (file: File, maxWidth = 1024, maxHeight = 1024, quality = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

