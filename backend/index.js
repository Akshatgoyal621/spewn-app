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
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
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

// health
app.get('/api/health', (req, res) => res.json({ ok: true }));

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

// Login with rememberMe support
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ message: 'Invalid credentials' });

    const token = signToken({ id: user._id });

    // If rememberMe is true, set a longer cookie (30 days). Otherwise session-ish (7d token, session cookie).
    const cookieOptions = {
      httpOnly: true,
      sameSite: 'lax',
      secure: NODE_ENV === 'production',
      // maxAge only when rememberMe
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

// get current user
app.get('/api/auth/me', authMiddleware, (req, res) => {
  // include distribution and preset so frontend has everything it needs
  const { _id, email, name, salary, splits, distribution, currency, preset } = req.user;
  res.json({
    id: _id,
    email,
    name,
    salary,
    splits,
    distribution: distribution || null,
    preset: preset || null,
    currency
  });
});

// --- Forgot password: create token and (dev) print to server console ---
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(200).json({ message: 'If account exists, we will send reset instructions' }); // don't reveal existence

    // create a token
    const token = crypto.randomBytes(20).toString('hex');
    const expires = Date.now() + 1000 * 60 * 60; // 1 hour
    await User.findByIdAndUpdate(user._id, { resetToken: token, resetTokenExpires: new Date(expires) });

    // DEV: print token to server console for testing. Hook email provider here in prod.
    console.log(`PASSWORD RESET TOKEN for ${email}: ${token} (expires in 1 hour)`);

    res.json({ ok: true, message: 'Reset token created (dev: printed to server console)' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reset password using token
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
  Google OAuth scaffold:
  - To enable, set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env
  - Configure Google OAuth consent screen and add redirect URI:
      http://localhost:4000/api/auth/google/callback
  - This code exchanges code for tokens and finds/creates user by email.
*/
const qs = (obj) => Object.keys(obj).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`).join('&');

app.get('/api/auth/google', (req, res) => {
  const { GOOGLE_CLIENT_ID, FRONTEND_URL } = process.env;
  if (!GOOGLE_CLIENT_ID) return res.status(501).json({ message: 'Google auth not configured on server' });
  const redirectUri = `https://accounts.google.com/o/oauth2/v2/auth?${qs({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${process.env.FRONTEND_URL || FRONTEND_URL}/api/auth/google/callback`, // not used here, callback route below
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account'
  })}`;
  // In practice you'd redirect to Google. For clarity, redirect to callback step.
  // We'll redirect to Google:
  res.redirect(redirectUri);
});

// NOTE: For local development we implement a callback route that expects Google to redirect to it.
// To run this you MUST set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and set redirect URI in Google Console.
app.get('/api/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return res.status(501).send('Google OAuth not configured');
  try {
    // exchange code for tokens
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', qs({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: `http://localhost:4000/api/auth/google/callback`,
      grant_type: 'authorization_code'
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const id_token = tokenRes.data.id_token;
    // decode id_token payload (simple)
    const base64Url = id_token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
    const email = decoded.email;
    const name = decoded.name || decoded.email.split('@')[0];

    // find or create user
    let user = await User.findOne({ email });
    if (!user) {
      const dummyPass = crypto.randomBytes(12).toString('hex');
      const passwordHash = await bcrypt.hash(dummyPass, 10);
      user = await User.create({ email, name, passwordHash });
    }
    const token = signToken({ id: user._id });
    const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: NODE_ENV === 'production' };
    res.cookie(COOKIE_NAME, token, cookieOptions);
    // redirect to frontend
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:3000');
  } catch (err) {
    console.error('Google callback failed', err.response?.data || err.message || err);
    res.status(500).send('Google auth failed');
  }
});


// profile update
app.put('/api/profile', authMiddleware, async (req, res) => {
  try {
    const { salary, salaryFrequency, splits, preset } = req.body; // <-- use `preset`
    console.log(req.body, "PROFILE_DEBUG");

    // validate splits sum
    const sum = Object.values(splits || req.user.splits || {}).reduce((a, b) => a + Number(b || 0), 0);
    if (sum !== 100) return res.status(400).json({ message: 'Splits must sum to 100' });

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { salary, salaryFrequency, splits, preset }, // persist as `preset`
      { new: true }
    ).lean();

    res.json({ salary: updated.salary, splits: updated.splits, preset: updated.preset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// simulate / distribute (Mongoose version)
app.post('/api/simulate-distribute', authMiddleware, async (req, res) => {
  try {
    const { salary: inputSalary, splits: inputSplits, preset: splitPreset } = req.body;
    const salary = Number(inputSalary ?? req.user.salary ?? 0);
    const splits = inputSplits || req.user.splits;
    const preset = splitPreset || req.user.preset;

    // validate
    const sum = Object.values(splits).reduce((a, b) => a + Number(b || 0), 0);
    if (sum !== 100) return res.status(400).json({ message: 'Splits must sum to 100' });

    // compute distribution (rounded)
    const distributed = {};
    Object.keys(splits).forEach(k => {
      distributed[k] = Math.round((salary * Number(splits[k])) / 100);
    });

    // persist to user document
    // Assumes you have a Mongoose User model imported as `User`
    // and that authMiddleware sets req.user._id (or req.user.id)
    const userId = req.user._id || req.user.id || req.user.userId;
    if (!userId) {
      console.warn('simulate-distribute: no user id on req.user, skipping persist');
    } else {
      // update fields: splits, distribution, preset, salary (if desired)
      await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            splits,
            distribution: distributed,
            preset,
            salary
          }
        },
        { new: true } // optional: return the updated doc if you want
      );
    }

    // don't forget: respond with computed distribution
    res.json({ salary, distribution: distributed, preset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});


// basic transactions model stored inside user (simple MVP)
app.post('/api/transactions', authMiddleware, async (req, res) => {
  try {
    const { date, amount, bucket, category, notes } = req.body;
    // simple transactions array on user doc (small-scale)
    const txn = { transactionId: new mongoose.Types.ObjectId().toString(), date: date || new Date().toISOString().slice(0,10), amount, bucket, category, notes };
    await User.findByIdAndUpdate(req.user._id, { $push: { transactions: txn } }, { new: true, upsert: true });
    res.json({ ok: true, txn });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// get transactions
app.get('/api/transactions', authMiddleware, async (req, res) => {
  try {
    const qMonth = req.query.month; // "2025-10"
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
