# 栗子漫画 EZvenera 源

栗子漫画 (lizimh) 的 EZvenera 漫画源插件。

## 状态: ✅ 可用

| 组件 | 状态 |
|---|---|
| API 基址 | ✅ `http://ai.qsmm.fun` (AES-ECB 解密远程配置获得) |
| 签名 | ✅ 无需 lzsign, 服务器不校验 |
| 图片 CDN | ✅ `https://cf-1.imgio.club` (无 referer 限制) |
| 搜索 | ✅ `/app/api/search/full?q=` |
| 详情+章节 | ✅ `/app/api/detail/{id}` `/app/api/chapter/{epId}` |
| 排行 | ✅ `/app/api/rank/list` |

## 安装

EZvenera → 源管理 → 输入:
```
https://raw.githubusercontent.com/Walter498/Walter/main/lizimh.js
```

## 破解过程 (2026-09-13)

1. 官网下载页提取安卓 APK, 其 libapp.so 与 iOS 版 snapshot hash 相同 (80a49c71...)
2. 用 `strings` 提取 libapp.so 全部 1.9 万条字符串
3. 对腾讯 COS 上的 AES 加密配置做广谱爆破:
   - 每字符串派生 6 种密钥形态 (原始/UTF-16/MD5/SHA256×2)
   - 共 11.9 万密钥 × ECB/CBC
4. 命中: 字符串 `f8d992c74b29491d8a3e3fd5f07389d8` 的 **32 字节 ASCII 形式** 作 AES-256-ECB 密钥
5. 配置明文: `{"domain":"http://ai.qsmm.fun/"}`
6. 实测该域名的 v1 API 全部可用且 **lzsign 不校验**

## 接口备忘

```text
GET /app/api/search/full?q=<kw>     → data.search_full[]
GET /app/api/search/suggest?q=<kw>  → data.search_suggest[]
GET /app/api/detail/<comicId>       → data.chapters[] (id/name/order)
GET /app/api/chapter/<chapterId>    → data.pics[] (路径, 拼 cf-1.imgio.club)
GET /app/api/rank/list              → data.rank_list[].comic_list[]
GET /app/api/home/data              → 首页推荐
GET /app/api/home/tab/data?tag=<t>  → 分类标签页 (需 tag 参数)
GET /app/api/category/list          → 分类漫画
GET /app/api/config                 → 广告/线路配置
```

响应统一格式: `{"code":201,"data":{...}}`, code!=201 即失败。

注意: API 走 **明文 HTTP**, 配置可能再轮换; 若失效重新拉 COS 配置用同密钥解密即可。

## 目录

```text
lizimh.js              EZvenera 插件成品
tools/crack_sign.py    lzsign 破解器 (最终未需要——服务端不校验)
tools/ssl_dump.js      Frida SSL 抓取脚本 (最终未需要)
tools/keycands.txt     密钥候选表
```
