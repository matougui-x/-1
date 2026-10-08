/*!
 * 校园失物招领 —— 数据层
 *
 * 设计要点（这几条决定了整个项目为什么好测、好改）：
 *
 * 1. 存储靠"注入"。createStore(storage) 只要求 storage 提供
 *    getItem / setItem / removeItem 三个方法，和 localStorage 的接口一致。
 *    于是浏览器里传 localStorage，单元测试里传内存实现，业务代码一个字都不用改，
 *    测试也就不需要 jsdom、不需要起服务器。
 *
 * 2. 业务规则全部集中在这里，页面只负责显示。校验、搜索、状态流转、
 *    认领验证这些容易出错的逻辑都写成"输入 → 输出"的形式，可以直接断言。
 *
 * 3. 验证题的正确答案是本项目的核心隐私。任何对外输出的对象都必须经过
 *    toPublic()，它会剥掉每道题的 answer 下标。列表、搜索、详情一律走 toPublic，
 *    只有 submitClaim() 会在内部比对答案，而且比对完只回一个"通过 / 不通过"，
 *    不回传"哪一题错了"——否则认领者可以靠排除法把答案试出来。
 *
 * 4. 没有账号体系（作业不要求实名认证），用本机 uid 判断"我的发布"。
 *    因此所有写操作都要带上 actor（当前用户 id），由 store 校验归属。
 */
(function (root) {
  'use strict';

  var LF = (root.LF = root.LF || {});
  var U = LF.utils;

  // ================================================================ 存储适配器

  /** 内存适配器：单元测试用，也作为 localStorage 不可用时的兜底。 */
  LF.createMemoryAdapter = function (initial) {
    var data = {};
    if (initial) {
      for (var k in initial) {
        if (Object.prototype.hasOwnProperty.call(initial, k)) data[k] = String(initial[k]);
      }
    }
    return {
      name: 'memory',
      persistent: false,
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
      },
      setItem: function (key, value) {
        data[key] = String(value);
      },
      removeItem: function (key) {
        delete data[key];
      },
      dump: function () {
        return JSON.parse(JSON.stringify(data));
      }
    };
  };

  /**
   * 探测某个存储对象是否真的能读写。
   *
   * 光判断对象存在是不够的：无痕模式、被企业策略限制、或用户关掉了
   * "允许网站保存数据"时，访问 localStorage 这个属性本身就可能抛
   * SecurityError，setItem 也可能抛 QuotaExceededError。
   * 所以这里真写一次再删掉，确认可用才采用。
   */
  function probeStorage(getStorage) {
    var storage = null;
    try {
      storage = getStorage();
    } catch (e) {
      return null;                       // 访问属性就抛了
    }
    if (!storage) return null;
    try {
      var key = '__lf_probe__';
      storage.setItem(key, '1');
      if (storage.getItem(key) !== '1') return null;
      storage.removeItem(key);
      return storage;
    } catch (e) {
      return null;                       // 只读或写满
    }
  }

  /** 把底层存储包装成适配器；写失败时按需抛出，由上层翻译成用户提示。 */
  function wrapStorage(storage, name, persistent, fallback) {
    return {
      name: name,
      persistent: persistent,
      getItem: function (key) {
        try { return storage.getItem(key); } catch (e) { return fallback.getItem(key); }
      },
      setItem: function (key, value) {
        try {
          storage.setItem(key, value);
        } catch (e) {
          // 配额异常要往外抛，让 write() 提示用户清理；其它异常退到兜底存储
          if (isQuotaError(e)) throw e;
          fallback.setItem(key, value);
        }
      },
      removeItem: function (key) {
        try { storage.removeItem(key); } catch (e) { fallback.removeItem(key); }
      }
    };
  }

  /**
   * 浏览器适配器：按 localStorage → sessionStorage → 内存 的顺序降级。
   *
   * 为什么中间要加 sessionStorage：这是个多页应用，每跳一次页面 JS 内存全部重置。
   * 如果 localStorage 不可用就直接退回内存，"发布 → 跳成功页"那一步数据就没了，
   * 主流程直接断掉。sessionStorage 至少能让同一标签页内跨页面把流程走完。
   *
   * persistent 表示"关掉浏览器后数据还在"，页面据此决定要不要提示用户。
   */
  LF.createBrowserAdapter = function () {
    var memory = LF.createMemoryAdapter();

    var local = probeStorage(function () { return root.localStorage; });
    if (local) return wrapStorage(local, 'localStorage', true, memory);

    var session = probeStorage(function () { return root.sessionStorage; });
    if (session) {
      var wrapped = wrapStorage(session, 'sessionStorage', false, memory);
      wrapped.reason = '浏览器禁用了本地存储，已临时改用会话存储，关闭标签页后数据会丢失';
      return wrapped;
    }

    memory.reason = '浏览器禁用了本地存储，数据仅在当前页面有效';
    return memory;
  };

  /** 判断是不是"存储写满"这一类错误，各浏览器抛的名字不一样。 */
  function isQuotaError(e) {
    if (!e) return false;
    return e.name === 'QuotaExceededError' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e.code === 22 || e.code === 1014;
  }

  // ================================================================ 哪些分类要出验证题

  /**
   * 这个分类的招领信息要不要出认领验证题。
   *
   * 三态，不是布尔：
   *   true      有公开特征 → 必须出题（3–5 道客观题），答对才给联系方式；
   *   false     分类有效但没有公开特征 → 「其他」，走信任原则、不出题；
   *   null      分类压根不在字典里（脏数据）→ 出不出题无从谈起，
   *             调用方在 category 字段上已经报了错，别再补一条"请出题"的噪音。
   *
   * ★ 「其他」是这个项目里唯一的对照组：它没有可以锁死的公开特征
   *   （LF.FEATURES 里没定义，所以连特征筛选都没有），出题能问的只有
   *   "卡片上写了谁的名字"这类细节，而这一类本来就是"说不清特征"的物品——
   *   书、钥匙、水杯套、耳机盒……硬要出题，出题人只能把描述里的细节再抄一遍，
   *   等于同一份信息写两次，还容易被冒领者照着公开描述选对。
   *
   *   所以这一类走**信任原则**：描述和照片直接公开、不设验证题，
   *   见到的人直接联系发布者。代价是它没有防冒领闸门，收益是这一类终于有个
   *   说得通的流程；发布页、详情页、我的发布都会把这一点明确讲出来，不藏着。
   *
   * 判定依据是"分类有没有公开特征定义"，与 config.js 的 LF.featuresFor 同源：
   * 有特征 = 有可核对的客观细节 = 能出题。所有需要判断的地方都调这个函数，
   * 别在各处手写 category === 'other'——将来真加了第二个"不出题"的分类，只用改这里一处。
   */
  LF.allowVerifyFor = function (categoryKey) {
    if (LF.fields(LF.CATEGORIES).indexOf(categoryKey) === -1) return null;
    return LF.featuresFor(categoryKey).length > 0;
  };

  // ================================================================ 校验规则

  var LIMITS = {
    titleMin: 2, titleMax: 40,
    locationMin: 2, locationMax: 40,
    descMax: 300,
    contactNameMax: 20,
    contactDeptMax: 30,
    contactWayMin: 3, contactWayMax: 60,
    futureToleranceMs: 5 * 60 * 1000   // 允许 5 分钟的"手快填成未来时间"
  };

  LF.LIMITS = LIMITS;

  /**
   * 校验一条待发布/待编辑的信息。
   * 返回 { ok, errors }，errors 是"字段名 → 中文提示"，可直接显示在对应输入框下方。
   * 这个函数是纯的：给定同样输入必然得到同样输出，测试用例直接断言 errors 的键值。
   */
  LF.validatePost = function (input, options) {
    var opts = options || {};
    var errors = {};
    var data = input || {};
    var isFound = data.type === 'found';

    // 类型
    if (LF.fields(LF.TYPES).indexOf(data.type) === -1) {
      errors.type = '请选择信息类型';
    }

    // 物品名称
    var title = U.clean(data.title);
    if (!title) {
      errors.title = '请填写物品名称';
    } else if (title.length < LIMITS.titleMin) {
      errors.title = '物品名称至少 ' + LIMITS.titleMin + ' 个字';
    } else if (title.length > LIMITS.titleMax) {
      errors.title = '物品名称不能超过 ' + LIMITS.titleMax + ' 个字';
    }

    // 分类
    if (LF.fields(LF.CATEGORIES).indexOf(data.category) === -1) {
      errors.category = '请选择物品分类';
    }

    // 公开特征：非「其他」分类必填，取值必须是字典里的（见 config.js 的 LF.FEATURES）。
    // ★ allowEmptyFeatures 是给"非表单"的写操作留的口子：markDone / reopen 走的是
    //   store.update，patch 里根本没有 features。要是这里无条件必填，老信息就再也
    //   标记不了"已找到"——报的还是一个用户没法修的字段错（按钮不在表单里）。
    //   所以只有调用方**主动提交了 features** 时才校验，跟 allowEmptyQuestions 一个思路。
    if (!opts.allowEmptyFeatures) {
      checkFeatures(data.category, normalizeFeatures(data.category, data.features), errors);
    }

    // 地点区域
    if (LF.fields(LF.AREAS).indexOf(data.area) === -1) {
      errors.area = '请选择所在区域';
    }

    // 具体地点
    var location = U.clean(data.location);
    if (!location) {
      errors.location = '请填写具体地点';
    } else if (location.length < LIMITS.locationMin) {
      errors.location = '具体地点太短了，请写清楚一些';
    } else if (location.length > LIMITS.locationMax) {
      errors.location = '具体地点不能超过 ' + LIMITS.locationMax + ' 个字';
    }

    // 发生时间
    var when = U.parseTime(data.happenedAt);
    if (!when) {
      errors.happenedAt = isFound ? '请选择拾取时间' : '请选择丢失时间';
    } else {
      var now = opts.now ? U.parseTime(opts.now) : new Date();
      if (now && when.getTime() - now.getTime() > LIMITS.futureToleranceMs) {
        errors.happenedAt = '时间不能晚于当前时间';
      }
      if (when.getFullYear() < 2000) {
        errors.happenedAt = '时间看起来不太对，请重新选择';
      }
    }

    // 描述
    var desc = U.clean(data.description);
    if (desc.length > LIMITS.descMax) {
      errors.description = '物品描述不能超过 ' + LIMITS.descMax + ' 个字';
    }

    // 照片
    var photos = data.photos || [];
    if (photos.length > U.IMAGE_RULES.maxCount) {
      errors.photos = '最多上传 ' + U.IMAGE_RULES.maxCount + ' 张照片';
    }

    // 联系人
    var contactName = U.clean(data.contactName);
    if (!contactName) {
      errors.contactName = '请填写联系人';
    } else if (contactName.length > LIMITS.contactNameMax) {
      errors.contactName = '联系人不能超过 ' + LIMITS.contactNameMax + ' 个字';
    }

    var contactDept = U.clean(data.contactDept);
    if (contactDept.length > LIMITS.contactDeptMax) {
      errors.contactDept = '院系年级不能超过 ' + LIMITS.contactDeptMax + ' 个字';
    }

    // 联系方式
    var contactWay = U.clean(data.contactWay);
    if (!contactWay) {
      errors.contactWay = '请填写联系方式';
    } else if (contactWay.length < LIMITS.contactWayMin) {
      errors.contactWay = '联系方式太短了，请写清楚（比如"微信：abc123"）';
    } else if (contactWay.length > LIMITS.contactWayMax) {
      errors.contactWay = '联系方式不能超过 ' + LIMITS.contactWayMax + ' 个字';
    }

    // 认领验证题：只有"能出题"的招领才需要。见 LF.allowVerifyFor：
    // 非「其他」分类有公开特征可核对，出题能挡住冒领；「其他」没有可锁的特征，
    // 走的是信任原则（描述 + 照片直接公开、不出题），所以这一类不校验题目。
    // ★ 分类**非法**时也跳过（categoryAllowed 为 null）：这时已经在 category 上报了错，
    //   再补一条"请至少出 3 道验证题"是噪音——用户改了分类，这条报错自己就没了。
    var categoryAllowed = LF.allowVerifyFor(data.category);
    if (categoryAllowed === null) categoryAllowed = false;   // 分类本身已报错，不叠加题目噪音
    var questions = normalizeQuestions(data.questions);
    if (categoryAllowed && isFound && !(opts.allowEmptyQuestions && questions.length === 0)) {
      var questionError = checkQuestions(questions);
      if (questionError) errors.questions = questionError;
    }

    return { ok: Object.keys(errors).length === 0, errors: errors };
  };

  /**
   * 把任意形态的 questions 输入整理成规范结构 [{ id, type, stem, options, answer }]。
   *
   * - 判断题的选项由系统固定为「正确 / 错误」，answer 取 0 / 1；
   * - 选择题丢掉空白的选项行，并把正确答案的下标重新映射
   *   （原来选中的那行是空的，就记 -1，交给校验环节报"还没有指定正确答案"）；
   * - 题型不是 judge / choice 的整题丢弃，于是"题数不够"会自然被校验拦下。
   */
  function normalizeQuestions(questions) {
    var list = Array.isArray(questions) ? questions : [];
    var out = [];

    for (var i = 0; i < list.length; i++) {
      var raw = list[i] || {};
      var type = raw.type === 'judge' ? 'judge' : (raw.type === 'choice' ? 'choice' : '');
      if (!type) continue;

      var stem = U.clean(raw.stem);
      var options;
      var answer;

      if (type === 'judge') {
        options = LF.JUDGE_OPTIONS.slice();
        answer = Number(raw.answer) === 1 ? 1 : 0;
      } else {
        var rawOptions = Array.isArray(raw.options) ? raw.options : [];
        var wanted = Number(raw.answer);
        options = [];
        answer = -1;
        for (var j = 0; j < rawOptions.length; j++) {
          var text = U.clean(rawOptions[j]);
          if (text === '') continue;
          if (j === wanted) answer = options.length;
          options.push(text);
        }
      }

      out.push({
        id: U.clean(raw.id) || ('q' + (i + 1)),
        type: type,
        stem: stem,
        options: options,
        answer: answer
      });
    }

    return out;
  }

  /**
   * 一个说法归属哪一组易混词（返回组下标，不属于任何一组返回 null）。
   *
   * ★ 取命中的**最长**那个词，长词优先。这一步不能省：
   *   「浅蓝色」既含「浅蓝色」（第二组）也含「蓝色」（第一组），
   *   不比较长度就会归到第一组，于是「深蓝色」和「浅蓝色」被错判成同一色。
   */
  function confusableGroupOf(term) {
    var text = U.normalizeText(term);
    if (!text) return null;

    var groups = LF.CONFUSABLE_GROUPS || [];
    var best = null;

    for (var g = 0; g < groups.length; g++) {
      for (var k = 0; k < groups[g].length; k++) {
        var word = U.normalizeText(groups[g][k]);
        if (word && text.indexOf(word) !== -1 && (!best || word.length > best.length)) {
          best = { group: g, length: word.length };
        }
      }
    }

    return best ? best.group : null;
  }

  /** 一个说法是不是另一个的子串。被包含的那个至少 2 个字，免得「1」和「12」被当成易混。 */
  function isSubstringPair(a, b) {
    var x = U.normalizeText(a);
    var y = U.normalizeText(b);
    if (!x || !y || x === y) return false;

    var shorter = x.length <= y.length ? x : y;
    var longer = x.length <= y.length ? y : x;
    return shorter.length >= 2 && longer.indexOf(shorter) !== -1;
  }

  /**
   * 找出选择题里两个"认领者分不清该选哪个"的选项，没问题返回 null。
   *
   * 两种能机械识别的毛病：
   *   1. 两个选项属于同一组易混词（「深蓝色」和「藏青」）；
   *   2. 一个选项包含了另一个（「深蓝」和「深蓝色」、「图书馆」和「图书馆一楼」）。
   *
   * ★ 顺序有讲究：两个选项**都**能在易混词组里找到归属时，一律以词组表为准，
   *   不再退回子串判断。否则「蓝色」和「浅蓝色」会被子串规则误伤——
   *   它们分属两个色系，本来就是失主分得清的说法。
   *
   * 页面拿它做实时提示，checkQuestions 拿它做发布拦截。
   */
  LF.confusableOptionPair = function (options) {
    var list = (Array.isArray(options) ? options : []).map(function (item) {
      return U.clean(item);
    });
    var groups = list.map(confusableGroupOf);

    for (var i = 0; i < list.length; i++) {
      if (!list[i]) continue;
      for (var j = i + 1; j < list.length; j++) {
        if (!list[j]) continue;

        if (groups[i] !== null && groups[j] !== null) {
          if (groups[i] === groups[j]) return { a: list[i], b: list[j], reason: 'group' };
          continue;                       // 两种能分清的颜色，放行
        }
        if (isSubstringPair(list[i], list[j])) {
          return { a: list[i], b: list[j], reason: 'substring' };
        }
      }
    }
    return null;
  };

  /**
   * 公开特征在表单里的字段名。加 `feat_` 前缀是为了和 title / category / area
   * 这些既有字段名彻底隔开——ui.showFieldErrors 靠"错误键 === data-field 属性"
   * 定位到输入框（见 ui.js 的 showFieldErrors），撞名会把报错挂到别的字段上。
   */
  function featureFieldName(featureKey) {
    return 'feat_' + featureKey;
  }

  LF.featureFieldName = featureFieldName;

  /**
   * 把任意形态的 features 输入整理成规范结构。
   *
   * 只保留**当前分类**定义过的键，值一律 U.clean 过，白名单外的键直接丢掉。
   * ★ 这一步同时保证了"换分类不残留"：一条信息从「电子产品」改成「雨伞」，
   *   原来的 brand/model 不会被带过去，只剩雨伞定义的 color/handle。
   *   写入路径（create 与 update）都必须走这里，别无第二处。
   *
   * `other` 分类在字典里没有定义，于是得到 `{}`——它不是漏洞，是唯一的兜底分类，
   * 那一类靠保留自由描述框来承载信息。
   */
  function normalizeFeatures(categoryKey, input) {
    var data = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
    var out = {};

    LF.featuresFor(categoryKey).forEach(function (def) {
      out[def.key] = U.clean(data[def.key]);
    });

    return out;
  }

  LF.normalizeFeatures = normalizeFeatures;

  /** 一条信息所有公开特征的值（不含键）。搜索匹配与展示都用它。 */
  function featureValues(post) {
    var features = post && post.features;
    if (!features || typeof features !== 'object') return [];

    var out = [];
    for (var key in features) {
      if (Object.prototype.hasOwnProperty.call(features, key) && features[key]) {
        out.push(features[key]);
      }
    }
    return out;
  }

  LF.featureValues = featureValues;

  /**
   * 参与**普通子串**匹配的特征值，即排除掉通配型（打码卡号）。
   *
   * ★ 必须排除。打码卡号一旦留在关键词用的 haystack 里，`indexOf` 会让
   *   「搜 350504」命中 `350504************`，位数一致这条规矩就被绕过去了。
   *   打码卡号一律只走 matchesWildcard 那一关。
   */
  function plainFeatureValues(post) {
    var features = post && post.features;
    if (!features || typeof features !== 'object') return [];

    return LF.featuresFor(post.category).filter(function (def) {
      return !def.wildcard;
    }).map(function (def) {
      return features[def.key];
    }).filter(function (value) {
      return !!value;
    });
  }

  /**
   * 逐个特征校验，把错误写进 errors（键名是 feat_<key>）。
   *
   * 只有字典里定义过特征的分类才要求填写，所以 other 和未知分类天然豁免。
   * 这也是"一刀切"落在数据层的那一刀：非兜底分类**必须有**公开特征，
   * 因为它已经没有自由描述可以依靠了。
   */
  function checkFeatures(categoryKey, features, errors) {
    LF.featuresFor(categoryKey).forEach(function (def) {
      var field = featureFieldName(def.key);
      var value = features[def.key];

      if (!value) {
        errors[field] = (def.kind === 'select' ? '请选择' : '请填写') + def.name;
        return;
      }

      // 选项是写死的白名单：失主筛选和搜索都靠取值一致，不能让它变成自由文本
      if (def.kind === 'select' && def.options.indexOf(value) === -1) {
        errors[field] = def.name + '只能从给出的选项里选一个';
        return;
      }

      if (def.kind === 'text') {
        // 先查字符集再查长度：填了字母时，"只能填数字"比"位数不够"有用得多
        if (def.pattern && !def.pattern.test(value)) {
          errors[field] = def.name + def.format;
          return;
        }
        if (def.minLen && value.length < def.minLen) {
          errors[field] = def.name + '至少要写满 ' + def.minLen + ' 位';
          return;
        }
        if (def.maxLen && value.length > def.maxLen) {
          errors[field] = def.name + '不能超过 ' + def.maxLen + ' 位';
          return;
        }
        if (def.maxDigits) checkDigitReveal(def, value, field, errors);
      }
    });
  }

  /**
   * 打码位数检查：卡号这类"要写满总位数、但只许露出少数几位"的字段。
   *
   * 露出的位数直接决定这条信息的价值——
   *   - 一位都不写：失主没法核对，等于没提供线索；
   *   - 写满 18 位：证件号直接公开了。
   * 上下两头都要拦。总位数本身仍然保留（不足的位置用 * 占着），
   * 因为"号码是 18 位"本身就是一条失主用得上的线索。
   */
  function checkDigitReveal(def, value, field, errors) {
    var revealed = (value.match(/[0-9]/g) || []).length;

    if (revealed === 0) {
      errors[field] = def.name + '至少要写出 1 位数字，否则失主没法核对';
      return;
    }
    if (revealed > def.maxDigits) {
      errors[field] = def.name + '最多只能写出 ' + def.maxDigits + ' 位数字（现在写了 ' +
        revealed + ' 位），其余位置请用 * 代替';
    }
  }

  /** 一条信息里所有"通配型"特征值（卡号那种带 * 的）。 */
  function wildcardFeatureValues(post) {
    var features = post && post.features;
    if (!features || typeof features !== 'object') return [];

    return LF.featuresFor(post.category).filter(function (def) {
      return def.wildcard;
    }).map(function (def) {
      return U.normalizeText(features[def.key]);
    }).filter(function (value) {
      return value !== '';
    });
  }

  /**
   * 通配匹配：模式串里的 * 代表任意数字，搜索词**位数必须与模式完全一致**。
   *
   * 信息里存 `350504************`（18 位），失主这样搜都算命中：
   *   350504200510291653     写满，报出全部数字
   *   35050420**********     写满，中间不记得的用 * 顶
   *   350504********1653     写满，只记得头尾
   *
   * 为什么非要位数一致：搜索词里也会出现 *，只有位数对齐了，
   * "哪几位是我记得的、哪几位是我瞎填的"才没有歧义。允许短的话，
   * `350504200` 到底是"前 9 位"还是"前 6 位 + 后 3 位"就说不清了。
   *
   * ★ * 在**两边**都成立：模式里是 * 表示拾得者没露这一位，
   *   搜索词里是 * 表示失主不记得这一位，任意一边是 * 这一位就算过。
   */
  LF.matchesWildcard = function (pattern, term) {
    if (!pattern || !term) return false;
    if (term.length !== pattern.length) return false;   // 多一位少一位都不算

    for (var i = 0; i < term.length; i++) {
      var expected = pattern.charAt(i);
      var actual = term.charAt(i);
      if (expected === '*' || actual === '*' || expected === actual) continue;
      return false;
    }
    return true;
  };

  /** 逐题校验，返回第一条错误提示（没有错误返回空串）。 */
  function checkQuestions(list) {
    var V = LF.VERIFY;

    if (list.length < V.minQuestions) {
      return '请至少出 ' + V.minQuestions + ' 道验证题（建议 ' + V.suggestedQuestions + ' 道）';
    }
    if (list.length > V.maxQuestions) {
      return '最多只能出 ' + V.maxQuestions + ' 道验证题';
    }

    for (var i = 0; i < list.length; i++) {
      var q = list[i];
      var no = '第 ' + (i + 1) + ' 题';

      if (q.stem.length < V.stemMin) return no + '的题目太短，至少 ' + V.stemMin + ' 个字';
      if (q.stem.length > V.stemMax) return no + '的题目不能超过 ' + V.stemMax + ' 个字';
      if (q.options.length < V.minOptions) return no + '至少要有 ' + V.minOptions + ' 个选项';
      if (q.options.length > V.maxOptions) return no + '最多只能有 ' + V.maxOptions + ' 个选项';

      for (var j = 0; j < q.options.length; j++) {
        if (q.options[j].length > V.optionMax) {
          return no + '的选项太长，单个选项不要超过 ' + V.optionMax + ' 个字';
        }
        if (q.options.indexOf(q.options[j]) !== j) {
          return no + '有重复的选项，认领者没法区分';
        }
      }

      // 选项之间要差别明显：含糊的选项会把"判不准"从答案搬到选项上，
      // 真正的失主看见两个意思接近的说法，会选错、然后被系统判成冒领的人
      var confusable = LF.confusableOptionPair(q.options);
      if (confusable) {
        var why = confusable.reason === 'substring' ? '一个包含了另一个' : '意思太接近';
        return no + '的「' + confusable.a + '」和「' + confusable.b + '」' + why +
          '，真正的失主也可能选错，请改成差别明显的说法';
      }

      if (q.answer < 0 || q.answer >= q.options.length) return no + '还没有指定正确答案';
    }

    return '';
  }

  /** 一条信息里结构完整的题目。展示与判定都只认这些题，脏数据不会拖垮流程。 */
  function completeQuestions(post) {
    var list = post && Array.isArray(post.questions) ? post.questions : [];
    return list.filter(function (item) {
      return item &&
        (item.type === 'judge' || item.type === 'choice') &&
        U.clean(item.stem) !== '' &&
        Array.isArray(item.options) &&
        item.options.length >= LF.VERIFY.minOptions &&
        Number(item.answer) >= 0 &&
        Number(item.answer) < item.options.length;
    });
  }

  /**
   * 一道题的对外形态。
   * ★ 必须重新造对象：直接把内部题目交出去，answer 就跟着泄漏了。
   */
  function publicQuestion(item) {
    return {
      id: item.id,
      type: item.type,
      typeName: LF.questionTypeOf(item.type).name,
      stem: item.stem,
      options: item.options.slice()
    };
  }

  /** 剩余作答次数（数值被外部改坏时退回上限）。 */
  function attemptsLeftOf(post) {
    var left = Number(post && post.attemptsLeft);
    if (isNaN(left)) left = LF.VERIFY.maxAttempts;
    return U.clamp(Math.floor(left), 0, LF.VERIFY.maxAttempts);
  }

  /** 认领者是否已经选好某一题的答案。 */
  function isChosen(value, optionCount) {
    if (value === null || value === undefined || value === '') return false;
    var n = Number(value);
    return !isNaN(n) && Math.floor(n) === n && n >= 0 && n < optionCount;
  }

  /**
   * 旧数据迁移，就地升级到当前 DATA_VERSION。
   *
   * v1 → v2：第一版的"隐藏特征"是发布者手打的自由文本答案，没法自动变成客观题，
   *   所以只保留公开字段，把验证降级为"关闭"，并记下旧特征的名称，
   *   由「我的发布」提示发布者重新出题。宁可少一个功能，也不编造答案。
   * v2 → v3：公开特征改成按分类锁定的结构，老记录补一个空 features。
   * v3 → v4：「其他」分类改成信任原则、不再出验证题，旧数据里那一类的题目就地清掉。
   *
   * 每一步都幂等：迁移过的记录不会再变，所以每次读都跑一遍也没有副作用。
   */
  function migratePost(input) {
    var post = input;
    if (!post || typeof post !== 'object') return { post: post, changed: false };

    var changed = false;

    if (!Array.isArray(post.questions)) {
      var legacy = Array.isArray(post.hidden) ? post.hidden : [];
      var filled = legacy.filter(function (item) { return item && U.clean(item.a) !== ''; });
      post.questions = [];
      delete post.hidden;
      if (filled.length) {
        post.legacyVerify = true;
        post.legacyHidden = filled.map(function (item) { return U.clean(item.q); }).filter(Boolean);
      }
      changed = true;
    }

    if (typeof post.attemptsLeft !== 'number' || isNaN(post.attemptsLeft)) {
      post.attemptsLeft = LF.VERIFY.maxAttempts;
      changed = true;
    }
    if (!Array.isArray(post.claims)) { post.claims = []; changed = true; }
    if (!Array.isArray(post.appeals)) { post.appeals = []; changed = true; }

    // v2 → v3：公开特征改成按分类锁定的结构。老记录没有这个字段，
    // 就地补一个空对象，页面拿到的是 {} 而不是 undefined，省掉满地的判空。
    // 空特征意味着"这条信息还没补上公开特征"，编辑时会被强制补齐。
    if (!post.features || typeof post.features !== 'object' || Array.isArray(post.features)) {
      post.features = {};
      changed = true;
    }
    if ('revealMode' in post) { delete post.revealMode; changed = true; }
    if ('pendingClaim' in post) { delete post.pendingClaim; changed = true; }

    // v3 → v4：「其他」分类改成信任原则、不再出验证题。
    // 旧数据里这一类还挂着题目（演示数据 seed_6 就有一组），必须清掉——
    // 否则它会继续按老规矩要求认领者答题，而发布页已经不再提供题目编辑入口，
    // 发布者连"删掉这套题"都做不到，就被永久锁在旧流程里了。
    // 题目没了，attemptsLeft 也就没有意义，一并复位，免得留下一堆读不懂的字段。
    if (Array.isArray(post.questions) && post.questions.length &&
        !LF.allowVerifyFor(post.category)) {
      post.questions = [];
      post.attemptsLeft = LF.VERIFY.maxAttempts;
      changed = true;
    }

    return { post: post, changed: changed };
  }

  // ================================================================ 公开视图

  /**
   * 招领信息设置了验证题时，非发布者必须答对全部题目才能看到联系方式。
   *
   * 两个条件缺一不可：这个分类允许出题（「其他」不出题），并且真的存着完整的题目。
   * 只看"存没存题目"是不够的——旧数据、以及从别的分类改成「其他」的历史记录里
   * 可能还留着题目，那些题已经不该生效了（迁移会清掉，但读到脏数据时也不能放行）。
   */
  function needsVerify(post) {
    return post.type === 'found' &&
      LF.allowVerifyFor(post.category) &&
      completeQuestions(post).length > 0;
  }

  LF.needsVerify = needsVerify;

  /**
   * 把内部数据转成可以安全交给页面的对象。
   * ★ 这里有三样东西必须剥掉：
   *   1. 每道题的 answer（正确答案下标）——泄漏了等于把钥匙给了冒领的人；
   *   2. claims（认领记录）——里面有认领者提交的选择；
   *   3. appeals（申诉记录）——里面有申诉人的姓名和联系方式。
   *   认领者只能拿到"自己那一条申诉"的进度。
   */
  LF.toPublic = function (post, options) {
    var opts = options || {};
    var out = {};
    var key;

    for (key in post) {
      if (Object.prototype.hasOwnProperty.call(post, key)) out[key] = post[key];
    }

    var questions = completeQuestions(post);
    out.questionCount = questions.length;
    out.questionMix = LF.questionMix(questions);
    out.questions = questions.map(publicQuestion);

    delete out.hidden;          // 旧版字段，迁移后不应再出现
    delete out.pendingClaim;
    delete out.claims;
    delete out.appeals;
    delete out.legacyHidden;    // 只有"我的发布"需要旧特征名，改用下面的数量提示
    delete out.ownerId;         // 归属关系用 isOwner 表达，不直接把 uid 交给页面

    var isOwner = !!opts.viewerId && opts.viewerId === post.ownerId;
    out.isOwner = isOwner;
    out.needVerify = needsVerify(post);
    out.attemptsLeft = attemptsLeftOf(post);
    out.legacyVerify = !!post.legacyVerify;
    out.legacyHiddenCount = Array.isArray(post.legacyHidden) ? post.legacyHidden.length : 0;

    // 申诉通道：3 次全败后解锁。发布者看全部，认领者只能看自己那一条。
    var appeals = Array.isArray(post.appeals) ? post.appeals : [];
    var mine = null;
    for (var a = 0; a < appeals.length; a++) {
      if (appeals[a] && appeals[a].claimantId && appeals[a].claimantId === opts.viewerId) mine = appeals[a];
    }
    out.appealCount = isOwner ? appeals.length : 0;
    out.appealPending = isOwner
      ? appeals.filter(function (item) { return item.decision === 'pending'; }).length
      : 0;
    out.myAppeal = (!isOwner && mine) ? publicAppeal(mine, false) : null;
    out.appealApproved = !!(mine && mine.decision === 'approved');
    out.canAppeal = !isOwner && out.needVerify && post.status !== 'done' && out.attemptsLeft <= 0;

    out.locked = out.needVerify && !isOwner && !opts.unlocked && !out.appealApproved;

    if (out.locked) {
      out.contactWay = '';     // 未解锁：联系方式根本不进页面
    }
    // 发布人姓名对非发布者一律打码，页面上显示成"张**"
    out.contactName = isOwner ? post.contactName : maskName(post.contactName);

    var doneType = post.doneType && LF.DONE_TYPES[post.type] ? LF.DONE_TYPES[post.type] : null;
    out.doneLabel = post.status === 'done' && doneType ? doneType.name : '';
    out.statusLabel = post.status === 'done'
      ? (doneType ? doneType.name : '已完成')
      : (post.type === 'found' ? '待认领' : '寻找中');

    out.categoryName = LF.categoryOf(post.category).name;
    out.categoryIcon = LF.categoryOf(post.category).icon;
    out.areaName = LF.areaOf(post.area).name;
    out.typeName = LF.typeOf(post.type).name;
    out.typeTag = LF.typeOf(post.type).tag;
    out.thumb = (post.photos && post.photos.length) ? post.photos[0] : LF.categoryOf(post.category).icon;

    // 认领统计：给"我的发布"用；对非发布者只给 0，避免泄露有多少人在认领
    var claims = Array.isArray(post.claims) ? post.claims : [];
    out.claimCount = isOwner ? claims.length : 0;
    out.claimPassed = isOwner ? claims.filter(function (c) { return c.passed; }).length : 0;

    return out;
  };

  /** 申诉记录的对外形态：认领者只看自己的进度，发布者才看得到申诉明细。 */
  function publicAppeal(appeal, withClaimant) {
    var out = {
      id: appeal.id,
      at: appeal.at,
      decision: appeal.decision || 'pending',
      note: appeal.note || '',
      voucher: appeal.voucher || ''
    };
    if (withClaimant) {
      out.name = appeal.name || '';
      out.contact = appeal.contact || '';
      out.detail = appeal.detail || '';
      out.decidedAt = appeal.decidedAt || null;
    }
    return out;
  }

  /** 姓名打码：张三四 → 张**，用于公开页面的"发布人"一行。 */
  function maskName(name) {
    var s = U.clean(name);
    if (!s) return '匿名同学';
    if (s.length === 1) return s;
    return s.charAt(0) + new Array(s.length).join('*');
  }

  LF.maskName = maskName;

  // ================================================================ 搜索与排序

  /**
   * 关键词匹配：空格分隔的多个词之间是"与"的关系，每个词只要命中
   * 物品名 / 描述 / 地点 / 分类名 / 区域名 / 公开特征值 任意一处就算命中。
   * 归一化后比较，所以"校园卡"和"校园卡 "、"ABC"和"abc"结果一致。
   *
   * 打码的卡号是特例：存的是 `350504************` 这种带 * 的形式，
   * 走普通子串匹配的话失主搜自己的完整号码反而搜不到，所以额外走一遍通配匹配
   * （见 LF.matchesWildcard）。
   */
  LF.matchKeyword = function (post, keyword) {
    var terms = U.normalizeText(keyword).split(' ').filter(function (t) { return t !== ''; });
    if (!terms.length) return true;

    // 公开特征的值要一起参与匹配，否则"搜华为"找不到那条华为耳机——
    // 而让失主搜得到，正是把这些字段锁成固定取值的意义所在
    var haystack = U.normalizeText([
      post.title,
      post.description,
      post.location,
      LF.categoryOf(post.category).name,
      LF.areaOf(post.area).name,
      LF.typeOf(post.type).name,
      maskName(post.contactName)
    ].concat(plainFeatureValues(post)).join(' '));

    var wildcards = wildcardFeatureValues(post);

    for (var i = 0; i < terms.length; i++) {
      if (haystack.indexOf(terms[i]) !== -1) continue;

      // 普通子串没命中，再看能不能落进通配型特征（打码的卡号）：
      // 信息里存的是 350504************，失主搜完整的身份证号也要能命中
      var hit = false;
      for (var w = 0; w < wildcards.length; w++) {
        if (LF.matchesWildcard(wildcards[w], terms[i])) { hit = true; break; }
      }
      if (!hit) return false;
    }
    return true;
  };

  var SORTERS = {
    latest: function (a, b) { return b.createdAt - a.createdAt; },
    oldest: function (a, b) { return a.createdAt - b.createdAt; },
    hot: function (a, b) { return (b.views - a.views) || (b.createdAt - a.createdAt); }
  };

  LF.SORTERS = SORTERS;

  /**
   * 特征筛选：wanted 形如 `{ brand: '华为', color: 'all' }`，
   * 空值或 'all' 表示这一项不限，其余逐项精确匹配（全中才算命中）。
   *
   * 精确匹配是有意的：特征取值本来就是固定白名单，用模糊匹配只会让
   * "选了黑色却搜出深灰色"这种事发生，失主反而更找不着。
   */
  function matchFeatures(post, wanted) {
    if (!wanted) return true;

    for (var key in wanted) {
      if (!Object.prototype.hasOwnProperty.call(wanted, key)) continue;
      if (!wanted[key] || wanted[key] === 'all') continue;
      if (!post.features || post.features[key] !== wanted[key]) return false;
    }
    return true;
  }

  LF.matchFeatures = matchFeatures;

  /** 在一批数据上执行筛选 + 排序，返回内部对象数组（调用方再决定要不要 toPublic）。 */
  LF.queryPosts = function (posts, query) {
    var q = query || {};
    var result = posts.filter(function (post) {
      if (q.type && q.type !== 'all' && post.type !== q.type) return false;
      if (q.category && q.category !== 'all' && post.category !== q.category) return false;
      if (q.area && q.area !== 'all' && post.area !== q.area) return false;
      if (q.status && q.status !== 'all' && post.status !== q.status) return false;
      if (q.ownerId && post.ownerId !== q.ownerId) return false;
      if (q.excludeId && post.id === q.excludeId) return false;
      if (q.features && !matchFeatures(post, q.features)) return false;
      if (q.keyword && !LF.matchKeyword(post, q.keyword)) return false;
      return true;
    });

    var sorter = SORTERS[q.sort] || SORTERS.latest;
    return result.sort(sorter);
  };

  // ================================================================ 创建 store

  /**
   * @param {object} storage 具备 getItem/setItem/removeItem 的存储对象
   * @param {object} [options] { now: 固定当前时间（测试用） }
   */
  LF.createStore = function (storage, options) {
    var store = {};
    var opts = options || {};
    var seed = opts.seed || [];

    function now() {
      return opts.now ? U.parseTime(opts.now).getTime() : Date.now();
    }

    // ------------------------------------------------------------ 原始读写

    function readJson(key, fallback) {
      var raw;
      try {
        raw = storage.getItem(key);
      } catch (e) {
        return fallback;
      }
      if (raw == null || raw === '') return fallback;
      try {
        var parsed = JSON.parse(raw);
        return parsed == null ? fallback : parsed;
      } catch (e) {
        // 数据被外部改坏了：不让整个页面白屏，退回默认值，页面还能用
        return fallback;
      }
    }

    /**
     * 写回存储。
     *
     * 先按软上限拦一道，再交给浏览器写。这样即使用户的浏览器配额比预想的小，
     * 我们给出的也是"请清理旧信息"这种能照做的提示，而不是一句原始报错。
     * 任何失败都返回错误对象而不是抛异常，页面永远有东西可显示。
     */
    function writeJson(key, value) {
      var json;
      try {
        json = JSON.stringify(value);
      } catch (e) {
        return { ok: false, message: '数据无法保存：包含无法序列化的内容' };
      }

      if (json.length > U.STORAGE_SOFT_LIMIT) {
        return {
          ok: false,
          quota: true,
          message: '本地存储快满了（已用约 ' + U.formatBytes(json.length * 2) + '）。' +
            '请到「我的发布」删除一些带照片的旧信息后重试。'
        };
      }

      try {
        storage.setItem(key, json);
        return { ok: true };
      } catch (e) {
        if (isQuotaError(e)) {
          return {
            ok: false,
            quota: true,
            message: '本地存储空间不足，无法保存。请到「我的发布」删除一些带照片的旧信息后重试。'
          };
        }
        return { ok: false, message: '保存失败：' + (e && e.message ? e.message : '未知错误') };
      }
    }

    function readPosts() {
      var list = readJson(LF.KEYS.posts, null);
      if (!Array.isArray(list)) return [];
      // 过滤掉结构明显不对的脏数据，避免一条坏数据拖垮整个列表；
      // 顺便把旧版本的数据就地升级（迁移是幂等的，迁移过的记录不会再变）
      return list.filter(function (item) {
        return item && typeof item === 'object' && typeof item.id === 'string';
      }).map(function (item) {
        return migratePost(item).post;
      });
    }

    function writePosts(list) {
      return writeJson(LF.KEYS.posts, list);
    }

    function findPost(id) {
      var list = readPosts();
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i];
      }
      return null;
    }

    // ------------------------------------------------------------ 初始化

    /**
     * 首次运行灌入演示数据。
     * 判断依据是"存储里有没有 posts 这个键"，所以用户把数据全删光之后
     * 也不会又被塞回来——只有在真正第一次打开时才写入。
     * @param {Array} [seedPosts] 演示数据，不传则用创建 store 时给的 seed
     */
    store.init = function (seedPosts) {
      if (readJson(LF.KEYS.posts, null) !== null) return { seeded: false };
      var result = writeJson(LF.KEYS.posts, seedPosts || seed);
      return { seeded: result.ok, error: result.message };
    };

    /**
     * 把迁移结果落盘一次（bootstrap 里调用）。
     * readPosts() 每次读都会迁移，但只存在内存里；这里做一次真正的写回，
     * 免得旧数据每次打开都要重算一遍。返回被停用旧验证的条数。
     */
    store.migrate = function () {
      var raw = readJson(LF.KEYS.posts, null);
      if (!Array.isArray(raw)) return { ok: true, migrated: 0 };

      var changed = false;
      var legacyCount = 0;
      var out = raw.filter(function (item) {
        return item && typeof item === 'object' && typeof item.id === 'string';
      }).map(function (item) {
        var result = migratePost(item);
        if (result.changed) changed = true;
        if (result.post && result.post.legacyVerify) legacyCount++;
        return result.post;
      });

      if (!changed) return { ok: true, migrated: legacyCount };
      var written = writeJson(LF.KEYS.posts, out);
      return { ok: written.ok, migrated: legacyCount, error: written.message };
    };

    // ------------------------------------------------------------ 读

    /** 列表查询，返回公开视图数组。 */
    store.list = function (query) {
      var q = query || {};
      var rows = LF.queryPosts(readPosts(), q);
      return rows.map(function (post) {
        return LF.toPublic(post, {
          viewerId: q.viewerId,
          unlocked: q.viewerId ? store.isUnlocked(post.id) : false
        });
      });
    };

    /** 取一条信息的公开视图；countView 为真时同时累加浏览量。 */
    store.get = function (id, viewerId, countView) {
      var post = findPost(id);
      if (!post) return null;
      if (countView) store.bumpView(id);
      var fresh = countView ? findPost(id) : post;
      return LF.toPublic(fresh, {
        viewerId: viewerId,
        unlocked: viewerId ? store.isUnlocked(id) : false
      });
    };

    /** 判断一条信息是否存在（详情页 404 用）。 */
    store.exists = function (id) {
      return !!findPost(id);
    };

    store.bumpView = function (id) {
      var list = readPosts();
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          list[i].views = (Number(list[i].views) || 0) + 1;
          writePosts(list);
          return list[i].views;
        }
      }
      return 0;
    };

    /** 我的发布：按进行中 / 已完成分组。 */
    store.listMine = function (ownerId) {
      var rows = LF.queryPosts(readPosts(), { ownerId: ownerId, sort: 'latest' });
      var toView = function (post) { return LF.toPublic(post, { viewerId: ownerId, unlocked: true }); };
      return {
        open: rows.filter(function (p) { return p.status === 'open'; }).map(toView),
        done: rows.filter(function (p) { return p.status === 'done'; }).map(toView)
      };
    };

    // ------------------------------------------------------------ 写

    /**
     * 发布一条信息。
     * @returns {{ok:boolean, post?:object, errors?:object}}
     */
    store.create = function (input, actor) {
      var data = input || {};
      var check = LF.validatePost(data, { now: now() });
      if (!check.ok) return { ok: false, errors: check.errors };
      if (!actor) return { ok: false, errors: { _: '无法确认本机身份，请刷新页面重试' } };

      var timestamp = now();
      var post = {
        id: U.uid(data.type === 'found' ? 'found' : 'lost'),
        type: data.type,
        title: U.clean(data.title),
        category: data.category,
        area: data.area,
        location: U.clean(data.location),
        happenedAt: U.parseTime(data.happenedAt).toISOString(),
        // 锁死了公开特征的分类不再保留自由描述——那条 300 字的口子正是特征泄漏的来源
        // （演示数据里就出现过"描述写了伞柄有划痕、验证题正好问划痕"）。
        // 只有兜底的「其他」分类还留描述框，所以这里按"该分类有没有特征定义"来判。
        description: LF.featuresFor(data.category).length ? '' : U.clean(data.description),
        features: normalizeFeatures(data.category, data.features),
        photos: (data.photos || []).slice(0, U.IMAGE_RULES.maxCount),
        contactName: U.clean(data.contactName),
        contactDept: U.clean(data.contactDept),
        contactWay: U.clean(data.contactWay),
        status: 'open',
        doneType: null,
        doneAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        views: 0,
        ownerId: actor,
        // 认领验证题：「其他」分类走信任原则，不出题——所以这里把题目强制清空，
        // 与 description 那一行同一个道理（表单里收不到的东西，数据层负责拦住）。
        questions: (data.type === 'found' && LF.allowVerifyFor(data.category))
          ? normalizeQuestions(data.questions)
          : [],
        claims: [],
        appeals: [],
        attemptsLeft: LF.VERIFY.maxAttempts
      };

      var list = readPosts();
      list.push(post);
      var written = writePosts(list);
      if (!written.ok) return { ok: false, errors: { _: written.message } };

      return { ok: true, post: LF.toPublic(post, { viewerId: actor, unlocked: true }) };
    };

    /**
     * 编辑。id / createdAt / views / ownerId 一律以原记录为准，
     * 防止前端传参把浏览量和归属改掉。
     */
    store.update = function (id, patch, actor) {
      var list = readPosts();
      for (var i = 0; i < list.length; i++) {
        if (list[i].id !== id) continue;
        var original = list[i];

        if (!actor || original.ownerId !== actor) {
          return { ok: false, errors: { _: '只有发布者本人可以修改这条信息' } };
        }

        var merged = {};
        for (var key in original) {
          if (Object.prototype.hasOwnProperty.call(original, key)) merged[key] = original[key];
        }
        for (var pk in patch) {
          if (Object.prototype.hasOwnProperty.call(patch, pk)) merged[pk] = patch[pk];
        }
        merged.id = original.id;
        merged.createdAt = original.createdAt;
        merged.views = original.views;
        merged.ownerId = original.ownerId;
        merged.claims = original.claims;
        merged.appeals = original.appeals;
        merged.attemptsLeft = original.attemptsLeft;

        // 旧版遗留标记不能在编辑时被前端顺手抹掉，由这里决定去留
        var wasLegacy = !!original.legacyVerify;

        var check = LF.validatePost(merged, {
          now: now(),
          allowEmptyQuestions: wasLegacy,      // 旧信息允许先只改标题，验证题留待以后补
          // 只有当 patch 真的带了 features（发布页提交表单）才要求必填。
          // markDone / reopen 这类状态流转不带这个键，不该被特征校验拦住。
          allowEmptyFeatures: !Object.prototype.hasOwnProperty.call(patch, 'features')
        });
        if (!check.ok) return { ok: false, errors: check.errors };

        merged.title = U.clean(merged.title);
        merged.location = U.clean(merged.location);
        merged.description = LF.featuresFor(merged.category).length ? '' : U.clean(merged.description);
        // ★ 按**新**分类重建整个 features，而不是把 patch 盖上去：
        //   store.update 是浅合并，直接盖的话，从「电子产品」改成「雨伞」后，
        //   原来的 brand/model 会留在存储里，变成一个分类对不上的幽灵字段。
        merged.features = normalizeFeatures(merged.category, merged.features);
        merged.contactName = U.clean(merged.contactName);
        merged.contactDept = U.clean(merged.contactDept);
        merged.contactWay = U.clean(merged.contactWay);
        merged.happenedAt = U.parseTime(merged.happenedAt).toISOString();
        // 同上：改成「其他」、或者改成寻物时，原来那套题必须一起清掉，
        // 否则换个分类就凭空多出一组仍然生效的验证题。
        merged.questions = (merged.type === 'found' && LF.allowVerifyFor(merged.category))
          ? normalizeQuestions(merged.questions)
          : [];

        // 题目被换掉了，之前失败的那几次不应该继续占用新题的次数
        var before = JSON.stringify(completeQuestions(original));
        if (JSON.stringify(completeQuestions(merged)) !== before) {
          merged.attemptsLeft = LF.VERIFY.maxAttempts;
        }

        // 重新出好题之后，旧版标记就该撤掉（撤掉后才会重新要求验证）
        if (wasLegacy && completeQuestions(merged).length > 0) {
          delete merged.legacyVerify;
          delete merged.legacyHidden;
        } else if (wasLegacy) {
          merged.legacyVerify = true;
          if (Array.isArray(original.legacyHidden)) merged.legacyHidden = original.legacyHidden;
        }

        merged.updatedAt = now();

        list[i] = merged;
        var written = writePosts(list);
        if (!written.ok) return { ok: false, errors: { _: written.message } };

        return { ok: true, post: LF.toPublic(merged, { viewerId: actor, unlocked: true }) };
      }
      return { ok: false, errors: { _: '这条信息不存在或已被删除' } };
    };

    /** 删除。只有发布者能删。 */
    store.remove = function (id, actor) {
      var list = readPosts();
      var index = -1;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) { index = i; break; }
      }
      if (index === -1) return { ok: false, errors: { _: '这条信息不存在或已被删除' } };
      if (!actor || list[index].ownerId !== actor) {
        return { ok: false, errors: { _: '只有发布者本人可以删除这条信息' } };
      }
      list.splice(index, 1);
      var written = writePosts(list);
      if (!written.ok) return { ok: false, errors: { _: written.message } };
      store.forgetUnlocked(id);
      return { ok: true };
    };

    /**
     * 更新状态：寻物 → 已找到，招领 → 已归还。
     * 这是作业要求的主流程最后一环，也是"减少无效联系"的关键——
     * 东西找到后把信息标掉，别人才不会白跑一趟。
     */
    store.markDone = function (id, actor) {
      var post = findPost(id);
      if (!post) return { ok: false, errors: { _: '这条信息不存在或已被删除' } };
      if (!actor || post.ownerId !== actor) {
        return { ok: false, errors: { _: '只有发布者本人可以更新状态' } };
      }
      if (post.status === 'done') {
        return { ok: true, post: LF.toPublic(post, { viewerId: actor, unlocked: true }), unchanged: true };
      }
      return store.update(id, {
        status: 'done',
        doneType: LF.DONE_TYPES[post.type].key,
        doneAt: now()
      }, actor);
    };

    /** 撤回"已完成"，重新挂出来（东西又没找到、归还搞错了等）。 */
    store.reopen = function (id, actor) {
      var post = findPost(id);
      if (!post) return { ok: false, errors: { _: '这条信息不存在或已被删除' } };
      if (!actor || post.ownerId !== actor) {
        return { ok: false, errors: { _: '只有发布者本人可以更新状态' } };
      }
      if (post.status === 'open') {
        return { ok: true, post: LF.toPublic(post, { viewerId: actor, unlocked: true }), unchanged: true };
      }
      return store.update(id, { status: 'open', doneType: null, doneAt: null }, actor);
    };

    // ------------------------------------------------------------ 认领验证

    /**
     * 开始一次认领验证：把发布者出的题全部取回来。
     *
     * 第二版方案是"一次性答完所有题"，不再随机抽题，所以这里不再写 pendingClaim：
     * 判定只认信息里存的题目，认领者拼不出自己的题，也躲不开要答的题。
     * 返回的题目对象里没有 answer，正确答案始终留在数据层。
     */
    store.startClaim = function (id) {
      var post = findPost(id);
      if (!post) return { ok: false, message: '这条信息不存在或已被删除' };
      if (!needsVerify(post)) return { ok: false, message: '这条信息不需要验证，可以直接联系发布者' };
      if (post.status === 'done') return { ok: false, message: '这条信息已完成，无需再认领' };

      var left = attemptsLeftOf(post);
      if (left <= 0) {
        return {
          ok: false, locked: true, canAppeal: true, remaining: 0,
          message: '尝试次数已用完，请提交申诉走人工审核'
        };
      }

      var questions = completeQuestions(post);
      return {
        ok: true,
        questions: questions.map(publicQuestion),
        questionCount: questions.length,
        questionMix: LF.questionMix(questions),
        remaining: left,
        maxAttempts: LF.VERIFY.maxAttempts
      };
    };

    /**
     * 提交认领答案：一次性提交全部题目。
     *
     * @param {string} id
     * @param {object|Array} answers { 题目id: 选项下标 } 或 [{ id, choice }]
     * @returns {{ok, passed, remaining, maxAttempts, message, canAppeal, locked,
     *            voucher?, contact?, questionCount?, correctCount?}}
     *
     * ★ 系统统一判定，不告诉认领者具体哪题错：未通过时只回一句
     *   "回答的细节与描述不符"。否则答错一次就等于排除一个选项，
     *   3 次机会足够把答案试出来，限制次数也就白设了。
     */
    store.submitClaim = function (id, answers) {
      var post = findPost(id);
      if (!post) return { ok: false, message: '这条信息不存在或已被删除' };
      if (!needsVerify(post)) return { ok: false, message: '这条信息不需要验证' };
      if (post.status === 'done') return { ok: false, message: '这条信息已完成，无需再认领' };

      var left = attemptsLeftOf(post);
      if (left <= 0) {
        return {
          ok: false, locked: true, canAppeal: true, remaining: 0,
          message: '尝试次数已用完，请提交申诉走人工审核'
        };
      }

      var questions = completeQuestions(post);
      var answerMap = toAnswerMap(answers);
      var unanswered = questions.filter(function (question) {
        return !isChosen(answerMap[question.id], question.options.length);
      });
      if (unanswered.length) {
        return { ok: false, message: '还有 ' + unanswered.length + ' 道题没有作答' };
      }

      var correctCount = 0;
      var record = {
        at: now(),
        passed: false,
        answers: questions.map(function (question) {
          var choice = Number(answerMap[question.id]);
          var correct = choice === Number(question.answer);
          if (correct) correctCount++;
          return {
            id: question.id,
            type: question.type,
            stem: question.stem,
            choice: choice,
            choiceText: question.options[choice],
            correct: correct
          };
        })
      };

      var passed = correctCount === questions.length;
      record.passed = passed;

      var list = readPosts();
      var index = -1;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) { index = i; break; }
      }
      if (index === -1) return { ok: false, message: '这条信息不存在或已被删除' };

      var voucher = '';
      if (passed) {
        voucher = U.voucherCode(id, String(post.createdAt || ''), now());
        record.voucher = voucher;
      }

      list[index].claims = (list[index].claims || []).concat([record]);
      list[index].appeals = list[index].appeals || [];
      if (!passed) list[index].attemptsLeft = left - 1;

      var written = writePosts(list);
      if (!written.ok) return { ok: false, message: written.message };

      if (!passed) {
        var remaining = left - 1;
        return {
          ok: true,
          passed: false,
          remaining: remaining,
          maxAttempts: LF.VERIFY.maxAttempts,
          locked: remaining <= 0,
          canAppeal: remaining <= 0,
          questionCount: questions.length,
          message: '回答的细节与描述不符'
        };
      }

      // 通过：记下解锁状态，之后同一台设备再看这条信息可以直接看到联系方式
      store.markUnlocked(id, voucher);
      var fresh = findPost(id);

      return {
        ok: true,
        passed: true,
        remaining: left,
        maxAttempts: LF.VERIFY.maxAttempts,
        questionCount: questions.length,
        correctCount: correctCount,
        voucher: voucher,
        contact: {
          name: fresh.contactName,
          dept: fresh.contactDept,
          way: fresh.contactWay
        }
      };
    };

    function toAnswerMap(answers) {
      var map = {};
      if (Array.isArray(answers)) {
        answers.forEach(function (item) {
          if (item && item.id) map[item.id] = item.choice;
        });
      } else if (answers && typeof answers === 'object') {
        for (var key in answers) {
          if (Object.prototype.hasOwnProperty.call(answers, key)) map[key] = answers[key];
        }
      }
      return map;
    }

    /** 查看某条信息已经收到的认领申请（只有发布者能看）。 */
    store.listClaims = function (id, actor) {
      var post = findPost(id);
      if (!post) return { ok: false, message: '这条信息不存在或已被删除' };
      if (!actor || post.ownerId !== actor) {
        return { ok: false, message: '只有发布者本人可以查看认领申请' };
      }
      return {
        ok: true,
        claims: (post.claims || []).map(function (item) {
          return {
            at: item.at,
            passed: item.passed,
            answers: (item.answers || []).map(function (answer) {
              return {
                stem: answer.stem || '',
                type: answer.type || 'choice',
                choiceText: answer.choiceText == null ? '（未作答）' : answer.choiceText,
                correct: !!answer.correct
              };
            }),
            voucher: item.voucher || ''
          };
        }),
        remaining: attemptsLeftOf(post),
        questionCount: completeQuestions(post).length
      };
    };

    /**
     * 编辑时取回完整记录（含每道题的正确答案），只有发布者本人拿得到。
     * 页面用它回填表单；公开视图永远不带 answer。
     */
    store.getEditable = function (id, actor) {
      var post = findPost(id);
      if (!post) return { ok: false, message: '这条信息不存在或已被删除' };
      if (!actor || post.ownerId !== actor) {
        return { ok: false, message: '只有发布者本人可以编辑这条信息' };
      }

      var out = JSON.parse(JSON.stringify(post));
      out.questions = completeQuestions(post).map(function (item) {
        return {
          id: item.id,
          type: item.type,
          stem: item.stem,
          options: item.options.slice(),
          answer: item.answer
        };
      });
      return { ok: true, post: out };
    };

    // ------------------------------------------------------------ 申诉（人工审核通道）

    /**
     * 提交申诉：认领者 3 次全败之后才会走到这里。
     *
     * 这里刻意把它做成"落库的表单"而不是一个弹窗文案：
     * 发布者需要在「我的发布」里看到申诉人写的物品细节和联系方式，
     * 才能判断到底是机器判错了，还是又一个人来冒领。
     */
    store.submitAppeal = function (id, input, claimantId) {
      var post = findPost(id);
      if (!post) return { ok: false, message: '这条信息不存在或已被删除' };
      if (!needsVerify(post)) return { ok: false, message: '这条信息不需要验证，可以直接联系发布者' };
      if (!claimantId) return { ok: false, message: '无法确认本机身份，请刷新页面后重试' };
      if (post.ownerId === claimantId) {
        return { ok: false, message: '这是你自己发布的信息，不需要申诉' };
      }
      if (post.status === 'done') return { ok: false, message: '这条信息已经完成，无需再申诉' };
      if (attemptsLeftOf(post) > 0) {
        return {
          ok: false,
          message: '还有 ' + attemptsLeftOf(post) + ' 次作答机会，3 次机会用完之后才能申诉'
        };
      }

      var data = input || {};
      var name = U.clean(data.name);
      var contact = U.clean(data.contact);
      var detail = U.clean(data.detail);
      var errors = {};

      if (!name) errors.name = '请填写你的称呼';
      else if (name.length > LF.APPEAL.nameMax) {
        errors.name = '称呼不能超过 ' + LF.APPEAL.nameMax + ' 个字';
      }

      if (!contact) errors.contact = '请填写联系方式';
      else if (contact.length < LF.APPEAL.contactMin) {
        errors.contact = '联系方式太短了，请写清楚（比如"微信：abc123"）';
      } else if (contact.length > LF.APPEAL.contactMax) {
        errors.contact = '联系方式不能超过 ' + LF.APPEAL.contactMax + ' 个字';
      }

      if (!detail) errors.detail = '请写清楚你能提供的物品细节';
      else if (detail.length < LF.APPEAL.detailMin) {
        errors.detail = '至少写 ' + LF.APPEAL.detailMin + ' 个字，细节写得越具体越容易被认可';
      } else if (detail.length > LF.APPEAL.detailMax) {
        errors.detail = '说明不能超过 ' + LF.APPEAL.detailMax + ' 个字';
      }

      if (Object.keys(errors).length) return { ok: false, errors: errors };

      var list = readPosts();
      var index = -1;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) { index = i; break; }
      }
      if (index === -1) return { ok: false, message: '这条信息不存在或已被删除' };

      var appeals = Array.isArray(list[index].appeals) ? list[index].appeals : [];
      for (var k = 0; k < appeals.length; k++) {
        if (appeals[k].claimantId === claimantId && appeals[k].decision === 'pending') {
          return { ok: false, message: '你已经提交过申诉，正在等待发布者处理' };
        }
      }

      var appeal = {
        id: U.uid('appeal'),
        claimantId: claimantId,
        name: name,
        contact: contact,
        detail: detail,
        at: now(),
        decision: 'pending',
        note: '',
        voucher: '',
        decidedAt: null
      };
      appeals.push(appeal);
      list[index].appeals = appeals;

      var written = writePosts(list);
      if (!written.ok) return { ok: false, message: written.message };
      return { ok: true, appeal: publicAppeal(appeal, true) };
    };

    /** 认领者查看自己那条申诉的处理进度（只能看自己的）。 */
    store.myAppeal = function (id, claimantId) {
      var post = findPost(id);
      if (!post) return { ok: false, message: '这条信息不存在或已被删除' };
      var appeals = Array.isArray(post.appeals) ? post.appeals : [];
      var found = null;
      for (var i = 0; i < appeals.length; i++) {
        if (appeals[i].claimantId === claimantId) found = appeals[i];
      }
      return { ok: true, appeal: found ? publicAppeal(found, true) : null };
    };

    /** 发布者查看收到的人工审核申请（含申诉人写的物品细节）。 */
    store.listAppeals = function (id, actor) {
      var post = findPost(id);
      if (!post) return { ok: false, message: '这条信息不存在或已被删除' };
      if (!actor || post.ownerId !== actor) {
        return { ok: false, message: '只有发布者本人可以查看人工审核申请' };
      }
      var appeals = Array.isArray(post.appeals) ? post.appeals : [];
      return {
        ok: true,
        appeals: appeals.map(function (item) { return publicAppeal(item, true); }),
        pending: appeals.filter(function (item) { return item.decision === 'pending'; }).length
      };
    };

    /**
     * 发布者处理申诉：同意交还 / 驳回，可以附一句说明。
     * 同意之后，该认领者再看这条信息就能直接看到联系方式（不用再答题）。
     */
    store.resolveAppeal = function (id, appealId, decision, note, actor) {
      var post = findPost(id);
      if (!post) return { ok: false, message: '这条信息不存在或已被删除' };
      if (!actor || post.ownerId !== actor) {
        return { ok: false, message: '只有发布者本人可以处理人工审核申请' };
      }

      var wanted = decision === 'approved' ? 'approved' : (decision === 'rejected' ? 'rejected' : '');
      if (!wanted) return { ok: false, message: '请选择处理结果' };

      var list = readPosts();
      var index = -1;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) { index = i; break; }
      }
      if (index === -1) return { ok: false, message: '这条信息不存在或已被删除' };

      var appeals = Array.isArray(list[index].appeals) ? list[index].appeals : [];
      var target = null;
      for (var k = 0; k < appeals.length; k++) {
        if (appeals[k].id === appealId) target = appeals[k];
      }
      if (!target) return { ok: false, message: '这条申诉不存在' };
      if (target.decision !== 'pending') return { ok: false, message: '这条申诉已经处理过了' };

      target.decision = wanted;
      target.note = U.truncate(U.clean(note), 100);
      target.decidedAt = now();
      if (wanted === 'approved') {
        // 给一个线下交接用的编号，认领者在小程序里能看到
        target.voucher = U.voucherCode(id, target.id, now());
      }

      var written = writePosts(list);
      if (!written.ok) return { ok: false, message: written.message };
      return { ok: true, appeal: publicAppeal(target, true) };
    };

    /** 暂存最近一次提交的申诉，申诉页刷新后还能看到结果。 */
    store.saveLastAppeal = function (data) {
      writeJson(LF.KEYS.lastAppeal, data);
      return data;
    };

    store.readLastAppeal = function () {
      var data = readJson(LF.KEYS.lastAppeal, null);
      return (data && typeof data === 'object') ? data : null;
    };

    // ------------------------------------------------------------ 解锁状态（认领人本机）

    store.readUnlocked = function () {
      var list = readJson(LF.KEYS.unlocked, []);
      return Array.isArray(list) ? list : [];
    };

    store.isUnlocked = function (id) {
      return store.readUnlocked().some(function (item) { return item && item.id === id; });
    };

    store.unlockInfo = function (id) {
      var found = store.readUnlocked().filter(function (item) { return item && item.id === id; })[0];
      return found || null;
    };

    store.markUnlocked = function (id, voucher) {
      var list = store.readUnlocked().filter(function (item) { return item && item.id !== id; });
      list.push({ id: id, voucher: voucher || '', at: now() });
      writeJson(LF.KEYS.unlocked, list);
      return list;
    };

    store.forgetUnlocked = function (id) {
      var list = store.readUnlocked().filter(function (item) { return item && item.id !== id; });
      writeJson(LF.KEYS.unlocked, list);
      return list;
    };

    /**
     * 暂存最近一次认领验证的结果。
     * 验证页和结果页是两个独立页面，跳转时会丢掉内存里的变量，
     * 所以把结果落一次盘，结果页读出来渲染即可（只用于展示，不参与判定）。
     */
    store.saveLastClaim = function (data) {
      writeJson(LF.KEYS.lastClaim, data);
      return data;
    };

    store.readLastClaim = function () {
      var data = readJson(LF.KEYS.lastClaim, null);
      return (data && typeof data === 'object') ? data : null;
    };

    // ------------------------------------------------------------ 搜索历史

    store.readHistory = function () {
      var list = readJson(LF.KEYS.history, []);
      return Array.isArray(list) ? list.filter(function (w) { return typeof w === 'string' && w !== ''; }) : [];
    };

    /** 记录一次搜索：去重（已有的挪到最前）并限制最多 HISTORY_MAX 条。 */
    store.pushHistory = function (word) {
      var w = U.clean(word);
      if (!w) return store.readHistory();
      var list = store.readHistory().filter(function (item) { return item !== w; });
      list.unshift(w);
      list = list.slice(0, LF.HISTORY_MAX);
      writeJson(LF.KEYS.history, list);
      return list;
    };

    store.removeHistory = function (word) {
      var list = store.readHistory().filter(function (item) { return item !== word; });
      writeJson(LF.KEYS.history, list);
      return list;
    };

    store.clearHistory = function () {
      writeJson(LF.KEYS.history, []);
      return [];
    };

    /** 热门搜索：优先统计真实数据里出现过的分类名，不够再用预置词补。 */
    store.hotWords = function (limit) {
      var posts = readPosts();
      var counter = {};
      posts.forEach(function (post) {
        var name = LF.categoryOf(post.category).name;
        counter[name] = (counter[name] || 0) + 1;
      });
      var ranked = Object.keys(counter).sort(function (a, b) { return counter[b] - counter[a]; });
      var merged = U.unique(ranked.concat(LF.HOT_WORDS));
      return merged.slice(0, limit || 7);
    };

    // ------------------------------------------------------------ 本机身份

    store.getMe = function () {
      var me = readJson(LF.KEYS.me, null);
      return (me && typeof me === 'object') ? me : { name: '', dept: '', way: '' };
    };

    store.saveMe = function (me) {
      var data = {
        name: U.clean(me && me.name),
        dept: U.clean(me && me.dept),
        way: U.clean(me && me.way)
      };
      writeJson(LF.KEYS.me, data);
      return data;
    };

    /** 本机唯一 id：第一次访问时生成并存下来，用于判断"我的发布"。 */
    store.myId = function () {
      var id = readJson(LF.KEYS.uid, '');
      if (typeof id !== 'string' || !id) {
        id = U.uid('me');
        writeJson(LF.KEYS.uid, id);
      }
      return id;
    };

    // ------------------------------------------------------------ 统计与维护

    store.stats = function () {
      var posts = readPosts();
      var open = posts.filter(function (p) { return p.status === 'open'; }).length;
      return {
        total: posts.length,
        open: open,
        done: posts.length - open,
        lost: posts.filter(function (p) { return p.type === 'lost'; }).length,
        found: posts.filter(function (p) { return p.type === 'found'; }).length
      };
    };

    /** 估算本地占用，用于"存储空间"提示。 */
    store.usage = function () {
      var raw = '';
      try { raw = storage.getItem(LF.KEYS.posts) || ''; } catch (e) { raw = ''; }
      // localStorage 按 UTF-16 计，一个字符 2 字节
      return { chars: raw.length, bytes: raw.length * 2 };
    };

    /** 清空全部数据并重新灌入演示数据，方便演示前复位。 */
    store.resetAll = function (seedPosts) {
      writeJson(LF.KEYS.posts, seedPosts || seed);
      writeJson(LF.KEYS.history, []);
      writeJson(LF.KEYS.unlocked, []);
      return { ok: true };
    };

    /** 导出全部数据（调试与备份用）。 */
    store.exportAll = function () {
      return {
        version: LF.DATA_VERSION,
        posts: readPosts(),
        history: store.readHistory(),
        unlocked: store.readUnlocked()
      };
    };

    return store;
  };

  // ================================================================ 单例

  /**
   * 页面统一用这个函数拿 store：自动选存储、铸造本机身份、首次运行灌演示数据。
   *
   * 注意顺序：先生成 myId 再灌数据，演示数据里那两条"归属于我"的信息
   * 才能挂到本机 uid 上，「我的发布」打开就有内容。
   *
   * @returns {{store, adapter, myId, seeded, persistent}}
   */
  LF.bootstrap = function () {
    var adapter = LF.createBrowserAdapter();
    var store = LF.createStore(adapter);
    var myId = store.myId();
    var seedPosts = LF.buildSeedPosts ? LF.buildSeedPosts(new Date(), myId) : [];
    var seeded = store.init(seedPosts);
    var migrated = store.migrate();      // 旧版本的数据就地升级
    return {
      store: store,
      adapter: adapter,
      myId: myId,
      seeded: seeded.seeded,
      migrated: migrated.migrated,
      persistent: adapter.persistent !== false
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
