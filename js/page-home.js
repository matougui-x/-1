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

  /** 特征筛选下拉最多列出几个取值（text 型特征的取值是数据里现取的，得封顶）。 */
  var FEATURE_FILTER_MAX = 6;

  /**
   * 全局唯一的一份筛选状态。
   * features 是"特征键 → 取值"的映射，只保存非空的项（取消筛选就直接 delete）。
   */
  var state = {
    type: 'all',
    category: 'all',
    area: 'all',
    status: 'all',
    sort: 'latest',
    features: {}
  };

  /**
   * 支持 ?category=card&feature.brand=华为&area=library 这样的直达链接。
   *
   * 除了分享方便，这还解决了一个实打实的问题：首页默认 category 是 all，
   * 特征筛选区根本不会渲染，于是"页面自检 PASS"证明不了这块功能是好的。
   * 有了参数，就能用同一套 dump-dom 命令把特征筛选也测到。
   */
  (function initFromQuery() {
    var category = U.query('category');
    if (category && LF.fields(LF.CATEGORIES).indexOf(category) !== -1) {
      state.category = category;
    }

    LF.featureKeysFor(state.category).forEach(function (key) {
      var value = U.query('feature.' + key);
      if (value) state.features[key] = value;
    });

    var area = U.query('area');
    if (area && LF.fields(LF.AREAS).indexOf(area) !== -1) state.area = area;

    var type = U.query('type');
    if (type && LF.fields(LF.TYPES).indexOf(type) !== -1) state.type = type;

    var status = U.query('status');
    if (status === 'open' || status === 'done') state.status = status;
  })();

  var listEl = ui.qs('#list');
  var typeSeg = ui.qs('#typeSeg');

  // ---------------------------------------------------------------- 筛选控件

  /** 当前是否处于"有筛选条件"的状态，用于决定要不要提示清空。 */
  function hasActiveFilter() {
    return state.type !== 'all' || state.category !== 'all' ||
      state.area !== 'all' || state.status !== 'all' ||
      Object.keys(state.features).length > 0;
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

    // —— 公开特征筛选（只在选了具体分类时出现）——
    renderFeatureFilters(all);

    // —— 搜索引导（紧跟在特征筛选后面，和它同一份分类状态）——
    renderSearchHint();

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
    // 换分类 = 换一整套特征，上一类的筛选条件留着没有意义，还可能筛出空列表
    if (key === 'category') state.features = {};
    renderFilters();
    renderList();
  }

  /** 设置某个特征的筛选值；传空或 'all' 表示取消这一项。 */
  function setFeature(key, value) {
    if (!value || value === 'all') delete state.features[key];
    else state.features[key] = value;
    renderFilters();
    renderList();
  }

  /**
   * 一个特征筛选组里可选的取值。
   *
   * select 型直接用字典里定死的选项；text 型（型号、卡号前缀）取值发散，
   * 字典里没有，就从当前分类的真实数据里取出现过的值，按条数排序、封顶几个，
   * 免得下拉长到没法看。
   */
  function featureFilterOptions(def, scoped) {
    if (def.kind === 'select') return def.options;

    var counter = {};
    scoped.forEach(function (post) {
      var value = post.features ? post.features[def.key] : '';
      if (value) counter[value] = (counter[value] || 0) + 1;
    });

    return Object.keys(counter).sort(function (a, b) {
      return (counter[b] - counter[a]) || (a < b ? -1 : 1);
    }).slice(0, FEATURE_FILTER_MAX);
  }

  /**
   * 渲染公开特征筛选：桌面侧栏一组 side-list，手机端一个下拉。
   *
   * ★ 计数时要**排除本组自己的选择**（见下面的 base）：一旦勾了"品牌=华为"，
   *   要是还按含本组条件的结果去数，其它品牌的条数会全变成 0，这一组就只剩
   *   一个选项、再也切不回去了。其它组的条件照常参与计数。
   */
  function renderFeatureFilters(all) {
    var side = ui.qs('#sideFeatures');
    var mobile = ui.qs('#mobileFeatureFilters');
    side.innerHTML = '';
    mobile.innerHTML = '';
    mobile.hidden = true;

    var defs = LF.featuresFor(state.category);
    if (state.category === 'all' || !defs.length) return;

    var scoped = all.filter(function (post) { return post.category === state.category; });
    var keys = LF.featureKeysFor(state.category);
    var added = 0;

    defs.forEach(function (def) {
      // 通配型特征（打码的卡号）不做筛选控件：它的取值是 `350504************`
      // 这种模式串，摆成一排筛选按钮既看不懂也没法精确匹配。
      // 这一类靠上面的关键词搜索——* 会自动匹配任意数字。
      if (def.wildcard) return;

      var options = featureFilterOptions(def, scoped);
      if (!options.length) return;

      var base = scoped.filter(function (post) {
        return keys.every(function (other) {
          if (other === def.key) return true;
          var wanted = state.features[other];
          if (!wanted) return true;
          return (post.features ? post.features[other] : '') === wanted;
        });
      });

      var current = state.features[def.key] || 'all';
      function countOf(value) {
        return base.filter(function (post) {
          var actual = post.features ? post.features[def.key] : '';
          return value === 'all' || actual === value;
        }).length;
      }

      // —— 桌面端 ——
      var group = ui.el('<div class="side-group"><h3></h3><div class="side-list"></div></div>');
      group.querySelector('h3').textContent = def.name;
      var list = group.querySelector('.side-list');
      list.appendChild(optionButton('全部' + def.name, countOf('all'), current === 'all',
        function () { setFeature(def.key, 'all'); }));
      options.forEach(function (value) {
        list.appendChild(optionButton(value, countOf(value), current === value,
          function () { setFeature(def.key, value); }));
      });
      side.appendChild(group);

      // —— 手机端 ——
      var select = ui.el('<select class="filter-select"></select>');
      select.setAttribute('aria-label', '按' + def.name + '筛选');
      fillSelect(select, [{ key: 'all', name: '全部' + def.name }].concat(options.map(function (value) {
        return { key: value, name: value };
      })), current, function (value) { setFeature(def.key, value); });
      mobile.appendChild(select);

      added++;
    });

    mobile.hidden = added === 0;
  }

  /**
   * 搜索引导：选中分类时，把"这一类只公开哪几个特征、该按什么搜"讲给失主听。
   *
   * ★ 这不是可有可无的装饰，是"一刀切"必须补上的一环。
   *   特征被锁成固定一两个之后，信息里能命中的只剩标题、地点和这几个特征；
   *   失主不知道，还是会搜「蓝色充电伞」这种只有描述里才有的词，搜出来 0 条——
   *   而"0 条结果"和"没人捡到"长得一模一样，他会直接以为东西没被捡到。
   *
   * 文案由 LF.searchHintFor 按分类给（写在 config.js 的 LF.CATEGORIES 里）：
   * 非「其他」讲的是"请按这几个特征搜"，「其他」讲的是"没有特征可筛，翻列表找"。
   * 两类都有话说，所以这里不做分类判断，拿到的文案为空才隐藏（只有未知分类会为空）。
   * 桌面端和手机端各有一处元素，同一份文案填两次。
   */
  function renderSearchHint() {
    var text = LF.searchHintFor(state.category);
    [ui.qs('#sideSearchHint'), ui.qs('#mobileSearchHint')].forEach(function (el) {
      el.textContent = text;
      el.hidden = !text;
    });
  }

  // ---------------------------------------------------------------- 列表

  /** 列表标题会跟着筛选条件变，让人一眼看出"现在看的是什么"。 */
  function currentTitle() {
    var parts = [];
    if (state.category !== 'all') parts.push(LF.categoryOf(state.category).name);
    LF.featureKeysFor(state.category).forEach(function (key) {
      if (state.features[key]) parts.push(state.features[key]);
    });
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
      features: state.features,
      viewerId: myId
    });

    ui.qs('#listTitle').textContent = currentTitle();
    ui.qs('#listCount').textContent = '共 ' + posts.length + ' 条';

    ui.renderCards(listEl, posts, {
      grid: true,
      empty: hasActiveFilter() ? {
        icon: '🔍',
        title: '没有符合条件的信息',
        desc: '换个分类、地点或特征试试，也可以清空筛选条件看看全部信息。'
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
    state.features = {};
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
