/** @type {import('./_venera_.js')} */

/**
 * 栗子漫画 (lizimh) 源
 * API:    http://ai.qsmm.fun          (AES-ECB 解密远程配置获得, 无需签名)
 * 图片:   三条官方线路可选 (设置项里切换)
 * 分类:   /app/api/config 动态提供 (题材91个 + 地区5个 + 状态)
 * 探索:   /app/api/home/data + rank/list
 */

class Lizimh extends ComicSource {
    name = "栗子漫画";
    key = "lizimh";
    version = "1.4.0";
    minAppVersion = "1.2.2";
    url = "https://raw.githubusercontent.com/Walter498/Walter/main/lizimh.js";

    static api = "http://ai.qsmm.fun";
    // 官方三条图片线路 (来自 /app/api/config 的 img_generator)
    static lines = {
        img1: { host: "https://img.kunmu.asia", text: "默认线路 (国内CDN)" },
        img2: { host: "https://cdn.lzimg.xyz", text: "海外线路 (海外CDN)" },
        img3: { host: null, text: "百度云加速" }, // 百度代理转发
    };
    // 百度代理转发前缀 (img3)
    static baiduProxy = "https://gimg3.baidu.com/searchbox_feed/app=2001&fmt=auto&g=4n&n=0&q=70&src=";
    static proxySrc = "https://cf-1.imgio.club"; // 代理转发的真实图床

    static fallbackTags = ["热血","格斗","武侠","魔幻","魔法","冒险","爱情","搞笑","校园","科幻","后宫","励志","职场","美食","社会","黑道","战争","历史","悬疑","竞技","体育","恐怖","推理","生活","伪娘","治愈","神鬼","四格","百合","耽美","舞蹈","侦探","宅男","音乐","萌系","古风","恋爱","都市","穿越","游戏","其他","日常","腹黑","仙侠","修仙","纯爱","唯美","青春","彩虹","权谋","宅斗","装逼","浪漫","偶像","大女主","复仇","虐心","灵异","逆袭","妖怪","架空","动作","宫斗","脑洞","战斗","怪物","系统","智斗","机甲","高甜","异能","末日","奇幻","正能量","宫廷","亲情","剧情","轻小说","暗黑","长条","玄幻","霸总","其它","节操","欧风","女神","转生","异形","反套路","重生","性转"];
    static fallbackClasses = [["国漫",1],["日漫",2],["韩漫",3],["美漫",4],["精选推荐",5]];

    // 设置项: 图片线路选择 (默认海外线路)
    settings = {
        imageLine: {
            title: "图片线路",
            type: "select",
            options: [
                { value: "img1", text: "默认线路 (国内CDN img.kunmu.asia)" },
                { value: "img2", text: "海外线路 (海外CDN cdn.lzimg.xyz)" },
                { value: "img3", text: "百度云加速 (gimg3.baidu.com 代理)" },
            ],
            default: "img2",
        },
    };

    // 分类页结构: 默认用硬编码清单, init() 拉取服务端配置后覆盖
    category = {
        title: "栗子漫画",
        parts: [
            {
                name: "推荐",
                type: "fixed",
                categories: ["热门排行"],
                categoryParams: ["rank"],
                itemType: "category",
            },
            {
                name: "题材",
                type: "fixed",
                categories: Lizimh.fallbackTags,
                categoryParams: Lizimh.fallbackTags.map((t) => "tag:" + t),
                itemType: "category",
            },
            {
                name: "地区",
                type: "fixed",
                categories: Lizimh.fallbackClasses.map((c) => c[0]),
                categoryParams: Lizimh.fallbackClasses.map((c) => "class:" + c[1]),
                itemType: "category",
            },
            {
                name: "状态",
                type: "fixed",
                categories: ["连载", "完结"],
                categoryParams: ["isend:0", "isend:1"],
                itemType: "category",
            },
        ],
    };

    // 探索页: 首页分组 + 排行
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
                        if (comics.length) {
                            parts.push({ title: g.title || "推荐", comics: comics });
                        }
                    }
                } catch (e) {}
                try {
                    let rank = await Lizimh.getJson("/app/api/rank/list");
                    for (let g of rank.rank_list || []) {
                        let comics = (g.comic_list || []).map((c) => this.parseComic(c));
                        if (comics.length) {
                            parts.push({ title: g.title || g.name || "排行", comics: comics });
                        }
                    }
                } catch (e) {}
                if (!parts.length) throw new Error("探索页加载失败");
                return parts;
            },
        },
    ];

    // 按设置的线路拼接图片 URL
    abs(path) {
        if (!path) return "";
        if (path.startsWith("http")) return path;
        let line = "img2";
        try {
            line = this.loadSetting("imageLine") || "img2";
        } catch (e) {}
        if (line === "img3") {
            // 百度代理: src 用 cf-1.imgio.club 的真实图床
            return Lizimh.baiduProxy + encodeURIComponent(Lizimh.proxySrc + path);
        }
        let host = (Lizimh.lines[line] || Lizimh.lines.img2).host || Lizimh.lines.img2.host;
        return host + path;
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
        let res = await Network.get(Lizimh.api + path, {
            "Accept": "application/json",
        });
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        let json = JSON.parse(res.body);
        if (json.code !== 201) throw new Error(`API code ${json.code}: ${json.msg || ""}`);
        return json.data;
    }

    static fmtDate(iso) {
        if (!iso) return "";
        return String(iso).substring(0, 10);
    }

    // 状态规则:
    //   45 天内有更新        -> 连载中
    //   45~365 天没有更新    -> 暂时完结
    //   超过 365 天没有更新  -> 完结
    static statusByLastUpdate(iso) {
        if (!iso) return "未知";
        let days = (Date.now() - Date.parse(iso)) / 86400000;
        if (isNaN(days)) return "未知";
        if (days > 365) return "完结";
        if (days > 45) return "暂时完结";
        return "连载中";
    }

    // 动态拉取服务端配置 (更新分类与线路域名, 失败不影响使用)
    async init() {
        try {
            let data = await Lizimh.getJson("/app/api/config");
            let g = data.cfg_general || {};
            let tags = (g.category_tabs && g.category_tabs.length)
                ? g.category_tabs : Lizimh.fallbackTags;
            let cls = (data.cfg_comic_class || []);
            let classes = cls.length
                ? cls.map((c) => [c.name, c.id]) : Lizimh.fallbackClasses;
            // 线路域名跟随服务端 (func -> url)
            let gens = (g.img_generator && g.img_generator.generators) || [];
            for (let gen of gens) {
                if (gen.func && gen.url && Lizimh.lines[gen.func]) {
                    Lizimh.lines[gen.func].host = gen.url;
                }
            }
            if (g.pic_domain) {
                let m = String(g.pic_domain).match(/^(.+src=)(https?%3A%2F%2F[^/]+)/i);
                if (m) {
                    Lizimh.baiduProxy = decodeURIComponent(m[1]);
                    Lizimh.proxySrc = decodeURIComponent(m[2]);
                }
            }
            this.category = {
                title: "栗子漫画",
                parts: [
                    {
                        name: "推荐",
                        type: "fixed",
                        categories: ["热门排行"],
                        categoryParams: ["rank"],
                        itemType: "category",
                    },
                    {
                        name: "题材",
                        type: "fixed",
                        categories: tags,
                        categoryParams: tags.map((t) => "tag:" + t),
                        itemType: "category",
                    },
                    {
                        name: "地区",
                        type: "fixed",
                        categories: classes.map((c) => c[0]),
                        categoryParams: classes.map((c) => "class:" + c[1]),
                        itemType: "category",
                    },
                    {
                        name: "状态",
                        type: "fixed",
                        categories: ["连载", "完结"],
                        categoryParams: ["isend:0", "isend:1"],
                        itemType: "category",
                    },
                ],
            };
        } catch (e) {
            // 忽略, 使用默认清单
        }
    }

    search = {
        load: async (keyword, options, page) => {
            let q = encodeURIComponent(keyword);
            let data = await Lizimh.getJson(`/app/api/search/full?q=${q}`);
            let list = data.search_full || [];
            return {
                comics: list.map((c) => this.parseComic(c)),
                maxPage: 1,
            };
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
            } else if (param.startsWith("tag:")) {
                let t = encodeURIComponent(param.substring(4));
                let data = await Lizimh.getJson(`/app/api/category/list?tag=${t}`);
                comics = (data.category_list || []).map((c) => this.parseComic(c));
            } else if (param.startsWith("class:")) {
                let c = param.substring(6);
                let data = await Lizimh.getJson(`/app/api/category/list?class=${c}`);
                comics = (data.category_list || []).map((c) => this.parseComic(c));
            } else if (param.startsWith("isend:")) {
                let s = param.substring(6);
                let data = await Lizimh.getJson(`/app/api/category/list?isend=${s}`);
                comics = (data.category_list || []).map((c) => this.parseComic(c));
            }
            let seen = new Set();
            comics = comics.filter((c) => !seen.has(c.id) && seen.add(c.id));
            return {
                comics: comics,
                maxPage: 1,
            };
        },
    };

    comic = {
        loadInfo: async (id) => {
            let data = await Lizimh.getJson(`/app/api/detail/${id}`);
            let chapters = {};
            let list = (data.chapters || []).slice().sort((a, b) => a.order - b.order);
            for (let ch of list) {
                chapters[String(ch.id)] = ch.name || `第${ch.order}话`;
            }
            let lastIso = list.length ? list[list.length - 1].created_at : "";

            // 标签只放题材; 状态/评分/更新各有专属位置
            let labelList = (data.tags || "").split(",").filter((t) => t);
            let tags = {
                "作者": (data.author || "").split(",").filter((t) => t),
                "标签": labelList,
                "状态": [Lizimh.statusByLastUpdate(lastIso)],
            };
            // 评分: 0-10 制, 带前缀; 暂无评分(0)不显示
            if (data.score && Number(data.score) > 0) {
                tags["评分"] = ["评分" + data.score];
            }

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
            let data = await Lizimh.getJson(`/app/api/chapter/${epId}`);
            let pics = data.pics || [];
            return {
                images: pics.map((p) => this.abs(p)),
            };
        },

        onImageLoad: (url, comicId, epId) => {
            return {};
        },

        onThumbnailLoad: (url) => {
            return {};
        },
    };
}
