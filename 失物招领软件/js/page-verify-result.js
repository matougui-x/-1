/*!
 * 认领结果页（验证通过 / 未通过）
 *
 * 通过时：给出认领凭证码 + 解锁后的联系方式，并提供一键复制。
 *
 * 未通过时：★ 只回一句统一提示「回答的细节与描述不符」，不告诉认领者是哪一题错。
 *   这是第二版方案里最关键的一条：一旦告诉了他错在哪题，他就能用"排除法"
 *   在 3 次机会内把答案试出来，限制次数就形同虚设。
 *   3 次机会用完（remaining = 0）时，这里才解锁【提交申诉】按钮，进入人工审核通道。
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
  var postId = U.query('id');
  var wantPassed = U.query('r') !== 'fail';

  var post = postId ? store.get(postId, myId) : null;
  var record = store.readLastClaim();

  ui.qs('#backLink').href = postId ? 'detail.html?id=' + encodeURIComponent(postId) : 'index.html';

  // 结果只在刚提交完的一小段时间内有效，避免下次直接打开这个链接看到旧结果
  var fresh = record && record.postId === postId && (Date.now() - record.at) < 10 * 60 * 1000;

  if (!post || !fresh || record.passed !== wantPassed) {
    ui.renderEmpty(contentEl, {
      icon: '🔎',
      title: '没有可以显示的验证结果',
      desc: '这个页面要在提交认领验证之后才会显示结果。回到信息详情页重新发起认领即可。',
      actions: postId
        ? [{ text: '返回信息详情', href: 'detail.html?id=' + encodeURIComponent(postId), primary: true }]
        : [{ text: '返回首页', href: 'index.html', primary: true }]
    });
    ui.markReady({ page: 'verify-result', ok: 0 });
    return;
  }

  if (record.passed) renderPassed(record);
  else renderFailed(record);

  ui.markReady({
    page: 'verify-result',
    passed: record.passed ? 1 : 0,
    remaining: record.remaining
  });

  // ---------------------------------------------------------------- 验证通过

  function renderPassed(data) {
    var contact = data.contact || { name: post.contactName, dept: post.contactDept, way: post.contactWay };
    var total = data.questionCount || post.questionCount;

    contentEl.innerHTML =
      '<div class="result-head is-ok">' +
        '<div class="tick">✓</div>' +
        '<h2>验证通过</h2>' +
        '<p>' + total + ' / ' + total + ' 道验证题全部答对，联系方式已解锁，' +
          '请尽快联系发布者完成线下交接。</p>' +
      '</div>' +

      '<div class="voucher mt-24">' +
        '<div>' +
          '<div class="lb">认领凭证码（线下出示）</div>' +
          '<div class="code">' + esc(data.voucher) + '</div>' +
        '</div>' +
        '<span class="chip chip-ok">已解锁</span>' +
      '</div>' +

      '<div class="info-rows mt-16">' +
        '<div class="info-row"><span class="k">物品</span>' +
          '<span class="v">' + esc(post.title) + '</span></div>' +
        '<div class="info-row"><span class="k">发布人</span>' +
          '<span class="v">' + esc(contact.name) +
          (contact.dept ? '<span class="sub">' + esc(contact.dept) + '</span>' : '') + '</span></div>' +
        '<div class="info-row"><span class="k">联系方式</span>' +
          '<span class="v" id="contactValue">' + esc(contact.way) + '</span></div>' +
        '<div class="info-row"><span class="k">' + (post.type === 'found' ? '拾取地点' : '丢失地点') + '</span>' +
          '<span class="v">' + esc(post.location) +
          '<span class="sub">交接前请先和发布者约定时间</span></span></div>' +
        '<div class="info-row"><span class="k">已答对</span>' +
          '<span class="v">' + total + ' 道验证题（判断题 ' + post.questionMix.judge +
          ' · 选择题 ' + post.questionMix.choice + '）</span></div>' +
      '</div>' +

      '<div class="safe-tip mt-16"><span>🔒</span>' +
        '<span>请携带本人学生证或身份证领取；凭证码仅你自己可见，请勿转发他人。' +
        '建议约在图书馆、宿舍楼下等公共场所见面。</span></div>' +

      '<p class="text-small text-muted mt-12">通过验证后你提交的选项不会公开，' +
        '其他同学仍然要自己答对全部题目才能看到发布者的联系方式。</p>' +

      '<div class="action-bar mt-24" style="position:static;padding:0;border:none;background:none">' +
        '<a class="btn btn-ghost" href="index.html">返回首页</a>' +
        '<a class="btn btn-ghost" href="detail.html?id=' + encodeURIComponent(postId) + '">返回详情</a>' +
        '<button type="button" class="btn btn-primary" id="copyContact">复制联系方式</button>' +
      '</div>';

    // 复制按钮留在本页给反馈，不跳走
    ui.qs('#copyContact').addEventListener('click', function () {
      ui.copyWithToast(contact.way, '联系方式已复制：' + contact.way);
    });
  }

  // ---------------------------------------------------------------- 验证未通过

  function renderFailed(data) {
    var left = Number(data.remaining);
    if (isNaN(left)) left = post.attemptsLeft;
    var locked = left <= 0;
    var myAppeal = post.myAppeal;

    var appealBlock = '';
    if (locked) {
      if (!myAppeal) {
        appealBlock = '<div class="lockbox mt-16"><span class="ic">📮</span>' +
          '<span>3 次作答机会已经用完，【提交申诉】按钮已经解锁。' +
          '把你能提供的物品细节写清楚，发布者会人工判断是否把物品交还给你。' +
          '<span class="lk">如果这件物品确实不是你的，请不要提交申诉，把机会留给真正的失主。</span></span></div>';
      } else if (myAppeal.decision === 'pending') {
        appealBlock = '<div class="lockbox mt-16"><span class="ic">⏳</span>' +
          '<span>你已经提交过申诉，正在等待发布者人工审核。' +
          '<span class="lk">审核结果会显示在申诉页面里，也可以回来重新打开本页查看。</span></span></div>';
      } else if (myAppeal.decision === 'approved') {
        appealBlock = '<div class="lockbox mt-16"><span class="ic">✅</span>' +
          '<span>发布者已经<b>同意</b>你的申诉' +
          (myAppeal.note ? '，留言：' + esc(myAppeal.note) : '') + '。' +
          '联系方式已经解锁，回到详情页就能看到。' +
          (myAppeal.voucher ? '<span class="lk">线下交接编号：' + esc(myAppeal.voucher) + '</span>' : '') +
          '</span></div>';
      } else {
        appealBlock = '<div class="lockbox mt-16"><span class="ic">❌</span>' +
          '<span>发布者<b>驳回了</b>这次申诉' +
          (myAppeal.note ? '，给出的说明是：' + esc(myAppeal.note) : '') + '。' +
          '<span class="lk">如果你认为判断有误，可以和发布者当面沟通，或向学校保卫处等渠道求助。</span></span></div>';
      }
    } else {
      appealBlock = '<div class="lockbox mt-16"><span class="ic">↺</span>' +
        '<span>你还可以再答 <b>' + left + ' 次</b>（一共 ' + (data.maxAttempts || LF.VERIFY.maxAttempts) +
        ' 次）。3 次机会全部用完仍然没有通过时，可以提交申诉，由发布者人工判断。' +
        '<span class="lk">提示：先回想清楚这件物品的细节再作答，避免把机会浪费掉。</span></span></div>';
    }

    contentEl.innerHTML =
      '<div class="result-head is-bad">' +
        '<div class="tick">!</div>' +
        '<h2>验证未通过</h2>' +
        '<p class="fail-reason">回答的细节与描述不符</p>' +
      '</div>' +

      '<p class="text-small text-muted mt-12 text-center">' +
        '为了保证公平，系统不会告诉你是哪一题答错了——否则反复试几次就能把答案试出来。' +
        '为保护物主隐私，联系方式暂不显示。</p>' +

      appealBlock +

      '<div class="safe-tip is-warn mt-12"><span>⚠️</span>' +
        '<span>若这件物品并不属于你，请勿反复尝试，把认领机会留给失主。</span></div>' +

      '<p class="text-small text-muted mt-12">也有可能是你和发布者对物品的理解不一样，' +
        '比如"深蓝色"和"藏青"。这种情况走人工审核往往更快。</p>' +

      '<div class="action-bar mt-24" style="position:static;padding:0;border:none;background:none">' +
        '<a class="btn btn-ghost" href="detail.html?id=' + encodeURIComponent(postId) + '">返回详情</a>' +
        (locked
          ? (myAppeal && myAppeal.decision === 'pending'
              ? '<a class="btn btn-primary" href="appeal.html?id=' + encodeURIComponent(postId) + '">查看我的申诉</a>'
              : '<a class="btn btn-primary" href="appeal.html?id=' + encodeURIComponent(postId) + '">提交申诉</a>')
          : '<a class="btn btn-ghost" href="search.html?q=' + encodeURIComponent(post.title) + '">搜索同类信息</a>' +
            '<a class="btn btn-primary" href="verify.html?id=' + encodeURIComponent(postId) + '">重新作答</a>') +
      '</div>';
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
