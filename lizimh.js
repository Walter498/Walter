/** @type {import('./_venera_.js')} */

/**
 * 栗子漫画 (lizimh) 源  v2.4.0
 *
 * API:   http://ai.qsmm.fun      (配置 AES-ECB 解出, 無需簽名)
 * 圖片:  多條線路可選 (配置下發 generators)
 *
 * 新版 (2026-09) 變更與本源的對策:
 *   - 章節接口 v1 返回誘餌數據, v3 需要登錄 + 觀看廣告換閱讀時間
 *   - 突破: 詳情接口 /app/api/v2/detail/{id} 仍開放, 且章節自帶 cover 路徑
 *           cover = /{scheme}/{comicId}/{dir...}/{page}.{ext}
 *           同目錄下 1..N 頁可直接訪問, 無簽名/無登錄/無閱讀時間限制
 *   - 故: 用 cover 推導目錄, 二分探測總頁數, 直接拼出全部圖片 URL
 */

class Lizimh extends ComicSource {
    name = "栗子漫画";
    key = "lizimh";
    version = "2.4.0";
    minAppVersion = "1.2.2";
    url = "https://raw.githubusercontent.com/Walter498/Walter/main/lizimh.js";

    static api = "http://ai.qsmm.fun";
    // 圖片線路 (初始化時從 configv2 的 generators 覆蓋)
    static lines = [
        { name: "线路1 (CF优选海外)", url: "https://cdn.lzimg.xyz" },
        { name: "线路2 (mechat)", url: "http://img.mechat.fun" },
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
        authToken: {
            title: "账号令牌 (可选, 填了可秒开章节)",
            type: "input",
            validator: null,
            default: "",
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

    abs(path) {
        if (!path) return "";
        if (path.startsWith("http")) return path;
        return this.lineUrl() + path;
    }

    // 測速: 對每條線發一次 HEAD, 按延遲排序 (auto 模式使用)
    async speedTest() {
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
        try {
            let data = await Lizimh.getJson("/app/api/configv2");
            let g = data.cfg_general || {};
            let tags = (g.category_tabs && g.category_tabs.length) ? g.category_tabs : Lizimh.fallbackTags;
            let cls = data.cfg_comic_class || [];
            let classes = cls.length ? cls.map((c) => [c.name, c.id]) : Lizimh.fallbackClasses;
            // 图片线路: generators 里带 url 的项
            let gens = (g.img_generator && g.img_generator.generators) || [];
            let lines = [];
            for (let gen of gens) {
                if (gen.url && /^https?:\/\//.test(gen.url)) {
                    lines.push({ name: gen.name || gen.func || ("线路" + (lines.length + 1)), url: gen.url.replace(/\/$/, "") });
                }
            }
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
    // 章節頁數快取: dir -> pageCount (記憶體)
    _pageCache = {};

    // 持久化快取 (跨啟動), 用宿主的 saveData/loadData
    persistPages() {
        try {
            let obj = {};
            let n = 0;
            for (let k in this._pageCache) { obj[k] = this._pageCache[k]; n++; if (n > 800) break; }
            this.saveData("pageCounts", JSON.stringify(obj));
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

    authToken() {
        try { return (this.loadSetting("authToken") || "").trim(); } catch (e) { return ""; }
    }

    // 讀取時間狀態 (服務端)
    async readingReward() {
        let tk = this.authToken();
        if (!tk) return null;
        try {
            let res = await Network.get(Lizimh.api + "/app/api/ad/reward/progress", { "Authorization": tk });
            if (res.status !== 200) return null;
            let j = JSON.parse(res.body);
            return j.code === 201 ? j.data : null;
        } catch (e) { return null; }
    }

    // 用帳號令牌直取章節圖片 (v3 接口, 一次請求拿全部圖片)
    async loadEpV3(epId) {
        let tk = this.authToken();
        if (!tk) return null;
        let res = await Network.get(
            Lizimh.api + "/app/api/chapter/v3/" + epId,
            { "Authorization": tk, "Accept": "application/json" }
        );
        if (res.status !== 200) return null;
        let j = JSON.parse(res.body);
        if (j.code !== 201 || !j.data || !j.data.pics || !j.data.pics.length) return null;
        return j.data.pics.map((p) => this.abs(p));
    }

    // 由 cover 路徑推導同目錄下的全部頁面
    //  策略: 以封面頁碼 lo 為下界 -> 並行指數跳躍找上界 -> 並行二分收斂
    //  小章節通常 1~2 輪來回, 大章節 3~4 輪
    async probePages(dir, ext, maxPages, coverPage) {
        const url = (i) => this.lineUrl() + dir + "/" + i + "." + ext;
        const headers = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" };
        const exists = async (i) => {
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    let res = await Network.sendRequest("HEAD", url(i), headers);
                    if (res.status === 200) return true;
                    if (res.status === 404 || res.status === 403 || res.status === 400) return false;
                    if (res.status === 429 || res.status === 503) { await this.sleep(250 * (attempt + 1)); continue; }
                    return null;
                } catch (e) { await this.sleep(120 * (attempt + 1)); }
            }
            return null;
        };
        const build = (n) => { let o = []; for (let i = 1; i <= n; i++) o.push(url(i)); return o; };

        if (this._pageCache[dir]) return build(this._pageCache[dir]);

        let lo = Math.max(1, Math.min(coverPage || 1, maxPages));
        // 第一輪: 一次性並行掃 lo+1 .. lo+24 (絕大多數章節在此輪命中)
        const SWEEP = 24;
        let ids = [];
        for (let i = lo + 1; i <= lo + SWEEP && i <= maxPages; i++) ids.push(i);
        if (ids.length) {
            const r = await Promise.all(ids.map((i) => exists(i)));
            let stop = -1;
            for (let k = 0; k < ids.length; k++) { if (r[k] === false) { stop = k; break; } }
            if (stop >= 0) {
                lo = ids[stop] - 1;
                this._pageCache[dir] = lo;
                this.persistPages();
                return build(lo);
            }
            if (!r.some((x) => x === null)) lo = ids[ids.length - 1];
        }

        // 第二輪: 並行指數跳躍找上界
        let hi = null;
        let K = SWEEP;
        while (hi === null && lo + 1 <= maxPages) {
            const probes = [];
            for (let k = K + 1; k <= Math.min(K * 32, maxPages) && probes.length < 8; k *= 2) {
                const t = Math.min(lo + k, maxPages);
                if (t > lo) probes.push(t);
            }
            if (!probes.length) break;
            const res = await Promise.all(probes.map((t) => exists(t)));
            let idx = -1;
            for (let k = 0; k < probes.length; k++) { if (res[k] === false) { idx = k; break; } }
            if (idx >= 0) {
                hi = probes[idx];
                lo = idx === 0 ? lo : probes[idx - 1];
            } else {
                if (res.some((x) => x === null)) break;
                lo = probes[probes.length - 1];
                K *= 2;
            }
        }
        if (hi === null) hi = Math.min(lo + 1, maxPages + 1);

        // 第三輪: 並行二分收斂
        let guard = 0;
        while (hi - lo > 1 && guard++ < 30) {
            const mids = [];
            const step = Math.max(1, Math.floor((hi - lo) / 4));
            for (let m = lo + step; m < hi; m += step) mids.push(m);
            if (!mids.length) break;
            const res = await Promise.all(mids.map((m) => exists(m)));
            let newLo = lo, newHi = hi;
            for (let k = 0; k < mids.length; k++) {
                if (res[k] === true) newLo = Math.max(newLo, mids[k]);
                else newHi = Math.min(newHi, mids[k]);
            }
            if (newLo === lo && newHi === hi) { newHi = lo + step; break; }
            lo = newLo; hi = newHi;
        }
        this._pageCache[dir] = lo;
        this.persistPages();
        return build(lo);
    }

    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    comic = {
        loadInfo: async (id) => {
            let data = await Lizimh.getJson(`/app/api/v2/detail/${id}`);
            let chapters = {};
            let covers = {};
            let list = (data.chapters || []).slice().sort((a, b) => a.order - b.order);
            for (let ch of list) {
                chapters[String(ch.id)] = ch.name || `第${ch.order}话`;
                if (ch.cover) covers[String(ch.id)] = ch.cover;
            }
            this._coverCache[String(id)] = covers;
            let lastIso = list.length ? list[list.length - 1].created_at : "";
            let tags = {
                "作者": (data.author || "").split(",").filter((t) => t),
                "标签": (data.tags || "").split(",").filter((t) => t),
                "状态": [Lizimh.statusByLastUpdate(lastIso)],
            };
            if (data.score && Number(data.score) > 0) tags["评分"] = ["评分" + data.score];
            // 有令牌時顯示閱讀時間狀態
            try {
                let rw = await this.readingReward();
                if (rw) {
                    let sec = Number(rw.remaining_seconds || 0);
                    if (sec > 0) tags["阅读时间"] = [Math.floor(sec / 60) + " 分钟"];
                    else tags["阅读时间"] = ["已用完 (App内看广告可续)"];
                }
            } catch (e) {}
            return new ComicDetails({
                title: data.name || "",
                cover: this.abs(data.picY || data.picX),
                description: data.content || "",
                tags: tags,
                chapters: chapters,
                stars: data.score ? Number(data.score) : null,
                updateTime: lastIso ? Lizimh.fmtDate(lastIso) : null,
            });
        },

        loadEp: async (comicId, epId) => {
            // 有令牌時優先用 v3 接口 (一次請求, 秒開)
            try {
                let fast = await this.loadEpV3(epId);
                if (fast && fast.length) return { images: fast };
            } catch (e) {}
            let covers = await this.chapterCovers(comicId);
            let cover = covers[String(epId)];
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
