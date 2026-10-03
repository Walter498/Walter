/** @type {import('./_venera_.js')} */

/**
 * 栗子漫画 (lizimh) 源 v2.33.8
 * API requests use the official path + Unix timestamp signature.
 * Public metadata endpoints do not need an account token. Chapter v3 uses
 * the user's authToken and remains subject to server account restrictions.
 */

class Lizimh extends ComicSource {
    name = "栗子漫画";
    key = "lizimh";
    version = "2.33.12";
    minAppVersion = "1.2.2";
    url = "https://raw.githubusercontent.com/Walter498/Walter/main/lizimh.js";

    // v2.32.0：回到最保守的寫法（App 的 QuickJS 引擎對 class 靜態 getter /
    // 複雜靜態欄位支援不佳，會導致整個源 init 失敗）。
    // 主域名 + 備援域名，失敗時逐一重試，成功的那台記在 _apiOk 裡。
    static api = "http://ai.xajtl.com";
    static apiFallback = "http://ai.qsmm.fun";
    static _useFallback = false;

    // Application protocol constant, NOT a user's login credential.
    static signPrefix = "q2sIObYXCp2uBZgCNBlY93J3z67hK0wS";

    static apiHeaders(extra) {
        return Object.assign({
            "Accept": "application/json",
            "User-Agent": "Dart/3.5 (dart:io)",
        }, extra || {});
    }

    static signedPath(target, timestamp) {
        const parts = String(target).split("?");
        const path = parts[0];
        const query = (parts.slice(1).join("?") || "").split("&").filter((entry) => {
            if (!entry) return false;
            const key = entry.split("=")[0];
            return key !== "lzsign" && key !== "t";
        });
        const addDefault = (key, value) => {
            if (!query.some((entry) => entry.split("=")[0] === key)) {
                query.push(key + "=" + encodeURIComponent(value));
            }
        };
        if (path === "/app/api/home/data" || path === "/app/api/configv2") {
            addDefault("packname", "com.jy.zyds");
            addDefault("appsign256", "");
        }
        if (path === "/app/api/configv2") addDefault("platform", "ios");
        const t = timestamp === undefined ? String(Math.floor(Date.now() / 1000)) : String(timestamp);
        if (!/^\d{10}$/.test(t)) throw new Error("Invalid API timestamp");
        const signature = Convert.hexEncode(Convert.md5(
            Convert.encodeUtf8(Lizimh.signPrefix + path + t))).toLowerCase();
        query.push("lzsign=" + signature, "t=" + t);
        return path + "?" + query.join("&");
    }


    // 圖片線路 (初始化時從 configv2 的 generators 覆蓋)
    // 每條線路: {name, url, proxy?, src?}  proxy=true 表示 url 是代理前綴, 真實圖床是 src
    static lines = [
        { name: "线路1 (CF优选海外)", url: "https://cdn.lzimg.xyz" },
        { name: "线路3 (i.lzimg)", url: "https://i.lzimg.xyz" },
        { name: "备用 (cf-1.imgio.club)", url: "https://cf-1.imgio.club" },
    ];
    static fallbackTags = ["热血","格斗","武侠","魔幻","魔法","冒险","爱情","搞笑","校园","科幻","后宫","励志","职场","美食","社会","黑道","战争","历史","悬疑","竞技","体育","恐怖","推理","生活","伪娘","治愈","神鬼","四格","百合","耽美","舞蹈","侦探","宅男","音乐","萌系","古风","恋爱","都市","穿越","游戏","其他","日常","腹黑","仙侠","修仙","纯爱","唯美","青春","彩虹","权谋","宅斗","装逼","浪漫","偶像","大女主","复仇","虐心","灵异","逆袭","妖怪","架空","动作","宫斗","脑洞","战斗","怪物","系统","智斗","机甲","高甜","异能","末日","奇幻","正能量","宫廷","亲情","剧情","轻小说","暗黑","长条","玄幻","霸总","其它","节操","欧风","女神","转生","异形","反套路","重生","性转"];
    static fallbackClasses = [["国漫",1],["日漫",2],["韩漫",3],["美漫",4],["精选推荐",5]];

    settings = {
        imageLine: {
            title: "图片线路 (auto=自动测速)",
            type: "select",
            options: [
                { value: "auto", text: "自动测速 (推荐)" },
                { value: "0", text: "线路1 (CF优选海外)" },
                { value: "1", text: "线路2 (mechat)" },
                { value: "2", text: "线路3 (i.lzimg)" },
                { value: "3", text: "备用 (cf-1.imgio.club)" },
            ],
            default: "auto",
        },
        speedTest: {
            title: "API 节点延迟（验证有效响应）",
            type: "callback", buttonText: "开始测速",
            callback: async () => this.runDiagnosticTest(false),
        },
        imageSpeedTest: {
            title: "图片下载测速（会消耗流量）",
            type: "callback", buttonText: "开始测速",
            callback: async () => this.runDiagnosticTest(true),
        },
        communityCheck: {
            title: "接口自檢（社區／首頁）",
            type: "callback",
            buttonText: "開始檢查",
            callback: async () => {
                const lines = [];
                const check = async (label, path) => {
                    try {
                        const data = await Lizimh.getJson(path);
                        const n = data && data.list ? data.list.length : "-";
                        lines.push(label + "：OK，項目數 " + n);
                    } catch (e) {
                        let msg = String(e);
                        const http = msg.match(/HTTP \d{3}/);
                        const code = msg.match(/API code \d+/);
                        lines.push(label + "：" + (http ? http[0] : code ? code[0] : "失敗"));
                    }
                };
                await check("健康檢查", "/app/api/health");
                await check("社區帖子", "/app/api/community/posts?page_size=10&sort_type=0");
                await check("首頁", "/app/api/home/data");
                const text = "栗子接口自檢：\n" + lines.join("\n");
                if (typeof UI.showDialog === "function") {
                    UI.showDialog("接口自檢", text, [
                        {text: "關閉", callback: () => {}},
                        {text: "重新檢查", callback: () => this.loadSetting("communityCheck")},
                    ]);
                } else {
                    UI.showMessage(text);
                }
            },
        },
        authToken: {
            title: "官方登录凭证 (JWT，选填)",
            type: "input",
            default: "",
            description: "贴上栗子官方 App 的 authorization 值（抓包取得）。填了之后，章节图片会使用官方顺序（解决个别章节图片乱序），不填则用文件名顺序。",
        },
        maxPages: {
            title: "单章最大页数 (探测上限)",
            type: "select",
            options: [
                { value: "150", text: "150 页" },
                { value: "300", text: "300 页 (默认)" },
                { value: "600", text: "600 页" },
            ],
            default: "300",
        },
    };

    category = {
        title: "栗子漫画",
        parts: [
            { name: "推荐", type: "fixed", categories: ["热门排行"], categoryParams: ["rank"], itemType: "category" },
            { name: "题材", type: "fixed", categories: Lizimh.fallbackTags, categoryParams: Lizimh.fallbackTags.map((t) => "tag:" + t), itemType: "category" },
            { name: "地区", type: "fixed", categories: Lizimh.fallbackClasses.map((c) => c[0]), categoryParams: Lizimh.fallbackClasses.map((c) => "class:" + c[1]), itemType: "category" },
            { name: "状态", type: "fixed", categories: ["连载", "完结"], categoryParams: ["isend:0", "isend:1"], itemType: "category" },
        ],
    };

    explore = [
        {
            title: "栗子漫画",
            type: "multiPartPage",
            load: async (page) => {
                let parts = [];
                const errors = [];
                const recordError = (e) => {
                    const safe = String(e).replace(/https?:\/\/[^\s;()]+/g, "[API]");
                    if (errors.indexOf(safe) < 0) errors.push(safe);
                    return null;
                };
                // v2.24.0 提速：所有請求同時發射（Promise 並行），總耗時
                // ≈ 最慢的一個請求，而不是十幾個請求排隊相加。
                // home/data 只抓一次，推荐池與周期更新共用同一個 Promise。
                let homeP = Lizimh.getJson("/app/api/home/data").catch(recordError);
                let tagP = ["系统", "穿越", "玄幻"].map((tag) =>
                    Lizimh.getJson("/app/api/search/full?q=" + encodeURIComponent(tag) + "&page=1")
                        .then((res) => ({ tag: tag, res: res }))
                        .catch(recordError)
                );
                let rankP = Lizimh.getJson("/app/api/rank/list").catch(recordError);
                let catP = [];
                for (let p = 1; p <= 6; p++) {
                    catP.push(Lizimh.getJson("/app/api/category/list?page=" + p).catch(recordError));
                }

                // ① 首页推荐：精選國漫 + 系統/穿越/玄幻 三種題材，合成一個大池子。
                // 宿主首頁只顯示 6 本，「换一换」從整個池子裡抽 → 種類才夠多。
                try {
                    let pool = [];
                    let seen = {};
                    let add = (c) => {
                        let id = String(c.id || "");
                        if (!id || seen[id]) return;
                        seen[id] = 1;
                        pool.push(c);
                    };
                    let home = await homeP;
                    if (home) {
                        for (let g of home.home_content_list || []) {
                            let t = String(g.title || "");
                            if (t.indexOf("国漫") >= 0) {
                                for (let c of g.comic_list || []) add(c);
                            }
                        }
                    }
                    // 注意：search/full 是「全文搜尋」，不是標籤篩選 ——
                    // 搜「系统」會撈回一堆只是內文提到系統、標籤完全不是系統的作品，
                    // 所以這裡必須再用 tags 精確比對，否則推薦池會混進一堆無關標籤。
                    for (let r of await Promise.all(tagP)) {
                        if (!r) continue;
                        for (let c of r.res.search_full || []) {
                            let tags = String(c.tags || "").split(",").map((t) => t.trim());
                            let name = String(c.name || "");
                            // 標籤命中，或作品名直接帶該關鍵詞，才算這個題材
                            if (tags.indexOf(r.tag) >= 0 || name.indexOf(r.tag) >= 0) add(c);
                        }
                    }
                    if (pool.length) {
                        parts.push({
                            title: "首页推荐",
                            comics: pool.map((c) => this.parseComic(c, "desc")),
                        });
                    }
                } catch (e) {}
                // ② 周期更新：按 updatedAt 算出「星期几更新」，分到周一~周日
                try {
                    let pool = [];
                    let home = await homeP;      // 同一 Promise，不會重複發請求
                    if (home) {
                        for (let g of home.home_content_list || []) {
                            pool.push(...(g.comic_list || []));
                        }
                    }
                    let rank = await rankP;
                    if (rank) {
                        for (let g of rank.rank_list || []) {
                            pool.push(...(g.comic_list || []));
                        }
                    }
                    for (let data of await Promise.all(catP)) {
                        if (!data) continue;
                        pool.push(...(data.category_list || []));
                    }
                    let names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
                    let buckets = [[], [], [], [], [], [], []];
                    let seen = {};
                    for (let c of pool) {
                        if (!c || !c.updatedAt) continue;
                        let id = String(c.id);
                        if (seen[id]) continue;
                        seen[id] = 1;
                        let w = new Date(Number(c.updatedAt) * 1000).getDay();
                        if (isNaN(w)) continue;
                        // v2.25.0：不再封頂 12 本 —— 池裡有多少給多少，
                        // App「查看更多」會全部列出
                        buckets[w].push(this.parseComic(c, "chapter"));
                    }
                    for (let i of [1, 2, 3, 4, 5, 6, 0]) {
                        if (buckets[i].length) {
                            parts.push({ title: names[i], comics: buckets[i] });
                        }
                    }
                } catch (e) {}
                if (!parts.length) throw new Error("探索页加载失败" + (errors.length ? ": " + errors.slice(0, 2).join("; ") : ""));
                return parts;
            },
        },
    ];


    // 圖片 URL -> 線路索引 / 原始路徑, 供失敗換線使用
    _imgLine = {};
    _imgPath = {};
    _lineOrder = null;   // 測速後的線路優先順序 (索引數組)

    _diagnosticBusy = false;

    async diagnosticTimeout(task, ms) {
        // The host supplies setTimeout without a timer ID or clearTimeout.
        // Ignore the eventual callback after resolution instead of cancelling it.
        return new Promise((resolve, reject) => {
            let settled = false;
            setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error("超时"));
            }, ms);
            Promise.resolve(task).then((value) => {
                if (settled) return;
                settled = true;
                resolve(value);
            }, (error) => {
                if (settled) return;
                settled = true;
                reject(error);
            });
        });
    }

    async diagnosticApi(base) {
        const start = Date.now();
        const r = await this.diagnosticTimeout(
            Network.get(base + Lizimh.signedPath("/app/api/v2/detail/57229"), Lizimh.apiHeaders()), 6000);
        if (r.status !== 200) throw new Error("HTTP " + r.status);
        const j = JSON.parse(r.body);
        if (j.code !== 201 || !j.data || !Array.isArray(j.data.chapters)) {
            throw new Error("非有效漫画接口响应");
        }
        return {ms: Date.now() - start, data: j.data};
    }

    async runDiagnosticTest(images) {
        if (this._diagnosticBusy) { UI.showMessage("测速仍在进行，请稍候"); return; }
        this._diagnosticBusy = true;
        let message;
        try {
            UI.showMessage(images ? "正在准备同一张样本图片，各线路并行下载…" : "正在并行验证 API 节点…");
            const bases = [Lizimh.api, Lizimh.apiFallback].filter((v,i,a) => a.indexOf(v) === i);
            const api = await Promise.all(bases.map(async base => {
                try { return {base, ok: true, ...await this.diagnosticApi(base)}; }
                catch (e) { return {base, ok: false, error: String(e)}; }
            }));
            api.sort((a,b) => Number(b.ok)-Number(a.ok) || (a.ms||0)-(b.ms||0));
            if (!images) {
                const shortError = (error) => {
                    const text = String(error || "");
                    if (/ENOTFOUND|DNS|lookup address/i.test(text)) return "DNS 不可用";
                    if (/timeout|超时/i.test(text)) return "连接超时";
                    const http = text.match(/HTTP \d{3}/);
                    return http ? http[0] : "连接失败";
                };
                message = api.map((r,i) => r.base + "\n" + (r.ok ? r.ms + "ms" + (i===0 ? " ★ 最快" : "") : shortError(r.error))).join("\n\n");
            } else {
                const available = api.find(r => r.ok);
                if (!available) throw new Error("API 均不可用，无法取得测试图片；未执行图片测速");
                const sample = available.data.chapters.find(c => typeof c.cover === "string" && /^\/(?!\/)/.test(c.cover));
                if (!sample) throw new Error("没有可用的相对路径图片样本");
                const results = await Promise.all(Lizimh.lines.map(async (line,i) => {
                    const start = Date.now();
                    try {
                        const n = await this.diagnosticTimeout((async () => {
                            const r = await fetch(this.lineAbs(sample.cover,i), {headers: {"User-Agent": "Mozilla/5.0", "Cache-Control": "no-cache"}});
                            if (r.status !== 200) throw new Error("HTTP " + r.status);
                            const bytes = new Uint8Array(await r.arrayBuffer());
                            const jpg = bytes[0]===255 && bytes[1]===216;
                            const png = bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71;
                            const webp = bytes[0]===82 && bytes[1]===73 && bytes[8]===87 && bytes[9]===69;
                            if (bytes.length < 1024 || !(jpg || png || webp)) throw new Error("响应非有效测试图片");
                            return bytes.length;
                        })(), 8000);
                        const ms = Math.max(1,Date.now()-start);
                        return {i, name:line.name, ok:true, n, ms, rate:n*1000/ms};
                    } catch (e) { return {i,name:line.name,ok:false,error:String(e)}; }
                }));
                results.sort((a,b) => Number(b.ok)-Number(a.ok) || (b.rate||0)-(a.rate||0));
                message = results.map((r,k) => r.name + "\n" + (r.ok ? (r.rate/1024).toFixed(1) + " KB/s · " + r.ms + "ms · " + (r.n/1024).toFixed(1) + " KB" + (k===0 ? " ★ 最快" : "") : /timeout|超时/i.test(String(r.error)) ? "连接超时" : "连接失败")).join("\n\n");
                message += "\n\n同一张图片的有效下载速度，含连接耗时；受缓存及并行竞争影响，不代表带宽上限。超时仅停止等待，宿主请求可能仍在完成。";
            }
            message += "\n\n仅报告结果，不自动切换线路。";
        } catch (e) { message = "测速失败：" + String(e); }
        finally { this._diagnosticBusy = false; }
        const title = images ? "图片下载测速" : "API 节点延迟";
        if (typeof UI.showDialog === "function") {
            UI.showDialog(title, message, [
                {text: "关闭", callback: () => {}},
                {text: "重新测试", callback: () => this.runDiagnosticTest(images)},
            ]);
        } else { UI.showMessage(message); }
    }

    // 當前使用哪條線 (auto 時用測速結果第一條)
    currentLine() {
        let setting = "auto";
        try { setting = this.loadSetting("imageLine") || "auto"; } catch (e) {}
        if (setting !== "auto") {
            let i = parseInt(setting);
            if (!isNaN(i) && i >= 0 && i < Lizimh.lines.length) return i;
        }
        if (this._lineOrder && this._lineOrder.length) return this._lineOrder[0];
        return 0;
    }

    lineUrl(idx) {
        let i = (idx === undefined || idx === null) ? this.currentLine() : idx;
        if (i < 0 || i >= Lizimh.lines.length) i = 0;
        return Lizimh.lines[i].url;
    }

    // 由相對路徑構造絕對 URL (供探測與換線使用)
    lineAbs(path, idx) {
        let i = (idx === undefined || idx === null) ? this.currentLine() : idx;
        if (i < 0 || i >= Lizimh.lines.length) i = 0;
        let line = Lizimh.lines[i];
        if (line.proxy && line.src) {
            return line.url + encodeURIComponent(line.src + path);
        }
        return line.url + path;
    }

    // 解析服務端下發的線路 JS (img_generator.code), 跳過加密線路
    static parseGenerators(code, generators) {
        let text = "";
        try {
            text = Convert.decodeUtf8(Convert.decodeBase64(code));
        } catch (e) {
            text = "";
        }
        let out = [];
        for (let gen of generators || []) {
            if (gen.encrypt === true) continue;      // 加密線路: 插件無法解碼, 直接跳過
            let fn = gen.func || "";
            let host = gen.url || "";
            let proxy = false, srcHost = "";
            if (fn && text) {
                let re = new RegExp("function\\s+" + fn + "\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}");
                let m = text.match(re);
                if (m) {
                    let body = m[1];
                    if (body.indexOf("encodeURIComponent") >= 0) {
                        proxy = true;
                        let pm = body.match(/return\s+"([^"]+)"\s*\+\s*encodeURIComponent/);
                        if (pm) host = pm[1];
                        let sm = body.match(/var\s+t\s*=\s*"([^"]+)"/);
                        if (sm) srcHost = sm[1];
                    } else {
                        let dm = body.match(/return\s+"([^"]*)"\s*\+\s*u/);
                        if (dm && dm[1]) host = dm[1];
                    }
                }
            }
            if (!host || !/^https?:\/\//.test(host)) continue;
            host = host.replace(/\/$/, "");
            if (srcHost) srcHost = srcHost.replace(/\/$/, "");
            out.push({
                name: gen.name || fn || ("线路" + (out.length + 1)),
                url: host,
                proxy: proxy,
                src: srcHost,
            });
        }
        return out;
    }

    abs(path) {
        if (!path) return "";
        if (path.startsWith("http")) return path;
        let line = Lizimh.lines[this.currentLine()] || Lizimh.lines[0];
        if (line.proxy && line.src) {
            return line.url + encodeURIComponent(line.src + path);
        }
        return line.url + path;
    }

    // 測速: 對每條線發一次 HEAD, 按延遲排序 (auto 模式使用)
    async speedTest() {
        // 只對直連線路測速（代理型線路單獨排到最後，避免探測繞代理而變慢）
        let direct = [], proxy = [];
        for (let i = 0; i < Lizimh.lines.length; i++) {
            (Lizimh.lines[i].proxy ? proxy : direct).push(i);
        }
        if (direct.length) {
            // v2.30.1：改成【並行】測速 + 短超時（原本逐條等 2.5 秒，
            // 有斷線線路時光是測速就要好幾秒 → 使用者感覺「載入慢成狗」）
            let measured = await Promise.all(direct.map(async (i) => {
                let t0 = Date.now();
                let ok = false;
                try {
                    let res = await Promise.race([
                        Network.sendRequest("HEAD", Lizimh.lines[i].url + "/", {}),
                        this.sleep(800).then(() => null),
                    ]);
                    ok = res && res.status && res.status < 500;
                } catch (e) { ok = false; }
                let dt = Date.now() - t0;
                return { i: i, ms: ok ? dt : 999999 };
            }));
            measured.sort((a, b) => a.ms - b.ms);
            this._lineMs = {};
            for (let m of measured) this._lineMs[m.i] = m.ms;
            this._lineOrder = measured.map((r) => r.i).concat(proxy);
            let best = Lizimh.lines[this._lineOrder[0]];
            console.log("[lizimh] 线路测速(仅直连): " + measured.map((r) =>
                Lizimh.lines[r.i].name + "=" + (r.ms > 900000 ? "超时" : r.ms + "ms")).join(", ")
                + " → 选用 " + best.name);
            return;
        }
        let results = [];
        for (let i = 0; i < Lizimh.lines.length; i++) {
            let t0 = Date.now();
            let ok = false;
            try {
                let res = await Promise.race([
                    Network.sendRequest("HEAD", Lizimh.lines[i].url + "/", {}),
                    this.sleep(2500).then(() => null),
                ]);
                ok = res && res.status && res.status < 500;
            } catch (e) { ok = false; }
            let dt = Date.now() - t0;
            results.push({ i: i, ms: ok ? dt : 999999 });
            await this.sleep(60);
        }
        results.sort((a, b) => a.ms - b.ms);
        this._lineOrder = results.map((r) => r.i);
        let best = Lizimh.lines[this._lineOrder[0]];
        console.log("[lizimh] 线路测速: " + results.map((r) =>
            Lizimh.lines[r.i].name + "=" + (r.ms > 900000 ? "超时" : r.ms + "ms")).join(", ")
            + " → 选用 " + best.name);
    }

    // 圖片加載失敗時, 換下一條線重試同一張圖
    nextLineUrl(url) {
        let path = this._imgPath[url];
        if (!path) {
            let m = String(url).match(/^https?:\/\/[^/]+(\/.*)$/);
            path = m ? m[1] : null;
        }
        if (!path) return null;
        let cur = this._imgLine[url];
        if (cur === undefined) cur = this.currentLine();
        let order = this._lineOrder || Lizimh.lines.map((_, i) => i);
        let pos = order.indexOf(cur);
        for (let k = 1; k <= order.length; k++) {
            let nxt = order[(pos + k) % order.length];
            if (nxt === cur) continue;
            let nu = Lizimh.lines[nxt].url + path;
            this._imgLine[nu] = nxt;
            this._imgPath[nu] = path;
            return nu;
        }
        return null;
    }

    // mode: undefined -> 用作者當副標題; "desc" -> 用簡介; "chapter" -> 用「第N话」
    parseComic(c, mode) {
        let sub = c.author || "";
        if (mode === "desc") {
            let t = String(c.content || "").replace(/\s+/g, " ").trim();
            sub = t.length > 22 ? t.substring(0, 22) + "…" : t;
        } else if (mode === "chapter") {
            let n = Number(c.nums);
            sub = n > 0 ? "第" + n + "话" : (Number(c.isend) === 1 ? "已完结" : "连载中");
        }
        return new Comic({
            id: String(c.id),
            title: c.name || "",
            subTitle: sub,
            cover: this.abs(c.picY || c.picX || c.cover),
            tags: (c.tags || "").split(",").filter((t) => t),
            description: c.content || "",
        });
    }

    // The app calls this (via the JS bridge) to fetch through the source's own
    // request path, which this host accepts where the app's client is rejected.
    apiFetch = async (path) => JSON.stringify(await Lizimh.getJson(path));

    static async getJson(path) {
        const bases = Lizimh._useFallback
            ? [Lizimh.apiFallback, Lizimh.api]
            : [Lizimh.api, Lizimh.apiFallback];
        const failures = [];
        for (const base of bases) {
            try {
                const res = await Network.get(base + Lizimh.signedPath(path), Lizimh.apiHeaders());
                if (res.status !== 200) throw new Error("HTTP " + res.status);
                const json = JSON.parse(res.body);
                if (json.code !== 201) {
                    throw new Error("API code " + json.code + ": " + (json.msg || ""));
                }
                Lizimh._useFallback = base === Lizimh.apiFallback;
                return json.data;
            } catch (e) {
                // Keep credentials and signed query strings out of our errors.
                const message = String(e);
                const http = message.match(/HTTP \d{3}/);
                failures.push(base + ": " + (http ? http[0] : "网络或响应格式错误"));
            }
        }
        throw new Error("栗子接口请求失败 " + String(path).split("?")[0] + " (" + failures.join("; ") + ")");
    }

    static fmtDate(iso) { return iso ? String(iso).substring(0, 10) : ""; }

    static statusByLastUpdate(iso) {
        if (!iso) return "未知";
        let days = (Date.now() - Date.parse(iso)) / 86400000;
        if (isNaN(days)) return "未知";
        if (days > 365) return "完结";
        if (days > 45) return "暂时完结";
        return "连载中";
    }

    async init() {
        this.loadPersistedPages();
        this.loadPersistedVerified();
        try {
            let data = await Lizimh.getJson("/app/api/configv2");
            let g = data.cfg_general || {};
            let tags = (g.category_tabs && g.category_tabs.length) ? g.category_tabs : Lizimh.fallbackTags;
            let cls = data.cfg_comic_class || [];
            let classes = cls.length ? cls.map((c) => [c.name, c.id]) : Lizimh.fallbackClasses;
            // 图片线路: 解析服务端下发的 JS, 跳过加密线路
            let ig = g.img_generator || {};
            let gens = ig.generators || [];
            let lines = Lizimh.parseGenerators(ig.code || "", gens);
            if (!lines.length) {
                // 退回: 只取非加密且非百度代理的直连线路
                for (let gen of gens) {
                    if (gen.encrypt === true) continue;
                    if (gen.url && /^https?:\/\//.test(gen.url) && !/baidu\.com/.test(gen.url)) {
                        lines.push({ name: gen.name || gen.func, url: gen.url.replace(/\/$/, "") });
                    }
                }
            }
            lines.push({ name: "备用 (cf-1.imgio.club)", url: "https://cf-1.imgio.club" });
            if (lines.length) Lizimh.lines = lines;
            // 依服務端線路重建設置項 (保留 auto)
            let opts = [{ value: "auto", text: "自动测速 (推荐)" }];
            for (let i = 0; i < Lizimh.lines.length; i++) {
                opts.push({ value: String(i), text: Lizimh.lines[i].name });
            }
            try {
                this.settings.imageLine.options = opts;
            } catch (e) {}
            // auto 模式: 測速選最快
            let mode = "auto";
            try { mode = this.loadSetting("imageLine") || "auto"; } catch (e) {}
            if (mode === "auto") {
                try { await this.speedTest(); } catch (e) {}
            }
            this.category = {
                title: "栗子漫画",
                parts: [
                    { name: "推荐", type: "fixed", categories: ["热门排行"], categoryParams: ["rank"], itemType: "category" },
                    { name: "题材", type: "fixed", categories: tags, categoryParams: tags.map((t) => "tag:" + t), itemType: "category" },
                    { name: "地区", type: "fixed", categories: classes.map((c) => c[0]), categoryParams: classes.map((c) => "class:" + c[1]), itemType: "category" },
                    { name: "状态", type: "fixed", categories: ["连载", "完结"], categoryParams: ["isend:0", "isend:1"], itemType: "category" },
                ],
            };
        } catch (e) {
            // 配置拉取失败用内置清单
        }
    }

    search = {
        load: async (keyword, options, page) => {
            let q = encodeURIComponent(keyword);
            let data = await Lizimh.getJson(`/app/api/search/full?q=${q}`);
            let list = data.search_full || [];
            return { comics: list.map((c) => this.parseComic(c)), maxPage: 1 };
        },
    };

    categoryComics = {
        load: async (category, param, options, page) => {
            let comics = [];
            let p = page || 1;
            if (param === "rank") {
                let data = await Lizimh.getJson("/app/api/rank/list");
                for (let g of data.rank_list || []) {
                    comics.push(...(g.comic_list || []).map((c) => this.parseComic(c)));
                }
            } else {
                // v2.25.0：支援組合篩選 "tag:格斗|class:3|isend:0" + 分頁，
                // 供 App 分類頁（篩選 chips + 即時網格）多條件查詢使用。
                let qsParts = [];
                for (let seg of String(param || "").split("|")) {
                    if (seg.startsWith("tag:")) qsParts.push("tag=" + encodeURIComponent(seg.substring(4)));
                    else if (seg.startsWith("class:")) qsParts.push("class=" + seg.substring(6));
                    else if (seg.startsWith("isend:")) qsParts.push("isend=" + seg.substring(6));
                }
                if (qsParts.length) {
                    let data = await Lizimh.getJson(`/app/api/category/list?${qsParts.join("&")}&page=${p}`);
                    comics = (data.category_list || []).map((c) => this.parseComic(c));
                } else {
                    // v2.25.1：「全部」（沒有任何篩選條件）= 未篩選的分類總列表
                    let data = await Lizimh.getJson(`/app/api/category/list?page=${p}`);
                    comics = (data.category_list || []).map((c) => this.parseComic(c));
                }
            }
            let seen = new Set();
            comics = comics.filter((c) => !seen.has(c.id) && seen.add(c.id));
            // 非空就允許繼續翻頁（抓回空頁即到底）
            return { comics: comics, maxPage: comics.length ? p + 1 : p };
        },
    };

    // v2.28.0：供 App「清除本漫畫快取」按鈕呼叫 ——
    // 清掉這部漫畫的頁數快取/已驗證頁清單/封面快取，並持久化
    resetComicCache(comicId) {
        let id = String(comicId || "");
        if (!id) return false;
        let hit = 0;
        // v2.29.2 修正：快取 key 是【圖片目錄】（例 /Manual/jARSPL8b/mcf4HZLK），
        // 目錄名裡沒有漫畫 id → 舊版用 id 匹配永遠清不到。
        // 正確做法：由這部漫畫每章的封面路徑推導出目錄，再逐一清除。
        let covers = this._coverCache[id] || null;
        if (covers) {
            for (let cid in covers) {
                let dir = String(covers[cid]).replace(/\/[^\/]+$/, "");
                if (this._pageCache[dir] !== undefined) {
                    delete this._pageCache[dir];
                    hit++;
                }
                delete this._verified[dir];
                // 官方順序快取（記憶體 + 持久化）
                delete this._officialCache[cid];
                try { this.saveData("officialPics_" + cid, ""); } catch (e) {}
            }
        }
        try { delete this._coverCache[id]; delete this._orderCache[id]; delete this._epMap[id]; delete this._coverById[id]; } catch (e) {}
        // 保險：任何路徑剛好含此 id 的也清掉
        for (let dir in this._pageCache) {
            if (dir.indexOf(id) >= 0) {
                delete this._pageCache[dir];
                delete this._verified[dir];
                hit++;
            }
        }
        this.persistPages();
        return hit;
    }

    // 官方順序快取: chapterId -> [url]
    _officialCache = {};

    // 章節封面快取: comicId -> {chapterId: coverPath}
    _coverCache = {};
    // 章節順序: comicId -> [章節序號 key...]
    _orderCache = {};
    // 章節序號 key -> 真正章節 id（v2.33.4：key 改用序號，見 loadInfo 註解）
    _epMap = {};
    // 真正章節 id -> 封面路徑（舊資料 / 舊 epId 回退用）
    _coverById = {};
    // 章節頁數快取: dir -> pageCount (記憶體)
    _pageCache = {};

    // 已逐頁校驗過的章節: dir -> [有效頁碼]（下載/二次閱讀用，避免缺頁導致 404）
    _verified = {};

    // 持久化快取 (跨啟動), 用宿主的 saveData/loadData
    persistPages() {
        try {
            let obj = {};
            let n = 0;
            for (let k in this._pageCache) { obj[k] = this._pageCache[k]; n++; if (n > 800) break; }
            this.saveData("pageCounts", JSON.stringify(obj));
        } catch (e) {}
    }
    loadPersistedVerified() {
        try {
            let raw = this.loadData("verifiedPages");
            if (raw) {
                let obj = JSON.parse(raw);
                for (let k in obj) this._verified[k] = obj[k];
            }
        } catch (e) {}
    }

    loadPersistedPages() {
        try {
            let raw = this.loadData("pageCounts");
            if (raw) {
                let obj = JSON.parse(raw);
                for (let k in obj) this._pageCache[k] = obj[k];
            }
        } catch (e) {}
    }

    // v2.29.0：取官方章節圖片順序（需要登入憑證）
    // 有些章節是人工上傳、檔名編號與閱讀順序不一致（例：第153话 官方順序是
    // 1..12, 49, 13, 14...），只有官方接口回的 pics 才是正確順序。
    async officialPics(chapterId) {
        // 沒有章節 id 就不要發請求（日誌曾出現 chapter/v3/null）
        if (chapterId === null || chapterId === undefined || String(chapterId) === "") return null;
        let token = "";
        try { token = String(this.loadSetting("authToken") || "").trim(); } catch (e) {}
        token = token.replace(/^jwt:\s*/i, "").replace(/^Bearer\s+/i, "").trim();
        if (!token) return null;
        let key = "officialPics_" + String(chapterId);
        // 失敗冷卻：接口掛掉/限流時不要每開一章都卡一次
        try {
            let until = parseInt(this.loadData("officialPicsSignedCooldown") || "0", 10) || 0;
            if (Date.now() < until) return null;
        } catch (e) {}
        if (this._officialCache[String(chapterId)]) {
            return this._officialCache[String(chapterId)].slice();
        }
        // 持久化快取：官方順序不會變，抓過一次就存起來
        //（這個接口會消耗帳號的閱讀額度，別重複抓）
        try {
            let saved = this.loadData(key);
            if (saved) {
                let arr = JSON.parse(saved);
                if (arr && arr.length) {
                    this._officialCache[String(chapterId)] = arr;
                    return arr.slice();
                }
            }
        } catch (e) {}
        try {
            let res = null;
            const bases = [Lizimh._useFallback ? Lizimh.apiFallback : Lizimh.api,
                           Lizimh._useFallback ? Lizimh.api : Lizimh.apiFallback];
            for (let bi = 0; bi < bases.length && (!res || res.status !== 200); bi++) {
                try {
                    res = await Network.get(
                        bases[bi] + Lizimh.signedPath("/app/api/chapter/v3/" + chapterId),
                        Lizimh.apiHeaders({ "authorization": token }));
                    if (res && res.status === 200) Lizimh._useFallback = bases[bi] === Lizimh.apiFallback;
                } catch (e) {
                    res = null;
                }
            }
            if (!res || res.status !== 200) {
                try { this.saveData("officialPicsSignedCooldown", String(Date.now() + 10 * 60 * 1000)); } catch (e) {}
                return null;
            }
            if (!res || res.status !== 200) return null;
            let data = JSON.parse(res.body);
            let pics = (data && data.data && data.data.pics) || [];
            if (!pics.length) return null;
            let out = pics.map((x) => this.abs(String(x)));
            this._officialCache[String(chapterId)] = out;
            try { this.saveData(key, JSON.stringify(out)); } catch (e) {}
            return out.slice();
        } catch (e) {
            return null;
        }
    }

    // v2.33.4：epId（章節序號 key）→ 真正章節 id。
    // 舊資料（歷史紀錄／下載佇列裡存的是章節 id）沒有對應就原樣返回，
    // 這樣舊書籤照樣能載入，只是顯示位置按序號算。
    resolveEp(comicId, epId) {
        const m = this._epMap[String(comicId)];
        const k = String(epId);
        return (m && m[k]) ? m[k] : k;
    }

    // v2.33.2：背景預取「下一話」——讀者切下一話時就不用現場探測/等接口。
    // （官方 App 也是這樣做，所以它切話幾乎秒開。）
    async warmNext(comicId, epId) {
        try {
            let order = this._orderCache[String(comicId)];
            if (!order || !order.length) {
                await this.chapterCovers(comicId);
                order = this._orderCache[String(comicId)];
            }
            if (!order || !order.length) return;
            let idx = order.indexOf(String(epId));
            if (idx < 0 || idx + 1 >= order.length) return;
            let nextId = order[idx + 1];
            // ① 有 JWT → 先抓官方順序（最準且不用探測）
            let ok = false;
            try {
                let official = await this.officialPics(this.resolveEp(comicId, nextId));
                ok = !!(official && official.length);
            } catch (e) {}
            if (ok) return;
            // ② 沒官方 → 至少把頁數快取預熱（背景探測，不阻塞當前章節）
            let covers = this._coverCache[String(comicId)] || null;
            let cover = covers ? covers[nextId] : null;
            if (!cover) return;
            let m = String(cover).match(/^(.*)\/(\d+)\.([A-Za-z0-9]+)$/);
            if (!m) return;
            let dir = m[1], coverPage = parseInt(m[2]) || 1, ext = m[3];
            let maxPages = 300;
            try { maxPages = parseInt(this.loadSetting("maxPages") || "300"); } catch (e) {}
            if (this._verified[m[1]]) return;
            await this.probePages(dir, ext, maxPages, coverPage);
        } catch (e) {}
    }

    async chapterCovers(comicId) {
        if (this._coverCache[comicId]) return this._coverCache[comicId];
        let data = await Lizimh.getJson(`/app/api/v2/detail/${comicId}`);
        let map = {};
        const epMap = this._epMap[String(comicId)] || null;
        const rev = {};
        if (epMap) for (let k in epMap) rev[epMap[k]] = k;
        for (let ch of data.chapters || []) {
            if (ch.cover) {
                const cid = String(ch.id);
                map[rev[cid] || cid] = ch.cover;
            }
        }
        this._coverCache[comicId] = map;
        return map;
    }

    // 由 cover 路徑推導同目錄下的全部頁面
    //  優化要點 (實測):
    //   1. GET + Range: 單次 ~116ms, 遠快於 HEAD 的 ~560ms
    //   2. 並行上限 6 (HTTP/1.1 每主機連接數): 超過會排隊反而變慢
    //   3. 先按 1,2,4,8,16,32 跨度並行探一次夾出區間, 再在區間內並行細分
    async probePages(dir, ext, maxPages, coverPage) {
        const url = (i) => this.lineAbs(dir + "/" + i + "." + ext);
        const headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
            "Range": "bytes=0-0",
        };
        const LIMIT = 6;
        // 單頁存在性: GET + Range, 200/206 = 存在, 404 = 不存在
        // 關鍵：CDN 對「不存在的頁」會回 HTTP 200 + 82 字節占位圖，
        // 所以必須用尺寸判斷，否則探測出的總頁數會虛高（下載就會 404）
        const isReal = (res) => {
            if (res.status === 206) return true;          // Range 命中 = 真圖
            if (res.status !== 200) return false;
            let len = 0;
            try {
                let h = res.headers || {};
                let cl = h["content-length"] || h["Content-Length"] || h["Content-length"];
                if (cl !== undefined) len = parseInt(cl, 10) || 0;
            } catch (e) {}
            if (!len && res.body) len = res.body.length;
            return len >= 1024;
        };
        const exists = async (i) => {
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    let res = await Network.sendRequest("GET", url(i), headers);
                    if (res.status === 404 || res.status === 403 || res.status === 400) return false;
                    if (res.status === 429 || res.status === 503) { await this.sleep(200 * (attempt + 1)); continue; }
                    return isReal(res);
                } catch (e) { await this.sleep(100 * (attempt + 1)); }
            }
            return null;
        };
        // 分批並行 (最多 LIMIT 個同時)
        const probeAll = async (idxs) => {
            let out = [];
            for (let i = 0; i < idxs.length; i += LIMIT) {
                let chunk = idxs.slice(i, i + LIMIT);
                let r = await Promise.all(chunk.map((x) => exists(x)));
                out = out.concat(r);
                if (r.some((x) => x === false)) break;   // 已找到邊界, 不必再掃
            }
            return out;
        };
        const build = (n) => { let o = []; for (let i = 1; i <= n; i++) o.push(url(i)); return o; };

        if (this._verified[dir] && this._verified[dir].length) {
            return this._verified[dir].slice();
        }
        if (this._pageCache[dir] && !this._verified[dir]) {
            // 快取只當「起點」，回傳前一定要驗證：
            // 舊版探測曾把 CDN 的 82 字節佔位圖當成真圖，偏大的頁數已被
            // 持久化 → 直接回傳就會給出「超出真實結尾」的頁面 → 下載 404
            // （閱讀器有 fallback 能忍，下載器一錯就整條失敗）。
            const cached = this._pageCache[dir];
            const lastOk = await exists(cached);
            if (lastOk === true) {
                const nextGone = await exists(cached + 1);
                // 只有「下一頁也連續不存在」才相信快取；否則丟掉重探
                //（單頁缺失可能只是抖動，重探會給出正確的完整清單）
                const nextGone2 = nextGone === false ? await exists(cached + 2) : null;
                if (nextGone === false && nextGone2 === false) {
                    this._verified[dir] = build(cached);
                    this._pageCache[dir] = cached;
                    return this._verified[dir].slice();
                }
            }
            // 校驗不通過：丟掉舊快取，走完整探測
            delete this._pageCache[dir];
        }

        // v2.31.2（用戶要求）：每一章都當成全新章節 → 一律從第 1 頁開始探測。
        // 舊版會拿「本章封面圖的頁碼」當起點（例：封面是第 68 頁就從 68 開始），
        // 但封面頁碼可能大於實際總頁數（人工上傳的章節很常見）→ 探測起點錯誤
        // 就會找不到真正的末頁。改成一律從 1 開始，只往後推。
        // 封面頁碼（coverPage）不使用；每章一律從第 1 頁重新探測

        // v2.33.0（用戶建議的優化）：
        // 第一輪：一次並行探 1,25,50,75,…,maxPages（步長 25，最多十幾個請求）
        //         → 找出最後一個「存在」的頁碼 lastOk
        // 第二輪：在 (lastOk, lastOk+25) 這個小區間內【一次全部並行】探完
        // 兩輪就定位到真實末頁，比舊版「多輪二分」快好幾倍。
        const stride = 25;
        const grid = [];
        for (let n = 1; n <= maxPages; n += stride) grid.push(n);
        if (grid[grid.length - 1] !== maxPages) grid.push(maxPages);
        const gridRes = await Promise.all(grid.map((n) => exists(n)));
        let lastOk = 0;
        for (let k = 0; k < grid.length; k++) {
            if (gridRes[k] === true) {
                lastOk = grid[k];
            } else if (gridRes[k] === false && lastOk > 0) {
                break;   // 已經明確越過末頁，不必再往後看
            }
        }
        if (lastOk < 1) lastOk = 1;
        const hiBase = Math.min(lastOk + stride, maxPages + 1);
        const inner = [];
        for (let n = lastOk + 1; n < hiBase; n++) inner.push(n);
        if (inner.length) {
            const innerRes = await Promise.all(inner.map((n) => exists(n)));
            for (let k = 0; k < innerRes.length; k++) {
                if (innerRes[k] === true) lastOk = inner[k];
            }
        }
        let lo = lastOk;
        if (lo < 1) lo = 1;

        // ===== v2.27.0 修正：頁數寧可多算，絕不少算 =====
        // 舊版會把「探測失敗的頁」從清單中刪掉 —— 但探測失敗多半只是 CDN
        // 抖動（或 429 限流），刪一頁會讓它之後的所有頁整章錯位（用戶反饋：
        // 第153話之後圖片順序完全混亂）。現在改成：
        //   1) 二分之後再向後多探 5 頁，確認真的到底；
        //   2) 只有【連續兩頁】都明確不存在，才承認 lo 是最後一頁；
        //   3) 任何探測失敗都不再刪頁（個別頁真的壞了，由 resolvePageUrl
        //      逐頁換線路/換擴展名處理，或閱讀器重試）。
        let scan = lo;
        for (let k = 0; k < 5; k++) {
            let e = await exists(scan + 1);
            if (e === true) { scan = scan + 1; continue; }
            break;
        }
        {
            const e1 = await exists(scan + 1);
            const e2 = e1 === false ? await exists(scan + 2) : null;
            if (e1 === true || (e1 === null && e2 === true)) {
                // 真的還有 → 逐步往後推到邊界
                let cursor = scan + 1;
                for (let k = 0; k < 10; k++) {
                    let e = await exists(cursor);
                    if (e === true) { cursor = cursor + 1; continue; }
                    break;
                }
                scan = Math.max(scan, cursor - 1);
            } else if (e1 === false && e2 === false) {
                // 連續兩頁缺失 → 確認到底
            } else if (e1 === false && e2 !== false) {
                // 第一頁缺失但下一頁還在（可疑）→ 保守多算一頁
                scan = scan + 1;
            }
        }
        lo = scan;
        // v2.33.3：有些章節的頁碼不是從 1 開始（實測某日漫第1~4頁是 404，
        // 第 5 頁才開始）→ 舊版固定從 1 開始，第一張圖就 404，閱讀器卡死。
        // 這裡往前探 1~10 頁，找出第一張真正存在的頁當起點。
        let firstOk = 1;
        {
            const head = [];
            const headMax = Math.min(10, lo);
            for (let n = 1; n <= headMax; n++) head.push(n);
            const headRes = await Promise.all(head.map((n) => exists(n)));
            let found = 0;
            for (let k = 0; k < headRes.length; k++) {
                if (headRes[k] === true) { found = head[k]; break; }
            }
            if (found > 0) firstOk = found;
        }
        let valid = [];
        for (let i = firstOk; i <= lo; i++) valid.push(i);
        this._pageCache[dir] = lo;
        this.persistPages();
        this.scheduleVerify(dir, ext, lo);
        // 背景預取下一話（fire-and-forget，不阻塞本次回傳）
        try { this.warmNext(comicId, epId); } catch (e) {}
        let imgs = [];
        for (let i of valid) imgs.push(url(i));
        return imgs;
    // 背景預取下一話（fire-and-forget，不影響本次回傳）
    // 放在這裡而不是 loadEp 開頭，是為了讓「當前章節」優先拿到結果。
    }

    scheduleVerify(dir, ext, total) {
        if (this._verified[dir]) return;
        let self = this;
        try {
            setTimeout(() => {
                self.verifyAllPages(dir, ext, total);
            }, 700);
        } catch (e) {}
    }

    // 逐頁解析：找出「這一頁」真實可用的 URL（哪條線路 + 哪個擴展名）
    // 目的：不因某條 CDN 缺頁就丟掉該頁，改為到其他線路/擴展名上找到它
    async resolvePageUrl(dir, ext, i) {
        const exts = [];
        for (let e of [ext, "jpg", "webp", "jpeg", "png"]) {
            if (e && exts.indexOf(e) < 0) exts.push(e);
        }
        const headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
            "Range": "bytes=0-0",
        };
        const ok = async (u) => {
            try {
                let r = await Network.sendRequest("GET", u, headers);
                if (r.status === 206) return true;         // Range 命中 = 真圖
                if (r.status !== 200) return false;
                // 200：可能是占位小圖，用長度判斷（<1KB 視為無效）
                let len = 0;
                try {
                    let h = r.headers || {};
                    let raw = h["content-length"] || h["Content-Length"] ||
                              (h["Content-Length"] === undefined ? undefined : h["Content-Length"]);
                    if (raw !== undefined) len = parseInt(raw, 10) || 0;
                } catch (e) {}
                if (!len && r.body) len = r.body.length;
                return len >= 1024;
            } catch (e) {
                return false;
            }
        };
        // 先直連線路 × 各擴展名
        for (let li = 0; li < Lizimh.lines.length; li++) {
            if (Lizimh.lines[li].proxy) continue;
            for (let e of exts) {
                let u = this.lineAbs(dir + "/" + i + "." + e, li);
                if (await ok(u)) return u;
            }
        }
        // 再用代理線路兜底
        for (let li = 0; li < Lizimh.lines.length; li++) {
            if (!Lizimh.lines[li].proxy) continue;
            for (let e of exts) {
                let u = this.lineAbs(dir + "/" + i + "." + e, li);
                if (await ok(u)) return u;
            }
        }
        return null;
    }

    // 逐頁解析全章（6 並行），得到「每頁都能用」的完整 URL 清單並持久化
    async verifyAllPages(dir, ext, total) {
        try {
            let urls = [];
            let missing = [];
            const B = 6;
            for (let start = 1; start <= total; start += B) {
                const chunk = [];
                for (let i = start; i < start + B && i <= total; i++) chunk.push(i);
                const res = await Promise.all(
                    chunk.map((i) => this.resolvePageUrl(dir, ext, i))
                );
                for (let k = 0; k < chunk.length; k++) {
                    if (res[k]) urls.push(res[k]);
                    else missing.push(chunk[k]);
                }
                await this.sleep(40);
            }
            this._verified[dir] = urls;
            this.persistVerified();
            if (missing.length) {
                console.log("[lizimh] " + dir + " 有 " + missing.length +
                    " 頁在所有線路都找不到: " + missing.slice(0, 12).join(","));
            } else {
                console.log("[lizimh] " + dir + " 全 " + urls.length + " 頁解析完成（無缺頁）");
            }
        } catch (e) {}
    }

    persistVerified() {
        try {
            let n = 0, obj = {};
            for (let k in this._verified) { obj[k] = this._verified[k]; if (++n > 60) break; }
            this.saveData("verifiedPages", JSON.stringify(obj));
        } catch (e) {}
    }

    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    comic = {
        loadInfo: async (id) => {
            let data = await Lizimh.getJson(`/app/api/v2/detail/${id}`);
            let chapters = {};
            let covers = {};
            let chapterCovers = {};
            // v2.33.4 關鍵修正：章節 key 必須是「章節序號」，不能是章節 id。
            // ECMAScript 規定物件 key 只要是整數字串，列舉時一律按【數值升序】，
            // 插入順序完全無效 —— 用章節 id 當 key 時，後期補上/重傳的章節
            // （id 比前後都大）會被自動搬到後面，造成章節清單亂序。
            // 實測「魔皇大管家」：原順序 72,73,74… 變成 72,74,…,85,
            // 《通知》,89,91,[73,83,86,87,88,90],92…（正是使用者看到的樣子）
            const numOf = (ch) => {
                let o = parseInt(ch.order);
                if (isFinite(o) && o > 0) return o;
                const m = String(ch.name || "").match(/第\s*(\d+)\s*[话話]/);
                return m ? parseInt(m[1]) : 0;
            };
            let raw = (data.chapters || []).slice();
            raw.sort((a, b) => (numOf(a) || 1e9) - (numOf(b) || 1e9));
            let order = [];
            let epMap = {};
            let coverById = {};
            let prevOrder = 0;
            // 章節封面：源站每個章節都帶一張「該章內頁」路徑（如 /2/58342/2202527/25.jpg），
            // 直接拿它當封面（就是漫畫裡的一張圖）。沒有 cover 的章節沿用最近一張，
            // 這樣「無論如何都有封面」而不是空白 —— 但載入內頁用的 covers 只放真正屬於
            // 該章的路徑，避免探測到別章的目錄。
            let lastCover = "";
            for (let ch of raw) {
                let o = numOf(ch);
                if (!o || o <= prevOrder) o = prevOrder + 1; // key 唯一且嚴格遞增
                prevOrder = o;
                let key = String(o);
                let chId = String(ch.id);
                epMap[key] = chId;
                coverById[chId] = ch.cover || "";
                chapters[key] = ch.name || `第${o}话`;
                if (ch.cover) {
                    covers[key] = ch.cover;
                    lastCover = ch.cover;
                }
                if (lastCover) chapterCovers[key] = this.abs(lastCover);
                order.push(key);
            }
            this._epMap[String(id)] = epMap;
            this._coverById[String(id)] = coverById;
            this._coverCache[String(id)] = covers;
            this._orderCache[String(id)] = order;
            let lastIso = raw.length ? raw[raw.length - 1].created_at : "";
            let tags = {
                "作者": (data.author || "").split(",").filter((t) => t),
                "标签": (data.tags || "").split(",").filter((t) => t),
                "状态": [Lizimh.statusByLastUpdate(lastIso)],
            };
            if (data.score && Number(data.score) > 0) tags["评分"] = ["评分" + data.score];

            return new ComicDetails({
                title: data.name || "",
                cover: this.abs(data.picY || data.picX),
                description: data.content || "",
                tags: tags,
                chapters: chapters,
                chapterCovers: chapterCovers,
                stars: data.score ? Number(data.score) : null,
                updateTime: lastIso ? Lizimh.fmtDate(lastIso) : null,
            });
        },

        loadEp: async (comicId, epId) => {
            // A restored reader may load a chapter before loadInfo has run in
            // this source instance. Rebuild the mapping before resolving it.
            if (!this._epMap[String(comicId)]) {
                await this.comic.loadInfo(comicId);
            }
            // v2.33.4：epId 現在是章節序號，先換回真正章節 id
            const chId = this.resolveEp(comicId, epId);
            // v2.29.0：設定了官方憑證 → 直接用官方順序（最準，解決亂序章節）
            try {
                const official = await this.officialPics(chId);
                if (official && official.length) {
                    try { this.warmNext(comicId, epId); } catch (e) {}
                    return { images: official };
                }
            } catch (e) {}
            let covers = await this.chapterCovers(comicId);
            let cover = covers[String(epId)];
            if (!cover) {
                const byId = this._coverById[String(comicId)] || {};
                cover = byId[chId] || null; // 舊 epId（章節 id）的回退
            }
            if (!cover) throw new Error("找不到该章节的图片路径");
            // 形如 /102/58342/2fd5.../6c4b.../97.webp 或 /2/59726/2770805/16.jpg
            let m = String(cover).match(/^(.*)\/(\d+)\.([A-Za-z0-9]+)$/);
            if (!m) throw new Error("章节路径格式异常: " + cover);
            let dir = m[1], ext = m[3], coverPage = parseInt(m[2]) || 1;
            let maxPages = 300;
            try { maxPages = parseInt(this.loadSetting("maxPages") || "300"); } catch (e) {}
            let images = await this.probePages(dir, ext, maxPages, coverPage);
            if (!images.length) throw new Error("该章节图片探测失败");
            let line = this.currentLine();
            for (let u of images) {
                this._imgLine[u] = line;
                this._imgPath[u] = u.substring(Lizimh.lines[line].url.length);
            }
            return { images: images };
        },

        onImageLoad: (url, comicId, epId) => {
            let self = this;
            return {
                headers: {
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
                },
                onLoadFailed: () => {
                    let alt = self.nextLineUrl(url);
                    if (!alt) return undefined;
                    return { url: alt };
                },
            };
        },
        onThumbnailLoad: (url) => { return {}; },
    };
}
