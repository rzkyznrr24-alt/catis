const storageKey = 'financeAppData';
const usernameEl = document.getElementById('username');
const passwordEl = document.getElementById('password');
const authSection = document.getElementById('auth-section');
const homeSection = document.getElementById('home-section');
const appSection = document.getElementById('app-section');
const homeUsername = document.getElementById('home-username');
const homeTotalIncome = document.getElementById('home-total-income');
const homeTotalExpense = document.getElementById('home-total-expense');
const homeStatus = document.getElementById('home-status');
const homeRecommendation = document.getElementById('home-recommendation');
const homeTransactionList = document.getElementById('home-transaction-list');
const welcomeTitle = document.getElementById('welcome-title');
const totalIncomeEl = document.getElementById('total-income');
const totalExpenseEl = document.getElementById('total-expense');
const totalIncomeGraph = document.getElementById('total-income-graph');
const totalExpenseGraph = document.getElementById('total-expense-graph');
const homeQuickStatus = document.getElementById('home-quick-status');
const incomeValueEl = document.getElementById('income-value');
const expenseValueEl = document.getElementById('expense-value');
const incomeBar = document.getElementById('income-bar');
const expenseBar = document.getElementById('expense-bar');
const evalTitle = document.getElementById('evaluation-title');
const recText = document.getElementById('recommendation-text');
const transactionTypeEl = document.getElementById('transaction-type');
const amountEl = document.getElementById('amount');
const noteEl = document.getElementById('note');
const monthFilterEl = document.getElementById('month-filter');
const graphMonthFilterEl = document.getElementById('graph-month-filter');
const searchInputEl = document.getElementById('search-transactions');
const calcPad = document.getElementById('calc-pad');
const navButtons = document.querySelectorAll('.nav-btn');

let lastDeletedTransaction = null;
let undoTimer = null;
const pages = document.querySelectorAll('.page');
const quickInputBtn = document.getElementById('quick-input-btn');
const quickReportBtn = document.getElementById('quick-report-btn');
const quickGraphBtn = document.getElementById('quick-graph-btn');

// Firebase remote sync settings (set true + valid config utk cross-device)
const firebaseEnabled = true; // set true setelah isi firebaseConfig
const firebaseConfig = {
    apiKey: "AIzaSyBI0LuwjSvqlbGg8KFwbsAq_YuC7NcQkjE",
    authDomain: "catis-db1c0.firebaseapp.com",
    projectId: "catis-db1c0",
    storageBucket: "catis-db1c0.firebasestorage.app",
    messagingSenderId: "196594645683",
    appId: "1:196594645683:web:087443c2c1ffedd7844ec6",
    measurementId: "G-NQKGL5D1V0"
};

let firebaseDB = null;
let firebaseAuth = null;

const calcOperators = ['/', '*', '-', '+'];
const calcButtons = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', 'C', '0', '.', '=', '+', 'DEL'];
calcButtons.forEach(value => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = value;
    btn.classList.add('calc-btn');
    if (value === 'C' || value === 'DEL') btn.classList.add('calc-action');
    else if (calcOperators.includes(value)) btn.classList.add('calc-operator');
    btn.addEventListener('click', () => handleCalc(value));
    calcPad.appendChild(btn);
});

function setCaret(position) {
    amountEl.focus();
    amountEl.setSelectionRange(position, position);
}

function getInputState() {
    return {
        current: amountEl.value || '0',
        start: amountEl.selectionStart ?? amountEl.value.length,
        end: amountEl.selectionEnd ?? amountEl.value.length
    };
}

function getNumberSegment(value, index) {
    const left = value.slice(0, index).split(/[-+*/]/).pop();
    return left || '';
}

function insertAtCursor(insertValue) {
    const { current, start, end } = getInputState();
    const source = current === '0' && insertValue !== '.' ? '' : current;
    const next = source.slice(0, start) + insertValue + source.slice(end);
    amountEl.value = next || '0';
    setCaret(start + insertValue.length);
}

function deleteAtCursor() {
    const { current, start, end } = getInputState();
    if (start !== end) {
        const next = current.slice(0, start) + current.slice(end);
        amountEl.value = next || '0';
        setCaret(start);
        return;
    }
    if (start <= 0) return;
    const next = current.slice(0, start - 1) + current.slice(start);
    amountEl.value = next || '0';
    setCaret(start - 1);
}

function deleteForward() {
    const { current, start, end } = getInputState();
    if (start !== end) {
        const next = current.slice(0, start) + current.slice(end);
        amountEl.value = next || '0';
        setCaret(start);
        return;
    }
    if (start >= current.length) return;
    const next = current.slice(0, start) + current.slice(start + 1);
    amountEl.value = next || '0';
    setCaret(start);
}

function sanitizeAmountInput() {
    const value = amountEl.value;
    const cursor = amountEl.selectionStart ?? value.length;
    const sanitized = value.replace(/[^0-9+\-*/.]/g, '') || '0';
    if (sanitized !== value) {
        const delta = value.length - sanitized.length;
        amountEl.value = sanitized;
        amountEl.setSelectionRange(Math.max(0, cursor - delta), Math.max(0, cursor - delta));
    }
}

async function initFirebase() {
    if (!firebaseEnabled || !window.firebase) return;
    try {
        firebase.initializeApp(firebaseConfig);
        firebaseAuth = firebase.auth();
        firebaseDB = firebase.firestore();
        console.info('Firebase inisialisasi berhasil.');
    } catch (error) {
        console.error('Firebase init gagal', error);
        firebaseDB = null;
        firebaseAuth = null;
    }
}

async function loadUserData(uid) {
    if (!firebaseEnabled || !firebaseDB) return;
    try {
        const doc = await firebaseDB.collection('users').doc(uid).get();
        if (doc.exists) {
            const userData = doc.data();
            // Simpan ke local untuk cache
            const data = getData();
            data.currentUser = uid;
            data.users[uid] = {
                transactions: userData.transactions || []
            };
            saveData(data);
        }
    } catch (error) {
        console.error('Load user data error:', error);
    }
}

async function saveUserDataToRemote(uid) {
    if (!firebaseEnabled || !firebaseDB) return;
    const data = getData();
    const user = data.users[uid];
    if (!user) return;
    try {
        await firebaseDB.collection('users').doc(uid).set({
            email: firebaseAuth.currentUser.email,
            transactions: user.transactions
        });
    } catch (error) {
        console.error('Save to remote error:', error);
    }
}

async function syncRemoteUser(uid) {
    if (!firebaseEnabled || !firebaseDB || !uid || !firebaseAuth.currentUser) return;
    const data = getData();
    const localUser = data.users[uid] || { email: firebaseAuth.currentUser.email, transactions: [] };

    try {
        const doc = await firebaseDB.collection('users').doc(uid).get();
        if (doc.exists) {
            const remoteUser = doc.data();
            const remoteTx = Array.isArray(remoteUser.transactions) ? remoteUser.transactions : [];
            const localTx = Array.isArray(localUser.transactions) ? localUser.transactions : [];

            // Prioritaskan remote jika lebih panjang, untuk mencegah overwrite data terbaru dari device lain
            const mergedTransactions = remoteTx.length >= localTx.length ? remoteTx : localTx;
            localUser.transactions = mergedTransactions;
            localUser.email = remoteUser.email || localUser.email;

            // Simpan kembali ke Firestore (mengupdate jika perlu) dan localStorage
            await firebaseDB.collection('users').doc(uid).set({
                email: localUser.email,
                transactions: mergedTransactions
            });

            data.users[uid] = localUser;
            data.currentUser = uid;
            saveData(data);
        } else {
            localUser.email = firebaseAuth.currentUser.email;
            await firebaseDB.collection('users').doc(uid).set({
                email: localUser.email,
                transactions: localUser.transactions
            });
            data.users[uid] = localUser;
            data.currentUser = uid;
            saveData(data);
        }
    } catch (error) {
        console.warn('Firebase sinkronisasi gagal:', error);
    }
}

async function pushUserDataToRemote(username) {
    if (!firebaseEnabled || !firebaseDB || !username) return;
    const data = getData();
    const user = data.users[username];
    if (!user) return;
    try {
        await firebaseDB.collection('users').doc(username).set(user);
    } catch (error) {
        console.warn('Firebase Push gagal', error);
    }
}

function getData() {
    try {
        return JSON.parse(localStorage.getItem(storageKey) || '{"users":{},"currentUser":null}');
    } catch (error) {
        return { users: {}, currentUser: null };
    }
}

function saveData(data) {
    localStorage.setItem(storageKey, JSON.stringify(data));
}

function hashText(text) {
    return btoa(text);
}

function showMessage(message) {
    alert(message);
}

function showUndoToast(message, undoCallback) {
    const toast = document.getElementById('undo-toast');
    if (!toast) return;
    toast.innerHTML = `${message} <button type="button" class="undo-action-btn">Undo</button>`;
    toast.classList.remove('hidden');

    const undoBtn = toast.querySelector('.undo-action-btn');
    undoBtn?.addEventListener('click', () => {
        undoCallback();
        clearUndoToast();
    });

    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = setTimeout(() => {
        clearUndoToast();
    }, 6000);
}

function clearUndoToast() {
    const toast = document.getElementById('undo-toast');
    if (!toast) return;
    toast.classList.add('hidden');
    toast.innerHTML = '';
    lastDeletedTransaction = null;
    if (undoTimer) {
        clearTimeout(undoTimer);
        undoTimer = null;
    }
}

function showSection(section) {
    authSection.classList.add('hidden');
    homeSection.classList.add('hidden');
    appSection.classList.add('hidden');
    section.classList.remove('hidden');
}

function getMonthKey(dateString) {
    if (!dateString) return null;
    const datePart = dateString.split(',')[0].trim();
    const parts = datePart.split('/');
    if (parts.length < 3) return null;
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, '0')}`;
}

function formatMonthLabel(monthKey) {
    const [year, month] = monthKey.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

function getFilteredTransactions(transactions, selectedMonth = 'all') {
    if (!transactions || !transactions.length) return [];
    const selected = selectedMonth || 'all';
    if (selected === 'all') return transactions;
    return transactions.filter(tx => getMonthKey(tx.date) === selected);
}

function populateMonthFilter(transactions, targetSelect = monthFilterEl) {
    if (!targetSelect) return;
    const monthKeys = [...new Set(transactions.map(tx => getMonthKey(tx.date)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
    const selected = targetSelect.value || 'all';
    targetSelect.innerHTML = ['<option value="all">Semua Bulan</option>', ...monthKeys.map(key => `<option value="${key}">${formatMonthLabel(key)}</option>`)].join('');
    if (monthKeys.includes(selected)) {
        targetSelect.value = selected;
    }
}

function setActiveNav(pageId) {
    navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.page === pageId));
}

function setPage(pageId) {
    pages.forEach(page => page.classList.add('hidden'));
    const page = document.getElementById(pageId);
    if (page) {
        page.classList.remove('hidden');
        setActiveNav(pageId);
        if (pageId === 'report-page') refreshReport();
        if (pageId === 'graph-page') refreshGraph();
    }
}

function openHome() {
    showSection(homeSection);
    updateWelcomeText();
    refreshHome();
}

function openDashboard(pageId = 'input-page') {
    showSection(appSection);
    setPage(pageId);
    updateWelcomeText();
}

function updateWelcomeText() {
    const data = getData();
    const uid = data.currentUser;
    const user = uid && data.users[uid] ? data.users[uid] : null;
    const displayName = (user && (user.email || user.name)) ? (user.email || user.name) : 'Pengguna';
    homeUsername.textContent = displayName;
    welcomeTitle.textContent = `Halo, ${displayName}`;
}

function handleCalc(value) {
    const { current, start, end } = getInputState();
    if (value === 'C') {
        amountEl.value = '0';
        setCaret(1);
        return;
    }
    if (value === 'DEL') {
        deleteAtCursor();
        return;
    }
    if (value === '=') {
        try {
            const expression = current.replace(/[^0-9.+\-*/]/g, '');
            if (!expression || /[+\-*/]$/.test(expression)) return;
            const result = new Function(`return ${expression}`)();
            const formatted = Number.isFinite(result) ? String(Number(result.toFixed(2)).toString().replace(/\.00$/, '')) : '0';
            amountEl.value = formatted;
            setCaret(formatted.length);
        } catch (error) {
            amountEl.value = '0';
            setCaret(1);
        }
        return;
    }
    if (calcOperators.includes(value)) {
        if (start === 0) return;
        const prev = current[start - 1];
        if (calcOperators.includes(prev)) {
            const next = current.slice(0, start - 1) + value + current.slice(end);
            amountEl.value = next;
            setCaret(start);
            return;
        }
        insertAtCursor(value);
        return;
    }
    if (value === '.') {
        const segment = getNumberSegment(current, start);
        if (segment.includes('.')) return;
    }
    insertAtCursor(value);
}

async function registerUser() {
    const email = usernameEl.value.trim();
    const password = passwordEl.value.trim();
    if (!email || !password) {
        showMessage('Silakan isi email dan password terlebih dahulu.');
        return;
    }
    if (!firebaseEnabled || !firebaseAuth) {
        showMessage('Firebase belum dikonfigurasi. Silakan cek settingan Anda.');
        return;
    }
    try {
        const userCredential = await firebaseAuth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        // Simpan data awal ke Firestore
        await firebaseDB.collection('users').doc(user.uid).set({
            email: email,
            transactions: []
        });
        // Simpan data lokal
        const data = getData();
        data.currentUser = user.uid;
        data.users[user.uid] = { email: email, transactions: [] };
        saveData(data);
        showMessage('Akun berhasil dibuat. Anda otomatis login.');
        openHome();
    } catch (error) {
        console.error('Register error:', error);
        showMessage('Registrasi gagal: ' + error.message);
    }
}

async function loginUser() {
    const email = usernameEl.value.trim();
    const password = passwordEl.value.trim();
    if (!email || !password) {
        showMessage('Silakan isi email dan password terlebih dahulu.');
        return;
    }
    if (!firebaseEnabled || !firebaseAuth) {
        showMessage('Firebase belum dikonfigurasi. Silakan cek setup Firebase di Project settings.');
        return;
    }
    try {
        await firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        const userCredential = await firebaseAuth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        await syncRemoteUser(user.uid);
        showMessage('Login berhasil. Data sedang dimuat.');
        openHome();
    } catch (error) {
        console.error('Login error:', error);
        if (error.code === 'auth/user-not-found') {
            showMessage('Email tidak terdaftar. Silakan daftar terlebih dahulu atau cek kembali email.');
        } else if (error.code === 'auth/wrong-password') {
            showMessage('Password salah. Silakan coba lagi.');
        } else {
            showMessage('Login gagal: ' + error.message);
        }
    }
}

async function logoutUser() {
    try {
        if (firebaseEnabled && firebaseAuth) {
            await firebaseAuth.signOut();
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
    // Reset local state
    amountEl.value = '0';
    noteEl.value = '';
    usernameEl.value = '';
    passwordEl.value = '';
    showSection(authSection);
}

async function saveTransaction() {
    if (!firebaseEnabled || !firebaseAuth || !firebaseAuth.currentUser) {
        showMessage('Silakan login terlebih dahulu.');
        return;
    }
    const uid = firebaseAuth.currentUser.uid;
    const amount = parseFloat(amountEl.value);
    if (isNaN(amount) || amount <= 0) {
        showMessage('Masukkan jumlah yang valid.');
        return;
    }
    const type = transactionTypeEl.value;
    const note = noteEl.value.trim();
    const date = new Date().toLocaleString('id-ID', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const notePendapatan = type === 'Pendapatan' ? note : '';
    const notePengeluaran = type === 'Pengeluaran' ? note : '';

    const data = getData();
    if (!data.users[uid]) {
        data.users[uid] = {
            email: firebaseAuth.currentUser.email,
            transactions: []
        };
    } else if (!data.users[uid].email) {
        data.users[uid].email = firebaseAuth.currentUser.email;
    }

    data.users[uid].transactions.unshift({ date, type, amount, note, notePendapatan, notePengeluaran, isFavorite: false });
    saveData(data);
    await saveUserDataToRemote(uid);
    amountEl.value = '0';
    noteEl.value = '';
    renderHomeSummary(data.users[uid].transactions);
    refreshReport();
    refreshGraph();
    showMessage('Transaksi berhasil disimpan.');
}

function formatCurrency(value) {
    return `Rp\u00A0${Number(value).toLocaleString('id-ID')}`;
}

function buildEvaluation(incomeTotal, expenseTotal) {
    if (incomeTotal > expenseTotal) {
        return { status: 'Sehat', recommendation: 'Keuangan Anda sehat. Pertahankan pengeluaran terkendali dan terus meningkatkan tabungan.' };
    }
    if (incomeTotal < expenseTotal) {
        return { status: 'Tidak Sehat', recommendation: 'Keuangan tidak sehat. Kurangi pengeluaran dan prioritaskan kebutuhan penting.' };
    }
    return { status: 'Seimbang', recommendation: 'Pendapatan dan pengeluaran seimbang. Pertimbangkan meningkatkan tabungan sedikit demi sedikit.' };
}

function renderHomeSummary(transactions) {
    const incomeTotal = transactions.filter(tx => tx.type === 'Pendapatan').reduce((sum, tx) => sum + tx.amount, 0);
    const expenseTotal = transactions.filter(tx => tx.type === 'Pengeluaran').reduce((sum, tx) => sum + tx.amount, 0);
    const evaluation = buildEvaluation(incomeTotal, expenseTotal);
    homeTotalIncome.textContent = formatCurrency(incomeTotal);
    homeTotalExpense.textContent = formatCurrency(expenseTotal);
    homeStatus.textContent = evaluation.status;
    homeRecommendation.textContent = evaluation.recommendation;
    homeQuickStatus.textContent = `Evaluasi: ${evaluation.status}`;
    const recent = transactions.slice(0, 3);
    if (!recent.length) {
        homeTransactionList.innerHTML = '<div class="transaction-card empty-state">Belum ada transaksi. Mulai catat sekarang.</div>';
        return;
    }
    homeTransactionList.innerHTML = recent.map((tx, index) => {
        const typeClass = tx.type === 'Pendapatan' ? 'pendapatan' : 'pengeluaran';
        const favoriteClass = tx.isFavorite ? 'favorite' : '';
        return `
        <div class="transaction-card ${typeClass} ${favoriteClass}" data-index="${index}">
            <div class="tx-info">
                <strong>${tx.type}</strong>
                <span>${tx.date}</span>
            </div>
            <div class="tx-amount-block">
                <strong>${formatCurrency(tx.amount)}</strong>
                <span class="tx-note">${tx.note || '-'}</span>
                <div class="btn-wrap">
                    <button type="button" class="favorite-transaction-btn" data-index="${index}" title="Tandai favorit">${tx.isFavorite ? '★' : '☆'}</button>
                    <button type="button" class="delete-transaction-btn" data-index="${index}" title="Hapus transaksi">Hapus</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

function deleteTransaction(index) {
    const data = getData();
    const username = data.currentUser;
    if (!username) return;
    const transactions = data.users[username]?.transactions;
    if (!Array.isArray(transactions) || index < 0 || index >= transactions.length) return;

    const removedTx = transactions.splice(index, 1)[0];
    lastDeletedTransaction = { username, transaction: removedTx, index };

    saveData(data);

    if (firebaseEnabled && firebaseAuth && firebaseAuth.currentUser) {
        saveUserDataToRemote(firebaseAuth.currentUser.uid).catch(err => console.warn('Gagal sync delete:', err));
    }

    refreshHome();
    refreshReport();
    refreshGraph();
    showUndoToast('Transaksi berhasil dihapus.', undoDelete);
}

function undoDelete() {
    if (!lastDeletedTransaction || !lastDeletedTransaction.transaction) {
        clearUndoToast();
        return;
    }

    const data = getData();
    const username = data.currentUser;
    if (!username || username !== lastDeletedTransaction.username) return;

    const transactions = data.users[username]?.transactions;
    if (!Array.isArray(transactions)) return;

    const insertIndex = Math.min(lastDeletedTransaction.index, transactions.length);
    transactions.splice(insertIndex, 0, lastDeletedTransaction.transaction);
    saveData(data);

    if (firebaseEnabled && firebaseAuth && firebaseAuth.currentUser) {
        saveUserDataToRemote(firebaseAuth.currentUser.uid).catch(err => console.warn('Gagal sync undo delete:', err));
    }

    refreshHome();
    refreshReport();
    refreshGraph();
    showMessage('Penghapusan dibatalkan, transaksi dikembalikan.');
    clearUndoToast();
}

function toggleFavorite(index) {
    const data = getData();
    const username = data.currentUser;
    if (!username) return;
    const transactions = data.users[username]?.transactions;
    if (!Array.isArray(transactions) || index < 0 || index >= transactions.length) return;

    transactions[index].isFavorite = !transactions[index].isFavorite;
    saveData(data);

    if (firebaseEnabled && firebaseAuth && firebaseAuth.currentUser) {
        saveUserDataToRemote(firebaseAuth.currentUser.uid).catch(err => console.warn('Gagal sync favorite:', err));
    }

    refreshHome();
    refreshReport();
    refreshGraph();
}

function refreshHome() {
    const data = getData();
    const username = data.currentUser;
    if (!username) return;
    renderHomeSummary(data.users[username].transactions);
}

function refreshReport() {
    const data = getData();
    const username = data.currentUser;
    if (!username) return;
    const transactions = data.users[username].transactions || [];
    populateMonthFilter(transactions, monthFilterEl);
    populateMonthFilter(transactions, graphMonthFilterEl);

    const monthValue = monthFilterEl?.value || 'all';
    const searchValue = (searchInputEl?.value || '').trim().toLowerCase();

    const filteredTransactions = transactions
        .map((tx, idx) => ({ tx, idx }))
        .filter(({ tx }) => {
            const inMonth = monthValue === 'all' || getMonthKey(tx.date) === monthValue;
            if (!inMonth) return false;
            if (!searchValue) return true;

            const dateText = tx.date.toLowerCase();
            const typeText = tx.type.toLowerCase();
            return dateText.includes(searchValue) || typeText.includes(searchValue);
        });

    const reportBody = document.querySelector('#report-table tbody');
    reportBody.innerHTML = '';

    if (!filteredTransactions.length) {
        reportBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color: var(--muted);">Tidak ada transaksi untuk bulan terpilih.</td></tr>';
        updateGraphs([]);
        return;
    }

    filteredTransactions.forEach(({ tx, idx }) => {
        const row = document.createElement('tr');
        const rowClass = `${tx.type === 'Pendapatan' ? 'pendapatan-row' : 'pengeluaran-row'} ${tx.isFavorite ? 'favorite' : ''}`;
        row.className = rowClass;
        row.innerHTML = `
            <td data-label="Tanggal">${escapeHtml(tx.date)}</td>
            <td data-label="Jenis">${escapeHtml(tx.type)}</td>
            <td data-label="Jumlah">${formatCurrency(tx.amount)}</td>
            <td data-label="Catatan">${escapeHtml(tx.note || '-')}</td>
            <td data-label="Aksi">
                <button type="button" class="favorite-transaction-btn" data-index="${idx}" title="Tandai favorit">${tx.isFavorite ? '★' : '☆'}</button>
                <button type="button" class="delete-transaction-btn" data-index="${idx}" title="Hapus transaksi">Hapus</button>
            </td>
        `;
        reportBody.appendChild(row);
    });

    updateGraphs(filteredTransactions.map(item => item.tx));
}

function updateGraphs(transactions) {
    const incomeTotal = transactions.filter(tx => tx.type === 'Pendapatan').reduce((sum, tx) => sum + tx.amount, 0);
    const expenseTotal = transactions.filter(tx => tx.type === 'Pengeluaran').reduce((sum, tx) => sum + tx.amount, 0);
    const evaluation = buildEvaluation(incomeTotal, expenseTotal);
    totalIncomeEl.textContent = formatCurrency(incomeTotal);
    totalExpenseEl.textContent = formatCurrency(expenseTotal);
    totalIncomeGraph.textContent = formatCurrency(incomeTotal);
    totalExpenseGraph.textContent = formatCurrency(expenseTotal);
    evalTitle.textContent = `Evaluasi: ${evaluation.status}`;
    recText.textContent = evaluation.recommendation;
    incomeValueEl.textContent = formatCurrency(incomeTotal);
    expenseValueEl.textContent = formatCurrency(expenseTotal);
    const maxTotal = Math.max(incomeTotal, expenseTotal, 1);
    const incomeHeight = incomeTotal === 0 ? 10 : Math.max(Math.round((incomeTotal / maxTotal) * 100), 18);
    const expenseHeight = expenseTotal === 0 ? 10 : Math.max(Math.round((expenseTotal / maxTotal) * 100), 18);
    incomeBar.style.height = `${incomeHeight}%`;
    expenseBar.style.height = `${expenseHeight}%`;
}

function refreshGraph() {
    const data = getData();
    const username = data.currentUser;
    if (!username) return;
    const transactions = data.users[username].transactions;
    populateMonthFilter(transactions, graphMonthFilterEl);
    const selectedMonth = graphMonthFilterEl ? graphMonthFilterEl.value : 'all';
    const filtered = getFilteredTransactions(transactions, selectedMonth);
    updateGraphs(filtered);
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildExcelWorkbook(transactions) {
    const summaryByDate = {};
    transactions.forEach(tx => {
        const dateOnly = tx.date.split(',')[0].trim();
        if (!summaryByDate[dateOnly]) summaryByDate[dateOnly] = { pendapatan: 0, pengeluaran: 0, notesPendapatan: [], notesPengeluaran: [] };
        if (tx.type === 'Pendapatan') {
            summaryByDate[dateOnly].pendapatan += tx.amount;
            if (tx.notePendapatan) summaryByDate[dateOnly].notesPendapatan.push(tx.notePendapatan);
        }
        if (tx.type === 'Pengeluaran') {
            summaryByDate[dateOnly].pengeluaran += tx.amount;
            if (tx.notePengeluaran) summaryByDate[dateOnly].notesPengeluaran.push(tx.notePengeluaran);
        }
    });

    const rows = Object.entries(summaryByDate)
        .sort((a, b) => new Date(a[0].split('/').reverse().join('-')) - new Date(b[0].split('/').reverse().join('-')))
        .map(([dateOnly, data]) => {
            const jumlah = data.pendapatan - data.pengeluaran;
            const noteIncome = data.notesPendapatan.length ? data.notesPendapatan.join(' | ') : '-';
            const noteExpense = data.notesPengeluaran.length ? data.notesPengeluaran.join(' | ') : '-';
            return `
                <tr>
                    <td style="mso-number-format:'@';">${escapeHtml(dateOnly)}</td>
                    <td style="mso-number-format:'#,##0';">${data.pendapatan}</td>
                    <td style="mso-number-format:'#,##0';">${data.pengeluaran}</td>
                    <td style="mso-number-format:'#,##0';">${jumlah}</td>
                    <td>${escapeHtml(noteIncome)}</td>
                    <td>${escapeHtml(noteExpense)}</td>
                </tr>`;
        }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
        <html xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="UTF-8"/></head>
            <body>
                <table border="1" cellspacing="0" cellpadding="4">
                    <tr style="background:#f4f6fb; font-weight:bold;">
                        <th>Tanggal</th>
                        <th>Pendapatan</th>
                        <th>Pengeluaran</th>
                        <th>Jumlah</th>
                        <th>Catatan Pendapatan</th>
                        <th>Catatan Pengeluaran</th>
                    </tr>
                    ${rows}
                </table>
            </body>
        </html>`;
}

function exportCsv() {
    const data = getData();
    const username = data.currentUser;
    if (!username) {
        showMessage('Silakan login terlebih dahulu.');
        return;
    }
    const filtered = getFilteredTransactions(data.users[username].transactions, monthFilterEl?.value || 'all');
    if (!filtered.length) {
        showMessage('Tidak ada transaksi untuk bulan ini.');
        return;
    }

    const header = ['Tanggal','Pendapatan','Pengeluaran','Jumlah','Catatan Pendapatan','Catatan Pengeluaran'];
    const summaryByDate = {};
    filtered.forEach(tx => {
        const dateOnly = tx.date.split(',')[0].trim();
        if (!summaryByDate[dateOnly]) summaryByDate[dateOnly] = { pendapatan: 0, pengeluaran: 0, notesPendapatan: [], notesPengeluaran: [] };
        if (tx.type === 'Pendapatan') {
            summaryByDate[dateOnly].pendapatan += tx.amount;
            if (tx.notePendapatan) summaryByDate[dateOnly].notesPendapatan.push(tx.notePendapatan);
        }
        if (tx.type === 'Pengeluaran') {
            summaryByDate[dateOnly].pengeluaran += tx.amount;
            if (tx.notePengeluaran) summaryByDate[dateOnly].notesPengeluaran.push(tx.notePengeluaran);
        }
    });
    const rows = Object.entries(summaryByDate).sort((a, b) => new Date(a[0].split('/').reverse().join('-')) - new Date(b[0].split('/').reverse().join('-'))).map(([dateOnly, data]) => {
        const jumlah = data.pendapatan - data.pengeluaran;
        const noteIncome = data.notesPendapatan.length ? data.notesPendapatan.join(' | ') : '-';
        const noteExpense = data.notesPengeluaran.length ? data.notesPengeluaran.join(' | ') : '-';
        const dateText = `'${dateOnly}`; // paksa sebagai teks di Excel
        return `"${dateText}";${data.pendapatan};${data.pengeluaran};${jumlah};"${noteIncome.replace(/"/g, '""')}";"${noteExpense.replace(/"/g, '""')}"`;
    }).join('\n');

    const csvContent = '\uFEFF' + header.join(';') + '\n' + rows;
    const monthSuffix = monthFilterEl && monthFilterEl.value !== 'all' ? `_${monthFilterEl.value}` : '';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `laporan_keuangan_${username}${monthSuffix}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function initNavigation() {
    navButtons.forEach(button => {
        button.type = 'button';
        button.addEventListener('click', () => {
            const pageId = button.dataset.page;
            if (pageId === 'home-section') {
                openHome();
            } else {
                openDashboard(pageId);
            }
        });
    });
    if (quickInputBtn) quickInputBtn.addEventListener('click', () => openDashboard('input-page'));
    if (quickReportBtn) quickReportBtn.addEventListener('click', () => openDashboard('report-page'));
    if (quickGraphBtn) quickGraphBtn.addEventListener('click', () => openDashboard('graph-page'));
}

function init() {
    initFirebase();
    if (firebaseEnabled && firebaseAuth) {
        firebaseAuth.onAuthStateChanged(async (user) => {
            if (user) {
                await syncRemoteUser(user.uid);
                openHome();
            } else {
                showSection(authSection);
            }
        });
    } else {
        const data = getData();
        if (data.currentUser) {
            openHome();
        } else {
            showSection(authSection);
        }
    }
    document.getElementById('login-btn').addEventListener('click', loginUser);
    document.getElementById('register-btn').addEventListener('click', registerUser);
    document.getElementById('logout-btn').addEventListener('click', logoutUser);
    document.getElementById('save-btn').addEventListener('click', saveTransaction);
    document.getElementById('refresh-report-btn').addEventListener('click', refreshReport);
    document.getElementById('export-csv-btn').addEventListener('click', exportCsv);
    amountEl.addEventListener('input', sanitizeAmountInput);
    amountEl.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleCalc('=');
            return;
        }
        if (event.key === 'Backspace') {
            event.preventDefault();
            deleteAtCursor();
            return;
        }
        if (event.key === 'Delete') {
            event.preventDefault();
            deleteForward();
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            amountEl.value = '0';
            setCaret(1);
            return;
        }
    });
    if (monthFilterEl) monthFilterEl.addEventListener('change', () => { refreshReport(); refreshGraph(); });
    if (graphMonthFilterEl) graphMonthFilterEl.addEventListener('change', refreshGraph);
    if (searchInputEl) searchInputEl.addEventListener('input', () => refreshReport());

    if (homeTransactionList) {
        homeTransactionList.addEventListener('click', (event) => {
            const deleteBtn = event.target.closest('.delete-transaction-btn');
            const favoriteBtn = event.target.closest('.favorite-transaction-btn');
            if (favoriteBtn) {
                const idx = Number(favoriteBtn.dataset.index);
                if (Number.isFinite(idx)) toggleFavorite(idx);
                return;
            }
            if (deleteBtn) {
                const idx = Number(deleteBtn.dataset.index);
                if (Number.isFinite(idx)) deleteTransaction(idx);
            }
        });
    }

    const reportTbody = document.querySelector('#report-table tbody');
    if (reportTbody) {
        reportTbody.addEventListener('click', (event) => {
            const deleteBtn = event.target.closest('.delete-transaction-btn');
            const favoriteBtn = event.target.closest('.favorite-transaction-btn');
            if (favoriteBtn) {
                const idx = Number(favoriteBtn.dataset.index);
                if (Number.isFinite(idx)) toggleFavorite(idx);
                return;
            }
            if (deleteBtn) {
                const idx = Number(deleteBtn.dataset.index);
                if (Number.isFinite(idx)) deleteTransaction(idx);
            }
        });
    }

    initNavigation();
}

init();