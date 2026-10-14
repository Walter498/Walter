# 栗子漫画腾讯评论 SOURCE comments.3

## 发行身份与边界

- 仓库：`Walter498/Walter`；评论分支：`feat/lizimh-tencent-comments-20261013`。
- 源版本：`2.33.20-comments.3`，key：`lizimh`。
- 源 SHA-256：`2939cc7a84f2dd5aa1e5648a6e91818b7997771472f3150be92975011975e07a`。
- 发行只变更 `lizimh.js`、`docs/lizimh-tencent-comments.md`；不合并 main，不改 App，不改 crypto/converter/LICENSE，不更改账户、设备或研究配额。

独立 SOURCE QA 对上述精确源码 finalPass。范围是人工选择、已验证绑定的章节链 A1/A2/B1 和新增 A3：A51954653 第 1/2 页 15/7 条，第 3 页真实空列表终页（end=2、maxPage=3）；B51955313 第 1 页 4 条（end=2、maxPage=1）。这不是自动冷启动链、全目录、设备、Reader 或完整 UI 验收。章节 canLoadReplies=true；作品 canLoadReplies=false。旧失败/配额证据保留，不被此次窄范围通过覆盖。离线 comments161/provider718/work135/search54 已由 QA 跑过，本次发行准备不重跑目标联网研究。

## 用户更新步骤（仅在发布者确认已发布并完成 raw 校验后）

1. 先备份当前源配置/人工绑定；不要清除账户、缓存或修改设备设置。
2. 在 App 的源管理中，更新既有 key=`lizimh` 的评论分支源；不要把 main 源误认为 comments.3，也不要重复安装同 key 的独立源。
3. 评论分支更新地址：
   `https://raw.githubusercontent.com/Walter498/Walter/feat/lizimh-tencent-comments-20261013/lizimh.js`
4. 更新后检查源版本为 `2.33.20-comments.3`。发布者应提供不可变 commit raw 地址及 SHA-256；仅看到版本号不等于校验了源码。
5. 原有自动繁简书名匹配与可选人工绑定继续保留；本次真实回复验收使用已验证的选中作品/章节绑定，并未重新跑自动冷启动全链。章节支持从母评论查看其回复列表及分页，子回复中的楼中楼只显示接口提供的预览，未开放楼中楼全量详情；作品讨论回复详情仍未启用。不要把预览 childId 当作母帖 ID。更新时无需为了本版新建人工绑定，也不以本次选链实测宣称全目录自动映射已通过。
6. 遇到权限、绑定、重复页或网络错误应停止并保留错误，不追加研究重试。源码回滚由发布者另行授权，以不可变旧 commit 为参照，不强推、不擅自切 main。

## 源更新不等于 UI 完整交付

旧 App 可以继续调用新源码的旧四参数接口；SOURCE 同时保留新 options hooks。`replyPreview` 的完整呈现、页内排序及章末高度/关闭行为需要配套新 IPA，不是纯 JS 更新。

配套 App `2.3.6+250` 已在 CI `38502811710`、精确提交 `f7b9e52f0b237d95d0b9b267a3968b2ad4702db8` 完成严格同 SDK 分析、原作者13项、原28文件174项、新评论69项、真实8图正常golden比较与fresh capture，以及无签名iPhoneOS Release构建。8图含浅/深色与100%/200%字号，先独立逐图审核再提交基线；大字体滚动可达测试通过。默认章末高度以旧整体自然区域2倍为目标；常规字号保留旧header布局，放大/窄屏有响应换行例外，受限视口不保证任意倍率精确高度。

IPA SHA-256：`742b4220ff5029850825b72973b4f3e8b56401a1a6252a1bc92012afb57ae8c6`。本地复核ZIP、plist及20个device Mach-O与runner报告一致。包未签名，须用户重签；手机安装、真实设备UI/Reader全模式、网络头像与本次自动cold全链未验。不要把CI或截图通过当作这些未验项通过。更新前导出App备份，使用兼容现有签名身份的覆盖升级方式；Bundle ID保持`io.github.kyosee.venera`，不要先删除旧App或清数据。

## 发布者核验

发行前锁定旧分支 commit `b96fbf05464ef44a392bbb61bfe883039f611254` 及旧 comments.2 SHA-256 `8dd41021f83b9afc9b6402c1207b710417e04ef5819979ef946f291d78fd737b`；main commit 必须为 `2e67a7433c3387ea0230f38583b4b1d81bb03db5`，main 源 SHA-256 必须为 `e9bdbf555a06e30a19bd48e8fbeb5d04bef5a8fa76845af74ec82314ecaa2f4d`。任何 lease、tree、内容或 raw 校验不一致立即停止，不 force、不自动修复、不重新签 QA。

此文档为发行候选说明，不构成已发布、已安装或 App PASS 的证明。
