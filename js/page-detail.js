/*!
 * 信息详情页控制器
 *
 * 这个页面是"防冒领"设计真正落地的地方：
 *   - 需要验证的招领信息，未通过验证的访客拿到的对象里联系方式是空字符串，
 *     页面连渲染都渲染不出来（数据层已经剥掉了，不是靠前端藏起来）；
 *   - 发布者本人看自己的信息时，则直接显示完整的联系方式，并给出状态维护入口。
 *
 * 底部操作条按"我是谁 / 这条信息什么状态"分三种情况渲染，是本页最主要的分支逻辑。
 */
(function (root) {
  'use strict';

  var LF = root.LF;
  var U = LF.utils;
  var ui = LF.ui;
  var esc = U.escapeHtml;

  var app = ui.startPage({ nav: '', tabbar: false });
  var store = app.store;
  var myId = app.myId;

  var contentEl = ui.qs('#content');
  var actionBar = ui.qs('#actionBar');
  var postId = U.query('id');

  // ---------------------------------------------------------------- 找不到信息

  function renderNotFound() {
    ui.qs('#barTitle').textContent = '信息不存在';
    ui.renderEmpty(contentEl, {
      icon: '🔎',
      title: '这条信息不存在或已被删除',
      desc: '可能发布者已经把它删掉了，或者链接不完整。回到首页看看其它信息吧。',
      actions: [
        { text: '返回首页', href: 'index.html', primary: true },
        { text: '去搜索', href: 'search.html' }
      ]
    });
    actionBar.innerHTML = '';
    ui.markReady({ page: 'detail', found: 0 });
  }

  // ---------------------------------------------------------------- 渲染正文

  function heroHtml(post) {
    var badge = '<span class="hero-badge' + (post.type === 'lost' ? ' is-lost' : '') + '">' +
      esc(post.typeName) + '</span>';
    if (post.photos && post.photos.length) {
      return '<div class="hero">' + badge +
        '<img src="' + esc(post.photos[0]) + '" alt="' + esc(post.title) + '">' +
        '</div>';
    }
    return '<div class="hero">' + badge + esc(post.categoryIcon) + '</div>';
  }

  function photoStripHtml(post) {
    if (!post.photos || post.photos.length < 2) return '';
    return '<div class="photo-strip">' + post.photos.slice(1).map(function (src, index) {
      return '<img src="' + esc(src) + '" alt="物品照片 ' + (index + 2) + '" data-photo="' + index + '">';
    }).join('') + '</div>';
  }

  function statusChips(post) {
    var chips = '';
    if (post.needVerify) {
      // 发布者看自己的信息时，说"已验证"没有意义，应该说这条信息正被保护着
      if (post.isOwner) chips += '<span class="chip chip-lock">🔒 验证保护中</span>';
      else if (post.locked) chips += '<span class="chip chip-lock">🔒 需验证</span>';
      else chips += '<span class="chip chip-ok">🔓 已解锁</span>';
    }
    chips += '<span class="chip ' + (post.status === 'done' ? 'chip-done' : 'chip-wait') + '">' +
      esc(post.statusLabel) + '</span>';
    return chips;
  }

  /**
   * 自由描述该不该展示。
   *
   * 正常情况：锁了公开特征的分类（字典里有特征定义）不再展示描述——那一栏已经
   * 由特征行取代，描述框在发布页也收起来了。
   *
   * 例外是**旧版记录**：它们既没有公开特征、手里又只有那段描述。这时继续展示，
   * 免得详情页变成一片空白。等发布者在「我的发布」里编辑一次、补上特征，
   * 描述就自然让位——不需要额外的迁移或标志位。
   */
  function showsDescription(post) {
    if (!post.description) return false;
    if (!LF.featuresFor(post.category).length) return true;   // 「其他」：本来就靠描述承载信息
    return !LF.featureValues(post).length;
  }

  function infoRowsHtml(post) {
    var isFound = post.type === 'found';
    var rows = [];

    rows.push(['信息类型', esc(LF.typeOf(post.type).full)]);
    rows.push(['物品分类', esc(post.categoryIcon + ' ' + post.categoryName)]);

    // 公开特征：按分类的字典渲染（不是遍历 post.features，否则脏数据里的
    // 未知键会凭空多出一行）。没填的项直接不显示，老记录可能整条都是空的。
    LF.featuresFor(post.category).forEach(function (def) {
      var value = post.features ? post.features[def.key] : '';
      if (value) rows.push([esc(def.name), esc(value)]);
    });

    rows.push([isFound ? '拾取地点' : '丢失地点', esc(post.location) + '（' + esc(post.areaName) + '）']);
    rows.push([isFound ? '拾取时间' : '丢失时间', esc(U.formatDateTime(post.happenedAt)) + ' 左右']);

    var publisher = esc(post.contactName);
    if (post.contactDept) publisher += '（' + esc(post.contactDept) + '）';
    if (post.isOwner) publisher += ' <span class="chip chip-ok">我发布的</span>';
    rows.push(['发布人', publisher]);

    // 联系方式：锁定状态下数据层根本不返回，这里给的是引导文案
    if (post.locked) {
      rows.push(['联系方式',
        '<span class="is-locked">🔒 通过认领验证后可见</span>', true]);
    } else {
      rows.push(['联系方式', esc(post.contactWay)]);
    }

    if (post.status === 'done' && post.doneAt) {
      rows.push([post.doneLabel === '已找到' ? '找到时间' : '归还时间',
        esc(U.formatDateTime(post.doneAt))]);
    }

    return '<div class="info-rows">' + rows.map(function (row) {
      return '<div class="info-row">' +
        '<span class="k">' + row[0] + '</span>' +
        '<span class="v' + (row[2] ? ' is-locked' : '') + '">' + row[1] + '</span>' +
        '</div>';
    }).join('') + '</div>';
  }

  function lockboxHtml(post) {
    if (!post.needVerify) return trustBoxHtml(post);
    var mix = post.questionMix;
    return '<div class="lockbox mt-12">' +
      '<span class="ic">🔒</span>' +
      '<span>发布者出了 <b>' + post.questionCount + ' 道认领验证题</b>（判断题 ' + mix.judge +
      ' 道 · 选择题 ' + mix.choice + ' 道）。' +
      '<span class="lk">认领人需要一次性答完全部题目，全部答对才会显示发布者的联系方式并生成认领凭证；' +
      '最多答 ' + LF.VERIFY.maxAttempts + ' 次，3 次都没答对可以提交申诉走人工审核。</span></span>' +
      '</div>';
  }

  /**
   * 「其他」类招领的信任模式说明。
   *
   * ★ 这一类没有验证题（见 store.js 的 LF.allowVerifyFor），联系方式是**直接公开**的。
   *   页面必须把这件事说出来：否则认领人会以为"没让我答题"是页面出错了，
   *   或者反过来把公开的描述当成已经核对过的凭证。同一条规则，发布页也讲了一遍。
   */
  function trustBoxHtml(post) {
    if (post.type !== 'found' || LF.allowVerifyFor(post.category)) return '';
    return '<div class="lockbox mt-12">' +
      '<span class="ic">🤝</span>' +
      '<span>这一类没有认领验证题（<b>信任原则</b>）：' + esc(post.categoryName) +
      '类的物品说不清固定特征，所以描述和照片是直接公开的，联系方式也直接可见。' +
      '<span class="lk">交接前请和发布者核对只有物主知道的细节（书里的签名、钥匙串的数量等），' +
      '别只凭公开描述就认领。</span></span>' +
      '</div>';
  }

  /** 旧版信息：隐藏特征已经停用，提醒发布者重新出题。 */
  function legacyNoticeHtml(post) {
    if (!post.legacyVerify || !post.isOwner) return '';
    return '<div class="lockbox mt-12"><span class="ic">⚠️</span>' +
      '<span>这条信息是用旧版「隐藏特征」发布的（旧答案已停止使用）。' +
      '<span class="lk">点下面的「编辑」重新出 3–5 道判断题 / 选择题，认领验证才会重新生效。</span></span></div>';
  }

  function render(post) {
    ui.qs('#barTitle').textContent = '信息详情';
    root.document.title = post.title + ' · 校园失物招领';

    var safetyText = post.locked
      ? '🔒 请先核对物品特征再作答；连续 ' + LF.VERIFY.maxAttempts +
        ' 次未通过后，可以提交申诉，由发布者人工判断。'
      : '🔒 请先核对物品特征再交接；建议约在图书馆、宿舍楼下等公共场所见面，不要提前转账。';

    contentEl.innerHTML =
      heroHtml(post) +
      photoStripHtml(post) +
      '<div class="panel">' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">' +
          '<h1 style="font-size:19px;font-weight:600;line-height:1.4">' + esc(post.title) + '</h1>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:10px">' +
          statusChips(post) +
          '<span class="text-small text-muted">发布于 ' + esc(U.formatRelative(post.createdAt)) +
          ' · 浏览 ' + post.views + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="mt-12">' + infoRowsHtml(post) + '</div>' +
      lockboxHtml(post) +
      (showsDescription(post)
        ? '<div class="panel mt-12">' +
            '<h4 style="font-size:13px;color:var(--ink-3);font-weight:500;margin-bottom:8px">物品描述</h4>' +
            '<p style="line-height:1.8;white-space:pre-wrap">' + esc(post.description) + '</p>' +
          '</div>'
        : '') +
      '<div class="safe-tip mt-12"><span>🔒</span><span>' + esc(safetyText) + '</span></div>' +
      legacyNoticeHtml(post) +
      (post.isOwner && U.isStale(post.createdAt)
        ? '<div class="lockbox mt-12"><span class="ic">⏰</span><span>这条信息发布了 ' +
          '较长时间还没有结束，如果东西已经找到，记得回来把它标记为已完成，' +
          '免得其他同学白跑一趟。</span></div>'
        : '');

    // 多张照片时，点缩略图放大看
    ui.qsa('[data-photo]', contentEl).forEach(function (img) {
      img.addEventListener('click', function () {
        ui.modal({
          title: '物品照片',
          bodyHtml: '<img src="' + esc(img.getAttribute('src')) + '" alt="物品照片" ' +
            'style="width:100%;border-radius:10px">',
          buttons: [{ text: '关闭', primary: true }]
        });
      });
    });
  }

  // ---------------------------------------------------------------- 底部操作条

  function btn(text, className, onClick) {
    var node = ui.el('<button type="button" class="btn ' + className + '">' + esc(text) + '</button>');
    if (onClick) node.addEventListener('click', onClick);
    return node;
  }

  /** 发布者视角：维护状态、编辑、删除、看认领申请与人工审核申请。 */
  function renderOwnerActions(post) {
    actionBar.innerHTML = '';
    actionBar.appendChild(btn('编辑', 'btn-ghost', function () {
      U.go('publish', { id: post.id });
    }));

    if (post.needVerify && post.claimCount > 0) {
      actionBar.appendChild(btn('认领申请 ' + post.claimCount, 'btn-ghost', function () {
        showClaims(post);
      }));
    }

    if (post.appealCount > 0) {
      actionBar.appendChild(btn(
        post.appealPending > 0 ? '人工审核 ' + post.appealPending + ' 待处理' : '人工审核 ' + post.appealCount,
        'btn-ghost',
        function () { showAppeals(post); }
      ));
    }

    if (post.status === 'open') {
      var label = post.type === 'found' ? '标记已归还' : '标记已找到';
      actionBar.appendChild(btn(label, 'btn-primary', function () {
        doMarkDone(post, label);
      }));
    } else {
      actionBar.appendChild(btn('撤回完成状态', 'btn-primary', function () {
        var result = store.reopen(post.id, myId);
        if (!result.ok) return ui.toast(result.errors._, 'error');
        ui.toast('已重新挂出，别人又能看到这条信息了', 'ok');
        refresh();
      }));
    }
  }

  /** 访客视角：需要验证的引导去答题；3 次用完的引导去申诉；不需要验证的直接给联系方式。 */
  function renderVisitorActions(post) {
    actionBar.innerHTML = '';

    if (post.locked) {
      actionBar.appendChild(btn('暂不认领', 'btn-ghost', function () {
        root.history.length > 1 ? root.history.back() : U.go('index');
      }));

      // 3 次作答机会已经用完：主按钮从"我要认领"换成申诉入口
      if (post.canAppeal) {
        var appealText = (post.myAppeal && post.myAppeal.decision === 'pending')
          ? '📮 查看我的申诉'
          : (post.myAppeal && post.myAppeal.decision === 'rejected'
              ? '📮 申诉情况'
              : '📮 提交申诉（人工审核）');
        actionBar.appendChild(btn(appealText, 'btn-primary', function () {
          U.go('appeal', { id: post.id });
        }));
        return;
      }

      actionBar.appendChild(btn('🔒 我要认领（需验证）', 'btn-primary', function () {
        U.go('verify', { id: post.id });
      }));
      return;
    }

    actionBar.appendChild(btn('返回首页', 'btn-ghost', function () {
      U.go('index');
    }));
    var copyBtn = btn('复制联系方式', 'btn-primary', function () {
      ui.copyWithToast(post.contactWay, '联系方式已复制：' + post.contactWay);
    });
    actionBar.appendChild(copyBtn);
  }

  function doMarkDone(post, label) {
    ui.confirm({
      title: label + '？',
      message: '标记之后，这条信息在首页、搜索结果里都会显示为「' +
        (post.type === 'found' ? '已归还' : '已找到') +
        '」，其他同学就不会再联系你了。如果弄错了，随时可以撤回。',
      okText: label
    }).then(function (ok) {
      if (!ok) return;
      var result = store.markDone(post.id, myId);
      if (!result.ok) return ui.toast(result.errors._, 'error');
      ui.toast('已标记为' + (post.type === 'found' ? '已归还' : '已找到'), 'ok');
      refresh();
    });
  }

  /** 发布者查看收到的认领申请（含答错的记录，便于判断是否要给人工审核机会）。 */
  function showClaims(post) {
    ui.claimsModal({ store: store, post: post, ownerId: myId });
  }

  /** 发布者处理人工审核申请；处理完刷新本页（底部按钮计数要跟着变）。 */
  function showAppeals(post) {
    ui.appealsModal({ store: store, post: post, ownerId: myId, onDone: refresh });
  }

  // ---------------------------------------------------------------- 数据刷新

  var current = null;

  function refresh(countView) {
    current = store.get(postId, myId, !!countView);
    if (!current) return renderNotFound();

    render(current);
    if (current.isOwner) renderOwnerActions(current);
    else renderVisitorActions(current);

    ui.markReady({
      page: 'detail',
      found: 1,
      locked: current.locked ? 1 : 0,
      owner: current.isOwner ? 1 : 0
    });
  }

  // ---------------------------------------------------------------- 启动

  if (!postId) {
    renderNotFound();
  } else {
    refresh(true);   // 首次进入计一次浏览
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
