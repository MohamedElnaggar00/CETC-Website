const express = require('express');
const session = require('express-session');
const { google } = require('googleapis');
const XLSX = require('xlsx');
const path = require('path');

const app = express();

// --- 1. الإعدادات الأساسية ---
app.use(express.static(path.join(process.cwd()))); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'cetc-ejust-secure-session',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// --- 2. إعدادات الوصول لجوجل درايف (Environment Variables) ---
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
    if (req.session.loggedIn) return next();
    res.redirect('/login');
}

// دالة ذكية مساعدة لتحميل ملف الإكسيل كبفر تلقائي بغض النظر عن نوعه على الدرايف
async function getExcelBuffer(fileId) {
    const fileMeta = await drive.files.get({
        fileId: fileId,
        fields: 'mimeType'
    });
    const mimeType = fileMeta.data.mimeType;

    let response;
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
        response = await drive.files.export(
            {
                fileId: fileId,
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            },
            { responseType: 'arraybuffer' }
        );
    } else {
        response = await drive.files.get(
            { fileId: fileId, alt: 'media' },
            { responseType: 'arraybuffer' }
        );
    }
    return response.data;
}

// --- 3. المسارات (Routes) ---

app.get('/', (req, res) => res.sendFile(path.join(process.cwd(), 'index.html')));

app.get('/login', (req, res) => {
    if (req.session.loggedIn) return res.redirect('/Dashboard');
    res.sendFile(path.join(process.cwd(), 'login.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const isValidUser = (username === process.env.ADMIN_USER);
    const isValidPass = (password === process.env.ADMIN_PASS);

    if (isValidUser && isValidPass && process.env.ADMIN_USER && process.env.ADMIN_PASS) {
        req.session.loggedIn = true;
        res.json({ success: true, redirect: '/Dashboard' });
    } else {
        res.json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
    }
});

app.get('/Dashboard', checkAuth, (req, res) => res.sendFile(path.join(process.cwd(), 'dashboard.html')));

app.get('/logout', (req, res) => { 
    req.session.destroy(); 
    res.redirect('/'); 
});

// روابط الصفحات الفرعية
app.get('/introducing', (req, res) => res.sendFile(path.join(process.cwd(), 'introducing.html')));
app.get('/portfolio', (req, res) => res.sendFile(path.join(process.cwd(), 'portfolio.html')));
app.get('/partners', (req, res) => res.sendFile(path.join(process.cwd(), 'partners.html')));

// جلب البيانات ذكياً (فواتير وإيرادات)
app.get('/get-data/:id', checkAuth, async (req, res) => {
    try {
        const id = req.params.id;
        const fileId = fileIds[id];
        
        if (!fileId) {
            return res.status(404).json({ error: "معرف الملف غير مسجل في النظام" });
        }

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
        if (!sheet) return res.status(404).json({ error: `التبويبة المطلوبة غير موجودة بالملف` });
        
        const fullData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

        if (isIncomeFile) {
            return res.json(fullData.map(row => row ? row.slice(0, 3) : []));
        }

        const endCol = (id == "1" || id == "5") ? 7 : 6;
        res.json(fullData.map(row => row ? row.slice(1, endCol) : []));
    } catch (error) { 
        res.status(500).json({ error: "فشل الاتصال بجوجل درايف", details: error.message }); 
    }
});

// جلب قائمة أسماء التبويبات (أنواع التقارير) تلقائياً
app.get('/get-report-sheets', checkAuth, async (req, res) => {
    try {
        const fileId = fileIds["reports"];
        const buffer = await getExcelBuffer(fileId);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        res.json({ sheets: workbook.SheetNames });
    } catch (error) {
        res.status(500).json({ error: "فشل جلب التبويبات من جوجل درايف", details: error.message });
    }
});

// جلب بيانات تبويبة تقرير محددة بالكامل مع الحفاظ على التنسيق الأصلي للملف (الأرقام، العملات، التواريخ)
app.get('/get-report-data', checkAuth, async (req, res) => {
    try {
        const sheetName = req.query.sheet;
        if (!sheetName) return res.status(400).json({ error: "يرجى تحديد اسم التبويبة" });

        const fileId = fileIds["reports"];
        const buffer = await getExcelBuffer(fileId);
        const workbook = XLSX.read(buffer, { type: 'buffer' });

        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return res.status(404).json({ error: `التبويبة '${sheetName}' غير موجودة` });

        // نستخدم raw: false لتجلب البيانات منسقة تماماً بنصوصها وصيغتها في الإكسيل
        const fullData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
        res.json(fullData);
    } catch (error) {
        res.status(500).json({ error: "فشل جلب بيانات التقرير من جوجل درايف", details: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`System running strictly on Environment Variables`));

module.exports = app;