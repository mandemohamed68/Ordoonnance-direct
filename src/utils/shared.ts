import { doc, collection, setDoc, serverTimestamp, getDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { sendSMS } from './sms';

export const PRIMARY_ADMIN_EMAIL = "mandemohamed68@gmail.com";
export const SUPER_ADMIN_EMAILS = [PRIMARY_ADMIN_EMAIL];

export const isPrimaryAdminEmail = (email: string | null | undefined) => 
  email === PRIMARY_ADMIN_EMAIL;

export const isSuperAdminEmail = (email: string | null | undefined) => 
  email ? SUPER_ADMIN_EMAILS.includes(email) : false;

export const formatDate = (date: any, format: 'full' | 'date' | 'time' | 'short' | 'dateTime' = 'full') => {
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
    case 'dateTime':
      return d.toLocaleString('fr-FR', { 
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit' 
      });
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

/**
 * Calculates the currently active on-call group based on the rotation settings and current date.
 */
export const getCurrentOnCallGroup = (rotation: any): number => {
  if (!rotation) return 1;

  // New manual rotation logic
  if (rotation.currentGroup) {
    // If the admin strictly set the current group with start/end dates, use it directly.
    return rotation.currentGroup;
  }

  // Backward compatibility with baseMondayDate
  if (rotation.baseMondayDate && rotation.baseGroup) {
    const baseDate = new Date(rotation.baseMondayDate);
    // Ensure baseDate is set to midnight to avoid timezone issues
    baseDate.setHours(0, 0, 0, 0);

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Calculate difference in days
    const diffTime = Math.abs(now.getTime() - baseDate.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    // Calculate difference in weeks
    const diffWeeks = Math.floor(diffDays / 7);

    // Calculate current group
    let currentGroup = rotation.baseGroup;
    if (now < baseDate) {
      currentGroup = ((rotation.baseGroup - 1 - (diffWeeks % 4) + 4) % 4) + 1;
    } else {
      currentGroup = ((rotation.baseGroup - 1 + diffWeeks) % 4) + 1;
    }

    return currentGroup;
  }

  return 1;
};

/**
 * Determines if the current time falls within the on-call hours for a given city.
 */
export const isCityOnCallNow = (startTime: string, endTime: string): boolean => {
  if (!startTime || !endTime) return false;

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMinute;

  const [startHour, startMinute] = startTime.split(':').map(Number);
  const startTimeInMinutes = startHour * 60 + startMinute;

  const [endHour, endMinute] = endTime.split(':').map(Number);
  const endTimeInMinutes = endHour * 60 + endMinute;

  if (startTimeInMinutes < endTimeInMinutes) {
    // Normal case: e.g., 08:00 to 19:00
    return currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes;
  } else {
    // Overnight case: e.g., 19:00 to 08:00
    return currentTimeInMinutes >= startTimeInMinutes || currentTimeInMinutes <= endTimeInMinutes;
  }
};

/**
 * Calculates the distance between two coordinates in kilometers using the Haversine formula.
 */
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
};

const deg2rad = (deg: number): number => {
  return deg * (Math.PI / 180);
};

