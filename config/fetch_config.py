#!/usr/bin/env python3
"""栗子漫畫遠程配置拉取+解密 (AES-256-ECB, PKCS7)
密鑰 = 字符串 f8d992c74b29491d8a3e3fd5f07389d8 的 32 字節 ASCII 形式"""
import base64, urllib.request
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

URL = 'https://lz-1382057604.cos.ap-hongkong.myqcloud.com/5A6F4D2B7E9A1C3D8F0B2E4A6C8E0D2F4B6A8C0E2D4F6A8B0C2E4D6F8A0C2E4B.json'
KEY = b'f8d992c74b29491d8a3e3fd5f07389d8'

raw = base64.b64decode(urllib.request.urlopen(URL, timeout=15).read())
d = Cipher(algorithms.AES(KEY), modes.ECB()).decryptor()
pt = d.update(raw) + d.finalize()
pad = pt[-1]
print(pt[:-pad].decode())
