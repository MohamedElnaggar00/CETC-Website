const express = require('express');
const session = require('express-session');
const { google } = require('googleapis');
const XLSX = require('xlsx');
const path = require('path');

const app = express();

// --- 1. الإعدادات الأساسية والملفات الثابتة (لإظهار الصور) ---
app.use(express.static(path.join(__dirname))); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// إعداد الجلسة (Login Session)
app.use(session({
    secret: 'cetc-unit-secret-2024',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // يوم واحد
}));

// بيانات الحساب (سيتم استخدام البيئة إذا وجدت في Vercel)
let USER_CREDENTIALS = {
    username: process.env.ADMIN_USER || "admin",
    password: process.env.ADMIN_PASS || "123"
};

// --- 2. معرفات ملفات جوجل درايف ---
const fileIds = {
    "1": "19sOJ3ihc-edrZ9B0bYsVfv_loQbO0uhW", // سجل 01 LOG
    "2": "1L_XTHyXNy-7YtC6ZQZ3GHYriLGFMvAfx", // اسكان الحي التاسع
    "3": "19z4P-fDzzCIFOIeL9197YhQyr2vXPSgv", // ترعة الحمام
    "4": "1knkwfR7QmAFoHzyC3xg--ucJRuj33x8K", // مشروع ديارنا
    "5": "19z4P-fDzzCIFOIeL9197YhQyr2vXPSgv"  // الايرادات الشهرية (تأكد من وضع الـ ID الصحيح هنا)
};

// --- 3. إعدادات الاتصال بجوجل درايف ---
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(process.cwd(), 'keys.json'), 
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

// وظيفة حماية الصفحات
function checkAuth(req, res, next) {
    if (req.session.loggedIn) return next();
    res.redirect('/login');
}

// --- 4. روابط (Routes) النظام ---

// صفحة تسجيل الدخول مع الخلفية Background.jpg
app.get('/login', (req, res) => {
    if (req.session.loggedIn) return res.redirect('/');
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>CETC Unit - Login</title>
            <style>
                body { 
                    font-family: sans-serif; margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; 
                    background-image: url('Background.jpg'); background-size: cover; background-position: center; position: relative;
                }
                body::before { content: ""; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.6); z-index: 0; }
                .login-card { 
                    background: rgba(255, 255, 255, 0.95); padding: 40px; border-radius: 15px; border-top: 8px solid #C41230; 
                    text-align: center; box-shadow: 0 15px 35px rgba(0,0,0,0.5); width: 320px; z-index: 1; position: relative;
                }
                img { max-height: 80px; margin-bottom: 20px; }
                h2 { color: #1a1a1a; margin: 0 0 5px; font-size: 1.3rem; }
                p.sub { color: #C41230; font-weight: bold; margin-bottom: 25px; font-size: 0.85rem; }
                input { width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; outline: none; }
                button { width: 100%; padding: 12px; background: #C41230; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s; }
                button:hover { background: #000; }
            </style>
        </head>
        <body>
            <div class="login-card">
                <img src="https://ejust.edu.eg/assets/img/logo.png" alt="E-JUST Logo">
                <h2>CETC Unit</h2>
                <p class="sub">Civil Engineering Testing and Consulting Unit</p>
                <form action="/login" method="POST">
                    <input type="text" name="username" placeholder="اسم المستخدم" required>
                    <input type="password" name="password" placeholder="كلمة المرور" required>
                    <button type="submit">دخول للنظام</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === USER_CREDENTIALS.username && password === USER_CREDENTIALS.password) {
        req.session.loggedIn = true;
        res.redirect('/');
    } else {
        res.send('بيانات الدخول غير صحيحة. <a href="/login">حاول مرة أخرى</a>');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// تحديث الإعدادات (في الذاكرة حالياً)
app.post('/update-account', checkAuth, (req, res) => {
    const { user, pass } = req.body;
    if (user) USER_CREDENTIALS.username = user;
    if (pass) USER_CREDENTIALS.password = pass;
    res.status(200).send("Updated");
});

// الرابط الرئيسي
app.get('/', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// جلب البيانات من جوجل درايف مع قص الأعمدة
app.get('/get-data/:id', checkAuth, async (req, res) => {
    try {
        const id = req.params.id;
        const fileId = fileIds[id];
        if (!fileId) return res.status(404).send("File not found");

        const response = await drive.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'arraybuffer' });
        const workbook = XLSX.read(response.data, { type: 'buffer' });
        const sheet = workbook.Sheets["فواتير الشركات"];
        
        if (!sheet) return res.status(404).json({ error: "التبويبة غير موجودة" });

        const fullData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        // التعديل المطلوب لقص الأعمدة:
        // ملف 1 و 5: من B إلى G (Index 1-7)
        // ملفات 2 و 3 و 4: من B إلى F (Index 1-6) وحذف G
        const endColumn = (id == "1" || id == "5") ? 7 : 6;
        const filteredData = fullData.map(row => row ? row.slice(1, endColumn) : []);

        res.json(filteredData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "فشل الاتصال بجوجل درايف" });
    }
});

// بدء التشغيل
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
