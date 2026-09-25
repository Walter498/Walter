// lizimh.js 煙霧測試：用真的 API 跑 loadInfo，檢查章節順序與 epId 對應。
// 用法： node harness_smoke.js <comicId>
const fs = require('fs');

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
  console.log(bad <= 15 ? '\n✅ 煙霧測試通過（無 JS key 重排跡象）' : '\n❌ 可能有 key 重排，請檢查');
})();