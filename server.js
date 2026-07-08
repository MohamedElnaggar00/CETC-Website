const express = require('express');
const session = require('express-session');
const { google } = require('googleapis');
const XLSX = require('xlsx');
const path = require('path');

const app = express();

// --- 1. الإعدادات الأساسية ---
// السماح بالوصول للملفات الثابتة (مثل الصور إذا كانت في المجلد الرئيسي)
app.use(express.static(path.join(process.cwd()))); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'cetc-ejust-system-final-2024',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // جلسة لمدة 24 ساعة
}));

// بيانات الحساب من متغيرات البيئة في Vercel
const USER_CREDENTIALS = {
    username: process.env.ADMIN_USER || "admin",
    password: process.env.ADMIN_PASS || "123"
};

// معرفات ملفات جوجل درايف
const fileIds = {
    "1": "19sOJ3ihc-edrZ9B0bYsVfv_loQbO0uhW", // سجل 01 LOG
    "2": "1L_XTHyXNy-7YtC6ZQZ3GHYriLGFMvAfx", // اسكان الحي التاسع
    "3": "19z4P-fDzzCIFOIeL9197YhQyr2vXPSgv", // ترعة الحمام
    "4": "1knkwfR7QmAFoHzyC3xg--ucJRuj33x8K", // مشروع ديارنا
    "5": "19z4P-fDzzCIFOIeL9197YhQyr2vXPSgv"  // الايرادات الشهرية
};

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

// ميدل وير لحماية المسارات الخاصة (لوحة التحكم)
function checkAuth(req, res, next) {
    if (req.session.loggedIn) return next();
    res.redirect('/login');
}

// --- 3. المسارات (Routes) ---

// [أ] الواجهة الرئيسية التعريفية
app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'index.html'));
});

// [ب] واجهة تسجيل الدخول
app.get('/login', (req, res) => {
    // إذا كان مسجلاً للدخول بالفعل، حوله للوحة التحكم
    if (req.session.loggedIn) return res.redirect('/Dashboard');
    res.sendFile(path.join(process.cwd(), 'login.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === USER_CREDENTIALS.username && password === USER_CREDENTIALS.password) {
        req.session.loggedIn = true;
        res.redirect('/Dashboard'); // التوجيه للوحة التحكم بعد النجاح
    } else {
        res.send('بيانات الدخول خاطئة. <a href="/login">حاول مرة أخرى</a>');
    }
});

// [ج] واجهة الإدارة والتحكم (Dashboard) - محمية
app.get('/Dashboard', checkAuth, (req, res) => {
    res.sendFile(path.join(process.cwd(), 'dashboard.html'));
});

// [د] تسجيل الخروج
app.get('/logout', (req, res) => { 
    req.session.destroy(); 
    res.redirect('/'); 
});

// [هـ] جلب البيانات من Google Drive (محمي)
app.get('/get-data/:id', checkAuth, async (req, res) => {
    try {
        const id = req.params.id;
        const fileId = fileIds[id];
        
        if (!fileId) return res.status(404).json({ error: "الملف المطلوب غير معرف" });

        const response = await drive.files.get(
            { fileId: fileId, alt: 'media' }, 
            { responseType: 'arraybuffer' }
        );

        const workbook = XLSX.read(response.data, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0]; 
        const sheet = workbook.Sheets[sheetName];
        const fullData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        // معالجة الأعمدة حسب نوع الملف (سجل 1 و 5 يحتاجان أعمدة أكثر)
        const endCol = (id == "1" || id == "5") ? 7 : 6;
        const filteredData = fullData.map(row => row ? row.slice(1, endCol) : []);
        
        res.json(filteredData);
    } catch (error) { 
        console.error("Drive API Error:", error.message);
        res.status(500).json({ error: "فشل جلب البيانات من Google Drive", details: error.message }); 
    }
});

// [و] تحديث بيانات الحساب (مؤقت في الذاكرة)
app.post('/update-account', checkAuth, (req, res) => {
    const { user, pass } = req.body;
    if (user) USER_CREDENTIALS.username = user;
    if (pass) USER_CREDENTIALS.password = pass;
    res.status(200).send("Updated");
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CETC System Online on port ${PORT}`));

module.exports = app;
