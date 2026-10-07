/*!
 * 校园失物招领 —— 界面公共层
 *
 * 页面控制器只关心"这条数据怎么来的、点了之后做什么"，
 * 至于导航栏长什么样、卡片怎么拼 HTML、提示怎么弹，全部收在这里。
 * 好处是：改一次卡片样式，首页、搜索结果、我的发布三处同时生效。
 */
(function (root) {
  'use strict';

  var LF = (root.LF = root.LF || {});
  var U = LF.utils;
  var ui = (LF.ui = {});

  var esc = U.escapeHtml;

  // ================================================================ 选择器与元素

  ui.qs = function (selector, scope) {
    return (scope || root.document).querySelector(selector);
  };

  ui.qsa = function (selector, scope) {
    return Array.prototype.slice.call((scope || root.document).querySelectorAll(selector));
  };

  /** 把 HTML 字符串变成元素，便于插入。 */
  ui.el = function (html) {
    var box = root.document.createElement('div');
    box.innerHTML = html.trim();
    return box.firstElementChild;
  };

  // ================================================================ 应用外壳

  var NAV_ITEMS = [
    { key: 'home', name: '首页', icon: '🏠', href: 'index.html' },
    { key: 'search', name: '搜索', icon: '🔍', href: 'search.html' },
    { key: 'mine', name: '我的发布', icon: '👤', href: 'mine.html' }
  ];

  /**
   * 在页面顶部插入导航外壳。
   * 桌面显示顶部导航栏，手机显示底部 Tab 栏，两者由 CSS 媒体查询切换，
   * 这里一次生成两套，避免每个页面各写一份。
   *
   * @param {string} activeKey 当前高亮的导航项：home / search / mine
   * @param {object} [options] { tabbar: 手机端是否显示底部 Tab 栏 }
   *        详情、发布、验证这类页面底部有自己的操作按钮，按原型不带底部导航，
   *        传 false 即可，免得两条固定底栏打架。
   */
  ui.mountShell = function (activeKey, options) {
    var opts = options || {};
    var doc = root.document;
    var showTabbar = opts.tabbar !== false;

    var topLinks = NAV_ITEMS.map(function (item) {
      return '<a href="' + item.href + '"' + (item.key === activeKey ? ' class="is-on"' : '') + '>' +
        esc(item.name) + '</a>';
    }).join('');

    var topbar = ui.el(
      '<header class="topbar">' +
        '<div class="topbar-inner">' +
          '<a class="brand" href="index.html"><span class="brand-mark">🔎</span>校园失物招领</a>' +
          '<nav class="topnav">' + topLinks + '</nav>' +
          '<a class="btn btn-primary btn-sm" href="publish.html">＋ 发布信息</a>' +
        '</div>' +
      '</header>'
    );

    if (showTabbar) {
      // 手机端底部三个入口，中间是凸起的发布按钮
      var mobileItems = NAV_ITEMS.filter(function (item) {
        return item.key !== 'search';
      }).map(function (item) {
        return '<a class="tabbar-item' + (item.key === activeKey ? ' is-on' : '') + '" href="' + item.href + '">' +
          '<span class="g">' + item.icon + '</span>' +
          '<span>' + esc(item.key === 'mine' ? '我的' : item.name) + '</span>' +
          '</a>';
      });

      doc.body.insertBefore(ui.el(
        '<nav class="tabbar">' +
          mobileItems[0] +
          '<a class="tabbar-mid" href="publish.html" aria-label="发布信息"><span class="ball">＋</span></a>' +
          mobileItems[1] +
        '</nav>'
      ), doc.body.firstChild);
    } else {
      doc.body.classList.add('no-tabbar');
    }

    doc.body.insertBefore(topbar, doc.body.firstChild);
  };

  /** 存储不可用时的顶部提示条（无痕模式、浏览器禁用本地存储等）。 */
  ui.mountStorageBanner = function (adapter) {
    if (!adapter || adapter.persistent) return;
    var text = adapter.reason ||
      '当前浏览器无法使用本地存储，你发布的信息刷新后会丢失。';

    var banner = ui.el(
      '<div class="banner show" role="status">' +
        '<span>⚠️</span><span>' + esc(text) + '</span>' +
        '<button class="banner-close" type="button" aria-label="关闭提示">×</button>' +
      '</div>'
    );
    banner.querySelector('.banner-close').addEventListener('click', function () {
      banner.remove();
    });
    var topbar = ui.qs('.topbar');
    if (topbar) root.document.body.insertBefore(banner, topbar.nextSibling);
    else root.document.body.insertBefore(banner, root.document.body.firstChild);
  };

  /**
   * 页面自检标记。
   *
   * 把"有没有 JS 报错、渲染出了多少张卡片"写到 <html> 的属性上。
   * 开发时用 Chrome headless 抓 DOM 就能确认页面真的跑起来了——
   * 因为浏览器里 JS 抛异常时进程退出码仍然是 0，只看退出码是不够的。
   */
  ui.markReady = function (extra) {
    var errors = root.__LF_ERRORS || [];
    var parts = [errors.length ? 'FAIL:' + errors.join(' | ') : 'PASS'];
    if (extra) {
      Object.keys(extra).forEach(function (key) {
        parts.push(key + '=' + extra[key]);
      });
    }
    root.document.documentElement.setAttribute('data-selftest', parts.join('|'));
  };

  /** 在 <head> 最前面装错误钩子；必须在其它脚本之前执行。 */
  ui.installErrorHook = function () {
    root.__LF_ERRORS = root.__LF_ERRORS || [];
    root.addEventListener('error', function (event) {
      root.__LF_ERRORS.push('error: ' + (event.message || event.type));
    });
    root.addEventListener('unhandledrejection', function (event) {
      root.__LF_ERRORS.push('rejection: ' + (event.reason && event.reason.message
        ? event.reason.message : event.reason));
    });
  };

  /**
   * 页面统一的入口：拿到 store、渲染外壳、处理存储提示。
   * 每个页面开头调用它，避免重复写初始化的样板代码。
   */
  ui.startPage = function (options) {
    var opts = options || {};
    var boot = LF.bootstrap();
    ui.mountShell(opts.nav, { tabbar: opts.tabbar });
    ui.mountStorageBanner(boot.adapter);

    if (boot.seeded && opts.welcome !== false) {
      // 只有第一次打开才会灌数据，顺便告诉使用者这些是演示内容
      root.setTimeout(function () {
        ui.toast('已为你准备了一批演示信息，可以直接浏览', 'ok');
      }, 500);
    }

    return {
      store: boot.store,
      myId: boot.myId,
      persistent: boot.persistent,
      adapter: boot.adapter
    };
  };

  // ================================================================ 卡片渲染

  function statusChipClass(post) {
    return post.status === 'done' ? 'chip chip-done' : 'chip chip-wait';
  }

  /** 单张信息卡片的 HTML。首页、搜索结果、我的发布共用同一套结构。 */
  ui.cardHtml = function (post, options) {
    var opts = options || {};
    var thumb = post.thumb && String(post.thumb).indexOf('data:') === 0
      ? '<img src="' + esc(post.thumb) + '" alt="">'
      : esc(post.thumb);

    var chips = '';
    if (post.needVerify) chips += '<span class="chip chip-lock">🔒 需验证</span>';
    chips += '<span class="' + statusChipClass(post) + '">' + esc(post.statusLabel) + '</span>';

    var timeText = opts.timePrefix === false
      ? U.formatRelative(post.createdAt)
      : U.formatRelative(post.createdAt) + ' 发布';

    return '' +
      '<article class="card card-link' + (post.status === 'done' ? ' is-done' : '') + '" ' +
        'data-id="' + esc(post.id) + '" tabindex="0" role="link" ' +
        'aria-label="' + esc(post.typeName + '：' + post.title) + '">' +
        '<div class="card-thumb">' + thumb + '</div>' +
        '<div class="card-main">' +
          '<h3 class="card-title">' +
            '<span class="tag tag-' + esc(post.typeTag) + '">' + esc(post.typeName) + '</span>' +
            '<span class="card-title-text">' + esc(post.title) + '</span>' +
          '</h3>' +
          '<p class="card-meta"><span>📍</span><span class="ellipsis">' + esc(post.location) + '</span></p>' +
          '<div class="card-foot">' +
            '<span>' + esc(timeText) + '</span>' +
            '<span class="card-chips">' + chips + '</span>' +
          '</div>' +
        '</div>' +
      '</article>';
  };

  /**
   * 把一批信息渲染进容器。空列表时渲染空状态而不是留一片空白。
   * @param {Element} container
   * @param {Array} posts
   * @param {object} options { grid: 用多列网格, empty: 空状态配置 }
   */
  ui.renderCards = function (container, posts, options) {
    var opts = options || {};
    if (!container) return;

    if (!posts.length) {
      ui.renderEmpty(container, opts.empty);
      return;
    }

    var wrapClass = opts.grid ? 'card-grid' : 'card-list';
    container.className = wrapClass;
    container.innerHTML = posts.map(function (post) {
      return ui.cardHtml(post, opts);
    }).join('');

    // 整张卡片可点，键盘回车/空格同样能进详情
    ui.qsa('.card[data-id]', container).forEach(function (card) {
      var go = function () {
        U.go('detail', { id: card.getAttribute('data-id') });
      };
      card.addEventListener('click', go);
      card.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          go();
        }
      });
    });
  };

  /** 空状态。默认文案是通用的，调用方可以按场景覆盖。 */
  ui.renderEmpty = function (container, options) {
    var opts = options || {};
    var icon = opts.icon || '📭';
    var title = opts.title || '这里还没有内容';
    var desc = opts.desc || '';
    var actions = (opts.actions || []).map(function (action) {
      var cls = action.primary ? 'btn btn-primary' : 'btn btn-ghost';
      return '<a class="' + cls + '" href="' + esc(action.href) + '">' + esc(action.text) + '</a>';
    }).join('');

    container.className = '';
    container.innerHTML =
      '<div class="empty">' +
        '<div class="empty-icon">' + icon + '</div>' +
        '<h3>' + esc(title) + '</h3>' +
        (desc ? '<p>' + esc(desc) + '</p>' : '') +
        (actions ? '<div class="empty-actions">' + actions + '</div>' : '') +
      '</div>';
  };

  // ================================================================ 轻提示

  var toastWrap = null;

  /**
   * 轻提示。type: 'ok' | 'warn' | 'error' | 默认。
   * 同时用 role=status 通知读屏软件。
   */
  ui.toast = function (message, type, duration) {
    var doc = root.document;
    if (!toastWrap) {
      toastWrap = ui.el('<div class="toast-wrap" role="status" aria-live="polite"></div>');
      doc.body.appendChild(toastWrap);
    }
    var node = ui.el('<div class="toast' + (type ? ' is-' + type : '') + '">' + esc(message) + '</div>');
    toastWrap.appendChild(node);

    var life = duration || (type === 'error' ? 3600 : 2200);
    root.setTimeout(function () {
      node.style.transition = 'opacity .2s ease';
      node.style.opacity = '0';
      root.setTimeout(function () { node.remove(); }, 220);
    }, life);
    return node;
  };

  // ================================================================ 弹窗

  /**
   * 通用弹窗。
   * @returns {{close: Function}} 调用方可自行关闭
   */
  ui.modal = function (options) {
    var opts = options || {};
    var doc = root.document;

    var mask = ui.el(
      '<div class="modal-mask" role="dialog" aria-modal="true">' +
        '<div class="modal">' +
          (opts.title ? '<div class="modal-head"><h3>' + esc(opts.title) + '</h3></div>' : '') +
          '<div class="modal-body">' + (opts.bodyHtml || esc(opts.message || '')) + '</div>' +
          '<div class="modal-foot"></div>' +
        '</div>' +
      '</div>'
    );

    var foot = mask.querySelector('.modal-foot');
    var buttons = opts.buttons || [{ text: '知道了', primary: true }];

    function close() {
      mask.remove();
      doc.removeEventListener('keydown', onKey);
    }

    function onKey(event) {
      if (event.key === 'Escape') close();
    }

    buttons.forEach(function (config) {
      var cls = 'btn ' + (config.primary ? 'btn-primary' : 'btn-ghost') +
        (config.danger ? ' btn-danger' : '');
      var btn = ui.el('<button type="button" class="' + cls + '">' + esc(config.text) + '</button>');
      if (config.primary && config.danger) btn.className = 'btn btn-primary';
      btn.addEventListener('click', function () {
        if (config.onClick) config.onClick(close);
        else close();
      });
      foot.appendChild(btn);
    });

    // 点遮罩关闭（点在弹窗本体上不关）
    mask.addEventListener('click', function (event) {
      if (event.target === mask) close();
    });
    doc.addEventListener('keydown', onKey);
    doc.body.appendChild(mask);

    var focusTarget = mask.querySelector('.modal-foot .btn-primary') || mask.querySelector('.modal-foot .btn');
    if (focusTarget) focusTarget.focus();

    return { close: close, mask: mask };
  };

  /** 确认对话框，返回 Promise<boolean>。 */
  ui.confirm = function (options) {
    var opts = options || {};
    return new Promise(function (resolve) {
      ui.modal({
        title: opts.title || '确认操作',
        message: opts.message || '',
        buttons: [
          { text: opts.cancelText || '取消', onClick: function (close) { close(); resolve(false); } },
          {
            text: opts.okText || '确定',
            primary: !opts.danger,
            danger: opts.danger,
            onClick: function (close) { close(); resolve(true); }
          }
        ]
      });
    });
  };

  // ================================================================ 发布者侧弹窗

  /**
   * 发布者查看收到的认领申请。
   * 详情页和「我的发布」用的是同一个弹窗，改一处两处都变。
   *
   * @param {object} deps { store, post, ownerId }
   */
  ui.claimsModal = function (deps) {
    var result = deps.store.listClaims(deps.post.id, deps.ownerId);
    if (!result.ok) return ui.toast(result.message, 'error');

    var body;
    if (!result.claims.length) {
      body = '<p class="text-muted">还没有人提交认领申请。</p>';
    } else {
      body = result.claims.map(function (claim) {
        var answers = claim.answers.map(function (item) {
          return '<div><span class="k">' + esc(item.stem) + '</span>' +
            '<span class="v' + (item.correct ? '' : ' bad') + '">' +
            esc(item.choiceText) + (item.correct ? ' ✓' : ' ✕') + '</span></div>';
        }).join('');

        return '<div class="claim-item">' +
          '<div class="claim-head">' +
            '<span class="chip ' + (claim.passed ? 'chip-ok' : 'chip-red') + '">' +
              (claim.passed ? '验证通过' : '验证未通过') + '</span>' +
            '<span class="claim-time">' + esc(U.formatRelative(claim.at)) + '</span>' +
          '</div>' +
          '<div class="claim-answers">' + answers +
            (claim.voucher ? '<div><span class="k">凭证码</span><span class="v">' +
              esc(claim.voucher) + '</span></div>' : '') +
          '</div>' +
        '</div>';
      }).join('');
    }

    return ui.modal({
      title: '收到的认领申请',
      bodyHtml: body +
        '<p class="text-small text-muted mt-12">只有你能看到答对答错（认领者自己看不到错在哪题，' +
        '免得他反复试探）。答满 3 次都没通过的同学会转成人工审核申请。</p>',
      buttons: [{ text: '关闭', primary: true }]
    });
  };

  /**
   * 发布者处理人工审核申请（认领者 3 次全败后提交的申诉）。
   * 同意之后，申诉人再看这条信息就能直接看到联系方式。
   *
   * @param {object} deps { store, post, ownerId, onDone }
   */
  ui.appealsModal = function (deps) {
    var dialog = null;

    function open() {
      var result = deps.store.listAppeals(deps.post.id, deps.ownerId);
      if (!result.ok) return ui.toast(result.message, 'error');

      var body = !result.appeals.length
        ? '<p class="text-muted">还没有人提交人工审核申请。</p>'
        : result.appeals.map(function (appeal) {
            var chip = appeal.decision === 'pending'
              ? '<span class="chip chip-wait">待处理</span>'
              : (appeal.decision === 'approved'
                  ? '<span class="chip chip-ok">已同意交还</span>'
                  : '<span class="chip chip-red">已驳回</span>');

            return '<div class="claim-item">' +
              '<div class="claim-head">' + chip +
                '<span class="claim-time">' + esc(U.formatRelative(appeal.at)) + ' 提交</span>' +
              '</div>' +
              '<div class="claim-answers">' +
                '<div><span class="k">称呼</span><span class="v">' + esc(appeal.name) + '</span></div>' +
                '<div><span class="k">联系方式</span><span class="v">' + esc(appeal.contact) + '</span></div>' +
                '<div><span class="k">他提供的细节</span><span class="v">' + esc(appeal.detail) + '</span></div>' +
                (appeal.note
                  ? '<div><span class="k">你的留言</span><span class="v">' + esc(appeal.note) + '</span></div>'
                  : '') +
              '</div>' +
              (appeal.decision === 'pending'
                ? '<div class="appeal-ops">' +
                    '<input class="input" data-note="' + esc(appeal.id) + '" maxlength="100" ' +
                      'placeholder="给对方的留言（选填，例如约在值班室见面）">' +
                    '<div class="appeal-btns">' +
                      '<button type="button" class="btn btn-ghost btn-sm" data-reject="' + esc(appeal.id) + '">驳回</button>' +
                      '<button type="button" class="btn btn-primary btn-sm" data-approve="' + esc(appeal.id) + '">同意交还</button>' +
                    '</div>' +
                  '</div>'
                : '') +
            '</div>';
          }).join('');

      if (dialog) dialog.close();
      dialog = ui.modal({
        title: '人工审核申请',
        bodyHtml: body +
          '<p class="text-small text-muted mt-12">这些是答满 3 次都没通过、转而申请人工审核的同学。' +
          '同意之后，对方再看这条信息就能直接看到你的联系方式，不用再答题；' +
          '如果东西确实不是他的，选「驳回」并写一句理由。</p>',
        buttons: [{ text: '关闭', primary: true }]
      });

      ui.qsa('[data-approve]', dialog.mask).forEach(function (button) {
        button.addEventListener('click', function () { decide(button, 'approved'); });
      });
      ui.qsa('[data-reject]', dialog.mask).forEach(function (button) {
        button.addEventListener('click', function () { decide(button, 'rejected'); });
      });
    }

    function decide(button, decision) {
      var appealId = button.getAttribute(decision === 'approved' ? 'data-approve' : 'data-reject');
      var noteInput = ui.qs('[data-note="' + appealId + '"]', dialog.mask);
      var done = deps.store.resolveAppeal(
        deps.post.id, appealId, decision, noteInput ? noteInput.value : '', deps.ownerId);

      if (!done.ok) return ui.toast(done.message, 'error');

      ui.toast(decision === 'approved' ? '已同意交还，对方可以看到你的联系方式了' : '已驳回这次申诉', 'ok');
      open();                                  // 重新拉一次数据，界面与存储保持一致
      if (deps.onDone) deps.onDone();
    }

    open();
  };

  // ================================================================ 表单错误提示

  /** 把 { 字段名: 中文提示 } 显示到表单对应位置，并返回第一个出错字段。 */
  ui.showFieldErrors = function (form, errors) {
    ui.clearFieldErrors(form);
    var first = null;

    Object.keys(errors || {}).forEach(function (field) {
      if (field === '_') return;                       // 下划线是整体错误，交给 toast
      var holder = form.querySelector('[data-field="' + field + '"]');
      if (!holder) return;
      holder.classList.add('has-error');
      var slot = holder.querySelector('.field-error');
      if (slot) slot.textContent = errors[field];
      if (!first) first = holder;
    });

    if (first) {
      first.scrollIntoView({ block: 'center', behavior: 'smooth' });
      var input = first.querySelector('input, textarea, select');
      if (input) input.focus({ preventScroll: true });
    }
    return first;
  };

  ui.clearFieldErrors = function (form) {
    if (!form) return;
    ui.qsa('.field.has-error', form).forEach(function (holder) {
      holder.classList.remove('has-error');
    });
  };

  /** 显示或隐藏表单顶部的整体错误条。 */
  ui.showFormAlert = function (form, message) {
    var alert = form.querySelector('.form-alert');
    if (!alert) return;
    if (message) {
      alert.innerHTML = '<span>⚠️</span><span>' + esc(message) + '</span>';
      alert.classList.add('show');
    } else {
      alert.classList.remove('show');
    }
  };

  // ================================================================ 其它小工具

  /**
   * 复制文本并给出统一反馈。所有"复制"入口都走这里，保证提示一致。
   *
   * 失败时不只弹一句"复制失败"就完了——那对用户是条死路。
   * 这里再弹一个能选中文本的框，让他手动复制，事情还能办成。
   * （本地文件在部分浏览器/设置下确实拿不到剪贴板权限，这条路径会用上。）
   */
  ui.copyWithToast = function (text, successMessage) {
    return U.copyText(text).then(function (ok) {
      if (ok) {
        ui.toast(successMessage || '已复制到剪贴板', 'ok');
        return true;
      }

      ui.modal({
        title: '复制失败，请手动复制',
        bodyHtml: '<p style="margin-bottom:10px">当前浏览器不允许本页直接写入剪贴板，' +
          '可以选中下面这段内容手动复制：</p>' +
          '<textarea class="textarea" readonly style="height:96px;font-size:13px">' +
          esc(text) + '</textarea>',
        buttons: [{
          text: '全选',
          onClick: function () {
            var area = ui.qs('.modal-mask .textarea');
            if (area) {
              area.focus();
              area.select();
            }
          }
        }, { text: '关闭', primary: true }]
      });
      return false;
    });
  };

  /** 生成一个带复制按钮的"联系方式"块。 */
  ui.contactRowHtml = function (label, value) {
    return '<div class="info-row">' +
      '<span class="k">' + esc(label) + '</span>' +
      '<span class="v">' + esc(value) + '</span>' +
      '</div>';
  };

  /** 数字加上千分位以外的简单展示：超过 999 显示 999+。 */
  ui.capNumber = function (n, max) {
    var limit = max || 999;
    var value = Number(n) || 0;
    return value > limit ? limit + '+' : String(value);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
