/*!
 * 我的发布
 *
 * 作业要求的主流程最后一环落在这里：东西找到 / 归还之后，由发布者把状态改掉，
 * 别人就不会再重复联系。所以这个页面把"标记已找到 / 已归还"放在最显眼的位置，
 * 编辑、删除、查看认领申请次之。
 *
 * 第一次作业的原型里这个页面只有"编辑 / 删除 / 查看认领申请"，
 * 没有状态维护入口——那是原型的一个缺口，这里补上。
 */
(function (root) {
  'use strict';

  var LF = root.LF;
  var U = LF.utils;
  var ui = LF.ui;
  var esc = U.escapeHtml;

  var app = ui.startPage({ nav: 'mine' });
  var store = app.store;
  var myId = app.myId;

  var listEl = ui.qs('#list');
  var tabStatus = 'open';

  // ---------------------------------------------------------------- 渲染

  function renderTabs(mine) {
    ui.qsa('#mineTabs button').forEach(function (btn) {
      var status = btn.getAttribute('data-status');
      var count = status === 'open' ? mine.open.length : mine.done.length;
      btn.textContent = (status === 'open' ? '进行中 ' : '已完成 ') + count;
      btn.classList.toggle('is-on', status === tabStatus);
      btn.setAttribute('aria-selected', status === tabStatus ? 'true' : 'false');
    });
  }

  function metaLine(post) {
    var parts = [
      '📍 ' + esc(post.location),
      esc(U.formatRelative(post.createdAt)) + ' 发布',
      '浏览 ' + post.views
    ];
    if (post.status === 'done' && post.doneAt) {
      parts.push(esc(post.doneLabel) + '于 ' + esc(U.formatRelative(post.doneAt)));
    }
    return parts.join(' ｜ ');
  }

  /** 招领信息显示它出了几道题、收到几次认领申请与人工审核申请。 */
  function claimLine(post) {
    if (post.legacyVerify) {
      return '<div class="lockbox" style="margin-bottom:11px"><span class="ic">⚠️</span>' +
        '<span>旧版隐藏特征已停用' +
        (post.legacyHiddenCount ? '（原有 ' + post.legacyHiddenCount + ' 项）' : '') +
        '，这条信息暂时不需要验证。' +
        '<span class="lk">点「编辑」重新出 3–5 道判断题 / 选择题，认领验证就会重新生效。</span></span></div>';
    }

    if (!post.needVerify) {
      // 「其他」类招领不出题：联系方式直接公开。这里说一句，
      // 免得发布者以为是出题没保存上（代价也一并讲清楚，见 store.js 的 LF.allowVerifyFor）。
      if (post.type === 'found' && !LF.allowVerifyFor(post.category)) {
        return '<div class="lockbox" style="margin-bottom:11px"><span class="ic">🤝</span>' +
          '<span>这一类不设认领验证题（信任原则）：描述和照片直接公开，联系方式也直接可见。' +
          '<span class="lk">代价是没有防冒领的闸门，交接前记得让对方说一说只有物主知道的细节。</span>' +
          '</span></div>';
      }
      return '';
    }

    var text = '验证题 ' + post.questionCount + ' 道（判断题 ' + post.questionMix.judge +
      ' · 选择题 ' + post.questionMix.choice + '）｜ 收到认领申请 ' + post.claimCount + ' 次';
    if (post.claimCount > 0) {
      text += '（通过 ' + post.claimPassed + ' · 未通过 ' + (post.claimCount - post.claimPassed) + '）';
    }
    if (post.appealCount > 0) {
      text += '｜ 人工审核申请 ' + post.appealCount + ' 条' +
        (post.appealPending > 0 ? '（待处理 ' + post.appealPending + '）' : '');
    }

    return '<div class="lockbox" style="margin-bottom:11px">' +
      '<span class="ic">🔒</span><span>' + esc(text) + '</span></div>';
  }

  function opsHtml(post) {
    var ops = [];
    if (post.status === 'open') {
      ops.push('<button type="button" class="btn btn-primary btn-sm" data-op="done">' +
        (post.type === 'found' ? '标记已归还' : '标记已找到') + '</button>');
    } else {
      ops.push('<button type="button" class="btn btn-ghost btn-sm" data-op="reopen">撤回完成状态</button>');
    }
    if (post.needVerify && post.claimCount > 0) {
      ops.push('<button type="button" class="btn btn-ghost btn-sm" data-op="claims">认领申请 ' +
        post.claimCount + '</button>');
    }
    if (post.appealCount > 0) {
      ops.push('<button type="button" class="btn ' +
        (post.appealPending > 0 ? 'btn-primary' : 'btn-ghost') + ' btn-sm" data-op="appeals">' +
        (post.appealPending > 0 ? '人工审核 ' + post.appealPending + ' 待处理' : '人工审核申请 ' + post.appealCount) +
        '</button>');
    }
    ops.push('<button type="button" class="btn btn-ghost btn-sm" data-op="edit">编辑</button>');
    ops.push('<button type="button" class="btn btn-danger btn-sm" data-op="delete">删除</button>');
    return ops.join('');
  }

  function itemHtml(post) {
    return '<article class="mine-item' + (post.status === 'done' ? ' is-done' : '') + '" data-id="' +
      esc(post.id) + '">' +
      '<h3 class="mine-title">' +
        '<span class="tag tag-' + esc(post.typeTag) + '">' + esc(post.typeName) + '</span>' +
        '<span>' + esc(post.title) + '</span>' +
        '<span class="chip ' + (post.status === 'done' ? 'chip-done' : 'chip-wait') +
          '" style="margin-left:auto">' + esc(post.statusLabel) + '</span>' +
      '</h3>' +
      '<div class="mine-meta">' + metaLine(post) + '</div>' +
      claimLine(post) +
      '<div class="mine-ops">' + opsHtml(post) + '</div>' +
    '</article>';
  }

  function render() {
    var mine = store.listMine(myId);
    renderTabs(mine);

    var posts = tabStatus === 'open' ? mine.open : mine.done;

    if (!posts.length) {
      ui.renderEmpty(listEl, tabStatus === 'open' ? {
        icon: '📝',
        title: '你还没有进行中的信息',
        desc: '丢了东西或者捡到东西，发一条信息让更多人看到，比在群里刷屏管用。',
        actions: [{ text: '去发布一条', href: 'publish.html', primary: true }]
      } : {
        icon: '✅',
        title: '还没有已完成的信息',
        desc: '东西找到或归还之后，把信息标记为已完成，它就会出现在这里。'
      });
    } else {
      listEl.className = '';
      listEl.innerHTML = posts.map(itemHtml).join('');
      bindOps();
    }

    ui.qs('#usageText').textContent = '已用 ' + U.formatBytes(store.usage().bytes);
    ui.markReady({ page: 'mine', tab: tabStatus, items: posts.length });
  }

  // ---------------------------------------------------------------- 操作

  function findPost(id) {
    var mine = store.listMine(myId);
    var all = mine.open.concat(mine.done);
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) return all[i];
    }
    return null;
  }

  function bindOps() {
    ui.qsa('.mine-item', listEl).forEach(function (card) {
      var id = card.getAttribute('data-id');
      card.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-op]');
        if (!btn) return;
        handleOp(btn.getAttribute('data-op'), id);
      });
    });
  }

  function handleOp(op, id) {
    var post = findPost(id);
    if (!post) return;

    if (op === 'done') return markDone(post);
    if (op === 'reopen') return reopen(post);
    if (op === 'edit') return U.go('publish', { id: id });
    if (op === 'delete') return remove(post);
    if (op === 'claims') return showClaims(post);
    if (op === 'appeals') return showAppeals(post);
  }

  function markDone(post) {
    var label = post.type === 'found' ? '标记已归还' : '标记已找到';
    var result = post.type === 'found' ? '已归还' : '已找到';

    ui.confirm({
      title: label + '？',
      message: '标记之后，这条信息在首页和搜索结果里都会显示为「' + result +
        '」，其他同学就不会再联系你了。如果弄错了，随时可以撤回。',
      okText: label
    }).then(function (ok) {
      if (!ok) return;
      var done = store.markDone(post.id, myId);
      if (!done.ok) return ui.toast(done.errors._, 'error');
      ui.toast('已标记为' + result, 'ok');
      render();
    });
  }

  function reopen(post) {
    var result = store.reopen(post.id, myId);
    if (!result.ok) return ui.toast(result.errors._, 'error');
    ui.toast('已重新挂出，别人又能看到这条信息了', 'ok');
    render();
  }

  function remove(post) {
    ui.confirm({
      title: '删除这条信息？',
      message: '「' + post.title + '」删除后无法恢复，别人也再搜不到它。如果只是东西已经找到，建议改用「标记已完成」，' +
        '这样还能给其他同学留个参考。',
      okText: '删除',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      var result = store.remove(post.id, myId);
      if (!result.ok) return ui.toast(result.errors._, 'error');
      ui.toast('已删除', 'ok');
      render();
    });
  }

  function showClaims(post) {
    ui.claimsModal({ store: store, post: post, ownerId: myId });
  }

  /** 处理人工审核申请：处理完重新渲染列表，因为"待处理"计数会变。 */
  function showAppeals(post) {
    ui.appealsModal({ store: store, post: post, ownerId: myId, onDone: render });
  }

  // ---------------------------------------------------------------- 本地数据维护

  ui.qs('#exportBtn').addEventListener('click', function () {
    var dump = JSON.stringify(store.exportAll(), null, 2);
    ui.modal({
      title: '导出数据',
      bodyHtml: '<p class="text-small text-muted" style="margin-bottom:10px">' +
        '下面是全部数据（含每道验证题的正确答案），可以复制保存作为备份。共 ' +
        U.formatBytes(dump.length * 2) + '。</p>' +
        '<textarea class="textarea" readonly style="height:200px;font-size:12px">' +
        esc(dump) + '</textarea>',
      buttons: [
        {
          text: '复制全部',
          onClick: function (close) {
            ui.copyWithToast(dump, '数据已复制到剪贴板');
            close();
          }
        },
        { text: '关闭', primary: true }
      ]
    });
  });

  ui.qs('#resetBtn').addEventListener('click', function () {
    ui.confirm({
      title: '恢复演示数据？',
      message: '你发布的全部信息、搜索历史、认领记录都会被清空，' +
        '并重新灌入最初的那批演示数据。这个操作无法撤销。',
      okText: '恢复演示数据',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      store.resetAll(LF.buildSeedPosts(new Date(), myId));
      tabStatus = 'open';
      render();
      ui.toast('已恢复到演示数据', 'ok');
    });
  });

  // ---------------------------------------------------------------- 事件与启动

  ui.qs('#mineTabs').addEventListener('click', function (event) {
    var btn = event.target.closest('button[data-status]');
    if (!btn) return;
    tabStatus = btn.getAttribute('data-status');
    render();
  });

  render();
})(typeof globalThis !== 'undefined' ? globalThis : this);
