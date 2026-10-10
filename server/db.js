const path = require('path');
const config = require('./config');

let rawDb;
let isNative = false;
try {
  const Database = require('better-sqlite3');
  rawDb = new Database(config.dbFile);
  rawDb.pragma('journal_mode = WAL');
  rawDb.pragma('foreign_keys = ON');
  isNative = true;
} catch (e) {
  const { DatabaseSync } = require('node:sqlite');
  rawDb = new DatabaseSync(config.dbFile);
  rawDb.exec('PRAGMA journal_mode = WAL;');
  rawDb.exec('PRAGMA foreign_keys = ON;');
}

// Normalize Database interface across better-sqlite3 and node:sqlite
const db = {
  raw: rawDb,
  exec: (sql) => rawDb.exec(sql),
  pragma: (str) => isNative ? rawDb.pragma(str) : rawDb.exec(`PRAGMA ${str};`),
  prepare: (sql) => {
    const stmt = rawDb.prepare(sql);
    const clean = (args) => args.map(a => (a === undefined ? null : a));
    return {
      run: (...args) => stmt.run(...clean(args)),
      get: (...args) => stmt.get(...clean(args)),
      all: (...args) => stmt.all(...clean(args)),
    };
  },
  transaction: (fn) => {
    if (rawDb.transaction) return rawDb.transaction(fn);
    return function (...args) {
      rawDb.exec('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        rawDb.exec('COMMIT');
        return result;
      } catch (err) {
        rawDb.exec('ROLLBACK');
        throw err;
      }
    };
  }
};

// 1. Core Schema Definition
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  pw TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN('student','faculty')),
  xp INTEGER DEFAULT 0,
  coins INTEGER DEFAULT 0,
  lives INTEGER DEFAULT 3,
  streak INTEGER DEFAULT 0,
  last_active TEXT,
  avatar TEXT DEFAULT 'warrior',
  bio TEXT DEFAULT '',
  department TEXT DEFAULT 'Computer Science & Engineering',
  sound_enabled INTEGER DEFAULT 1,
  crt_enabled INTEGER DEFAULT 0,
  created TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  ord INTEGER NOT NULL,
  unlocked_by INTEGER DEFAULT 0,
  description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS levels (
  id INTEGER PRIMARY KEY,
  world_id TEXT REFERENCES worlds(id),
  num INTEGER NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  config TEXT NOT NULL,
  xp INTEGER NOT NULL,
  coins INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS progress (
  user_id INTEGER REFERENCES users(id),
  level_id INTEGER REFERENCES levels(id),
  attempts INTEGER DEFAULT 0,
  stars INTEGER DEFAULT 0,
  done_at TEXT,
  PRIMARY KEY (user_id, level_id)
);

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  descr TEXT NOT NULL,
  icon TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_ach (
  user_id INTEGER REFERENCES users(id),
  ach_id TEXT REFERENCES achievements(id),
  at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, ach_id)
);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  deck TEXT NOT NULL,
  rarity TEXT NOT NULL,
  energy INTEGER NOT NULL,
  atk INTEGER NOT NULL,
  def INTEGER NOT NULL,
  ability TEXT NOT NULL,
  unlock_level INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_decks (
  user_id INTEGER REFERENCES users(id),
  card_id INTEGER REFERENCES cards(id),
  in_deck INTEGER DEFAULT 1,
  PRIMARY KEY (user_id, card_id)
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  faculty_id INTEGER REFERENCES users(id),
  created TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS enrollments (
  user_id INTEGER REFERENCES users(id),
  course_id TEXT REFERENCES courses(id),
  enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY,
  faculty_id INTEGER REFERENCES users(id),
  kind TEXT NOT NULL,
  course TEXT,
  unit TEXT,
  topic TEXT,
  title TEXT NOT NULL,
  descr TEXT,
  tags TEXT,
  difficulty TEXT DEFAULT 'Easy',
  status TEXT DEFAULT 'draft' CHECK(status IN('draft','published','archived')),
  file TEXT,
  orig_name TEXT,
  created TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS question_banks (
  id INTEGER PRIMARY KEY,
  faculty_id INTEGER REFERENCES users(id),
  course_id TEXT,
  unit TEXT,
  topic TEXT,
  title TEXT NOT NULL,
  description TEXT,
  created TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY,
  bank_id INTEGER REFERENCES question_banks(id),
  prompt TEXT NOT NULL,
  options_json TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  difficulty TEXT DEFAULT 'Medium',
  points INTEGER DEFAULT 10
);

CREATE TABLE IF NOT EXISTS assessment_attempts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  bank_id INTEGER REFERENCES question_banks(id),
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  passed INTEGER DEFAULT 0,
  answers_json TEXT,
  completed_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_logs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  prompt TEXT,
  reply TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  provider TEXT DEFAULT 'builtin',
  created TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);
CREATE INDEX IF NOT EXISTS idx_resources_faculty ON resources(faculty_id);
`);

// Safe column migrations for existing databases
const ensureColumn = (table, col, def) => {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def};`);
  } catch (e) {
    // Column already exists, ignore
  }
};
ensureColumn('users', 'avatar', "TEXT DEFAULT 'warrior'");
ensureColumn('users', 'bio', "TEXT DEFAULT ''");
ensureColumn('users', 'department', "TEXT DEFAULT 'Computer Science & Engineering'");
ensureColumn('users', 'sound_enabled', 'INTEGER DEFAULT 1');
ensureColumn('users', 'crt_enabled', 'INTEGER DEFAULT 0');
ensureColumn('worlds', 'description', "TEXT DEFAULT ''");

// 2. Initial Seed Data
if (!db.prepare('SELECT COUNT(*) c FROM worlds').get().c) {
  const w = db.prepare('INSERT INTO worlds (id, name, icon, ord, unlocked_by, description) VALUES (?,?,?,?,?,?)');
  [
    ['py', 'Python Kingdom', '🏰', 1, 0, 'Master variables, conditionals, and loops in an ancient fantasy castle.'],
    ['nf', 'Network Forest', '🌲', 2, 100, 'Navigate routing trees, avoid firewall hazards, and deliver packets safely.'],
    ['ds', 'Data Structure City', '🏙️', 3, 300, 'Build skyscrapers using stacks, queues, linked lists, and binary trees.'],
    ['al', 'Algorithm Arena', '⚔️', 4, 600, 'Battle recursive beasts and solve optimal path challenges.'],
    ['db', 'Database Dungeon', '🗝️', 5, 1000, 'Unlock locked vaults with SQL queries and relational keys.'],
    ['os', 'OS City', '🗼', 6, 1500, 'Manage threads, conquer deadlocks, and schedule kernel operations.']
  ].forEach(r => w.run(...r));

  const l = db.prepare('INSERT INTO levels (world_id, num, title, kind, config, xp, coins) VALUES (?,?,?,?,?,?,?)');
  l.run('py', 1, 'Variables', 'variable', JSON.stringify({ answer: 'int', prompt: 'x = 42. What is the data type of x?' }), 30, 10);
  l.run('py', 2, 'If / Else', 'condition', JSON.stringify({ threshold: 18, age: 20, prompt: 'Guard condition: if age >= 18: pass. Age is 20. Does door open?' }), 40, 15);
  l.run('py', 3, 'Loops', 'loop', JSON.stringify({ needed: 5, max: 7, prompt: 'Activate platforms across canyon gap.' }), 50, 20);
  l.run('nf', 1, 'Packet Delivery', 'route', JSON.stringify({ path: ['A', 'R2', 'R4', 'B'], nodes: ['A', 'R1', 'R2', 'R3', 'R4', 'B'], active: ['A', 'R2', 'R4', 'B'] }), 60, 25);
  l.run('nf', 2, 'Subnet Shield', 'condition', JSON.stringify({ threshold: 24, age: 24, prompt: 'Is /24 subnet mask equal to 255.255.255.0?' }), 70, 30);
  l.run('ds', 1, 'Stack Tower', 'variable', JSON.stringify({ answer: 'LIFO', prompt: 'Which principle does a Stack follow?' }), 80, 35);
  l.run('al', 1, 'Binary Search Gate', 'condition', JSON.stringify({ threshold: 1, age: 1, prompt: 'Does Binary Search require a sorted array?' }), 100, 40);
  l.run('db', 1, 'Primary Key Vault', 'variable', JSON.stringify({ answer: 'UNIQUE', prompt: 'Primary keys must be UNIQUE and NOT NULL. Correct?' }), 120, 50);
  l.run('os', 1, 'Process Scheduler', 'condition', JSON.stringify({ threshold: 1, age: 1, prompt: 'Does Round Robin use time slices?' }), 150, 60);

  const a = db.prepare('INSERT INTO achievements (id, name, descr, icon) VALUES (?,?,?,?)');
  [
    ['first_level', 'CODE WARRIOR', 'Completed your first level challenge', '🛡️'],
    ['loop_master', 'PYTHON MASTER', 'Completed all Python Kingdom levels', '🐍'],
    ['net_nav', 'NETWORK NAVIGATOR', 'Completed a Network Forest route challenge', '🧭'],
    ['streak7', '7 DAY STREAK', 'Logged in and trained for 7 consecutive days', '🔥'],
    ['rich', 'TREASURE HUNTER', 'Hoarded 200 or more shiny coins', '🪙'],
    ['quiz_ace', 'ASSESSMENT ACE', 'Scored 100% on a course assessment', '🎓'],
    ['card_collector', 'DECK MASTER', 'Collected at least 10 CS Battle Cards', '🃏']
  ].forEach(r => a.run(...r));

  const c = db.prepare('INSERT INTO cards (name, icon, deck, rarity, energy, atk, def, ability, unlock_level) VALUES (?,?,?,?,?,?,?,?,?)');
  [
    ['Variable', '📦', 'python', 'common', 2, 10, 5, 'Store: gain 1 energy', 0],
    ['Operator', '➕', 'python', 'common', 2, 8, 4, 'Combine: +3 ATK', 0],
    ['If', '🔀', 'python', 'common', 2, 9, 6, 'Branch: choose ATK or DEF', 0],
    ['Loop', '🔁', 'python', 'rare', 3, 15, 8, 'Repeat: attack twice', 3],
    ['Function', '⚙️', 'python', 'epic', 4, 20, 12, 'Reuse: replay last card', 5],
    ['Debug', '🐞', 'python', 'legendary', 5, 30, 20, 'Remove enemy buff', 8],
    ['Router', '📡', 'network', 'rare', 3, 12, 10, 'Redirect enemy attack', 4],
    ['Packet', '✉️', 'network', 'common', 1, 6, 3, 'Swift: first strike', 0],
    ['IP', '🏷️', 'network', 'common', 2, 7, 7, 'Identify: reveal enemy card', 0],
    ['TCP', '🤝', 'network', 'epic', 4, 18, 16, 'Reliable: cannot be countered', 6],
    ['UDP', '⚡', 'network', 'rare', 2, 16, 3, 'Fast but fragile', 4],
    ['Firewall', '🧱', 'network', 'legendary', 5, 10, 30, 'Block all damage once', 9]
  ].forEach(r => c.run(...r));

  // Default courses
  const cs = db.prepare('INSERT INTO courses (id, code, title, description, icon) VALUES (?,?,?,?,?)');
  [
    ['cs-py', 'CS101', 'Python Programming & Problem Solving', 'Fundamentals of procedural and object-oriented Python.', '🐍'],
    ['cs-net', 'CS202', 'Computer Networks & Security', 'OSI model, routing, TCP/UDP protocols, and packet forensics.', '🌐'],
    ['cs-ds', 'CS203', 'Data Structures & Algorithms', 'Linear and non-linear data structures with algorithmic efficiency.', '⚡']
  ].forEach(r => cs.run(...r));

  // Seed question bank
  const qb = db.prepare('INSERT INTO question_banks (id, course_id, unit, topic, title, description) VALUES (?,?,?,?,?,?)');
  qb.run(1, 'cs-py', 'Unit 3', 'Loops & Iterations', 'Python Control Flow Mastery', 'Assessments on for loops, while loops, and range functions.');

  const q = db.prepare('INSERT INTO questions (bank_id, prompt, options_json, correct_answer, explanation, difficulty, points) VALUES (?,?,?,?,?,?,?)');
  [
    [1, 'What will range(3) produce?', JSON.stringify(['0, 1, 2', '1, 2, 3', '0, 1, 2, 3', '1, 2']), '0, 1, 2', 'range(n) starts at 0 and ends at n-1.', 'Easy', 10],
    [1, 'Which keyword immediately exits a loop?', JSON.stringify(['break', 'continue', 'pass', 'return']), 'break', 'break terminates the enclosing loop.', 'Easy', 10],
    [1, 'What does while condition do when condition is initially False?', JSON.stringify(['Executes 0 times', 'Executes 1 time', 'Throws error', 'Infinite loop']), 'Executes 0 times', 'The condition is tested before the first execution.', 'Medium', 15]
  ].forEach(r => q.run(...r));
}

module.exports = db;
