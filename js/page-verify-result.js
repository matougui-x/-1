/*!
 * 认领结果页（验证通过 / 未通过）
 *
 * 通过时：给出认领凭证码 + 解锁后的联系方式，并提供一键复制。
 *         （第一次作业的原型里这个"复制联系方式"按钮点下去跳到了「我的」，
 *          语义上不对——这里改成留在原页复制并弹提示。）
 * 未通过时：明确告诉用户是哪几项答错了、还剩几次机会，以及什么是"人工核对"。
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

    contentEl.innerHTML =
      '<div class="result-head is-ok">' +
        '<div class="tick">✓</div>' +
        '<h2>验证通过</h2>' +
        '<p>' + data.verifiedLabels.length + ' / ' + data.verifiedLabels.length +
          ' 个隐藏特征回答正确，联系方式已解锁，请尽快联系发布者完成线下交接。</p>' +
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
        '<div class="info-row"><span class="k">已校验特征</span>' +
          '<span class="v">' + esc(data.verifiedLabels.join('、')) + '</span></div>' +
      '</div>' +

      '<div class="safe-tip mt-16"><span>🔒</span>' +
        '<span>请携带本人学生证或身份证领取；凭证码仅你自己可见，请勿转发他人。' +
        '建议约在图书馆、宿舍楼下等公共场所见面。</span></div>' +

      '<p class="text-small text-muted mt-12">通过验证后你提交的答案不会公开，' +
        '其他同学仍然无法看到这些隐藏特征。</p>' +

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
    var left = data.remaining;
    var locked = left <= 0;

    var answerRows = (data.failed || []).map(function (item) {
      return '<div class="r">' +
        '<span class="k">' + esc(item.q) + '</span>' +
        '<span class="v bad">' + esc(item.input || '（未填）') + ' ✕</span>' +
        '</div>';
    }).join('');

    contentEl.innerHTML =
      '<div class="result-head is-bad">' +
        '<div class="tick">!</div>' +
        '<h2>验证未通过</h2>' +
        '<p>你提交的答案与发布者设置的隐藏特征不一致。为保护物主隐私，联系方式暂不显示。</p>' +
      '</div>' +

      (answerRows
        ? '<div class="answer-list panel mt-24" style="padding:6px 16px">' + answerRows + '</div>'
        : '') +

      (locked
        ? '<div class="lockbox mt-16"><span class="ic">↺</span>' +
            '<span>尝试次数已经用完。你可以点击「申请人工核对」，' +
            '把自己知道的物品细节告诉发布者，由他来判断是否归还。' +
            '<span class="lk">如果这件物品确实不是你的，请不要再尝试，把机会留给真正的失主。</span></span></div>'
        : '<div class="lockbox mt-16"><span class="ic">↺</span>' +
            '<span>你还可以再尝试 <b>' + left + ' 次</b>。' +
            '把机会用完之后，可以申请人工核对，由发布者直接判断。' +
            '<span class="lk">提示：先回想一下物品的细节再作答，避免反复尝试。</span></span></div>') +

      '<div class="safe-tip is-warn mt-12"><span>⚠️</span>' +
        '<span>若这件物品并不属于你，请勿反复尝试，把认领机会留给失主。</span></div>' +

      '<p class="text-small text-muted mt-12">也有可能是发布者填写的答案和你记忆中的说法不一样，' +
        '比如"深蓝色"和"藏青"。这种情况下人工核对往往更快。</p>' +

      '<div class="action-bar mt-24" style="position:static;padding:0;border:none;background:none">' +
        '<a class="btn btn-ghost" href="detail.html?id=' + encodeURIComponent(postId) + '">返回详情</a>' +
        (locked
          ? '<a class="btn btn-ghost" href="search.html?q=' + encodeURIComponent(post.title) + '">搜索同类信息</a>'
          : '<a class="btn btn-ghost" href="verify.html?id=' + encodeURIComponent(postId) + '">重新回答</a>') +
        '<button type="button" class="btn btn-primary" id="manualBtn">申请人工核对</button>' +
      '</div>';

    ui.qs('#manualBtn').addEventListener('click', showManualCheck);
  }

  /** 人工核对：把"该告诉发布者什么"讲清楚，并给一条复制好的说明。 */
  function showManualCheck() {
    var template = '你好，我认领「' + post.title + '」时没通过验证。' +
      '我想补充一些我能说清的细节：\n' +
      '1. \n2. \n' +
      '如果方便的话，能否请你判断一下？谢谢。';

    ui.modal({
      title: '申请人工核对',
      bodyHtml:
        '<p style="margin-bottom:10px">认领验证只能比对预先设置好的那几项特征，' +
        '有时候你记得的细节和发布者写的不完全一样，机器判不出来。这种时候人工核对更靠谱。</p>' +
        '<p style="margin-bottom:10px"><b>你可以这样联系发布者：</b>先把下面这段说明复制下来，' +
        '补上你记得的物品细节，再通过班级群、同学转达等方式发给发布者。</p>' +
        '<textarea class="textarea" readonly style="height:112px;font-size:12.5px">' +
        esc(template) + '</textarea>',
      buttons: [
        {
          text: '复制这段说明',
          onClick: function (close) {
            ui.copyWithToast(template, '已复制，补上细节后发给发布者即可');
            close();
          }
        },
        { text: '知道了', primary: true }
      ]
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
