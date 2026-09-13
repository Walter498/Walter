/** @type {import('./_venera_.js')} */

/**
 * 栗子漫画 (lizimh) 源
 * API:    http://ai.qsmm.fun        (来自 AES-ECB 解密的远程配置, 无需签名)
 * 图片:   https://cf-1.imgio.club   (无 referer 检查)
 */

class Lizimh extends ComicSource {
    name = "栗子漫画";
    key = "lizimh";
    version = "1.1.0";
    minAppVersion = "1.2.2";
    url = "https://raw.githubusercontent.com/Walter498/Walter/main/lizimh.js";

    static api = "http://ai.qsmm.fun";
    static img = "https://cf-1.imgio.club";
    static tabTags = ["冒险", "恋爱", "玄幻", "修真", "搞笑", "科幻", "热血"];

    static abs(path) {
        if (!path) return "";
        if (path.startsWith("http")) return path;
        return Lizimh.img + path;
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
        // "2026-09-08T17:19:00.175Z" -> "2026-09-08"
        return String(iso).substring(0, 10);
    }

    search = {
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

    // 分类页: 排行 + 7 个官方标签分类
    category = {
        title: "栗子漫画",
        parts: [{
            name: "分类",
            type: "fixed",
            categories: ["热门排行", ...Lizimh.tabTags],
            categoryParams: ["rank", ...Lizimh.tabTags],
            itemType: "category",
        }],
    };

    categoryComics = {
        load: async (category, param, options, page) => {
            let comics = [];
            if (param === "rank") {
                let data = await Lizimh.getJson("/app/api/rank/list");
                for (let g of data.rank_list || []) {
                    comics.push(...(g.comic_list || []).map(Lizimh.parseComic));
                }
            } else {
                let data = await Lizimh.getJson(
                    `/app/api/home/tab/data?tag=${encodeURIComponent(param)}`
                );
                comics = (data.home_tab_data || []).map(Lizimh.parseComic);
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
            // 接口的 isend 字段不可靠(所有漫画都返回1), 用最新章节时间代替状态
            let last = list.length ? list[list.length - 1].created_at : "";
            return new ComicDetails({
                title: data.name || "",
                cover: Lizimh.abs(data.picY || data.picX),
                description: data.content || "",
                tags: {
                    "作者": (data.author || "").split(",").filter((t) => t),
                    "标签": (data.tags || "").split(",").filter((t) => t),
                    "最新章节": list.length ? [list[list.length - 1].name || ""] : [],
                    "最后更新": [Lizimh.fmtDate(last)],
                    "人气": [String(data.hits || "")],
                },
                chapters: chapters,
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
