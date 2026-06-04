importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyB_lZqseELqMCLRsQ_X_ToDl0XpGlRpwyQ",
    authDomain: "vibegram-b463f.firebaseapp.com",
    projectId: "vibegram-b463f",
    storageBucket: "vibegram-b463f.firebasestorage.app",
    messagingSenderId: "1067656273348",
    appId: "1:1067656273348:web:8ad7a2c87f2112e21c9891"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Firebase SDK автоматически перехватывает пуши в фоне (когда браузер полностью закрыт или свернут),
// показывает системное уведомление и, благодаря fcm_options.link из payload,
// КОРРЕКТНО открывает/сворачивает нужную вкладку и перекидывает пользователя прямо в чат по клику!
