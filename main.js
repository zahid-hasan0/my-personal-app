import {
  doc,
  getDoc,
  setDoc,
  enableMultiTabIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import {
  db,
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  googleProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendPasswordResetEmail
} from "./firebase-config.js";

const GLOBAL_USER_ID = 'my_personal_manager_data';

// State Management
const state = {
  view: 'dashboard',
  expenses: JSON.parse(localStorage.getItem('expenses')) || [],
  debts: JSON.parse(localStorage.getItem('debts')) || [],
  loans: JSON.parse(localStorage.getItem('loans')) || [],
  names: JSON.parse(localStorage.getItem('names')) || [], // For people
  categories: JSON.parse(localStorage.getItem('categories')) || ["বাজার খরচ", "বাসা ভাড়া", "যাতায়াত", "মোবাইল বিল", "অন্যান্য"], // For expenses
  selectedPerson: null,
  loansFormOpen: false,
  debtsFormOpen: false,
  todos: JSON.parse(localStorage.getItem('todos')) || [],
  reportFilter: 'home',
  currentUser: null,
};

const appData = document.getElementById('app');
let isSyncing = false;

// Bengali Number Converter
const bnNum = (num) => {
  if (num === null || num === undefined) return "";
  const n = String(num);
  const digits = { '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪', '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯' };
  return n.split('').map(d => digits[d] || d).join('');
};

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
  localStorage.setItem('todos', JSON.stringify(state.todos));
  localStorage.setItem('names', JSON.stringify(state.names));
  localStorage.setItem('categories', JSON.stringify(state.categories));
}

async function saveToFirebase() {
  if (isSyncing || !state.currentUser) return;
  isSyncing = true;
  try {
    const userDocRef = doc(db, "users", state.currentUser.uid);
    await setDoc(userDocRef, {
      expenses: state.expenses,
      debts: state.debts,
      loans: state.loans,
      todos: state.todos,
      names: state.names,
      categories: state.categories,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error("Firebase Save Error:", e);
    // Silent fail for background sync
  } finally {
    isSyncing = false;
  }
}

async function loadFromFirebase(uid) {
  try {
    const userDocRef = doc(db, "users", uid);
    const docSnap = await getDoc(userDocRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      state.expenses = data.expenses || [];
      state.debts = data.debts || [];
      state.loans = data.loans || [];
      state.todos = data.todos || [];
      state.names = data.names || [];
      state.categories = data.categories || ["বাজার খরচ", "বাসা ভাড়া", "যাতায়াত", "মোবাইল বিল", "অন্যান্য"];
      saveLocally(); // Cache locally
      render();
    }
  } catch (e) {
    console.error("Load Error:", e);
  }
}

async function persistData() {
  saveLocally();
  await saveToFirebase();
}

async function initDataSync() {
  // Try to enable multi-tab offline persistence for Firestore
  try {
    await enableMultiTabIndexedDbPersistence(db);
  } catch (err) {
    if (err.code == 'failed-precondition') {
      console.warn("Multiple tabs open, persistence can only be enabled in one tab.");
    } else if (err.code == 'unimplemented') {
      console.warn("The current browser does not support persistence.");
    } else {
      console.warn("Persistence error:", err);
    }
  }

  startSync();
}

async function startSync() {
  if (!state.currentUser) return;
  const userDocRef = doc(db, "users", state.currentUser.uid);
  try {
    const docSnap = await getDoc(userDocRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      // Only update local state if cloud data is actually present
      if (data.expenses) state.expenses = data.expenses;
      if (data.debts) state.debts = data.debts;
      if (data.loans) state.loans = data.loans;
      if (data.todos) state.todos = data.todos;
      if (data.names) state.names = data.names;
      if (data.categories) state.categories = data.categories;
      saveLocally();
    } else {
      // First time use or no cloud data, upload local data if exists
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

  if (!state.currentUser) {
    renderLoginView(appData);
    return;
  }

  renderHeader();

  // Ensure IDs exist every render to prevent 'item not found'
  if (state.currentUser) {
    ['expenses', 'loans', 'debts', 'todos'].forEach(collection => {
      if (state[collection]) {
        state[collection].forEach(item => {
          if (!item.id) item.id = Date.now().toString(36) + Math.random().toString(36).substr(2);
        });
      }
    });
  }

  const content = document.createElement('div');
  appData.appendChild(content);



  if (state.view === 'dashboard') renderDashboardView(content);
  else if (state.view === 'expenses') renderExpensesView(content);
  else if (state.view === 'loans') renderLoansView(content);
  else if (state.view === 'loan-detail') renderLoanDetailView(content);
  else if (state.view === 'debts') renderDebtsView(content);
  else if (state.view === 'debt-detail') renderDebtDetailView(content);
  else if (state.view === 'todos') renderTodosView(content);
  else if (state.view === 'settings') renderSettingsView(content);
  else if (state.view === 'report') renderReportView(content);

  else if (state.view === 'report') renderReportView(content);

  const footer = document.createElement('div');
  footer.style.position = 'fixed';
  footer.style.bottom = '8px';
  footer.style.width = '100%';
  footer.style.textAlign = 'center';
  footer.style.fontSize = '11px';
  footer.style.fontWeight = '600';
  footer.style.color = 'var(--text-muted)';
  footer.style.opacity = '0.5';
  footer.style.zIndex = '1000';
  footer.innerHTML = 'Created by Zahid Hasan';
  appData.appendChild(footer);

  renderPillNav();
}

// Basic English to Bangla Phonetic Converter
function englishToBangla(text) {
  if (!text) return '';
  // If already Bangla (contains bangla unicode range), return as is
  if (/[\u0980-\u09FF]/.test(text)) return text;

  const u = text.toLowerCase();

  // Common Name Overrides
  const common = {
    'rahim': 'রহিম', 'karim': 'করিম', 'salam': 'সালাম', 'barkat': 'বরকত',
    'abdullah': 'আব্দুল্লাহ', 'rahman': 'রহমান', 'khan': 'খান',
    'ahmed': 'আহমেদ', 'mohammad': 'মোহাম্মদ', 'islam': 'ইসলাম',
    'ali': 'আলী', 'hassan': 'হাসান', 'hossain': 'হোসাইন', 'mia': 'মিয়া',
    'akash': 'আকাশ', 'batashi': 'বাতাসি', 'kalam': 'কালাম'
  };

  return text.split(' ').map(word => {
    const lw = word.toLowerCase();
    if (common[lw]) return common[lw];

    let bn = '';
    let i = 0;

    while (i < word.length) {
      let char = word[i].toLowerCase();
      let next = word[i + 1] ? word[i + 1].toLowerCase() : '';
      let double = char + next;

      // Consonants
      const cons = {
        'kh': 'খ', 'gh': 'ঘ', 'ng': 'ং', 'ch': 'চ', 'jh': 'ঝ', // ch usually च/চ, but English ch is often চ
        'sh': 'শ', 'th': 'থ', 'dh': 'ধ', 'ph': 'ফ', 'bh': 'ভ',
        'k': 'ক', 'g': 'গ', 'c': 'ক', 'j': 'জ', 't': 'ট', 'd': 'ড', 'n': 'ন',
        'p': 'প', 'f': 'ফ', 'b': 'ব', 'm': 'ম', 'r': 'র', 'l': 'ল',
        's': 'স', 'h': 'হ', 'z': 'জ', 'y': 'য়', 'w': 'উ'
      };

      // Vowels (Sign / Full)
      const vowels = {
        'a': { full: 'আ', sign: 'া' },
        'i': { full: 'ই', sign: 'ি' },
        'u': { full: 'উ', sign: 'ু' },
        'e': { full: 'এ', sign: 'ে' },
        'o': { full: 'ও', sign: 'ো' }
      };

      // Check Double Consonants first
      if (cons[double]) {
        bn += cons[double];
        i += 2;
        continue;
      }

      // Check Single Consonants
      if (cons[char]) {
        bn += cons[char];
        i++;
        continue;
      }

      // Check Vowels
      if (vowels[char]) {
        // If start of word OR follows another vowel -> Full
        const isStart = (i === 0);
        const prev = word[i - 1] ? word[i - 1].toLowerCase() : '';
        const isAfterVowel = 'aeiou'.includes(prev);

        if (isStart || isAfterVowel) {
          bn += vowels[char].full;
        } else {
          bn += vowels[char].sign;
        }
        i++;
        continue;
      }

      // Default
      bn += char;
      i++;
    }
    return bn;
  }).join(' ');
}

function renderHeader() {
  const viewTitles = {
    dashboard: 'মূলপাতা',
    expenses: 'আমার খরচ',
    loans: 'আমার ঋণ',
    'loan-detail': state.selectedPerson || 'খতিয়ানের বিবরণ',
    debts: 'হিসাব খাতা',
    'debt-detail': state.selectedPerson || 'লেনদেনের বিবরণ',
    todos: 'আজকের কাজ',
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
    let iconColor = '#2529f3ff';

    if (hour >= 5 && hour < 11) {
      periodLabel = 'এখন সকাল';
      iconClass = 'fa-cloud-sun';
      iconColor = '#f8c238ff';
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
    const timeStr = bnNum(now.toLocaleTimeString('bn-BD', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }));
    const dateStr = now.toLocaleDateString('bn-BD', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    header.innerHTML = `
            <div class="glass header-card" style="flex: 1; padding: 15px 20px; border-radius: 20px; position: relative; overflow: hidden; border: 1px solid rgba(255,255,255,0.4); box-shadow: 0 8px 32px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="z-index: 1; min-width: 0; flex: 1;"> <!-- min-width: 0 needed for flex text truncate/wrap -->
                        <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 2px; flex-wrap: wrap;">
                            <span style="font-size: 11px; font-weight: 700; color: var(--accent-blue); text-transform: uppercase; letter-spacing: 0.5px; max-width: 100%;">
                                ${greeting}${state.currentUser && state.currentUser.displayName ? ', ' + englishToBangla(state.currentUser.displayName) : ''}
                            </span>
                            <span style="font-size: 10px; font-weight: 600; color: var(--text-muted); opacity: 0.7; white-space: nowrap; max-width: 100%;">• ${periodLabel}</span>
                        </div>
                        <div style="font-size: 26px; font-weight: 900; line-height: 1.1; color: var(--text-main); letter-spacing: -1px; font-family: 'Tiro Bangla', serif; margin-top: 4px; max-width: 100%;">
                            ${timeStr}
                        </div>
                        <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-top: 4px; max-width: 100%;">
                            ${dateStr}
                        </div>
                    </div>
                    <div style="font-size: 28px; color: ${iconColor}; filter: drop-shadow(0 4px 10px ${iconColor}22); position: relative; z-index: 1; flex-shrink: 0; margin-left: 10px;">
                        <i class="fa-solid ${iconClass}"></i>
                    </div>
                </div>
                <div style="position: absolute; right: -10px; top: -10px; width: 80px; height: 80px; background: ${iconColor}; opacity: 0.03; border-radius: 50%; filter: blur(30px);"></div>
            </div>
        `;
  } else if (state.view === 'todos') {
    const dateStr = new Date().toLocaleDateString('bn-BD', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    header.innerHTML = `
            <div style="flex: 1;">
                <h1 class="greeting">${viewTitles[state.view]}</h1>
                <p class="subtitle">${dateStr}</p>
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
            ${renderModuleCard('কাজের তালিকা', 'fa-list-check', '#1ab394', 'todos')}
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
  const total = state.expenses.filter(i => !i.deleted).reduce((s, i) => s + Number(i.amount), 0);
  container.innerHTML = `
        <div class="banner glass" style="--accent-color: var(--danger); position: relative;">
            <div style="cursor: pointer;" onclick="window.goToReport('expenses')">
                <span class="banner-title">মোট খরচ <i class="fa-solid fa-circle-info" style="font-size: 12px; margin-left: 5px; opacity: 0.7;"></i></span>
                <div class="banner-value">৳ ${bnNum(total.toLocaleString())}</div>
            </div>
            <button onclick="window.goToReport('expenses')" style="position: absolute; right: 20px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.2); border: none; color: white; padding: 8px 12px; border-radius: 8px; font-size: 12px; cursor: pointer;">
                রিপোর্ট <i class="fa-solid fa-arrow-right"></i>
            </button>
        </div>

        <div class="form-card glass">
            <label>খরচের ধরন</label>
            <select class="input-field" id="exp-title">
                <option value="" disabled selected>${state.categories.length > 0 ? 'নির্বাচন করুন' : 'সেটিং থেকে খরচের ধরন যোগ করুন'}</option>
                ${state.categories.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
            <label style="margin-top: 16px;">টাকার পরিমাণ</label>
            <input type="number" class="input-field" id="exp-amount" placeholder="৳ 0.00">
            <button class="action-btn btn-primary" onclick="window.addExpense()">খরচ যোগ করুন</button>
        </div>

        <div class="list-container">
            ${state.expenses.filter(e => !e.deleted).map((e, idx) => `
                <div class="list-item">
                    <div class="item-info">
                        <h4>${e.title}</h4>
                        <p>${new Date(e.date).toLocaleDateString()}</p>
                    </div>
                    <div class="item-amount" style="color: var(--danger)">- ৳ ${bnNum(Number(e.amount).toLocaleString())}</div>
                    <i class="fa-solid fa-trash-can" style="color:rgba(0,0,0,0.1); margin-left: 10px; cursor: pointer;" onclick="window.deleteItem('expenses', '${e.id}')"></i>
                </div>
            `).reverse().join('')}
        </div>
  `;
}

function renderLoansView(container) {
  // Summary View - Net Balance per Person
  const peopleBalances = {};
  state.loans.filter(l => !l.deleted).forEach(l => {
    if (!peopleBalances[l.person]) peopleBalances[l.person] = 0;
    peopleBalances[l.person] += (l.type === 'loan' ? Number(l.amount) : -Number(l.amount));
  });

  const totalNet = Object.values(peopleBalances).reduce((s, b) => s + b, 0);

  container.innerHTML = `
        <div class="banner glass" style="--accent-color: var(--accent-rose); position: relative;">
            <div style="cursor: pointer;" onclick="window.goToReport('loans')">
                <span class="banner-title">মোট বাকি ঋণ <i class="fa-solid fa-circle-info" style="font-size: 12px; margin-left: 5px; opacity: 0.7;"></i></span>
                <div class="banner-value">৳ ${bnNum(totalNet.toLocaleString())}</div>
            </div>
            <button onclick="window.goToReport('loans')" style="position: absolute; right: 20px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.2); border: none; color: white; padding: 8px 12px; border-radius: 8px; font-size: 12px; cursor: pointer;">
                রিপোর্ট <i class="fa-solid fa-arrow-right"></i>
            </button>
        </div>

        <div class="collapsible-header ${state.loansFormOpen ? 'active' : ''}" onclick="window.toggleForm('loansFormOpen')">
            <h3>নতুন ঋণের হিসাব যোগ করুন</h3>
            <i class="fa-solid fa-chevron-down"></i>
        </div>

        <div class="collapsible-content ${state.loansFormOpen ? 'active' : ''}">
            <div class="form-card glass" style="margin-top: 0;">
                <label>ব্যক্তির নাম</label>
                <select class="input-field" id="loan-person">
                    <option value="" disabled selected>${state.names.length > 0 ? 'নির্বাচন করুন' : 'সেটিং থেকে নাম যোগ করুন'}</option>
                    ${state.names.map(n => `<option value="${n}">${n}</option>`).join('')}
                </select>
                <label style="margin-top: 16px;">পরিমাণ</label>
                <input type="number" class="input-field" id="loan-amount" placeholder="৳ ০.০০">
                <button class="action-btn btn-primary" style="background: var(--danger); margin-top: 16px;" onclick="window.addLoan('loan')">ঋণ নিলাম</button>
            </div>
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
                        ৳ ${bnNum(Math.abs(peopleBalances[person]).toLocaleString())}
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
  const personHistory = state.loans.filter(l => l.person === person && !l.deleted);
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
                <div class="banner-value" style="color: ${personNet > 0 ? 'var(--danger)' : 'var(--success)'}">৳ ${bnNum(Math.abs(personNet).toLocaleString())} ${personNet > 0 ? '(বাকি)' : '(পরিশোধিত)'}</div>
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
    return `
                <div class="list-item">
                    <div class="item-info">
                        <h4>${l.type === 'loan' ? 'ঋণ গ্রহণ' : 'পরিশোধ প্রদান'}</h4>
                        <p>${new Date(l.date).toLocaleDateString()}</p>
                    </div>
                    <div class="item-amount" style="color: ${l.type === 'loan' ? 'var(--danger)' : 'var(--success)'}">
                        ${l.type === 'loan' ? '+' : '-'} ৳ ${bnNum(Number(l.amount).toLocaleString())}
                    </div>
                    <i class="fa-solid fa-trash-can" style="color:rgba(0,0,0,0.1); margin-left: 10px; cursor: pointer;" onclick="window.deleteItem('loans', '${l.id}')"></i>
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
  state.debts.filter(d => !d.deleted).forEach(d => {
    if (!peopleBalances[d.person]) peopleBalances[d.person] = 0;
    peopleBalances[d.person] += (d.type === 'give' ? Number(d.amount) : -Number(d.amount));
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
               <span style="font-size: 11px; color: var(--text-muted)">পাবো</span>
               <div style="font-size: 18px; font-weight: 800; color: var(--success)">৳ ${bnNum(pabo.toLocaleString())}</div>
            </div>
            <div class="glass" style="padding: 20px; border-bottom: 3px solid var(--danger)">
               <span style="font-size: 11px; color: var(--text-muted)">দেবো</span>
               <div style="font-size: 18px; font-weight: 800; color: var(--danger)">৳ ${bnNum(debo.toLocaleString())}</div>
            </div>
        </div>

        <div class="collapsible-header ${state.debtsFormOpen ? 'active' : ''}" onclick="window.toggleForm('debtsFormOpen')">
            <h3>হিসাব ওপেন করুন</h3>
            <i class="fa-solid fa-chevron-down"></i>
        </div>

        <div class="collapsible-content ${state.debtsFormOpen ? 'active' : ''}">
            <div class="form-card glass" style="margin-top: 0;">
                <label>ব্যক্তির নাম</label>
                <select class="input-field" id="open-debt-person">
                    <option value="" disabled selected>${state.names.length > 0 ? 'নির্বাচন করুন' : 'সেটিং থেকে নাম যোগ করুন'}</option>
                    ${state.names.map(n => `<option value="${n}">${n}</option>`).join('')}
                </select>
                <button class="action-btn btn-primary" style="margin-top: 16px;" onclick="window.handleOpenLedger()">হিসাব ওপেন করুন</button>
            </div>
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
                        ${peopleBalances[person] >= 0 ? '+' : '-'} ৳ ${bnNum(Math.abs(peopleBalances[person]).toLocaleString())}
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
  const personHistory = state.debts.filter(d => d.person === person && !d.deleted);
  const personNet = personHistory.reduce((s, h) => s + (h.type === 'give' ? Number(h.amount) : -Number(h.amount)), 0);
  const today = new Date().toISOString().split('T')[0];

  container.innerHTML = `
        <div style="padding: 0 20px 20px 20px;">
             <button class="glass" style="padding: 8px 16px; border-radius: 12px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; color: var(--text-secondary)" onclick="navigate('debts')">
                <i class="fa-solid fa-arrow-left"></i> পেছনে যান
             </button>
        </div>

        <div class="banner glass" style="--accent-color: var(--accent-blue); margin-top: 0;">
            <div>
                <span class="banner-title"><b style="color: var(--accent-blue)">${person}</b>-এর নেট ব্যালেন্স</span>
                <div class="banner-value" style="color: ${personNet >= 0 ? 'var(--success)' : 'var(--danger)'}">৳ ${bnNum(Math.abs(personNet).toLocaleString())} ${personNet >= 0 ? '(পাবেন)' : '(দিবেন)'}</div>
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
            <input type="date" class="input-field" id="quick-debt-date" value="${today}" style="margin-top: 10px;">
            <button class="action-btn" style="background: var(--success); color: white; margin-top: 16px; height: 50px; font-size: 18px;" onclick="window.quickAddDebtLogic()">যোগ করুন</button>
        </div>

        <div class="list-container">
            <h3 style="margin-left: 10px; margin-bottom: 12px; font-size: 14px; color: var(--text-secondary)">লেনদেনের ইতিহাস</h3>
            ${personHistory.map((d, idx) => {
    const globalIdx = state.debts.indexOf(d);
    return `
                <div class="list-item">
                    <div class="item-info">
                        <h4>${d.type === 'give' ? 'দিলাম' : 'পেলাম'}</h4>
                        <p>${new Date(d.date).toLocaleDateString()}</p>
                    </div>
                    <div class="item-amount" style="color: ${d.type === 'give' ? 'var(--success)' : 'var(--danger)'}">
                        ${d.type === 'give' ? '+' : '-'} ৳ ${bnNum(Number(d.amount).toLocaleString())}
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

function renderTodosView(container) {
  const today = new Date().toISOString().split('T')[0];
  const todayTodos = state.todos.filter(t => t.date === today && !t.deleted);
  const completed = todayTodos.filter(t => t.completed).length;
  const total = todayTodos.length;
  const remaining = total - completed;

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const dateStr = new Date().toLocaleDateString('bn-BD', { weekday: 'long', day: 'numeric', month: 'long' });

  container.innerHTML = `
        <div class="banner glass" style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%); border: 1px solid rgba(16, 185, 129, 0.3); position: relative; display: block;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                <div>
                    <span style="font-size: 12px; font-weight: 700; color: var(--success); text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 4px;">আজকের টাস্ক</span>
                    <h2 style="font-size: 32px; font-weight: 900; color: var(--text-main); margin: 0; line-height: 1.1;">${bnNum(remaining)} <span style="font-size: 16px; font-weight: 600; color: var(--text-muted);">টি বাকি</span></h2>
                    <p style="font-size: 13px; color: var(--text-muted); margin-top: 6px; font-weight: 500;">${dateStr}</p>
                </div>
                <div style="text-align: right;">
                    <div style="width: 50px; height: 50px; border-radius: 50%; background: white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15); cursor: pointer; transition: transform 0.2s;" onclick="window.goToReport('todos')" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                        <i class="fa-solid fa-chart-pie" style="color: var(--success); font-size: 20px;"></i>
                    </div>
                </div>
            </div>

            <div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px; font-weight: 700; color: var(--text-secondary);">
                    <span>প্রগ্রেস</span>
                    <span>${bnNum(percent)}%</span>
                </div>
                <div style="background: white; height: 8px; border-radius: 20px; overflow: hidden; position: relative; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);">
                    <div style="background: linear-gradient(90deg, var(--success), #34d399); height: 100%; width: ${percent}%; border-radius: 20px; transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 10px rgba(16, 185, 129, 0.3);"></div>
                </div>
            </div>
        </div>

        <div class="form-card glass">
             <label style="margin-bottom: 8px; display: block; color: var(--text-secondary); font-size: 12px; font-weight: 600;">নতুন কাজ</label>
             <div style="display: flex; gap: 10px;">
                <input type="text" class="input-field" id="todo-text" placeholder="কাজের বিবরণ লিখুন..." 
                       style="margin-bottom: 0;"
                       onkeypress="if(event.key==='Enter') window.addTodo()">
                <button class="action-btn btn-primary" onclick="window.addTodo()" 
                        style="width: auto; margin-top: 0; padding: 0 20px; white-space: nowrap;">
                    <i class="fa-solid fa-plus"></i>
                </button>
             </div>
        </div>

        <div class="list-container">
            <h3 style="margin-left: 10px; margin-bottom: 12px; font-size: 14px; color: var(--text-secondary)">কাজের তালিকা</h3>
            ${todayTodos.map((todo) => `
                <div class="list-item" style="transition: all 0.2s; ${todo.completed ? 'opacity: 0.7;' : ''}">
                    <div class="item-info" style="display: flex; align-items: center; gap: 12px; width: 100%;">
                        <input type="checkbox" ${todo.completed ? 'checked' : ''} 
                                   onchange="window.toggleTodo('${todo.id}')" 
                                   style="width: 20px; height: 20px; cursor: pointer; accent-color: var(--success); flex-shrink: 0;">
                        <div style="flex: 1;">
                            <h4 style="${todo.completed ? 'text-decoration: line-through; color: var(--text-muted);' : 'color: var(--text-main);'} font-size: 15px;">${todo.text}</h4>
                        </div>
                        <i class="fa-solid fa-trash-can" onclick="window.deleteTodo('${todo.id}')" 
                           style="color: var(--danger); opacity: 0.3; cursor: pointer; font-size: 14px; padding: 8px;"
                           onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.3'"></i>
                    </div>
                </div>
            `).join('')}
            
            ${todayTodos.length === 0 ? `
                <div style="text-align: center; padding: 40px 20px;">
                    <i class="fa-solid fa-clipboard-list" style="font-size: 32px; color: #e5e7eb; margin-bottom: 12px;"></i>
                    <p style="font-size: 14px; color: var(--text-muted);">আজকের জন্য কোনো কাজ নেই</p>
                </div>
            ` : ''}
        </div>
    `;
}

function renderSettingsView(container) {
  if (!state.settingsSubView || state.settingsSubView === 'home') {
    container.innerHTML = `
        <div class="grid">
            <div class="module-card glass" onclick="window.openSettingsModule('categories')">
                <div class="icon-wrapper" style="background: #1ab394">
                    <i class="fa-solid fa-tags"></i>
                </div>
                <span class="module-name">খরচের ধরন</span>
            </div>
            <div class="module-card glass" onclick="window.openSettingsModule('names')">
                <div class="icon-wrapper" style="background: #1ab394">
                    <i class="fa-solid fa-users"></i>
                </div>
                <span class="module-name">নামের তালিকা</span>
            </div>
            <div class="module-card glass" onclick="window.openSettingsModule('profile')">
                <div class="icon-wrapper" style="background: #1ab394">
                    <i class="fa-solid fa-user-pen"></i>
                </div>
                <span class="module-name">প্রোফাইল</span>
            </div>
        </div>
        
        <div class="form-card glass" style="margin-top: 20px;">
             <h3 style="margin-bottom: 20px; font-size: 16px; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-gear" style="color: var(--text-muted)"></i> অন্যান্য
            </h3>
            <button onclick="window.handleLogout()" style="width: 100%; padding: 12px; background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid var(--danger); border-radius: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <i class="fa-solid fa-right-from-bracket"></i> লগআউট করুন
            </button>
        </div>
      `;
    return;
  }

  // Common Back Button
  const backBtn = `
    <div style="padding: 0 20px 20px 20px;">
         <button class="glass" style="padding: 8px 16px; border-radius: 12px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; color: var(--text-secondary)" onclick="window.openSettingsModule('home')">
            <i class="fa-solid fa-arrow-left"></i> পেছনে যান
         </button>
    </div>
  `;

  if (state.settingsSubView === 'names') {
    container.innerHTML = backBtn + `
        <div class="form-card glass" style="margin-top:0;">
            <h3 style="margin-bottom: 20px; font-size: 16px; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-user-group" style="color: var(--accent-blue)"></i> নাম পরিচালনা
            </h3>
            
            <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                <input type="text" id="new-name-input" class="input-field" placeholder="নতুন নাম লিখুন" style="margin-top:0;">
                <button class="action-btn btn-primary" onclick="window.addName()" style="margin-top:0; width: auto; white-space: nowrap; padding: 0 20px;">
                    <i class="fa-solid fa-plus"></i> যোগ
                </button>
            </div>

            <div class="list-container" style="max-height: 400px; overflow-y: auto; padding: 0; border: 1px solid rgba(0,0,0,0.05); border-radius: 12px;">
                ${state.names.map((name, idx) => `
                    <div class="list-item" style="padding: 12px 15px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <span style="font-weight: 500;">${name}</span>
                        <i class="fa-solid fa-trash-can" style="color:rgba(0,0,0,0.2); cursor: pointer;" onclick="window.deleteName(${idx})"></i>
                    </div>
                `).join('')}
                ${state.names.length === 0 ? '<p style="padding: 15px; text-align: center; color: var(--text-muted); font-size: 13px;">কোনো নাম যোগ করা হয়নি</p>' : ''}
            </div>
        </div>
     `;
  } else if (state.settingsSubView === 'categories') {
    container.innerHTML = backBtn + `
        <div class="form-card glass" style="margin-top:0;">
            <h3 style="margin-bottom: 20px; font-size: 16px; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-tags" style="color: var(--success)"></i> খরচের ধরন পরিচালনা
            </h3>

            <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                <input type="text" id="new-category-input" class="input-field" placeholder="নতুন ধরন লিখুন" style="margin-top:0;">
                <button class="action-btn btn-primary" onclick="window.addCategory()" style="margin-top:0; width: auto; white-space: nowrap; padding: 0 20px;">
                    <i class="fa-solid fa-plus"></i> যোগ
                </button>
            </div>

            <div class="list-container" style="max-height: 400px; overflow-y: auto; padding: 0; border: 1px solid rgba(0,0,0,0.05); border-radius: 12px;">
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
  } else if (state.settingsSubView === 'profile') {
    const user = state.currentUser;
    container.innerHTML = backBtn + `
         <div class="form-card glass" style="margin-top:0;">
            <h3 style="margin-bottom: 20px; font-size: 16px; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-user-pen" style="color: var(--accent-blue)"></i> প্রোফাইল এডিট
            </h3>
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="width: 80px; height: 80px; background: var(--accent-blue); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 10px auto;">
                    ${user.photoURL ? `<img src="${user.photoURL}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : (user.displayName ? user.displayName[0] : 'U')}
                </div>
                <p style="font-size: 14px; color: var(--text-muted);">${user.email}</p>
            </div>
            
            <label>আপনার নাম</label>
            <input type="text" class="input-field" id="profile-name" value="${user.displayName || ''}" placeholder="আপনার নাম লিখুন">
            
            <button class="action-btn btn-primary" onclick="window.updateUserProfile()">আপডেট করুন</button>
         </div>
      `;
  }
}

window.openSettingsModule = (module) => {
  history.pushState({ view: 'settings', subView: module }, '', '#settings/' + module);
  state.settingsSubView = module;
  render();
};

window.updateUserProfile = async () => {
  const nameInput = document.getElementById('profile-name');
  const newName = nameInput.value.trim();

  if (!newName) {
    window.showToast('দয়া করে একটি নাম দিন', 'warning');
    return;
  }

  try {
    await updateProfile(auth.currentUser, {
      displayName: newName
    });
    state.currentUser = auth.currentUser; // Force update state
    window.showToast('প্রোফাইল আপডেট হয়েছে', 'success');
    render(); // Will re-render header with new name
  } catch (error) {
    console.error(error);
    window.showToast('আপডেট ব্যর্থ হয়েছে', 'error');
  }
};

// Handlers for Names
window.addName = async () => {
  const input = document.getElementById('new-name-input');
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
  } else {
    window.showToast('দয়া করে নাম লিখুন', 'warning');
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
  const input = document.getElementById('new-category-input');
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
  } else {
    window.showToast('দয়া করে খরচের ধরন লিখুন', 'warning');
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

window.goToReport = (type) => {
  state.reportFilter = type;
  navigate('report');
};

window.toggleForm = (key) => {
  state[key] = !state[key];
  render();
};

// To-Do List Functions
window.addTodo = async () => {
  const input = document.getElementById('todo-text');
  const text = input.value.trim();
  if (!text) {
    window.showToast('কাজের বিবরণ লিখুন', 'warning');
    return;
  }

  const todo = {
    id: Date.now().toString(),
    text,
    completed: false,
    date: new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString()
  };

  state.todos.push(todo);
  input.value = '';
  render();
  window.showToast('কাজ যোগ করা হয়েছে', 'success');
  await persistData();
};

window.toggleTodo = async (id) => {
  const todo = state.todos.find(t => t.id === id);
  if (todo) {
    todo.completed = !todo.completed;
    render();
    await persistData();
  }
};

window.deleteTodo = async (id) => {
  window.showConfirm('কাজ মুছুন', 'আপনি কি এই কাজটি মুছতে চান?', async () => {
    const todo = state.todos.find(t => t.id === id);
    if (todo) todo.deleted = true;
    render();
    window.showToast('কাজ মুছে ফেলা হয়েছে', 'success');
    await persistData();
  });
};

window.addExpense = async () => {
  const title = document.getElementById('exp-title').value;
  const amount = document.getElementById('exp-amount').value;
  if (!title || !amount) return;
  state.expenses.push({
    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
    title,
    amount,
    date: new Date().toISOString()
  });
  render();
  window.showToast('খরচ সফলভাবে যোগ করা হয়েছে');
  await persistData();
};

window.addLoan = async (type) => {
  const person = document.getElementById('loan-person').value;
  const amount = document.getElementById('loan-amount').value;
  if (!person || !amount) return;
  state.loans.push({
    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
    person,
    amount,
    type,
    date: new Date().toISOString()
  });
  render();
  window.showToast('ঋণ হিসাব সফলভাবে যোগ করা হয়েছে');
  await persistData();
};

window.addDebt = async (type) => {
  const person = document.getElementById('debt-person').value;
  const amount = document.getElementById('debt-amount').value;
  if (!person || !amount) return;
  state.debts.push({
    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
    person,
    amount,
    type,
    date: new Date().toISOString()
  });
  render();
  window.showToast('লেনদেন সফলভাবে যোগ করা হয়েছে');
  await persistData();
};


window.deleteItem = async (collection, id) => {
  window.showConfirm('হিসাব মুছুন', 'আপনি কি নিশ্চিতভাবে এই হিসাবটি মুছে ফেলতে চান?', async () => {
    const item = state[collection].find(i => i.id === id);
    if (item) {
      item.deleted = true;
      render();
      window.showToast('হিসাবটি মুছে ফেলা হয়েছে', 'success');
      await persistData();
    } else {
      window.showToast('হিসাবটি খুঁজে পাওয়া যাচ্ছে না', 'error');
    }
  });
};

// Migration for legacy items
const ensureIds = (collection) => {
  state[collection].forEach(item => {
    if (!item.id) item.id = Date.now().toString(36) + Math.random().toString(36).substr(2);
  });
};

// Quick Add Removed

window.deleteItem = async (collection, id) => {
  window.showConfirm('হিসাব মুছুন', 'আপনি কি নিশ্চিতভাবে এই হিসাবটি মুছে ফেলতে চান?', async () => {
    // Ensure IDs exist before trying to find (in case of legacy data not yet migrated)
    ensureIds(collection);

    // Find by ID
    const item = state[collection].find(i => i.id === id);
    if (item) {
      item.deleted = true; // Soft delete
      render();
      window.showToast('সফলভাবে মুছে ফেলা হয়েছে');
      await persistData();
    } else {
      window.showToast('Item not found', 'error');
    }
  });
};

window.permanentlyDeleteItem = async (collection, id) => {
  window.showConfirm('স্থায়ীভাবে মুছুন', 'এটি পুনরুদ্ধার করা যাবে না। আপনি কি নিশ্চিত?', async () => {
    state[collection] = state[collection].filter(i => i.id !== id);
    render();
    window.showToast('চিরতরে মুছে ফেলা হয়েছে', 'success');
    await persistData();
  });
};

function renderReportView(container) {
  if (state.reportFilter === 'home') {
    container.innerHTML = `
        <div class="grid">
            <div class="module-card glass" onclick="window.setReportFilter('expenses')">
                <div class="icon-wrapper" style="background: #1ab394">
                    <i class="fa-solid fa-cart-shopping"></i>
                </div>
                <span class="module-name">খরচের রিপোর্ট</span>
            </div>
            <div class="module-card glass" onclick="window.setReportFilter('loans')">
                <div class="icon-wrapper" style="background: #1ab394">
                    <i class="fa-solid fa-hand-holding-dollar"></i>
                </div>
                <span class="module-name">ঋণের রিপোর্ট</span>
            </div>
            <div class="module-card glass" onclick="window.setReportFilter('debts')">
                <div class="icon-wrapper" style="background: #1ab394">
                    <i class="fa-solid fa-book"></i>
                </div>
                <span class="module-name">লেনদেনের রিপোর্ট</span>
            </div>
            <div class="module-card glass" onclick="window.setReportFilter('todos')">
                <div class="icon-wrapper" style="background: #1ab394">
                    <i class="fa-solid fa-clipboard-check"></i>
                </div>
                <span class="module-name">কাজের রিপোর্ট</span>
            </div>
        </div>
      `;
    return;
  }

  // Header for specific view
  const titles = { expenses: 'মুছে ফেলা খরচ', loans: 'মুছে ফেলা ঋণ', debts: 'মুছে ফেলা লেনদেন', todos: 'সম্পন্ন/মুছে ফেলা কাজ' };

  const headerHtml = `
      <div style="padding: 0 20px 20px 20px; display: flex; justify-content: space-between; align-items: center;">
          <button class="glass" style="padding: 8px 16px; border-radius: 12px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; color: var(--text-secondary)" onclick="window.setReportFilter('home')">
             <i class="fa-solid fa-arrow-left"></i> পেছনে যান
          </button>
          <button class="glass" style="padding: 8px 16px; border-radius: 12px; border: 1px solid var(--danger); background: rgba(239, 68, 68, 0.1); font-size: 13px; font-weight: 600; cursor: pointer; color: var(--danger)" onclick="window.clearAllReportData('${state.reportFilter}')">
             <i class="fa-solid fa-trash-can"></i> সব মুছুন
          </button>
      </div>
      <h2 style="padding: 0 20px 20px 20px; font-size: 18px; color: var(--text-main);">${titles[state.reportFilter]}</h2>
    `;

  // Data Processing - ONLY DELETED ITEMS
  const reportData = {};
  const initMonth = (key) => {
    if (!reportData[key]) reportData[key] = { expenses: [], loans: [], debts: [], todos: [] };
  };

  const processCollection = (col, type) => {
    col.forEach(item => {
      // ONLY include if DELETED
      if (!item.deleted) return;

      const date = new Date(item.date);
      const monthKey = `${date.getFullYear()} -${String(date.getMonth() + 1).padStart(2, '0')} `;
      initMonth(monthKey);

      if (type === 'expenses') reportData[monthKey].expenses.push(item);
      if (type === 'loans') reportData[monthKey].loans.push(item);
      if (type === 'debts') reportData[monthKey].debts.push(item);
    });
  };

  if (state.reportFilter === 'expenses') processCollection(state.expenses, 'expenses');
  if (state.reportFilter === 'loans') processCollection(state.loans, 'loans');
  if (state.reportFilter === 'debts') processCollection(state.debts, 'debts');

  if (state.reportFilter === 'todos') {
    state.todos.forEach(todo => {
      // Include if COMPLETED or DELETED
      if (todo.completed || todo.deleted) {
        const date = new Date(todo.date);
        const monthKey = `${date.getFullYear()} -${String(date.getMonth() + 1).padStart(2, '0')} `;
        initMonth(monthKey);
        reportData[monthKey].todos.push(todo);
      }
    });
  }

  const sortedMonths = Object.keys(reportData).sort().reverse();

  const contentHtml = sortedMonths.map(month => {
    const data = reportData[month];
    if (state.reportFilter === 'expenses' && data.expenses.length === 0) return '';
    if (state.reportFilter === 'loans' && data.loans.length === 0) return '';
    if (state.reportFilter === 'debts' && data.debts.length === 0) return '';
    if (state.reportFilter === 'todos' && data.todos.length === 0) return '';

    const [year, m] = month.split('-');
    const monthName = new Date(year, m - 1).toLocaleString('default', { month: 'long' });

    let listHtml = '';

    if (state.reportFilter === 'expenses') {
      listHtml = data.expenses.map(e => `
            <div class="list-item" style="opacity: 0.8; background: rgba(0,0,0,0.02);">
                <div class="item-info">
                    <h4>${e.title} <span style="color:var(--danger); font-size:10px;">(মুছে ফেলা)</span></h4>
                    <p>${new Date(e.date).toLocaleDateString()}</p>
                </div>
                <div class="item-amount" style="color: var(--danger)">- ৳ ${bnNum(Number(e.amount).toLocaleString())}</div>
                <i class="fa-solid fa-trash-can" style="color: var(--danger); margin-left: 10px; cursor: pointer;" onclick="window.permanentlyDeleteItem('expenses', '${e.id}')"></i>
            </div>
          `).reverse().join('');
    } else if (state.reportFilter === 'loans') {
      listHtml = data.loans.map(l => `
            <div class="list-item" style="opacity: 0.8; background: rgba(0,0,0,0.02);">
                <div class="item-info">
                    <h4>${l.person} (${l.type === 'loan' ? 'ঋণ' : 'পরিশোধ'}) <span style="color:var(--danger); font-size:10px;">(মুছে ফেলা)</span></h4>
                    <p>${new Date(l.date).toLocaleDateString()}</p>
                </div>
                <div class="item-amount" style="color: ${l.type === 'loan' ? 'var(--danger)' : 'var(--success)'}">
                    ${l.type === 'loan' ? '+' : '-'} ৳ ${bnNum(Number(l.amount).toLocaleString())}
                </div>
                <i class="fa-solid fa-trash-can" style="color: var(--danger); margin-left: 10px; cursor: pointer;" onclick="window.permanentlyDeleteItem('loans', '${l.id}')"></i>
            </div>
          `).reverse().join('');
    } else if (state.reportFilter === 'debts') {
      listHtml = data.debts.map(d => `
            <div class="list-item" style="opacity: 0.8; background: rgba(0,0,0,0.02);">
                <div class="item-info">
                    <h4>${d.person} (${d.type === 'give' ? 'দিলাম' : 'পেলাম'}) <span style="color:var(--danger); font-size:10px;">(মুছে ফেলা)</span></h4>
                    <p>${new Date(d.date).toLocaleDateString()}</p>
                </div>
                <div class="item-amount" style="color: ${d.type === 'give' ? 'var(--success)' : 'var(--danger)'}">
                    ${d.type === 'give' ? '+' : '-'} ৳ ${bnNum(Number(d.amount).toLocaleString())}
                </div>
                <i class="fa-solid fa-trash-can" style="color: var(--danger); margin-left: 10px; cursor: pointer;" onclick="window.permanentlyDeleteItem('debts', '${d.id}')"></i>
            </div>
          `).reverse().join('');
    } else if (state.reportFilter === 'todos') {
      listHtml = data.todos.map(t => `
            <div class="list-item" style="opacity: 0.8; background: rgba(0,0,0,0.02);">
                 <div class="item-info">
                    <h4 style="text-decoration: line-through; color: var(--text-muted)">${t.text} ${t.deleted ? '<span style="color:var(--danger); font-size:10px;">(মুছে ফেলা)</span>' : '<span style="color:var(--success); font-size:10px;">(সম্পন্ন)</span>'}</h4>
                    <p>${new Date(t.date).toLocaleDateString()}</p>
                </div>
                <div class="item-amount" style="color: var(--success)">
                    ${t.deleted ? '<i class="fa-solid fa-trash-can" style="color: var(--danger)"></i>' : '<i class="fa-solid fa-check"></i>'}
                </div>
                 <i class="fa-solid fa-trash-can" style="color: var(--danger); margin-left: 10px; cursor: pointer;" onclick="window.permanentlyDeleteItem('todos', '${t.id}')"></i>
            </div>
          `).reverse().join('');
    }

    return `
        <div style="margin-bottom: 24px;">
            <h3 style="font-size: 14px; font-weight: 700; color: var(--text-muted); padding-left: 10px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">${monthName} ${year}</h3>
            <div class="list-container" style="padding: 0;">
                ${listHtml}
            </div>
        </div>
      `;
  }).join('');

  container.innerHTML = `
      ${headerHtml}
    <div class="list-container">
      ${contentHtml || '<p style="text-align:center; padding: 40px; color: var(--text-secondary)">কোনো মুছে ফেলা তথ্য নেই</p>'}
    </div>
    `;
}

window.setReportFilter = (filter) => {
  state.reportFilter = filter;
  render();
};

window.clearAllReportData = async (category) => {
  window.showConfirm('সব মুছুন', 'আপনি কি নিশ্চিতভাবে আর্কাইভ থেকে সব তথ্য মুছে ফেলতে চান? এটি পুনরুদ্ধার করা যাবে না।', async () => {
    if (category === 'todos') {
      // Keep active ones (not deleted AND not completed)
      state.todos = state.todos.filter(t => !t.deleted && !t.completed);
    } else {
      // Keep active ones (not deleted)
      state[category] = state[category].filter(item => !item.deleted);
    }

    render();
    window.showToast('আর্কাইভ খালি করা হয়েছে', 'success');
    await persistData();
  });
};

window.showConfirm = (title, message, onConfirm) => {
  const modalContainer = document.getElementById('modal-container');
  modalContainer.innerHTML = `
        <div class="modal-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 3000; display: flex; align-items: center; justify-content: center;">
            <div class="modal-card glass" style="background: white; padding: 24px; border-radius: 20px; width: 90%; max-width: 320px;">
                <h3 style="margin-bottom: 12px; color: var(--text-main); font-size: 18px;">${title}</h3>
                <p style="color: var(--text-muted); margin-bottom: 24px; font-size: 14px;">${message}</p>
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="modal-cancel-btn" style="padding: 8px 16px; border-radius: 10px; border: none; background: #e5e7eb; color: var(--text-secondary); font-weight: 600; cursor: pointer;">না</button>
                    <button id="modal-confirm-btn" style="padding: 8px 16px; border-radius: 10px; border: none; background: var(--danger); color: white; font-weight: 600; cursor: pointer;">হ্যাঁ, নিশ্চিত</button>
                </div>
            </div>
        </div>
    `;
  modalContainer.classList.add('active');

  const close = () => {
    modalContainer.classList.remove('active');
    setTimeout(() => { modalContainer.innerHTML = ''; }, 200);
  };

  document.getElementById('modal-cancel-btn').onclick = close;

  document.getElementById('modal-confirm-btn').onclick = () => {
    onConfirm();
    close();
  };
};

// showPromptModal removed

window.showAlertModal = (title, message) => {
  const modalContainer = document.getElementById('modal-container');
  modalContainer.innerHTML = `
        <div class="modal-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 3000; display: flex; align-items: center; justify-content: center;">
            <div class="modal-card glass" style="background: white; padding: 24px; border-radius: 20px; width: 90%; max-width: 320px;">
                <h3 style="margin-bottom: 12px; color: var(--text-main); font-size: 18px;">${title}</h3>
                <p style="color: var(--text-muted); margin-bottom: 20px; font-size: 14px; line-height: 1.5;">${message.replace(/\n/g, '<br>')}</p>
                <div style="display: flex; justify-content: flex-end;">
                    <button id="modal-ok-btn" style="padding: 8px 16px; border-radius: 10px; border: none; background: var(--primary); color: white; font-weight: 600; cursor: pointer;">বুঝেছি</button>
                </div>
            </div>
        </div>
    `;
  modalContainer.classList.add('active');

  document.getElementById('modal-ok-btn').onclick = () => {
    modalContainer.classList.remove('active');
    setTimeout(() => { modalContainer.innerHTML = ''; }, 200);
  };
};

window.showPromptModal = (title, placeholder, onConfirm, defaultValue = '') => {
  const modalContainer = document.getElementById('modal-container');
  modalContainer.innerHTML = `
        <div class="modal-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 3000; display: flex; align-items: center; justify-content: center;">
            <div class="modal-card glass" style="background: white; padding: 24px; border-radius: 20px; width: 90%; max-width: 320px;">
                <h3 style="margin-bottom: 12px; color: var(--text-main); font-size: 18px;">${title}</h3>
                <input type="email" id="prompt-input" class="input-field" placeholder="${placeholder}" value="${defaultValue}" style="margin-bottom: 20px;">
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="prompt-cancel-btn" style="padding: 8px 16px; border-radius: 10px; border: none; background: #e5e7eb; color: var(--text-secondary); font-weight: 600; cursor: pointer;">বাতিল</button>
                    <button id="prompt-confirm-btn" style="padding: 8px 16px; border-radius: 10px; border: none; background: var(--primary); color: white; font-weight: 600; cursor: pointer;">পাঠান</button>
                </div>
            </div>
        </div>
    `;
  modalContainer.classList.add('active');

  const input = document.getElementById('prompt-input');
  setTimeout(() => input.focus(), 50);

  const close = () => {
    modalContainer.classList.remove('active');
    setTimeout(() => { modalContainer.innerHTML = ''; }, 200);
  };

  document.getElementById('prompt-cancel-btn').onclick = close;

  const handleConfirm = () => {
    const val = input.value.trim();
    if (val) {
      onConfirm(val);
      close();
    } else {
      window.showToast('কিছু লিখুন', 'warning');
    }
  };

  document.getElementById('prompt-confirm-btn').onclick = handleConfirm;
  input.onkeypress = (e) => {
    if (e.key === 'Enter') handleConfirm();
  };
};

window.handleForgotPassword = () => {
  const emailInput = document.getElementById('auth-email');
  const email = emailInput ? emailInput.value : '';

  window.showPromptModal('পাসওয়ার্ড রিসেট', 'আপনার ইমেইল দিন...', async (val) => {
    try {
      await sendPasswordResetEmail(auth, val);
      window.showAlertModal('ইমেইল পাঠানো হয়েছে', `আপনার ইমেইলে (${val}) পাসওয়ার্ড রিসেট লিংক পাঠানো হয়েছে। স্প্যাম ফোল্ডার চেক করুন।`);
    } catch (error) {
      console.error(error);
      if (error.code === 'auth/user-not-found') {
        window.showToast('এই ইমেইল দিয়ে কোনো একাউন্ট নেই', 'error');
      } else if (error.code === 'auth/invalid-email') {
        window.showToast('ইমেইল টি সঠিক নয়', 'error');
      } else {
        window.showToast('ব্যর্থ হয়েছে: ' + error.code, 'error');
      }
    }
  }, email);
};

function renderLoginView(container) {
  const isRegister = window.location.hash === '#register';
  container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; padding: 20px;">
        <div style="background: rgba(255, 255, 255, 0.95); padding: 30px; border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); width: 100%; max-width: 350px; text-align: center;">
            <img src="logo.png" style="width: 80px; height: 80px; margin-bottom: 20px; border-radius: 20px;">
            <h2 style="margin-bottom: 10px; color: var(--text-main); font-weight: 800;">স্বাগতম</h2>
            <p style="color: var(--text-muted); margin-bottom: 30px; font-size: 14px;">আপনার ব্যক্তিগত হিসাব রক্ষণাবেক্ষণ করতে ${isRegister ? 'রেজিস্ট্রেশন' : 'লগইন'} করুন</p>

            <button onclick="window.handleGoogleLogin()" style="width: 100%; padding: 12px; border: 1px solid #e5e7eb; background: white; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 10px; font-weight: 600; color: var(--text-main); margin-bottom: 20px; cursor: pointer; transition: all 0.2s;">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" style="width: 20px;">
                গুগল দিয়ে লগইন করুন
            </button>

            <div style="position: relative; margin: 20px 0;">
                <hr style="border: 0; border-top: 1px solid #e5e7eb;">
                <span style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: white; padding: 0 10px; color: var(--text-muted); font-size: 12px;">অথবা ইমেইল দিয়ে</span>
            </div>

            ${isRegister ? `
            <div style="margin-bottom: 15px; text-align: left;">
                <label style="font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 5px; display: block;">আপনার নাম</label>
                <input type="text" id="auth-name" placeholder="পুরো নাম লিখুন" style="width: 100%; padding: 12px; border: 1px solid #e5e7eb; border-radius: 12px; font-size: 14px;">
            </div>
            ` : ''}

            <div style="margin-bottom: 15px; text-align: left;">
                <label style="font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 5px; display: block;">ইমেইল</label>
                <input type="email" id="auth-email" placeholder="example@email.com" style="width: 100%; padding: 12px; border: 1px solid #e5e7eb; border-radius: 12px; font-size: 14px;">
            </div>

            <div style="margin-bottom: 15px; text-align: left;">
                <label style="font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 5px; display: block;">পাসওয়ার্ড</label>
                <input type="password" id="auth-password" placeholder="গোপন পাসওয়ার্ড দিন" style="width: 100%; padding: 12px; border: 1px solid #e5e7eb; border-radius: 12px; font-size: 14px;">
            </div>

            ${!isRegister ? `
            <div style="text-align: right; margin-bottom: 20px;">
                <span onclick="window.handleForgotPassword()" style="font-size: 13px; color: var(--primary); font-weight: 600; cursor: pointer;">পাসওয়ার্ড ভুলে গেছেন?</span>
            </div>
            ` : ''}

            <button id="auth-action-btn" onclick="${isRegister ? 'window.handleRegister()' : 'window.handleLogin()'}" style="width: 100%; padding: 12px; background: var(--primary); color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer; margin-bottom: 15px; transition: opacity 0.2s;">
                ${isRegister ? 'রেজিস্ট্রেশন করুন' : 'লগইন করুন'}
            </button>

            <div style="font-size: 13px; color: var(--text-muted);">
                ${isRegister ? 'একাউন্ট আছে?' : 'এখনও একাউন্ট নেই?'} 
                <span onclick="window.toggleAuthMode('${isRegister ? 'login' : 'register'}')" style="color: var(--primary); font-weight: 600; cursor: pointer; ml-1;">
                    ${isRegister ? 'লগইন করুন' : 'রেজিস্ট্রেশন করুন'}
                </span>
            </div>
        </div>
    </div>
  `;
}

// Auth Handlers
window.toggleAuthMode = (mode) => {
  window.location.hash = mode === 'register' ? '#register' : '';
  render();
};

window.handleGoogleLogin = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    window.showToast(`স্বাগতম, ${user.displayName || 'User'}!`);
  } catch (error) {
    console.error("Google Login Error:", error);
    if (error.code === 'auth/popup-blocked') {
      window.showAlertModal('পপ-আপ ব্লক হয়েছে', 'আপনার ব্রাউজার পপ-আপ ব্লক করেছে। দয়া করে এড্রেস বারের ডানদিকে পপ-আপ আইকনে ক্লিক করে "Allow Popups" বা "Always allow" সিলেক্ট করুন এবং আবার চেষ্টা করুন।');
    } else if (error.code === 'auth/unauthorized-domain') {
      const domain = window.location.hostname;
      window.showAlertModal('নিরাপত্তা ত্রুটি', `আপনার এই ডোমেইনটি (${domain}) ফায়ারবেস কনসোলে অনুমোদিত নয়।\n\nFirebase Console -> Authentication -> Settings -> Authorized Domains এ গিয়ে "${domain}" যোগ করুন।`);
    } else if (error.code === 'auth/popup-closed-by-user') {
      window.showToast('লগইন বাতিল করা হয়েছে', 'warning');
    } else {
      window.showToast(`লগইন ব্যর্থ: ${error.code || error.message}`, 'error');
    }
  }
};

window.handleLogin = async () => {
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const btn = document.getElementById('auth-action-btn');

  if (!email || !password) {
    window.showToast('ইমেইল এবং পাসওয়ার্ড দিন', 'error');
    return;
  }

  // Email Validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    window.showToast('সঠিক ইমেইল ঠিকানা দিন', 'warning');
    return;
  }

  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> অপেক্ষা করুন...';
  btn.style.opacity = '0.7';

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    window.showToast(`স্বাগতম ফিরে এসেছেন, ${userCredential.user.displayName || 'User'}!`);
  } catch (error) {
    console.error(error);
    if (error.code === 'auth/invalid-login-credentials' || error.code === 'auth/invalid-credential') {
      window.showToast('ভুল ইমেইল বা পাসওয়ার্ড', 'error');
    } else if (error.code === 'auth/invalid-email') {
      window.showToast('লগইন ব্যর্থ হয়েছে: ইমেইল টি সঠিক নয়', 'error');
    } else {
      window.showToast('লগইন ব্যর্থ হয়েছে: ' + error.code, 'error');
    }
    btn.disabled = false;
    btn.innerHTML = originalText;
    btn.style.opacity = '1';
  }
};

window.handleRegister = async () => {
  const name = document.getElementById('auth-name').value;
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const btn = document.getElementById('auth-action-btn');

  if (!name || !email || !password) {
    window.showToast('সব তথ্য সঠিক ভাবে পূরণ করুন', 'error');
    return;
  }

  // Email Validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    window.showToast('সঠিক ইমেইল ঠিকানা দিন', 'warning');
    return;
  }

  if (password.length < 6) {
    window.showToast('পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে', 'warning');
    return;
  }

  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> অপেক্ষা করুন...';
  btn.style.opacity = '0.7';

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, {
      displayName: name
    });
    window.showToast(`স্বাগতম, ${name}!`);
  } catch (error) {
    console.error(error);
    if (error.code === 'auth/email-already-in-use') {
      window.showToast('এই ইমেইল দিয়ে ইতিমধ্যে একাউন্ট খোলা আছে', 'warning');
    } else if (error.code === 'auth/invalid-email') {
      window.showToast('ইমেইল টি সঠিক নয়', 'error');
    } else {
      window.showToast('রেজিস্ট্রেশন ব্যর্থ হয়েছে: ' + error.code, 'error');
    }
    btn.disabled = false;
    btn.innerHTML = originalText;
    btn.style.opacity = '1';
  }
};

window.handleLogout = async () => {
  try {
    await signOut(auth);
    window.showToast('লগআউট সফল');
    window.location.hash = ''; // Clear hash on logout
    window.location.reload();
  } catch (error) {
    console.error(error);
  }
};

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
onAuthStateChanged(auth, async (user) => {
  state.currentUser = user;
  if (user) {
    render(); // Immediate render to show dashboard
    // Load user data in background
    loadFromFirebase(user.uid).then(() => {
      // Ensure all items have IDs immediately after loading
      ensureIds('expenses');
      ensureIds('loans');
      ensureIds('debts');
      ensureIds('todos');
      render();
      initDataSync(); // Start syncing only if logged in
    });
  } else {
    // No user is signed in
    state.currentUser = null;
    state.view = 'dashboard';
    render(); // Triggers renderLoginView
  }
});

// Safety fallback to ensure login screen appears if auth takes too long
setTimeout(() => {
  // If still showing loading spinner
  if (document.querySelector('.fa-circle-notch')) {
    console.warn("Auth timed out, forcing render");
    render();
  }
}, 5000);

// Dynamic Clock Update
setInterval(() => {
  if (state.view === 'dashboard') {
    render();
  }
}, 30000); // Check every 30 seconds

// History Awareness
const originalNavigate = window.navigate;

window.navigate = (view) => {
  // If we are already on this view, don't push state (unless it's different params, but here basic views)
  if (state.view !== view) {
    history.pushState({ view: view }, '', '#' + view);
  }
  originalNavigate(view);
  setTimeout(setupKeyboardListeners, 100);
};

// Handle Settings Module Navigation
const originalOpenSettings = window.openSettingsModule;
if (originalOpenSettings) {
  window.openSettingsModule = (module) => {
    history.pushState({ view: 'settings', subView: module }, '', '#settings/' + module);
    state.settingsSubView = module;
    render();
  };
}

window.onpopstate = (event) => {
  if (event.state) {
    if (event.state.view === 'settings' && event.state.subView) {
      state.settingsSubView = event.state.subView;
      state.view = 'settings';
      render();
    } else if (event.state.view) {
      state.view = event.state.view;
      render();
    }
  } else {
    // Initial State (usually dashboard)
    state.view = 'dashboard';
    render();
  }
};

window.toggleForm = (key) => {
  state[key] = !state[key];
  render();
};
