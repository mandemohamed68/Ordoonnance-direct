importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// This is a placeholder config. In a real app, you'd inject this during build or fetch it.
const firebaseConfig = {
  projectId: "gen-lang-client-0319354727",
  appId: "1:738092416105:web:034f1f42a682e5a6e8f6f8",
  apiKey: "AIzaSyDvjVaqX71LSoQsgvFnHOzaWXlNz1SEMO4",
  authDomain: "gen-lang-client-0319354727.firebaseapp.com",
  messagingSenderId: "738092416105"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification?.title || 'Nouvelle notification';
  const notificationOptions = {
    body: payload.notification?.body || 'Vous avez un nouveau message.',
    icon: '/icon-192x192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
