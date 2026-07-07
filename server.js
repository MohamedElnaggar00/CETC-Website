const express = require('express');
const session = require('express-session');
const { google } = require('googleapis');
const XLSX = require('xlsx');
const path = require('path');

const app = express();

// --- 1. إعدادات هامة جداً لإظهار الصور والملفات ---
app.use(express.static(path.join(__dirname))); 
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'cetc-ejust-2024-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const USER_CREDENTIALS = { username: "admin", password: "123" };

// --- 2. إعدادات الوصول لجوجل درايف ---
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(process.cwd(), 'keys.json'), 
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

const fileIds = {
    "1": "19sOJ3ihc-edrZ9B0bYsVfv_loQbO0uhW",
    "2": "1L_XTHyXNy-7YtC6ZQZ3GHYriLGFMvAfx",
    "3": "19z4P-fDzzCIFOIeL9197YhQyr2vXPSgv",
    "4": "1knkwfR7QmAFoHzyC3xg--ucJRuj33x8K"
};

function checkAuth(req, res, next) {
    if (req.session.loggedIn) return next();
    res.redirect('/login');
}

// --- 3. صفحة تسجيل الدخول المحدثة (داخل السيرفر) ---
app.get('/login', (req, res) => {
    if (req.session.loggedIn) return res.redirect('/');
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>CETC Unit - Login</title>
            <style>
                body { font-family: sans-serif; background-color: #1a1a1a; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .login-card { background: white; padding: 40px; border-radius: 15px; border-top: 8px solid #C41230; text-align: center; box-shadow: 0 15px 35px rgba(0,0,0,0.5); width: 320px; }
                img { max-height: 90px; margin-bottom: 20px; }
                h2 { color: #1a1a1a; margin: 0 0 10px; font-size: 1.3rem; }
                p.sub { color: #C41230; font-weight: bold; margin-bottom: 25px; font-size: 0.9rem; }
                input { width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; font-size: 1rem; outline: none; }
                input:focus { border-color: #C41230; }
                button { width: 100%; padding: 12px; background: #C41230; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s; font-size: 1rem; }
                button:hover { background: #000; }
                .footer-text { font-size: 0.65rem; color: #999; margin-top: 25px; line-height: 1.4; }
            </style>
        </head>
        <body>
            <div class="login-card">
                <img src="logo.png" alt="Logo">
                <h2>CETC Unit</h2>
                <p class="sub">نظام حصر فواتير الشركات</p>
                <form action="/login" method="POST">
                    <input type="text" name="username" placeholder="اسم المستخدم" required>
                    <input type="password" name="password" placeholder="كلمة المرور" required>
                    <button type="submit">دخول للنظام</button>
                </form>
                <div class="footer-text">
                    Egypt-Japan University for Science and Technology<br>
                    Civil Engineering Testing and Consulting Unit
                </div>
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
        res.send('<h3 style="text-align:center; color:red; margin-top:50px;">خطأ في البيانات! <a href="/login">حاول ثانية</a></h3>');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// --- 4. الروابط الأساسية ---
app.get('/', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/get-data/:id', checkAuth, async (req, res) => {
    try {
        const fileId = fileIds[req.params.id];
        const response = await drive.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'arraybuffer' });
        const workbook = XLSX.read(response.data, { type: 'buffer' });
        const sheet = workbook.Sheets["فواتير الشركات"];
        const fullData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const filteredData = fullData.map(row => row ? row.slice(1, 7) : []);
        res.json(filteredData);
    } catch (error) {
        res.status(500).json({ error: "خطأ في جلب البيانات" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
module.exports = app;
