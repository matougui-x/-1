/*!
 * 单元测试 —— 浏览、搜索、筛选、排序
 *
 * 测试对象：LF.matchKeyword / LF.queryPosts / store.list
 * 思路：搭一批"每条只在一个字段上有区分度"的数据，这样某个关键词应该命中哪几条
 *       是可以预先算出来的。搜索最容易出的问题是"漏命中"和"命中太多"，
 *       所以正例反例成对写。
 */
describe('浏览、搜索与筛选', function () {
  var root = typeof globalThis !== 'undefined' ? globalThis : this;
  var LF = root.LF;
  var T = root.T;

  /**
   * 造一批用于搜索的数据：每条的可搜索字段都是刻意设计的。
   *
   * 注意公开特征：card / headphone / umbrella 三个分类在字典里都有特征定义，
   * 所以这三条必须带上 features 才创建得出来，而且它们的 description 会被
   * 数据层强制置空（有特征就不留自由描述了）。只有 other 那条还留着描述。
   */
  function buildStore() {
    var store = T.makeStore();
    var me = 'me_1';

    store.create(T.validFound({
      title: '校园卡一张',
      category: 'card',
      area: 'teaching',
      location: '教学楼 A 栋 301 教室',
      features: { cardPrefix: '202305******' }
    }), me);

    store.create(T.validLost({
      title: '黑色蓝牙耳机',
      category: 'headphone',
      area: 'library',
      location: '图书馆三楼自习区',
      features: { brand: '华为', color: '黑色' }
    }), 'other_1');

    store.create(T.validFound({
      title: '粉色折叠雨伞',
      category: 'umbrella',
      area: 'canteen',
      location: '第二食堂门口',
      features: { color: '粉色', handle: '折叠短柄' }
    }), 'other_2');

    store.create(T.validLost({
      title: '宿舍钥匙一串',
      category: 'other',
      area: 'gym',
      location: '体育馆篮球场',
      description: '蓝色挂绳，一共三把。'
    }), 'other_3');

    return store;
  }

  function titles(list) {
    return list.map(function (item) { return item.title; });
  }

  describe('关键词匹配 matchKeyword', function () {
    it('命中物品名称', function () {
      var post = T.validFound({ title: '校园卡一张', description: '没有别的线索' });
      assert.isTrue(LF.matchKeyword(post, '校园卡'));
    });

    it('命中物品描述', function () {
      var post = T.validLost({ title: '黑色耳机', description: '充电盒是磨砂黑的' });
      assert.isTrue(LF.matchKeyword(post, '磨砂'));
    });

    it('命中具体地点', function () {
      var post = T.validLost({ location: '图书馆三楼自习区' });
      assert.isTrue(LF.matchKeyword(post, '图书馆'));
    });

    it('命中分类名称（搜"证件卡片"能找到校园卡）', function () {
      var post = T.validFound({ title: '一张卡', category: 'card', description: '' });
      assert.isTrue(LF.matchKeyword(post, '证件卡片'));
    });

    it('命中区域名称（搜"食堂"能找到第二食堂门口的东西）', function () {
      var post = T.validFound({ title: '一把伞', area: 'canteen', location: '门口', description: '' });
      assert.isTrue(LF.matchKeyword(post, '食堂'));
    });

    it('完全无关的词返回 false', function () {
      var post = T.validFound({ title: '校园卡一张', description: '在教室里捡到' });
      assert.isFalse(LF.matchKeyword(post, '自行车'));
    });

    it('空关键词视为不过滤，返回 true', function () {
      var post = T.validFound();
      assert.isTrue(LF.matchKeyword(post, ''));
      assert.isTrue(LF.matchKeyword(post, '   '));
    });

    it('多个关键词是"与"的关系，必须全部命中', function () {
      var post = T.validLost({ title: '黑色蓝牙耳机', location: '图书馆三楼', description: '带充电盒' });
      assert.isTrue(LF.matchKeyword(post, '耳机 图书馆'));
      assert.isFalse(LF.matchKeyword(post, '耳机 食堂'), '只命中一个词不应算作命中');
    });

    it('忽略大小写', function () {
      var post = T.validLost({ title: 'AirPods Pro', description: '' });
      assert.isTrue(LF.matchKeyword(post, 'airpods'));
      assert.isTrue(LF.matchKeyword(post, 'AIRPODS'));
    });

    it('忽略全角与半角差异', function () {
      var post = T.validLost({ title: 'AirPods Pro 耳机', description: '' });
      assert.isTrue(LF.matchKeyword(post, 'ＡｉｒＰｏｄｓ'), '全角输入也应能命中');
    });

    it('关键词两边的多余空格不影响结果', function () {
      var post = T.validLost({ title: '黑色蓝牙耳机' });
      assert.isTrue(LF.matchKeyword(post, '  蓝牙  '));
    });

    it('搜发布人打码后的姓氏也能命中（用于找同学帮忙转发）', function () {
      var post = T.validFound({ contactName: '张明远' });
      assert.isTrue(LF.matchKeyword(post, '张'));
    });
  });

  describe('列表查询 store.list', function () {
    it('不带条件时返回全部信息', function () {
      var store = buildStore();
      assert.lengthOf(store.list(), 4);
    });

    it('按类型筛选：只看寻物', function () {
      var store = buildStore();
      var list = store.list({ type: 'lost' });
      assert.lengthOf(list, 2);
      list.forEach(function (item) { assert.strictEqual(item.type, 'lost'); });
    });

    it('按类型筛选：只看招领', function () {
      var store = buildStore();
      var list = store.list({ type: 'found' });
      assert.lengthOf(list, 2);
    });

    it('按物品分类筛选', function () {
      var store = buildStore();
      var list = store.list({ category: 'card' });
      assert.lengthOf(list, 1);
      assert.strictEqual(list[0].title, '校园卡一张');
    });

    it('按地点区域筛选', function () {
      var store = buildStore();
      var list = store.list({ area: 'library' });
      assert.lengthOf(list, 1);
      assert.strictEqual(list[0].title, '黑色蓝牙耳机');
    });

    it('组合条件：区域 + 类型同时生效', function () {
      var store = buildStore();
      assert.lengthOf(store.list({ area: 'library', type: 'lost' }), 1);
      assert.lengthOf(store.list({ area: 'library', type: 'found' }), 0);
    });

    it('关键词搜索"校园卡"只返回那条校园卡', function () {
      var store = buildStore();
      assert.deepEqual(titles(store.list({ keyword: '校园卡' })), ['校园卡一张']);
    });

    it('搜索无结果时返回空数组而不是报错', function () {
      var store = buildStore();
      var list = store.list({ keyword: '自行车 头盔' });
      assert.isArray(list);
      assert.lengthOf(list, 0);
    });

    it('关键词里含空格时按多词处理', function () {
      var store = buildStore();
      assert.lengthOf(store.list({ keyword: '耳机 图书馆' }), 1);
      assert.lengthOf(store.list({ keyword: '耳机 食堂' }), 0);
    });
  });

  describe('排序', function () {
    it('默认按发布时间从新到旧', function () {
      var store = T.makeStore();
      // 三次发布之间有先后，用 createdAt 严格递增来验证
      store.create(T.validLost({ title: '第一条' }), 'u1');
      store.create(T.validLost({ title: '第二条' }), 'u1');
      store.create(T.validLost({ title: '第三条' }), 'u1');
      var list = store.list();
      assert.isAtLeast(list[0].createdAt, list[1].createdAt);
      assert.isAtLeast(list[1].createdAt, list[2].createdAt);
    });

    it('oldest 把最早发布的排在最前', function () {
      var store = T.makeStore();
      store.create(T.validLost({ title: '先发的' }), 'u1');
      store.create(T.validLost({ title: '后发的' }), 'u1');
      var list = store.list({ sort: 'oldest' });
      assert.strictEqual(list[0].title, '先发的');
    });

    it('hot 按浏览量从多到少', function () {
      var store = buildStore();
      var all = store.list({ sort: 'latest' });
      // 给列表里最后一条刷 5 次浏览，它应当排到第一
      var target = all[all.length - 1].id;
      for (var i = 0; i < 5; i++) store.bumpView(target);

      var hot = store.list({ sort: 'hot' });
      assert.strictEqual(hot[0].id, target);
      assert.strictEqual(hot[0].views, 5);
    });

    it('无法识别的排序方式退回默认排序，不报错', function () {
      var store = buildStore();
      assert.lengthOf(store.list({ sort: '乱填的' }), 4);
    });
  });

  describe('浏览量', function () {
    it('每次 bumpView 让浏览量加一', function () {
      var store = T.makeStore();
      var post = T.publishLost(store, 'u1');
      assert.strictEqual(store.get(post.id).views, 0);
      store.bumpView(post.id);
      store.bumpView(post.id);
      assert.strictEqual(store.get(post.id).views, 2);
    });

    it('浏览不存在的 id 返回 0，不抛异常', function () {
      var store = T.makeStore();
      assert.strictEqual(store.bumpView('不存在的id'), 0);
    });

    it('get 时带上 countView 会同时累加浏览量', function () {
      var store = T.makeStore();
      var post = T.publishLost(store, 'u1');
      var view = store.get(post.id, 'u1', true);
      assert.strictEqual(view.views, 1);
      assert.strictEqual(store.get(post.id).views, 1);
    });
  });

  describe('搜索历史与热门搜索', function () {
    it('记录搜索词，最近搜的排在最前', function () {
      var store = T.makeStore();
      store.pushHistory('校园卡');
      store.pushHistory('耳机');
      assert.deepEqual(store.readHistory(), ['耳机', '校园卡']);
    });

    it('重复搜索同一个词不会产生重复记录，而是提到最前', function () {
      var store = T.makeStore();
      store.pushHistory('校园卡');
      store.pushHistory('耳机');
      store.pushHistory('校园卡');
      assert.deepEqual(store.readHistory(), ['校园卡', '耳机']);
    });

    it('搜索历史最多保留 10 条，更早的被挤掉', function () {
      var store = T.makeStore();
      for (var i = 0; i < 15; i++) store.pushHistory('关键词' + i);
      var history = store.readHistory();
      assert.lengthOf(history, LF.HISTORY_MAX);
      assert.strictEqual(history[0], '关键词14');
      assert.notInclude(history, '关键词0');
    });

    it('空字符串不会被记入历史', function () {
      var store = T.makeStore();
      store.pushHistory('   ');
      assert.lengthOf(store.readHistory(), 0);
    });

    it('可以删除单条历史', function () {
      var store = T.makeStore();
      store.pushHistory('校园卡');
      store.pushHistory('耳机');
      store.removeHistory('耳机');
      assert.deepEqual(store.readHistory(), ['校园卡']);
    });

    it('可以清空历史', function () {
      var store = T.makeStore();
      store.pushHistory('校园卡');
      store.clearHistory();
      assert.lengthOf(store.readHistory(), 0);
    });

    it('热门搜索里包含真实数据中出现最多的分类', function () {
      var store = buildStore();
      var words = store.hotWords(5);
      assert.include(words, '证件卡片', '应当从已有信息里统计出分类词');
    });
  });

  /**
   * 公开特征既然是给失主"找东西"用的，就必须真的能被搜到、被筛到。
   * 光把字段存下来不接进搜索，等于没做。
   */
  describe('公开特征的搜索与筛选', function () {
    it('搜特征值能命中（搜「华为」找到那条耳机）', function () {
      var store = buildStore();
      assert.deepEqual(titles(store.list({ keyword: '华为' })), ['黑色蓝牙耳机']);
    });

    it('没有的取值搜不到', function () {
      var store = buildStore();
      assert.lengthOf(store.list({ keyword: '苹果' }), 0);
    });

    it('按特征精确筛选', function () {
      var store = buildStore();
      assert.deepEqual(titles(store.list({ features: { color: '粉色' } })), ['粉色折叠雨伞']);
    });

    it('特征筛选取值精确匹配，不做模糊', function () {
      var store = buildStore();
      assert.lengthOf(store.list({ features: { color: '粉' } }), 0);
    });

    it('特征筛选可以和分类叠加', function () {
      var store = buildStore();
      assert.lengthOf(store.list({ category: 'umbrella', features: { color: '粉色' } }), 1);
      assert.lengthOf(store.list({ category: 'headphone', features: { color: '粉色' } }), 0);
    });

    it('多个特征之间是「与」的关系', function () {
      var store = buildStore();
      assert.lengthOf(store.list({ features: { color: '黑色', brand: '华为' } }), 1);
      assert.lengthOf(store.list({ features: { color: '粉色', brand: '华为' } }), 0);
    });

    it('空对象和 all 都表示不筛这一项', function () {
      var store = buildStore();
      assert.lengthOf(store.list({ features: {} }), 4);
      assert.lengthOf(store.list({ features: { color: 'all' } }), 4);
    });

    it('没有 features 字段的记录不会被特征筛选炸掉', function () {
      var store = buildStore();
      // 「其他」分类没有特征定义，它的 features 是空对象
      var others = store.list({ category: 'other' });
      assert.lengthOf(others, 1);
      assert.lengthOf(store.list({ category: 'other', features: { color: '黑色' } }), 0);
    });

    it('特征值参与搜索时，别的字段不受影响', function () {
      var store = buildStore();
      assert.deepEqual(titles(store.list({ keyword: '图书馆' })), ['黑色蓝牙耳机']);
    });
  });

  /**
   * 打码卡号：信息里只写满总位数、露出最多 6 位数字，其余用 *。
   * 失主搜自己完整的号码时要能命中——走的是通配匹配，不是普通子串匹配。
   */
  describe('打码卡号的通配搜索', function () {
    var FULL = '350504************';      // 6 位数字 + 12 个 *，共 18 位

    function storeWithCard() {
      var store = T.makeStore();
      var created = store.create(T.validFound({
        title: '身份证一张',
        features: { cardPrefix: FULL }
      }), 'u1');
      assert.isTrue(created.ok, JSON.stringify(created.errors));
      return store;
    }

    it('搜完整身份证号能命中', function () {
      assert.lengthOf(storeWithCard().list({ keyword: '350504200510291653' }), 1);
    });

    it('换一个出生日期的号码同样命中（* 代表任意数字）', function () {
      assert.lengthOf(storeWithCard().list({ keyword: '350504200610301532' }), 1);
    });

    it('不记得中间几位，用 * 顶位也能命中', function () {
      assert.lengthOf(storeWithCard().list({ keyword: '35050420**********' }), 1);
    });

    it('只记得头尾、中间全用 * 也能命中', function () {
      // 注意位数：6 位数字 + 8 个 * + 4 位数字 = 18，和档案里的卡号一样长
      assert.lengthOf(storeWithCard().list({ keyword: '350504********1653' }), 1);
    });

    // 搜索词里的 * 是"这一位我不记得"，模式和搜索词任意一边是 * 就算过
    it('搜索词里的 * 可以盖住拾得者露出来的数字', function () {
      assert.lengthOf(storeWithCard().list({ keyword: '******200510291653' }), 1);
    });

    it('位数不够就不算命中（必须写满总位数）', function () {
      assert.lengthOf(storeWithCard().list({ keyword: '350504200' }), 0);
    });

    it('只报露出的那 6 位也不算命中（位数不一致）', function () {
      assert.lengthOf(storeWithCard().list({ keyword: '350504' }), 0);
    });

    it('位数比卡号多也不算命中', function () {
      assert.lengthOf(storeWithCard().list({ keyword: '3505042005102916530' }), 0);
    });

    it('前 6 位对不上就搜不到', function () {
      assert.lengthOf(storeWithCard().list({ keyword: '350505200510291653' }), 0);
    });

    it('打码区间里的数字不能单独搜到（位数不一致）', function () {
      assert.lengthOf(storeWithCard().list({ keyword: '200510291653' }), 0);
    });

    it('直接把打码串粘进去也能命中', function () {
      assert.lengthOf(storeWithCard().list({ keyword: FULL }), 1);
    });

    // 记下这个结果，不是因为它好，而是因为它是有意为之：
    // 全 * 只表示"这一位我不记得"，等于不筛号码，效果就是"把有卡号的信息捞出来"。
    // 匹配只代表可能相关，能不能拿到联系方式仍然要过认领验证那一关。
    it('搜索词全填 * 相当于不筛号码', function () {
      assert.lengthOf(storeWithCard().list({ keyword: FULL.replace(/[0-9]/g, '*') }), 1);
      // 但捞不出没有卡号特征的信息
      var store = storeWithCard();
      store.create(T.validLost({ category: 'headphone', title: '黑色耳机' }), 'u1');
      assert.lengthOf(store.list({ keyword: FULL.replace(/[0-9]/g, '*') }), 1);
    });

    it('普通字段的搜索没有因此变得宽松', function () {
      var store = storeWithCard();
      assert.lengthOf(store.list({ keyword: '身份证' }), 1);
      assert.lengthOf(store.list({ keyword: '学生证' }), 0);
    });
  });
});
