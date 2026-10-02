/*!
 * 单元测试 —— 认领验证（防止冒领）
 *
 * 这是本项目最有价值也最容易写错的一块：既要拦住冒领的人，
 * 又不能让真正的失主被误伤。所以除了"答对通过、答错不通过"这两条主线，
 * 还要重点测：
 *   - 抽题是否真的随机且不重复（否则每次都问同一题，试探成本变低）；
 *   - 答案归一化是否够宽容（"王小明"和"王 小明。"必须算同一个答案）；
 *   - 尝试次数是否会被绕过（自己拼一组题提交、重复提交同一题）。
 */
describe('认领验证', function () {
  var root = typeof globalThis !== 'undefined' ? globalThis : this;
  var LF = root.LF;
  var T = root.T;

  var OWNER = 'owner_1';
  var CLAIMER = 'claimer_1';

  /** 一条有三项隐藏特征的招领信息。 */
  function makeVerifyStore() {
    var store = T.makeStore();
    var post = T.publishFound(store, OWNER, {
      hidden: [
        { q: '卡面姓名', a: '王小明' },
        { q: '卡号后四位', a: '3882' },
        { q: '卡面标记', a: '蓝色小熊贴纸' }
      ]
    });
    return { store: store, post: post };
  }

  describe('抽题 startClaim', function () {
    it('返回两道题，且题目来自发布者设置的隐藏特征', function () {
      var ctx = makeVerifyStore();
      var start = ctx.store.startClaim(ctx.post.id);

      assert.isTrue(start.ok, start.message);
      assert.lengthOf(start.questions, LF.VERIFY.pickCount);
      start.questions.forEach(function (item) {
        assert.include(['卡面姓名', '卡号后四位', '卡面标记'], item.q);
      });
    });

    it('返回的题目里不含答案', function () {
      var ctx = makeVerifyStore();
      var start = ctx.store.startClaim(ctx.post.id);
      var serialized = JSON.stringify(start);
      assert.notInclude(serialized, '王小明');
      assert.notInclude(serialized, '3882');
      assert.notInclude(serialized, '蓝色小熊贴纸');
    });

    it('题目带上了完整的问句，可以直接显示', function () {
      var ctx = makeVerifyStore();
      var start = ctx.store.startClaim(ctx.post.id);
      assert.match(start.questions[0].ask, /？$/);
    });

    it('每次抽到的题目不重复', function () {
      var ctx = makeVerifyStore();
      var start = ctx.store.startClaim(ctx.post.id);
      var names = start.questions.map(function (item) { return item.q; });
      assert.lengthOf(LF.utils.unique(names), names.length);
    });

    it('隐藏特征只有两项时，两道题就是把两项都问一遍', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);   // 默认两项隐藏特征
      var start = store.startClaim(post.id);
      assert.lengthOf(start.questions, 2);
      // 用集合比较，避开中文按 UTF-16 码点排序带来的顺序干扰
      assert.sameMembers(
        start.questions.map(function (i) { return i.q; }),
        ['卡面姓名', '卡号后四位']
      );
    });

    it('随机源不同时抽到的题目也不同（证明抽题确实随机）', function () {
      var store = T.makeStore({ random: function () { return 0.99; } });
      var post = T.publishFound(store, OWNER, {
        hidden: [
          { q: '卡面姓名', a: '王小明' },
          { q: '卡号后四位', a: '3882' },
          { q: '卡面标记', a: '蓝色小熊贴纸' }
        ]
      });
      var start = store.startClaim(post.id);
      assert.lengthOf(start.questions, 2);
      assert.include(start.questions.map(function (i) { return i.q; }), '卡面标记');
    });

    it('不需要验证的寻物信息不能发起认领', function () {
      var store = T.makeStore();
      var post = T.publishLost(store, OWNER);
      var start = store.startClaim(post.id);
      assert.isFalse(start.ok);
      assert.match(start.message, /不需要验证/);
    });

    it('已完成的信息不能再认领', function () {
      var ctx = makeVerifyStore();
      ctx.store.markDone(ctx.post.id, OWNER);
      var start = ctx.store.startClaim(ctx.post.id);
      assert.isFalse(start.ok);
      assert.match(start.message, /已完成/);
    });

    it('信息不存在时给出可读提示', function () {
      var ctx = makeVerifyStore();
      var start = ctx.store.startClaim('不存在的id');
      assert.isFalse(start.ok);
      assert.match(start.message, /不存在|已删除/);
    });
  });

  describe('提交答案 submitClaim', function () {
    it('两题全对时通过，返回凭证码与发布者联系方式', function () {
      var ctx = makeVerifyStore();
      ctx.store.startClaim(ctx.post.id);

      var result = ctx.store.submitClaim(ctx.post.id, {
        '卡面姓名': '王小明',
        '卡号后四位': '3882'
      });

      assert.isTrue(result.ok, result.message);
      assert.isTrue(result.passed);
      assert.match(result.voucher, /^CL-2026-\d{4}$/);
      assert.strictEqual(result.contact.way, '微信：zhangmy2023');
      assert.strictEqual(result.contact.name, '张明远');
      assert.deepEqual(result.verifiedLabels, ['卡面姓名', '卡号后四位']);
    });

    it('凭证码符合 CL-四位年份-四位编号 的格式', function () {
      var ctx = makeVerifyStore();
      ctx.store.startClaim(ctx.post.id);
      var result = ctx.store.submitClaim(ctx.post.id, { '卡面姓名': '王小明', '卡号后四位': '3882' });
      assert.match(result.voucher, /^CL-\d{4}-\d{4}$/);
    });

    it('答错一题就不通过，并告诉你是哪一题错了', function () {
      var ctx = makeVerifyStore();
      ctx.store.startClaim(ctx.post.id);

      var result = ctx.store.submitClaim(ctx.post.id, {
        '卡面姓名': '王小明',
        '卡号后四位': '0000'
      });

      assert.isTrue(result.ok);
      assert.isFalse(result.passed);
      assert.lengthOf(result.failed, 1);
      assert.strictEqual(result.failed[0].q, '卡号后四位');
      assert.notProperty(result, 'voucher');
    });

    it('答错后剩余尝试次数减一', function () {
      var ctx = makeVerifyStore();
      ctx.store.startClaim(ctx.post.id);
      var result = ctx.store.submitClaim(ctx.post.id, { '卡面姓名': '错的', '卡号后四位': '错的' });
      assert.strictEqual(result.remaining, LF.VERIFY.maxAttempts - 1);
      assert.strictEqual(result.maxAttempts, LF.VERIFY.maxAttempts);
    });

    it('答案为空串算答错', function () {
      var ctx = makeVerifyStore();
      ctx.store.startClaim(ctx.post.id);
      var result = ctx.store.submitClaim(ctx.post.id, { '卡面姓名': '', '卡号后四位': '' });
      assert.isFalse(result.passed);
      assert.lengthOf(result.failed, 2);
    });

    it('没有先抽题就提交会被拒绝（防止自己拼题目试探答案）', function () {
      var ctx = makeVerifyStore();
      var result = ctx.store.submitClaim(ctx.post.id, { '卡面姓名': '王小明', '卡号后四位': '3882' });
      assert.isFalse(result.ok);
      assert.match(result.message, /重新进入/);
    });

    it('提交过一次之后本次抽题作废，想再答必须重新抽题', function () {
      var ctx = makeVerifyStore();
      ctx.store.startClaim(ctx.post.id);
      ctx.store.submitClaim(ctx.post.id, { '卡面姓名': '错的', '卡号后四位': '错的' });

      // 上一次的 pendingClaim 已经清掉，直接再提交应当被要求重新抽题
      var again = ctx.store.submitClaim(ctx.post.id, { '卡面姓名': '王小明', '卡号后四位': '3882' });
      assert.isFalse(again.ok);
      assert.match(again.message, /重新进入/);
    });

    it('把没被问到的题也一起提交，不会因此获得通过', function () {
      var store = T.makeStore({ random: function () { return 0; } });
      var post = T.publishFound(store, OWNER, {
        hidden: [
          { q: '卡面姓名', a: '王小明' },
          { q: '卡号后四位', a: '3882' },
          { q: '卡面标记', a: '蓝色小熊贴纸' }
        ]
      });
      store.startClaim(post.id);   // 固定随机源下只会问到前两项

      var result = store.submitClaim(post.id, {
        '卡面姓名': '错的',
        '卡号后四位': '3882',
        '卡面标记': '蓝色小熊贴纸'   // 没被问到的题，答对也没用
      });

      assert.isFalse(result.passed, '只有被抽中的题目才应参与判定');
      assert.lengthOf(result.failed, 1);
      assert.strictEqual(result.failed[0].q, '卡面姓名');
    });
  });

  describe('答案归一化：对失主要宽容', function () {
    function submitWith(answer) {
      var ctx = makeVerifyStore();
      ctx.store.startClaim(ctx.post.id);
      return ctx.store.submitClaim(ctx.post.id, { '卡面姓名': answer, '卡号后四位': '3882' });
    }

    it('答案前后的空格不影响判定', function () {
      assert.isTrue(submitWith('  王小明  ').passed);
    });

    it('答案中间夹了空格也算对', function () {
      assert.isTrue(submitWith('王 小明').passed);
    });

    it('全角字母数字与半角等价', function () {
      var ctx = makeVerifyStore();
      ctx.store.startClaim(ctx.post.id);
      var result = ctx.store.submitClaim(ctx.post.id, { '卡面姓名': '王小明', '卡号后四位': '３８８２' });
      assert.isTrue(result.passed, '全角数字应当被判为正确');
    });

    it('结尾多打了句号也算对', function () {
      assert.isTrue(submitWith('王小明。').passed);
    });

    it('英文答案忽略大小写', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER, {
        hidden: [
          { q: '品牌型号', a: 'AirPods Pro' },
          { q: '颜色特征', a: '白色' }
        ]
      });
      store.startClaim(post.id);
      var result = store.submitClaim(post.id, { '品牌型号': 'airpods pro', '颜色特征': '白色' });
      assert.isTrue(result.passed);
    });

    it('答案确实不同时不放水', function () {
      assert.isFalse(submitWith('王小明同学').passed, '包含关系不等于相等');
      assert.isFalse(submitWith('小明王').passed, '顺序不同不算对');
      assert.isFalse(submitWith('李小明').passed);
    });
  });

  describe('尝试次数与锁定', function () {
    function failOnce(store, id) {
      store.startClaim(id);
      return store.submitClaim(id, { '卡面姓名': '错的', '卡号后四位': '错的' });
    }

    it('连续答错 3 次后进入锁定状态', function () {
      var ctx = makeVerifyStore();
      var r1 = failOnce(ctx.store, ctx.post.id);
      assert.isFalse(r1.locked, '第 1 次失败还不应锁定');
      var r2 = failOnce(ctx.store, ctx.post.id);
      assert.isFalse(r2.locked, '第 2 次失败还不应锁定');
      var r3 = failOnce(ctx.store, ctx.post.id);
      assert.isTrue(r3.locked, '第 3 次失败后应当锁定');
      assert.strictEqual(r3.remaining, 0);
    });

    it('锁定之后即使答案全对也不能再通过', function () {
      var ctx = makeVerifyStore();
      failOnce(ctx.store, ctx.post.id);
      failOnce(ctx.store, ctx.post.id);
      failOnce(ctx.store, ctx.post.id);

      var start = ctx.store.startClaim(ctx.post.id);
      assert.isFalse(start.ok);
      assert.match(start.message, /人工核对/);
    });

    it('答对不消耗尝试次数', function () {
      var ctx = makeVerifyStore();
      ctx.store.startClaim(ctx.post.id);
      var result = ctx.store.submitClaim(ctx.post.id, { '卡面姓名': '王小明', '卡号后四位': '3882' });
      assert.strictEqual(result.remaining, LF.VERIFY.maxAttempts);
    });
  });

  describe('解锁状态与认领记录', function () {
    it('验证通过后本机记录为已解锁，之后看详情能直接看到联系方式', function () {
      var ctx = makeVerifyStore();
      assert.isFalse(ctx.store.isUnlocked(ctx.post.id));

      ctx.store.startClaim(ctx.post.id);
      ctx.store.submitClaim(ctx.post.id, { '卡面姓名': '王小明', '卡号后四位': '3882' });

      assert.isTrue(ctx.store.isUnlocked(ctx.post.id));
      var view = ctx.store.get(ctx.post.id, CLAIMER);
      assert.isFalse(view.locked);
      assert.strictEqual(view.contactWay, '微信：zhangmy2023');
    });

    it('解锁记录里同时保存了凭证码，方便线下出示', function () {
      var ctx = makeVerifyStore();
      ctx.store.startClaim(ctx.post.id);
      var result = ctx.store.submitClaim(ctx.post.id, { '卡面姓名': '王小明', '卡号后四位': '3882' });

      var info = ctx.store.unlockInfo(ctx.post.id);
      assert.isNotNull(info);
      assert.strictEqual(info.voucher, result.voucher);
    });

    it('答错不会解锁', function () {
      var ctx = makeVerifyStore();
      ctx.store.startClaim(ctx.post.id);
      ctx.store.submitClaim(ctx.post.id, { '卡面姓名': '错的', '卡号后四位': '错的' });
      assert.isFalse(ctx.store.isUnlocked(ctx.post.id));
      assert.isTrue(ctx.store.get(ctx.post.id, CLAIMER).locked);
    });

    it('发布者能在"我的发布"里看到收到的认领申请明细', function () {
      var ctx = makeVerifyStore();

      ctx.store.startClaim(ctx.post.id);
      ctx.store.submitClaim(ctx.post.id, { '卡面姓名': '王小明', '卡号后四位': '3882' });
      ctx.store.startClaim(ctx.post.id);
      ctx.store.submitClaim(ctx.post.id, { '卡面姓名': '李四', '卡号后四位': '1234' });

      var claims = ctx.store.listClaims(ctx.post.id, OWNER);
      assert.isTrue(claims.ok, claims.message);
      assert.lengthOf(claims.claims, 2);

      var passed = claims.claims.filter(function (c) { return c.passed; });
      var failed = claims.claims.filter(function (c) { return !c.passed; });
      assert.lengthOf(passed, 1);
      assert.lengthOf(failed, 1);
      assert.strictEqual(passed[0].voucher.slice(0, 3), 'CL-');
      assert.lengthOf(failed[0].answers, 2);
    });

    it('我的发布里能看到认领次数统计', function () {
      var ctx = makeVerifyStore();
      ctx.store.startClaim(ctx.post.id);
      ctx.store.submitClaim(ctx.post.id, { '卡面姓名': '王小明', '卡号后四位': '3882' });
      ctx.store.startClaim(ctx.post.id);
      ctx.store.submitClaim(ctx.post.id, { '卡面姓名': '错的', '卡号后四位': '错的' });

      var mine = T.byId(ctx.store.listMine(OWNER).open, ctx.post.id);
      assert.strictEqual(mine.claimCount, 2);
      assert.strictEqual(mine.claimPassed, 1);
    });

    it('非发布者看不到认领明细', function () {
      var ctx = makeVerifyStore();
      var result = ctx.store.listClaims(ctx.post.id, CLAIMER);
      assert.isFalse(result.ok);
    });
  });

  describe('编辑隐藏特征', function () {
    it('改成新答案之后，旧答案不再能通过', function () {
      var ctx = makeVerifyStore();
      ctx.store.update(ctx.post.id, {
        hidden: [
          { q: '卡面姓名', a: '李四' },
          { q: '卡号后四位', a: '9999' }
        ]
      }, OWNER);

      ctx.store.startClaim(ctx.post.id);
      var wrong = ctx.store.submitClaim(ctx.post.id, { '卡面姓名': '王小明', '卡号后四位': '3882' });
      assert.isFalse(wrong.passed, '旧答案应当失效');

      ctx.store.startClaim(ctx.post.id);
      var right = ctx.store.submitClaim(ctx.post.id, { '卡面姓名': '李四', '卡号后四位': '9999' });
      assert.isTrue(right.passed);
    });
  });
});
