const express = require('express');
const session = require('cookie-session'); // استخدام الكوكيز المشفرة المتوافقة مع Vercel
const { google } = require('googleapis');
const XLSX = require('xlsx');
const path = require('path');

const app = express();

// --- 1. تفعيل الثقة في الشبكة الوسيطة لـ Vercel ---
// هذا السطر يحل مشكلة توجيه الدخول وإرسال الكوكيز الآمنة عبر HTTPS
app.set('trust proxy', 1); 

// --- 2. الإعدادات الأساسية ---
app.use(express.static(path.join(__dirname))); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 3. إعدادات الجلسة الآمنة ---
app.use(session({
    name: 'cetc_session',
    keys: [process.env.SESSION_SECRET || 'cetc-ejust-fallback-secure-key'],
    maxAge: 24 * 60 * 60 * 1000, // 24 ساعة
    secure: process.env.NODE_ENV === 'production', // true فقط عند الرفع الفعلي لضمان عمل الجلسة محلياً بلا مشاكل
    httpOnly: true,
    sameSite: 'lax'
}));

// إعدادات الوصول لجوجل درايف
const privateKey = process.env.GOOGLE_PRIVATE_KEY 
    ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') 
    : undefined;

const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: privateKey,
        project_id: process.env.GOOGLE_PROJECT_ID,
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

const fileIds = {
    "1": "19sOJ3ihc-edrZ9B0bYsVfv_loQbO0uhW",
    "2": "19z4P-fDzzCIFOIeL9197YhQyr2vXPSgv",
    "3": "1L_XTHyXNy-7YtC6ZQZ3GHYriLGFMvAfx",
    "4": "1knkwfR7QmAFoHzyC3xg--ucJRuj33x8K",
    "5": "19z4P-fDzzCIFOIeL9197YhQyr2vXPSgv",
    "2024": "1XBzfNn6LkHiRNF8s7NQeICn4D4mShyDm",
    "2025": "1ypVYF_Y6L-taMfkHSYly8nONIqEbj46V",
    "2026": "1wGGOGxcrakcSiPZMim_uJKI2RUOLxFm_",
    "reports": "1366JN3rpYyrdt8Jq27jrlr6eoymtpf3S"
};

// ميدل وير لحماية المسارات
function checkAuth(req, res, next) {
    if (req.session && req.session.loggedIn) return next();
    res.redirect('/login');
}

async function getExcelBuffer(fileId) {
    const fileMeta = await drive.files.get({ fileId, fields: 'mimeType' });
    const mimeType = fileMeta.data.mimeType;
    let response;
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
        response = await drive.files.export({ 
            fileId, 
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        }, { responseType: 'arraybuffer' });
    } else {
        response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    }
    return response.data;
}

// --- المسارات ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/introducing', (req, res) => res.sendFile(path.join(__dirname, 'introducing.html')));
app.get('/portfolio', (req, res) => res.sendFile(path.join(__dirname, 'portfolio.html')));
app.get('/partners', (req, res) => res.sendFile(path.join(__dirname, 'partners.html')));
app.get('/login', (req, res) => {
    if (req.session && req.session.loggedIn) return res.redirect('/Dashboard');
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS && process.env.ADMIN_USER) {
        req.session.loggedIn = true; // حفظ الجلسة مشفرة في الكوكيز للمتصفح
        res.json({ success: true, redirect: '/Dashboard' });
    } else {
        res.json({ success: false, error: 'بيانات الدخول غير صحيحة' });
    }
});

app.get('/Dashboard', checkAuth, (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/logout', (req, res) => { 
    req.session = null; // تدمير كوكيز الجلسة
    res.redirect('/'); 
});

// جلب البيانات (فواتير وإيرادات)
app.get('/get-data/:id', checkAuth, async (req, res) => {
    try {
        const id = req.params.id;
        const fileId = fileIds[id];
        const buffer = await getExcelBuffer(fileId);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const isIncomeFile = ["2024", "2025", "2026"].includes(id);
        
        let sheetName = "فواتير الشركات";
        if (isIncomeFile) {
            const sheetLower = workbook.SheetNames.map(s => s.toLowerCase());
            const incomeIndex = sheetLower.indexOf("table of income");
            sheetName = incomeIndex !== -1 ? workbook.SheetNames[incomeIndex] : workbook.SheetNames[0];
        }

        const sheet = workbook.Sheets[sheetName];
        const fullData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

        if (isIncomeFile) {
            return res.json(fullData.map(row => row ? row.slice(0, 3) : []));
        }

        const endCol = (id === "1" || id === "5") ? 7 : 6;
        res.json(fullData.map(row => row ? row.slice(1, endCol) : []));
    } catch (error) { 
        res.status(500).json({ error: error.message }); 
    }
});

app.get('/get-report-sheets', checkAuth, async (req, res) => {
    try {
        const buffer = await getExcelBuffer(fileIds["reports"]);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        res.json({ sheets: workbook.SheetNames });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/get-report-data', checkAuth, async (req, res) => {
    try {
        const buffer = await getExcelBuffer(fileIds["reports"]);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[req.query.sheet];
        const fullData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
        res.json(fullData);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
module.exports = app;
