/*!
 * 认领验证（答题页）
 *
 * 第二版方案：发布者出的是客观题，认领者一次性填完所有题再提交。
 * 流程：进入时向数据层要全部题目（startClaim）→ 认领人逐题点选项 →
 *       提交（submitClaim）→ 跳结果页。
 *
 * 这里刻意不做"前端对答案"：题目对象里根本没有 answer，
 * 提交也是把选项下标交回数据层比对。页面拿不到正确答案，改前端也没用。
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

  function detailLink(text, primary) {
    return { text: text, href: 'detail.html?id=' + encodeURIComponent(postId), primary: primary };
  }

  // ---------------------------------------------------------------- 前置检查

  if (!post) {
    deadEnd('🔎', '这条信息不存在或已被删除', '它可能已经被发布者删掉了。',
      [{ text: '返回首页', href: 'index.html', primary: true }]);
  } else if (post.isOwner) {
    deadEnd('🙋', '这是你自己发布的信息',
      '发布者不需要认领自己的招领信息。你可以到「我的发布」里查看收到的认领申请与人工审核申请。',
      [
        { text: '查看我的发布', href: 'mine.html', primary: true },
        detailLink('查看详情')
      ]);
  } else if (!post.needVerify) {
    deadEnd('📞', '这条信息不需要验证',
      '发布者没有设置认领验证题，你可以直接在详情页看到联系方式。',
      [detailLink('去详情页联系发布者', true)]);
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
      // 3 次已经用完：这里直接把人引到申诉通道，而不是让他干看着
      if (session.locked) {
        var myAppeal = post.myAppeal;
        deadEnd('🔒', '3 次作答机会已经用完',
          (myAppeal && myAppeal.decision === 'pending')
            ? '你已经提交过申诉，正在等待发布者人工审核。审核结果会显示在申诉页面里。'
            : '按规则，答满 3 次仍未通过时可以提交申诉，由发布者人工判断是否把物品交还给你。',
          [
            {
              text: (myAppeal && myAppeal.decision === 'pending') ? '查看我的申诉' : '去提交申诉',
              href: 'appeal.html?id=' + encodeURIComponent(postId),
              primary: true
            },
            detailLink('返回详情页')
          ]);
        return;
      }

      deadEnd('⚠️', '暂时无法发起验证', session.message,
        [detailLink('返回详情页', true), { text: '回首页看看别的', href: 'index.html' }]);
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
      '<span>剩余作答次数 ' + remaining + ' / ' + max + '</span></div>';
  }

  function optionHtml(question, index) {
    return '<label class="q-option">' +
      '<input type="radio" name="ans_' + esc(question.id) + '" value="' + index + '" ' +
        'data-qid="' + esc(question.id) + '">' +
      '<span class="q-option-text">' + esc(question.options[index]) + '</span>' +
      '</label>';
  }

  function questionHtml(question, index) {
    return '<div class="question-card" data-qid="' + esc(question.id) + '" data-type="' + esc(question.type) + '">' +
      '<div class="q-title"><i>Q' + (index + 1) + '</i><span>' + esc(question.stem) + '</span>' +
        '<span class="chip chip-lock">' + esc(question.typeName) + '</span></div>' +
      '<div class="q-options">' +
        question.options.map(function (option, optionIndex) {
          return optionHtml(question, optionIndex);
        }).join('') +
      '</div>' +
    '</div>';
  }

  function render() {
    var questions = session.questions;
    var mix = session.questionMix;

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
        '<span>发布者出了 <b>' + questions.length + ' 道验证题</b>（判断题 ' + mix.judge +
        ' 道 · 选择题 ' + mix.choice + ' 道）。' +
        '<span class="lk">请一次性填完全部题目再提交，全部答对才会显示发布者的联系方式并生成认领凭证。' +
        '系统统一判定，答错时不会告诉你是哪一题错。</span></span>' +
      '</div>' +

      '<div class="mt-16">' + attemptDots(session.remaining, session.maxAttempts) + '</div>' +

      questions.map(questionHtml).join('') +

      '<div class="quiz-progress text-small text-muted mt-12" id="answerProgress"></div>' +

      '<p class="text-small text-muted mt-12">' +
        '提交后答案仅用于与发布者设置的题目比对，不会展示给其他用户；' +
        '通过验证后你的昵称与联系方式会同步给发布者。' +
        '最多可以答 ' + session.maxAttempts + ' 次，3 次都没通过时可以提交申诉走人工审核。' +
      '</p>';

    ui.qsa('[data-qid]', contentEl).forEach(function (input) {
      input.addEventListener('change', updateProgress);
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

    updateProgress();
    ui.markReady({ page: 'verify', ok: 1, questions: questions.length });
  }

  /** 已答 / 未答的实时提示，省得提交时才被告知漏了题。 */
  function updateProgress() {
    var total = session.questions.length;
    var answered = collectAnswers().filter(function (item) { return item.answered; }).length;
    var el = ui.qs('#answerProgress');

    // 选中的选项高亮（不依赖 :has()，老一点的浏览器也能看出来选了什么）
    ui.qsa('.q-option', contentEl).forEach(function (label) {
      label.classList.toggle('is-picked', !!label.querySelector('input:checked'));
    });

    if (!el) return;

    var missing = total - answered;
    el.textContent = missing
      ? '已作答 ' + answered + ' / ' + total + ' 题，还有 ' + missing + ' 题没有选择'
      : '已作答 ' + total + ' / ' + total + ' 题，可以提交了';
    el.style.color = missing ? 'var(--ink-3)' : 'var(--green-d)';
  }

  /** 读回每一题的选择；没选的记 answered: false。 */
  function collectAnswers() {
    return session.questions.map(function (question) {
      var card = ui.qs('.question-card[data-qid="' + question.id + '"]', contentEl);
      var picked = card ? card.querySelector('input[type="radio"]:checked') : null;
      return {
        id: question.id,
        answered: !!picked,
        choice: picked ? Number(picked.value) : -1
      };
    });
  }

  // ---------------------------------------------------------------- 提交

  function submit() {
    var answers = collectAnswers();
    var missing = answers.filter(function (item) { return !item.answered; });

    if (missing.length) {
      ui.toast('还有 ' + missing.length + ' 道题没有选择', 'error');
      var firstCard = ui.qs('.question-card[data-qid="' + missing[0].id + '"]', contentEl);
      if (firstCard) {
        firstCard.scrollIntoView({ block: 'center', behavior: 'smooth' });
        var firstInput = firstCard.querySelector('input[type="radio"]');
        if (firstInput) firstInput.focus({ preventScroll: true });
      }
      return;
    }

    var btn = ui.qs('#submitBtn');
    btn.disabled = true;
    btn.textContent = '判定中…';

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
      canAppeal: !!result.canAppeal,
      questionCount: result.questionCount,
      correctCount: result.correctCount,
      voucher: result.voucher || '',
      contact: result.contact || null
    });

    U.go('verify-result', { id: postId, r: result.passed ? 'ok' : 'fail' });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
