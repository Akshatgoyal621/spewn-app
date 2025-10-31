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

const User = require('./models/User');
const Transaction = require('./models/Transaction');

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
            await mongoose.connect(MONGODB_URI);
            console.log('MongoDB connected via MONGODB_URI');
        } else {
            // In-memory fallback for dev convenience
            const mongod = await MongoMemoryServer.create();
            const uri = mongod.getUri();
            await mongoose.connect(uri);
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
        // load full user document (not lean) so that later updates can be done if needed
        const user = await User.findById(decoded.id);
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

// Helper: ensure user's automation for the month (runs once per month when needed)
// Simplified: no distributionByMonth structure, only update top-level distribution and lastAutomatedMonth
async function ensureMonthlyAutomation(userId) {
    const user = await User.findById(userId);
    if (!user) return;
    if (!user.automate) return; // nothing to do

    const currentMonth = new Date().toISOString().slice(0, 7);
    if (user.lastAutomatedMonth === currentMonth) return; // already ran

    // compute distribution for current month from salary + splits
    const splits = user.splits || {};
    const salary = Number(user.salary || 0);
    const distributed = computeDistribution(salary, splits, 0);

    user.distribution = distributed;
    user.lastAutomatedMonth = currentMonth;
    await user.save();
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

// get current user (auth + automation check)
// this route returns only fields frontend needs; distribution stays top-level only
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

// forgot/reset password (unchanged)
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
// Simplified: removed distributionByMonth handling; on startNewCycle we set top-level distribution for the given startMonth
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
                    distribution: distributed // set top-level distribution for the active month
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

// simulate / distribute (simplified)
// Note: no distributionByMonth; persisting top-level distribution if month is current
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
            // since we don't keep distributionByMonth, check top-level distribution lock only
            return res.status(409).json({ message: `Salary distribution for ${targetMonth} is locked and cannot be overwritten` });
        }

        const totalSalaryForMonth = salary + Number(extraIncome || 0);
        const distributed = computeDistribution(totalSalaryForMonth, splits, 0);

        const update = { $set: { distribution: distributed } };
        // convenience: if month is current month, set distribution (we already do)
        await User.findByIdAndUpdate(req.user._id, update, { new: true });

        res.json({ salary: totalSalaryForMonth, distribution: distributed, month: targetMonth, preset });
    } catch (err) {
        console.error('simulate error', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/transactions -> return latest 5 for current user (newest first)
app.get("/api/transactions", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        // parse limit; 0 or missing => return all
        const limitParam = parseInt(req.query.limit, 10);
        const limit = Number.isNaN(limitParam) ? 5 : limitParam; // default to 5 for backward compatibility

        // if limit === 0, return all transactions for this user
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

// POST /api/transactions -> add txn, deduct from distribution (if exists) and return created txn
app.post('/api/transactions', authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const { bucket, category, amount } = req.body;
        const amt = Number(amount || 0);
        if (!bucket || !amt || amt <= 0) return res.status(400).json({ error: 'Invalid payload' });

        const txn = await Transaction.create({ userId: user._id, bucket, category, amount: amt });

        // Update user's distribution if present (deduct amount from that bucket)
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
        const userId = req.user.id; // from JWT via authMiddleware

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


app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
