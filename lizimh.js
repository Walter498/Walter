/** @type {import('./_venera_.js')} */

/**
 * 栗子漫画 (lizimh) 源
 * API:    http://ai.qsmm.fun          (AES-ECB 解密远程配置获得, 无需签名)
 * 图片:   cdn.lzimg.xyz (官方默认线路) + cf-1.imgio.club (备用)
 * 分类:   /app/api/config 动态提供 (题材91个 + 地区5个 + 状态)
 */

class Lizimh extends ComicSource {
    name = "栗子漫画";
    key = "lizimh";
    version = "1.2.0";
    minAppVersion = "1.2.2";
    url = "https://raw.githubusercontent.com/Walter498/Walter/main/lizimh.js";

    static api = "http://ai.qsmm.fun";
    static imgHosts = ["https://cdn.lzimg.xyz", "https://cf-1.imgio.club"];
    static fallbackTags = ["热血","格斗","武侠","魔幻","魔法","冒险","爱情","搞笑","校园","科幻","后宫","励志","职场","美食","社会","黑道","战争","历史","悬疑","竞技","体育","恐怖","推理","生活","伪娘","治愈","神鬼","四格","百合","耽美","舞蹈","侦探","宅男","音乐","萌系","古风","恋爱","都市","穿越","游戏","其他","日常","腹黑","仙侠","修仙","纯爱","唯美","青春","彩虹","权谋","宅斗","装逼","浪漫","偶像","大女主","复仇","虐心","灵异","逆袭","妖怪","架空","动作","宫斗","脑洞","战斗","怪物","系统","智斗","机甲","高甜","异能","末日","奇幻","正能量","宫廷","亲情","剧情","轻小说","暗黑","长条","玄幻","霸总","其它","节操","欧风","女神","转生","异形","反套路","重生","性转"];
    static fallbackClasses = [["国漫",1],["日漫",2],["韩漫",3],["美漫",4],["精选推荐",5]];

    static abs(path) {
        if (!path) return "";
        if (path.startsWith("http")) return path;
        return Lizimh.imgHosts[0] + path;
    }

    static parseComic(c) {
        return new Comic({
            id: String(c.id),
            title: c.name || "",
            subTitle: c.author || "",
            cover: Lizimh.abs(c.picY || c.picX || c.cover),
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

    // 45 天规则: 最新章节距今超过 45 天视为完结
    static statusByLastUpdate(iso) {
        if (!iso) return "未知";
        let days = (Date.now() - Date.parse(iso)) / 86400000;
        if (isNaN(days)) return "未知";
        return days > 45 ? "完结" : "连载中";
    }

    // 动态拉取服务端分类配置 (init 在宿主加载源时先于 category 读取执行)
    async init() {
        try {
            let data = await Lizimh.getJson("/app/api/config");
            let g = data.cfg_general || {};
            if (g.category_tabs && g.category_tabs.length) {
                this._tags = g.category_tabs;
            }
            let cls = data.cfg_comic_class || [];
            if (cls.length) {
                this._classes = cls.map((c) => [c.name, c.id]);
            }
            let gens = (g.img_generator && g.img_generator.generators) || [];
            if (gens.length && gens[0].url) {
                Lizimh.imgHosts[0] = gens[0].url;
            }
        } catch (e) {
            // 配置拉取失败时用硬编码清单, 不影响使用
        }
        let tags = this._tags || Lizimh.fallbackTags;
        let classes = this._classes || Lizimh.fallbackClasses;
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
    }

    // 分类页结构由 init() 根据服务端配置动态生成
    category = null;
        load: async (keyword, options, page) => {
            let q = encodeURIComponent(keyword);
            let data = await Lizimh.getJson(`/app/api/search/full?q=${q}`);
            let list = data.search_full || [];
            return {
                comics: list.map(Lizimh.parseComic),
                maxPage: 1,
            };
        },
    };

    // 分类页: 排行 / 题材 / 地区 / 状态
    category = null;

    categoryComics = {
        load: async (category, param, options, page) => {
            let comics = [];
            if (param === "rank") {
                let data = await Lizimh.getJson("/app/api/rank/list");
                for (let g of data.rank_list || []) {
                    comics.push(...(g.comic_list || []).map(Lizimh.parseComic));
                }
            } else if (param.startsWith("tag:")) {
                let t = encodeURIComponent(param.substring(4));
                let data = await Lizimh.getJson(`/app/api/category/list?tag=${t}`);
                comics = (data.category_list || []).map(Lizimh.parseComic);
            } else if (param.startsWith("class:")) {
                let c = param.substring(6);
                let data = await Lizimh.getJson(`/app/api/category/list?class=${c}`);
                comics = (data.category_list || []).map(Lizimh.parseComic);
            } else if (param.startsWith("isend:")) {
                let s = param.substring(6);
                let data = await Lizimh.getJson(`/app/api/category/list?isend=${s}`);
                comics = (data.category_list || []).map(Lizimh.parseComic);
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
            let tags = {
                "作者": (data.author || "").split(",").filter((t) => t),
                "标签": (data.tags || "").split(",").filter((t) => t),
                "状态": [Lizimh.statusByLastUpdate(lastIso)],
                "最后更新": [Lizimh.fmtDate(lastIso)],
                "人气": [String(data.hits || "")],
            };
            // 评分: 服务端 0-10 制, 0 表示暂无评分则不显示
            if (data.score && Number(data.score) > 0) {
                tags["评分"] = [String(data.score)];
            }
            return new ComicDetails({
                title: data.name || "",
                cover: Lizimh.abs(data.picY || data.picX),
                description: data.content || "",
                tags: tags,
                chapters: chapters,
                stars: data.score ? Number(data.score) : null,
            });
        },

        loadEp: async (comicId, epId) => {
            let data = await Lizimh.getJson(`/app/api/chapter/${epId}`);
            let pics = data.pics || [];
            return {
                images: pics.map((p) => Lizimh.abs(p)),
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
