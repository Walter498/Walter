// lizimh.js 煙霧測試：用真的 API 跑 loadInfo，檢查章節順序與 epId 對應。
// 用法： node harness_smoke.js <comicId>
const fs = require('fs');
const assert = require('assert');
const crypto = require('crypto');
global.Convert = {
  encodeUtf8: (text) => Buffer.from(text, 'utf8'),
  md5: (bytes) => crypto.createHash('md5').update(Buffer.from(bytes)).digest(),
  hexEncode: (bytes) => Buffer.from(bytes).toString('hex'),
};

// ---- 宿主 API 仿真（EZvenera 全域）----
global.Network = {
  get: async (url, headers) => {
    const r = await fetch(url, { headers: headers || {} });
    return { status: r.status, body: await r.text() };
  },
};
global.ComicSource = class {
  loadSetting() { return undefined; }
  saveData() {}
  deleteData() {}
};
global.ComicDetails = class { constructor(o) { Object.assign(this, o); } };

// ---- 載入源並實例化 ----
const src = fs.readFileSync(__dirname + '/lizimh.js', 'utf8');
eval(src + '\n;global.__Lizimh = Lizimh;');

(async () => {
  const id = process.argv[2] || '57229';
  const inst = new global.__Lizimh();
  const d = await inst.comic.loadInfo(id);
  const keys = Object.keys(d.chapters);
  console.log('章節數:', keys.length);
  console.log('前 5 話:', keys.slice(0, 5).map((k) => d.chapters[k]).join(' | '));

  const lbl = (k) => {
    const m = String(d.chapters[k] || '').match(/第\s*(\d+)\s*[话話]/);
    return m ? Number(m[1]) : null;
  };
  const nums = keys.map(lbl).filter((n) => n !== null);
  let bad = 0;
  for (let i = 1; i < nums.length; i++) if (nums[i] < nums[i - 1]) bad++;
  // 注意：少量遞減是站方自己的上傳順序（API 原始資料裡就如此，例如某幾話
  // 補更在後），只要與 API 原始順序一致就是對的。這裡只做「有無嚴重亂序」
  // 的粗略提示：>15 次才可能是 key 又被 JS 重排。
  console.log('話號遞減次數（站方補更會造成少量，屬正常）:', bad);
  console.log('key 是否唯一:', new Set(keys).size === keys.length ? '✅' : '❌');
  console.log('章節封面數:', Object.keys(d.chapterCovers || {}).length);

  // epId → 真正章節 id 的對應檢查
  const chId = inst.resolveEp(id, keys[10]);
  console.log('第 11 個 key', keys[10], '→ 真章節 id', chId, chId !== keys[10] ? '✅ 有對應' : '❌ 沒對應');
  // Compare the actual API order instead of using a guessed inversion limit.
  const api = await global.__Lizimh.getJson('/app/api/v2/detail/' + id);
  const expected = api.chapters.slice().sort((a, b) => a.order - b.order);
  assert.equal(keys.length, expected.length);
  assert.equal(new Set(keys).size, keys.length);
  expected.forEach((ch, i) => {
    assert.equal(inst.resolveEp(id, keys[i]), String(ch.id));
    assert.equal(d.chapters[keys[i]], ch.name || `第${ch.order}话`);
  });
  console.log('\nPASS: loadInfo, chapter count, exact API order, epId mapping');
})().catch((error) => {
  console.error('FAIL:', error.message);
  process.exitCode = 1;
});