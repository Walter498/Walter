/*
 * 栗子漫画 iOS 版 SSL 明文抓取 (Frida)
 * 原理: Flutter 的 dio 走 BoringSSL, 系统代理抓不到。
 *       直接 hook SSL_read / SSL_write 拿明文 HTTP 请求和响应。
 *
 * 用法:
 *   1. 设备上启动 frida-server
 *   2. frida -H <设备IP>:27042 -n 栗子漫画 -l ssl_dump.js
 *   3. 在 App 里: 搜索漫画 -> 进详情 -> 翻两话
 *   4. 把 REQUEST/RESPONSE 段落保存, 丢给 crack_sign.py
 */

'use strict';

function isPrintableAscii(bytes) {
    if (bytes.length < 8) return false;
    let printable = 0;
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b === 0x0a || b === 0x0d || b === 0x09 || (b >= 0x20 && b < 0x7f)) printable++;
    }
    return printable / bytes.length > 0.85;
}

function dumpBuffer(name, ptr, len) {
    if (ptr.isNull() || len <= 0) return;
    try {
        const bytes = ptr.readByteArray(Math.min(len, 65536));
        const arr = new Uint8Array(bytes);
        if (!isPrintableAscii(arr)) {
            if (len > 512) console.log('[BIN] ' + name + ' len=' + len);
            return;
        }
        let s = '';
        for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
        if (!/^(GET|POST|PUT|DELETE|HTTP\/|HEAD|OPTIONS)/.test(s)) return;
        console.log('\n========== ' + name + ' (' + len + ' bytes) ==========');
        console.log(s);
        console.log('========== END ==========\n');
    } catch (e) { /* ignore */ }
}

function hookSsl() {
    let hit = 0;
    for (const m of Process.enumerateModules()) {
        let exports = null;
        try { exports = Module.enumerateExports(m.name); } catch (e) { continue; }
        for (const e of exports) {
            if (e.name !== 'SSL_read' && e.name !== 'SSL_write') continue;
            const isRead = e.name === 'SSL_read';
            Interceptor.attach(e.address, {
                onEnter(args) {
                    this.buf = args[1];
                    this.num = args[2].toInt32();
                },
                onLeave(retVal) {
                    const n = retVal.toInt32();
                    if (n > 0) dumpBuffer(isRead ? 'RESPONSE' : 'REQUEST', this.buf, n);
                }
            });
            console.log('[+] hooked ' + e.name + ' @ ' + e.address + ' (' + m.name + ')');
            hit++;
        }
    }
    if (hit === 0) console.log('[-] 没找到 SSL_read/SSL_write 导出符号, 把模块列表发回来: ' +
        Process.enumerateModules().map(m => m.name).join(','));
}

if (ObjC.available) {
    console.log('[*] App: ' + ObjC.classes.NSBundle.mainBundle().bundleIdentifier());
}
hookSsl();
console.log('[*] ssl_dump.js ready. 去 App 里操作, 明文请求会打印在这里。');
