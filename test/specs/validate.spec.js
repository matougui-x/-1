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

    /**
     * 选项之间要差别明显。含糊的选项会把第一版"自由文本判不准"的老毛病
     * 从答案搬到选项上：真正的失主看见两个意思接近的说法，选错之后
     * 就会被系统判成冒领的人——这比题目本身难更糟。
     */
    describe('选项之间要差别明显', function () {
      /** 用一组选择题选项拼出合法输入，方便只改选项。 */
      function withOptions(options) {
        return T.validFound({
          questions: [
            { type: 'choice', stem: '伞面是什么颜色', options: options, answer: 0 },
            q({ stem: '卡面贴着蓝色小熊贴纸' }),
            q({ stem: '卡号后四位是 3882' })
          ]
        });
      }

      it('同时写「深蓝色」和「藏青」时被拒绝', function () {
        var result = LF.validatePost(withOptions(['深蓝色', '藏青', '黑色']), opts);
        assert.property(result.errors, 'questions');
        assert.match(result.errors.questions, /深蓝色/);
        assert.match(result.errors.questions, /藏青/);
        assert.match(result.errors.questions, /差别明显/);
      });

      it('一个选项包含另一个（「深蓝」和「深蓝色」）时被拒绝', function () {
        var result = LF.validatePost(withOptions(['深蓝', '深蓝色', '黑色']), opts);
        assert.match(result.errors.questions, /差别明显/);
      });

      it('「白色」和「米白色」同属白色系，被拒绝', function () {
        var result = LF.validatePost(withOptions(['白色', '米白色', '黑色']), opts);
        assert.match(result.errors.questions, /差别明显/);
      });

      it('「黑色」和「灰色」是两种能分清的颜色，应当通过（防误报）', function () {
        var result = LF.validatePost(withOptions(['黑色', '灰色', '白色']), opts);
        assert.isTrue(result.ok, JSON.stringify(result.errors));
      });

      it('「深蓝」和「浅蓝」深浅分明，应当通过（防误报）', function () {
        var result = LF.validatePost(withOptions(['深蓝色', '浅蓝色', '黑色']), opts);
        assert.isTrue(result.ok, JSON.stringify(result.errors));
      });

      it('「蓝色」和「浅蓝色」分属两个色系，子串规则不应当误伤（防误报）', function () {
        var result = LF.validatePost(withOptions(['蓝色', '浅蓝色', '黑色']), opts);
        assert.isTrue(result.ok, JSON.stringify(result.errors));
      });

      it('词组表覆盖不到的说法，退回子串判断（「图书馆」和「图书馆一楼」）', function () {
        var result = LF.validatePost(withOptions(['图书馆', '图书馆一楼', '食堂']), opts);
        assert.match(result.errors.questions, /差别明显/);
      });

      it('只有一个字的重叠不算易混（「1」和「12」）', function () {
        var result = LF.validatePost(withOptions(['1', '12', '3']), opts);
        assert.isTrue(result.ok, JSON.stringify(result.errors));
      });

      it('判断题的固定选项「正确 / 错误」不会被误判', function () {
        var result = LF.validatePost(T.validFound({
          questions: [q(), q({ stem: '卡面贴着蓝色小熊贴纸' }), q({ stem: '卡号后四位是 3882' })]
        }), opts);
        assert.isTrue(result.ok, JSON.stringify(result.errors));
      });
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

  /**
   * 公开特征：非「其他」分类对外只能露出字典里定死的 1–2 项。
   * 这是"一刀切"落在校验上的那一刀——这些字段同时也顶替掉了原来的自由描述。
   */
  describe('公开特征（按分类锁死的对外字段）', function () {
    it('证件卡片没填卡号时被拒绝', function () {
      var result = LF.validatePost(T.validFound({ features: {} }), opts);
      assert.property(result.errors, 'feat_cardPrefix');
      assert.match(result.errors.feat_cardPrefix, /请填写/);
    });

    it('填了打码卡号就通过', function () {
      var result = LF.validatePost(T.validFound({
        features: { cardPrefix: '350504************' }
      }), opts);
      assert.isTrue(result.ok, JSON.stringify(result.errors));
    });

    it('卡号里出现字母时被拒绝（只允许数字和 *）', function () {
      var result = LF.validatePost(T.validFound({ features: { cardPrefix: 'abcd1234' } }), opts);
      assert.match(result.errors.feat_cardPrefix, /数字/);
    });

    it('没写满总位数时被拒绝', function () {
      var result = LF.validatePost(T.validFound({ features: { cardPrefix: '3505' } }), opts);
      assert.match(result.errors.feat_cardPrefix, /至少要写满 6 位/);
    });

    it('露出的数字超过 6 位时被拒绝', function () {
      var result = LF.validatePost(T.validFound({ features: { cardPrefix: '350504200510' } }), opts);
      assert.match(result.errors.feat_cardPrefix, /最多只能写出 6 位数字/);
    });

    it('正好露出 6 位数字时通过（上边界内侧）', function () {
      var result = LF.validatePost(T.validFound({
        features: { cardPrefix: '350504************' }
      }), opts);
      assert.notProperty(result.errors, 'feat_cardPrefix');
    });

    it('一位数字都不写时被拒绝（失主无从核对）', function () {
      var result = LF.validatePost(T.validFound({ features: { cardPrefix: '************' } }), opts);
      assert.match(result.errors.feat_cardPrefix, /至少要写出 1 位数字/);
    });

    it('总位数超过 24 位时被拒绝', function () {
      var result = LF.validatePost(T.validFound({
        features: { cardPrefix: new Array(26).join('*') }   // 25 个 *
      }), opts);
      assert.match(result.errors.feat_cardPrefix, /不能超过 24 位/);
    });

    it('下拉型特征必须从给定选项里选', function () {
      var result = LF.validatePost(T.validLost({
        category: 'headphone',
        features: { brand: '诺基亚', color: '黑色' }
      }), opts);
      assert.property(result.errors, 'feat_brand');
      assert.match(result.errors.feat_brand, /选项/);
    });

    it('两个特征都合法时通过', function () {
      var result = LF.validatePost(T.validLost({
        category: 'headphone',
        features: { brand: '华为', color: '黑色' }
      }), opts);
      assert.isTrue(result.ok, JSON.stringify(result.errors));
    });

    it('「其他」分类没有特征定义，不用填也不报错', function () {
      var result = LF.validatePost(T.validFound({
        category: 'other',
        features: {},
        description: '这一类的自由描述还在。'
      }), opts);
      assert.isTrue(result.ok, JSON.stringify(result.errors));
      assert.notProperty(result.errors, 'feat_cardPrefix');
    });

    it('未知分类不要求特征（分类本身已经报错了，别叠加噪音）', function () {
      var result = LF.validatePost(T.validFound({ category: '不存在的分类' }), opts);
      assert.property(result.errors, 'category');
      assert.notProperty(result.errors, 'feat_cardPrefix');
    });

    it('换分类时旧特征不会被带过去', function () {
      // 从耳机（brand/color）改成雨伞（color/handle）：brand 必须消失
      var result = LF.validatePost(T.validLost({
        category: 'umbrella',
        features: { brand: '华为', color: '黑色', handle: '直柄' }
      }), opts);
      assert.isTrue(result.ok, JSON.stringify(result.errors));
      assert.deepEqual(LF.normalizeFeatures('umbrella', { brand: '华为' }), { color: '', handle: '' });
    });
  });

  /**
   * 出题禁区：公开特征既然谁都看得见，验证题就不能再问它——
   * 问了等于把答案直接送给冒领的人。这里把这条规矩变成会失败的测试，
   * 免得以后改模板或改演示数据时又漏出去。
   */
  describe('出题禁区：模板和演示数据都不得问到公开特征', function () {
    /** 一个分类下已经公开的特征名与取值。 */
    function publicTerms(categoryKey) {
      var names = [];
      var values = [];
      LF.featuresFor(categoryKey).forEach(function (def) {
        names.push(def.name);
        if (def.kind === 'select') {
          def.options.forEach(function (option) {
            if (option !== '其他') values.push(option);
          });
        }
      });
      return { names: names, values: values };
    }

    /**
     * 判定一道题有没有碰到公开特征。**刻意做得精确，不做模糊匹配**：
     *   - 题干里出现特征名（"伞面颜色""柄型""品牌"）→ 问的就是那一项，拦下；
     *   - 选项恰好等于某个公开取值（"直柄""黑色"）→ 认领者照着公开信息就能选中，拦下。
     *
     * 为什么不检"题干里出现了公开取值的字眼"：演示数据里那道
     * "伞柄上挂着一个白色小圆珠"说的是挂珠的颜色，不是公开的伞面颜色，
     * 模糊匹配会把它误判成泄漏——误报一多这条测试就会被人关掉。
     */
    function checkQuestion(categoryKey, label, question) {
      var terms = publicTerms(categoryKey);
      var options = question.options || [];

      terms.names.forEach(function (name) {
        assert.isFalse(question.stem.indexOf(name) !== -1,
          categoryKey + ' 的' + label + '问的就是公开特征「' + name + '」：' + question.stem);
      });

      terms.values.forEach(function (value) {
        assert.isFalse(options.indexOf(value) !== -1,
          categoryKey + ' 的' + label + '把公开特征值「' + value + '」直接列成了选项：' +
          question.stem + ' ' + options.join(' / '));
      });
    }

    it('每个分类的出题模板都避开了自己的公开特征', function () {
      LF.fields(LF.CATEGORIES).forEach(function (categoryKey) {
        LF.templatesFor(categoryKey).forEach(function (template) {
          checkQuestion(categoryKey, '模板', template);
        });
      });
    });

    it('演示数据里每道验证题也避开了该分类的公开特征', function () {
      LF.buildSeedPosts(new Date('2026-10-02T10:00:00'), 'me_x').forEach(function (post) {
        (post.questions || []).forEach(function (question) {
          checkQuestion(post.category, '演示数据「' + post.title + '」', question);
        });
      });
    });
  });

  /**
   * 搜索引导：特征被锁成一两项之后，失主只有知道"该搜什么"才找得到东西。
   * 引导语写在 LF.CATEGORIES 的 searchHint 里，字段名却在 LF.FEATURES 里——
   * 两份数据、两个地方，最容易出的岔子就是改了字段名忘了改引导语，
   * 于是失主照着一条过时的提示去搜（见 config.js 里 LF.searchHintFor 的说明）。
   * 下面几条把这份一致性变成会失败的测试。
   *
   * ★ 「其他」不在"必须有引导语"这条规矩的豁免名单里：它是**对照组**，
   *   流程完全不同（不出题、描述直接公开），所以它也有引导语，只是内容不同。
   */
  describe('搜索引导：每个分类都要告诉失主该搜什么', function () {
    /** 有公开特征的分类——正是"一刀切"切到的那些。 */
    function restricted() {
      return LF.fields(LF.CATEGORIES).filter(function (key) {
        return LF.featureKeysFor(key).length > 0;
      });
    }

    it('每个分类都有引导语，一个都不能少', function () {
      var withoutHint = LF.fields(LF.CATEGORIES).filter(function (key) {
        return LF.utils.clean(LF.categoryOf(key).searchHint) === '';
      });
      assert.deepEqual(withoutHint, [], '这些分类还没写 searchHint：' + withoutHint.join('、'));
    });

    it('引导语要出现"搜"，不能只是句介绍', function () {
      restricted().forEach(function (key) {
        var text = LF.searchHintFor(key);
        assert.include(text, '搜', key + ' 的引导语没有告诉失主该"搜"什么：' + text);
      });
    });

    it('引导语要讲清"搜不到什么"，否则失主会以为东西没被捡到', function () {
      restricted().forEach(function (key) {
        var text = LF.searchHintFor(key);
        assert.isTrue(/不公开|不在公开|搜不到/.test(text),
          key + ' 的引导语没说清哪些内容搜不到：' + text);
      });
    });

    it('引导语里提到的字段名必须和特征字典对得上', function () {
      restricted().forEach(function (key) {
        LF.featuresFor(key).forEach(function (def) {
          assert.include(LF.searchHintFor(key), def.name,
            key + ' 的特征名改了，引导语没跟着改：缺「' + def.name + '」');
        });
      });
    });

    it('「其他」也必须给引导语，但讲的是另一件事（翻列表，不是按特征搜）', function () {
      var text = LF.searchHintFor('other');
      assert.notStrictEqual(text, '', '「其他」是对照组，不能默默什么都不显示');
      assert.isTrue(/翻|列表|地点/.test(text),
        '「其他」没有特征可筛，引导语要告诉失主换个找法：' + text);
      // 它没有公开特征，所以不能给自己加"就是全部可搜的公开特征"这句收尾
      assert.strictEqual(LF.featureKeysFor('other').length, 0);
      assert.notInclude(text, LF.SEARCH_HINT_SUFFIX, '「其他」没有公开特征，别说成有：' + text);
    });

    it('没有特征定义的分类不列特征名，未知分类干脆不显示引导语', function () {
      assert.strictEqual(LF.featureNamesFor('other'), '');
      assert.strictEqual(LF.featureNamesFor('不存在的分类'), '');
      assert.strictEqual(LF.searchHintFor('不存在的分类'), '', '未知分类不该凭空冒出引导语');
    });
  });

  /**
   * 「其他」是对照组：没有可锁的公开特征，所以也不出认领验证题，
   * 靠"描述 + 照片直接公开"的信任原则（见 store.js 的 LF.allowVerifyFor）。
   * 这几条守住这一类的行为，别让它被"招领必须出题"的老规则重新卡住。
   */
  describe('「其他」分类：不走验证题，只看描述', function () {
    it('「其他」的招领不出题也能通过校验', function () {
      var result = LF.validatePost(T.validFound({
        category: 'other',
        features: {},
        description: '钥匙串上有一条蓝色编织挂绳，一共三把。',
        questions: []
      }), opts);
      assert.isTrue(result.ok, JSON.stringify(result.errors));
      assert.notProperty(result.errors, 'questions');
    });

    it('其他分类（有公开特征）的招领仍然必须出题', function () {
      var result = LF.validatePost(T.validFound({ category: 'umbrella', questions: [] }), opts);
      assert.property(result.errors, 'questions');
    });

    it('寻物信息即使属于「其他」，也不出题', function () {
      var result = LF.validatePost(T.validLost({
        category: 'other',
        features: {},
        description: '宿舍钥匙一串，蓝色挂绳。'
      }), opts);
      assert.isTrue(result.ok, JSON.stringify(result.errors));
    });

    it('allowVerifyFor 三态：有特征 true / 其他类 false / 未知分类 null', function () {
      assert.isTrue(LF.allowVerifyFor('card'));
      assert.isTrue(LF.allowVerifyFor('electronics'));
      assert.isFalse(LF.allowVerifyFor('other'), '「其他」不出题');
      assert.isNull(LF.allowVerifyFor('不存在的分类'), '未知分类无从谈起，返回 null');
    });

    it('发布时即使带了题目，「其他」类也会把题目丢掉', function () {
      var store = T.makeStore();
      var created = store.create(T.validFound({
        category: 'other',
        features: {},
        description: '钥匙串上有蓝色编织挂绳，一共三把。',
        questions: T.questions()          // 前端不该传，但传了也不能让错的数据落盘
      }), 'u1');

      assert.isTrue(created.ok, JSON.stringify(created.errors));
      assert.strictEqual(created.post.questionCount, 0);
      assert.isFalse(created.post.needVerify, '「其他」类的招领不该需要验证');
      assert.deepEqual(T.rawPost(store, created.post.id).questions, []);
    });

    it('编辑时把分类改成「其他」，原来那套题会被清掉', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, 'u1');          // 默认是证件卡片，带 4 道题
      assert.strictEqual(T.rawPost(store, post.id).questions.length, 4);

      var updated = store.update(post.id, {
        category: 'other',
        features: {},
        description: '卡套里还有一张借书凭条，卡面贴过贴纸。'
      }, 'u1');

      assert.isTrue(updated.ok, JSON.stringify(updated.errors));
      assert.strictEqual(updated.post.questionCount, 0);
      assert.isFalse(updated.post.needVerify);
      assert.deepEqual(T.rawPost(store, post.id).questions, [],
        '换到「其他」后，旧题目不能继续留在存储里');
    });

    it('旧数据迁移会把「其他」类的历史题目清掉', function () {
      // 模拟 v3 时代的记录：「其他」类还挂着一组验证题
      var store = T.makeStore({
        seed: [{
          id: 'legacy_other', type: 'found', title: '一本专业书', category: 'other',
          area: 'library', location: '图书馆二楼自习区',
          happenedAt: '2026-10-01T09:00:00.000Z',
          description: '封面磨得比较旧，书里夹着几张草稿纸。',
          features: {}, photos: [],
          contactName: '孙浩然', contactDept: '', contactWay: '微信：sunhr2022',
          status: 'open', doneType: null, doneAt: null,
          createdAt: 1759300000000, updatedAt: 1759300000000, views: 0,
          ownerId: 'u1',
          questions: [
            { id: 'q1', type: 'judge', stem: '扉页上写的是林小雨这个名字', options: ['正确', '错误'], answer: 0 },
            { id: 'q2', type: 'judge', stem: '书里的重点用绿色荧光笔标注过', options: ['正确', '错误'], answer: 0 },
            { id: 'q3', type: 'choice', stem: '书里夹着的东西是', options: ['一张草稿纸', '一张书签'], answer: 0 }
          ],
          claims: [], appeals: [], attemptsLeft: 2
        }]
      });

      var post = T.byId(store.list({}), 'legacy_other');
      assert.strictEqual(post.questionCount, 0, '迁移后不该再有验证题');
      assert.isFalse(post.needVerify);
      assert.deepEqual(T.rawPost(store, 'legacy_other').questions, []);
      assert.strictEqual(T.rawPost(store, 'legacy_other').attemptsLeft, LF.VERIFY.maxAttempts,
        '题目没了，作答次数也该复位');
    });
  });

  /** 老记录没有 features。状态流转不能被新的必填校验堵死。 */
  describe('老记录的状态流转', function () {
    /** 一条"上个版本发布的"信息：有描述、没有任何公开特征。 */
    function legacyStore() {
      return T.makeStore({
        seed: [{
          id: 'legacy_1', type: 'found', title: '旧版校园卡', category: 'card',
          // legacyVerify 是 v1→v2 迁移给"旧答案已停用"的记录打的标记
          // （见 store.js 的 migratePost）。带上它，这条记录才和真实的迁移结果一致。
          legacyVerify: true,
          area: 'teaching', location: '教学楼 A 栋', happenedAt: '2026-10-01T09:00:00.000Z',
          description: '旧版留下的描述，没有公开特征。',
          photos: [], contactName: '张三', contactDept: '', contactWay: '微信：abc',
          status: 'open', doneType: null, doneAt: null,
          createdAt: 1759300000000, updatedAt: 1759300000000, views: 0,
          ownerId: 'u1', questions: [], claims: [], appeals: [], attemptsLeft: 3
        }]
      });
    }

    it('迁移会给老记录补一个空的 features 对象', function () {
      var post = T.byId(legacyStore().list({}), 'legacy_1');
      assert.deepEqual(post.features, {});
    });

    it('没有公开特征的老记录仍然能标记「已找到」', function () {
      var result = legacyStore().markDone('legacy_1', 'u1');
      assert.isTrue(result.ok, JSON.stringify(result.errors));
      assert.strictEqual(result.post.status, 'done');
    });

    it('没有公开特征的老记录仍然能撤回', function () {
      var store = legacyStore();
      store.markDone('legacy_1', 'u1');
      var result = store.reopen('legacy_1', 'u1');
      assert.isTrue(result.ok, JSON.stringify(result.errors));
      assert.strictEqual(result.post.status, 'open');
    });

    it('老记录的特征列表是空的，详情页据此回退到展示描述', function () {
      var post = T.byId(legacyStore().list({}), 'legacy_1');
      assert.lengthOf(LF.featureValues(post), 0);
      assert.strictEqual(post.description, '旧版留下的描述，没有公开特征。');
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
      // questions 不在这一串里：分类是空的（本身已经报错），
      // "该不该出题"无从判断，再补一条"请至少出 3 道验证题"只是噪音。
      ['title', 'category', 'area', 'location', 'happenedAt', 'contactName', 'contactWay']
        .forEach(function (field) {
          assert.property(result.errors, field, '应当报出 ' + field);
        });
      assert.notProperty(result.errors, 'questions');
    });
  });
});
