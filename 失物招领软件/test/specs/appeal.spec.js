/*!
 * 单元测试 —— 申诉（人工审核通道）
 *
 * 规则来自第二版方案的最后一条：认领者答满 3 次仍未通过时，
 * 【申诉】按钮才解锁，申诉内容进人工审核，由发布者判断。
 * 这一块最容易出的错是"提前解锁"和"泄露申诉人信息"，所以两边都重点测。
 */
describe('申诉（人工审核通道）', function () {
  var root = typeof globalThis !== 'undefined' ? globalThis : this;
  var LF = root.LF;
  var T = root.T;

  var OWNER = 'owner_1';
  var CLAIMER = 'claimer_1';
  var OTHER = 'other_1';

  /** 造一条"已经答满 3 次都没通过"的招领信息。 */
  function makeExhaustedStore() {
    var store = T.makeStore();
    var post = T.publishFound(store, OWNER, { questions: T.questions() });
    store.submitClaim(post.id, T.answers(['q1']));
    store.submitClaim(post.id, T.answers(['q2']));
    store.submitClaim(post.id, T.answers(['q3']));
    return { store: store, post: post };
  }

  function validAppeal(overrides) {
    return T.merge({
      name: '李思远',
      contact: '微信：lisiyuan2022',
      detail: '卡号后四位是 3882，背面签名栏写的是我的名字，卡套里还有一张借书凭条。'
    }, overrides);
  }

  describe('解锁条件', function () {
    it('还没答满 3 次时不能申诉', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, OWNER);
      var result = store.submitAppeal(post.id, validAppeal(), CLAIMER);

      assert.isFalse(result.ok);
      assert.match(result.message, /3 次机会用完/);
    });

    it('答满 3 次之后可以申诉', function () {
      var ctx = makeExhaustedStore();
      var result = ctx.store.submitAppeal(ctx.post.id, validAppeal(), CLAIMER);
      assert.isTrue(result.ok, result.message);
      assert.strictEqual(result.appeal.decision, 'pending');
    });

    it('寻物信息没有申诉通道', function () {
      var store = T.makeStore();
      var post = T.publishLost(store, OWNER);
      var result = store.submitAppeal(post.id, validAppeal(), CLAIMER);
      assert.isFalse(result.ok);
      assert.match(result.message, /不需要验证/);
    });

    it('发布者不能申诉自己的信息', function () {
      var ctx = makeExhaustedStore();
      var result = ctx.store.submitAppeal(ctx.post.id, validAppeal(), OWNER);
      assert.isFalse(result.ok);
      assert.match(result.message, /你自己发布/);
    });

    it('没有本机身份时拒绝', function () {
      var ctx = makeExhaustedStore();
      assert.isFalse(ctx.store.submitAppeal(ctx.post.id, validAppeal(), '').ok);
    });

    it('同一台设备不能重复提交（还在等待处理时）', function () {
      var ctx = makeExhaustedStore();
      ctx.store.submitAppeal(ctx.post.id, validAppeal(), CLAIMER);

      var again = ctx.store.submitAppeal(ctx.post.id, validAppeal({ detail: '再写一遍细节细节细节' }), CLAIMER);
      assert.isFalse(again.ok);
      assert.match(again.message, /已经提交过/);
    });
  });

  describe('表单校验', function () {
    it('称呼、联系方式、细节都不能为空', function () {
      var ctx = makeExhaustedStore();
      var result = ctx.store.submitAppeal(ctx.post.id, { name: '', contact: '', detail: '' }, CLAIMER);
      assert.isFalse(result.ok);
      assert.property(result.errors, 'name');
      assert.property(result.errors, 'contact');
      assert.property(result.errors, 'detail');
    });

    it('细节写得太短会被要求写清楚', function () {
      var ctx = makeExhaustedStore();
      var result = ctx.store.submitAppeal(ctx.post.id, validAppeal({ detail: '就是我的' }), CLAIMER);
      assert.isFalse(result.ok);
      assert.match(result.errors.detail, /至少/);
    });

    it('联系方式太短会被拦下', function () {
      var ctx = makeExhaustedStore();
      var result = ctx.store.submitAppeal(ctx.post.id, validAppeal({ contact: '12' }), CLAIMER);
      assert.isFalse(result.ok);
      assert.match(result.errors.contact, /太短/);
    });

    it('细节超过 300 字会被拦下', function () {
      var ctx = makeExhaustedStore();
      var result = ctx.store.submitAppeal(ctx.post.id, validAppeal({
        detail: new Array(302).join('长')
      }), CLAIMER);
      assert.isFalse(result.ok);
      assert.match(result.errors.detail, /不能超过/);
    });

    it('两侧空格会被清理后再判断', function () {
      var ctx = makeExhaustedStore();
      var result = ctx.store.submitAppeal(ctx.post.id, validAppeal({
        name: '  李思远  ', contact: '  微信：lisiyuan2022  '
      }), CLAIMER);
      assert.isTrue(result.ok);
      assert.strictEqual(result.appeal.name, '李思远');
      assert.strictEqual(result.appeal.contact, '微信：lisiyuan2022');
    });
  });

  describe('发布者处理', function () {
    function appealOnce() {
      var ctx = makeExhaustedStore();
      var appeal = ctx.store.submitAppeal(ctx.post.id, validAppeal(), CLAIMER);
      return { store: ctx.store, post: ctx.post, appeal: appeal.appeal };
    }

    it('发布者能看到申诉明细（含对方写的细节）', function () {
      var ctx = appealOnce();
      var list = ctx.store.listAppeals(ctx.post.id, OWNER);

      assert.isTrue(list.ok, list.message);
      assert.lengthOf(list.appeals, 1);
      assert.strictEqual(list.appeals[0].name, '李思远');
      assert.strictEqual(list.appeals[0].contact, '微信：lisiyuan2022');
      assert.include(list.appeals[0].detail, '3882');
      assert.strictEqual(list.pending, 1);
    });

    it('别人看不到申诉明细', function () {
      var ctx = appealOnce();
      var list = ctx.store.listAppeals(ctx.post.id, OTHER);
      assert.isFalse(list.ok);
      assert.match(list.message, /只有发布者/);
    });

    it('同意的申诉：认领者能看到联系方式，并拿到线下交接编号', function () {
      var ctx = appealOnce();
      var done = ctx.store.resolveAppeal(ctx.post.id, ctx.appeal.id, 'approved', '来值班室取', OWNER);

      assert.isTrue(done.ok, done.message);
      assert.strictEqual(done.appeal.decision, 'approved');
      assert.strictEqual(done.appeal.note, '来值班室取');
      assert.match(done.appeal.voucher, /^CL-\d{4}-\d{4}$/);

      var view = ctx.store.get(ctx.post.id, CLAIMER);
      assert.isFalse(view.locked, '同意之后认领者不该再被锁住');
      assert.strictEqual(view.contactWay, '微信：zhangmy2023');
      assert.isTrue(view.appealApproved);
    });

    it('被驳回的申诉：认领者仍然看不到联系方式，但能看到驳回理由', function () {
      var ctx = appealOnce();
      var done = ctx.store.resolveAppeal(ctx.post.id, ctx.appeal.id, 'rejected', '细节对不上', OWNER);
      assert.isTrue(done.ok);

      var view = ctx.store.get(ctx.post.id, CLAIMER);
      assert.isTrue(view.locked);
      assert.strictEqual(view.contactWay, '');
      assert.isFalse(view.appealApproved);
      assert.strictEqual(view.myAppeal.decision, 'rejected');
      assert.strictEqual(view.myAppeal.note, '细节对不上');
    });

    it('别人不能替发布者处理申诉', function () {
      var ctx = appealOnce();
      var result = ctx.store.resolveAppeal(ctx.post.id, ctx.appeal.id, 'approved', '', OTHER);
      assert.isFalse(result.ok);
      assert.match(result.message, /只有发布者/);
      assert.isTrue(ctx.store.get(ctx.post.id, CLAIMER).locked);
    });

    it('同一条申诉不能被处理两次', function () {
      var ctx = appealOnce();
      ctx.store.resolveAppeal(ctx.post.id, ctx.appeal.id, 'approved', '', OWNER);
      var again = ctx.store.resolveAppeal(ctx.post.id, ctx.appeal.id, 'rejected', '', OWNER);
      assert.isFalse(again.ok);
      assert.match(again.message, /已经处理过/);
    });

    it('处理结果必须明确，不能乱传', function () {
      var ctx = appealOnce();
      var result = ctx.store.resolveAppeal(ctx.post.id, ctx.appeal.id, '随便', '', OWNER);
      assert.isFalse(result.ok);
      assert.match(result.message, /处理结果/);
    });
  });

  describe('隐私：申诉内容不外泄', function () {
    it('公开视图里没有 appeals 数组', function () {
      var ctx = makeExhaustedStore();
      ctx.store.submitAppeal(ctx.post.id, validAppeal(), CLAIMER);

      var view = ctx.store.get(ctx.post.id, OTHER);
      assert.notProperty(view, 'appeals', '申诉人的姓名与联系方式不能随信息一起公开');
      assert.notInclude(JSON.stringify(ctx.store.list({ viewerId: OTHER })), 'lisiyuan2022');
      assert.notInclude(JSON.stringify(view), '借书凭条');
    });

    it('认领者只能看到自己那一条申诉的进度', function () {
      var ctx = makeExhaustedStore();
      ctx.store.submitAppeal(ctx.post.id, validAppeal(), CLAIMER);

      var mine = ctx.store.get(ctx.post.id, CLAIMER);
      assert.strictEqual(mine.myAppeal.decision, 'pending');
      assert.notProperty(mine.myAppeal, 'contact', '自己的联系方式也不必再回传一份');

      var stranger = ctx.store.get(ctx.post.id, OTHER);
      assert.isNull(stranger.myAppeal);
      assert.strictEqual(stranger.appealCount, 0, '非发布者不该知道别人申诉了几次');
    });

    it('发布者侧只拿到条数，不把申诉当公开字段发出去', function () {
      var ctx = makeExhaustedStore();
      ctx.store.submitAppeal(ctx.post.id, validAppeal(), CLAIMER);

      var ownerView = ctx.store.get(ctx.post.id, OWNER);
      assert.strictEqual(ownerView.appealCount, 1);
      assert.strictEqual(ownerView.appealPending, 1);
      assert.isNull(ownerView.myAppeal, '发布者不走"我的申诉"这条路径');
    });

    it('发布者能在"我的发布"里看到待处理的人工审核条数', function () {
      var ctx = makeExhaustedStore();
      ctx.store.submitAppeal(ctx.post.id, validAppeal(), CLAIMER);

      var mine = T.byId(ctx.store.listMine(OWNER).open, ctx.post.id);
      assert.strictEqual(mine.appealCount, 1);
      assert.strictEqual(mine.appealPending, 1);
    });

    it('信息被删除后，申诉也跟着没了', function () {
      var ctx = makeExhaustedStore();
      ctx.store.submitAppeal(ctx.post.id, validAppeal(), CLAIMER);
      ctx.store.remove(ctx.post.id, OWNER);

      var result = ctx.store.myAppeal(ctx.post.id, CLAIMER);
      assert.isFalse(result.ok);
      assert.lengthOf(ctx.store.list({ keyword: '校园卡' }), 0);
    });
  });

  describe('旧数据迁移', function () {
    function legacyAdapter() {
      return LF.createMemoryAdapter({
        'lf.posts.v1': JSON.stringify([{
          id: 'legacy_1', type: 'found', title: '旧版校园卡', category: 'card', area: 'teaching',
          location: '老地点', happenedAt: '2026-09-01T09:00:00.000Z', description: '旧描述', photos: [],
          contactName: '张三', contactDept: '', contactWay: '微信：old', status: 'open',
          doneType: null, doneAt: null, createdAt: 1, updatedAt: 1, views: 0, ownerId: OWNER,
          hidden: [{ q: '卡面姓名', a: '王小明' }, { q: '卡号后四位', a: '3882' }],
          revealMode: 'contact', claims: [], attemptsLeft: 2
        }])
      });
    }

    it('旧版的自由文本答案会被停用，而不是编造出客观题', function () {
      var store = LF.createStore(legacyAdapter(), { now: T.FIXED_NOW });
      var result = store.migrate();
      assert.strictEqual(result.migrated, 1);

      var view = store.get('legacy_1', OWNER);
      assert.isTrue(view.legacyVerify);
      assert.isFalse(view.needVerify, '迁移后不再要求验证');
      assert.notProperty(view, 'hidden');
      assert.notProperty(view, 'legacyHidden');
    });

    it('旧答案不会残留在数据里', function () {
      var store = LF.createStore(legacyAdapter(), { now: T.FIXED_NOW });
      store.migrate();
      var dump = JSON.stringify(store.exportAll());
      assert.notInclude(dump, '王小明');
      assert.notInclude(dump, '3882');
      assert.notInclude(dump, '"hidden"');
    });

    it('迁移过的信息仍然可以只改标题（不必马上补题）', function () {
      var store = LF.createStore(legacyAdapter(), { now: T.FIXED_NOW });
      store.migrate();

      var result = store.update('legacy_1', { title: '旧版校园卡（改过标题）' }, OWNER);
      assert.isTrue(result.ok, JSON.stringify(result.errors));
      assert.strictEqual(result.post.title, '旧版校园卡（改过标题）');
      assert.isFalse(result.post.needVerify);
    });

    it('补好 3 道题之后，验证重新生效，旧版标记消失', function () {
      var store = LF.createStore(legacyAdapter(), { now: T.FIXED_NOW });
      store.migrate();

      var result = store.update('legacy_1', {
        questions: [
          { type: 'judge', stem: '卡面上写的是王小明的名字', answer: 0 },
          { type: 'choice', stem: '卡号后四位是', options: ['3882', '1111'], answer: 0 },
          { type: 'judge', stem: '卡面有新贴的贴纸', answer: 1 }
        ]
      }, OWNER);

      assert.isTrue(result.ok, JSON.stringify(result.errors));
      assert.isTrue(result.post.needVerify);
      assert.isFalse(result.post.legacyVerify);
      assert.strictEqual(result.post.questionCount, 3);
    });

    it('新发布的招领信息没有题就不能发布', function () {
      var store = T.makeStore();
      var result = store.create(T.validFound({ questions: [] }), OWNER);
      assert.isFalse(result.ok);
      assert.property(result.errors, 'questions');
      assert.match(result.errors.questions, /至少出/);
    });
  });
});
