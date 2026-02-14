import {
  onAuthStateChanged,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

// State Management
const state = {
  view: 'dashboard',
  expenses: JSON.parse(localStorage.getItem('expenses')) || [],
  debts: JSON.parse(localStorage.getItem('debts')) || [],
  loans: JSON.parse(localStorage.getItem('loans')) || [],
  names: JSON.parse(localStorage.getItem('names')) || [], // For people
  categories: JSON.parse(localStorage.getItem('categories')) || ["বাজার খরচ", "বাসা ভাড়া", "যাতায়াত", "মোবাইল বিল", "অন্যান্য"], // For expenses
  user: null,
  selectedPerson: null,
};

const appData = document.getElementById('app');
let isSyncing = false;

// Toast System
window.showToast = (message, type = 'success') => {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
        <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}" style="color: ${type === 'success' ? 'var(--success)' : 'var(--danger)'}"></i>
        <span class="toast-msg">${message}</span>
    `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards';
    setTimeout(() => toast.remove(), 400);
  }, 2500);
};

// Modal System
window.showAlert = (title, message, callback) => {
  const container = document.getElementById('modal-container');
  if (!container) return;

  container.innerHTML = `
    <div class="modal-backdrop" onclick="window.closeModal()"></div>
    <div class="modal-card">
        <div class="modal-icon" style="background: var(--accent-blue)">
            <i class="fa-solid fa-circle-info"></i>
        </div>
        <div class="modal-title">${title}</div>
        <div class="modal-msg">${message}</div>
        <div class="modal-actions">
            <button class="modal-btn modal-btn-confirm" id="modal-alert-btn" style="width: 100%">ঠিক আছে</button>
        </div>
    </div>
  `;

  container.classList.add('active');

  const alertBtn = document.getElementById('modal-alert-btn');
  alertBtn.onclick = () => {
    if (callback) callback();
    window.closeModal();
  };
};

window.showConfirm = (title, message, callback) => {
  const container = document.getElementById('modal-container');
  if (!container) return;

  container.innerHTML = `
    <div class="modal-backdrop" onclick="window.closeModal()"></div>
    <div class="modal-card">
        <div class="modal-icon">
            <i class="fa-solid fa-trash-can"></i>
        </div>
        <div class="modal-title">${title}</div>
        <div class="modal-msg">${message}</div>
        <div class="modal-actions">
            <button class="modal-btn modal-btn-cancel" onclick="window.closeModal()">না</button>
            <button class="modal-btn modal-btn-confirm" id="modal-confirm-btn">হ্যাঁ, মুছুন</button>
        </div>
    </div>
  `;

  container.classList.add('active');

  const confirmBtn = document.getElementById('modal-confirm-btn');
  confirmBtn.onclick = () => {
    callback();
    window.closeModal();
  };
};

window.closeModal = () => {
  const container = document.getElementById('modal-container');
  if (!container) return;
  container.classList.remove('active');
};

// Robust Storage
function saveLocally() {
  localStorage.setItem('expenses', JSON.stringify(state.expenses));
  localStorage.setItem('debts', JSON.stringify(state.debts));
  localStorage.setItem('loans', JSON.stringify(state.loans));
  localStorage.setItem('names', JSON.stringify(state.names));
  localStorage.setItem('categories', JSON.stringify(state.categories));
}

async function saveToFirebase() {
  if (!state.user || isSyncing) return;
  isSyncing = true;
  try {
    const userDocRef = doc(db, "users", state.user.uid);
    await setDoc(userDocRef, {
      expenses: state.expenses,
      debts: state.debts,
      loans: state.loans,
      names: state.names,
      categories: state.categories,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error("Firebase Save Error:", e);
    window.showToast('সংরক্ষণ ব্যর্থ হয়েছে', 'error');
  } finally {
    isSyncing = false;
  }
}

async function persistData() {
  saveLocally();
  await saveToFirebase();
}

// Seamless Auth Initialization
function initAuth() {
  // Try to enable offline persistence for Firestore
  try {
    enableIndexedDbPersistence(db);
  } catch (err) {
    console.warn("Persistence error:", err.code);
  }

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      state.user = user;
      await startSync();
    } else {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Anonymous Auth Error:", error);
        render(); // Render even if auth fails
      }
    }
  });
}

async function startSync() {
  if (!state.user) return;

  const userDocRef = doc(db, "users", state.user.uid);
  try {
    const docSnap = await getDoc(userDocRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      // Only update if cloud data exists
      state.expenses = data.expenses || state.expenses;
      state.debts = data.debts || state.debts;
      state.loans = data.loans || state.loans;
      state.names = data.names || state.names;
      state.categories = data.categories || state.categories;
      saveLocally();
    } else {
      // New cloud user, upload local data
      await saveToFirebase();
    }
  } catch (e) {
    console.warn("Sync error (using local cache):", e);
  }
  render();
}

// UI Rendering
function render() {
  appData.innerHTML = '';
  renderHeader();

  const content = document.createElement('div');
  appData.appendChild(content);

  if (state.view === 'dashboard') renderDashboardView(content);
  else if (state.view === 'expenses') renderExpensesView(content);
  else if (state.view === 'loans') renderLoansView(content);
  else if (state.view === 'loan-detail') renderLoanDetailView(content);
  else if (state.view === 'debts') renderDebtsView(content);
  else if (state.view === 'debt-detail') renderDebtDetailView(content);
  else if (state.view === 'settings') renderSettingsView(content);
  else if (state.view === 'report') renderReportView(content);

  renderPillNav();
}

function renderHeader() {
  const viewTitles = {
    dashboard: 'মূলপাতা',
    expenses: 'আমার খরচ',
    loans: 'আমার ঋণ',
    'loan-detail': state.selectedPerson || 'খতিয়ানের বিবরণ',
    debts: 'হিসাব খাতা',
    'debt-detail': state.selectedPerson || 'লেনদেনের বিবরণ',
    settings: 'সেটিং',
    report: 'প্রতিবেদন'
  };

  const header = document.createElement('header');
  header.className = 'header';

  if (state.view === 'dashboard') {
    const now = new Date();
    const isFriday = now.getDay() === 5;
    const hour = now.getHours();

    // Determine Day Period
    let periodLabel = 'এখন রাত';
    let iconClass = 'fa-moon';
    let iconColor = '#6366f1';

    if (hour >= 5 && hour < 11) {
      periodLabel = 'এখন সকাল';
      iconClass = 'fa-cloud-sun';
      iconColor = '#fbbf24';
    } else if (hour >= 11 && hour < 16) {
      periodLabel = 'এখন দুপুর';
      iconClass = 'fa-sun';
      iconColor = '#f59e0b';
    } else if (hour >= 16 && hour < 18) {
      periodLabel = 'এখন বিকেল';
      iconClass = 'fa-sun-plant-wilt';
      iconColor = '#ea580c';
    }

    const greeting = isFriday ? 'জুম্মা মোবারক' : 'আসসালামু আলাইকুম';
    const timeStr = now.toLocaleTimeString('bn-BD', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    const dateStr = now.toLocaleDateString('bn-BD', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    header.innerHTML = `
            <div class="glass header-card" style="flex: 1; padding: 15px 20px; border-radius: 20px; position: relative; overflow: hidden; border: 1px solid rgba(255,255,255,0.4); box-shadow: 0 8px 32px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="z-index: 1;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
                            <span style="font-size: 11px; font-weight: 700; color: var(--accent-blue); text-transform: uppercase; letter-spacing: 0.5px;">${greeting}</span>
                            <span style="font-size: 10px; font-weight: 600; color: var(--text-muted); opacity: 0.7;">• ${periodLabel}</span>
                        </div>
                        <div style="font-size: 32px; font-weight: 900; line-height: 1; color: var(--text-main); letter-spacing: -1px; font-family: 'Tiro Bangla', serif;">
                            ${timeStr}
                        </div>
                        <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-top: 2px;">${dateStr}</div>
                    </div>
                    <div style="font-size: 32px; color: ${iconColor}; filter: drop-shadow(0 4px 10px ${iconColor}22); position: relative; z-index: 1;">
                        <i class="fa-solid ${iconClass}"></i>
                    </div>
                </div>
                <div style="position: absolute; right: -10px; top: -10px; width: 80px; height: 80px; background: ${iconColor}; opacity: 0.03; border-radius: 50%; filter: blur(30px);"></div>
            </div>
        `;
  } else {
    header.innerHTML = `
            <div style="flex: 1;">
                <h1 class="greeting">${viewTitles[state.view]}</h1>
                <p class="subtitle">বিস্তারিত তালিকা</p>
            </div>
        `;
  }
  appData.appendChild(header);
}

function renderPillNav() {
  const nav = document.createElement('div');
  nav.className = 'pill-nav';
  nav.innerHTML = `
        <div class="pill-item ${state.view === 'dashboard' ? 'active' : ''}" onclick="navigate('dashboard')" style="width: 80px;">
            <i class="fa-solid fa-house" style="font-size: 24px;"></i>
            <span>Home</span>
        </div>
    `;
  appData.appendChild(nav);
}

function renderDashboardView(container) {
  container.innerHTML = `
        <div class="grid">
            ${renderModuleCard('আমার খরচ', 'fa-cart-shopping', '#1ab394', 'expenses')}
            ${renderModuleCard('আমার ঋণ', 'fa-hand-holding-dollar', '#1ab394', 'loans')}
            ${renderModuleCard('হিসাব খাতা', 'fa-book', '#1ab394', 'debts')}
            ${renderModuleCard('সেটিং', 'fa-gears', '#1ab394', 'settings')}
            ${renderModuleCard('প্রতিবেদন', 'fa-chart-pie', '#1ab394', 'report')}
        </div>
    `;
}

function renderModuleCard(name, icon, bg, target) {
  return `
        <div class="module-card glass" onclick="navigate('${target}')">
            <div class="icon-wrapper" style="background: ${bg}">
                <i class="fa-solid ${icon}"></i>
            </div>
            <span class="module-name">${name}</span>
        </div>
    `;
}

function renderExpensesView(container) {
  const total = state.expenses.reduce((s, i) => s + Number(i.amount), 0);
  container.innerHTML = `
        <div class="banner glass" style="--accent-color: var(--danger);">
            <div>
                <span class="banner-title">মোট খরচ</span>
                <div class="banner-value">৳ ${total.toLocaleString()}</div>
            </div>
        </div>

        <div class="form-card glass">
            <label>খরচের ধরন</label>
            <select class="input-field" id="exp-title">${state.categories.map(c => `<option>${c}</option>`).join('')}</select>
            <label style="margin-top: 16px;">টাকার পরিমাণ</label>
            <input type="number" class="input-field" id="exp-amount" placeholder="৳ 0.00">
            <button class="action-btn btn-primary" onclick="window.addExpense()">খরচ যোগ করুন</button>
        </div>

        <div class="list-container">
            ${state.expenses.map((e, idx) => `
                <div class="list-item">
                    <div class="item-info">
                        <h4>${e.title}</h4>
                        <p>${new Date(e.date).toLocaleDateString()}</p>
                    </div>
                    <div class="item-amount" style="color: var(--danger)">- ৳ ${Number(e.amount).toLocaleString()}</div>
                    <i class="fa-solid fa-trash-can" style="color:rgba(0,0,0,0.1); margin-left: 10px; cursor: pointer;" onclick="window.deleteItem('expenses', ${state.expenses.length - 1 - idx})"></i>
                </div>
            `).reverse().join('')}
        </div>
  `;
}

function renderLoansView(container) {
  // Summary View - Net Balance per Person
  const peopleBalances = {};
  state.loans.forEach(l => {
    if (!peopleBalances[l.person]) peopleBalances[l.person] = 0;
    peopleBalances[l.person] += (l.type === 'loan' ? Number(l.amount) : -Number(l.amount));
  });

  const totalNet = Object.values(peopleBalances).reduce((s, b) => s + b, 0);

  container.innerHTML = `
        <div class="banner glass" style="--accent-color: var(--accent-rose);">
            <div>
                <span class="banner-title">মোট বাকি ঋণ</span>
                <div class="banner-value">৳ ${totalNet.toLocaleString()}</div>
            </div>
        </div>

        <div class="form-card glass">
            <p style="font-weight:700; margin-bottom: 12px; font-size: 15px">নতুন ঋণের হিসাব যোগ করুন</p>
            <label>ব্যক্তির নাম</label>
            <select class="input-field" id="loan-person">${state.names.map(n => `<option>${n}</option>`).join('')}</select>
            <label style="margin-top: 16px;">পরিমাণ</label>
            <input type="number" class="input-field" id="loan-amount" placeholder="৳ 0.00">
            <button class="action-btn btn-primary" style="background: var(--danger); margin-top: 16px;" onclick="window.addLoan('loan')">ঋণ নিলাম</button>
        </div>

        <div class="list-container">
            <h3 style="margin-left: 10px; margin-bottom: 12px; font-size: 14px; color: var(--text-secondary)">ঋণ গ্রহীতাদের তালিকা</h3>
            ${Object.keys(peopleBalances).map(person => `
                <div class="list-item" onclick="window.viewLoanDetail('${person}')">
                    <div class="item-info">
                        <h4>${person}</h4>
                        <p>ব্যক্তিগত লেজার দেখুন</p>
                    </div>
                    <div class="item-amount" style="color: ${peopleBalances[person] > 0 ? 'var(--danger)' : 'var(--success)'}">
                        ৳ ${Math.abs(peopleBalances[person]).toLocaleString()}
                    </div>
                    <i class="fa-solid fa-chevron-right" style="color:rgba(0,0,0,0.1); margin-left:10px"></i>
                </div>
            `).join('')}
            
            ${Object.keys(peopleBalances).length === 0 ? '<p style="text-align:center; padding: 20px; color: var(--text-secondary)">কোনো ঋণের হিসাব পাওয়া যায়নি</p>' : ''}
        </div>
    `;
}

function renderLoanDetailView(container) {
  const person = state.selectedPerson;
  const personHistory = state.loans.filter(l => l.person === person);
  const personNet = personHistory.reduce((s, l) => s + (l.type === 'loan' ? Number(l.amount) : -Number(l.amount)), 0);

  container.innerHTML = `
        <div style="padding: 0 20px 20px 20px;">
             <button class="glass" style="padding: 8px 16px; border-radius: 12px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; color: var(--text-secondary)" onclick="navigate('loans')">
                <i class="fa-solid fa-arrow-left"></i> পেছনে যান
             </button>
        </div>

        <div class="banner glass" style="--accent-color: var(--accent-blue); margin-top: 0;">
            <div>
                <span class="banner-title"><b style="color: var(--accent-blue)">${person}</b>-এর মোট হিসাব</span>
                <div class="banner-value" style="color: ${personNet > 0 ? 'var(--danger)' : 'var(--success)'}">৳ ${Math.abs(personNet).toLocaleString()} ${personNet > 0 ? '(বাকি)' : '(পরিশোধিত)'}</div>
            </div>
        </div>

        <div class="form-card glass">
            <p style="font-weight:700; margin-bottom: 12px; font-size: 15px">পরিশোধ বা আদায় যোগ করুন</p>
            <label>টাকার পরিমাণ</label>
            <input type="number" class="input-field" id="quick-loan-amount" placeholder="৳ 0.00">
            <button class="action-btn btn-primary" style="background: var(--success); margin-top: 16px;" onclick="window.quickAddSodh()">পরিশোধ দিলাম</button>
        </div>

        <div class="list-container">
            <h3 style="margin-left: 10px; margin-bottom: 12px; font-size: 14px; color: var(--text-secondary)">লেনদেনের ইতিহাস</h3>
            ${personHistory.map((l, idx) => {
    // Find global index for deletion
    const globalIdx = state.loans.indexOf(l);
    return `
                <div class="list-item">
                    <div class="item-info">
                        <h4>${l.type === 'loan' ? 'ঋণ গ্রহণ' : 'পরিশোধ প্রদান'}</h4>
                        <p>${new Date(l.date).toLocaleDateString()}</p>
                    </div>
                    <div class="item-amount" style="color: ${l.type === 'loan' ? 'var(--danger)' : 'var(--success)'}">
                        ${l.type === 'loan' ? '+' : '-'} ৳ ${Number(l.amount).toLocaleString()}
                    </div>
                    <i class="fa-solid fa-trash-can" style="color:rgba(0,0,0,0.1); margin-left: 10px; cursor: pointer;" onclick="window.deleteItem('loans', ${globalIdx})"></i>
                </div>
              `;
  }).reverse().join('')}
        </div>
    `;
}

window.viewLoanDetail = (person) => {
  state.selectedPerson = person;
  state.view = 'loan-detail';
  render();
};

window.quickAddSodh = async () => {
  const amount = document.getElementById('quick-loan-amount').value;
  const person = state.selectedPerson;
  if (!amount || isNaN(amount) || !person) {
    window.showToast('সঠিক টাকার পরিমাণ দিন', 'error');
    return;
  }

  state.loans.push({ person, amount, type: 'sodh', date: new Date().toISOString() });
  render();
  window.showToast('সফলভাবে যোগ করা হয়েছে');
  await persistData();
};

function renderDebtsView(container) {
  // Group by Person and then calculate summaries based on net balances
  const peopleBalances = {};
  state.debts.forEach(d => {
    if (!peopleBalances[d.person]) peopleBalances[d.person] = 0;
    peopleBalances[d.person] += (d.type === 'receive' ? Number(d.amount) : -Number(d.amount));
  });

  let pabo = 0;
  let debo = 0;
  Object.values(peopleBalances).forEach(balance => {
    if (balance > 0) pabo += balance;
    else if (balance < 0) debo += Math.abs(balance);
  });

  container.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 0 20px 10px 20px;">
            <div class="glass" style="padding: 20px; border-bottom: 3px solid var(--success)">
               <span style="font-size: 11px; color: var(--text-muted)">পেলাম</span>
               <div style="font-size: 18px; font-weight: 800; color: var(--success)">৳ ${pabo.toLocaleString()}</div>
            </div>
            <div class="glass" style="padding: 20px; border-bottom: 3px solid var(--danger)">
               <span style="font-size: 11px; color: var(--text-muted)">দিলাম</span>
               <div style="font-size: 18px; font-weight: 800; color: var(--danger)">৳ ${debo.toLocaleString()}</div>
            </div>
        </div>

        <div class="form-card glass" style="margin-top: 5px;">
            <p style="font-weight:700; margin-bottom: 12px; font-size: 15px">হিসাব ওপেন করুন</p>
            <label>ব্যক্তির নাম</label>
            <select class="input-field" id="open-debt-person">${state.names.map(n => `<option>${n}</option>`).join('')}</select>
            <button class="action-btn btn-primary" style="margin-top: 16px;" onclick="window.handleOpenLedger()">হিসাব ওপেন করুন</button>
        </div>

        <div class="list-container">
            <h3 style="margin-left: 10px; margin-bottom: 12px; font-size: 14px; color: var(--text-secondary)">ব্যক্তিদের তালিকা</h3>
            ${Object.keys(peopleBalances).map(person => `
                <div class="list-item" onclick="window.viewDebtDetail('${person}')">
                    <div class="item-info">
                        <h4>${person}</h4>
                        <p>${peopleBalances[person] >= 0 ? 'আপনি পাবেন' : 'আপনি দিবেন'}</p>
                    </div>
                    <div class="item-amount" style="color: ${peopleBalances[person] >= 0 ? 'var(--success)' : 'var(--danger)'}">
                        ${peopleBalances[person] >= 0 ? '+' : '-'} ৳ ${Math.abs(peopleBalances[person]).toLocaleString()}
                    </div>
                    <i class="fa-solid fa-chevron-right" style="color:rgba(0,0,0,0.1); margin-left:10px"></i>
                </div>
            `).join('')}
            ${Object.keys(peopleBalances).length === 0 ? '<p style="text-align:center; padding: 20px; color: var(--text-secondary)">কোনো হিসাব পাওয়া যায়নি</p>' : ''}
        </div>
    `;
}

window.handleOpenLedger = () => {
  const person = document.getElementById('open-debt-person').value;
  if (person) window.viewDebtDetail(person);
};

function renderDebtDetailView(container) {
  const person = state.selectedPerson;
  const personHistory = state.debts.filter(d => d.person === person);
  const personNet = personHistory.reduce((s, h) => s + (h.type === 'receive' ? Number(h.amount) : -Number(h.amount)), 0);

  container.innerHTML = `
        <div style="padding: 0 20px 20px 20px;">
             <button class="glass" style="padding: 8px 16px; border-radius: 12px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; color: var(--text-secondary)" onclick="navigate('debts')">
                <i class="fa-solid fa-arrow-left"></i> পেছনে যান
             </button>
        </div>

        <div class="banner glass" style="--accent-color: var(--accent-blue); margin-top: 0;">
            <div>
                <span class="banner-title"><b style="color: var(--accent-blue)">${person}</b>-এর নেট ব্যালেন্স</span>
                <div class="banner-value" style="color: ${personNet >= 0 ? 'var(--success)' : 'var(--danger)'}">৳ ${Math.abs(personNet).toLocaleString()} ${personNet >= 0 ? '(পেলাম)' : '(দিলাম)'}</div>
            </div>
        </div>

        <div class="form-card glass">
            <p style="font-weight:700; margin-bottom: 12px; font-size: 15px">হিসাব যোগ করুন</p>
            <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 10px;">
                <select class="input-field" id="quick-debt-type" style="margin-top:0; height: 50px;">
                    <option value="receive">পেলাম</option>
                    <option value="give">দিলাম</option>
                </select>
                <input type="number" class="input-field" id="quick-debt-amount" placeholder="টাকার পরিমাণ" style="margin-top:0; height: 50px;">
            </div>
            <input type="date" class="input-field" id="quick-debt-date" style="margin-top: 10px;">
            <button class="action-btn" style="background: var(--success); color: white; margin-top: 16px; height: 50px; font-size: 18px;" onclick="window.quickAddDebtLogic()">যোগ করুন</button>
        </div>

        <div class="list-container">
            <h3 style="margin-left: 10px; margin-bottom: 12px; font-size: 14px; color: var(--text-secondary)">লেনদেনের ইতিহাস</h3>
            ${personHistory.map((d, idx) => {
    const globalIdx = state.debts.indexOf(d);
    return `
                <div class="list-item">
                    <div class="item-info">
                        <h4>${d.type === 'receive' ? 'পেলাম' : 'দিলাম'}</h4>
                        <p>${new Date(d.date).toLocaleDateString()}</p>
                    </div>
                    <div class="item-amount" style="color: ${d.type === 'receive' ? 'var(--success)' : 'var(--danger)'}">
                        ${d.type === 'receive' ? '+' : '-'} ৳ ${Number(d.amount).toLocaleString()}
                    </div>
                    <i class="fa-solid fa-trash-can" style="color:rgba(0,0,0,0.1); margin-left: 10px; cursor: pointer;" onclick="window.deleteItem('debts', ${globalIdx})"></i>
                </div>
              `;
  }).reverse().join('')}
        </div>
    `;
}

window.viewDebtDetail = (person) => {
  state.selectedPerson = person;
  state.view = 'debt-detail';
  render();
};

window.quickAddDebtLogic = async () => {
  const amount = document.getElementById('quick-debt-amount').value;
  const type = document.getElementById('quick-debt-type').value;
  const dateInput = document.getElementById('quick-debt-date').value;
  const person = state.selectedPerson;

  if (!amount || isNaN(amount) || !person) {
    window.showToast('সঠিক তথ্য দিন', 'error');
    return;
  }

  const date = dateInput ? new Date(dateInput).toISOString() : new Date().toISOString();

  state.debts.push({ person, amount, type, date });
  render();
  window.showToast('হিসাব সফলভাবে যোগ করা হয়েছে');
  await persistData();
};

function renderSettingsView(container) {
  container.innerHTML = `
        <!-- Card 1: Manage Names -->
        <div class="form-card glass">
            <h3 style="margin-bottom: 20px; font-size: 16px; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-user-group" style="color: var(--accent-blue)"></i> নাম পরিচালনা
            </h3>
            <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                <input type="text" class="input-field" id="new-person-name" placeholder="নতুন ব্যক্তির নাম" style="margin: 0;">
                <button class="action-btn btn-primary" style="width: auto; padding: 0 20px; margin: 0;" onclick="window.addName()">যোগ</button>
            </div>
            <div class="list-container" style="max-height: 250px; overflow-y: auto; padding: 0; border: 1px solid rgba(0,0,0,0.05); border-radius: 12px;">
                ${state.names.map((name, idx) => `
                    <div class="list-item" style="padding: 12px 15px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <span style="font-weight: 500;">${name}</span>
                        <i class="fa-solid fa-trash-can" style="color:rgba(0,0,0,0.2); cursor: pointer;" onclick="window.deleteName(${idx})"></i>
                    </div>
                `).join('')}
                ${state.names.length === 0 ? '<p style="padding: 15px; text-align: center; color: var(--text-muted); font-size: 13px;">কোনো নাম যোগ করা হয়নি</p>' : ''}
            </div>
        </div>

        <!-- Card 2: Manage Categories -->
        <div class="form-card glass" style="margin-top: 20px;">
            <h3 style="margin-bottom: 20px; font-size: 16px; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-tags" style="color: var(--success)"></i> খরচের ধরন পরিচালনা
            </h3>
            <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                <input type="text" class="input-field" id="new-category" placeholder="নতুন খরচের ধরন" style="margin: 0;">
                <button class="action-btn btn-primary" style="width: auto; padding: 0 20px; margin: 0;" onclick="window.addCategory()">যোগ</button>
            </div>
            <div class="list-container" style="max-height: 250px; overflow-y: auto; padding: 0; border: 1px solid rgba(0,0,0,0.05); border-radius: 12px;">
                ${state.categories.map((name, idx) => `
                    <div class="list-item" style="padding: 12px 15px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <span style="font-weight: 500;">${name}</span>
                        <i class="fa-solid fa-trash-can" style="color:rgba(0,0,0,0.2); cursor: pointer;" onclick="window.deleteCategory(${idx})"></i>
                    </div>
                `).join('')}
                ${state.categories.length === 0 ? '<p style="padding: 15px; text-align: center; color: var(--text-muted); font-size: 13px;">কোনো ধরন যোগ করা হয়নি</p>' : ''}
            </div>
        </div>
    `;
}

// Handlers for Names
window.addName = async () => {
  const input = document.getElementById('new-person-name');
  const name = input.value.trim();
  if (name) {
    if (!state.names.includes(name)) {
      state.names.push(name);
      saveLocally();
      await saveToFirebase();
      render();
      window.showToast('নাম যোগ করা হয়েছে', 'success');
    } else {
      window.showToast('এই নামটি ইতিমধ্যে আছে', 'warning');
    }
    input.value = '';
  }
};

window.deleteName = async (index) => {
  window.showConfirm('নাম মুছুন', 'আপনি কি এই নামটি মুছতে চান?', async () => {
    state.names.splice(index, 1);
    saveLocally();
    await saveToFirebase();
    render();
    window.showToast('নাম মুছে ফেলা হয়েছে', 'success');
  });
};

// Handlers for Categories
window.addCategory = async () => {
  const input = document.getElementById('new-category');
  const name = input.value.trim();
  if (name) {
    if (!state.categories.includes(name)) {
      state.categories.push(name);
      saveLocally();
      await saveToFirebase();
      render();
      window.showToast('খরচের ধরন যোগ করা হয়েছে', 'success');
    } else {
      window.showToast('এই ধরনটি ইতিমধ্যে আছে', 'warning');
    }
    input.value = '';
  }
};

window.deleteCategory = async (index) => {
  window.showConfirm('ধরন মুছুন', 'আপনি কি এই ধরনটি মুছতে চান?', async () => {
    state.categories.splice(index, 1);
    saveLocally();
    await saveToFirebase();
    render();
    window.showToast('ধরনটি মুছে ফেলা হয়েছে', 'success');
  });
};


// Global Logic
window.navigate = (view) => {
  state.view = view;
  render();
};

window.addExpense = async () => {
  const title = document.getElementById('exp-title').value;
  const amount = document.getElementById('exp-amount').value;
  if (!title || !amount) return;
  state.expenses.push({ title, amount, date: new Date().toISOString() });
  render();
  window.showToast('খরচ সফলভাবে যোগ করা হয়েছে');
  await persistData();
};

window.addLoan = async (type) => {
  const person = document.getElementById('loan-person').value;
  const amount = document.getElementById('loan-amount').value;
  if (!person || !amount) return;
  state.loans.push({ person, amount, type, date: new Date().toISOString() });
  render();
  window.showToast('ঋণ হিসাব সফলভাবে যোগ করা হয়েছে');
  await persistData();
};

window.addDebt = async (type) => {
  const person = document.getElementById('debt-person').value;
  const amount = document.getElementById('debt-amount').value;
  if (!person || !amount) return;
  state.debts.push({ person, amount, type, date: new Date().toISOString() });
  render();
  window.showToast('লেনদেন সফলভাবে যোগ করা হয়েছে');
  await persistData();
};


window.deleteItem = async (collection, index) => {
  window.showConfirm('হিসাব মুছুন', 'আপনি কি নিশ্চিতভাবে এই হিসাবটি মুছে ফেলতে চান?', async () => {
    state[collection].splice(index, 1);
    render();
    window.showToast('সফলভাবে মুছে ফেলা হয়েছে');
    await persistData();
  });
};

function renderReportView(container) {
  // Group all data by month
  const reportData = {};

  const processCollection = (col, type, amountField, multiplier = 1) => {
    col.forEach(item => {
      const date = new Date(item.date);
      const monthKey = `${date.getFullYear()} -${String(date.getMonth() + 1).padStart(2, '0')} `;
      if (!reportData[monthKey]) reportData[monthKey] = { expenses: 0, loans: 0, debts: 0 };

      const val = Number(item[amountField]) * multiplier;
      if (type === 'expenses') reportData[monthKey].expenses += val;
      if (type === 'loans') reportData[monthKey].loans += (item.type === 'loan' ? val : -val);
      if (type === 'debts') reportData[monthKey].debts += (item.type === 'receive' ? val : -val);
    });
  };

  processCollection(state.expenses, 'expenses', 'amount');
  processCollection(state.loans, 'loans', 'amount');
  processCollection(state.debts, 'debts', 'amount');

  const sortedMonths = Object.keys(reportData).sort().reverse();

  container.innerHTML = `
        <div class="list-container">
            ${sortedMonths.map(month => {
    const data = reportData[month];
    const [year, m] = month.split('-');
    const monthName = new Date(year, m - 1).toLocaleString('default', { month: 'long' });

    return `
                <div class="glass" style="margin-bottom: 24px; padding: 20px;">
                    <h3 style="font-size: 18px; margin-bottom: 16px; color: var(--accent-indigo); border-bottom: 1px solid var(--glass-border); padding-bottom: 8px;">
                        ${monthName} ${year}
                    </h3>
                    
                    <div style="display: grid; gap: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <i class="fa-solid fa-cart-shopping" style="color: #38bdf8"></i>
                                <span style="font-size: 14px; font-weight: 600;">মোট খরচ</span>
                            </div>
                            <span style="font-weight: 700; color: var(--danger)">৳ ${data.expenses.toLocaleString()}</span>
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <i class="fa-solid fa-hand-holding-dollar" style="color: #f43f5e"></i>
                                <span style="font-size: 14px; font-weight: 600;">ঋণ (বাকি)</span>
                            </div>
                            <span style="font-weight: 700; color: ${data.loans > 0 ? 'var(--danger)' : 'var(--success)'}">৳ ${Math.abs(data.loans).toLocaleString()}</span>
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <i class="fa-solid fa-book" style="color: #818cf8"></i>
                                <span style="font-size: 14px; font-weight: 600;">লেনদেন (পেলাম)</span>
                            </div>
                            <span style="font-weight: 700; color: ${data.debts > 0 ? 'var(--success)' : 'var(--danger)'}">৳ ${Math.abs(data.debts).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
              `;
  }).join('')}
            ${sortedMonths.length === 0 ? '<p style="text-align:center; padding: 40px; color: var(--text-secondary)">কোনো প্রতিবেদন ডেটা পাওয়া যায়নি</p>' : ''}
        </div>
    `;
}

// Keyboard Awareness for Mobile
function setupKeyboardListeners() {
  const inputs = document.querySelectorAll('input, select, textarea');
  const nav = document.querySelector('.pill-nav');

  if (!nav) return;

  inputs.forEach(input => {
    input.addEventListener('focus', () => nav.classList.add('hidden'));
    input.addEventListener('blur', () => nav.classList.remove('hidden'));
  });
}

// Start
initAuth();
render(); // Initial local render
setTimeout(setupKeyboardListeners, 1000);

// Dynamic Clock Update
setInterval(() => {
  if (state.view === 'dashboard') {
    render();
  }
}, 30000); // Check every 30 seconds

const originalNavigate = window.navigate;
window.navigate = (view) => {
  originalNavigate(view);
  setTimeout(setupKeyboardListeners, 100);
};
