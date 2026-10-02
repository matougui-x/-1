/*!
 * 认领验证（答题页）
 *
 * 流程：进入时向数据层要一组题（startClaim，随机抽 2 项隐藏特征）→
 *       认领人作答 → 提交比对（submitClaim）→ 跳结果页。
 *
 * 这里刻意不做"前端对答案"：题目对象里根本没有答案，
 * 提交也是把答案交回数据层比对。页面拿不到正确答案，改前端也没用。
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
  var session = null;

  ui.qs('#backLink').href = postId ? 'detail.html?id=' + encodeURIComponent(postId) : 'index.html';

  /** 出错时统一收场：说明原因 + 给出可去的下一步。 */
  function deadEnd(icon, title, desc, actions) {
    ui.renderEmpty(contentEl, { icon: icon, title: title, desc: desc, actions: actions });
    actionBar.innerHTML = '';
    ui.markReady({ page: 'verify', ok: 0 });
  }

  // ---------------------------------------------------------------- 前置检查

  if (!post) {
    deadEnd('🔎', '这条信息不存在或已被删除', '它可能已经被发布者删掉了。',
      [{ text: '返回首页', href: 'index.html', primary: true }]);
  } else if (post.isOwner) {
    deadEnd('🙋', '这是你自己发布的信息',
      '发布者不需要认领自己的招领信息。你可以到「我的发布」里查看收到的认领申请。',
      [
        { text: '查看我的发布', href: 'mine.html', primary: true },
        { text: '查看详情', href: 'detail.html?id=' + encodeURIComponent(post.id) }
      ]);
  } else if (!post.needVerify) {
    deadEnd('📞', '这条信息不需要验证',
      '发布者没有设置隐藏特征，你可以直接在详情页看到联系方式。',
      [{ text: '去详情页联系发布者', href: 'detail.html?id=' + encodeURIComponent(post.id), primary: true }]);
  } else if (post.status === 'done') {
    // 注意：renderEmpty 内部会统一转义，这里不要自己再转一次
    deadEnd('✅', '这条信息已经完成了',
      '物品已经' + post.doneLabel + '，不用再认领了。你可以搜索一下有没有其它相关信息。',
      [
        { text: '搜索同类信息', href: 'search.html?q=' + encodeURIComponent(post.title), primary: true },
        { text: '返回首页', href: 'index.html' }
      ]);
  } else {
    start();
  }

  // ---------------------------------------------------------------- 开始验证

  function start() {
    session = store.startClaim(postId);

    if (!session.ok) {
      deadEnd(session.locked ? '🔒' : '⚠️',
        session.locked ? '尝试次数已用完' : '暂时无法发起验证',
        session.message + (session.locked ? '可以联系发布者申请人工核对，由他来判断。' : ''),
        [
          { text: '返回详情页', href: 'detail.html?id=' + encodeURIComponent(postId), primary: true },
          { text: '回首页看看别的', href: 'index.html' }
        ]);
      return;
    }

    render();
  }

  function attemptDots(remaining, max) {
    var dots = '';
    for (var i = 0; i < max; i++) {
      dots += '<span class="dot' + (i < remaining ? '' : ' is-off') + '"></span>';
    }
    return '<div class="attempt-dots">' + dots +
      '<span>剩余尝试次数 ' + remaining + ' / ' + max + '</span></div>';
  }

  function render() {
    var questions = session.questions;

    contentEl.innerHTML =
      // 顶部信息条：确认自己在认领哪一条
      '<div class="panel">' +
        '<div style="font-size:15px;font-weight:600;margin-bottom:8px">' + esc(post.title) + '</div>' +
        '<div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--ink-3)">' +
          '<span>' + esc(post.typeName) + ' · ' + esc(post.location) + '</span>' +
          '<span>发布人 ' + esc(post.contactName) + '</span>' +
        '</div>' +
      '</div>' +

      '<div class="lockbox mt-12">' +
        '<span class="ic">🔒</span>' +
        '<span>该信息有 <b>' + post.hiddenCount + ' 项关键特征</b>被发布者隐藏（' +
        esc(post.hiddenLabels.join(' / ')) + '）。' +
        '<span class="lk">系统随机抽取 ' + questions.length + ' 项请你作答，' +
        '全部正确才会显示发布者的联系方式。</span></span>' +
      '</div>' +

      '<div class="mt-16">' + attemptDots(session.remaining, session.maxAttempts) + '</div>' +

      questions.map(function (question, index) {
        return '<div class="question-card" data-q="' + esc(question.q) + '">' +
          '<div class="q-title"><i>Q' + (index + 1) + '</i><span>' + esc(question.ask) + '</span></div>' +
          '<div class="q-desc">请如实填写你在物品上看到的特征，用于和发布者设置的内容比对</div>' +
          '<input class="input" data-answer maxlength="20" autocomplete="off" ' +
            'placeholder="在这里填写答案" aria-label="' + esc(question.ask) + '">' +
          '</div>';
      }).join('') +

      '<p class="text-small text-muted mt-12">' +
        '提交后答案仅用于与发布者设置的隐藏特征比对，不会展示给其他用户；' +
        '通过验证后你的昵称与联系方式会同步给发布者。' +
      '</p>' +

      '<div class="text-center mt-12">' +
        '<a class="link-muted" href="detail.html?id=' + encodeURIComponent(postId) + '">' +
        '—— 答错了会怎样？先看看会发生什么 ——</a>' +
      '</div>';

    // 回车提交，手机上少点一次。
    // 但答案大多是中文（"蓝色小熊贴纸"这种），用输入法选词时按回车是「确认候选词」，
    // 不是「提交」，必须放过去——否则打到一半就被提交了。
    ui.qsa('[data-answer]', contentEl).forEach(function (input) {
      input.addEventListener('keydown', function (event) {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      });
    });

    actionBar.innerHTML = '';
    var backBtn = ui.el('<button type="button" class="btn btn-ghost">返回详情</button>');
    backBtn.addEventListener('click', function () {
      U.go('detail', { id: postId });
    });
    var submitBtn = ui.el('<button type="button" class="btn btn-primary" id="submitBtn">提交验证</button>');
    submitBtn.addEventListener('click', submit);
    actionBar.appendChild(backBtn);
    actionBar.appendChild(submitBtn);

    var first = ui.qs('[data-answer]', contentEl);
    if (first) first.focus();

    ui.markReady({ page: 'verify', ok: 1, questions: questions.length });
  }

  // ---------------------------------------------------------------- 提交

  function submit() {
    var answers = ui.qsa('.question-card', contentEl).map(function (card) {
      return {
        q: card.getAttribute('data-q'),
        a: U.clean(card.querySelector('[data-answer]').value)
      };
    });

    var empty = answers.filter(function (item) { return item.a === ''; });
    if (empty.length) {
      ui.toast('还有 ' + empty.length + ' 道题没有填写', 'error');
      var firstEmpty = ui.qs('.question-card[data-q="' + empty[0].q + '"] [data-answer]', contentEl);
      if (firstEmpty) firstEmpty.focus();
      return;
    }

    var btn = ui.qs('#submitBtn');
    btn.disabled = true;
    btn.textContent = '比对中…';

    var result = store.submitClaim(postId, answers);

    if (!result.ok) {
      btn.disabled = false;
      btn.textContent = '提交验证';
      ui.toast(result.message, 'error');
      return;
    }

    // 结果落一次盘，结果页读出来渲染（两页之间不共享内存）
    store.saveLastClaim({
      postId: postId,
      title: post.title,
      at: Date.now(),
      passed: result.passed,
      remaining: result.remaining,
      maxAttempts: result.maxAttempts,
      voucher: result.voucher || '',
      failed: result.failed || [],
      verifiedLabels: result.verifiedLabels || [],
      contact: result.contact || null,
      hiddenLabels: post.hiddenLabels
    });

    U.go('verify-result', { id: postId, r: result.passed ? 'ok' : 'fail' });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
