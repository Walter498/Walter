/** @type {import('./_venera_.js')} */

/**
 * 栗子漫画 (lizimh) 源
 * API:    http://ai.qsmm.fun        (来自 AES-ECB 解密的远程配置, 无需签名)
 * 图片:   https://cf-1.imgio.club   (无 referer 检查)
 * 逆向:   配置密钥 = libapp.so 字符串 f8d992c74b29491d8a3e3fd5f07389d8 的 ASCII 形式
 */

class Lizimh extends ComicSource {
    name = "栗子漫画";
    key = "lizimh";
    version = "1.0.0";
    minAppVersion = "1.2.2";
    url = "https://raw.githubusercontent.com/Walter498/Walter/main/lizimh.js";

    static api = "http://ai.qsmm.fun";
    static img = "https://cf-1.imgio.club";

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

    categoryComics = {
        load: async (category, options, page) => {
            // 排行榜作为默认分类内容
            let data = await Lizimh.getJson("/app/api/rank/list");
            let groups = data.rank_list || [];
            let comics = [];
            for (let g of groups) {
                comics.push(...(g.comic_list || []).map(Lizimh.parseComic));
            }
            // 去重
            let seen = new Set();
            comics = comics.filter((c) => !seen.has(c.id) && seen.add(c.id));
            return {
                comics: comics,
                maxPage: 1,
            };
        },
    };

    category = [
        {
            title: "排行",
            key: "rank",
        },
    ];

    comic = {
        loadInfo: async (id) => {
            let data = await Lizimh.getJson(`/app/api/detail/${id}`);
            let chapters = new Map();
            let list = (data.chapters || []).slice().sort((a, b) => a.order - b.order);
            for (let ch of list) {
                chapters.set(String(ch.id), ch.name || `第${ch.order}话`);
            }
            return new ComicDetails({
                title: data.name || "",
                cover: Lizimh.abs(data.picY || data.picX),
                description: data.content || "",
                tags: {
                    "作者": (data.author || "").split(",").filter((t) => t),
                    "标签": (data.tags || "").split(",").filter((t) => t),
                    "状态": [data.isend ? "完结" : "连载"],
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
            // cf-1.imgio.club 无 referer/UA 限制
            return {};
        },

        onThumbnailLoad: (url) => {
            return {};
        },
    };
}
