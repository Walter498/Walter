const fs = require('fs');
const assert = require('assert');
const crypto = require('crypto');

global.Convert = {
  encodeUtf8: text => Buffer.from(text, 'utf8'),
  decodeUtf8: bytes => Buffer.from(bytes).toString('utf8'),
  decodeBase64: text => Buffer.from(text, 'base64'),
  md5: bytes => crypto.createHash('md5').update(Buffer.from(bytes)).digest(),
  hexEncode: bytes => Buffer.from(bytes).toString('hex'),
};
global.ComicSource = class {
  constructor() { this.data = {}; }
  loadSetting() { return undefined; }
  loadData(key) { return this.data[key]; }
  saveData(key,value) { this.data[key] = value; }
};
global.Comic = class { constructor(data) { Object.assign(this,data); } };
global.ComicDetails = global.Comic;
const realGet = async (url,headers) => {
  const r = await fetch(url,{headers, signal: AbortSignal.timeout(20000)});
  return {status:r.status, body:await r.text()};
};
global.Network = {get: realGet};
eval(fs.readFileSync(require('path').join(__dirname, '../lizimh.js'),'utf8') + '\n;global.Source = Lizimh;');

(async () => {
  const t = '1790953303';
  const a = new URL('http://example.invalid' + Source.signedPath('/app/api/category/list?page=3&random_seed=test%20x',t));
  const b = new URL('http://example.invalid' + Source.signedPath('/app/api/category/list?page=9',t));
  assert.equal(a.searchParams.get('lzsign'),b.searchParams.get('lzsign'));
  assert.equal(a.searchParams.get('page'),'3');
  assert.equal(a.searchParams.get('random_seed'),'test x');
  const clean = new URL('http://example.invalid' + Source.signedPath('/app/api/health?lzsign=old&t=1',t));
  assert.equal(clean.searchParams.getAll('lzsign').length,1);
  assert.equal(clean.searchParams.getAll('t').length,1);
  assert.equal(clean.searchParams.get('t'),t);
  assert.throws(() => Source.signedPath('/app/api/health','invalid'));
  // Validate fallback keeps the successful host pinned; no credentials used.
  Source._useFallback = true;
  Network.get = async url => {
    if (url.startsWith(Source.apiFallback)) return {status:200,body:'{"code":201,"data":{"ok":true}}'};
    throw Error('unexpected host');
  };
  assert.equal((await Source.getJson('/app/api/home/data')).ok,true);
  assert.equal(Source._useFallback,true);
  Source._useFallback = false;
  Network.get = realGet;
  const cold = new Source();
  cold.comic.loadInfo = async id => { cold._epMap[id] = {'1':'10001'}; };
  cold.officialPics = async id => { assert.equal(id,'10001'); return ['page.jpg']; };
  cold.warmNext = async () => {};
  assert.deepEqual((await cold.comic.loadEp('book','1')).images,['page.jpg']);
  const warm = new Source();
  warm._epMap.book = {'1':'10001','2':'10002'};
  warm._orderCache.book = ['1','2'];
  let requested;
  warm.officialPics = async id => { requested = id; return ['page.jpg']; };
  await warm.warmNext('book','1');
  assert.equal(requested,'10002');
  console.log('PASS: cold chapter ID restoration and next chapter warm-up');
  if (process.env.LIZI_CAPTURE_PATH) {
    const log = fs.readFileSync(process.env.LIZI_CAPTURE_PATH,'utf8');
    let count = 0;
    for (const match of log.matchAll(/^GET (\S+) HTTP\//gm)) {
      const url = new URL(match[1],'http://example.invalid');
      const signature = url.searchParams.get('lzsign');
      const ts = url.searchParams.get('t');
      if (!signature || !ts) continue;
      const generated = new URL(Source.signedPath(url.pathname,ts),'http://example.invalid');
      assert.equal(generated.searchParams.get('lzsign'),signature);
      ++count;
    }
    console.log('PASS: captured signatures matched:',count);
  }
  console.log('PASS: query preservation, timestamp, fallback pinning');
  if (process.argv.includes('--live')) {
    const source = new Source();
    await source.init();
    const result = await source.explore[0].load(1);
    assert(result.length > 0);
    assert(result.some(p => p.comics.length > 0));
    console.log('PASS: live init, explore parts',result.length,'comic entries',result.reduce((n,p)=>n+p.comics.length,0));
    const info = await source.comic.loadInfo('57229');
    assert(Object.keys(info.chapters).length > 900);
    const diagnostic = await source.diagnosticApi(Source.api);
    assert(diagnostic.data.chapters.length > 900);
    console.log('PASS: live detail, API diagnostic, no JWT required');
  }
})().catch(e => {console.error('FAIL:',e.message);process.exitCode=1;});
