// auth.js

// 登入按鈕觸發
function loginGoogle() {
    if (TEST_MODE) {
        alert("測試模式：直接模擬登入");
        handleLoginSuccess(MOCK_USER);
    } else {
        auth.signInWithPopup(provider).catch(e => alert(e.message));
    }
}

// 初始化檢查
document.addEventListener("DOMContentLoaded", () => {
    
    if (TEST_MODE) {
        console.log("⚠️ 系統處於測試模式，略過 Firebase Auth");
        document.getElementById('loading-screen').classList.add('hidden');
        
        // 顯示測試提示
        const loginSection = document.getElementById('login-section');
        const hint = document.getElementById('test-mode-hint');
        if(loginSection) loginSection.classList.remove('hidden');
        if(hint) hint.classList.remove('hidden');

        // 如果想自動登入測試員，取消下面這行的註解
        // handleLoginSuccess(MOCK_USER); 

    } else {
        // 正式模式：監聽 Firebase 狀態
        auth.onAuthStateChanged(async (user) => {
            document.getElementById('loading-screen').classList.add('hidden');
            if (user) {
                handleLoginSuccess(user);
            } else {
                document.getElementById('login-section').classList.remove('hidden');
                document.getElementById('main-section').classList.add('hidden');
            }
        });
    }
});

// 共用的登入成功處理函式
// 參數 user: 可以是 Firebase User 物件，也可以是 MOCK_USER 物件
async function handleLoginSuccess(user) {
    currentUser = user;
    
    // 切換 UI
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('main-section').classList.remove('hidden');
    document.getElementById('u-photo').src = user.photoURL || "https://via.placeholder.com/50";
    
    // 呼叫 app.js 的初始化函式
    if (typeof initApp === "function") {
        await initApp(user);
    } else {
        console.error("找不到 initApp 函式，請確認 app.js 是否正確載入");
    }
}
