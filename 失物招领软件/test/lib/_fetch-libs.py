# -*- coding: utf-8 -*-
"""把单元测试要用的第三方库（Mocha / Chai）的浏览器版下载到本目录。

为什么要下载到本地而不是用 CDN：
  1. 使用者双击 test/test.html 就能跑测试，不需要联网、不需要装 Node.js；
  2. 助教把仓库下载下来离线也能验收。

Chai 固定用 4.x：5.x 起只提供 ES Module，无法用 <script> 直接加载，
而 file:// 协议下又不能用 type="module"（会被 CORS 拦）。

用法：python test/lib/_fetch-libs.py
"""
import io
import json
import os
import sys
import tarfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))

TARGETS = [
    {
        "package": "mocha",
        "version": "latest",
        "files": ["package/mocha.js", "package/mocha.css", "package/LICENSE"],
    },
    {
        "package": "chai",
        # 4.x 是最后一个带 UMD 浏览器构建的版本
        "version": "4.5.0",
        "files": ["package/chai.js", "package/LICENSE"],
    },
]


def fetch(url):
    print("GET " + url)
    with urllib.request.urlopen(url, timeout=90) as resp:
        return resp.read()


def resolve(package, version):
    spec = version if version == "latest" else version
    meta = json.loads(fetch("https://registry.npmjs.org/%s/%s" % (package, spec)).decode("utf-8"))
    return meta["version"], meta["dist"]["tarball"]


def main():
    ok = True
    for target in TARGETS:
        version, tarball = resolve(target["package"], target["version"])
        print("\n== %s %s ==" % (target["package"], version))
        blob = fetch(tarball)
        print("  下载完成 %.0f KB" % (len(blob) / 1024.0))

        extracted = []
        with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tar:
            for member in tar.getmembers():
                if member.name in target["files"]:
                    data = tar.extractfile(member).read()
                    name = os.path.basename(member.name)
                    # LICENSE 重命名，避免两个包互相覆盖
                    if name == "LICENSE":
                        name = "LICENSE-%s" % target["package"]
                    out = os.path.join(HERE, name)
                    with open(out, "wb") as fh:
                        fh.write(data)
                    extracted.append(name)
                    print("  写出 %-20s %6.0f KB" % (name, len(data) / 1024.0))

        main_js = "%s.js" % target["package"]
        if main_js not in extracted:
            print("  错误：没有找到 %s，需要换一种获取方式" % main_js, file=sys.stderr)
            ok = False

    print("\n完成 -> %s" % HERE)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
