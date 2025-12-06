// config.js

// 🔥 測試模式開關 🔥
// true = 開啟測試模式 (免 Google 登入，使用模擬帳號)
// false = 正式模式 (需要 Google 登入)
const TEST_MODE = false;

// 🧪 模擬的使用者資料 (當 TEST_MODE = true 時使用)
const MOCK_USER = {
    email: "test_user@example.com",
    displayName: "測試員(免登入)",
    photoURL: "https://via.placeholder.com/50", // 假頭像
    uid: "mock_uid_12345"
};

// =========================================================

// Firebase Config
const firebaseConfig = { apiKey: "AIzaSyAQPANPPx5A3FtpISPcfX-kHPtG0PC6irA", authDomain: "jtpp-cams.firebaseapp.com", projectId: "jtpp-cams", storageBucket: "jtpp-cams.firebasestorage.app", messagingSenderId: "334286192470", appId: "1:334286192470:web:9080eb43436b3a3fdfe0f7" };
firebase.initializeApp(firebaseConfig);

// 匯出全域變數供其他檔案使用
const db = firebase.firestore();
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

// 電廠與距離設定
const PLANT_LOCATION = { lat: 23.564675316036272, lng: 119.66034190357468 };
const MAX_DIST = 500;

// 班別規則
const SHIFTS = {
    "normal": { name: "正常班", end: "16:30", breakDur: 0.5 },
    "cleaning": { name: "清潔班", end: "17:00", breakDur: 1.0 }
};

// 全域狀態變數
let currentUser = null;
let userData = {}; 
let currentLat = 0, currentLng = 0, currentDist = 9999;
let leaveData = { annual: {total:0, used:0}, comp: {total:0, used:0} };
let currentHistoryType = 'clock';
