const express = require('express');
const session = require('express-session');
const pg = require('pg');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
const { google } = require('googleapis');
const XLSX = require('xlsx');
const path = require('path');

const app = express();

// --- 1. إعداد اتصال قاعدة البيانات (PostgreSQL Pool لـ Supabase) ---
const pgPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL, // الرابط المحدّث من لوحة تحكم Supabase
    ssl: { rejectUnauthorized: false } // لتأمين الاتصال السحابي بقاعدة البيانات
});

// --- 2. الإعدادات الأساسية وإدارة الجلسات السحابية ---
app.use(express.static(path.join(process.cwd()))); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    store: new PgSession({
        pool: pgPool,             // حفظ الجلسات بداخل قاعدة بيانات Supabase
        tableName: 'session'      // اسم الجدول المخصص للجلسات
    }),
    secret: process.env.SESSION_SECRET || 'cetc-ejust-secure-session',
    resave: false,
    saveUninitialized: false, // لمنع إنشاء جلسات فارغة للزوار وحفظ موارد قاعدة البيانات
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // صلاحية الجلسة: يوم واحد
}));

// --- 3. إعدادات الوصول لجوجل درايف (Environment Variables) ---
let privateKey = process.env.GOOGLE_PRIVATE_KEY;
if (privateKey) {
    privateKey = privateKey.trim();
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
        privateKey = privateKey.slice(1, -1);
    }
    if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
        privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, '\n');
}

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

// ميدل وير لحماية المسارات لوحة التحكم
function checkAuth(req, res, next) {
    if (req.session.loggedIn) return next();
    res.redirect('/login');
}

// تحميل بفر الإكسيل من درايف وتحويله
async function getExcelBuffer(fileId) {
    try {
        const fileMeta = await drive.files.get({ fileId: fileId, fields: 'mimeType' });
        const mimeType = fileMeta.data.mimeType;
        let response;
        if (mimeType === 'application/vnd.google-apps.spreadsheet') {
            response = await drive.files.export({ fileId: fileId, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, { responseType: 'arraybuffer' });
        } else {
            response = await drive.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'arraybuffer' });
        }
        return response.data;
    } catch (err) {
        throw new Error(`جوجل درايف يرفض الاتصال: ${err.message}`);
    }
}

// --- 4. المسارات (Routes) ---

app.get('/', (req, res) => res.sendFile(path.join(process.cwd(), 'index.html')));

app.get('/login', (req, res) => {
    if (req.session.loggedIn) return res.redirect('/Dashboard');
    res.sendFile(path.join(process.cwd(), 'login.html'));
});

// مسار التحقق من الهوية الآمن والمشفر باستخدام bcrypt و Supabase
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        // 1. استعلام للبحث عن المستخدم في قاعدة البيانات بالاسم فقط لتعزيز الأمن
        const queryText = 'SELECT * FROM admins WHERE username = $1';
        const result = await pgPool.query(queryText, [username]);

        if (result.rows.length > 0) {
            const admin = result.rows[0];
            
            // 2. مقارنة كلمة المرور المدخلة بالهاش المخزن والمشفر بأمان في قاعدة البيانات
            const isMatch = await bcrypt.compare(password, admin.password);

            if (isMatch) {
                req.session.loggedIn = true;
                req.session.adminUser = username;
                return res.json({ success: true, redirect: '/Dashboard' });
            }
        }
        
        // 3. رسالة خطأ موحدة مبهمة لمنع المهاجمين من استنتاج الحسابات الصالحة
        res.json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
    } catch (error) {
        console.error('Database query error:', error);
        res.status(500).json({ success: false, error: 'حدث خطأ فني أثناء الاتصال بالخادم السحابي.' });
    }
});

app.get('/Dashboard', checkAuth, (req, res) => res.sendFile(path.join(process.cwd(), 'dashboard.html')));

app.get('/logout', (req, res) => { 
    req.session.destroy(); 
    res.redirect('/'); 
});

// روابط الصفحات الفرعية والتعريفية
app.get('/introducing', (req, res) => res.sendFile(path.join(process.cwd(), 'introducing.html')));
app.get('/portfolio', (req, res) => res.sendFile(path.join(process.cwd(), 'portfolio.html')));
app.get('/partners', (req, res) => res.sendFile(path.join(process.cwd(), 'partners.html')));
app.get('/services-prices', (req, res) => res.sendFile(path.join(process.cwd(), 'services-prices.html')));
app.get('/gallery', (req, res) => res.sendFile(path.join(process.cwd(), 'gallery.html')));
app.get('/report-request', (req, res) => res.sendFile(path.join(process.cwd(), 'report-request.html')));

// جلب البيانات ذكياً (فواتير وإيرادات)
app.get('/get-data/:id', checkAuth, async (req, res) => {
    try {
        const id = req.params.id;
        const fileId = fileIds[id];
        
        if (!fileId) {
            return res.status(404).json({ error: `المعرف رقم ${id} غير مسجل على الخادم` });
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
        res.status(500).json({ error: error.message }); 
    }
});

// جلب قائمة أسماء التبويبات تلقائياً
app.get('/get-report-sheets', checkAuth, async (req, res) => {
    try {
        const fileId = fileIds["reports"];
        const buffer = await getExcelBuffer(fileId);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        res.json({ sheets: workbook.SheetNames });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// جلب بيانات تبويبة تقرير محددة بالكامل
app.get('/get-report-data', checkAuth, async (req, res) => {
    try {
        const sheetName = req.query.sheet;
        if (!sheetName) return res.status(400).json({ error: "يرجى تحديد اسم التبويبة" });

        const fileId = fileIds["reports"];
        const buffer = await getExcelBuffer(fileId);
        const workbook = XLSX.read(buffer, { type: 'buffer' });

        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return res.status(404).json({ error: `التبويبة '${sheetName}' غير موجودة` });

        const fullData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
        res.json(fullData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`System running`));

module.exports = app;
