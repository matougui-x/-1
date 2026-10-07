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
  function runSearch(keyword, commit, syncInput) {
    state.keyword = U.clean(keyword == null ? input.value : keyword);

    if (syncInput) {
      input.value = state.keyword;
    }
    ui.qs('#clearInput').hidden = !input.value;

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

  function renderResults() {
    var posts = store.list({
      keyword: state.keyword,
      type: state.type,
      sort: state.sort,
      viewerId: myId
    });

    ui.qs('#resultTitle').textContent = '“' + state.keyword + '” 的搜索结果';
    ui.qs('#resultCount').textContent = '共 ' + posts.length + ' 条';
    ui.qs('#keywordHint').textContent = '多个关键词用空格分开，表示同时满足';

    ui.renderCards(listEl, posts, {
      grid: true,
      empty: {
        icon: '🔍',
        title: '没有找到「' + state.keyword + '」相关的信息',
        desc: '换个说法试试，比如只搜「校园卡」而不是「我的校园卡」；也可以回首页按分类和地点筛选。',
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
    ui.qs('#clearInput').hidden = !input.value;
    debounced();          // 选词上屏之后再发起搜索
  });

  input.addEventListener('input', function (event) {
    ui.qs('#clearInput').hidden = !input.value;
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
