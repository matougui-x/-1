/*!
 * 单元测试 —— 验证题答案不外泄、状态流转、发布者权限
 *
 * 这三块放在一起测，是因为它们共同决定了"这条信息可不可信"：
 *   - 正确答案泄露 → 冒领变得毫无成本，整个防冒领设计作废；
 *   - 状态流转出错 → 别人白跑一趟，正是需求里要解决的痛点；
 *   - 权限校验缺失 → 谁都能改别人的信息，数据不可信。
 */
describe('隐私保护：验证题答案不外泄', function () {
  var root = typeof globalThis !== 'undefined' ? globalThis : this;
  var LF = root.LF;
  var T = root.T;

  var OWNER = 'owner_1';
  var OTHER = 'other_1';

  describe('公开视图 toPublic', function () {
    it('公开视图里根本没有 hidden / claims / appeals 字段', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);
      var view = store.get(post.id, OTHER);

      assert.notProperty(view, 'hidden', '旧版答案字段不该再出现');
      assert.notProperty(view, 'pendingClaim');
      assert.notProperty(view, 'claims', '认领记录属于发布者，不能随信息公开');
      assert.notProperty(view, 'appeals', '申诉人的联系方式更不能公开');
      assert.notProperty(view, 'ownerId', '本机 uid 不应交给页面');
    });

    it('题目对外只有题干和选项，没有 answer', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);
      var view = store.get(post.id, OTHER);

      assert.strictEqual(view.questionCount, 4);
      assert.strictEqual(view.questionMix.judge, 2);
      assert.lengthOf(view.questions, 4);
      view.questions.forEach(function (question) {
        assert.notProperty(question, 'answer', '正确答案的下标绝不能下发');
        assert.isArray(question.options);
        assert.isString(question.stem);
      });

      var serialized = JSON.stringify(view);
      assert.notInclude(serialized, 'answer');
      assert.notInclude(serialized, '张明远', '完整姓名不应出现在公开视图');
    });

    it('未通过验证的浏览者拿不到联系方式', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);
      var view = store.get(post.id, OTHER);
      assert.isTrue(view.locked);
      assert.strictEqual(view.contactWay, '');
    });

    it('发布者本人始终能看到自己填的联系方式', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);
      var view = store.get(post.id, OWNER);
      assert.isFalse(view.locked);
      assert.strictEqual(view.contactWay, '微信：zhangmy2023');
      assert.isTrue(view.isOwner);
    });

    it('不需要验证的寻物信息，联系方式对所有人可见', function () {
      var store = T.makeStore();
      var post = T.publishLost(store, OWNER);
      var view = store.get(post.id, OTHER);
      assert.isFalse(view.locked);
      assert.strictEqual(view.contactWay, '手机：13800000000');
    });

    it('列表页返回的每一条都不会带出正确答案', function () {
      var store = T.makeStore();
      T.publishFound(store, OWNER);
      T.publishFound(store, OWNER, { title: '另一张校园卡' });

      var list = store.list({ viewerId: OTHER });
      assert.lengthOf(list, 2);
      list.forEach(function (item) {
        item.questions.forEach(function (question) {
          assert.notProperty(question, 'answer');
        });
      });
      assert.notInclude(JSON.stringify(list), '"answer"');
    });

    it('搜索结果同样不会带出正确答案与作答明细', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);
      store.submitClaim(post.id, T.answers(['q1']));   // 先产生一条认领记录

      var list = store.list({ keyword: '校园卡', viewerId: OTHER });
      assert.lengthOf(list, 1);
      var serialized = JSON.stringify(list);
      assert.notInclude(serialized, '"answer"', '正确答案下标不能进公开数据');
      assert.notInclude(serialized, '"correct"', '作答明细不能进公开数据');
      assert.notInclude(serialized, '"claims"');
    });

    it('发布人姓名对非发布者是打码的，对发布者本人是完整的', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);

      var other = store.get(post.id, OTHER);
      assert.strictEqual(other.contactName, '张**');
      assert.notInclude(JSON.stringify(other), '张明远', '完整姓名不应出现在公开视图');

      assert.strictEqual(store.get(post.id, OWNER).contactName, '张明远');
    });
  });

  describe('姓名打码规则', function () {
    it('三个字 → 首字 + 两个星号', function () {
      assert.strictEqual(LF.maskName('张明远'), '张**');
    });
    it('两个字 → 首字 + 一个星号', function () {
      assert.strictEqual(LF.maskName('张三'), '张*');
    });
    it('一个字原样返回', function () {
      assert.strictEqual(LF.maskName('张'), '张');
    });
    it('空值返回匿名同学', function () {
      assert.strictEqual(LF.maskName(''), '匿名同学');
      assert.strictEqual(LF.maskName(null), '匿名同学');
    });
  });
});

describe('状态维护：已找到 / 已归还', function () {
  var root = typeof globalThis !== 'undefined' ? globalThis : this;
  var LF = root.LF;
  var T = root.T;

  var OWNER = 'owner_1';
  var OTHER = 'other_1';

  describe('招领信息标记已归还', function () {
    it('发布后初始状态是进行中', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);
      assert.strictEqual(post.status, 'open');
      assert.strictEqual(post.statusLabel, '待认领');
      assert.strictEqual(post.doneType, null);
    });

    it('标记后状态变为已完成，doneType 是 returned', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);

      var result = store.markDone(post.id, OWNER);
      assert.isTrue(result.ok, JSON.stringify(result.errors));
      assert.strictEqual(result.post.status, 'done');
      assert.strictEqual(result.post.doneType, 'returned');
      assert.strictEqual(result.post.doneLabel, '已归还');
      assert.strictEqual(result.post.statusLabel, '已归还');
      assert.isNotNull(result.post.doneAt);
    });

    it('标记后别人在列表和搜索里都能看到已完成', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);
      store.markDone(post.id, OWNER);

      var inList = T.byId(store.list({ viewerId: OTHER }), post.id);
      assert.strictEqual(inList.statusLabel, '已归还');

      var searched = T.byId(store.list({ keyword: '校园卡', viewerId: OTHER }), post.id);
      assert.strictEqual(searched.statusLabel, '已归还');
    });

    it('重复标记不会出错，也不会改动已完成时间', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);
      var first = store.markDone(post.id, OWNER);
      var second = store.markDone(post.id, OWNER);
      assert.isTrue(second.ok);
      assert.isTrue(second.unchanged, '第二次调用应当识别为无变化');
      assert.strictEqual(second.post.doneAt, first.post.doneAt);
    });

    it('可以撤回，重新回到待认领', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);
      store.markDone(post.id, OWNER);

      var result = store.reopen(post.id, OWNER);
      assert.isTrue(result.ok);
      assert.strictEqual(result.post.status, 'open');
      assert.strictEqual(result.post.doneType, null);
      assert.strictEqual(result.post.doneAt, null);
      assert.strictEqual(result.post.statusLabel, '待认领');
    });
  });

  describe('寻物信息标记已找到', function () {
    it('状态文案用的是"已找到"而不是"已归还"', function () {
      var store = T.makeStore();
      var post = T.publishLost(store, OWNER);

      var result = store.markDone(post.id, OWNER);
      assert.strictEqual(result.post.doneType, 'found');
      assert.strictEqual(result.post.statusLabel, '已找到');
    });

    it('寻物信息进行中的文案是"寻找中"', function () {
      var store = T.makeStore();
      var post = T.publishLost(store, OWNER);
      assert.strictEqual(post.statusLabel, '寻找中');
    });
  });

  describe('权限：只有发布者能改自己的信息', function () {
    it('别人不能标记我的信息为已完成', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);

      var result = store.markDone(post.id, OTHER);
      assert.isFalse(result.ok);
      assert.match(result.errors._, /只有发布者/);
      assert.strictEqual(store.get(post.id, OWNER).status, 'open', '状态不应被改动');
    });

    it('别人不能编辑我的信息', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);

      var result = store.update(post.id, { title: '被改掉的标题' }, OTHER);
      assert.isFalse(result.ok);
      assert.match(result.errors._, /只有发布者/);
      assert.strictEqual(store.get(post.id, OWNER).title, '校园卡一张');
    });

    it('别人不能删除我的信息', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);

      var result = store.remove(post.id, OTHER);
      assert.isFalse(result.ok);
      assert.isTrue(store.exists(post.id));
    });

    it('别人不能查看我收到的认领申请', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);
      var result = store.listClaims(post.id, OTHER);
      assert.isFalse(result.ok);
      assert.match(result.message, /只有发布者/);
    });

    it('没有身份标识的请求一律被拒绝', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);
      assert.isFalse(store.markDone(post.id, '').ok);
      assert.isFalse(store.remove(post.id, null).ok);
      assert.isFalse(store.update(post.id, { title: '随便改改' }, undefined).ok);
    });
  });

  describe('编辑与删除', function () {
    it('编辑后 id、发布时间、浏览量、归属都保持不变', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);
      store.bumpView(post.id);
      store.bumpView(post.id);

      var result = store.update(post.id, { title: '校园卡一张（已更新）' }, OWNER);
      assert.isTrue(result.ok, JSON.stringify(result.errors));
      assert.strictEqual(result.post.id, post.id);
      assert.strictEqual(result.post.createdAt, post.createdAt);
      assert.strictEqual(result.post.views, 2);
      assert.strictEqual(result.post.title, '校园卡一张（已更新）');
    });

    it('即使前端偷偷传了 id 和浏览量，也不会覆盖原值', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);

      var result = store.update(post.id, {
        title: '新标题',
        id: '伪造的id',
        views: 9999,
        ownerId: '黑客',
        createdAt: 0
      }, OWNER);

      assert.isTrue(result.ok);
      assert.strictEqual(result.post.id, post.id);
      assert.strictEqual(result.post.views, 0);
      assert.strictEqual(T.rawPost(store, post.id).ownerId, OWNER);
    });

    it('编辑时同样要过校验，填错不会写进存储', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);

      var result = store.update(post.id, { title: '' }, OWNER);
      assert.isFalse(result.ok);
      assert.property(result.errors, 'title');
      assert.strictEqual(store.get(post.id, OWNER).title, '校园卡一张');
    });

    it('把招领改成寻物后，验证题会被清掉', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);
      var result = store.update(post.id, { type: 'lost' }, OWNER);
      assert.isTrue(result.ok, JSON.stringify(result.errors));
      assert.strictEqual(result.post.questionCount, 0);
      assert.isFalse(result.post.needVerify);
    });

    it('删除之后就查不到了，列表和搜索里都没有', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);

      assert.isTrue(store.remove(post.id, OWNER).ok);
      assert.isFalse(store.exists(post.id));
      assert.isNull(store.get(post.id, OWNER));
      assert.lengthOf(store.list({ keyword: '校园卡' }), 0);
    });

    it('删除不存在的 id 会给出可读提示', function () {
      var store = T.makeStore();
      var result = store.remove('不存在的id', OWNER);
      assert.isFalse(result.ok);
      assert.match(result.errors._, /不存在|已删除/);
    });

    it('删除后本机对该信息的解锁记录也一并清掉', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);
      store.markUnlocked(post.id, 'CL-2026-1111');
      assert.isTrue(store.isUnlocked(post.id));

      store.remove(post.id, OWNER);
      assert.isFalse(store.isUnlocked(post.id));
    });
  });

  describe('我的发布', function () {
    it('按进行中与已完成分成两组', function () {
      var store = T.makeStore();
      T.publishFound(store, OWNER, { title: '还在等认领' });
      var done = T.publishLost(store, OWNER, { title: '已经找到了' });
      store.markDone(done.id, OWNER);

      var mine = store.listMine(OWNER);
      assert.lengthOf(mine.open, 1);
      assert.lengthOf(mine.done, 1);
      assert.strictEqual(mine.open[0].title, '还在等认领');
      assert.strictEqual(mine.done[0].title, '已经找到了');
    });

    it('不会混进别人发布的信息', function () {
      var store = T.makeStore();
      T.publishFound(store, OWNER);
      T.publishFound(store, OTHER, { title: '别人的信息' });

      var mine = store.listMine(OWNER);
      assert.lengthOf(mine.open, 1);
      assert.notInclude(mine.open.map(function (p) { return p.title; }), '别人的信息');
    });

    it('还没有发布过任何信息时返回两个空数组', function () {
      var store = T.makeStore();
      var mine = store.listMine('从来没发过的人');
      assert.isArray(mine.open);
      assert.isArray(mine.done);
      assert.lengthOf(mine.open, 0);
      assert.lengthOf(mine.done, 0);
    });

    it('自己能看到自己信息收到的认领次数统计', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);
      var mine = T.byId(store.listMine(OWNER).open, post.id);
      assert.strictEqual(mine.claimCount, 0);
      assert.strictEqual(mine.claimPassed, 0);
    });
  });

  describe('统计信息', function () {
    it('总数、进行中、已完成、寻物、招领都统计正确', function () {
      var store = T.makeStore();
      T.publishFound(store, OWNER);
      T.publishFound(store, OWNER);
      var lost = T.publishLost(store, OTHER);
      store.markDone(lost.id, OTHER);

      var stats = store.stats();
      assert.strictEqual(stats.total, 3);
      assert.strictEqual(stats.open, 2);
      assert.strictEqual(stats.done, 1);
      assert.strictEqual(stats.lost, 1);
      assert.strictEqual(stats.found, 2);
    });
  });
});
