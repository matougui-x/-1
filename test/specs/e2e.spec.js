/*!
 * 单元测试 —— 端到端串联（按作业要求的主流程走一遍）
 *
 * 前面几个文件都是按模块测的，这里把"发布信息 → 浏览/搜索 → 查看详情 →
 * 联系发布者 → 更新状态"整条链路串起来跑一遍，
 * 确认模块之间拼起来也是通的——很多 bug 只在拼接处出现。
 */
describe('主流程串联（发布 → 搜索 → 详情 → 认领 → 联系 → 标记完成）', function () {
  var root = typeof globalThis !== 'undefined' ? globalThis : this;
  var LF = root.LF;
  var T = root.T;

  var OWNER = 'owner_flow';
  var FINDER = 'finder_flow';

  it('完整走一遍"捡到校园卡 → 发布招领 → 失主搜到 → 答对特征 → 拿到联系方式 → 标记已归还"', function () {
    var store = T.makeStore();

    // 1. 捡到东西的同学发布招领信息，并设置只有失主知道的特征
    var created = store.create(T.validFound({
      title: '校园卡一张（卡面有小熊贴纸）',
      category: 'card',
      area: 'teaching',
      location: '教学楼 A 栋 301 教室',
      contactName: '张明远',
      contactWay: '微信：zhangmy2023',
      hidden: [
        { q: '卡面姓名', a: '王小明' },
        { q: '卡号后四位', a: '3882' }
      ]
    }), OWNER);
    assert.isTrue(created.ok, JSON.stringify(created.errors));
    var postId = created.post.id;

    // 2. 失主用关键词搜到了这条信息
    var found = store.list({ keyword: '校园卡', viewerId: FINDER });
    assert.lengthOf(found, 1, '失主应当能搜到这条信息');
    assert.strictEqual(found[0].id, postId);

    // 3. 打开详情：能看到物品描述，但看不到联系方式，也看不到答案
    var detail = store.get(postId, FINDER, true);
    assert.strictEqual(detail.views, 1, '看详情应当计入浏览量');
    assert.isTrue(detail.locked, '未验证前联系方式应当锁住');
    assert.strictEqual(detail.contactWay, '');
    assert.notInclude(JSON.stringify(detail), '王小明', '答案不得出现在详情数据里');
    assert.strictEqual(detail.contactName, '张**', '发布人姓名对访客打码');

    // 4. 失主发起认领，拿到要回答的题目
    var session = store.startClaim(postId);
    assert.isTrue(session.ok, session.message);
    assert.isNotEmpty(session.questions);
    assert.notInclude(JSON.stringify(session), '王小明', '题目里也不能带答案');

    // 5. 第一次答错——扣一次机会，仍然看不到联系方式
    var wrong = store.submitClaim(postId, { '卡面姓名': '李四', '卡号后四位': '1234' });
    assert.isFalse(wrong.passed);
    assert.strictEqual(wrong.remaining, LF.VERIFY.maxAttempts - 1);
    assert.lengthOf(wrong.failed, 2);
    assert.isTrue(store.get(postId, FINDER).locked, '答错之后仍然应当是锁定状态');

    // 6. 第二次答对——解锁联系方式，生成凭证码
    store.startClaim(postId);
    var right = store.submitClaim(postId, { '卡面姓名': '王小明', '卡号后四位': '3882' });
    assert.isTrue(right.passed, '答对应当通过');
    assert.match(right.voucher, /^CL-\d{4}-\d{4}$/);
    assert.strictEqual(right.contact.way, '微信：zhangmy2023');

    // 7. 之后再看详情，可以直接看到联系方式
    var unlockedDetail = store.get(postId, FINDER);
    assert.isFalse(unlockedDetail.locked);
    assert.strictEqual(unlockedDetail.contactWay, '微信：zhangmy2023');

    // 8. 东西还回去了，发布者标记为已归还
    var done = store.markDone(postId, OWNER);
    assert.isTrue(done.ok, JSON.stringify(done.errors));
    assert.strictEqual(done.post.statusLabel, '已归还');

    // 9. 其他同学在首页和搜索结果里都能看到"已归还"，不用再白跑一趟
    var listed = T.byId(store.list({ viewerId: 'someone_else' }), postId);
    assert.strictEqual(listed.statusLabel, '已归还');
    var searched = T.byId(store.list({ keyword: '校园卡', viewerId: 'someone_else' }), postId);
    assert.strictEqual(searched.statusLabel, '已归还');

    // 10. 发布者在"我的发布"里能看到这次认领的两条记录，一通过一未通过
    var claims = store.listClaims(postId, OWNER);
    assert.isTrue(claims.ok);
    assert.lengthOf(claims.claims, 2);
    assert.strictEqual(claims.claims.filter(function (c) { return c.passed; }).length, 1);
    assert.strictEqual(claims.claims.filter(function (c) { return !c.passed; }).length, 1);
  });

  it('寻物方向也走得通：丢了耳机 → 发布寻物 → 有人捡到 → 标记已找到', function () {
    var store = T.makeStore();

    var created = store.create(T.validLost({
      title: '黑色蓝牙耳机（带充电盒）',
      category: 'headphone',
      location: '图书馆三楼自习区'
    }), OWNER);
    assert.isTrue(created.ok, JSON.stringify(created.errors));

    // 寻物信息不需要验证，联系方式直接可见，捡到的人才能马上联系
    var view = store.get(created.post.id, FINDER);
    assert.isFalse(view.needVerify);
    assert.isFalse(view.locked);
    assert.strictEqual(view.contactWay, '手机：13800000000');
    assert.strictEqual(view.statusLabel, '寻找中');

    var done = store.markDone(created.post.id, OWNER);
    assert.strictEqual(done.post.statusLabel, '已找到');
  });

  it('发布者改主意把信息删掉之后，别人再搜就搜不到了', function () {
    var store = T.makeStore();
    var post = T.publishFound(store, OWNER);

    assert.lengthOf(store.list({ keyword: '校园卡' }), 1);
    assert.isTrue(store.remove(post.id, OWNER).ok);
    assert.lengthOf(store.list({ keyword: '校园卡' }), 0);
    assert.isNull(store.get(post.id, FINDER));
  });

  it('一条信息从发布到完成，浏览量、认领记录、状态三者互不干扰', function () {
    var store = T.makeStore();
    var post = T.publishFound(store, OWNER);

    store.get(post.id, FINDER, true);
    store.get(post.id, FINDER, true);
    store.startClaim(post.id);
    store.submitClaim(post.id, { '卡面姓名': '王小明', '卡号后四位': '3882' });

    var done = store.markDone(post.id, OWNER);
    assert.isTrue(done.ok);
    assert.strictEqual(done.post.views, 2, '标记完成不应影响浏览量');
    assert.strictEqual(done.post.claimCount, 1, '标记完成不应影响认领记录');

    var mine = T.byId(store.listMine(OWNER).done, post.id);
    assert.strictEqual(mine.views, 2);
    assert.strictEqual(mine.claimCount, 1);
  });
});
