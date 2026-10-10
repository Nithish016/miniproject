process.env.DB_FILE = ':memory:';
const { JSDOM } = require('jsdom');
const app = require('./server');

const srv = app.listen(0, '127.0.0.1', async () => {
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const errs = [];
  const vc = new (require('jsdom').VirtualConsole)();
  vc.on('jsdomError', e => errs.push(e.message));

  const dom = await JSDOM.fromURL(url, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      w.fetch = (u, o) => fetch(new URL(u, url), o);
      w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => ({ addColorStop() { } }) });
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
      w.scrollTo = () => { };
      w.confirm = () => true;
      w.requestAnimationFrame = (cb) => setTimeout(cb, 16);
    }
  });

  const w = dom.window, d = w.document, sleep = ms => new Promise(r => setTimeout(r, ms)), ok = (n, c) => {
    console.log((c ? 'PASS ' : 'FAIL ') + n);
    if (!c) process.exitCode = 1;
  };

  await sleep(800);
  ok('auth overlay shown', d.getElementById('auth').classList.contains('on'));

  d.getElementById('asw').click();
  d.getElementById('an').value = 'Ada';
  d.getElementById('ae').value = 'ada@x.com';
  d.getElementById('ap').value = 'secret1';
  d.getElementById('ago').click();
  await sleep(700);

  ok('student lands on home', d.getElementById('home').classList.contains('on'));
  ok('studio nav hidden for student', d.querySelector('[data-s=studio]').style.display == 'none');

  d.querySelector('[data-w=py]').click();
  await sleep(100);
  ok('level list shows', d.querySelectorAll('#ll .door').length == 3);

  d.querySelector('[data-lv]').click();
  await sleep(100);
  ok('puzzle screen', d.getElementById('puzzle').classList.contains('on'));

  d.querySelector('[data-o=int]').click();
  await sleep(500);
  ok('xp awarded via UI', d.querySelector('.xp').textContent == '30');

  d.querySelector('[data-s=cards]').click();
  await sleep(400);
  ok('cards rendered', d.querySelectorAll('#deck .card').length == 12);

  d.querySelector('[data-s=hall]').click();
  await sleep(400);
  ok('leaderboard+ach', d.querySelectorAll('#lb .ach').length == 1 && d.querySelectorAll('#achs .ach').length >= 5);

  d.getElementById('out').click();
  d.getElementById('ae').value = 'prof@x.com';
  d.getElementById('ap').value = 'secret1';
  d.getElementById('ar').value = 'faculty';
  d.getElementById('ago').click();
  await sleep(600);

  ok('faculty lands on studio', d.getElementById('studio').classList.contains('on'));

  d.getElementById('stt').value = 'Loops notes';
  d.getElementById('spb').click();
  await sleep(600);
  ok('resource published', d.querySelectorAll('#myr .res').length == 1 && d.querySelector('#myr .tag').textContent == 'PUBLISHED');

  console.log('page errors:', errs.length ? errs : 'none');
  srv.close();
  process.exit();
});
