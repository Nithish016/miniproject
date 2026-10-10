process.env.DB_FILE = ':memory:';
const app = require('./server');
const srv = app.listen(0);
const base = `http://localhost:${srv.address().port}`;

const j = async (m, p, b, t) => {
  const r = await fetch(base + p, {
    method: m,
    headers: { 'content-type': 'application/json', ...(t && { authorization: 'Bearer ' + t }) },
    body: b ? JSON.stringify(b) : undefined
  });
  return { s: r.status, d: await r.json() };
};

const ok = (n, c) => {
  console.log((c ? 'PASS ' : 'FAIL ') + n);
  if (!c) process.exitCode = 1;
};

(async () => {
  // Phase 1: Authentication & Profiles
  const s = await j('POST', '/api/auth/register', { name: 'Test', email: 's@x.com', password: 'secret1', role: 'student' });
  ok('register', s.s === 200 && s.d.token);
  ok('dup email', (await j('POST', '/api/auth/register', { name: 'T', email: 's@x.com', password: 'secret1' })).s === 409);
  ok('bad login', (await j('POST', '/api/auth/login', { email: 's@x.com', password: 'nope' })).s === 401);
  ok('no token', (await j('GET', '/api/worlds')).s === 401);

  const t = s.d.token;

  // Profile management tests
  const profUpdate = await j('PATCH', '/api/me', { bio: 'CS Explorer', avatar: 'mage', sound_enabled: false }, t);
  ok('update profile', profUpdate.s === 200 && profUpdate.d.user.bio === 'CS Explorer' && profUpdate.d.user.avatar === 'mage');

  const meCheck = await j('GET', '/api/me', 0, t);
  ok('get profile includes preferences', meCheck.s === 200 && meCheck.d.sound_enabled === false);

  const badPw = await j('POST', '/api/me/password', { currentPassword: 'wrong', newPassword: 'newsecret2' }, t);
  ok('bad password change rejected', badPw.s === 401);

  const goodPw = await j('POST', '/api/me/password', { currentPassword: 'secret1', newPassword: 'newsecret2' }, t);
  ok('good password change accepted', goodPw.s === 200 && goodPw.d.ok === true);

  const relogin = await j('POST', '/api/auth/login', { email: 's@x.com', password: 'newsecret2' });
  ok('login with new password works', relogin.s === 200 && relogin.d.token);

  // Gameplay tests
  const w = (await j('GET', '/api/worlds', 0, t)).d;
  ok('6 worlds', w.length === 6 && w[0].unlocked && !w[1].unlocked);

  const loop = w[0].levels.find(l => l.kind === 'loop');
  let r = (await j('POST', `/api/levels/${loop.id}/submit`, { count: 3 }, t)).d;
  ok('wrong loop costs life', !r.correct && r.user.lives === 2);

  r = (await j('POST', `/api/levels/${loop.id}/submit`, { count: 5 }, t)).d;
  ok('correct loop gives xp', r.correct && r.xpGained === 50 && r.user.xp === 50 && r.newAchievements.length === 1);

  r = (await j('POST', `/api/levels/${loop.id}/submit`, { count: 5 }, t)).d;
  ok('no farming xp', r.correct && r.xpGained === 0);

  ok('locked world blocked', (await j('POST', `/api/levels/${w[1].levels[0].id}/submit`, { path: [] }, t)).s === 403);
  ok('student cannot use studio', (await j('GET', '/api/studio', 0, t)).s === 403);

  // Phase 2: Learning Content & Studio Tests
  const f = (await j('POST', '/api/auth/register', { name: 'Prof', email: 'f@x.com', password: 'secret1', role: 'faculty' })).d.token;

  // Course management
  const coursesList = await j('GET', '/api/courses', 0, t);
  ok('courses listed', coursesList.s === 200 && coursesList.d.length >= 3);

  const enrollRes = await j('POST', `/api/courses/${coursesList.d[0].id}/enroll`, 0, t);
  ok('student enrolls in course', enrollRes.s === 200 && enrollRes.d.ok === true);

  const myCourses = await j('GET', '/api/my-courses', 0, t);
  ok('my-courses contains enrolled course', myCourses.s === 200 && myCourses.d.length === 1);

  const newCourse = await j('POST', '/api/courses', { code: 'CS301', title: 'Database Systems' }, f);
  ok('faculty creates course', newCourse.s === 200 && newCourse.d.code === 'CS301');

  // Resource management
  const c = await j('POST', '/api/studio', { title: 'Loops PDF', kind: 'lecture', course: 'Python Programming', tags: 'loop, python' }, f);
  ok('faculty creates draft', c.s === 200 && c.d.status === 'draft');

  ok('draft hidden from vault', (await j('GET', '/api/vault', 0, t)).d.length === 0);
  await j('POST', `/api/studio/${c.d.id}/status`, { status: 'published' }, f);
  ok('published visible', (await j('GET', '/api/vault', 0, t)).d.length === 1);

  const searchRes = await j('GET', '/api/vault?q=Loops', 0, t);
  ok('vault search finds resource', searchRes.s === 200 && searchRes.d.length === 1);

  const editRes = await j('PUT', `/api/studio/${c.d.id}`, { descr: 'Comprehensive guide to loops' }, f);
  ok('faculty edits resource', editRes.s === 200 && editRes.d.descr === 'Comprehensive guide to loops');

  // Phase 3: Battle Deck & Simulation
  const defaultDeck = await j('GET', '/api/cards/deck', 0, t);
  ok('default battle deck returned', defaultDeck.s === 200 && defaultDeck.d.length <= 5);

  const equipRes = await j('PUT', '/api/cards/deck', { cardIds: [1, 2, 3] }, t);
  ok('equip battle cards into deck', equipRes.s === 200 && equipRes.d.deck.length === 3);

  const battleRes = await j('POST', '/api/battle/simulate', 0, t);
  ok('turn-based card battle simulates', battleRes.s === 200 && battleRes.d.combatLog.length > 0 && typeof battleRes.d.victory === 'boolean');

  // Phase 4: Assessments & Question Banks
  const quizList = await j('GET', '/api/assessments', 0, t);
  ok('assessments listed', quizList.s === 200 && quizList.d.length >= 1);

  const quizDetails = await j('GET', `/api/assessments/${quizList.d[0].id}`, 0, t);
  ok('quiz questions loaded without answer keys', quizDetails.s === 200 && quizDetails.d.questions.length > 0 && quizDetails.d.questions[0].correct_answer === undefined);

  const q1 = quizDetails.d.questions[0];
  const submitQuiz = await j('POST', `/api/assessments/${quizList.d[0].id}/submit`, {
    answers: { [q1.id]: '0, 1, 2' }
  }, t);
  ok('assessment submitted and graded', submitQuiz.s === 200 && submitQuiz.d.totalPoints > 0 && Array.isArray(submitQuiz.d.review));

  const facultyQuiz = await j('POST', '/api/assessments', {
    title: 'Midterm Networking Quiz',
    course_id: 'cs-net',
    questions: [
      { prompt: 'What layer does IP operate at?', options: ['Network', 'Transport', 'Data Link'], correctAnswer: 'Network', points: 10 }
    ]
  }, f);
  ok('faculty creates new assessment', facultyQuiz.s === 200 && facultyQuiz.d.id > 0);

  // Leaderboard, cards, mentor
  ok('leaderboard', (await j('GET', '/api/leaderboard', 0, t)).d[0].you === true);
  ok('cards', (await j('GET', '/api/cards', 0, t)).d.length === 12);
  ok('mentor', (await j('POST', '/api/mentor', { action: 'hint' }, t)).d.reply.length > 5);

  srv.close();
})();
