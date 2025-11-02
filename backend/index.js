// index.js (patched: trust-proxy, cookie domain support, token query fallback, CORS tweaks)
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const crypto = require('crypto');

const User = require('./models/User');
const Transaction = require('./models/Transaction');

const app = express();

// If behind a proxy (Render, Vercel, Heroku) allow express to trust X-Forwarded-* headers
// This is important so secure cookies behave correctly when served over HTTPS behind a proxy.
const {
    PORT = 4000,
    MONGODB_URI,
    JWT_SECRET,
    COOKIE_NAME = 'spewn_token',
    COOKIE_DOMAIN = "",
    FRONTEND_URL = 'http://localhost:3000', // set to https://spewn-app.vercel.app in Render env
    DEV_FRONTEND_URL = 'http://localhost:3000',
    NODE_ENV = 'development'
} = process.env;

if (NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

app.use(express.json());
app.use(cookieParser());
const allowedOrigins = [FRONTEND_URL, DEV_FRONTEND_URL].filter(Boolean);
console.log('allowedOrigins:', allowedOrigins);

const corsOptions = {
    origin: function (origin, callback) {
        // allow server-to-server / tools with no origin
        if (!origin) return callback(null, true);

        // exact-match check (no trailing slash, protocol+host must match)
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        // don't throw — return false so middleware continues but without CORS headers.
        // We still log so you can see blocked origins.
        console.warn('CORS blocked origin:', origin);
        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    optionsSuccessStatus: 204 // older browsers sometimes choke on 200
};

app.use(cors(corsOptions));

// Explicit preflight handler that always replies with proper headers for allowed origins
app.options('*', (req, res) => {
    // Let cors set the headers when origin is allowed
    cors(corsOptions)(req, res, () => res.sendStatus(204));
});

// Helpful explicit header for caches/proxies
app.use((req, res, next) => {
    res.header('Vary', 'Origin');
    next();
});
// DB connect (production expects MONGODB_URI)
async function connectDB() {
    try {
        if (MONGODB_URI) {
            console.log('Connecting to MongoDB...');
            await mongoose.connect(MONGODB_URI, {
                useNewUrlParser: true,
                useUnifiedTopology: true
            });
            console.log('✅ MongoDB connected via MONGODB_URI');
        } else {
            console.error('❌ No MONGODB_URI provided. Set it in environment variables.');
            process.exit(1);
        }
    } catch (err) {
        console.error('Mongo connection error', err);
        process.exit(1);
    }
}

connectDB();

// helpers
function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '70d' });
}

// authMiddleware now accepts cookie, Bearer token, or token passed via query (?token=)
async function authMiddleware(req, res, next) {
    try {
        // 1) check cookie first
        const cookieToken = req.cookies[COOKIE_NAME];
        if (cookieToken) {
            try {
                const decoded = jwt.verify(cookieToken, JWT_SECRET);
                const user = await User.findById(decoded.id);
                if (!user) return res.status(401).json({ message: 'Unauthorized' });
                req.user = user;
                req.authMethod = 'cookie';
                return next();
            } catch (err) {
                // cookie present but invalid/expired — continue to check bearer
                console.warn('Cookie token invalid:', err.message);
            }
        }

        // 2) fallback: Authorization: Bearer <token>
        const authHeader = (req.headers.authorization || '');
        if (authHeader.startsWith('Bearer ')) {
            const bearerToken = authHeader.slice(7);
            try {
                const decoded = jwt.verify(bearerToken, JWT_SECRET);
                const user = await User.findById(decoded.id);
                if (!user) return res.status(401).json({ message: 'Unauthorized' });
                req.user = user;
                req.authMethod = 'bearer';
                return next();
            } catch (err) {
                console.warn('Bearer token invalid:', err.message);
                return res.status(401).json({ message: 'Unauthorized' });
            }
        }

        // 3) fallback: token provided via query parameter (useful for mobile / deep links)
        if (req.query && req.query.token) {
            try {
                const decoded = jwt.verify(req.query.token, JWT_SECRET);
                const user = await User.findById(decoded.id);
                if (!user) return res.status(401).json({ message: 'Unauthorized' });
                req.user = user;
                req.authMethod = 'query';
                return next();
            } catch (err) {
                console.warn('Query token invalid:', err.message);
                return res.status(401).json({ message: 'Unauthorized' });
            }
        }

        // no token found
        return res.status(401).json({ message: 'Unauthorized' });
    } catch (err) {
        console.error('authMiddleware error:', err);
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

async function ensureMonthlyAutomation(userId) {
    const user = await User.findById(userId);
    if (!user) return;
    if (!user.automate) return;

    const currentMonth = new Date().toISOString().slice(0, 7);
    if (user.lastAutomatedMonth === currentMonth) return;

    const splits = user.splits || {};
    const salary = Number(user.salary || 0);
    const distributed = computeDistribution(salary, splits, 0);

    user.distribution = distributed;
    user.lastAutomatedMonth = currentMonth;
    await user.save();
}

// Cookie options helper
function buildCookieOptions({ rememberMe = false } = {}) {
    const base = {};
    if (COOKIE_DOMAIN) base.domain = COOKIE_DOMAIN;

    if (NODE_ENV === 'production') {
        // Production: allow cross-site cookies (frontend and backend on different domains)
        return Object.assign(base, {
            httpOnly: true,
            sameSite: 'none',   // required for cross-site cookies
            secure: true,       // must be true on HTTPS
            ...(rememberMe ? { maxAge: 1000 * 60 * 60 * 24 * 30 } : {})
        });
    } else {
        // Local dev: sameSite none + secure true will break cookies in many local setups
        return Object.assign(base, {
            httpOnly: true,
            sameSite: 'lax',
            secure: false,
            ...(rememberMe ? { maxAge: 1000 * 60 * 60 * 24 * 30 } : {})
        });
    }
}

// health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// debug route: inspect headers & cookies (useful to test mobile)
app.get('/debug/echo-headers', (req, res) => {
    res.json({
        headers: req.headers,
        cookies: req.cookies,
        origin: req.headers.origin || null,
        authHeader: req.headers.authorization || null,
        query: req.query || {}
    });
});

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
        const cookieOptions = buildCookieOptions({});
        res.cookie(COOKIE_NAME, token, cookieOptions);
        // respond with token as well (useful for mobile fallback)
        res.json({ ok: true, user: { id: user._id, email: user.email, token } });
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
        const cookieOptions = buildCookieOptions({ rememberMe });
        res.cookie(COOKIE_NAME, token, cookieOptions);

        // return token in JSON too — useful for mobile clients that can't rely on cookies
        res.json({ ok: true, user: { id: user._id, email: user.email, token } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, buildCookieOptions());
    res.json({ ok: true });
});

// get current user (auth + automation check)
app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        try {
            await ensureMonthlyAutomation(req.user._id);
        } catch (err) {
            console.warn('automation check failed', err);
        }

        const fresh = await User.findById(req.user._id).lean();
        if (!fresh) return res.status(401).json({ message: 'Unauthorized' });

        const {
            _id, email, name, salary, splits, distribution,
            preset, currency, subscribed, automate, activeTracking,
            salaryHistory, salaryLockedMonth, startMonth, onboardComplete, lastAutomatedMonth
        } = fresh;

        res.json({
            id: _id,
            email,
            name,
            salary,
            splits,
            distribution: distribution || null,
            preset: preset || null,
            currency,
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

// forgot/reset password
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

// profile update (handles startNewCycle)
app.put('/api/profile', authMiddleware, async (req, res) => {
    try {
        let {
            salary, salaryFrequency, splits, preset, automate, startMonth,
            startNewCycle, extraIncome
        } = req.body;

        const willActivateTracking = Boolean(automate) && Boolean(startNewCycle);
        const newSplits = splits ?? req.user.splits ?? {};

        // validate splits sum
        const sum = Object.values(newSplits || {}).reduce((a, b) => a + Number(b || 0), 0);
        if (sum !== 100) return res.status(400).json({ message: 'Splits must sum to 100' });

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

            const update = {
                $push: { salaryHistory: historyEntry },
                $set: {
                    salary: Number(salary || 0),
                    startMonth: startMonth || '',
                    salaryLockedMonth: startMonth || '',
                    splits: newSplits,
                    preset: preset || req.user.preset,
                    automate: typeof automate !== 'undefined' ? Boolean(automate) : req.user.automate,
                    activeTracking: willActivateTracking,
                    onboardComplete: true,
                    distribution: distributed
                },
            };

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
                activeTracking: Boolean(updated.activeTracking),
                onboardComplete: Boolean(updated.onboardComplete)
            });
        }

        // Normal update (no new cycle)
        const updateObj = {
            salary: Number(salary || req.user.salary || 0),
            salaryFrequency,
            splits: newSplits,
            preset: preset || req.user.preset,
            onboardComplete: true
        };
        if (typeof automate !== 'undefined') updateObj.automate = Boolean(automate);
        if (typeof startMonth !== 'undefined') updateObj.startMonth = startMonth || '';

        await User.findByIdAndUpdate(req.user._id, updateObj, { new: true });
        const updatedUser = await User.findById(req.user._id).lean();

        res.json({
            salary: updatedUser.salary,
            splits: updatedUser.splits,
            preset: updatedUser.preset,
            automate: Boolean(updatedUser.automate),
            startMonth: updatedUser.startMonth || '',
            subscribed: Boolean(updatedUser.subscribed),
            salaryHistory: updatedUser.salaryHistory || [],
            salaryLockedMonth: updatedUser.salaryLockedMonth || '',
            activeTracking: Boolean(updatedUser.activeTracking),
            onboardComplete: Boolean(updatedUser.onboardComplete)
        });

    } catch (err) {
        console.error('profile update error', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// simulate / distribute
app.post('/api/simulate-distribute', authMiddleware, async (req, res) => {
    try {
        const { salary: inputSalary, splits: inputSplits, preset: splitPreset, month, extraIncome } = req.body;
        const salary = Number(inputSalary ?? req.user.salary ?? 0);
        const splits = inputSplits || req.user.splits;
        const preset = splitPreset || req.user.preset;

        const sum = Object.values(splits).reduce((a, b) => a + Number(b || 0), 0);
        if (sum !== 100) return res.status(400).json({ message: 'Splits must sum to 100' });

        const targetMonth = month || req.user.startMonth || new Date().toISOString().slice(0, 7);
        if (!validateMonthFormat(targetMonth)) return res.status(400).json({ message: 'month must be in YYYY-MM format' });

        if (req.user.salaryLockedMonth && req.user.salaryLockedMonth === targetMonth) {
            return res.status(409).json({ message: `Salary distribution for ${targetMonth} is locked and cannot be overwritten` });
        }

        const totalSalaryForMonth = salary + Number(extraIncome || 0);
        const distributed = computeDistribution(totalSalaryForMonth, splits, 0);

        const update = { $set: { distribution: distributed } };
        await User.findByIdAndUpdate(req.user._id, update, { new: true });

        res.json({ salary: totalSalaryForMonth, distribution: distributed, month: targetMonth, preset });
    } catch (err) {
        console.error('simulate error', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/transactions
app.get("/api/transactions", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const limitParam = parseInt(req.query.limit, 10);
        const limit = Number.isNaN(limitParam) ? 5 : limitParam;

        const query = { userId };
        let txns;
        if (limit === 0) {
            txns = await Transaction.find(query).sort({ createdAt: -1 }).lean();
        } else {
            txns = await Transaction.find(query).sort({ createdAt: -1 }).limit(limit).lean();
        }

        return res.json({ transactions: txns });
    } catch (err) {
        console.error("GET /api/transactions failed:", err);
        return res.status(500).json({ error: "Failed to fetch transactions" });
    }
});

// POST /api/transactions
app.post('/api/transactions', authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const { bucket, category, amount } = req.body;
        const amt = Number(amount || 0);
        if (!bucket || !amt || amt <= 0) return res.status(400).json({ error: 'Invalid payload' });

        const txn = await Transaction.create({ userId: user._id, bucket, category, amount: amt });

        const u = await User.findById(user._id);
        if (u) {
            const dist = (u.distribution && typeof u.distribution === 'object') ? u.distribution : null;
            if (dist && dist[bucket] !== undefined) {
                const prev = Number(dist[bucket] || 0);
                const next = Math.max(0, prev - amt);
                u.distribution = Object.assign({}, dist, { [bucket]: next });
                await u.save();
            }
        }

        const txns = await Transaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(5).lean();
        return res.json({ transaction: txn, transactions: txns });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/transactions/:id
app.delete("/api/transactions/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid transaction ID" });
        }

        const txn = await Transaction.findOne({ _id: id, userId });
        if (!txn) {
            return res.status(404).json({ error: "Transaction not found or unauthorized" });
        }

        await txn.deleteOne();

        return res.status(200).json({ message: "Transaction deleted successfully" });
    } catch (err) {
        console.error("DELETE /api/transactions/:id failed:", err);
        return res.status(500).json({ error: "Server error while deleting transaction" });
    }
});

// change password
app.post("/api/auth/change-password", authMiddleware, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) return res.status(400).json({ message: "currentPassword and newPassword required" });
        const user = await User.findById(req.user._id);
        const ok = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!ok) return res.status(400).json({ message: "Current password is incorrect" });
        const hash = await bcrypt.hash(newPassword, 10);
        user.passwordHash = hash;
        await user.save();
        res.json({ ok: true });
    } catch (err) {
        console.error("change-password error", err);
        res.status(500).json({ message: "Server error" });
    }
});

app.listen(PORT, () => console.log(`Backend running on port ${PORT} (NODE_ENV=${NODE_ENV})`));
