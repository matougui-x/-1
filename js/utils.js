/*!
 * 校园失物招领 —— 通用工具函数
 * 这里只放"输入什么就输出什么"的纯函数，不碰 DOM、不碰存储，因此可以被单元测试完整覆盖。
 * 凡是依赖"当前时间"的函数，都把 now 作为可选参数传入，测试时传固定值即可。
 */
(function (root) {
  'use strict';

  var LF = (root.LF = root.LF || {});
  var U = (LF.utils = {});

  // ---------------------------------------------------------------- 文本处理

  /** 零宽字符与变体选择符：从别处复制来的文字里常夹着这些，肉眼看不见但会让比较失败。 */
  var ZERO_WIDTH = /[​-‍⁠﻿︎️]/g;

  /**
   * 全角转半角。
   * 用 Unicode NFKC 规范化而不是只做码点偏移：NFKC 还能顺带处理
   * ① → 1、㈠ → (一)、㎡ → m2、全角空格 → 半角空格等兼容字符。
   */
  U.toHalfWidth = function (str) {
    if (str == null) return '';
    var s = String(str);
    try {
      return s.normalize('NFKC');
    } catch (e) {
      // 极老的浏览器没有 normalize，退回逐字符偏移
      return s.replace(/[！-～]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
      }).replace(/　/g, ' ');
    }
  };

  /** 搜索用归一化：NFKC → 去零宽 → 去首尾空白 → 连续空白折叠 → 转小写。 */
  U.normalizeText = function (str) {
    return U.toHalfWidth(str)
      .replace(ZERO_WIDTH, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  };

  /** 判断 a 是否包含 b（双方都先归一化），用于关键词匹配。 */
  U.containsText = function (haystack, needle) {
    var h = U.normalizeText(haystack);
    var n = U.normalizeText(needle);
    if (!n) return false;
    return h.indexOf(n) !== -1;
  };

  /**
   * 认领答案归一化：在 normalizeText 基础上再去掉所有空白与常见中英文标点。
   * 目的是让"王小明"「王 小明」「王小明。」「王小明!」被判为同一个答案。
   * 刻意保留 - _ / ，因为卡号、型号里它们可能是有效字符。
   */
  U.normalizeAnswer = function (str) {
    return U.normalizeText(str)
      .replace(/\s+/g, '')
      .replace(/[。，、．·…～~！？；：""''“”‘’（）()【】\[\]《》<>!?,;:'"`]/g, '');
  };

  /** HTML 转义。所有用户输入渲染进页面前都必须过这一道，防止 XSS 与排版错乱。 */
  U.escapeHtml = function (str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /** 截断字符串，超出部分用省略号代替（按字符数，中文按 1 个算）。 */
  U.truncate = function (str, max) {
    var s = String(str == null ? '' : str);
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)) + '…';
  };

  /**
   * 存入仓库前的清理：只去首尾空白、把连续空白折叠成一个空格。
   *
   * 注意这里**不做**全角转半角。全角转半角是"为了比较时相等"的归一化手段，
   * 只该用在搜索匹配和答案比对里。如果连存储也转，用户写的
   * "微信：zhangmy2023" 会被改写成 "微信:zhangmy2023"，
   * 中文全角标点（：（）) 全被换掉，展示出来就不是用户原本写的样子了。
   */
  U.clean = function (str) {
    if (str == null) return '';
    return String(str).replace(/\s+/g, ' ').trim();
  };

  // ---------------------------------------------------------------- 时间处理

  var MINUTE = 60 * 1000;
  var HOUR = 60 * MINUTE;
  var DAY = 24 * HOUR;

  /** 补零。 */
  U.pad = function (n) {
    return (n < 10 ? '0' : '') + n;
  };

  /** Date → 'YYYY-MM-DDTHH:mm'，用于 <input type="datetime-local"> 的 value。 */
  U.toInputValue = function (date) {
    var d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()) +
      'T' + U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
  };

  /** 把各个浏览器/手工输入的时间统一解析成 Date；解析不出来返回 null。 */
  U.parseTime = function (value) {
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (value == null || value === '') return null;
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  };

  /** 'YYYY-MM-DD HH:mm'，用于详情页"拾取时间"这类需要精确到分钟的地方。 */
  U.formatDateTime = function (value) {
    var d = U.parseTime(value);
    if (!d) return '—';
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()) +
      ' ' + U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
  };

  /**
   * 相对时间文案：刚刚 / N 分钟前 / 今天 HH:mm / 昨天 HH:mm / 前天 HH:mm /
   * MM-DD / YYYY-MM-DD。列表卡片用它，让人一眼看出新旧。
   */
  U.formatRelative = function (value, now) {
    var d = U.parseTime(value);
    if (!d) return '—';
    var base = now ? U.parseTime(now) : new Date();
    if (!base) base = new Date();

    var diff = base.getTime() - d.getTime();
    if (diff < 0) diff = 0;

    if (diff < MINUTE) return '刚刚';
    if (diff < HOUR) return Math.floor(diff / MINUTE) + ' 分钟前';

    var hm = U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
    var dayDiff = U.dayDiff(d, base);
    if (dayDiff === 0) return '今天 ' + hm;
    if (dayDiff === 1) return '昨天 ' + hm;
    if (dayDiff === 2) return '前天 ' + hm;
    if (d.getFullYear() === base.getFullYear()) {
      return U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate());
    }
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate());
  };

  /** 按"自然日"计算相差天数，避免 23:59 与次日 00:01 被算成同一天。 */
  U.dayDiff = function (a, b) {
    var d1 = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    var d2 = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((d2.getTime() - d1.getTime()) / DAY);
  };

  /** 发布满 7 天后提示"信息可能已过期"。 */
  U.isStale = function (value, now) {
    var d = U.parseTime(value);
    if (!d) return false;
    var base = now ? U.parseTime(now) : new Date();
    return base.getTime() - d.getTime() > 7 * DAY;
  };

  // ---------------------------------------------------------------- 身份与编号

  var seq = 0;

  /** 生成本地唯一 id。时间戳 + 自增序号 + 随机串，避免同一毫秒内重复。 */
  U.uid = function (prefix) {
    seq = (seq + 1) % 1000;
    var rand = Math.random().toString(36).slice(2, 7);
    return (prefix || 'id') + '_' + Date.now().toString(36) + seq.toString(36) + rand;
  };

  /**
   * 认领凭证码：CL-年份-四位。四位由信息 id 与答案推导，同一信息同一答案结果稳定。
   * 用简单的散列即可，这里不承担安全职责，只是给线下交接一个可核对的编号。
   */
  U.voucherCode = function (postId, seedText, now) {
    var base = now ? U.parseTime(now) : new Date();
    var year = base ? base.getFullYear() : new Date().getFullYear();
    var text = String(postId || '') + '|' + String(seedText || '');
    var hash = 0;
    for (var i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) % 10000;
    }
    return 'CL-' + year + '-' + ('0000' + hash).slice(-4);
  };

  // ---------------------------------------------------------------- 数组与对象

  U.unique = function (list) {
    var seen = {}, out = [];
    for (var i = 0; i < list.length; i++) {
      var key = String(list[i]);
      if (!seen[key]) { seen[key] = true; out.push(list[i]); }
    }
    return out;
  };

  U.clamp = function (n, min, max) {
    return Math.min(max, Math.max(min, n));
  };

  /** 从数组里随机取 count 个不重复元素，返回新数组（不改动入参）。 */
  U.pickRandom = function (list, count, random) {
    var rnd = random || Math.random;
    var pool = list.slice();
    var out = [];
    var n = Math.min(count, pool.length);
    for (var i = 0; i < n; i++) {
      var idx = Math.floor(rnd() * pool.length);
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  };

  U.debounce = function (fn, wait) {
    var timer = null;
    return function () {
      var args = arguments, self = this;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        fn.apply(self, args);
      }, wait);
    };
  };

  // ---------------------------------------------------------------- URL 与剪贴板

  /** 读取当前地址栏的查询参数，取不到返回默认值。 */
  U.query = function (name, fallback) {
    try {
      var params = new URLSearchParams(root.location ? root.location.search : '');
      var value = params.get(name);
      return value === null ? (fallback === undefined ? '' : fallback) : value;
    } catch (e) {
      return fallback === undefined ? '' : fallback;
    }
  };

  /** 生成站内链接；写在一个地方，将来改文件名只需改这里。 */
  U.pageUrl = function (page, params) {
    var url = page + '.html';
    var parts = [];
    if (params) {
      for (var key in params) {
        if (Object.prototype.hasOwnProperty.call(params, key) &&
            params[key] !== undefined && params[key] !== null && params[key] !== '') {
          parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
        }
      }
    }
    return parts.length ? url + '?' + parts.join('&') : url;
  };

  /** 跳转到站内页面。 */
  U.go = function (page, params) {
    root.location.href = U.pageUrl(page, params);
  };

  /**
   * 复制文本到剪贴板。
   * 优先用 navigator.clipboard（需要 https 或 localhost）；file:// 下不可用时
   * 退回到 textarea + document.execCommand('copy')，保证双击打开也能复制。
   * 返回 Promise<boolean>。
   */
  U.copyText = function (text) {
    var value = String(text == null ? '' : text);

    function fallback() {
      try {
        var ta = root.document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', 'readonly');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        root.document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, value.length);
        var ok = root.document.execCommand('copy');
        root.document.body.removeChild(ta);
        return ok;
      } catch (e) {
        return false;
      }
    }

    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      return root.navigator.clipboard.writeText(value).then(function () {
        return true;
      })['catch'](function () {
        return fallback();
      });
    }
    return Promise.resolve(fallback());
  };

  // ---------------------------------------------------------------- 图片

  /** 允许上传的图片类型与单张体积上限。 */
  U.IMAGE_RULES = {
    types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxBytes: 5 * 1024 * 1024,
    maxCount: 3,
    maxWidth: 900,      // 压缩后的最大边长（首次尝试）
    quality: 0.72,      // 压缩后的 JPEG 质量（首次尝试）
    maxChars: 60000     // 单张照片压缩后的字符数上限，见 compressImage
  };

  /**
   * 本地存储的软上限（字符数）。
   * localStorage 配额约 5MB，按 UTF-16 计大约 250 万字符，
   * 这里留出余量定在 200 万，提前提醒用户而不是等浏览器抛异常。
   */
  U.STORAGE_SOFT_LIMIT = 2000000;

  /**
   * 逐级降低画质与尺寸的候选参数。
   * 单次压缩不保证达标（一张满是细节的大图，即使 900px/0.72 也可能很大），
   * 所以从高到低依次尝试，取第一个满足字符数上限的结果。
   */
  var COMPRESS_STEPS = [
    { max: 900, q: 0.72 },
    { max: 900, q: 0.60 },
    { max: 720, q: 0.55 },
    { max: 560, q: 0.50 },
    { max: 440, q: 0.45 },
    { max: 320, q: 0.40 }
  ];

  /**
   * 校验待上传的图片文件。返回 { ok, message }，message 直接可以显示给用户。
   * 与 DOM 无关，可以被单元测试覆盖。
   */
  U.validateImage = function (file, currentCount) {
    if (!file) return { ok: false, message: '没有选择文件' };
    var rules = U.IMAGE_RULES;
    var count = currentCount || 0;
    if (count >= rules.maxCount) {
      return { ok: false, message: '最多上传 ' + rules.maxCount + ' 张照片' };
    }
    if (rules.types.indexOf(file.type) === -1) {
      return { ok: false, message: '只支持 JPG / PNG / WebP / GIF 格式的图片' };
    }
    if (file.size > rules.maxBytes) {
      return { ok: false, message: '图片不能超过 ' + Math.round(rules.maxBytes / 1024 / 1024) + 'MB，请先压缩' };
    }
    return { ok: true, message: '' };
  };

  /**
   * 把图片压缩成 dataURL。
   *
   * 本地存储只有 5MB 左右，原图直接存很快会写满：一张 300KB 的 JPEG 转成
   * base64 约 40 万字符，三条信息就能撑爆配额。所以统一压缩后再存，
   * 并且逐级降质直到单张不超过 maxChars，尽量少占额度。
   *
   * 用 FileReader 读成 dataURL 再画进 canvas，而不是直接 <img src="本地路径">，
   * 是为了避免 file:// 下画布被"污染"导致 toDataURL 抛 SecurityError。
   *
   * 需要 canvas，属于浏览器能力，单元测试不覆盖（测试覆盖的是上面的体积/类型校验）。
   */
  U.compressImage = function (file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('读取图片失败')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('图片解析失败，请换 JPG / PNG 格式')); };
        img.onload = function () {
          try {
            var rules = U.IMAGE_RULES;
            var naturalW = img.naturalWidth || img.width;
            var naturalH = img.naturalHeight || img.height;
            var best = null;

            for (var i = 0; i < COMPRESS_STEPS.length; i++) {
              var step = COMPRESS_STEPS[i];
              var scale = Math.min(1, step.max / Math.max(naturalW, naturalH));
              var w = Math.max(1, Math.round(naturalW * scale));
              var h = Math.max(1, Math.round(naturalH * scale));

              var canvas = root.document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              var ctx = canvas.getContext('2d');
              ctx.fillStyle = '#ffffff';     // PNG 透明底转 JPEG 会发黑，先铺白底
              ctx.fillRect(0, 0, w, h);
              ctx.drawImage(img, 0, 0, w, h);

              best = canvas.toDataURL('image/jpeg', step.q);
              if (best.length <= rules.maxChars) break;
            }
            resolve(best);
          } catch (e) {
            reject(e);
          }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  };

  /** 把字节数变成人话，用于存储占用的提示。 */
  U.formatBytes = function (bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
