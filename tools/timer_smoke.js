const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const crypto = require('crypto');
const source = fs.readFileSync(path.join(__dirname,'../lizimh.js'),'utf8');
const callbacks = [];
const dialogs = [];
const context = {
  Promise, Date, console,
  ComicSource: class {},
  Convert: {
    encodeUtf8: s => Buffer.from(s),
    md5: b => crypto.createHash('md5').update(b).digest(),
    hexEncode: b => Buffer.from(b).toString('hex'),
  },
  setTimeout: fn => { callbacks.push(fn); /* no handle, like assets/init.js */ },
  UI: {showMessage() {}, showDialog(t,m){dialogs.push({t,m});}},
  Network: {get: async () => ({status:200,body:'{"code":201,"data":{"chapters":[{"cover":"/test.jpg"}]}}'})},
  fetch: async () => ({status:200,arrayBuffer:async () => {
    const bytes = new Uint8Array(2048);bytes[0]=255;bytes[1]=216;return bytes.buffer;
  }}),
};
vm.createContext(context);
vm.runInContext(source + '\nthis.Source = Lizimh;',context);
(async () => {
  assert.equal(context.clearTimeout,undefined);
  const instance = new context.Source();
  assert.equal(await instance.diagnosticTimeout(Promise.resolve('ok'),10),'ok');
  callbacks.splice(0).forEach(fn=>fn()); // callbacks after success must be harmless
  await assert.rejects(instance.diagnosticTimeout(Promise.reject(Error('network')),10),/network/);
  callbacks.splice(0).forEach(fn=>fn());
  const timeout = instance.diagnosticTimeout(new Promise(()=>{}),10);
  const expected = assert.rejects(timeout,/超时/);
  callbacks.splice(0).forEach(fn=>fn());
  await expected;
  await instance.runDiagnosticTest(false);
  assert(dialogs.at(-1).m.includes('ms'));
  await instance.runDiagnosticTest(true);
  assert(dialogs.at(-1).m.includes('KB/s'));
  assert.equal(instance._diagnosticBusy,false);
  callbacks.splice(0).forEach(fn=>fn());
  console.log('PASS: no timer ID, no clearTimeout, success/failure/timeout, API/image dialogs');
})().catch(e=>{console.error(e);process.exitCode=1;});
