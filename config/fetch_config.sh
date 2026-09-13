#!/bin/sh
# 栗子漫畫遠程配置拉取+解密腳本
# 密鑰: f8d992c74b29491d8a3e3fd5f07389d8 的 32 字節 ASCII (AES-256-ECB, PKCS7)
URL='https://lz-1382057604.cos.ap-hongkong.myqcloud.com/5A6F4D2B7E9A1C3D8F0B2E4A6C8E0D2F4B6A8C0E2D4F6A8B0C2E4D6F8A0C2E4B.json'
KEYHEX=$(printf 'f8d992c74b29491d8a3e3fd5f07389d8' | xxd -p | tr -d '\n')
curl -s "$URL" | base64 -d | openssl enc -d -aes-256-ecb -K "$KEYHEX"
