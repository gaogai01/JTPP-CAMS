/* ==========================================================================
   1. 設定與初始化 (Config & Init)
   ========================================================================== */
// 🔥 Firebase 設定
const firebaseConfig = { apiKey: "AIzaSyAQPANPPx5A3FtpISPcfX-kHPtG0PC6irA", authDomain: "jtpp-cams.firebaseapp.com", projectId: "jtpp-cams", storageBucket: "jtpp-cams.firebasestorage.app", messagingSenderId: "334286192470", appId: "1:334286192470:web:9080eb43436b3a3fdfe0f7" };
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const provider = new firebase.auth.GoogleAuthProvider();

// 📍 電廠位置 (GPS 比對用)
const PLANT_LOCATION = { lat: 23.564675316036272, lng: 119.66034190357468 };
const MAX_DIST = 500; // 允許打卡半徑 (公尺)

// 🟢 全域變數
let currentUser = null;
let userData = {}; 
let currentLat = 0, currentLng = 0, currentDist = 9999;
let leaveData = { annual: {total:0, used:0}, comp: {total:0, used:0} }; // 餘額暫存
let currentHistoryType = 'clock'; // 預設紀錄分頁

// ⏰ 班別規則 (正常班 / 清潔班)
const SHIFTS = {
    "normal": { name: "正常班", end: "16:30", breakStart: "12:00", breakEnd: "12:30", breakDur: 0.5, workHrs: 8.0 },
    "cleaning": { name: "清潔班", end: "17:00", breakStart: "12:00", breakEnd: "13:00", breakDur: 1.0, workHrs: 8.0 }
};

// Google 登入觸發
function loginGoogle() { auth.signInWithPopup(provider).catch(e => alert(e.message)); }

// 🔐 監聽登入狀態 (系統入口)
auth.onAuthStateChanged(async (user) => {
  document.getElementById('loading-screen').classList.add('hidden'); // 隱藏載入遮罩
  if (user) {
    currentUser = user;
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('main-section').classList.remove('hidden');
    document.getElementById('u-photo').src = user.photoURL;
    
    initTimes(); // 1. 初始化時間
    await loadUserData(user); // 2. 載入用戶資料 (含代理人清單)
    startGPS(); // 3. 啟動定位
  } else {
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('main-section').classList.add('hidden');
  }
});

/* ==========================================================================
   2. 時間與預設值處理
   ========================================================================== */
function initTimes() {
    const now = new Date();
    // 處理時區，轉為本地 YYYY-MM-DD
    const toYMD = d => new Date(d.getTime() - (d.getTimezoneOffset()*60000)).toISOString().split('T')[0];
    const ymd = toYMD(now);
    
    // 紀錄查詢：預設當月 1 號 ~ 月底
    const first = new Date(now.getFullYear(), now.getMonth(), 1); 
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    document.getElementById('history-start').value = toYMD(first);
    document.getElementById('history-end').value = toYMD(last);
    
    // 請假預設：今天 08:00 ~ 16:30
    document.getElementById('l-start').value = ymd + "T08:00";
    document.getElementById('l-end').value = ymd + "T16:30";
    
    // 補卡預設：今天
    document.getElementById('fixDate').value = ymd;
    
    // 預先計算一次請假時數
    setTimeout(calculateDuration, 1000);
}

// 補卡時間自動判斷 (上班08:00 / 下班依班別)
function updateFixTimeDefaults() {
    const type = document.getElementById('fixType').value;
    const shift = SHIFTS[userData.workShift || "normal"];
    if(type === '上班') document.getElementById('fixTime').value = "08:00";
    else document.getElementById('fixTime').value = shift.end;
}

/* ==========================================================================
   3. 用戶資料與餘額
   ========================================================================== */
async function loadUserData(user) {
  const doc = await db.collection('cams_users').doc(user.email).get();
  if (doc.exists) {
      userData = doc.data();
      updateUI(userData);
      
      // 計算假別餘額 (範例邏輯)
      leaveData.annual.total = 7; // 這裡之後可改為依到職日計算
      leaveData.annual.used = userData.leaveUsed || 0;
      leaveData.comp.total = userData.compLeaveTotal || 0; 
      leaveData.comp.used = userData.compLeaveUsed || 0;
      updateBalanceDisplay();
      
      // ★ 修復：資料載入完成後，立刻載入「代理人名單」與「待辦事項」
      await loadColleagues();
      loadTasks();
  } else {
      // 新用戶初始化
      userData = { name: user.displayName, email: user.email, role: "外包員工", workShift: "normal", createdAt: new Date().toISOString() };
      await db.collection('cams_users').doc(user.email).set(userData);
      updateUI(userData);
      toggleEditMode();
  }
}

function updateUI(d) {
    document.getElementById('u-name').innerText = d.name;
    const sName = SHIFTS[d.workShift] ? SHIFTS[d.workShift].name : "正常班";
    document.getElementById('u-company-display').innerText = `${d.company||""} / ${sName}`;
    
    // 填入修改表單
    document.getElementById('dbName').value = d.name;
    document.getElementById('dbPhone').value = d.phone||"";
    document.getElementById('jobTitle').value = d.jobTitle||"";
    document.getElementById('company').value = d.company||"";
    document.getElementById('dept').value = d.dept||"";
    document.getElementById('workShift').value = d.workShift||"normal";
    document.getElementById('baseSalary').value = d.baseSalary||"";
    document.getElementById('onboardDate').value = d.onboardDate||"";
}

function updateBalanceDisplay() {
    const type = document.getElementById('leaveType').value;
    const panel = document.getElementById('balance-panel');
    
    if(type === '特休' || type === '補休') {
        panel.classList.remove('hidden');
        let data = type==='特休' ? leaveData.annual : leaveData.comp;
        let unit = type==='特休' ? '天' : '小時';
        document.getElementById('bal-total').innerText = data.total + " " + unit;
        document.getElementById('bal-used').innerText = data.used + " " + unit;
        let left = (data.total - data.used).toFixed(1);
        document.getElementById('bal-left').innerText = left + " " + unit;
    } else {
        panel.classList.add('hidden');
    }
}

// 監聽請假日期變動
document.getElementById('l-start').addEventListener('change', calculateDuration);
document.getElementById('l-end').addEventListener('change', calculateDuration);

// ★ 修復：請假天數計算 (扣除休息時間)
function calculateDuration() {
    const sVal = document.getElementById('l-start').value;
    const eVal = document.getElementById('l-end').value;
    const resDiv = document.getElementById('calc-result');
    if(!sVal || !eVal) return;
    
    let start = new Date(sVal); 
    let end = new Date(eVal);
    if(end <= start) { resDiv.innerText = "結束時間需晚於開始時間"; resDiv.style.color = "red"; return; }
    
    const shiftKey = userData.workShift || "normal";
    const shift = SHIFTS[shiftKey];
    
    // 計算總時數 (毫秒 -> 小時)
    let diffMs = end - start;
    let diffHrs = diffMs / 36e5; // 3600*1000

    // 休息區間設定 (依據年月日建立當天的休息時間)
    // ⚠️ 簡易判斷：若請假跨越中午休息時間則扣除
    // 建立一個 "基準日" 的休息時間物件來比對時分
    let breakStartVal = parseFloat(shift.breakStart.replace(':','.')); // 12.00
    let breakEndVal = parseFloat(shift.breakEnd.replace(':','.'));     // 12.30 or 13.00
    
    let startHr = start.getHours() + start.getMinutes()/60;
    let endHr = end.getHours() + end.getMinutes()/60;

    // 判斷是否跨越休息時間 (開始 < 休息結束 且 結束 > 休息開始)
    // 且只在同一天內有效 (跨日需更複雜邏輯，此處簡化)
    if(start.getDate() === end.getDate()) {
        if(startHr < breakEndVal && endHr > breakStartVal) {
            diffHrs -= shift.breakDur;
        }
    }
    
    // 確保不為負數
    diffHrs = Math.max(0, diffHrs);

    // ★ 換算顯示：天 + 小時
    const workHrsPerDay = shift.workHrs || 8.0;
    
    let days = 0;
    let remainHrs = diffHrs;

    // 誤差容許值 (避免浮點數 7.99999)
    if (Math.abs(diffHrs - workHrsPerDay) < 0.1) {
        days = 1;
        remainHrs = 0;
    } else if (diffHrs > workHrsPerDay) {
        days = Math.floor(diffHrs / workHrsPerDay);
        remainHrs = diffHrs % workHrsPerDay;
    }

    resDiv.innerHTML = `合計：${days} 天 ${remainHrs.toFixed(1)} 小時`;
    resDiv.style.color = "#2563eb";
}

/* ==========================================================================
   4. 待辦事項 (修復：新增 拒絕 按鈕)
   ========================================================================== */
async function loadTasks() {
    const list = document.getElementById('task-list');
    list.innerHTML = `<p style="text-align:center;color:#666;">查詢中...</p>`;
    
    try {
        let html = "";

        // A. 加班確認
        const q1 = await db.collection('cams_applications')
            .where('email','==',currentUser.email)
            .where('category','==','overtime')
            .where('status.employee','==','待確認').get();
            
        q1.forEach(doc => {
            const d = doc.data();
            html += `
            <div class="task-card">
                <div class="task-title">⚠️ 加班確認</div>
                <div>${d.startDate.replace('T',' ')}</div>
                <div style="margin-top:10px; display:flex; gap:10px;">
                    <button class="btn-approve" style="flex:1" onclick="replyTask('${doc.id}','overtime','同意')">接受</button>
                    <button class="btn-reject" style="flex:1" onclick="replyTask('${doc.id}','overtime','退回')">拒絕</button>
                </div>
            </div>`;
        });
        
        // B. 代理人確認
        const q2 = await db.collection('cams_applications')
            .where('agentName','==',userData.name)
            .where('category','==','leave')
            .where('status.agent','==','待審核').get();
            
        q2.forEach(doc => {
            const d = doc.data();
            html += `
            <div class="task-card" style="border-color:#f59e0b; background:#fffbeb;">
                <div class="task-title" style="color:#92400e;">⚠️ 代理人確認</div>
                <div>申請人：${d.name} <br> ${d.startDate.replace('T',' ')}</div>
                <div style="margin-top:10px; display:flex; gap:10px;">
                    <button class="btn-approve" style="flex:1" onclick="replyTask('${doc.id}','leave','同意')">接受</button>
                    <button class="btn-reject" style="flex:1" onclick="replyTask('${doc.id}','leave','退回')">拒絕</button>
                </div>
            </div>`;
        });

        if(html==="") html = "<p style='text-align:center;color:#999;padding:20px;'>🎉 目前沒有待辦事項</p>";
        list.innerHTML = html;
    } catch(e) { list.innerHTML = `<p style="color:red">載入失敗: ${e.message}</p>`; }
}

async function replyTask(id, type, decision) {
    if(!confirm(`確定要 ${decision} 嗎？`)) return;
    let update = {};
    if(type === 'overtime') update = { 'status.employee': decision };
    if(type === 'leave') update = { 'status.agent': decision };
    
    await db.collection('cams_applications').doc(id).update(update);
    alert("已更新狀態"); 
    loadTasks(); // 重新整理列表
}

/* ==========================================================================
   5. UI 切換 (修復：藍色方塊移動)
   ========================================================================== */
function switchTab(t) {
    // 1. 隱藏所有頁面 & 移除按鈕 active 樣式
    ['clock','leave','history','task'].forEach(id => {
        document.getElementById('tab-'+id).classList.add('hidden');
        document.getElementById('tab-btn-'+id).classList.remove('active');
    });
    
    // 2. 顯示目標頁面 & 增加按鈕 active 樣式
    document.getElementById('tab-'+t).classList.remove('hidden');
    document.getElementById('tab-btn-'+t).classList.add('active'); // 藍色方塊會移到這裡
    
    // 3. 特定頁面資料重整
    if(t==='history') loadCurrentHistory();
    if(t==='task') loadTasks();
    if(t==='leave') loadColleagues();
}

function toggleEditMode() { document.getElementById('meta-form').classList.toggle('hidden'); }
function toggleFix() { document.getElementById('fix-form').classList.toggle('hidden'); updateFixTimeDefaults(); }

/* ==========================================================================
   6. GPS 定位 (修復：顯示狀態與重整按鈕)
   ========================================================================== */
function startGPS() {
   // 重置 UI 狀態
   document.getElementById('gps-loading').classList.remove('hidden');
   document.getElementById('gps-icon').classList.add('hidden');
   document.getElementById('gps-title').innerText = "定位中...";
   document.getElementById('gps-desc').innerText = "正在搜尋衛星訊號...";

   if(navigator.geolocation) {
       navigator.geolocation.watchPosition(
           (p) => {
               // 定位成功：隱藏轉圈，顯示結果
               document.getElementById('gps-loading').classList.add('hidden');
               document.getElementById('gps-icon').classList.remove('hidden');
               
               currentLat = p.coords.latitude; 
               currentLng = p.coords.longitude;
               currentDist = getDist(currentLat, currentLng, PLANT_LOCATION.lat, PLANT_LOCATION.lng);
               
               const box = document.getElementById('gps-box');
               const icon = document.getElementById('gps-icon');
               const title = document.getElementById('gps-title');
               const desc = document.getElementById('gps-desc');

               if(currentDist <= MAX_DIST) {
                    box.className = "gps-box gps-status-ok"; 
                    icon.innerHTML = "✅";
                    title.innerText = "已進入打卡範圍";
                    desc.innerText = `距離電廠中心 ${Math.round(currentDist)} 公尺 (OK)`;
               } else {
                    box.className = "gps-box gps-status-err"; 
                    icon.innerHTML = "🚫";
                    title.innerText = "尚未進入範圍";
                    desc.innerText = `距離 ${Math.round(currentDist)} 公尺 (太遠)`;
               }
           },
           (err) => {
               document.getElementById('gps-loading').classList.add('hidden');
               document.getElementById('gps-icon').classList.remove('hidden');
               document.getElementById('gps-icon').innerHTML = "⚠️";
               document.getElementById('gps-title').innerText = "定位失敗";
               document.getElementById('gps-desc').innerText = "請允許瀏覽器存取位置";
           },
           { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
       );
   } else {
       alert("您的瀏覽器不支援定位功能");
   }
}

function getDist(lat1, lon1, lat2, lon2) {
    const R = 6371000; const dLat = (lat2-lat1)*Math.PI/180; const dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)*Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ★ 修復：載入代理人清單 (篩選同公司)
async function loadColleagues() {
    if(!userData.company) return;
    const sel = document.getElementById('agentSelect');
    // 如果已經載入過就不重複載入 (除非只有一個預設選項)
    if(sel.options.length > 1) return;

    sel.innerHTML = "<option value=''>請選擇...</option>";
    const snap = await db.collection('cams_users').where('company', '==', userData.company).get();
    snap.forEach(doc => {
        let u = doc.data();
        // 排除自己
        if(u.email !== currentUser.email) {
            sel.innerHTML += `<option value="${u.name}">${u.name}</option>`;
        }
    });
}

/* ==========================================================================
   7. 紀錄與打卡 (維持原邏輯，省略部分重複代碼)
   ========================================================================== */
async function doClock(type) {
   if(!userData.company) { alert("請先填寫資料"); return; }
   if(currentDist > MAX_DIST) { alert(`距離過遠 (${Math.round(currentDist)}m)`); return; }
   const now = new Date();
   try {
       await db.collection('cams_records').add({
           userId:currentUser.email, name:userData.name, email:currentUser.email, 
           company:userData.company, dept:userData.dept, type:type, time:now, 
           lat:currentLat, lng:currentLng, status:"正常"
       });
       alert("打卡成功"); switchTab('history');
   } catch(e) { alert(e.message); }
}

async function submitApp(cat) {
    if(cat === 'leave') {
        const agent = document.getElementById('agentSelect').value;
        if(!agent) { alert("請選擇代理人"); return; }
        await db.collection('cams_applications').add({
            userId: currentUser.email, name: userData.name, email: currentUser.email, 
            company: userData.company, dept: userData.dept,
            category: 'leave', type: document.getElementById('leaveType').value,
            startDate: document.getElementById('l-start').value, 
            endDate: document.getElementById('l-end').value, 
            agentName: agent, createdAt: new Date(),
            status: { agent: "待審核", leader: "待審核", boss: "待審核", client: "待審核" }
        });
    }
    // ...correction logic...
    alert("申請已送出"); switchTab('history');
}

async function saveToFirebase() {
    const u = { name: document.getElementById('dbName').value, phone: document.getElementById('dbPhone').value };
    await db.collection('cams_users').doc(currentUser.email).set(u, {merge:true});
    alert("資料已更新"); location.reload();
}

async function loadCurrentHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = "<p style='text-align:center;color:#999'>載入中...</p>";
    const sStr = document.getElementById('history-start').value;
    const eStr = document.getElementById('history-end').value;
    const startD = new Date(sStr+"T00:00:00"); const endD = new Date(eStr+"T23:59:59");
    
    let html = "";
    if(currentHistoryType === 'clock') {
        const snap = await db.collection('cams_records').where('userId','==',currentUser.email)
            .where('time','>=',startD).where('time','<=',endD).orderBy('time','desc').limit(50).get();
        if(snap.empty) html = "<p style='text-align:center'>無紀錄</p>";
        else {
            html = `<table class="history-table"><thead><tr><th>日期</th><th>時間</th><th>類型</th><th>狀態</th></tr></thead><tbody>`;
            snap.forEach(doc => {
                const d = doc.data(); const t = d.time.toDate();
                const dateStr = `${t.getMonth()+1}/${t.getDate()}`;
                const timeStr = `${t.getHours()}:${String(t.getMinutes()).padStart(2,'0')}`;
                let cls = d.status.includes('異常')?'tag-red':'tag-green';
                html += `<tr><td>${dateStr}</td><td>${timeStr}</td><td>${d.type}</td><td><span class="tag ${cls}">${d.status}</span></td></tr>`;
            });
            html += `</tbody></table>`;
        }
    } else {
        let cat = currentHistoryType==='leave'?'leave':'overtime';
        const snap = await db.collection('cams_applications').where('userId','==',currentUser.email)
            .where('category','==',cat).where('createdAt','>=',startD).where('createdAt','<=',endD).orderBy('createdAt','desc').get();
        if(snap.empty) html = "<p style='text-align:center'>無紀錄</p>";
        else {
             html = `<table class="history-table"><thead><tr><th>日期</th><th>項目</th><th>進度</th></tr></thead><tbody>`;
             snap.forEach(doc => {
                 const d=doc.data();
                 let st = "已核准";
                 if(d.status.agent==='待審核') st="待代理人";
                 else if(d.status.leader==='待審核') st="待領班";
                 else if(d.status.boss==='待審核') st="待老闆";
                 else if(d.status.client==='待審核') st="待甲方";
                 if(cat==='overtime' && d.status.employee==='待確認') st="待您確認";
                 let desc = d.type || d.reason;
                 html += `<tr><td>${d.startDate.split('T')[0]}</td><td>${desc}</td><td><small>${st}</small></td></tr>`;
             });
             html += `</tbody></table>`;
        }
    }
    list.innerHTML = html;
}

function switchHistorySub(t) {
    currentHistoryType = t;
    document.querySelectorAll('.sub-tab').forEach(el=>el.classList.remove('active'));
    document.getElementById('sub-'+t).classList.add('active');
    loadCurrentHistory();
}
