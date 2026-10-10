const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const config = require('./config');
const db = require('./db');

// Ensure upload directory exists
fs.mkdirSync(config.uploadDir, { recursive: true });

const upload = multer({
  dest: config.uploadDir,
  limits: { fileSize: config.maxUploadSize },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (config.allowedFileExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed. Supported: ${config.allowedFileExts.join(', ')}`));
    }
  }
});

const app = express();
app.use(express.json());

// Async handler wrapper
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// User serialization
const pub = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  xp: u.xp || 0,
  coins: u.coins || 0,
  lives: u.lives !== undefined ? u.lives : 3,
  streak: u.streak || 0,
  level: Math.floor((u.xp || 0) / 150) + 1,
  avatar: u.avatar || 'warrior',
  bio: u.bio || '',
  department: u.department || 'Computer Science & Engineering',
  sound_enabled: Boolean(u.sound_enabled ?? 1),
  crt_enabled: Boolean(u.crt_enabled ?? 0),
  created: u.created
});

const sign = (u) => jwt.sign({ id: u.id, role: u.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

// Auth middlewares
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || '');
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

const need = (role) => (req, res, next) => {
  if (req.user && req.user.role === role) return next();
  res.status(403).json({ error: 'Forbidden' });
};

function touchStreak(u) {
  const today = new Date().toISOString().slice(0, 10);
  if (u.last_active === today) return;
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const newStreak = u.last_active === yesterday ? (u.streak || 0) + 1 : 1;
  db.prepare('UPDATE users SET streak=?, last_active=? WHERE id=?').run(newStreak, today, u.id);
}

// ==========================================
// 1. AUTHENTICATION & PROFILES (Phase 1)
// ==========================================

app.post('/api/auth/register', A((req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Full name is required' });
  }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email address is required' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const cleanEmail = email.toLowerCase().trim();
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(cleanEmail)) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  const assignedRole = role === 'faculty' ? 'faculty' : 'student';
  const hashed = bcrypt.hashSync(password, 10);
  const r = db.prepare('INSERT INTO users(name, email, pw, role) VALUES(?,?,?,?)').run(name.trim(), cleanEmail, hashed, assignedRole);
  const newUser = db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
  touchStreak(newUser);
  res.json({ token: sign(newUser), user: pub(db.prepare('SELECT * FROM users WHERE id=?').get(newUser.id)) });
}));

app.post('/api/auth/login', A((req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(String(email).toLowerCase().trim());
  if (!user || !bcrypt.compareSync(String(password), user.pw)) {
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  touchStreak(user);
  res.json({ token: sign(user), user: pub(db.prepare('SELECT * FROM users WHERE id=?').get(user.id)) });
}));

app.get('/api/me', auth, (req, res) => {
  res.json(pub(req.user));
});

app.patch('/api/me', auth, A((req, res) => {
  const { name, avatar, bio, department, sound_enabled, crt_enabled } = req.body || {};
  const updates = [];
  const params = [];

  if (name && typeof name === 'string') {
    updates.push('name = ?');
    params.push(name.trim());
  }
  if (avatar !== undefined) {
    updates.push('avatar = ?');
    params.push(String(avatar));
  }
  if (bio !== undefined) {
    updates.push('bio = ?');
    params.push(String(bio));
  }
  if (department !== undefined) {
    updates.push('department = ?');
    params.push(String(department));
  }
  if (sound_enabled !== undefined) {
    updates.push('sound_enabled = ?');
    params.push(sound_enabled ? 1 : 0);
  }
  if (crt_enabled !== undefined) {
    updates.push('crt_enabled = ?');
    params.push(crt_enabled ? 1 : 0);
  }

  if (updates.length > 0) {
    params.push(req.user.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  const updatedUser = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  res.json({ ok: true, user: pub(updatedUser) });
}));

app.post('/api/me/password', auth, A((req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  if (!bcrypt.compareSync(currentPassword, req.user.pw)) {
    return res.status(401).json({ error: 'Current password incorrect' });
  }
  const hashed = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET pw = ? WHERE id = ?').run(hashed, req.user.id);
  res.json({ ok: true, message: 'Password updated successfully' });
}));

// ==========================================
// 2. WORLDS & LEVELS (Phase 3 & Gameplay)
// ==========================================

app.get('/api/worlds', auth, (req, res) => {
  const done = db.prepare('SELECT level_id FROM progress WHERE user_id=? AND done_at IS NOT NULL').all(req.user.id).map(r => r.level_id);
  res.json(db.prepare('SELECT * FROM worlds ORDER BY ord').all().map(w => {
    const lv = db.prepare('SELECT id,num,title,kind,xp,coins FROM levels WHERE world_id=? ORDER BY num').all(w.id).map(l => ({ ...l, done: done.includes(l.id) }));
    return { ...w, unlocked: req.user.xp >= w.unlocked_by, levels: lv };
  }));
});

function validate(level, a) {
  let c;
  try { c = JSON.parse(level.config); } catch (e) { c = {}; }
  switch (level.kind) {
    case 'loop':
      return Number.isInteger(a.count) && a.count >= c.needed && a.count <= c.max;
    case 'variable':
      return String(a.type || a.answer || '').trim().toLowerCase() === String(c.answer).trim().toLowerCase();
    case 'condition':
      return a.value === (c.age >= c.threshold);
    case 'route':
      return JSON.stringify(a.path) === JSON.stringify(c.path);
    case 'stack':
      return String(a.answer || '').trim().toUpperCase() === String(c.answer).trim().toUpperCase();
    case 'sql':
      return String(a.query || a.answer || '').trim().toUpperCase().includes(String(c.answer).trim().toUpperCase());
    case 'scheduling':
      return String(a.answer || '').trim().toLowerCase() === String(c.answer).trim().toLowerCase();
    default:
      return false;
  }
}

function award(uid) {
  const g = (id) => db.prepare('INSERT OR IGNORE INTO user_ach(user_id,ach_id) VALUES(?,?)').run(uid, id).changes ? id : null;
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(uid);
  const got = [];
  const n = db.prepare('SELECT COUNT(*) c FROM progress WHERE user_id=? AND done_at IS NOT NULL').get(uid).c;
  if (n >= 1) got.push(g('first_level'));
  const py = db.prepare("SELECT COUNT(*) t, SUM(p.done_at IS NOT NULL) d FROM levels l LEFT JOIN progress p ON p.level_id=l.id AND p.user_id=? WHERE l.world_id='py'").get(uid);
  if (py.t && py.d === py.t) got.push(g('loop_master'));
  if (db.prepare("SELECT 1 FROM progress p JOIN levels l ON l.id=p.level_id WHERE p.user_id=? AND l.world_id='nf' AND p.done_at IS NOT NULL").get(uid)) got.push(g('net_nav'));
  if (u.streak >= 7) got.push(g('streak7'));
  if (u.coins >= 200) got.push(g('rich'));
  return got.filter(Boolean).map(id => db.prepare('SELECT * FROM achievements WHERE id=?').get(id));
}

app.post('/api/levels/:id/submit', auth, need('student'), A((req, res) => {
  const lv = db.prepare('SELECT l.*, w.unlocked_by FROM levels l JOIN worlds w ON w.id=l.world_id WHERE l.id=?').get(req.params.id);
  if (!lv) return res.status(404).json({ error: 'Level not found' });
  if (req.user.xp < lv.unlocked_by) return res.status(403).json({ error: 'World locked' });

  // Optional strict prerequisite check if requested
  if (req.body?.enforcePrereq && lv.num > 1) {
    const prev = db.prepare('SELECT p.done_at FROM levels l LEFT JOIN progress p ON p.level_id = l.id AND p.user_id = ? WHERE l.world_id = ? AND l.num = ?')
      .get(req.user.id, lv.world_id, lv.num - 1);
    if (!prev || !prev.done_at) {
      return res.status(403).json({ error: `Prerequisite Level ${lv.num - 1} not completed` });
    }
  }

  db.prepare('INSERT OR IGNORE INTO progress(user_id,level_id) VALUES(?,?)').run(req.user.id, lv.id);
  db.prepare('UPDATE progress SET attempts=attempts+1 WHERE user_id=? AND level_id=?').run(req.user.id, lv.id);
  const p = db.prepare('SELECT * FROM progress WHERE user_id=? AND level_id=?').get(req.user.id, lv.id);

  if (!validate(lv, req.body || {})) {
    db.prepare('UPDATE users SET lives=MAX(lives-1,0) WHERE id=?').run(req.user.id);
    return res.json({ correct: false, user: pub(db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)) });
  }

  const first = !p.done_at;
  const stars = p.attempts <= 1 ? 3 : p.attempts <= 3 ? 2 : 1;

  // Execute progress & rewards atomically inside transaction (prevents duplicate rewards)
  db.transaction(() => {
    db.prepare("UPDATE progress SET done_at=COALESCE(done_at,CURRENT_TIMESTAMP), stars=MAX(stars,?) WHERE user_id=? AND level_id=?").run(stars, req.user.id, lv.id);
    if (first) {
      db.prepare('UPDATE users SET xp=xp+?, coins=coins+?, lives=3 WHERE id=?').run(lv.xp, lv.coins, req.user.id);
    }
  })();

  const nu = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  res.json({ correct: true, first, stars, xpGained: first ? lv.xp : 0, newAchievements: award(req.user.id), user: pub(nu) });
}));

app.get('/api/achievements', auth, (req, res) => {
  res.json(db.prepare('SELECT a.*, u.at unlockedAt FROM achievements a LEFT JOIN user_ach u ON u.ach_id=a.id AND u.user_id=?').all(req.user.id));
});

app.get('/api/leaderboard', auth, (req, res) => {
  const students = db.prepare("SELECT id, name, xp, streak, avatar FROM users WHERE role='student' ORDER BY xp DESC LIMIT 20").all();
  res.json(students.map((u, i) => ({
    id: u.id,
    name: u.name,
    avatar: u.avatar || 'warrior',
    xp: u.xp,
    streak: u.streak,
    level: Math.floor((u.xp || 0) / 150) + 1,
    rank: i + 1,
    you: u.id === req.user.id
  })));
});

// ==========================================
// BATTLE CARDS & DECK MANAGEMENT (Phase 3)
// ==========================================

app.get('/api/cards', auth, (req, res) => {
  const lvl = Math.floor(req.user.xp / 150) + 1;
  const cards = db.prepare('SELECT * FROM cards ORDER BY deck, energy').all();
  const equippedIds = db.prepare('SELECT card_id FROM user_decks WHERE user_id = ? AND in_deck = 1')
    .all(req.user.id).map(r => r.card_id);
  res.json(cards.map(c => ({
    ...c,
    owned: c.unlock_level <= lvl,
    equipped: equippedIds.includes(c.id)
  })));
});

app.get('/api/cards/deck', auth, need('student'), (req, res) => {
  const lvl = Math.floor(req.user.xp / 150) + 1;
  const equipped = db.prepare(`
    SELECT c.* FROM cards c
    JOIN user_decks ud ON ud.card_id = c.id
    WHERE ud.user_id = ? AND ud.in_deck = 1
  `).all(req.user.id);
  if (equipped.length === 0) {
    const defaultDeck = db.prepare('SELECT * FROM cards WHERE unlock_level <= ? ORDER BY energy ASC LIMIT 5').all(lvl);
    return res.json(defaultDeck);
  }
  res.json(equipped);
});

app.put('/api/cards/deck', auth, need('student'), A((req, res) => {
  const { cardIds } = req.body || {};
  if (!Array.isArray(cardIds) || cardIds.length === 0 || cardIds.length > 5) {
    return res.status(400).json({ error: 'Deck must contain between 1 and 5 cards' });
  }
  const lvl = Math.floor(req.user.xp / 150) + 1;
  for (const id of cardIds) {
    const c = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
    if (!c || c.unlock_level > lvl) {
      return res.status(403).json({ error: `Card #${id} is locked or does not exist` });
    }
  }
  db.transaction(() => {
    db.prepare('DELETE FROM user_decks WHERE user_id = ?').run(req.user.id);
    const ins = db.prepare('INSERT INTO user_decks (user_id, card_id, in_deck) VALUES (?, ?, 1)');
    for (const id of cardIds) ins.run(req.user.id, id);
  })();
  const updatedDeck = db.prepare('SELECT c.* FROM cards c JOIN user_decks ud ON ud.card_id = c.id WHERE ud.user_id = ?').all(req.user.id);
  res.json({ ok: true, deck: updatedDeck });
}));

app.post('/api/battle/simulate', auth, need('student'), A((req, res) => {
  const lvl = Math.floor(req.user.xp / 150) + 1;
  let deck = db.prepare(`
    SELECT c.* FROM cards c
    JOIN user_decks ud ON ud.card_id = c.id
    WHERE ud.user_id = ? AND ud.in_deck = 1
  `).all(req.user.id);
  if (deck.length === 0) {
    deck = db.prepare('SELECT * FROM cards WHERE unlock_level <= ? ORDER BY energy ASC LIMIT 4').all(lvl);
  }

  // Boss stats
  const boss = { name: 'Bug-Monster Rex', hp: 45, atk: 10, def: 6 };
  let playerHp = 30 + lvl * 5;
  const combatLog = [];
  let round = 1;

  combatLog.push(`⚔️ Duel Commenced: Student vs ${boss.name}!`);

  for (const card of deck) {
    combatLog.push(`Round ${round}: Student plays [${card.name}] (${card.ability})!`);
    const dmgToBoss = Math.max(1, card.atk - boss.def);
    boss.hp -= dmgToBoss;
    combatLog.push(`-> ${card.name} deals ${dmgToBoss} DMG to ${boss.name} (Boss HP: ${Math.max(0, boss.hp)})`);

    if (boss.hp <= 0) break;

    const dmgToPlayer = Math.max(1, boss.atk - card.def);
    playerHp -= dmgToPlayer;
    combatLog.push(`<- ${boss.name} counters for ${dmgToPlayer} DMG (Player HP: ${Math.max(0, playerHp)})`);

    if (playerHp <= 0) break;
    round++;
  }

  const victory = boss.hp <= 0 && playerHp > 0;
  let xpReward = 0;
  let coinsReward = 0;

  if (victory) {
    xpReward = 35;
    coinsReward = 15;
    combatLog.push(`🎉 VICTORY! ${boss.name} was defeated. You gained ${xpReward} XP and ${coinsReward} coins!`);
    db.prepare('UPDATE users SET xp = xp + ?, coins = coins + ? WHERE id = ?').run(xpReward, coinsReward, req.user.id);
  } else {
    combatLog.push(`💀 Defeat! Upgrade your battle deck and try again.`);
  }

  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({
    victory,
    combatLog,
    bossHpRemaining: Math.max(0, boss.hp),
    playerHpRemaining: Math.max(0, playerHp),
    xpGained: xpReward,
    coinsGained: coinsReward,
    user: pub(updatedUser)
  });
}));

// ==========================================
// ASSESSMENTS & QUESTION BANKS (Phase 4)
// ==========================================

app.get('/api/assessments', auth, (req, res) => {
  const banks = db.prepare(`
    SELECT qb.*, 
      (SELECT COUNT(*) FROM questions q WHERE q.bank_id = qb.id) as questionCount,
      (SELECT MAX(score) FROM assessment_attempts a WHERE a.bank_id = qb.id AND a.user_id = ?) as highestScore,
      (SELECT MAX(passed) FROM assessment_attempts a WHERE a.bank_id = qb.id AND a.user_id = ?) as passed
    FROM question_banks qb
    ORDER BY qb.created DESC
  `).all(req.user.id, req.user.id);
  res.json(banks);
});

app.get('/api/assessments/:id', auth, (req, res) => {
  const bank = db.prepare('SELECT * FROM question_banks WHERE id = ?').get(req.params.id);
  if (!bank) return res.status(404).json({ error: 'Assessment not found' });

  // Security: Do NOT send correct_answer or explanation to client before submission!
  const questions = db.prepare('SELECT id, prompt, options_json, difficulty, points FROM questions WHERE bank_id = ?').all(bank.id);
  const sanitizedQuestions = questions.map(q => ({
    id: q.id,
    prompt: q.prompt,
    options: JSON.parse(q.options_json),
    difficulty: q.difficulty,
    points: q.points
  }));

  res.json({ ...bank, questions: sanitizedQuestions });
});

app.post('/api/assessments/:id/submit', auth, need('student'), A((req, res) => {
  const bank = db.prepare('SELECT * FROM question_banks WHERE id = ?').get(req.params.id);
  if (!bank) return res.status(404).json({ error: 'Assessment not found' });

  const { answers = {} } = req.body || {};
  const questions = db.prepare('SELECT * FROM questions WHERE bank_id = ?').all(bank.id);
  if (questions.length === 0) return res.status(400).json({ error: 'Assessment has no questions' });

  let score = 0;
  let totalPoints = 0;
  const review = [];

  for (const q of questions) {
    totalPoints += q.points;
    const studentAns = String(answers[q.id] || '').trim();
    const isCorrect = studentAns === q.correct_answer.trim();
    if (isCorrect) {
      score += q.points;
    }
    review.push({
      questionId: q.id,
      prompt: q.prompt,
      studentAnswer: studentAns,
      correctAnswer: q.correct_answer,
      explanation: q.explanation,
      pointsAwarded: isCorrect ? q.points : 0
    });
  }

  const percentage = Math.round((score / totalPoints) * 100);
  const passed = percentage >= 60 ? 1 : 0;
  const xpAward = passed ? Math.round(score * 1.5) : 10;
  const coinsAward = passed ? 20 : 5;

  db.transaction(() => {
    db.prepare('INSERT INTO assessment_attempts (user_id, bank_id, score, total, passed, answers_json) VALUES (?,?,?,?,?,?)')
      .run(req.user.id, bank.id, score, totalPoints, passed, JSON.stringify(answers));

    db.prepare('UPDATE users SET xp = xp + ?, coins = coins + ? WHERE id = ?')
      .run(xpAward, coinsAward, req.user.id);

    if (percentage === 100) {
      db.prepare('INSERT OR IGNORE INTO user_ach (user_id, ach_id) VALUES (?, ?)').run(req.user.id, 'quiz_ace');
    }
  })();

  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({
    score,
    totalPoints,
    percentage,
    passed: Boolean(passed),
    xpGained: xpAward,
    coinsGained: coinsAward,
    review,
    user: pub(updatedUser)
  });
}));

app.post('/api/assessments', auth, need('faculty'), A((req, res) => {
  const { title, course_id, unit, topic, description, questions = [] } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });

  let bankId;
  db.transaction(() => {
    const r = db.prepare('INSERT INTO question_banks (faculty_id, course_id, unit, topic, title, description) VALUES (?,?,?,?,?,?)')
      .run(req.user.id, course_id, unit, topic, title.trim(), description);
    bankId = r.lastInsertRowid;

    if (Array.isArray(questions)) {
      const ins = db.prepare('INSERT INTO questions (bank_id, prompt, options_json, correct_answer, explanation, difficulty, points) VALUES (?,?,?,?,?,?,?)');
      for (const q of questions) {
        if (q.prompt && q.options && q.correctAnswer) {
          ins.run(bankId, q.prompt, JSON.stringify(q.options), q.correctAnswer, q.explanation || '', q.difficulty || 'Medium', q.points || 10);
        }
      }
    }
  })();

  res.json({ ok: true, id: bankId, title });
}));

// ==========================================
// PRAGYA AI MENTOR (Phase 5)
// ==========================================

const TIPS = {
  explain: 'A loop repeats code while its condition stays TRUE. When it turns FALSE, the loop ends.',
  hint: 'range(5) yields 0,1,2,3,4 — five repeats. Count the gap: how many platforms must the loop build?',
  wrong: 'Common slip: off-by-one. range(n) stops BEFORE n, yet runs n times.',
  practice: 'Practice: print the even numbers from 0 to 10 using a for loop and range().',
  exam: 'Exam plan: variables → conditions → loops → functions. Revise 20 minutes daily and review your wrong answers.'
};

const mentorRateMap = new Map();
function checkMentorRate(userId) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxReqs = 20; // 20 requests per minute
  const history = mentorRateMap.get(userId) || [];
  const recent = history.filter(ts => now - ts < windowMs);
  if (recent.length >= maxReqs) return false;
  recent.push(now);
  mentorRateMap.set(userId, recent);
  return true;
}

app.post('/api/mentor', auth, A(async (req, res) => {
  const { action = 'hint', question = '' } = req.body || {};

  if (!checkMentorRate(req.user.id)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment before consulting Pragya again.' });
  }

  let reply = TIPS[action] || TIPS.hint;
  let provider = 'builtin';

  if (config.anthropicApiKey) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.anthropicApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: config.claudeModel,
          max_tokens: 300,
          system: 'You are Pragya, a friendly 16-bit RPG game companion teaching Computer Science to students. Reply in 2-3 short, encouraging sentences. Give conceptual hints, never full answers to puzzle levels.',
          messages: [{ role: 'user', content: `Action: ${action}. Question: ${String(question).slice(0, 500)}` }]
        })
      });
      const d = await r.json();
      const t = d.content?.[0]?.text;
      if (t) {
        reply = t;
        provider = 'claude';
      }
    } catch (e) {
      // Graceful fallback to built-in rules
    }
  }

  // Usage & audit logging
  try {
    db.prepare('INSERT INTO ai_logs (user_id, action, prompt, reply, provider) VALUES (?,?,?,?,?)')
      .run(req.user.id, action, question || '', reply, provider);
  } catch (e) {}

  res.json({ reply, source: provider });
}));

// ==========================================
// 4. COURSES & ENROLLMENTS (Phase 2)
// ==========================================

app.get('/api/courses', auth, (req, res) => {
  const courses = db.prepare(`
    SELECT c.*, 
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) as studentsCount,
      (SELECT COUNT(*) FROM resources r WHERE r.course = c.title AND r.status = 'published') as resourcesCount,
      EXISTS(SELECT 1 FROM enrollments e WHERE e.course_id = c.id AND e.user_id = ?) as isEnrolled
    FROM courses c
    ORDER BY c.created ASC
  `).all(req.user.id);
  res.json(courses);
});

app.get('/api/courses/:id', auth, (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  const isEnrolled = Boolean(db.prepare('SELECT 1 FROM enrollments WHERE course_id = ? AND user_id = ?').get(course.id, req.user.id));
  const resources = db.prepare("SELECT id, kind, unit, topic, title, descr, difficulty FROM resources WHERE course = ? AND status = 'published'").all(course.title);
  res.json({ ...course, isEnrolled, resources });
});

app.post('/api/courses/:id/enroll', auth, need('student'), A((req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?, ?)').run(req.user.id, course.id);
  res.json({ ok: true, message: `Enrolled in ${course.title}` });
}));

app.get('/api/my-courses', auth, need('student'), (req, res) => {
  const enrolled = db.prepare(`
    SELECT c.*, e.enrolled_at 
    FROM courses c 
    JOIN enrollments e ON e.course_id = c.id 
    WHERE e.user_id = ?
    ORDER BY e.enrolled_at DESC
  `).all(req.user.id);
  res.json(enrolled);
});

app.post('/api/courses', auth, need('faculty'), A((req, res) => {
  const { code, title, description, icon } = req.body || {};
  if (!code || !title) return res.status(400).json({ error: 'Course code and title are required' });
  const id = 'cs-' + code.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (db.prepare('SELECT 1 FROM courses WHERE id = ? OR code = ?').get(id, code)) {
    return res.status(409).json({ error: 'Course code already exists' });
  }
  db.prepare('INSERT INTO courses (id, code, title, description, icon, faculty_id) VALUES (?,?,?,?,?,?)')
    .run(id, code.toUpperCase(), title.trim(), description || '', icon || '📘', req.user.id);
  res.json(db.prepare('SELECT * FROM courses WHERE id = ?').get(id));
}));

// ==========================================
// 5. KNOWLEDGE VAULT & STUDIO (Phase 2)
// ==========================================

app.get('/api/vault', auth, (req, res) => {
  const kinds = String(req.query.kind || '').split(',').filter(Boolean);
  const course = req.query.course ? req.query.course.trim() : null;
  const difficulty = req.query.difficulty ? req.query.difficulty.trim() : null;
  const search = req.query.q ? `%${req.query.q.trim()}%` : null;

  let sql = "SELECT r.id, kind, course, unit, topic, title, descr, tags, difficulty, orig_name, (file IS NOT NULL) hasFile, u.name author FROM resources r JOIN users u ON u.id=r.faculty_id WHERE status='published'";
  const params = [];

  if (kinds.length > 0) {
    sql += ' AND kind IN (' + kinds.map(() => '?').join(',') + ')';
    params.push(...kinds);
  }
  if (course) {
    sql += ' AND course = ?';
    params.push(course);
  }
  if (difficulty) {
    sql += ' AND difficulty = ?';
    params.push(difficulty);
  }
  if (search) {
    sql += ' AND (title LIKE ? OR topic LIKE ? OR tags LIKE ? OR descr LIKE ?)';
    params.push(search, search, search, search);
  }

  sql += ' ORDER BY r.created DESC';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/files/:id', auth, (req, res) => {
  const r = db.prepare('SELECT * FROM resources WHERE id=?').get(req.params.id);
  if (!r || !r.file || (r.status !== 'published' && r.faculty_id !== req.user.id)) {
    return res.status(404).json({ error: 'File not found or not published' });
  }
  const filePath = path.join(config.uploadDir, r.file);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File removed from server' });
  }
  res.download(filePath, r.orig_name || 'download');
});

// Faculty Studio router
const studio = express.Router();
studio.use(auth, need('faculty'));

studio.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM resources WHERE faculty_id=? ORDER BY created DESC').all(req.user.id));
});

studio.post('/', upload.single('file'), A((req, res) => {
  const b = req.body || {};
  if (!b.title || !b.title.trim()) return res.status(400).json({ error: 'Title required' });
  const r = db.prepare('INSERT INTO resources(faculty_id,kind,course,unit,topic,title,descr,tags,difficulty,file,orig_name) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(req.user.id, b.kind || 'lecture', b.course, b.unit, b.topic, b.title.trim(), b.descr, b.tags, b.difficulty || 'Easy', req.file?.filename, req.file?.originalname);
  res.json(db.prepare('SELECT * FROM resources WHERE id=?').get(r.lastInsertRowid));
}));

studio.put('/:id', A((req, res) => {
  const b = req.body || {};
  const current = db.prepare('SELECT * FROM resources WHERE id=? AND faculty_id=?').get(req.params.id, req.user.id);
  if (!current) return res.status(404).json({ error: 'Resource not found' });

  db.prepare(`UPDATE resources SET 
    title = COALESCE(?, title),
    course = COALESCE(?, course),
    unit = COALESCE(?, unit),
    topic = COALESCE(?, topic),
    descr = COALESCE(?, descr),
    difficulty = COALESCE(?, difficulty),
    tags = COALESCE(?, tags)
    WHERE id = ? AND faculty_id = ?`)
    .run(b.title, b.course, b.unit, b.topic, b.descr, b.difficulty, b.tags, req.params.id, req.user.id);

  res.json(db.prepare('SELECT * FROM resources WHERE id=?').get(req.params.id));
}));

studio.post('/:id/status', A((req, res) => {
  const s = req.body?.status;
  if (!['draft', 'published', 'archived'].includes(s)) return res.status(400).json({ error: 'Bad status' });
  const r = db.prepare('UPDATE resources SET status=? WHERE id=? AND faculty_id=?').run(s, req.params.id, req.user.id);
  r.changes ? res.json({ ok: true, status: s }) : res.status(404).json({ error: 'Resource not found' });
}));

studio.delete('/:id', A((req, res) => {
  const resource = db.prepare('SELECT file FROM resources WHERE id=? AND faculty_id=?').get(req.params.id, req.user.id);
  if (!resource) return res.status(404).json({ error: 'Resource not found' });
  if (resource.file) {
    try { fs.unlinkSync(path.join(config.uploadDir, resource.file)); } catch (e) {}
  }
  db.prepare('DELETE FROM resources WHERE id=? AND faculty_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true, message: 'Resource deleted' });
}));

app.use('/api/studio', studio);

// 404 for unmatched API routes
app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found' }));

// Static frontend assets
app.use(express.static(path.join(__dirname, '..', 'public')));

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('[API ERROR]', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

if (require.main === module) {
  app.listen(config.port, () => console.log(`PRAGYA AI backend listening on port ${config.port}`));
}

module.exports = app;
