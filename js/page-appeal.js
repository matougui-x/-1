/*!
 * 申诉页（人工审核通道）
 *
 * 触发条件：认领者在同一条信息上答满 3 次仍然没有通过。
 * 这一页做两件事：
 *   1. 没提交过申诉时：让他把"只有物主才知道的细节"和联系方式写下来；
 *   2. 提交过之后：显示发布者的处理进度（待审核 / 已同意 / 已驳回）。
 *
 * 为什么不做成弹窗：发布者需要看到申诉人写的细节才能判断，
 * 这些内容必须落进数据里，才能在「我的发布」里被读到。
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

  var contentEl = ui.qs('#content');
  var actionBar = ui.qs('#actionBar');
  var postId = U.query('id');

  var post = postId ? store.get(postId, myId) : null;

  ui.qs('#backLink').href = postId ? 'detail.html?id=' + encodeURIComponent(postId) : 'index.html';

  function deadEnd(icon, title, desc, actions) {
    ui.renderEmpty(contentEl, { icon: icon, title: title, desc: desc, actions: actions });
    actionBar.innerHTML = '';
    ui.markReady({ page: 'appeal', ok: 0 });
  }

  function detailLink(text, primary) {
    return { text: text, href: 'detail.html?id=' + encodeURIComponent(postId), primary: primary };
  }

  // ---------------------------------------------------------------- 前置检查

  var myAppeal = post ? post.myAppeal : null;

  if (!post) {
    deadEnd('🔎', '这条信息不存在或已被删除', '它可能已经被发布者删掉了。',
      [{ text: '返回首页', href: 'index.html', primary: true }]);
  } else if (post.isOwner) {
    deadEnd('🙋', '这是你自己发布的信息',
      '发布者不需要申诉自己的招领信息。你可以到「我的发布」里处理收到的人工审核申请。',
      [{ text: '查看我的发布', href: 'mine.html', primary: true }, detailLink('查看详情')]);
  } else if (!post.needVerify) {
    deadEnd('📞', '这条信息不需要验证',
      '发布者没有设置认领验证题，你可以直接在详情页看到联系方式。',
      [detailLink('去详情页联系发布者', true)]);
  } else if (post.status === 'done') {
    deadEnd('✅', '这条信息已经完成了',
      '物品已经' + post.doneLabel + '，不用再申诉了。',
      [{ text: '返回首页', href: 'index.html', primary: true }]);
  } else if (!myAppeal && post.attemptsLeft > 0) {
    // 还没答满 3 次就想过申诉？先让他把剩下的机会用完
    deadEnd('🔒', '【申诉】按钮还没有解锁',
      '按规则要先答满 3 次：你还有 ' + post.attemptsLeft + ' 次作答机会，用完之后才能提交申诉。',
      [
        { text: '回去继续作答', href: 'verify.html?id=' + encodeURIComponent(postId), primary: true },
        detailLink('返回详情')
      ]);
  } else if (myAppeal) {
    renderStatus(myAppeal);
  } else {
    renderForm();
  }

  // ---------------------------------------------------------------- 申诉进度

  function renderStatus(appeal) {
    var head = {
      pending: {
        icon: '⏳',
        title: '申诉已提交，等待发布者处理',
        desc: '发布者会在「我的发布」里看到你写的细节并作出判断。处理结果会显示在这一页。'
      },
      approved: {
        icon: '✅',
        title: '发布者已同意你的申诉',
        desc: '联系方式已经解锁，回到信息详情页就能看到，请尽快联系发布者完成线下交接。'
      },
      rejected: {
        icon: '❌',
        title: '发布者驳回了这次申诉',
        desc: '如果认为判断有误，可以和发布者当面沟通，或向学校保卫处等渠道求助。'
      }
    }[appeal.decision] || {
      icon: '📮', title: '申诉已提交', desc: '等待发布者处理。'
    };

    contentEl.innerHTML =
      '<div class="result-head' + (appeal.decision === 'approved' ? ' is-ok' : (appeal.decision === 'rejected' ? ' is-bad' : '')) + '">' +
        '<div class="tick">' + head.icon + '</div>' +
        '<h2>' + head.title + '</h2>' +
        '<p>' + esc(head.desc) + '</p>' +
      '</div>' +

      (appeal.decision === 'approved' && post.contactWay
        ? '<div class="voucher mt-24">' +
            '<div>' +
              '<div class="lb">线下交接编号</div>' +
              '<div class="code">' + esc(appeal.voucher || '—') + '</div>' +
            '</div>' +
            '<span class="chip chip-ok">已解锁</span>' +
          '</div>'
        : '') +

      '<div class="info-rows mt-16">' +
        '<div class="info-row"><span class="k">物品</span><span class="v">' + esc(post.title) + '</span></div>' +
        '<div class="info-row"><span class="k">发布时间</span><span class="v">' +
          esc(U.formatRelative(appeal.at)) + ' 提交</span></div>' +
        '<div class="info-row"><span class="k">我的称呼</span><span class="v">' + esc(appeal.name) + '</span></div>' +
        '<div class="info-row"><span class="k">联系方式</span><span class="v">' + esc(appeal.contact) + '</span></div>' +
        '<div class="info-row"><span class="k">我提供的细节</span><span class="v">' +
          esc(appeal.detail) + '</span></div>' +
        (appeal.note
          ? '<div class="info-row"><span class="k">发布者留言</span><span class="v">' + esc(appeal.note) + '</span></div>'
          : '') +
      '</div>' +

      (appeal.decision === 'approved'
        ? '<div class="safe-tip mt-16"><span>🔒</span><span>请携带本人学生证或身份证领取；' +
          '线下交接时出示上面的编号，方便发布者核对。</span></div>'
        : '<p class="text-small text-muted mt-12">申诉只针对这一条信息。' +
          '如果物品被别人领走了或者信息已经完成，发布者也可以驳回这次申诉。</p>') +

      '<div class="action-bar mt-24" style="position:static;padding:0;border:none;background:none">' +
        '<a class="btn btn-ghost" href="index.html">返回首页</a>' +
        '<a class="btn ' + (appeal.decision === 'approved' ? 'btn-primary' : 'btn-ghost') +
          '" href="detail.html?id=' + encodeURIComponent(postId) + '">查看信息详情</a>' +
      '</div>';

    actionBar.innerHTML = '';
    ui.qs('#barTitle').textContent = '申诉进度';
    ui.markReady({ page: 'appeal', mode: 'status', decision: appeal.decision });
  }

  // ---------------------------------------------------------------- 申诉表单

  function renderForm() {
    ui.qs('#barTitle').textContent = '提交申诉';

    var me = store.getMe();

    contentEl.innerHTML =
      '<div class="lockbox">' +
        '<span class="ic">📮</span>' +
        '<span>你已经答满 <b>' + LF.VERIFY.maxAttempts + ' 次</b>，【申诉】按钮已解锁。' +
        '<span class="lk">把你能提供的物品细节写清楚（越具体越好，比如姓名、编号、贴纸、' +
        '里面的东西、购买时间），发布者会人工判断是否把物品交还给你。</span></span>' +
      '</div>' +

      '<div class="panel mt-12">' +
        '<div style="font-size:15px;font-weight:600;margin-bottom:8px">' + esc(post.title) + '</div>' +
        '<div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--ink-3)">' +
          '<span>' + esc(post.typeName) + ' · ' + esc(post.location) + '</span>' +
          '<span>发布人 ' + esc(post.contactName) + '</span>' +
        '</div>' +
      '</div>' +

      '<form id="appealForm" class="mt-12" novalidate autocomplete="off">' +
        '<div class="field" data-field="name">' +
          '<label class="field-label" for="aName">你的称呼<span class="req">*</span></label>' +
          '<input class="input" id="aName" maxlength="' + LF.APPEAL.nameMax + '" placeholder="例如：李思远">' +
          '<div class="field-error"></div>' +
        '</div>' +

        '<div class="field" data-field="contact">' +
          '<label class="field-label" for="aContact">联系方式<span class="req">*</span></label>' +
          '<input class="input" id="aContact" maxlength="' + LF.APPEAL.contactMax + '" placeholder="例如：微信：lisiyuan2022">' +
          '<div class="field-hint">只有发布者能看到，用来和你约线下交接。</div>' +
          '<div class="field-error"></div>' +
        '</div>' +

        '<div class="field" data-field="detail">' +
          '<label class="field-label" for="aDetail">你能提供的物品细节<span class="req">*</span></label>' +
          '<textarea class="textarea" id="aDetail" maxlength="' + LF.APPEAL.detailMax + '" ' +
            'placeholder="例如：这张卡号后四位是 3882，背面签名栏写的是我的名字，卡套里还有一张借书凭条。"></textarea>' +
          '<div class="field-error"></div>' +
          '<div class="field-counter"><span id="detailCount">0</span>/' + LF.APPEAL.detailMax + '</div>' +
        '</div>' +
      '</form>' +

      '<div class="form-alert" id="appealAlert" role="alert"></div>' +

      '<p class="text-small text-muted mt-12">提交后你的称呼、联系方式和这段细节只有发布者能看到，' +
      '不会出现在首页、搜索结果或详情页里。</p>';

    ui.qs('#aName').value = me.name || '';
    ui.qs('#aContact').value = me.way || '';

    var form = ui.qs('#appealForm');
    ui.qs('#aDetail').addEventListener('input', function () {
      ui.qs('#detailCount').textContent = ui.qs('#aDetail').value.length;
    });

    form.addEventListener('input', function () {
      ui.clearFieldErrors(form);
      ui.showFormAlert(form, '');
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      submitAppeal(form);
    });

    actionBar.innerHTML = '';
    var backBtn = ui.el('<button type="button" class="btn btn-ghost">返回详情</button>');
    backBtn.addEventListener('click', function () { U.go('detail', { id: postId }); });
    var submitBtn = ui.el('<button type="button" class="btn btn-primary" id="appealSubmit">提交申诉</button>');
    submitBtn.addEventListener('click', function () { submitAppeal(form); });
    actionBar.appendChild(backBtn);
    actionBar.appendChild(submitBtn);

    var first = ui.qs('#aName');
    if (first) first.focus();

    ui.markReady({ page: 'appeal', mode: 'form' });
  }

  function submitAppeal(form) {
    ui.clearFieldErrors(form);
    ui.showFormAlert(form, '');

    var result = store.submitAppeal(postId, {
      name: ui.qs('#aName').value,
      contact: ui.qs('#aContact').value,
      detail: ui.qs('#aDetail').value
    }, myId);

    if (!result.ok) {
      if (result.errors) {
        ui.showFieldErrors(form, result.errors);
        var alert = ui.qs('#appealAlert');
        if (alert) {
          alert.innerHTML = '<span>⚠️</span><span>还有 ' + Object.keys(result.errors).length +
            ' 处需要完善，请检查标红的字段。</span>';
          alert.classList.add('show');
        }
        return;
      }
      ui.toast(result.message, 'error');
      return;
    }

    store.saveLastAppeal({ postId: postId, appealId: result.appeal.id, at: result.appeal.at });
    ui.toast('申诉已提交，等待发布者处理', 'ok');
    post = store.get(postId, myId);
    renderStatus(post.myAppeal);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
