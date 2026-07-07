const express = require('express');
const session = require('express-session');
const { google } = require('googleapis');
const XLSX = require('xlsx');
const path = require('path');

const app = express();

// إعدادات البيئة
app.use(express.static(path.join(__dirname))); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'cetc-ejust-system-2024',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// بيانات الحساب الافتراضية
let USER_CREDENTIALS = {
    username: "admin",
    password: "123"
};

// معرفات ملفات جوجل درايف
const fileIds = {
    "1": "19sOJ3ihc-edrZ9B0bYsVfv_loQbO0uhW", // سجل 01
    "2": "1L_XTHyXNy-7YtC6ZQZ3GHYriLGFMvAfx", // اسكان 9
    "3": "19z4P-fDzzCIFOIeL9197YhQyr2vXPSgv", // ترعة الحمام
    "4": "1knkwfR7QmAFoHzyC3xg--ucJRuj33x8K", // مشروع ديارنا
    "5": "ضع_هنا_ID_ملف_الايرادات_الشهرية"    // إحصائيات الإيرادات الشهرية
};

// إعدادات الوصول لجوجل
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(process.cwd(), 'keys.json'), 
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

// حماية الروابط
function checkAuth(req, res, next) {
    if (req.session.loggedIn) return next();
    res.redirect('/login');
}

// رابط تحديث الإعدادات
app.post('/update-account', checkAuth, (req, res) => {
    const { user, pass } = req.body;
    if (user) USER_CREDENTIALS.username = user;
    if (pass) USER_CREDENTIALS.password = pass;
    res.status(200).send("Updated");
});

// صفحة تسجيل الدخول
app.get('/login', (req, res) => {
    if (req.session.loggedIn) return res.redirect('/');
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>CETC Unit - Login</title>
            <style>
                body { font-family: sans-serif; background: #1a1a1a; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: white; padding: 40px; border-radius: 15px; border-top: 8px solid #C41230; text-align: center; width: 320px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
                img { max-height: 80px; margin-bottom: 20px; }
                input { width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; }
                button { width: 100%; padding: 12px; background: #C41230; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; }
            </style>
        </head>
        <body>
            <div class="card">
                <img src="https://ejust.edu.eg/assets/img/logo.png" alt="Logo">
                <h2>CETC UNIT</h2>
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
        res.send('بيانات خاطئة! <a href="/login">عودة</a>');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// جلب البيانات مع تعديل الأعمدة المطلوب
app.get('/get-data/:id', checkAuth, async (req, res) => {
    try {
        const id = req.params.id;
        const fileId = fileIds[id];
        const response = await drive.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'arraybuffer' });
        const workbook = XLSX.read(response.data, { type: 'buffer' });
        const sheet = workbook.Sheets["فواتير الشركات"];
        const fullData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        // تعديل: ملف 1 و 5 نسحب B-G | ملفات 2-4 نسحب B-F
        const endCol = (id == "1" || id == "5") ? 7 : 6;
        const filtered = fullData.map(row => row ? row.slice(1, endCol) : []);
        res.json(filtered);
    } catch (error) {
        res.status(500).json({ error: "خطأ في الاتصال بجوجل درايف" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`System Live on ${PORT}`));
module.exports = app;
