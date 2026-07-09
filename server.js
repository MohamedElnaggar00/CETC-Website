const express = require('express');
const session = require('express-session');
const { google } = require('googleapis');
const XLSX = require('xlsx');
const path = require('path');

const app = express();

// الإعدادات الأساسية
app.use(express.static(path.join(process.cwd()))); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'cetc-ejust-system-final-2024',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// الاعتماد الكلي على متغيرات بيئة Vercel
const USER_CREDENTIALS = {
    username: process.env.ADMIN_USER || "admin",
    password: process.env.ADMIN_PASS || "123"
};

const fileIds = {
    "1": "19sOJ3ihc-edrZ9B0bYsVfv_loQbO0uhW",
    "2": "1L_XTHyXNy-7YtC6ZQZ3GHYriLGFMvAfx",
    "3": "19z4P-fDzzCIFOIeL9197YhQyr2vXPSgv",
    "4": "1knkwfR7QmAFoHzyC3xg--ucJRuj33x8K",
    "5": "19z4P-fDzzCIFOIeL9197YhQyr2vXPSgv" 
};

const privateKey = process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;

const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: privateKey,
        project_id: process.env.GOOGLE_PROJECT_ID,
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

function checkAuth(req, res, next) {
    if (req.session.loggedIn) return next();
    res.redirect('/login');
}

// المسارات
app.get('/', (req, res) => res.sendFile(path.join(process.cwd(), 'index.html')));

app.get('/login', (req, res) => {
    if (req.session.loggedIn) return res.redirect('/Dashboard');
    res.sendFile(path.join(process.cwd(), 'login.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === USER_CREDENTIALS.username && password === USER_CREDENTIALS.password) {
        req.session.loggedIn = true;
        res.redirect('/Dashboard');
    } else {
        res.send('بيانات خاطئة. <a href="/login">حاول ثانية</a>');
    }
});

app.get('/Dashboard', checkAuth, (req, res) => res.sendFile(path.join(process.cwd(), 'dashboard.html')));

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.get('/get-data/:id', checkAuth, async (req, res) => {
    try {
        const id = req.params.id;
        const fileId = fileIds[id];
        const response = await drive.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'arraybuffer' });
        const workbook = XLSX.read(response.data, { type: 'buffer' });
        const sheet = workbook.Sheets["فواتير الشركات"];
        if (!sheet) return res.status(404).json({ error: "التبويبة غير موجودة" });
        const fullData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const endCol = (id == "1" || id == "5") ? 7 : 6;
        res.json(fullData.map(row => row ? row.slice(1, endCol) : []));
    } catch (error) { res.status(500).json({ error: error.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Online on ${PORT}`));
