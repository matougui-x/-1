/*!
 * 单元测试 —— 认领验证（纯客观题 + 限制次数，第二版方案）
 *
 * 这一版要重点守住四条规则：
 *   1. 发布者出题，题型只有判断题和选择题，题数 3–5 题；
 *   2. 认领者一次性答完全部题目，系统统一判定；
 *   3. 未通过时不告诉认领者"哪一题错了"，否则 3 次机会足够用排除法试出答案；
 *   4. 最多答 3 次，3 次全败才解锁【申诉】走人工审核。
 */
describe('认领验证（客观题 + 限制次数）', function () {
  var root = typeof globalThis !== 'undefined' ? globalThis : this;
  var LF = root.LF;
  var T = root.T;

  var OWNER = 'owner_1';
  var CLAIMER = 'claimer_1';

  /** 一条有 4 道验证题的招领信息。 */
  function makeVerifyStore() {
    var store = T.makeStore();
    var post = T.publishFound(store, OWNER, { questions: T.questions() });
    return { store: store, post: post };
  }

  describe('取题 startClaim', function () {
    it('一次返回全部题目，不再随机抽题', function () {
      var ctx = makeVerifyStore();
      var start = ctx.store.startClaim(ctx.post.id);

      assert.isTrue(start.ok, start.message);
      assert.lengthOf(start.questions, 4);
      assert.deepEqual(start.questions.map(function (q) { return q.id; }), ['q1', 'q2', 'q3', 'q4']);
    });

    it('题目里带上了题干与选项，且不含 answer', function () {
      var ctx = makeVerifyStore();
      var start = ctx.store.startClaim(ctx.post.id);
      var serialized = JSON.stringify(start);

      assert.strictEqual(start.questions[0].stem, '卡面上写的是王小明这个名字');
      assert.deepEqual(start.questions[0].options, ['正确', '错误']);
      assert.strictEqual(start.questions[2].options[0], '3882');
      assert.notInclude(serialized, '"answer"', '正确答案绝不能随题目下发');
    });

    it('题目里带上题型名，界面可以直接显示', function () {
      var ctx = makeVerifyStore();
      var start = ctx.store.startClaim(ctx.post.id);
      assert.strictEqual(start.questions[0].typeName, '判断题');
      assert.strictEqual(start.questions[2].typeName, '选择题');
      assert.strictEqual(start.questionMix.judge, 2);
      assert.strictEqual(start.questionMix.choice, 2);
    });

    it('返回剩余次数，界面用它显示 3 / 3', function () {
      var ctx = makeVerifyStore();
      var start = ctx.store.startClaim(ctx.post.id);
      assert.strictEqual(start.remaining, LF.VERIFY.maxAttempts);
      assert.strictEqual(start.maxAttempts, LF.VERIFY.maxAttempts);
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

  describe('提交答案 submitClaim：统一判定', function () {
    it('全部答对时通过，返回凭证码与发布者联系方式', function () {
      var ctx = makeVerifyStore();
      var result = ctx.store.submitClaim(ctx.post.id, T.answers());

      assert.isTrue(result.ok, result.message);
      assert.isTrue(result.passed);
      assert.match(result.voucher, /^CL-\d{4}-\d{4}$/);
      assert.strictEqual(result.contact.way, '微信：zhangmy2023');
      assert.strictEqual(result.contact.name, '张明远');
      assert.strictEqual(result.questionCount, 4);
      assert.strictEqual(result.correctCount, 4);
    });

    it('答错一题就不通过，而且不告诉你是哪一题错', function () {
      var ctx = makeVerifyStore();
      var result = ctx.store.submitClaim(ctx.post.id, T.answers(['q3']));

      assert.isTrue(result.ok);
      assert.isFalse(result.passed);
      assert.strictEqual(result.message, '回答的细节与描述不符');
      assert.notProperty(result, 'failed', '结果里不能带"哪题错了"的信息');
      assert.notProperty(result, 'voucher');
      // 返回的整个对象里都不该出现题号或选项，否则前端能反推出错在哪题
      var serialized = JSON.stringify(result);
      assert.notInclude(serialized, 'q1');
      assert.notInclude(serialized, 'q3');
      assert.notInclude(serialized, '3882');
    });

    it('全错与只错一题的返回结构完全一样（不给排除法留线索）', function () {
      var ctx = makeVerifyStore();
      var first = ctx.store.submitClaim(ctx.post.id, T.answers(['q3']));           // 还剩 2 次
      var second = ctx.store.submitClaim(ctx.post.id, T.answers(['q1', 'q2', 'q3', 'q4']));

      assert.deepEqual(Object.keys(first).sort(), Object.keys(second).sort());
      assert.strictEqual(first.message, second.message);
      assert.strictEqual(first.passed, second.passed);
      assert.strictEqual(second.remaining, first.remaining - 1);
    });

    it('漏答会被拦下，并且不消耗次数', function () {
      var ctx = makeVerifyStore();
      var result = ctx.store.submitClaim(ctx.post.id, [{ id: 'q1', choice: 0 }]);

      assert.isFalse(result.ok);
      assert.match(result.message, /没有作答/);
      assert.strictEqual(ctx.store.get(ctx.post.id, OWNER).attemptsLeft, LF.VERIFY.maxAttempts);
    });

    it('选项下标越界视为没有作答', function () {
      var ctx = makeVerifyStore();
      var result = ctx.store.submitClaim(ctx.post.id, [
        { id: 'q1', choice: 0 }, { id: 'q2', choice: 0 },
        { id: 'q3', choice: 9 }, { id: 'q4', choice: 0 }
      ]);
      assert.isFalse(result.ok);
      assert.match(result.message, /没有作答/);
    });

    it('答错后剩余次数减一', function () {
      var ctx = makeVerifyStore();
      var result = ctx.store.submitClaim(ctx.post.id, T.answers(['q2']));

      assert.strictEqual(result.remaining, LF.VERIFY.maxAttempts - 1);
      assert.strictEqual(result.maxAttempts, LF.VERIFY.maxAttempts);
      assert.isFalse(result.locked);
      assert.isFalse(result.canAppeal);
    });

    it('答对不消耗次数', function () {
      var ctx = makeVerifyStore();
      var result = ctx.store.submitClaim(ctx.post.id, T.answers());
      assert.strictEqual(result.remaining, LF.VERIFY.maxAttempts);
    });

    it('寻物信息不能提交验证答案', function () {
      var store = T.makeStore();
      var post = T.publishLost(store, OWNER);
      var result = store.submitClaim(post.id, T.answers());
      assert.isFalse(result.ok);
      assert.match(result.message, /不需要验证/);
    });
  });

  describe('限制次数与申诉解锁', function () {
    function failOnce(store, id, wrongIds) {
      return store.submitClaim(id, T.answers(wrongIds || ['q1']));
    }

    it('连续答错 3 次后锁定，并且解锁申诉', function () {
      var ctx = makeVerifyStore();
      var first = failOnce(ctx.store, ctx.post.id);
      assert.isFalse(first.locked, '第 1 次失败还不应锁定');
      assert.isFalse(first.canAppeal);

      var second = failOnce(ctx.store, ctx.post.id, ['q2']);
      assert.isFalse(second.locked, '第 2 次失败还不应锁定');
      assert.strictEqual(second.remaining, 1);

      var third = failOnce(ctx.store, ctx.post.id, ['q3']);
      assert.isTrue(third.locked, '第 3 次失败后应当锁定');
      assert.isTrue(third.canAppeal, '第 3 次失败后才解锁申诉');
      assert.strictEqual(third.remaining, 0);
    });

    it('锁定之后即使答案全对也不能再提交', function () {
      var ctx = makeVerifyStore();
      failOnce(ctx.store, ctx.post.id);
      failOnce(ctx.store, ctx.post.id, ['q2']);
      failOnce(ctx.store, ctx.post.id, ['q3']);

      var start = ctx.store.startClaim(ctx.post.id);
      assert.isFalse(start.ok);
      assert.isTrue(start.locked);
      assert.isTrue(start.canAppeal);

      var submit = ctx.store.submitClaim(ctx.post.id, T.answers());
      assert.isFalse(submit.ok);
      assert.isTrue(submit.locked);
    });

    it('公开视图把剩余次数和"能不能申诉"一并给出，详情页据此换按钮', function () {
      var ctx = makeVerifyStore();
      var before = ctx.store.get(ctx.post.id, CLAIMER);
      assert.strictEqual(before.attemptsLeft, 3);
      assert.isFalse(before.canAppeal);

      failOnce(ctx.store, ctx.post.id);
      failOnce(ctx.store, ctx.post.id, ['q2']);
      failOnce(ctx.store, ctx.post.id, ['q3']);

      var after = ctx.store.get(ctx.post.id, CLAIMER);
      assert.strictEqual(after.attemptsLeft, 0);
      assert.isTrue(after.canAppeal);
    });

    it('答错三次之后，公开发布者那边也看得到三条未通过的记录', function () {
      var ctx = makeVerifyStore();
      failOnce(ctx.store, ctx.post.id);
      failOnce(ctx.store, ctx.post.id, ['q2']);
      failOnce(ctx.store, ctx.post.id, ['q3']);

      var claims = ctx.store.listClaims(ctx.post.id, OWNER);
      assert.lengthOf(claims.claims, 3);
      assert.lengthOf(claims.claims.filter(function (c) { return c.passed; }), 0);
    });
  });

  describe('解锁状态与认领记录', function () {
    it('验证通过后本机记录为已解锁，之后看详情能直接看到联系方式', function () {
      var ctx = makeVerifyStore();
      assert.isFalse(ctx.store.isUnlocked(ctx.post.id));

      ctx.store.submitClaim(ctx.post.id, T.answers());

      assert.isTrue(ctx.store.isUnlocked(ctx.post.id));
      var view = ctx.store.get(ctx.post.id, CLAIMER);
      assert.isFalse(view.locked);
      assert.strictEqual(view.contactWay, '微信：zhangmy2023');
    });

    it('解锁记录里同时保存了凭证码，方便线下出示', function () {
      var ctx = makeVerifyStore();
      var result = ctx.store.submitClaim(ctx.post.id, T.answers());

      var info = ctx.store.unlockInfo(ctx.post.id);
      assert.isNotNull(info);
      assert.strictEqual(info.voucher, result.voucher);
    });

    it('答错不会解锁', function () {
      var ctx = makeVerifyStore();
      ctx.store.submitClaim(ctx.post.id, T.answers(['q1']));
      assert.isFalse(ctx.store.isUnlocked(ctx.post.id));
      assert.isTrue(ctx.store.get(ctx.post.id, CLAIMER).locked);
    });

    it('发布者能看到每条认领记录的作答与对错', function () {
      var ctx = makeVerifyStore();
      ctx.store.submitClaim(ctx.post.id, T.answers());
      ctx.store.submitClaim(ctx.post.id, T.answers(['q3']));

      var claims = ctx.store.listClaims(ctx.post.id, OWNER);
      assert.isTrue(claims.ok, claims.message);
      assert.lengthOf(claims.claims, 2);

      var passed = claims.claims.filter(function (c) { return c.passed; })[0];
      var failed = claims.claims.filter(function (c) { return !c.passed; })[0];
      assert.strictEqual(passed.answers.length, 4);
      assert.strictEqual(passed.voucher.slice(0, 3), 'CL-');
      assert.strictEqual(failed.answers.filter(function (a) { return a.correct; }).length, 3);
      assert.strictEqual(failed.answers[2].choiceText, '1027');
    });

    it('我的发布里能看到认领次数统计', function () {
      var ctx = makeVerifyStore();
      ctx.store.submitClaim(ctx.post.id, T.answers());
      ctx.store.submitClaim(ctx.post.id, T.answers(['q1']));

      var mine = T.byId(ctx.store.listMine(OWNER).open, ctx.post.id);
      assert.strictEqual(mine.claimCount, 2);
      assert.strictEqual(mine.claimPassed, 1);
      assert.strictEqual(mine.questionCount, 4);
      assert.strictEqual(mine.questionMix.judge, 2);
    });

    it('非发布者看不到认领明细', function () {
      var ctx = makeVerifyStore();
      var result = ctx.store.listClaims(ctx.post.id, CLAIMER);
      assert.isFalse(result.ok);
    });
  });

  describe('编辑题目', function () {
    it('换掉题目之后，旧答案不再能通过，次数也重新给满', function () {
      var ctx = makeVerifyStore();

      // 先用掉两次机会
      ctx.store.submitClaim(ctx.post.id, T.answers(['q1']));
      ctx.store.submitClaim(ctx.post.id, T.answers(['q2']));
      assert.strictEqual(ctx.store.get(ctx.post.id, OWNER).attemptsLeft, 1);

      var updated = ctx.store.update(ctx.post.id, {
        questions: [
          { type: 'judge', stem: '卡面上写的是李四这个名字', answer: 1 },
          { type: 'choice', stem: '卡号后四位是', options: ['9999', '1111'], answer: 0 },
          { type: 'judge', stem: '卡面是新版的', answer: 0 }
        ]
      }, OWNER);
      assert.isTrue(updated.ok, JSON.stringify(updated.errors));
      assert.strictEqual(ctx.store.get(ctx.post.id, OWNER).attemptsLeft, LF.VERIFY.maxAttempts,
        '换了题就等于换了一套验证，次数应当重新给满');

      var view = ctx.store.get(ctx.post.id, CLAIMER);
      assert.lengthOf(view.questions, 3);
      assert.strictEqual(view.questions[0].stem, '卡面上写的是李四这个名字');

      var wrong = ctx.store.submitClaim(ctx.post.id, [
        { id: view.questions[0].id, choice: 0 },
        { id: view.questions[1].id, choice: 0 },
        { id: view.questions[2].id, choice: 0 }
      ]);
      assert.isFalse(wrong.passed, '旧答案应当失效');
    });

    it('编辑时取回的草稿带正确答案，只有发布者拿得到', function () {
      var ctx = makeVerifyStore();
      var draft = ctx.store.getEditable(ctx.post.id, OWNER);
      assert.isTrue(draft.ok);
      assert.strictEqual(draft.post.questions[0].answer, 0);

      var other = ctx.store.getEditable(ctx.post.id, CLAIMER);
      assert.isFalse(other.ok);
      assert.match(other.message, /只有发布者/);
    });

    it('把招领改成寻物后，验证题会被清掉', function () {
      var ctx = makeVerifyStore();
      var result = ctx.store.update(ctx.post.id, { type: 'lost' }, OWNER);
      assert.isTrue(result.ok, JSON.stringify(result.errors));
      assert.isFalse(result.post.needVerify);
      assert.strictEqual(result.post.questionCount, 0);
    });
  });

  describe('出题规则', function () {
    it('判断题的选项由数据层固定成「正确 / 错误」，发布者传什么都不算数', function () {
      var store = T.makeStore();
      T.publishFound(store, OWNER, {
        questions: [
          { type: 'judge', stem: '卡面上写的是王小明这个名字', options: ['是', '否'], answer: 1 },
          { type: 'judge', stem: '卡面贴着一张蓝色小熊贴纸', answer: 0 },
          { type: 'choice', stem: '卡号后四位是', options: ['3882', '1027'], answer: 0 }
        ]
      });
      var raw = T.rawPost(store, store.list()[0].id);

      assert.deepEqual(raw.questions[0].options, ['正确', '错误']);
      assert.strictEqual(raw.questions[0].answer, 1);
    });

    it('选择题里的空选项行会被丢掉，正确答案下标跟着重排', function () {
      var store = T.makeStore();
      T.publishFound(store, OWNER, {
        questions: [
          { type: 'judge', stem: '卡面上写的是王小明这个名字', answer: 0 },
          { type: 'choice', stem: '卡号后四位是', options: ['', '3882', '1027'], answer: 1 },
          { type: 'choice', stem: '这张卡属于哪个年级', options: ['2023 级', '', '2022 级'], answer: 0 }
        ]
      });
      var raw = T.rawPost(store, store.list()[0].id);

      assert.deepEqual(raw.questions[1].options, ['3882', '1027']);
      assert.strictEqual(raw.questions[1].answer, 0, '原来的第 2 项去掉空行后应当变成第 1 项');
      assert.deepEqual(raw.questions[2].options, ['2023 级', '2022 级']);
    });

    it('题型不认识的那一题会被丢掉，于是题数不够被拦下', function () {
      var result = LF.validatePost(T.validFound({
        questions: [
          { type: 'judge', stem: '卡面上写的是王小明这个名字', answer: 0 },
          { type: 'judge', stem: '卡面贴着一张蓝色小熊贴纸', answer: 0 },
          { type: 'essay', stem: '请描述你的物品', answer: 0 }
        ]
      }), { now: T.FIXED_NOW });
      assert.isFalse(result.ok);
      assert.match(result.errors.questions, /至少/);
    });
  });
});
