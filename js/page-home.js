/*!
 * 首页控制器
 *
 * 职责：维护一组筛选条件（类型 / 分类 / 地点 / 状态 / 排序），
 * 把这组条件同时反映到桌面侧栏和手机筛选条上，并渲染结果列表。
 *
 * 关键做法：筛选条件只保存在 state 一个地方，
 * 每次变化都调用 renderFilters() 把所有控件按 state 重建一遍。
 * 这样两套控件（桌面侧栏、手机下拉）不可能出现"显示不一致"。
 */
(function (root) {
  'use strict';

  var LF = root.LF;
  var U = LF.utils;
  var ui = LF.ui;

  var app = ui.startPage({ nav: 'home' });
  var store = app.store;
  var myId = app.myId;

  /** 全局唯一的一份筛选状态。 */
  var state = {
    type: 'all',
    category: 'all',
    area: 'all',
    status: 'all',
    sort: 'latest'
  };

  var listEl = ui.qs('#list');
  var typeSeg = ui.qs('#typeSeg');

  // ---------------------------------------------------------------- 筛选控件

  /** 当前是否处于"有筛选条件"的状态，用于决定要不要提示清空。 */
  function hasActiveFilter() {
    return state.type !== 'all' || state.category !== 'all' ||
      state.area !== 'all' || state.status !== 'all';
  }

  /** 统计每个选项下有多少条，显示在选项右侧。 */
  function countBy(field, value) {
    return store.list({ status: 'all' }).filter(function (post) {
      return value === 'all' || post[field] === value;
    }).length;
  }

  /** 生成一个"选项 + 条数"的按钮。 */
  function optionButton(label, count, isOn, onClick, extraClass) {
    var cls = (extraClass || '') + (isOn ? ' is-on' : '');
    var btn = ui.el('<button type="button" class="' + cls.trim() + '">' +
      '<span>' + LF.utils.escapeHtml(label) + '</span>' +
      (count === null ? '' : '<span class="n">' + count + '</span>') +
      '</button>');
    btn.addEventListener('click', onClick);
    return btn;
  }

  /** 按当前 state 重建全部筛选控件。 */
  function renderFilters() {
    var all = store.list();
    var categories = LF.CATEGORIES;
    var areas = LF.AREAS;

    // —— 手机端：分类图标条 ——
    var strip = ui.qs('#catStrip');
    strip.innerHTML = '';
    var allItem = ui.el('<button type="button" class="cat-item' +
      (state.category === 'all' ? ' is-on' : '') + '"><span class="ico">🗂️</span><span>全部</span></button>');
    allItem.addEventListener('click', function () { setFilter('category', 'all'); });
    strip.appendChild(allItem);

    categories.forEach(function (category) {
      var count = all.filter(function (post) { return post.category === category.key; }).length;
      var item = ui.el('<button type="button" class="cat-item' +
        (state.category === category.key ? ' is-on' : '') + '">' +
        '<span class="ico">' + category.icon + '</span>' +
        '<span>' + LF.utils.escapeHtml(category.name) + '</span>' +
        '</button>');
      item.setAttribute('aria-label', category.name + '，' + count + ' 条');
      item.addEventListener('click', function () {
        setFilter('category', state.category === category.key ? 'all' : category.key);
      });
      strip.appendChild(item);
    });

    // —— 手机端：地点 / 状态下拉 ——
    fillSelect(ui.qs('#fAreaMobile'), [{ key: 'all', name: '全部地点' }].concat(areas.map(function (area) {
      return { key: area.key, name: area.icon + ' ' + area.name };
    })), state.area, function (value) { setFilter('area', value); });

    fillSelect(ui.qs('#fStatusMobile'), [
      { key: 'all', name: '全部状态' },
      { key: 'open', name: '进行中' },
      { key: 'done', name: '已完成' }
    ], state.status, function (value) { setFilter('status', value); });

    // —— 排序（两端共用）——
    fillSelect(ui.qs('#sortSelect'), LF.SORTS, state.sort, function (value) {
      setFilter('sort', value);
    });

    // —— 桌面端：侧栏三组列表 ——
    var sideCategory = ui.qs('#sideCategory');
    sideCategory.innerHTML = '';
    sideCategory.appendChild(optionButton('全部分类', countBy('category', 'all'),
      state.category === 'all', function () { setFilter('category', 'all'); }));
    categories.forEach(function (category) {
      sideCategory.appendChild(optionButton(
        category.icon + ' ' + category.name,
        countBy('category', category.key),
        state.category === category.key,
        function () { setFilter('category', category.key); }
      ));
    });

    var sideArea = ui.qs('#sideArea');
    sideArea.innerHTML = '';
    sideArea.appendChild(optionButton('全部地点', countBy('area', 'all'),
      state.area === 'all', function () { setFilter('area', 'all'); }));
    areas.forEach(function (area) {
      sideArea.appendChild(optionButton(
        area.icon + ' ' + area.name,
        countBy('area', area.key),
        state.area === area.key,
        function () { setFilter('area', area.key); }
      ));
    });

    var sideStatus = ui.qs('#sideStatus');
    sideStatus.innerHTML = '';
    [['all', '全部'], ['open', '进行中'], ['done', '已完成']].forEach(function (pair) {
      sideStatus.appendChild(optionButton(pair[1], countBy('status', pair[0]),
        state.status === pair[0], function () { setFilter('status', pair[0]); }));
    });

    // —— 侧栏统计 ——
    var stats = store.stats();
    ui.qs('#sideStats').innerHTML =
      '<span>共 <b>' + stats.total + '</b> 条</span>' +
      '<span>进行中 <b>' + stats.open + '</b></span>' +
      '<span>已完成 <b>' + stats.done + '</b></span>';
  }

  /** 填充一个 <select>。 */
  function fillSelect(select, options, current, onChange) {
    if (!select) return;
    select.innerHTML = options.map(function (option) {
      return '<option value="' + LF.utils.escapeHtml(option.key) + '"' +
        (option.key === current ? ' selected' : '') + '>' +
        LF.utils.escapeHtml(option.name) + '</option>';
    }).join('');
    select.onchange = function () { onChange(select.value); };
  }

  function setFilter(key, value) {
    state[key] = value;
    renderFilters();
    renderList();
  }

  // ---------------------------------------------------------------- 列表

  /** 列表标题会跟着筛选条件变，让人一眼看出"现在看的是什么"。 */
  function currentTitle() {
    var parts = [];
    if (state.category !== 'all') parts.push(LF.categoryOf(state.category).name);
    if (state.area !== 'all') parts.push(LF.areaOf(state.area).name);
    if (state.type !== 'all') parts.push(LF.typeOf(state.type).name);
    parts.push('信息');
    return parts.join(' · ');
  }

  function renderList() {
    var posts = store.list({
      type: state.type,
      category: state.category,
      area: state.area,
      status: state.status,
      sort: state.sort,
      viewerId: myId
    });

    ui.qs('#listTitle').textContent = currentTitle();
    ui.qs('#listCount').textContent = '共 ' + posts.length + ' 条';

    ui.renderCards(listEl, posts, {
      grid: true,
      empty: hasActiveFilter() ? {
        icon: '🔍',
        title: '没有符合条件的信息',
        desc: '换个分类或地点试试，也可以清空筛选条件看看全部信息。'
      } : {
        icon: '📭',
        title: '还没有任何失物招领信息',
        desc: '成为第一个发布的人，让丢了东西的同学能找到线索。',
        actions: [{ text: '去发布信息', href: 'publish.html', primary: true }]
      }
    });

    // 空状态里给一个一键清空的出口（renderEmpty 生成的是链接，这里要挂事件，所以单独加）
    if (posts.length === 0 && hasActiveFilter()) {
      var empty = listEl.querySelector('.empty');
      var actions = empty.querySelector('.empty-actions') || ui.el('<div class="empty-actions"></div>');
      var reset = ui.el('<button type="button" class="btn btn-primary">清空筛选条件</button>');
      reset.addEventListener('click', resetFilters);
      actions.appendChild(reset);
      if (!actions.parentNode) empty.appendChild(actions);
    }

    ui.qs('#resetWrap').hidden = !(posts.length > 0 && hasActiveFilter());

    ui.markReady({ page: 'home', cards: posts.length });
  }

  function resetFilters() {
    state.type = 'all';
    state.category = 'all';
    state.area = 'all';
    state.status = 'all';
    syncTypeButtons();
    renderFilters();
    renderList();
  }

  // ---------------------------------------------------------------- 事件绑定

  function syncTypeButtons() {
    ui.qsa('button', typeSeg).forEach(function (btn) {
      btn.classList.toggle('is-on', btn.getAttribute('data-type') === state.type);
    });
  }

  typeSeg.addEventListener('click', function (event) {
    var btn = event.target.closest('button[data-type]');
    if (!btn) return;
    state.type = btn.getAttribute('data-type');
    syncTypeButtons();
    renderList();
  });

  ui.qs('#resetFilters').addEventListener('click', resetFilters);

  // ---------------------------------------------------------------- 启动

  renderFilters();
  renderList();
})(typeof globalThis !== 'undefined' ? globalThis : this);
