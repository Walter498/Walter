/** @type {import('./_venera_.js')} */

/**
 * 栗子漫画 (lizimh) 源  v2.14.0
 *
 * API:   http://ai.qsmm.fun      (配置 AES-ECB 解出, 無需簽名)
 * 圖片:  多條線路可選 (配置下發 generators)
 *
 * 新版 (2026-09) 變更與本源的對策:
 *   - 章節接口 v1/v2 返回誘餌數據, v3 需登錄且受閱讀時間限制 (本源不使用)
 *   - 突破: 詳情接口 /app/api/v2/detail/{id} 仍開放, 且章節自帶 cover 路徑
 *           cover = /{scheme}/{comicId}/{dir...}/{page}.{ext}
 *           同目錄下 1..N 頁可直接訪問, 無簽名/無登錄/無閱讀時間限制
 *   - 故: 用 cover 推導目錄, 二分探測總頁數, 直接拼出全部圖片 URL
 */

class Lizimh extends ComicSource {
    name = "栗子漫画";
    key = "lizimh";
    version = "2.14.0";
    minAppVersion = "1.2.2";
    url = "https://raw.githubusercontent.com/Walter498/Walter/main/lizimh.js";

    static api = "http://ai.qsmm.fun";
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
                try {
                    let home = await Lizimh.getJson("/app/api/home/data");
                    for (let g of home.home_content_list || []) {
                        let comics = (g.comic_list || []).map((c) => this.parseComic(c));
                        if (comics.length) parts.push({ title: g.title || "推荐", comics: comics });
                    }
                } catch (e) {}
                try {
                    let rank = await Lizimh.getJson("/app/api/rank/list");
                    for (let g of rank.rank_list || []) {
                        let comics = (g.comic_list || []).map((c) => this.parseComic(c));
                        if (comics.length) parts.push({ title: g.title || g.name || "排行", comics: comics });
                    }
                } catch (e) {}
                if (!parts.length) throw new Error("探索页加载失败");
                return parts;
            },
        },
    ];

    // 圖片 URL -> 線路索引 / 原始路徑, 供失敗換線使用
    _imgLine = {};
    _imgPath = {};
    _lineOrder = null;   // 測速後的線路優先順序 (索引數組)

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
            let measured = [];
            for (let i of direct) {
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
                measured.push({ i: i, ms: ok ? dt : 999999 });
                await this.sleep(60);
            }
            measured.sort((a, b) => a.ms - b.ms);
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

    parseComic(c) {
        return new Comic({
            id: String(c.id),
            title: c.name || "",
            subTitle: c.author || "",
            cover: this.abs(c.picY || c.picX || c.cover),
            tags: (c.tags || "").split(",").filter((t) => t),
            description: c.content || "",
        });
    }

    static async getJson(path) {
        let res = await Network.get(Lizimh.api + path, { "Accept": "application/json" });
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        let json = JSON.parse(res.body);
        if (json.code !== 201) throw new Error(`API code ${json.code}: ${json.msg || ""}`);
        return json.data;
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
            if (param === "rank") {
                let data = await Lizimh.getJson("/app/api/rank/list");
                for (let g of data.rank_list || []) {
                    comics.push(...(g.comic_list || []).map((c) => this.parseComic(c)));
                }
            } else {
                let qs = "";
                if (param.startsWith("tag:")) qs = "tag=" + encodeURIComponent(param.substring(4));
                else if (param.startsWith("class:")) qs = "class=" + param.substring(6);
                else if (param.startsWith("isend:")) qs = "isend=" + param.substring(6);
                if (qs) {
                    let data = await Lizimh.getJson(`/app/api/category/list?${qs}`);
                    comics = (data.category_list || []).map((c) => this.parseComic(c));
                }
            }
            let seen = new Set();
            comics = comics.filter((c) => !seen.has(c.id) && seen.add(c.id));
            return { comics: comics, maxPage: 1 };
        },
    };

    // 章節封面快取: comicId -> {chapterId: coverPath}
    _coverCache = {};
    // 章節順序: comicId -> [chapterId...]
    _orderCache = {};
    // 同漫畫最近一次探測到的頁數 (作為提示)
    _lastCount = {};
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

    async chapterCovers(comicId) {
        if (this._coverCache[comicId]) return this._coverCache[comicId];
        let data = await Lizimh.getJson(`/app/api/v2/detail/${comicId}`);
        let map = {};
        for (let ch of data.chapters || []) {
            if (ch.cover) map[String(ch.id)] = ch.cover;
        }
        this._coverCache[comicId] = map;
        return map;
    }

    // 由 cover 路徑推導同目錄下的全部頁面
    //  優化要點 (實測):
    //   1. GET + Range: 單次 ~116ms, 遠快於 HEAD 的 ~560ms
    //   2. 並行上限 6 (HTTP/1.1 每主機連接數): 超過會排隊反而變慢
    //   3. 先按 1,2,4,8,16,32 跨度並行探一次夾出區間, 再在區間內並行細分
    async probePages(dir, ext, maxPages, coverPage, hint) {
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
        if (this._pageCache[dir]) {
            // 先用快速清單回應（不阻塞），同時後台校驗全章頁碼
            this.scheduleVerify(dir, ext, this._pageCache[dir]);
            return build(this._pageCache[dir]);
        }

        let lo = Math.max(1, Math.min(coverPage || 1, maxPages));
        // 用同漫畫已知頁數作為額外下界參考
        if (hint && hint > lo && hint <= maxPages) lo = Math.min(hint, maxPages);

        // 第一輪: 跨度 1,2,4,8,16,32 並行探, 一次夾出上界
        let hi = null;
        let span = 1;
        while (hi === null && lo + span <= maxPages + 1) {
            const probes = [];
            for (let k = span, n = 0; n < LIMIT && lo + k <= maxPages; k *= 2, n++) probes.push(lo + k);
            if (!probes.length) break;
            const res = await probeAll(probes);
            let idx = -1;
            for (let k = 0; k < probes.length; k++) { if (res[k] === false) { idx = k; break; } }
            if (idx >= 0) {
                hi = probes[idx];
                lo = idx === 0 ? lo : probes[idx - 1];
            } else {
                if (res.some((x) => x === null)) break;
                lo = probes[probes.length - 1];
                span *= 2;
            }
        }
        if (hi === null) hi = Math.min(lo + 1, maxPages + 1);

        // 第二輪: 區間內並行細分 (每批 6 個)
        let guard = 0;
        while (hi - lo > 1 && guard++ < 20) {
            const mids = [];
            const step = Math.max(1, Math.floor((hi - lo) / (LIMIT + 1)));
            for (let m = lo + step; m < hi && mids.length < LIMIT; m += step) mids.push(m);
            if (!mids.length) break;
            const res = await Promise.all(mids.map((m) => exists(m)));
            let nl = lo, nh = hi;
            for (let k = 0; k < mids.length; k++) {
                if (res[k] === true) nl = Math.max(nl, mids[k]);
                else if (res[k] === false) nh = Math.min(nh, mids[k]);
            }
            if (nl === lo && nh === hi) break;
            lo = nl; hi = nh;
        }

        if (lo < 1) lo = 1;
        // 驗證尾段與中段若干頁，剔除不存在者（推導可能出錯，會導致整章下載失敗）
        let valid = [];
        for (let i = 1; i <= lo; i++) valid.push(i);
        try {
            const check = [];
            for (let k = Math.max(1, lo - 2); k <= lo; k++) check.push(k);
            const mid = Math.floor(lo / 2);
            for (let k = Math.max(1, mid - 1); k <= mid + 1; k++) check.push(k);
            const uniq = Array.from(new Set(check));
            const res = await Promise.all(uniq.map((i) => exists(i)));
            const bad = new Set();
            for (let k = 0; k < uniq.length; k++) if (res[k] === false) bad.add(uniq[k]);
            if (bad.size) {
                console.log("[lizimh] 过滤不存在的页: " + Array.from(bad).join(","));
                valid = valid.filter((i) => !bad.has(i));
            }
        } catch (e) {}
        this._pageCache[dir] = lo;
        this.persistPages();
        this.scheduleVerify(dir, ext, lo);
        let imgs = [];
        for (let i of valid) imgs.push(url(i));
        return imgs;
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

    // 後台預探下一章的頁數 (讓翻下一話秒開)
    async prefetchNext(comicId, epId) {
        try {
            let order = this._orderCache[String(comicId)];
            if (!order) return;
            let idx = order.indexOf(String(epId));
            if (idx < 0 || idx + 1 >= order.length) return;
            let nextId = order[idx + 1];
            let covers = this._coverCache[String(comicId)] || {};
            let cov = covers[nextId];
            if (!cov) return;
            let m = String(cov).match(/^(.*)\/(\d+)\.([A-Za-z0-9]+)$/);
            if (!m) return;
            let dir = m[1], ext = m[3], coverPage = parseInt(m[2]) || 1;
            if (this._pageCache[dir]) return;
            let hint = this._lastCount[String(comicId)] || 0;
            let maxPages = 300;
            try { maxPages = parseInt(this.loadSetting("maxPages") || "300"); } catch (e) {}
            await this.probePages(dir, ext, maxPages, coverPage, hint);
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
            let list = (data.chapters || []).slice().sort((a, b) => a.order - b.order);
            let order = [];
            for (let ch of list) {
                chapters[String(ch.id)] = ch.name || `第${ch.order}话`;
                if (ch.cover) covers[String(ch.id)] = ch.cover;
                order.push(String(ch.id));
            }
            this._coverCache[String(id)] = covers;
            this._orderCache[String(id)] = order;
            let lastIso = list.length ? list[list.length - 1].created_at : "";
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
            let covers = await this.chapterCovers(comicId);
            let cover = covers[String(epId)];
            if (!cover) throw new Error("找不到该章节的图片路径");
            // 形如 /102/58342/2fd5.../6c4b.../97.webp 或 /2/59726/2770805/16.jpg
            let m = String(cover).match(/^(.*)\/(\d+)\.([A-Za-z0-9]+)$/);
            if (!m) throw new Error("章节路径格式异常: " + cover);
            let dir = m[1], ext = m[3], coverPage = parseInt(m[2]) || 1;
            let maxPages = 300;
            try { maxPages = parseInt(this.loadSetting("maxPages") || "300"); } catch (e) {}
            let hint = this._lastCount[String(comicId)] || 0;
            let images = await this.probePages(dir, ext, maxPages, coverPage, hint);
            this._lastCount[String(comicId)] = images.length;
            // 後台預探下一章 (不阻塞當前返回)
            try {
                let self = this;
                setTimeout(() => { self.prefetchNext(comicId, epId); }, 400);
            } catch (e) {}
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
