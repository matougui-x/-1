/*!
 * 发布 / 编辑页控制器
 *
 * 寻物和招领共用这一套表单，靠顶部的分段控件切换：
 *   - 切换类型只改文案（"拾取地点" ⇄ "丢失地点"）和是否显示隐藏特征区块；
 *   - 切换分类会重建隐藏特征的预设问题（证件卡片问卡号，雨伞问伞面颜色）。
 *
 * 编辑模式复用同一个页面：带 ?id=xxx 进来时先读原记录回填，
 * 提交时走 store.update 而不是 store.create（数据的 id/发布时间/浏览量在数据层保证不变）。
 */
(function (root) {
  'use strict';

  var LF = root.LF;
  var U = LF.utils;
  var ui = LF.ui;
  var esc = U.escapeHtml;

  var app = ui.startPage({ nav: '', tabbar: false, welcome: false });
  var store = app.store;
  var myId = app.myId;

  var form = ui.qs('#postForm');
  var editId = U.query('id');
  var editing = null;

  /** 表单当前状态。照片单独存，因为它在 DOM 里是 dataURL 数组。 */
  var state = {
    type: 'found',
    photos: []
  };

  // ---------------------------------------------------------------- 下拉选项初始化

  function initSelects() {
    ui.qs('#fCategory').innerHTML = LF.CATEGORIES.map(function (category) {
      return '<option value="' + esc(category.key) + '">' + category.icon + ' ' + esc(category.name) + '</option>';
    }).join('');

    ui.qs('#fArea').innerHTML = LF.AREAS.map(function (area) {
      return '<option value="' + esc(area.key) + '">' + area.icon + ' ' + esc(area.name) + '</option>';
    }).join('');
  }

  /** 具体地点的候选词跟着区域变，减少手打错别字。 */
  function refreshSpotList() {
    var area = LF.areaOf(ui.qs('#fArea').value);
    ui.qs('#spotList').innerHTML = area.spots.map(function (spot) {
      return '<option value="' + esc(spot) + '"></option>';
    }).join('');
  }

  // ---------------------------------------------------------------- 隐藏特征

  /**
   * 按当前分类重建隐藏特征的问题列表。
   * 尽量保留已经填过的答案：切换分类时问题名可能变，能对上的就留着，
   * 免得用户刚填完一半、改了个分类又得重填。
   */
  function renderHiddenQuestions(preserve) {
    var categoryKey = ui.qs('#fCategory').value;
    var presets = LF.presetsFor(categoryKey);
    var previous = preserve || {};

    ui.qs('#hiddenQuestions').innerHTML = presets.map(function (preset, index) {
      var value = previous[preset.q] || '';
      return '<div class="field" style="margin-bottom:12px" data-q="' + esc(preset.q) + '">' +
        '<label class="field-label" style="font-weight:500">' +
          '问题 ' + (index + 1) + ' · ' + esc(preset.q) + '</label>' +
        '<input class="input" data-answer maxlength="20" ' +
          'placeholder="' + esc(preset.ask) + '" value="' + esc(value) + '">' +
        '</div>';
    }).join('');

    updateHiddenHint();
  }

  /** 实时提示"已填了几项"，比事后报错友好。 */
  function updateHiddenHint() {
    var filled = collectHidden().filter(function (item) { return item.a !== ''; }).length;
    var hint = ui.qs('#hiddenSection .field[data-field="hidden"] .field-error');
    var tips = ui.qs('#hiddenHint');
    if (!tips) {
      tips = ui.el('<div class="field-hint" id="hiddenHint"></div>');
      ui.qs('#hiddenQuestions').parentNode.appendChild(tips);
    }
    var enough = filled >= LF.VERIFY.minHidden;
    tips.textContent = '已填写 ' + filled + ' 项，至少需要 ' + LF.VERIFY.minHidden +
      ' 项（最多 ' + LF.VERIFY.maxHidden + ' 项）。' +
      (enough ? '可以发布了。' : '再填 ' + (LF.VERIFY.minHidden - filled) + ' 项。');
    tips.style.color = enough ? 'var(--green-d)' : 'var(--ink-3)';
    return hint;
  }

  function collectHidden() {
    return ui.qsa('#hiddenQuestions [data-q]').map(function (row) {
      return {
        q: row.getAttribute('data-q'),
        a: U.clean(row.querySelector('[data-answer]').value)
      };
    });
  }

  // ---------------------------------------------------------------- 类型切换

  function isFound() {
    return state.type === 'found';
  }

  function applyType() {
    ui.qsa('#typeSeg button').forEach(function (btn) {
      btn.classList.toggle('is-on', btn.getAttribute('data-type') === state.type);
    });

    var found = isFound();
    ui.qs('#locationLabel').textContent = found ? '拾取地点' : '丢失地点';
    ui.qs('#timeLabel').textContent = found ? '拾取时间' : '丢失时间';
    ui.qs('#fLocation').placeholder = found
      ? '例如：教学楼 A 栋 301 教室'
      : '例如：图书馆三楼自习区';
    ui.qs('#fDesc').placeholder = found
      ? '补充一些细节，比如物品当时的状态、你捡到后放在哪里了。注意不要写出隐藏特征的答案。'
      : '补充一些细节，比如物品的颜色、贴纸、磨损等特征，方便捡到的同学认出它。';

    ui.qs('#hiddenSection').hidden = !found;
    if (found && !ui.qs('#hiddenQuestions').children.length) renderHiddenQuestions();
    if (found) updateHiddenHint();
  }

  // ---------------------------------------------------------------- 照片

  function renderPhotos() {
    var grid = ui.qs('#photoGrid');
    grid.innerHTML = '';

    state.photos.forEach(function (src, index) {
      var slot = ui.el('<div class="photo-slot">' +
        '<img src="' + esc(src) + '" alt="照片 ' + (index + 1) + '">' +
        '<button type="button" class="remove" aria-label="删除这张照片">×</button>' +
        '</div>');
      slot.querySelector('.remove').addEventListener('click', function () {
        state.photos.splice(index, 1);
        renderPhotos();
      });
      grid.appendChild(slot);
    });

    if (state.photos.length < U.IMAGE_RULES.maxCount) {
      var add = ui.el('<button type="button" class="photo-add">' +
        '<span class="plus">＋</span><span>添加照片</span></button>');
      add.addEventListener('click', function () { ui.qs('#photoInput').click(); });
      grid.appendChild(add);
    }
  }

  ui.qs('#photoInput').addEventListener('change', function (event) {
    var files = Array.prototype.slice.call(event.target.files || []);
    event.target.value = '';       // 允许重复选同一个文件
    if (!files.length) return;

    var room = U.IMAGE_RULES.maxCount - state.photos.length;
    if (files.length > room) {
      ui.toast('最多上传 ' + U.IMAGE_RULES.maxCount + ' 张照片，只取前 ' + room + ' 张', 'warn');
      files = files.slice(0, room);
    }

    ui.toast('正在压缩照片…');
    var jobs = files.map(function (file) {
      var check = U.validateImage(file, state.photos.length);
      if (!check.ok) {
        ui.toast(check.message, 'error');
        return Promise.resolve(null);
      }
      return U.compressImage(file)['catch'](function (error) {
        ui.toast(error.message || '照片处理失败', 'error');
        return null;
      });
    });

    Promise.all(jobs).then(function (results) {
      results.forEach(function (dataUrl) {
        if (dataUrl && state.photos.length < U.IMAGE_RULES.maxCount) {
          state.photos.push(dataUrl);
        }
      });
      renderPhotos();
      if (results.some(Boolean)) ui.toast('照片已添加', 'ok');
    });
  });

  // ---------------------------------------------------------------- 表单读写

  function readForm() {
    return {
      type: state.type,
      title: ui.qs('#fTitle').value,
      category: ui.qs('#fCategory').value,
      area: ui.qs('#fArea').value,
      location: ui.qs('#fLocation').value,
      happenedAt: ui.qs('#fTime').value,
      description: ui.qs('#fDesc').value,
      photos: state.photos.slice(),
      contactName: ui.qs('#fContactName').value,
      contactDept: ui.qs('#fContactDept').value,
      contactWay: ui.qs('#fContactWay').value,
      revealMode: ui.qs('#fReveal').value,
      hidden: isFound() ? collectHidden() : []
    };
  }

  function fillForm(post) {
    state.type = post.type;
    state.photos = (post.photos || []).slice();

    ui.qs('#fTitle').value = post.title || '';
    ui.qs('#fCategory').value = post.category;
    ui.qs('#fArea').value = post.area;
    refreshSpotList();
    ui.qs('#fLocation').value = post.location || '';
    ui.qs('#fTime').value = U.toInputValue(U.parseTime(post.happenedAt) || new Date());
    ui.qs('#fDesc').value = post.description || '';
    ui.qs('#fContactName').value = post.contactName || '';
    ui.qs('#fContactDept').value = post.contactDept || '';
    ui.qs('#fContactWay').value = post.contactWay || '';
    ui.qs('#fReveal').value = post.revealMode || 'contact';

    applyType();

    // 回填隐藏特征的答案（公开视图里没有答案，所以编辑时向数据层单独取一次）
    var raw = rawPostById(post.id);
    if (raw && Array.isArray(raw.hidden) && raw.hidden.length) {
      var answers = {};
      raw.hidden.forEach(function (item) { answers[item.q] = item.a; });
      renderHiddenQuestions(answers);
    }

    renderPhotos();
    updateCounters();
  }

  /** 编辑时取内部原始记录。只有发布者能拿到，数据层已经做了归属校验的场景在这里由页面保证。 */
  function rawPostById(id) {
    var dump = store.exportAll();
    for (var i = 0; i < dump.posts.length; i++) {
      if (dump.posts[i].id === id) {
        var post = dump.posts[i];
        // 编辑别人的信息没有意义，数据层也会在提交时拒绝
        return post.ownerId === myId ? post : null;
      }
    }
    return null;
  }

  function updateCounters() {
    ui.qs('#titleCount').textContent = ui.qs('#fTitle').value.length;
    ui.qs('#descCount').textContent = ui.qs('#fDesc').value.length;
  }

  // ---------------------------------------------------------------- 提交

  function setSubmitting(busy) {
    var btn = ui.qs('#submitBtn');
    btn.disabled = busy;
    btn.textContent = busy ? '处理中…' : (editId ? '保存修改' : '发布');
  }

  function submit() {
    ui.clearFieldErrors(form);
    ui.showFormAlert(form, '');

    var input = readForm();
    var check = LF.validatePost(input);
    if (!check.ok) {
      ui.showFieldErrors(form, check.errors);
      ui.showFormAlert(form, '还有 ' + Object.keys(check.errors).length + ' 处需要修改，请检查标红的字段。');
      if (check.errors.hidden) ui.toast(check.errors.hidden, 'error');
      return;
    }

    // 记住联系人，下次发布自动带出
    store.saveMe({ name: input.contactName, dept: input.contactDept, way: input.contactWay });

    setSubmitting(true);
    var result = editId
      ? store.update(editId, input, myId)
      : store.create(input, myId);
    setSubmitting(false);

    if (!result.ok) {
      var errors = result.errors || {};
      ui.showFieldErrors(form, errors);
      if (errors._) ui.showFormAlert(form, errors._);
      ui.toast(errors._ || '保存失败，请检查表单', 'error');
      return;
    }

    U.go('success', { id: result.post.id, mode: editId ? 'edit' : 'new' });
  }

  // ---------------------------------------------------------------- 事件绑定

  ui.qs('#typeSeg').addEventListener('click', function (event) {
    var btn = event.target.closest('button[data-type]');
    if (!btn) return;
    if (state.type === btn.getAttribute('data-type')) return;
    state.type = btn.getAttribute('data-type');
    applyType();
  });

  ui.qs('#fCategory').addEventListener('change', function () {
    // 换分类时把已填的答案带过去，能对上的问题不用重填
    var previous = {};
    collectHidden().forEach(function (item) { previous[item.q] = item.a; });
    renderHiddenQuestions(previous);
  });

  ui.qs('#fArea').addEventListener('change', refreshSpotList);
  ui.qs('#fTitle').addEventListener('input', updateCounters);
  ui.qs('#fDesc').addEventListener('input', updateCounters);

  // 隐藏特征答案变化时更新"已填几项"的提示
  ui.qs('#hiddenQuestions').addEventListener('input', updateHiddenHint);

  // 用户开始修改某个字段就把它上面的红色报错清掉，避免一直红着
  form.addEventListener('input', function (event) {
    var holder = event.target.closest('.field.has-error');
    if (holder) holder.classList.remove('has-error');
    ui.showFormAlert(form, '');
  });
  form.addEventListener('change', function (event) {
    var holder = event.target.closest('.field.has-error');
    if (holder) holder.classList.remove('has-error');
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    submit();
  });
  ui.qs('#submitBtn').addEventListener('click', submit);
  ui.qs('#cancelBtn').addEventListener('click', function () {
    if (editId) U.go('mine');
    else if (root.history.length > 1) root.history.back();
    else U.go('index');
  });

  // ---------------------------------------------------------------- 启动

  initSelects();
  refreshSpotList();

  // 默认带上上次填过的联系人信息，减少重复输入
  var me = store.getMe();
  ui.qs('#fContactName').value = me.name || '';
  ui.qs('#fContactDept').value = me.dept || '';
  ui.qs('#fContactWay').value = me.way || '';

  ui.qs('#fTime').value = U.toInputValue(new Date());

  if (editId) {
    var existing = store.get(editId, myId);
    if (!existing) {
      ui.renderEmpty(ui.qs('#postForm'), {
        icon: '🔎',
        title: '这条信息不存在或已被删除',
        actions: [{ text: '返回我的发布', href: 'mine.html', primary: true }]
      });
      ui.qs('#submitBtn').disabled = true;
      ui.markReady({ page: 'publish', mode: 'missing' });
      return;
    }
    if (!existing.isOwner) {
      ui.renderEmpty(ui.qs('#postForm'), {
        icon: '🚫',
        title: '只能编辑自己发布的信息',
        desc: '这条信息不是你发布的，可以回到详情页查看内容。',
        actions: [
          { text: '查看详情', href: 'detail.html?id=' + encodeURIComponent(editId), primary: true },
          { text: '返回首页', href: 'index.html' }
        ]
      });
      ui.qs('#submitBtn').disabled = true;
      ui.markReady({ page: 'publish', mode: 'forbidden' });
      return;
    }

    editing = existing;
    ui.qs('#barTitle').textContent = '编辑信息';
    root.document.title = '编辑信息 · 校园失物招领';
    ui.qs('#submitBtn').textContent = '保存修改';
    ui.qs('#footTip').textContent = '保存后，首页和搜索结果里的内容会立即更新，浏览量和发布时间保持不变。';
    fillForm(existing);
  } else {
    ui.qs('#fCategory').value = 'card';
    applyType();
    renderHiddenQuestions();
    renderPhotos();
  }

  updateCounters();
  ui.markReady({ page: 'publish', mode: editId ? 'edit' : 'new' });
})(typeof globalThis !== 'undefined' ? globalThis : this);
