/*!
 * 搜索页控制器
 *
 * 交互上的两个取舍：
 *   1. 边打字边出结果（输入防抖 200ms），不要求用户按回车——搜索框里放个必须点的按钮，
 *      在手机上很容易漏掉；
 *   2. 但"记入搜索历史"只在用户明确表达意图时发生（按回车、点历史词、点热词、
 *      或者点开了某条结果），否则边打字边记会把一堆半截词写进历史。
 */
(function (root) {
  'use strict';

  var LF = root.LF;
  var U = LF.utils;
  var ui = LF.ui;
  var esc = U.escapeHtml;

  var app = ui.startPage({ nav: 'search' });
  var store = app.store;
  var myId = app.myId;

  var input = ui.qs('#searchInput');
  var listEl = ui.qs('#list');
  var idlePanel = ui.qs('#idlePanel');
  var resultPanel = ui.qs('#resultPanel');

  var state = {
    keyword: U.query('q'),
    type: 'all',
    sort: 'latest'
  };

  var committed = false;   // 本次搜索是否已经记入历史

  // ---------------------------------------------------------------- 历史与热词

  function renderWordBlocks() {
    var history = store.readHistory();
    var historyBlock = ui.qs('#historyBlock');
    historyBlock.hidden = history.length === 0;

    var cloud = ui.qs('#historyCloud');
    cloud.innerHTML = '';
    history.forEach(function (word) {
      var chip = ui.el('<button type="button">' + esc(word) + '</button>');
      // 第三个参数 true：这是程序设置的关键词，要回写到输入框
      chip.addEventListener('click', function () { runSearch(word, true, true); });
      cloud.appendChild(chip);
    });

    var hotCloud = ui.qs('#hotCloud');
    hotCloud.innerHTML = '';
    store.hotWords(7).forEach(function (word, index) {
      var chip = ui.el('<button type="button"' + (index === 0 ? ' class="is-hot"' : '') + '>' +
        (index === 0 ? '🔥 ' : '') + esc(word) + '</button>');
      chip.addEventListener('click', function () { runSearch(word, true, true); });
      hotCloud.appendChild(chip);
    });
  }

  // ---------------------------------------------------------------- 搜索

  /**
   * 执行一次搜索。
   *
   * @param {string}  keyword   关键词；不传则取输入框当前内容
   * @param {boolean} commit    是否记入搜索历史
   * @param {boolean} syncInput 是否把关键词回写进输入框
   *
   * ★ syncInput 只在「程序主动设置关键词」时传 true（点历史词、点热词、从网址带入）。
   *   用户手动输入时绝不能回写，原因有两个：
   *   1. 用中文输入法打字时会先经历一段拼字过程，这时给 input.value 赋值
   *      会让浏览器认为内容被外部改写，直接打断输入法的候选状态——中文就打不进去了；
   *   2. U.clean() 会去掉首尾空白，用户想打「耳机 图书馆」时，
   *      刚敲下的那个空格会被立刻吃掉，多关键词根本没法输入。
   */
  /**
   * 搜索框右侧的字数提示。
   *
   * 平时只报"几个字"；一旦看起来像证件号码，就改报"几位"，并按能不能对上
   * 库里的位数标绿/标红。证件号码是按位数精确匹配的，边打边能看见
   * "现在几位、对不对得上"，比搜完看到 0 条结果再回头数要省事得多。
   */
  function renderInputCount() {
    var el = ui.qs('#inputCount');
    var value = U.clean(input.value);

    el.classList.remove('is-ok', 'is-warn');

    if (!value) {
      el.hidden = true;
      el.textContent = '';
      return;
    }

    el.hidden = false;

    if (!/^[0-9*]{6,24}$/.test(value)) {
      el.textContent = value.length + ' 字';
      return;
    }

    el.textContent = value.length + ' 位';

    var lengths = cardNumberLengths();
    if (lengths.length) {
      el.classList.add(lengths.indexOf(value.length) === -1 ? 'is-warn' : 'is-ok');
    }
  }

  /** 输入框右侧的两个小部件（清空按钮、字数提示）跟着输入内容一起变。 */
  function syncInputChrome() {
    ui.qs('#clearInput').hidden = !input.value;
    renderInputCount();
  }

  function runSearch(keyword, commit, syncInput) {
    state.keyword = U.clean(keyword == null ? input.value : keyword);

    if (syncInput) {
      input.value = state.keyword;
    }
    syncInputChrome();

    if (commit && state.keyword) {
      store.pushHistory(state.keyword);
      committed = true;
      renderWordBlocks();
    }

    if (!state.keyword) {
      idlePanel.hidden = false;
      resultPanel.hidden = true;
      ui.markReady({ page: 'search', mode: 'idle' });
      return;
    }

    idlePanel.hidden = true;
    resultPanel.hidden = false;
    renderResults();
  }

  /** 库里所有打码证件号码的位数（去重升序）。 */
  function cardNumberLengths() {
    var lengths = [];

    store.list().forEach(function (post) {
      LF.featuresFor(post.category).forEach(function (def) {
        if (!def.wildcard) return;
        var value = post.features ? post.features[def.key] : '';
        if (value && lengths.indexOf(value.length) === -1) lengths.push(value.length);
      });
    });

    return lengths.sort(function (a, b) { return a - b; });
  }

  /**
   * 搜索词里出现证件号码时，给一条关于位数的提示；不涉及证件号码就返回 null。
   *
   * 为什么要专门做这个：打码卡号是按**位数**精确匹配的，少一位、多一位
   * 都是 0 条结果——而"0 条结果"和"没人捡到"在页面上长得一模一样。
   * 失主很可能就此以为东西没被人捡到，实际只是自己少打了一位。
   * 所以这里不只提醒，还直接把两边的位数摆出来。
   */
  function cardNumberHint() {
    var term = null;

    // 关键词可能是「身份证 350504…」这种多词组合，逐个找像证件号码的那个
    state.keyword.split(' ').forEach(function (part) {
      if (!term && /^[0-9*]{6,24}$/.test(part)) term = part;
    });
    if (!term) return null;

    var lengths = cardNumberLengths();

    if (lengths.length && lengths.indexOf(term.length) === -1) {
      return {
        warn: true,
        text: '⚠️ 你填的是 ' + term.length + ' 位，库里的证件号码是 ' + lengths.join(' / ') +
          ' 位。证件号码要按位数精确匹配，少一位多一位都搜不到。'
      };
    }

    return {
      warn: false,
      text: '证件号码按位数精确匹配：位数要和卡号一样长，不记得的位置写 *，记得的数字也要对得上。'
    };
  }

  /** 每个特征最多摆几个可选值（颜色有 11 个，全摆出来太占地方）。 */
  var FEATURE_CHIP_MAX = 6;

  /**
   * 搜索词里出现的分类。打「雨伞」「黑色雨伞」都算命中「雨伞」。
   *
   * 只做名称包含匹配，不做同义词——搜「校园卡」不会提示「证件卡片」的特征，
   * 因为那需要一张"校园卡 = 证件卡片"的对照表。那张表没法自动验证对错，
   * 与其编一份不如先不做（README 的已知限制里记了这一条）。
   */
  function categoryFromKeyword() {
    var found = null;

    state.keyword.split(' ').forEach(function (term) {
      if (found || term.length < 2) return;
      LF.CATEGORIES.forEach(function (category) {
        if (found) return;
        // 词里含分类名（黑色雨伞），或分类名里含这个词（雨伞）
        if (term.indexOf(category.name) !== -1 || category.name.indexOf(term) !== -1) {
          found = category;
        }
      });
    });

    return found;
  }

  /**
   * 输入的是某个分类时，提示"这个分类还能按哪些公开特征找"。
   *
   * 只丢一句"可以按特征筛"没用——失主得知道有哪些特征、能填什么值才行。
   * 所以这里把特征名和取值都摆出来，取值做成可点的 chip：点一下就把它
   * 加进搜索词（搜索本来就支持空格分隔的多词「与」匹配），再点一下取消。
   * 等于把"筛选器"直接做进了搜索框。
   */
  function renderFeatureHint() {
    var box = ui.qs('#featureHint');
    var category = categoryFromKeyword();

    box.innerHTML = '';
    box.hidden = true;

    if (!category) return;

    var defs = LF.featuresFor(category.key);
    if (!defs.length || category.key === 'other') return;

    var selected = state.keyword.split(' ');
    var groups = '';

    defs.forEach(function (def) {
      // 打码卡号那种没有固定取值的（型号、卡号），摆不出 chip，跳过
      if (def.kind !== 'select') return;

      var shown = def.options.slice(0, FEATURE_CHIP_MAX);
      var rest = def.options.length - shown.length;

      groups += '<div class="feature-hint-group">' +
        '<span class="feature-hint-name">' + esc(def.name) + '</span>' +
        shown.map(function (value) {
          return '<button type="button" class="filter-chip' +
            (selected.indexOf(value) !== -1 ? ' is-on' : '') + '" data-value="' + esc(value) + '">' +
            esc(value) + '</button>';
        }).join('') +
        (rest > 0 ? '<span class="feature-hint-more">等 ' + def.options.length + ' 项</span>' : '') +
        '</div>';
    });

    if (!groups) return;

    box.innerHTML = '<p class="feature-hint-title">🔎 ' + esc(category.icon + ' ' + category.name) +
      ' 还能按这些公开特征找——点一下加进搜索：</p>' + groups;
    box.hidden = false;
  }

  /** 点 chip：把这个特征值加进搜索词，已经在词里就取消掉。 */
  function toggleFeatureValue(value) {
    var terms = state.keyword.split(' ').filter(function (term) { return term !== ''; });
    var at = terms.indexOf(value);

    if (at === -1) terms.push(value);
    else terms.splice(at, 1);

    input.value = terms.join(' ');
    runSearch(input.value, false, true);
  }

  function renderResults() {
    var posts = store.list({
      keyword: state.keyword,
      type: state.type,
      sort: state.sort,
      viewerId: myId
    });

    var cardHint = cardNumberHint();
    var hintEl = ui.qs('#keywordHint');
    hintEl.textContent = cardHint ? cardHint.text : '多个关键词用空格分开，表示同时满足';
    hintEl.classList.toggle('is-warn', !!(cardHint && cardHint.warn));
    hintEl.classList.toggle('is-wide', !!cardHint);

    renderFeatureHint();

    ui.qs('#resultTitle').textContent = '“' + state.keyword + '” 的搜索结果';
    ui.qs('#resultCount').textContent = '共 ' + posts.length + ' 条';

    ui.renderCards(listEl, posts, {
      grid: true,
      empty: {
        icon: '🔍',
        title: '没有找到「' + state.keyword + '」相关的信息',
        // 位数对不上是"搜不到"里最容易被误读成"没人捡到"的一种，优先说这个
        desc: (cardHint && cardHint.warn)
          ? cardHint.text + '把不记得的位置用 * 补上，凑够位数再试一次。'
          : '换个说法试试，比如只搜「校园卡」而不是「我的校园卡」；也可以回首页按分类和地点筛选。',
        actions: [
          { text: '回首页按分类找', href: 'index.html', primary: true },
          { text: '发布一条寻物信息', href: 'publish.html' }
        ]
      }
    });

    // 搜到了东西并点进去看，说明这次搜索是有意义的，值得记进历史
    if (!committed && posts.length) {
      ui.qsa('.card[data-id]', listEl).forEach(function (card) {
        card.addEventListener('click', function () {
          if (!committed) {
            store.pushHistory(state.keyword);
            committed = true;
          }
        });
      });
    }

    ui.markReady({ page: 'search', mode: 'result', results: posts.length });
  }

  // ---------------------------------------------------------------- 事件

  var debounced = U.debounce(function () {
    runSearch(input.value, false);
  }, 200);

  /* ------------------------------------------------------------------
   * 中文输入法（IME）处理
   *
   * 用拼音输入法打字时，会先经过一段「拼字」过程：拼音显示在输入法的候选框里，
   * 还没选词上屏。这期间浏览器会持续触发 input 事件，此时输入框里的内容是拼音
   * 而不是最终文字。这段时间里有两件事不能做：
   *   - 不能发起搜索：拿拼音去搜没有任何意义；
   *   - 不能回写 input.value：那会打断输入法的候选状态。
   * 所以用一个标记把拼字区间圈出来，等选词上屏（compositionend）之后再搜。
   * ------------------------------------------------------------------ */
  var composing = false;

  input.addEventListener('compositionstart', function () {
    composing = true;
  });

  input.addEventListener('compositionend', function () {
    composing = false;
    syncInputChrome();
    debounced();          // 选词上屏之后再发起搜索
  });

  input.addEventListener('input', function (event) {
    // 字数提示要**立刻**跟上，不能等搜索那边的 200ms 防抖——
    // 用户边打边数位数，慢半拍就没用了
    syncInputChrome();
    // 拼字过程中不触发搜索。isComposing 是浏览器给的标准标志，
    // 和自己维护的 composing 标记一起判断，兼容不同浏览器的触发时序。
    if (composing || event.isComposing) return;
    debounced();
  });

  input.addEventListener('keydown', function (event) {
    // 输入法选词时按回车是「确认候选词」，不是「提交搜索」，要放过去
    if (event.isComposing || event.keyCode === 229) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      runSearch(input.value, true);
      input.blur();
    }
    if (event.key === 'Escape') {
      input.value = '';
      runSearch('', false);
    }
  });

  // 特征 chip 用事件委托：这些按钮每次搜索都会重建，逐个绑太容易漏
  ui.qs('#featureHint').addEventListener('click', function (event) {
    var chip = event.target.closest('[data-value]');
    if (chip) toggleFeatureValue(chip.getAttribute('data-value'));
  });

  ui.qs('#clearInput').addEventListener('click', function () {
    input.value = '';
    committed = false;
    runSearch('', false);
    input.focus();
  });

  ui.qs('#clearHistory').addEventListener('click', function () {
    store.clearHistory();
    renderWordBlocks();
    ui.toast('搜索历史已清空');
  });

  ui.qs('#resultPanel').addEventListener('click', function (event) {
    var chip = event.target.closest('.filter-chip[data-type]');
    if (!chip) return;
    state.type = chip.getAttribute('data-type');
    ui.qsa('.filter-chip[data-type]').forEach(function (node) {
      node.classList.toggle('is-on', node === chip);
    });
    renderResults();
  });

  ui.qs('#sortSelect').innerHTML = LF.SORTS.map(function (sort) {
    return '<option value="' + esc(sort.key) + '">' + esc(sort.name) + '</option>';
  }).join('');
  ui.qs('#sortSelect').addEventListener('change', function () {
    state.sort = this.value;
    renderResults();
  });

  // ---------------------------------------------------------------- 启动

  renderWordBlocks();
  // 网址里带了 ?q= 时，把关键词回填到输入框（这属于程序设置，可以同步）
  runSearch(state.keyword, false, true);
  if (state.keyword) input.focus();
})(typeof globalThis !== 'undefined' ? globalThis : this);
