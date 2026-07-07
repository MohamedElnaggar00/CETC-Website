const express = require('express');
const session = require('express-session');
const { google } = require('googleapis');
const XLSX = require('xlsx');
const path = require('path');

const app = express();

// --- 1. إعدادات الحماية والجلسة (Middleware) ---
app.use(express.urlencoded({ extended: true })); // لقراءة بيانات نموذج تسجيل الدخول
app.use(session({
    secret: 'office-secret-key-2024', // يمكنك تغيير هذه الكلمة لأي نص عشوائي
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // تنتهي الجلسة بعد 24 ساعة
}));

// --- 2. بيانات الدخول (يمكنك تغييرها من هنا) ---
const USER_CREDENTIALS = {
    username: "admin",
    password: "123"
};

// --- 3. إعدادات الوصول لجوجل درايف ---
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(process.cwd(), 'keys.json'), 
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

// --- 4. معرفات الملفات (File IDs) ---
// ضع الـ IDs الخاصة بملفاتك هنا كما شرحنا سابقاً
const fileIds = {
    "1": "19sOJ3ihc-edrZ9B0bYsVfv_loQbO0uhW",
    "2": "1L_XTHyXNy-7YtC6ZQZ3GHYriLGFMvAfx",
    "3": "19z4P-fDzzCIFOIeL9197YhQyr2vXPSgv",
    "4": "1knkwfR7QmAFoHzyC3xg--ucJRuj33x8K"
};

// --- 5. وظيفة التحقق من تسجيل الدخول (Authentication Middleware) ---
function checkAuth(req, res, next) {
    if (req.session.loggedIn) {
        return next();
    }
    res.redirect('/login');
}

// --- 6. روابط (Routes) تسجيل الدخول ---

// عرض صفحة تسجيل الدخول
app.get('/login', (req, res) => {
    // إذا كان مسجل دخول بالفعل، حوله للرئيسية
    if (req.session.loggedIn) return res.redirect('/');
    
    res.send(`
        <div dir="rtl" style="text-align:center; margin-top:100px; font-family:sans-serif; background:#f4f7f6; padding:50px;">
            <div style="background:white; display:inline-block; padding:30px; border-radius:10px; shadow:0 4px 6px rgba(0,0,0,0.1);">
                <h2 style="color:#2c3e50;">تسجيل دخول النظام</h2>
                <form action="/login" method="POST">
                    <input type="text" name="username" placeholder="اسم المستخدم" style="padding:10px; margin:10px; width:200px;" required><br>
                    <input type="password" name="password" placeholder="كلمة المرور" style="padding:10px; margin:10px; width:200px;" required><br>
                    <button type="submit" style="padding:10px 30px; background:#3498db; color:white; border:none; border-radius:5px; cursor:pointer;">دخول</button>
                </form>
            </div>
        </div>
    `);
});

// معالجة بيانات الدخول
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === USER_CREDENTIALS.username && password === USER_CREDENTIALS.password) {
        req.session.loggedIn = true;
        res.redirect('/');
    } else {
        res.send('<h3 style="text-align:center; color:red; margin-top:50px;">بيانات الدخول خاطئة! <a href="/login">حاول مرة أخرى</a></h3>');
    }
});

// تسجيل الخروج
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// --- 7. روابط النظام الأساسية (محمية بـ checkAuth) ---

// الصفحة الرئيسية
app.get('/', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// جلب البيانات من جوجل درايف
app.get('/get-data/:id', checkAuth, async (req, res) => {
    try {
        const fileId = fileIds[req.params.id];
        if (!fileId) return res.status(404).send("معرف الملف غير صحيح");

        // تحميل الملف
        const response = await drive.files.get(
            { fileId: fileId, alt: 'media' },
            { responseType: 'arraybuffer' }
        );

        // معالجة الملف
        const workbook = XLSX.read(response.data, { type: 'buffer' });
        const sheetName = "فواتير الشركات"; 
        
        if (!workbook.SheetNames.includes(sheetName)) {
            return res.status(404).json({ error: "تبويبة فواتير الشركات غير موجودة" });
        }

        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        res.json(data);
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "حدث خطأ أثناء جلب البيانات من جوجل" });
    }
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(`✅ الموقع يعمل بنجاح`);
    console.log(`🔗 الرابط المحلي: http://localhost:${PORT}`);
    console.log(`===========================================`);
});
module.exports = app;
