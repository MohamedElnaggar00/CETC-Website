const express = require('express');
const session = require('express-session');
const { google } = require('googleapis');
const XLSX = require('xlsx');
const path = require('path');

const app = express();

// --- 1. الإعدادات الأساسية ---
app.use(express.static(process.cwd())); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'cetc-unit-final-v3',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// بيانات الحساب
let USER_CREDENTIALS = {
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

// إعدادات جوجل درايف
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(process.cwd(), 'keys.json'), 
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

function checkAuth(req, res, next) {
    if (req.session.loggedIn) return next();
    res.redirect('/login');
}

// --- 2. صفحة تسجيل الدخول (كود HTML المراجع) ---
app.get('/login', (req, res) => {
    if (req.session.loggedIn) return res.redirect('/');
    
    // استخدام الرابط الخام المباشر لضمان الظهور
    const rawBgUrl = "https://raw.githubusercontent.com/MohamedElnaggar00/CETC-office-online/main/public/Background.jpg";

    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>CETC Unit - Login</title>
            <style>
                * { box-sizing: border-box; }
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    margin: 0; 
                    padding: 0;
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    height: 100vh; 
                    background-color: #1a1a1a; /* لون احتياطي */
                    background-image: url('${rawBgUrl}'); 
                    background-size: cover; 
                    background-position: center; 
                    background-repeat: no-repeat;
                    position: relative;
                }
                /* طبقة التعتيم */
                body::before { 
                    content: ""; 
                    position: absolute; 
                    top: 0; left: 0; right: 0; bottom: 0; 
                    background: rgba(0, 0, 0, 0.7); 
                    z-index: 1; 
                }
                .login-card { 
                    background: rgba(255, 255, 255, 0.95); 
                    padding: 40px; 
                    border-radius: 15px; 
                    border-top: 8px solid #C41230; 
                    text-align: center; 
                    box-shadow: 0 15px 35px rgba(0,0,0,0.5); 
                    width: 320px; 
                    z-index: 2; 
                    position: relative;
                }
                .logo-wrapper { background: #f8f8f8; padding: 10px; border-radius: 10px; margin-bottom: 20px; }
                img { max-height: 70px; display: block; margin: 0 auto; }
                h2 { color: #1a1a1a; margin: 10px 0 5px; font-size: 1.4rem; }
                p.sub { color: #C41230; font-weight: bold; margin-bottom: 25px; font-size: 0.85rem; }
                input { width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 8px; outline: none; font-size: 1rem; }
                input:focus { border-color: #C41230; }
                button { width: 100%; padding: 12px; background: #C41230; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s; font-size: 1rem; }
                button:hover { background: #000; }
                .footer { font-size: 0.7rem; color: #777; margin-top: 25px; }
            </style>
        </head>
        <body>
            <div class="login-card">
                <div class="logo-wrapper">
                    <img src="https://ejust.edu.eg/assets/img/logo.png" alt="E-JUST Logo">
                </div>
                <h2>CETC Unit</h2>
                <p class="sub">نظام حصر فواتير الشركات والمشاريع</p>
                <form action="/login" method="POST">
                    <input type="text" name="username" placeholder="اسم المستخدم" required>
                    <input type="password" name="password" placeholder="كلمة المرور" required>
                    <button type="submit">دخول للنظام</button>
                </form>
                <div class="footer">Egypt-Japan University for Science and Technology</div>
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
        res.send('بيانات غير صحيحة. <a href="/login">حاول مرة أخرى</a>');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.post('/update-account', checkAuth, (req, res) => {
    const { user, pass } = req.body;
    if (user) USER_CREDENTIALS.username = user;
    if (pass) USER_CREDENTIALS.password = pass;
    res.status(200).send("Updated");
});

app.get('/', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/get-data/:id', checkAuth, async (req, res) => {
    try {
        const id = req.params.id;
        const fileId = fileIds[id];
        const response = await drive.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'arraybuffer' });
        const workbook = XLSX.read(response.data, { type: 'buffer' });
        const sheet = workbook.Sheets["فواتير الشركات"];
        const fullData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const endCol = (id == "1" || id == "5") ? 7 : 6;
        const filteredData = fullData.map(row => row ? row.slice(1, endCol) : []);
        res.json(filteredData);
    } catch (error) {
        res.status(500).json({ error: "خطأ في الاتصال بجوجل درايف" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`System Running...` ));
module.exports = app;
