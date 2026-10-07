/*!
 * 发布 / 编辑成功页
 *
 * 这个页面的作用不是"说一句成功了"，而是给用户一个确认：
 * 我填的东西长什么样、哪些内容被保护起来了、接下来该做什么。
 * 所以除了对勾，还要原样预览一遍公开出去的那张卡片。
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

  var postId = U.query('id');
  var isEdit = U.query('mode') === 'edit';
  var contentEl = ui.qs('#content');

  var post = postId ? store.get(postId, myId) : null;

  if (!post) {
    ui.qs('#barTitle').textContent = '找不到这条信息';
    ui.renderEmpty(contentEl, {
      icon: '🔎',
      title: '没有找到刚发布的信息',
      desc: '可能是链接不完整。可以到「我的发布」里查看你发布过的全部信息。',
      actions: [
        { text: '查看我的发布', href: 'mine.html', primary: true },
        { text: '返回首页', href: 'index.html' }
      ]
    });
    ui.markReady({ page: 'success', found: 0 });
    return;
  }

  var title = isEdit ? '修改已保存' : (post.type === 'found' ? '发布成功' : '发布成功');
  ui.qs('#barTitle').textContent = isEdit ? '保存结果' : '发布结果';
  root.document.title = title + ' · 校园失物招领';

  var desc = isEdit
    ? '你的' + post.typeName + '信息已经更新，首页和搜索结果里看到的都会是新内容。'
    : '你的' + post.typeName + '信息已经发布，公开信息所有同学都能看到。';

  var protectedTip = post.needVerify
    ? '<div class="lockbox mt-16">' +
        '<span class="ic">🔒</span>' +
        '<span>已设置 <b>' + post.questionCount + ' 道认领验证题</b>' +
        '（判断题 ' + post.questionMix.judge + ' 道 · 选择题 ' + post.questionMix.choice + ' 道）。' +
        '<span class="lk">题目和选项会在认领时展示给对方，但你指定的正确答案不会出现在任何页面里；' +
        '对方一次性答完全部题目、全部答对之后才能看到你的联系方式并生成认领凭证。' +
        '他最多能答 ' + LF.VERIFY.maxAttempts + ' 次，3 次都没答对可以提交申诉，由你人工判断。</span></span>' +
      '</div>'
    : '';

  var nextStep = post.type === 'found'
    ? '有人认领时，先看他有没有答对全部验证题，再约定地点交接；物归原主后记得回来把状态标记为「已归还」。'
    : '有人联系你说捡到了，同样建议先核对物品特征；东西找回来之后记得把状态标记为「已找到」，别人就不会再重复联系你了。';

  contentEl.innerHTML =
    '<div class="success-box">' +
      '<div class="tick">✓</div>' +
      '<h2>' + esc(title) + '</h2>' +
      '<p>' + esc(desc) + '</p>' +
    '</div>' +

    '<div class="panel mt-24">' +
      '<div class="section-head"><h2>公开展示的信息预览</h2></div>' +
      ui.cardHtml(post, { timePrefix: false }) +
      '<p class="text-small text-muted mt-12">其他同学在首页和搜索结果里看到的就是这张卡片，' +
      '点进去可以看到完整描述和地点。</p>' +
    '</div>' +

    protectedTip +

    '<div class="safe-tip mt-12"><span>💡</span><span>' + esc(nextStep) + '</span></div>' +

    '<div class="action-bar mt-24" style="position:static;padding:0;border:none;background:none">' +
      '<a class="btn btn-ghost" href="index.html">返回首页</a>' +
      '<a class="btn btn-ghost" href="detail.html?id=' + encodeURIComponent(post.id) + '">查看详情</a>' +
      '<a class="btn btn-primary" href="mine.html">查看我的发布</a>' +
    '</div>';

  // 预览卡片在这里只是给人看的，点它不应该跳走
  var previewCard = contentEl.querySelector('.card-link');
  if (previewCard) {
    previewCard.classList.remove('card-link');
    previewCard.removeAttribute('tabindex');
  }

  ui.markReady({ page: 'success', found: 1, verify: post.needVerify ? 1 : 0 });
})(typeof globalThis !== 'undefined' ? globalThis : this);
