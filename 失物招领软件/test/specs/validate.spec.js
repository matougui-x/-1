/*!
 * 单元测试 —— 发布表单校验（等价类划分 + 边界值）
 *
 * 测试对象：LF.validatePost(input, options)
 * 思路：先确定一份"必然合法"的输入作为基准，每次只改动一个字段，
 *       这样一旦用例失败，出错原因就是唯一的那个字段。
 *       每个字段都同时测"缺失/过短"和"超长"两侧边界。
 */
describe('发布表单校验 validatePost', function () {
  var LF = (typeof globalThis !== 'undefined' ? globalThis : this).LF;
  var T = (typeof globalThis !== 'undefined' ? globalThis : this).T;

  var opts = { now: T.FIXED_NOW };

  describe('正常输入', function () {
    it('填得完整的招领信息应当通过校验', function () {
      var result = LF.validatePost(T.validFound(), opts);
      assert.isTrue(result.ok, '应当通过，实际报错：' + JSON.stringify(result.errors));
      assert.deepEqual(result.errors, {});
    });

    it('寻物信息不出验证题也应当通过校验', function () {
      var result = LF.validatePost(T.validLost(), opts);
      assert.isTrue(result.ok, '应当通过，实际报错：' + JSON.stringify(result.errors));
    });

    it('题干两侧的空格会被自动清理后再判断', function () {
      var result = LF.validatePost(T.validFound({
        questions: [
          { type: 'judge', stem: '  卡面上写的是王小明  ', answer: 0 },
          { type: 'judge', stem: '  卡面上贴着蓝色贴纸  ', answer: 0 },
          { type: 'choice', stem: '  卡号后四位是  ', options: ['  3882  ', ' 1027 '], answer: 0 }
        ]
      }), opts);
      assert.isTrue(result.ok, JSON.stringify(result.errors));
    });
  });

  describe('物品名称', function () {
    it('留空时报错', function () {
      var result = LF.validatePost(T.validFound({ title: '   ' }), opts);
      assert.isFalse(result.ok);
      assert.property(result.errors, 'title');
    });

    it('只有 1 个字时报错（下边界）', function () {
      var result = LF.validatePost(T.validFound({ title: '卡' }), opts);
      assert.property(result.errors, 'title');
    });

    it('刚好 2 个字时通过（下边界内侧）', function () {
      var result = LF.validatePost(T.validFound({ title: '校园' }), opts);
      assert.notProperty(result.errors, 'title');
    });

    it('正好 40 个字时通过（上边界内侧）', function () {
      var result = LF.validatePost(T.validFound({ title: new Array(41).join('卡') }), opts);
      assert.notProperty(result.errors, 'title');
    });

    it('超过 40 个字时报错（上边界）', function () {
      var result = LF.validatePost(T.validFound({ title: new Array(42).join('卡') }), opts);
      assert.property(result.errors, 'title');
    });
  });

  describe('分类与地点', function () {
    it('分类不在字典里时报错', function () {
      var result = LF.validatePost(T.validFound({ category: '不存在的分类' }), opts);
      assert.property(result.errors, 'category');
    });

    it('未选区域时报错', function () {
      var result = LF.validatePost(T.validFound({ area: '' }), opts);
      assert.property(result.errors, 'area');
    });

    it('具体地点只有 1 个字时提示写清楚一些', function () {
      var result = LF.validatePost(T.validFound({ location: '楼' }), opts);
      assert.property(result.errors, 'location');
      assert.match(result.errors.location, /写清楚/);
    });
  });

  describe('时间', function () {
    it('时间晚于当前时间时应当被拒绝', function () {
      var result = LF.validatePost(T.validFound({
        happenedAt: new Date('2026-10-03T10:00:00')
      }), opts);
      assert.property(result.errors, 'happenedAt');
    });

    it('比当前晚 3 分钟仍在容忍范围内（边界值）', function () {
      var result = LF.validatePost(T.validFound({
        happenedAt: new Date('2026-10-02T10:03:00')
      }), opts);
      assert.notProperty(result.errors, 'happenedAt');
    });

    it('比当前晚 10 分钟则报错（边界值另一侧）', function () {
      var result = LF.validatePost(T.validFound({
        happenedAt: new Date('2026-10-02T10:10:00')
      }), opts);
      assert.property(result.errors, 'happenedAt');
    });

    it('时间无法解析时报错', function () {
      var result = LF.validatePost(T.validFound({ happenedAt: '不是时间' }), opts);
      assert.property(result.errors, 'happenedAt');
    });

    it('寻物信息的报错文案说的是"丢失时间"', function () {
      var result = LF.validatePost(T.validLost({ happenedAt: '' }), opts);
      assert.match(result.errors.happenedAt, /丢失时间/);
    });

    it('招领信息的报错文案说的是"拾取时间"', function () {
      var result = LF.validatePost(T.validFound({ happenedAt: '' }), opts);
      assert.match(result.errors.happenedAt, /拾取时间/);
    });
  });

  describe('联系方式', function () {
    it('留空时报错', function () {
      var result = LF.validatePost(T.validFound({ contactWay: '' }), opts);
      assert.property(result.errors, 'contactWay');
    });

    it('只有 2 个字符时提示写清楚', function () {
      var result = LF.validatePost(T.validFound({ contactWay: '微信' }), opts);
      assert.property(result.errors, 'contactWay');
    });

    it('联系人留空时报错', function () {
      var result = LF.validatePost(T.validFound({ contactName: '' }), opts);
      assert.property(result.errors, 'contactName');
    });
  });

  describe('认领验证题（防冒领的关键输入）', function () {
    /** 拼一份题干合法的题，只改我们关心的那一处。 */
    function q(overrides) {
      return T.merge({
        type: 'judge', stem: '卡面上写的是王小明的名字', options: ['正确', '错误'], answer: 0
      }, overrides);
    }

    it('招领信息只有 2 道题时被拒绝（下边界）', function () {
      var result = LF.validatePost(T.validFound({
        questions: [q(), q({ stem: '卡面贴着蓝色小熊贴纸' })]
      }), opts);
      assert.property(result.errors, 'questions');
      assert.match(result.errors.questions, /至少出 3 道/);
    });

    it('正好 3 道题时通过（下边界内侧）', function () {
      var result = LF.validatePost(T.validFound({
        questions: [q(), q({ stem: '卡面贴着蓝色小熊贴纸' }), q({ stem: '卡号后四位是 3882' })]
      }), opts);
      assert.isTrue(result.ok, JSON.stringify(result.errors));
    });

    it('正好 5 道题时通过（上边界内侧）', function () {
      var result = LF.validatePost(T.validFound({
        questions: [q(), q({ stem: '卡面贴着蓝色小熊贴纸' }), q({ stem: '卡号后四位是 3882' }),
          q({ stem: '卡面是 2023 级的新版卡' }), q({ stem: '卡套是透明的' })]
      }), opts);
      assert.isTrue(result.ok, JSON.stringify(result.errors));
    });

    it('6 道题时被拒绝（上边界）', function () {
      var result = LF.validatePost(T.validFound({
        questions: [q(), q({ stem: '卡面贴着蓝色小熊贴纸' }), q({ stem: '卡号后四位是 3882' }),
          q({ stem: '卡面是 2023 级的新版卡' }), q({ stem: '卡套是透明的' }), q({ stem: '卡里有借书凭条' })]
      }), opts);
      assert.property(result.errors, 'questions');
      assert.match(result.errors.questions, /最多只能出 5 道/);
    });

    it('一道题都没出时被拒绝', function () {
      var result = LF.validatePost(T.validFound({ questions: [] }), opts);
      assert.property(result.errors, 'questions');
    });

    it('题干太短时被拒绝', function () {
      var result = LF.validatePost(T.validFound({
        questions: [q({ stem: '卡' }), q({ stem: '卡面贴着蓝色小熊贴纸' }), q({ stem: '卡号后四位是 3882' })]
      }), opts);
      assert.match(result.errors.questions, /第 1 题的题目太短/);
    });

    it('题干超过 60 个字时被拒绝', function () {
      var result = LF.validatePost(T.validFound({
        questions: [
          q({ stem: new Array(63).join('题') }),
          q({ stem: '卡面贴着蓝色小熊贴纸' }),
          q({ stem: '卡号后四位是 3882' })
        ]
      }), opts);
      assert.match(result.errors.questions, /不能超过 60 个字/);
    });

    it('没有指定正确答案时被拒绝', function () {
      var result = LF.validatePost(T.validFound({
        questions: [
          { type: 'choice', stem: '卡号后四位是', options: ['3882', '1027'], answer: -1 },
          q({ stem: '卡面贴着蓝色小熊贴纸' }),
          q({ stem: '卡号后四位是 3882' })
        ]
      }), opts);
      assert.match(result.errors.questions, /还没有指定正确答案/);
    });

    it('判断题不指定答案时默认按「正确」处理，不会报错', function () {
      var result = LF.validatePost(T.validFound({
        questions: [
          { type: 'judge', stem: '卡面上写的是王小明的名字', answer: -1 },
          q({ stem: '卡面贴着蓝色小熊贴纸' }),
          q({ stem: '卡号后四位是 3882' })
        ]
      }), opts);
      assert.isTrue(result.ok, JSON.stringify(result.errors));
    });

    it('选择题只有一个选项时被拒绝', function () {
      var result = LF.validatePost(T.validFound({
        questions: [
          { type: 'choice', stem: '卡号后四位是', options: ['3882'], answer: 0 },
          q({ stem: '卡面贴着蓝色小熊贴纸' }),
          q({ stem: '卡号后四位是 3882' })
        ]
      }), opts);
      assert.match(result.errors.questions, /至少要有 2 个选项/);
    });

    it('选择题选项超过 4 个时被拒绝', function () {
      var result = LF.validatePost(T.validFound({
        questions: [
          { type: 'choice', stem: '卡号后四位是', options: ['1', '2', '3', '4', '5'], answer: 0 },
          q({ stem: '卡面贴着蓝色小熊贴纸' }),
          q({ stem: '卡号后四位是 3882' })
        ]
      }), opts);
      assert.match(result.errors.questions, /最多只能有 4 个选项/);
    });

    it('选项重复时被拒绝', function () {
      var result = LF.validatePost(T.validFound({
        questions: [
          { type: 'choice', stem: '卡号后四位是', options: ['3882', '3882'], answer: 0 },
          q({ stem: '卡面贴着蓝色小熊贴纸' }),
          q({ stem: '卡号后四位是 3882' })
        ]
      }), opts);
      assert.match(result.errors.questions, /重复的选项/);
    });

    it('选项太长时被拒绝', function () {
      var result = LF.validatePost(T.validFound({
        questions: [
          { type: 'choice', stem: '卡号后四位是', options: [new Array(20).join('长'), '1027'], answer: 0 },
          q({ stem: '卡面贴着蓝色小熊贴纸' }),
          q({ stem: '卡号后四位是 3882' })
        ]
      }), opts);
      assert.match(result.errors.questions, /选项太长/);
    });

    it('题型只有判断题和选择题，别的题型会被丢掉', function () {
      var store = T.makeStore();
      var result = store.create(T.validFound({
        questions: [
          q(), q({ stem: '卡面贴着蓝色小熊贴纸' }),
          { type: 'essay', stem: '请描述这件物品', answer: 0 }
        ]
      }), 'u1');
      assert.isFalse(result.ok);
      assert.match(result.errors.questions, /至少出 3 道/);
    });

    it('寻物信息填了验证题也不会报错（该字段对寻物不生效）', function () {
      var result = LF.validatePost(T.validLost({ questions: [q()] }), opts);
      assert.isTrue(result.ok);

      var store = T.makeStore();
      var created = store.create(T.validLost({ questions: [q()] }), 'u1');
      assert.isTrue(created.ok);
      assert.strictEqual(created.post.questionCount, 0, '寻物信息不该携带验证题');
      assert.isFalse(created.post.needVerify);
    });
  });

  describe('多个字段同时出错', function () {
    it('一次返回全部错误，而不是遇到第一个就停', function () {
      var result = LF.validatePost({
        type: 'found',
        title: '',
        category: '',
        area: '',
        location: '',
        happenedAt: '',
        contactName: '',
        contactWay: ''
      }, opts);
      assert.isFalse(result.ok);
      ['title', 'category', 'area', 'location', 'happenedAt', 'contactName', 'contactWay', 'questions']
        .forEach(function (field) {
          assert.property(result.errors, field, '应当报出 ' + field);
        });
    });
  });
});
