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

    it('寻物信息不设置隐藏特征也应当通过校验', function () {
      var result = LF.validatePost(T.validLost(), opts);
      assert.isTrue(result.ok, '应当通过，实际报错：' + JSON.stringify(result.errors));
    });

    it('隐藏特征答案两侧的空格会被自动清理后再判断', function () {
      var result = LF.validatePost(T.validFound({
        hidden: [
          { q: '卡面姓名', a: '  王小明  ' },
          { q: '卡号后四位', a: ' 3882 ' }
        ]
      }), opts);
      assert.isTrue(result.ok);
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

  describe('隐藏特征（防冒领的关键输入）', function () {
    it('招领信息只填 1 项隐藏特征时被拒绝', function () {
      var result = LF.validatePost(T.validFound({
        hidden: [
          { q: '卡面姓名', a: '王小明' },
          { q: '卡号后四位', a: '' }
        ]
      }), opts);
      assert.property(result.errors, 'hidden');
    });

    it('招领信息一项都没填时被拒绝', function () {
      var result = LF.validatePost(T.validFound({ hidden: [] }), opts);
      assert.property(result.errors, 'hidden');
    });

    it('单条答案超过 20 个字时被拒绝', function () {
      var result = LF.validatePost(T.validFound({
        hidden: [
          { q: '卡面姓名', a: '王小明' },
          { q: '卡号后四位', a: new Array(23).join('长') }
        ]
      }), opts);
      assert.match(result.errors.hidden, /不能超过/);
    });

    it('寻物信息填了隐藏特征也不会报错（该字段对寻物不生效）', function () {
      var result = LF.validatePost(T.validLost({
        hidden: [{ q: '卡面姓名', a: '王小明' }]
      }), opts);
      assert.isTrue(result.ok);
    });

    it('问题名为空的那一项会被忽略，不计入有效特征数', function () {
      var result = LF.validatePost(T.validFound({
        hidden: [
          { q: '卡面姓名', a: '王小明' },
          { q: '卡号后四位', a: '3882' },
          { q: '   ', a: '会被忽略' }
        ]
      }), opts);
      assert.isTrue(result.ok);

      var store = T.makeStore();
      var created = store.create(T.validFound({
        hidden: [
          { q: '卡面姓名', a: '王小明' },
          { q: '卡号后四位', a: '3882' },
          { q: '   ', a: '会被忽略' }
        ]
      }), 'u1');
      assert.isTrue(created.ok);
      assert.strictEqual(created.post.hiddenCount, 2, '空问题名不应被算作一隐藏项');
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
      ['title', 'category', 'area', 'location', 'happenedAt', 'contactName', 'contactWay', 'hidden']
        .forEach(function (field) {
          assert.property(result.errors, field, '应当报出 ' + field);
        });
    });
  });
});
