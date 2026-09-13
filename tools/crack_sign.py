#!/usr/bin/env python3
"""
lzsign 已知明文攻击破解器
输入: ssl_dump.js 抓到的 REQUEST 文本 (HTTP 请求行带 ?lzsign=xxx)
用法: python3 crack_sign.py capture.txt
命中后写出 SIGN_SECRET.txt (algo=..., key=...)
"""
import sys, re, hashlib, urllib.parse

CAP = sys.argv[1] if len(sys.argv) > 1 else 'capture.txt'
data = open(CAP, errors='replace').read()

samples = []
for m in re.finditer(r'(GET|POST)\s+(/[^\s]+?)[?&]lzsign=([0-9a-fA-F]{16,64})[^\s]*\s+HTTP', data):
    samples.append((m.group(1), m.group(2), m.group(3)))
if not samples:
    for m in re.finditer(r'(/[^\s"\'<>]+?)[?&]lzsign=([0-9a-fA-F]{16,64})', data):
        samples.append(('?', m.group(1), m.group(2)))

print(f'[+] {len(samples)} 条带签名样本')
if not samples:
    sys.exit('没有样本。先去 App 里操作抓流量。')

keys = set()
try:
    keys.update(l.strip() for l in open('keycands.txt') if 8 <= len(l.strip()) <= 64)
except FileNotFoundError:
    pass
for m in re.finditer(r'\b[A-Za-z0-9]{32}\b', data):
    keys.add(m.group(0))
for m in re.finditer(r'\b[A-Za-z0-9]{16}\b', data):
    keys.add(m.group(0))
for w in ['lizimh', 'lizimanhua', 'lzmh', '123456', '1234567890', 'lizi2024', 'lizi2025',
          '6yOB7ONSOyeU7XAZkHdcJKpWdYmeBNW2', 'q2sIObYXCp2uBZgCNBlY93J3z67hK0wS']:
    keys.add(w)
print(f'[+] {len(keys)} 个密钥候选')

def md5(s): return hashlib.md5(s.encode()).hexdigest()
def sha1(s): return hashlib.sha1(s.encode()).hexdigest()
def sha256(s): return hashlib.sha256(s.encode()).hexdigest()

def parts(url):
    p, _, q = url.partition('?')
    ts = ''
    for k, v in urllib.parse.parse_qsl(q, keep_blank_values=True):
        if k.lower() in ('t', 'ts', 'time', 'timestamp') and v.isdigit():
            ts = v
    return p, q, ts

def variants(p, q, ts, k):
    return {
        'md5(path)': md5(p),
        'md5(path?q)': md5(p + '?' + q),
        'md5(q)': md5(q),
        'sha1(path)': sha1(p),
        'md5(path+K)': md5(p + k),
        'md5(K+path)': md5(k + p),
        'md5(q+K)': md5(q + k),
        'md5(K+q)': md5(k + q),
        'md5(path+K+ts)': md5(p + k + ts),
        'md5(K+path+ts)': md5(k + p + ts),
        'md5(path+ts+K)': md5(p + ts + k),
        'sha1(path+K)': sha1(p + k),
        'sha256(path+K)': sha256(p + k),
    }

# 先验证所有样本共享同一格式
first_p, first_q, first_ts = parts(samples[0][1])
for name, val in variants(first_p, first_q, first_ts, '').items():
    if 'K)' in name or '+K' in name:
        continue
    if all(val == s.lower() or val.upper() == s for _, _, s in samples):
        print('\n========== 破解成功 (无需密钥) ==========')
        print('算法:', name)
        open('SIGN_SECRET.txt', 'w').write(f'algo={name}\nkey=\n')
        sys.exit(0)

for k in sorted(keys):
    ps = [parts(u) for _, u, _ in samples]
    names = list(variants(*ps[0], k).keys())
    for name in names:
        if not ('+K' in name or 'K+' in name):
            continue
        if all(variants(p, q, ts, k)[name] == s.lower() or variants(p, q, ts, k)[name].upper() == s
               for (p, q, ts), (_, _, s) in zip(ps, samples)):
            print('\n========== 破解成功 ==========')
            print('算法:', name)
            print('密钥:', k)
            open('SIGN_SECRET.txt', 'w').write(f'algo={name}\nkey={k}\n')
            sys.exit(0)

print('\n[-] 未破解。多抓几条不同接口的样本再试。')
