# 栗子漫画 EZvenera 源

栗子漫画 (lizimh) 的 EZvenera 漫画源插件 + 破解工具链。

## 状态

| 组件 | 状态 |
|---|---|
| 图片 CDN 直连 | ✅ 已验证可用 (`cf-1.imgio.club/picY/*.jpg`, `i0.hdslb.com/bfs/manga-static/*`) |
| API 端点 | ✅ 已从 AOT 提取 (搜索/详情/章节 v2/分类/排行) |
| API 基址 + lzsign 签名 | ⏳ 待抓包破解 |
| EZvenera 插件 | ⏳ 等签名 |

## 目录

```text
lizimh.js              EZvenera 插件 (签名破解后补全)
tools/ssl_dump.js      Frida SSL_read/SSL_write 明文抓取 (iOS 设备)
tools/crack_sign.py    lzsign 已知明文攻击破解器
tools/keycands.txt     从 libapp.so 提取的密钥候选
```

## 下一步 (只需一次)

1. 越狱设备装 OpenSSH + Frida, 把本仓库公钥加进 `/var/root/.ssh/authorized_keys`
2. `frida -H <设备IP>:27042 -n 栗子漫画 -l tools/ssl_dump.js`
3. App 里搜索->详情->翻两话, 保存输出到 `capture.txt`
4. `python3 tools/crack_sign.py capture.txt` → 出 `SIGN_SECRET.txt`
5. 把 SIGN_SECRET.txt 发给维护者, 补全 lizimh.js

## 备注

- 安卓版与 iOS 版 Flutter 引擎 snapshot hash 相同 (`80a49c71...`), 密钥通用
- 服务器 API 已迁移至 v2 路径, 旧 v1 路径全部 404
- 远程配置 (腾讯 COS) 是 AES 密文且定期轮换, 抓包拿基址比解密配置更可靠
