export type UserRole = 'patient' | 'pharmacist' | 'delivery' | 'admin' | 'super-admin';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  address?: string;
  photoUrl?: string;
  pharmacyId?: string;
  pharmacyName?: string;
  pharmacyLocation?: string;
  authorizationNumber?: string;
  cityId?: string;
  groupId?: string;
  idCardFront?: string;
  idCardBack?: string;
  acceptedTerms?: boolean;
  location?: { lat: number; lng: number };
  lastLocationUpdate?: any;
  walletBalance?: number;
  pharmacistBalance?: number;
  deliveryBalance?: number;
  status?: 'active' | 'suspended' | 'pending' | 'blocked' | 'test' | 'rejected';
  permissions?: string[];
  createdAt?: any;
}

export interface Pharmacy {
  id: string;
  name: string;
  address: string;
  location?: { lat: number; lng: number };
  phone?: string;
  licenseNumber?: string;
  locality?: string;
  cityId: string;
  groupId: string;
  isOnDuty?: boolean;
  status?: 'active' | 'suspended' | 'maintenance';
}

export interface Prescription {
  id: string;
  patientId: string;
  patientName?: string;
  hospitalLocation?: string;
  distance?: number;
  imageUrl: string;
  extractedData?: string;
  selectedMedications?: string[];
  requestType?: 'all' | 'partial';
  status: 'draft' | 'submitted' | 'validated' | 'rejected' | 'rejected_by_limit' | 'paid';
  createdAt: any;
  lockedBy?: string;
  lockedAt?: any;
  rejectedBy?: string[];
  rejectionCount?: number;
  quoteCount?: number; // Tracks number of submitted quotes
  patientLocation?: { lat: number; lng: number };
  cityId?: string;
  landmark?: string;
  facadePhoto?: string;
}

export interface OrderItem {
  name: string;
  price: number;
  quantity: number;
  equivalent?: string;
  equivalentPrice?: number;
  equivalentQuantity?: number;
  isUnavailable?: boolean;
}

export interface Order {
  id: string;
  prescriptionId?: string;
  prescriptionImageUrl?: string;
  patientId: string;
  patientName?: string;
  patientPhone?: string;
  hospitalLocation?: string;
  cityId?: string;
  pharmacistId?: string;
  pharmacyName?: string;
  pharmacyLocation?: string;
  deliveryId?: string;
  deliveryPersonName?: string;
  deliveryPersonPhone?: string;
  deliveryPersonPhoto?: string;
  deliveryLocation?: { lat: number; lng: number };
  patientLocation?: { lat: number; lng: number };
  pharmacyLocationCoords?: { lat: number; lng: number };
  driverLocation?: { lat: number; lng: number };
  pickupCode?: string;
  deliveryCode?: string;
  isHandedOver?: boolean;
  deliveryPhoto?: string;
  deliverySignature?: string;
  status: 'pending_quote' | 'pending_payment' | 'paid' | 'preparing' | 'ready' | 'delivering' | 'completed' | 'quote_rejected';
  patientReview?: {
    rating: number;
    comment: string;
    createdAt: any;
  };
  deliveryMethod?: 'delivery' | 'pickup';
  quoteType?: 'full' | 'partial';
  items?: OrderItem[];
  totalAmount?: number;
  medicationTotal?: number;
  deliveryFee?: number;
  serviceFee?: number;
  platformFee?: number;
  pharmacyAmount?: number;
  deliveryAmount?: number;
  platformAmount?: number;
  paymentMethod?: 'mobile_money' | 'card' | 'cash' | 'ussd';
  paymentStatus?: 'pending' | 'completed' | 'failed';
  rejectedBy?: string[];
  createdAt: any;
  updatedAt: any;
  history?: {
    status: string;
    timestamp: string;
    label: string;
  }[];
  unreadCounts?: {
    patient: number;
    pharmacist: number;
    delivery: number;
    admin: number;
  };
  landmark?: string;
  facadePhoto?: string;
}

export interface Settings {
  appName?: string;
  supportEmail?: string;
  supportPhone?: string;
  supportChatEnabled?: boolean;
  currency?: string;
  dayDeliveryFee: number;
  nightDeliveryFee: number;
  nightStartHour: number;
  nightEndHour: number;
  commissionPercentage: number; // Pharmacy commission
  deliveryCommissionPercentage?: number;
  serviceFee?: number;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
  googleAuthEnabled?: boolean;
  paymentConfig?: {
    mobileMoneyEnabled: boolean;
    cardEnabled: boolean;
    cashEnabled: boolean;
    ussdEnabled: boolean;
    testMode: boolean;
    ussdSyntaxes?: {
      orange: string;
      moov: string;
      telecel: string;
    };
    withdrawalUssdSyntaxes?: {
      orange: string;
      moov: string;
      telecel: string;
    };
    paymentAccounts?: {
      orangeMoney?: string;
      moovMoney?: string;
      telecelCash?: string;
      bankName?: string;
      bankAccountName?: string;
      bankAccountNumber?: string;
      bankIBAN?: string;
    };
  };
  otpConfig?: {
    enabled: boolean;
    loginOtp: boolean;
    orderOtp: boolean;
    customMessageTemplate: string;
  };
  apiKeys?: {
    smsProvider?: string;
    paymentGateway?: string;
    mapsApiKey?: string;
  };
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  paymentMethod: string;
  paymentDetails: string;
  createdAt: any;
  processedAt?: any;
}

export interface SystemLog {
  id: string;
  action: string;
  userId: string;
  userName: string;
  details: string;
  timestamp: any;
  level: 'info' | 'warning' | 'error';
}

export interface Transaction {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  amount: number;
  type: 'credit' | 'debit';
  description: string;
  referenceId?: string;
  createdAt: any;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  type: 'quote_request' | 'new_mission' | 'system' | 'payment' | 'withdrawal';
  referenceId?: string;
  createdAt: any;
}

export interface City {
  id: string;
  name: string;
  location?: { lat: number; lng: number };
  onCallStartTime: string; // HH:mm
  onCallEndTime: string;   // HH:mm
  status: 'active' | 'suspended';
}

export interface OnCallRotation {
  id: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  currentGroup?: number; // 1-4
  // Backward compatibility properties
  baseMondayDate?: string; 
  baseGroup?: number;      
}

export interface ChatMessage {
  id: string;
  orderId: string;
  senderId: string;
  senderName: string;
  senderRole?: string;
  text?: string;
  voiceNoteUrl?: string;
  type: 'text' | 'voice';
  createdAt: any;
}

export interface OfflinePrescription {
  tempId: string;
  patientId: string;
  patientName: string;
  imageUrl: string;
  facadePhoto?: string;
  landmark?: string;
  patientLocation?: { lat: number; lng: number };
  cityId?: string;
  createdAt: number;
}
