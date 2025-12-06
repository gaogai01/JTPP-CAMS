// app.js

/* ==========================================================================
   1. 系統初始化 (由 auth.js 呼叫)
   ========================================================================== */
async function initApp(user) {
    console.log("🚀 系統初始化啟動, 使用者:", user.email);
    
    initTimes(); // 設定預設時間
    await loadUserData(user); // 載入資料庫
    startGPS(); // 啟動定位
}

/* ==========================================================================
   2. 時間預設 (Time Defaults)
   ========================================================================== */
function initTimes() {
    const now = new Date();
    const ymd = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const first = new Date(now.getFullYear(), now.getMonth(), 1); 
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const toYMD = d => new Date(d.getTime() - (d.getTimezoneOffset()*60000)).toISOString().split('T')[0];
    
    document.getElementById('history-start').value = toYMD(first);
    document.getElementById('history-end').value = toYMD(last);
    document.getElementById('l-start').value = ymd + "T08:00";
    document.getElementById('l-end').value = ymd + "T16:30";
    document.getElementById('fixDate').value = ymd;
    updateFixTimeDefaults();
}

function updateFixTimeDefaults() {
    const type = document.getElementById('fixType').value;
    const shift = SHIFTS[userData.workShift || "normal"];
    if(type === '上班') {
        document.getElementById('fixTime').value = "08:00";
    } else {
        document.getElementById('fixTime').value = shift.end;
    }
}

/* ==========================================================================
   3. 使用者資料處理 (User Data)
   ========================================================================== */
async function loadUserData(user) {
  // 如果是測試模式且要模擬全新使用者，這裡可能會報錯因為 firestore 沒資料
  // 但通常測試模式我們會假裝讀取到資料，或直接寫入一筆測試資料
  
  const doc = await db.collection('cams_users').doc(user.email).get();
  if (doc.exists) {
      userData = doc.data();
      updateUI(userData);
      leaveData.annual.total = 7; 
      leaveData.annual.used = userData.leaveUsed || 0;
      leaveData.comp.total = userData.compLeaveTotal || 0; 
      leaveData.comp.used = userData.compLeaveUsed || 0;
      updateBalanceDisplay();
      loadColleagues();
      loadTasks();
  } else {
      userData = { 
          name: user.displayName, 
          email: user.email, 
          role: "外包員工", 
          workShift: "normal", 
          createdAt: new Date().toISOString() 
      };
      // 只有在非測試模式或確定資料庫可寫入時才寫入
      if (!TEST_MODE || confirm("這是新模擬帳號，要寫入資料庫嗎？")) {
          await db.collection('cams_users').doc(user.email).set(userData);
      }
      updateUI(userData);
      toggleEditMode();
  }
}

function updateUI(d) {
    document.getElementById('u-name').innerText = d.name;
    const sName = SHIFTS[d.workShift]?SHIFTS[d.workShift].name:"正常班";
    document.getElementById('u-company-display').innerText = `${d.company||""} / ${sName}`;
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

// 監聽請假時間計算
document.getElementById('l-start').addEventListener('change', calculateDuration);
document.getElementById('l-end').addEventListener('change', calculateDuration);

function calculateDuration() {
    const sVal = document.getElementById('l-start').value;
    const eVal = document.getElementById('l-end').value;
    const resDiv = document.getElementById('calc-result');
    if(!sVal || !eVal) return;
    let start = new Date(sVal); let end = new Date(eVal);
    if(end <= start) { resDiv.innerText = "結束時間需晚於開始時間"; resDiv.style.color = "red"; return; }
    
    // 簡易工時計算 (含扣除休息)
    // 實際專案建議使用更嚴謹的 Date 運算庫
    const shiftKey = userData.workShift || "normal";
    const shift = SHIFTS[shiftKey];
    let diffMs = end - start;
    let diffHrs = diffMs / 36e5;

    // 簡單判斷：如果跨越了休息時間
    let bs = new Date(start); let [bh,bm] = [12,0]; bs.setHours(bh,bm,0);
    let be = new Date(start); let [eh,em] = shiftKey==='normal'?[12,30]:[13,0]; be.setHours(eh,em,0);
    
    if(start < be && end > bs) diffHrs -= shift.breakDur;
    
    resDiv.innerHTML = `合計：${diffHrs.toFixed(1)} 小時`;
    resDiv.style.color = "#2563eb";
}

/* ==========================================================================
   4. 歷史紀錄查詢
   ========================================================================== */
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

/* ==========================================================================
   5. 其他功能 (打卡、送單)
   ========================================================================== */
async function doClock(type) {
   if(!userData.company) { alert("請先填寫資料"); return; }
   if(currentDist > MAX_DIST && !TEST_MODE) { alert(`距離過遠 (${Math.round(currentDist)}m)`); return; }
   const now = new Date();
   try {
       await db.collection('cams_records').add({userId:currentUser.email, name:userData.name, email:currentUser.email, company:userData.company, dept:userData.dept, type:type, time:now, lat:currentLat, lng:currentLng, status:"正常"});
       alert("打卡成功"); switchTab('history');
   } catch(e) { alert(e.message); }
}

async function submitApp(cat) {
    if(cat === 'leave') {
        const agent = document.getElementById('agentSelect').value;
        if(!agent) { alert("請選擇代理人"); return; }
        // 簡易送出邏輯
        await db.collection('cams_applications').add({
            userId: currentUser.email, name: userData.name, email: currentUser.email, 
            company: userData.company, dept: userData.dept,
            category: 'leave', type: document.getElementById('leaveType').value,
            startDate: document.getElementById('l-start').value, 
            endDate: document.getElementById('l-end').value, 
            agentName: agent, createdAt: new Date(),
            status: { agent: "待審核", leader: "待審核", boss: "待審核", client: "待審核" }
        });
    } else if (cat === 'correction') {
        await db.collection('cams_applications').add({
            userId: currentUser.email, name: userData.name, email: currentUser.email, company: userData.company, dept: userData.dept,
            category: 'correction', type: "補卡-"+document.getElementById('fixType').value,
            startDate: document.getElementById('fixDate').value+"T"+document.getElementById('fixTime').value, 
            reason: document.getElementById('fixReason').value, createdAt: new Date(),
            status: { boss: "待審核", client: "待審核" }
        });
    }
    alert("申請已送出"); 
    if(cat==='correction') toggleFix();
    switchTab('history');
}

async function saveToFirebase() {
    const u = { name: document.getElementById('dbName').value, phone: document.getElementById('dbPhone').value };
    await db.collection('cams_users').doc(currentUser.email).set(u, {merge:true});
    alert("資料已更新"); location.reload();
}

// 待辦載入
async function loadTasks() {
    const list = document.getElementById('task-list');
    list.innerHTML = "查詢中...";
    try {
        const q1 = await db.collection('cams_applications').where('email','==',currentUser.email).where('category','==','overtime').where('status.employee','==','待確認').get();
        let html = "";
        q1.forEach(doc => {
            const d = doc.data();
            html += `<div class="task-card"><div class="task-title">⚠️ 加班確認</div><div>${d.startDate.replace('T',' ')}</div><div style="text-align:right"><button class="btn-approve" onclick="replyTask('${doc.id}','overtime','同意')">接受</button></div></div>`;
        });
        if(html==="") html = "<p style='text-align:center;color:#999'>無待辦</p>";
        list.innerHTML = html;
    } catch(e) { list.innerHTML = "錯誤"; }
}

async function replyTask(id, type, decision) {
    if(!confirm(`確定 ${decision}？`)) return;
    await db.collection('cams_applications').doc(id).update({ 'status.employee': decision });
    alert("已更新"); loadTasks();
}

function toggleEditMode() { document.getElementById('meta-form').classList.toggle('hidden'); }
function toggleFix() { document.getElementById('fix-form').classList.toggle('hidden'); updateFixTimeDefaults(); }
function switchTab(t) { ['clock','leave','history','task'].forEach(id=>document.getElementById('tab-'+id).classList.add('hidden')); document.getElementById('tab-'+t).classList.remove('hidden'); if(t==='history')loadCurrentHistory(); if(t==='task')loadTasks(); }

/* ==========================================================================
   6. GPS 定位
   ========================================================================== */
function startGPS() {
   if(navigator.geolocation) {
       navigator.geolocation.watchPosition(p=>{
           document.getElementById('gps-loading').classList.add('hidden');
           document.getElementById('gps-icon').classList.remove('hidden');
           currentLat=p.coords.latitude; currentLng=p.coords.longitude;
           // 計算距離
           const R = 6371000; const dLat = (PLANT_LOCATION.lat-currentLat)*Math.PI/180; const dLon = (PLANT_LOCATION.lng-currentLng)*Math.PI/180;
           const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(currentLat*Math.PI/180)*Math.cos(PLANT_LOCATION.lat*Math.PI/180) * Math.sin(dLon/2)*Math.sin(dLon/2);
           currentDist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
           
           const box = document.getElementById('gps-box');
           if(currentDist <= MAX_DIST) {
                box.className = "gps-box gps-status-ok"; 
                document.getElementById('gps-title').innerText = "已進入範圍";
                document.getElementById('gps-desc').innerText = `距離 ${Math.round(currentDist)}m (OK)`;
           } else {
                box.className = "gps-box gps-status-err"; 
                document.getElementById('gps-title').innerText = "尚未進入範圍";
                document.getElementById('gps-desc').innerText = `距離 ${Math.round(currentDist)}m`;
           }
       });
   }
}

async function loadColleagues() {
    if(!userData.company) return;
    const sel = document.getElementById('agentSelect');
    const snap = await db.collection('cams_users').where('company', '==', userData.company).get();
    sel.innerHTML = "<option value=''>請選擇</option>";
    snap.forEach(doc => {
        let u = doc.data();
        if(u.email !== currentUser.email) sel.innerHTML += `<option value="${u.name}">${u.name}</option>`;
    });
}
