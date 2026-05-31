// Firebase Service Worker — Manager & Cashier Panel
// Background push message handler

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAIehYi9V4FJTlPBBza44MZXb15HTl1Yes',
  authDomain: 'rkm-inv.firebaseapp.com',
  projectId: 'rkm-inv',
  storageBucket: 'rkm-inv.firebasestorage.app',
  messagingSenderId: '859269998887',
  appId: '1:859269998887:web:b46eec8fb44cde530aa102',
});

const messaging = firebase.messaging();

const emojiMap = {
  item_sold: '💰',
  item_damaged: '⚠️',
  item_stolen: '🚨',
  stock_added: '📦',
};

messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  const data = payload.data || {};
  const emoji = emojiMap[data.type] || '🔔';

  self.registration.showNotification(`${emoji} ${title || 'RKM Jewellers'}`, {
    body: body || '',
    icon: icon || '/rkm-logo-cropped.png',
    badge: '/rkm-logo-cropped.png',
    tag: data.type || 'rkm-notif',
    data: { url: data.url || '/dashboard' },
    requireInteraction: true,
    vibrate: [200, 100, 200],
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});
