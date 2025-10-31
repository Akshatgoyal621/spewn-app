// index.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { MongoMemoryServer } = require('mongodb-memory-server');
const crypto = require('crypto');
const axios = require('axios');
const User = require('./models/User');

const app = express();
app.use(express.json());
app.use(cookieParser());

const {
    PORT = 4000,
    MONGODB_URI,
    JWT_SECRET = 'change_this_jwt_secret',
    COOKIE_NAME = 'spewn_token',
    FRONTEND_URL = 'http://localhost:3000',
    NODE_ENV = 'development'
} = process.env;

app.use(cors({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

async function connectDB() {
    try {
        if (MONGODB_URI) {
            await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
            console.log('MongoDB connected via MONGODB_URI');
        } else {
            // In-memory fallback for dev convenience
            const mongod = await MongoMemoryServer.create();
            const uri = mongod.getUri();
            await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
            console.log('MongoMemoryServer started (in-memory MongoDB)');
        }
    } catch (err) {
        console.error('Mongo connection error', err);
        process.exit(1);
    }
}

connectDB();

// helpers
function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

async function authMiddleware(req, res, next) {
    try {
        const token = req.cookies[COOKIE_NAME];
        if (!token) return res.status(401).json({ message: 'Unauthorized' });
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).lean();
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
}

function validateMonthFormat(month) {
    if (!month || typeof month !== 'string') return false;
    const m = month.match(/^(\d{4})-(\d{2})$/);
    if (!m) return false;
    const mm = Number(m[2]);
    return mm >= 1 && mm <= 12;
}

function computeDistribution(salary, splits, extraIncome = 0) {
    const total = Number(salary || 0) + Number(extraIncome || 0);
    const out = {};
    Object.keys(splits || {}).forEach(k => {
        out[k] = Math.round((total * Number(splits[k] || 0)) / 100);
    });
    return out;
}

// health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// auth: register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ message: 'User already exists' });
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({ email, name: name || '', passwordHash });
        const token = signToken({ id: user._id });
        const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: NODE_ENV === 'production' };
        res.cookie(COOKIE_NAME, token, cookieOptions);
        res.json({ ok: true, user: { id: user._id, email: user.email } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;
        if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Invalid credentials' });
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return res.status(400).json({ message: 'Invalid credentials' });

        const token = signToken({ id: user._id });
        const cookieOptions = {
            httpOnly: true,
            sameSite: 'lax',
            secure: NODE_ENV === 'production',
            ...(rememberMe ? { maxAge: 1000 * 60 * 60 * 24 * 30 } : {})
        };
        res.cookie(COOKIE_NAME, token, cookieOptions);
        res.json({ ok: true, user: { id: user._id, email: user.email } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME);
    res.json({ ok: true });
});

// Helper: ensure user's automation for the month (runs once per month when needed)
async function ensureMonthlyAutomation(userId) {
    const user = await User.findById(userId).lean();
    if (!user) return;
    if (!user.automate) return; // nothing to do
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (user.lastAutomatedMonth === currentMonth) return; // already ran
    // if salaryLockedMonth matches currentMonth AND distributionByMonth already exists for month, skip
    const locked = user.salaryLockedMonth || '';
    if (locked === currentMonth && (user.distributionByMonth && (user.distributionByMonth.get ? user.distributionByMonth.get(currentMonth) : user.distributionByMonth[currentMonth]))) {
        // mark lastAutomatedMonth to avoid re-run
        await User.findByIdAndUpdate(userId, { $set: { lastAutomatedMonth: currentMonth } });
        return;
    }
    // compute distribution for currentMonth and persist
    const splits = user.splits || {};
    const salary = Number(user.salary || 0);
    const distributed = computeDistribution(salary, splits, 0);
    const update = { $set: {} };
    update.$set[`distributionByMonth.${currentMonth}`] = distributed;
    // also update top-level distribution if currentMonth
    update.$set.distribution = distributed;
    update.$set.lastAutomatedMonth = currentMonth;
    await User.findByIdAndUpdate(userId, update, { new: true });
}

// get current user (auth + automation check)
app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        // run monthly automation if needed (runs once per user when they fetch profile first time in month)
        try {
            await ensureMonthlyAutomation(req.user._id);
        } catch (err) {
            console.warn('automation check failed', err);
        }

        const fresh = await User.findById(req.user._id).lean();
        if (!fresh) return res.status(401).json({ message: 'Unauthorized' });

        // return load of fields front-end needs
        const {
            _id, email, name, salary, splits, distribution, distributionByMonth,
            preset, currency, transactions, subscribed, automate, activeTracking,
            salaryHistory, salaryLockedMonth, startMonth, onboardComplete, lastAutomatedMonth
        } = fresh;

        res.json({
            id: _id,
            email, name, salary, splits,
            distribution: distribution || null,
            distributionByMonth: distributionByMonth || {},
            preset: preset || null,
            currency,
            transactions: transactions || [],
            subscribed: Boolean(subscribed),
            automate: Boolean(automate),
            activeTracking: Boolean(activeTracking),
            salaryHistory: salaryHistory || [],
            salaryLockedMonth: salaryLockedMonth || '',
            startMonth: startMonth || '',
            onboardComplete: Boolean(onboardComplete),
            lastAutomatedMonth: lastAutomatedMonth || ''
        });
    } catch (err) {
        console.error('me error', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// forgot/reset password (unchanged except small return)
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email required' });
        const user = await User.findOne({ email });
        if (!user) return res.status(200).json({ message: 'If account exists, we will send reset instructions' });
        const token = crypto.randomBytes(20).toString('hex');
        const expires = Date.now() + 1000 * 60 * 60;
        await User.findByIdAndUpdate(user._id, { resetToken: token, resetTokenExpires: new Date(expires) });
        console.log(`PASSWORD RESET TOKEN for ${email}: ${token} (expires in 1 hour)`);
        res.json({ ok: true, message: 'Reset token created (dev: printed to server console)' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) return res.status(400).json({ message: 'Token and newPassword required' });
        const user = await User.findOne({ resetToken: token, resetTokenExpires: { $gt: new Date() } });
        if (!user) return res.status(400).json({ message: 'Invalid or expired token' });
        const passwordHash = await bcrypt.hash(newPassword, 10);
        await User.findByIdAndUpdate(user._id, { passwordHash, resetToken: null, resetTokenExpires: null });
        res.json({ ok: true, message: 'Password updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

/*
  Google OAuth scaffold (unchanged)
*/
const qs = (obj) => Object.keys(obj).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`).join('&');

app.get('/api/auth/google', (req, res) => {
    const { GOOGLE_CLIENT_ID, FRONTEND_URL } = process.env;
    if (!GOOGLE_CLIENT_ID) return res.status(501).json({ message: 'Google auth not configured on server' });
    const redirectUri = `https://accounts.google.com/o/oauth2/v2/auth?${qs({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: `${process.env.FRONTEND_URL || FRONTEND_URL}/api/auth/google/callback`,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'select_account'
    })}`;
    res.redirect(redirectUri);
});

app.get('/api/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return res.status(501).send('Google OAuth not configured');
    try {
        const tokenRes = await axios.post('https://oauth2.googleapis.com/token', qs({
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: `http://localhost:4000/api/auth/google/callback`,
            grant_type: 'authorization_code'
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        const id_token = tokenRes.data.id_token;
        const base64Url = id_token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
        const email = decoded.email;
        const name = decoded.name || decoded.email.split('@')[0];
        let user = await User.findOne({ email });
        if (!user) {
            const dummyPass = crypto.randomBytes(12).toString('hex');
            const passwordHash = await bcrypt.hash(dummyPass, 10);
            user = await User.create({ email, name, passwordHash });
        }
        const token = signToken({ id: user._id });
        const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: NODE_ENV === 'production' };
        res.cookie(COOKIE_NAME, token, cookieOptions);
        res.redirect(process.env.FRONTEND_URL || 'http://localhost:3000');
    } catch (err) {
        console.error('Google callback failed', err.response?.data || err.message || err);
        res.status(500).send('Google auth failed');
    }
});

// profile update (handles startNewCycle)
app.put('/api/profile', authMiddleware, async (req, res) => {
    try {
        let {
            salary, salaryFrequency, splits, preset, automate, startMonth,
            startNewCycle, extraIncome // remove activeTracking from destructure
        } = req.body;

        // Server decides activeTracking; do not trust client to send it
        const willActivateTracking = Boolean(automate) && Boolean(startNewCycle);

        const newSplits = splits ?? req.user.splits ?? {};

        // validate splits sum
        const sum = Object.values(newSplits || {}).reduce((a, b) => a + Number(b || 0), 0);
        if (sum !== 100) return res.status(400).json({ message: 'Splits must sum to 100' });

        // validate startMonth if provided
        if (typeof startMonth !== 'undefined' && startMonth) {
            if (!validateMonthFormat(startMonth)) return res.status(400).json({ message: 'startMonth must be in YYYY-MM format' });
        }

        if (startNewCycle) {
            if (!startMonth || !validateMonthFormat(startMonth)) {
                return res.status(400).json({ message: 'startMonth must be provided in YYYY-MM format when starting a new cycle' });
            }
            if (req.user.salaryLockedMonth && req.user.salaryLockedMonth === startMonth) {
                return res.status(409).json({ message: `Salary for ${startMonth} is locked and cannot be overwritten` });
            }

            const oldSalary = req.user.salary ?? 0;
            const oldStartMonth = req.user.startMonth ?? '';
            const historyEntry = {
                salary: oldSalary,
                startMonth: oldStartMonth || '',
                extraIncome: Number(extraIncome || 0),
                createdAt: new Date()
            };

            const distributed = computeDistribution(Number(salary || 0), newSplits, Number(extraIncome || 0));

            // Build update: note we set activeTracking according to server rule
            const update = {
                $push: { salaryHistory: historyEntry },
                $set: {
                    salary: Number(salary || 0),
                    startMonth: startMonth || '',
                    salaryLockedMonth: startMonth || '',
                    splits: newSplits,
                    preset: preset || req.user.preset,
                    automate: typeof automate !== 'undefined' ? Boolean(automate) : req.user.automate,
                    // server-determined:
                    activeTracking: willActivateTracking,
                    onboardComplete: true
                },
            };
            update.$set[`distributionByMonth.${startMonth}`] = distributed;

            // if startMonth is current month, also set top-level distribution
            if (startMonth === (new Date().toISOString().slice(0, 7))) {
                update.$set.distribution = distributed;
            }

            await User.findByIdAndUpdate(req.user._id, update, { new: true });

            const updated = await User.findById(req.user._id).lean();
            return res.json({
                salary: updated.salary,
                splits: updated.splits,
                preset: updated.preset,
                automate: Boolean(updated.automate),
                startMonth: updated.startMonth || '',
                subscribed: Boolean(updated.subscribed),
                salaryHistory: updated.salaryHistory || [],
                salaryLockedMonth: updated.salaryLockedMonth || '',
                // activeTracking now comes from DB
                activeTracking: Boolean(updated.activeTracking),
                onboardComplete: Boolean(updated.onboardComplete)
            });
        }

        // Normal update (no new cycle) - do NOT accept client activeTracking
        const updateObj = {
            salary: Number(salary || req.user.salary || 0),
            salaryFrequency,
            splits: newSplits,
            preset: preset || req.user.preset,
            onboardComplete: true
        };
        if (typeof automate !== 'undefined') updateObj.automate = Boolean(automate);
        // Note: server does not accept activeTracking from client for normal updates
        if (typeof startMonth !== 'undefined') updateObj.startMonth = startMonth || '';

        await User.findByIdAndUpdate(req.user._id, updateObj, { new: true });
        const updated = await User.findById(req.user._id).lean();

        res.json({
            salary: updated.salary,
            splits: updated.splits,
            preset: updated.preset,
            automate: Boolean(updated.automate),
            startMonth: updated.startMonth || '',
            subscribed: Boolean(updated.subscribed),
            salaryHistory: updated.salaryHistory || [],
            salaryLockedMonth: updated.salaryLockedMonth || '',
            activeTracking: Boolean(updated.activeTracking),
            onboardComplete: Boolean(updated.onboardComplete)
        });

    } catch (err) {
        console.error('profile update error', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// simulate / distribute with month validation and persistence
app.post('/api/simulate-distribute', authMiddleware, async (req, res) => {
    try {
        const { salary: inputSalary, splits: inputSplits, preset: splitPreset, month, extraIncome } = req.body;
        const salary = Number(inputSalary ?? req.user.salary ?? 0);
        const splits = inputSplits || req.user.splits;
        const preset = splitPreset || req.user.preset;

        console.log(req.body);

        // validate splits sum
        const sum = Object.values(splits).reduce((a, b) => a + Number(b || 0), 0);
        if (sum !== 100) return res.status(400).json({ message: 'Splits must sum to 100' });

        // month validation
        const targetMonth = month || req.user.startMonth || new Date().toISOString().slice(0, 7);
        if (!validateMonthFormat(targetMonth)) return res.status(400).json({ message: 'month must be in YYYY-MM format' });

        // If month is locked and distribution exists, do not overwrite
        if (req.user.salaryLockedMonth && req.user.salaryLockedMonth === targetMonth) {
            const existing = (req.user.distributionByMonth && (req.user.distributionByMonth.get ? req.user.distributionByMonth.get(targetMonth) : req.user.distributionByMonth[targetMonth]));
            if (existing) {
                return res.status(409).json({ message: `Salary distribution for ${targetMonth} is locked and cannot be overwritten` });
            }
        }

        // compute distribution with extraIncome considered
        const totalSalaryForMonth = salary + Number(extraIncome || 0);
        const distributed = computeDistribution(totalSalaryForMonth, splits, 0); // computeDistribution expects extraIncome separately; we already added here

        // persist
        const update = { $set: {} };
        update.$set[`distributionByMonth.${targetMonth}`] = distributed;
        // if distributing for current month, set top-level distribution as convenience
        if (targetMonth === (new Date().toISOString().slice(0, 7))) {
            update.$set.distribution = distributed;
        }
        await User.findByIdAndUpdate(req.user._id, update, { new: true });

        res.json({ salary: totalSalaryForMonth, distribution: distributed, month: targetMonth, preset });
    } catch (err) {
        console.error('simulate error', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// transactions (unchanged)
app.post('/api/transactions', authMiddleware, async (req, res) => {
    try {
        const { date, amount, bucket, category, notes } = req.body;
        const txn = { transactionId: new mongoose.Types.ObjectId().toString(), date: date || new Date().toISOString().slice(0, 10), amount, bucket, category, notes };
        await User.findByIdAndUpdate(req.user._id, { $push: { transactions: txn } }, { new: true, upsert: true });
        res.json({ ok: true, txn });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/transactions', authMiddleware, async (req, res) => {
    try {
        const qMonth = req.query.month;
        const user = await User.findById(req.user._id).lean();
        const txns = user.transactions || [];
        let filtered = txns;
        if (qMonth) {
            filtered = txns.filter(t => (t.date || '').startsWith(qMonth));
        }
        res.json({ transactions: filtered });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
