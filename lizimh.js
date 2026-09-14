/** @type {import('./_venera_.js')} */

/**
 * 栗子漫画 (lizimh) 源  v2.0.0
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
    version = "2.0.0";
    minAppVersion = "1.2.2";
    url = "https://raw.githubusercontent.com/Walter498/Walter/main/lizimh.js";

    static api = "http://ai.qsmm.fun";
    // 圖片線路 (初始化時從 configv2 的 generators 覆蓋)
    static lines = [
        { name: "线路1 (CF优选海外)", url: "https://cdn.lzimg.xyz" },
        { name: "线路2 (mechat)", url: "http://img.mechat.fun" },
        { name: "线路3 (i.lzimg)", url: "https://i.lzimg.xyz" },
        { name: "线路4 (备用)", url: "https://cf-1.imgio.club" },
    ];
    static fallbackTags = ["热血","格斗","武侠","魔幻","魔法","冒险","爱情","搞笑","校园","科幻","后宫","励志","职场","美食","社会","黑道","战争","历史","悬疑","竞技","体育","恐怖","推理","生活","伪娘","治愈","神鬼","四格","百合","耽美","舞蹈","侦探","宅男","音乐","萌系","古风","恋爱","都市","穿越","游戏","其他","日常","腹黑","仙侠","修仙","纯爱","唯美","青春","彩虹","权谋","宅斗","装逼","浪漫","偶像","大女主","复仇","虐心","灵异","逆袭","妖怪","架空","动作","宫斗","脑洞","战斗","怪物","系统","智斗","机甲","高甜","异能","末日","奇幻","正能量","宫廷","亲情","剧情","轻小说","暗黑","长条","玄幻","霸总","其它","节操","欧风","女神","转生","异形","反套路","重生","性转"];
    static fallbackClasses = [["国漫",1],["日漫",2],["韩漫",3],["美漫",4],["精选推荐",5]];

    settings = {
        imageLine: {
            title: "图片线路",
            type: "select",
            options: [
                { value: "0", text: "线路1 (CF优选海外 cdn.lzimg.xyz)" },
                { value: "1", text: "线路2 (img.mechat.fun)" },
                { value: "2", text: "线路3 (i.lzimg.xyz)" },
                { value: "3", text: "备用 (cf-1.imgio.club)" },
            ],
            default: "0",
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

    lineUrl() {
        let i = 0;
        try { i = parseInt(this.loadSetting("imageLine") || "0"); } catch (e) {}
        if (isNaN(i) || i < 0 || i >= Lizimh.lines.length) i = 0;
        return Lizimh.lines[i].url;
    }

    abs(path) {
        if (!path) return "";
        if (path.startsWith("http")) return path;
        return this.lineUrl() + path;
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
    //  - coverPage: 封面本身是該章的一頁, 可作為頁數下界
    //  - CDN 有限速(429), 逐次探測都要退避重試
    async probePages(dir, ext, maxPages, coverPage) {
        const url = (i) => this.lineUrl() + dir + "/" + i + "." + ext;
        const headers = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" };
        // 返回 true/false; 持續 429 則拋錯, 避免把限速誤判成「沒有下一頁」
        const exists = async (i) => {
            for (let attempt = 0; attempt < 4; attempt++) {
                try {
                    let res = await Network.sendRequest("HEAD", url(i), headers);
                    if (res.status === 200) return true;
                    if (res.status === 404 || res.status === 403 || res.status === 400) return false;
                    if (res.status === 429 || res.status === 503) {
                        await this.sleep(500 * Math.pow(2, attempt));
                        continue;
                    }
                    return false;
                } catch (e) {
                    await this.sleep(300 * (attempt + 1));
                }
            }
            throw new Error("图片线路限速中, 请稍后重试或切换线路");
        };
        let lo = Math.max(1, Math.min(coverPage || 1, maxPages));
        if (!(await exists(lo))) return [];
        await this.sleep(100);
        // 指數探測找上界
        let hi = lo + 1;
        while (hi <= maxPages && (await exists(hi))) { lo = hi; hi = Math.min(hi * 2, maxPages + 1); }
        if (hi > maxPages) hi = maxPages + 1;
        // 二分找最後一頁
        while (hi - lo > 1) {
            let mid = Math.floor((lo + hi) / 2);
            await this.sleep(80);
            if (await exists(mid)) lo = mid; else hi = mid;
        }
        let images = [];
        for (let i = 1; i <= lo; i++) images.push(url(i));
        return images;
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
            return { images: images };
        },

        onImageLoad: (url, comicId, epId) => { return {}; },
        onThumbnailLoad: (url) => { return {}; },
    };
}
