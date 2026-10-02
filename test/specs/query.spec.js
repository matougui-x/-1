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

  /** 造一批用于搜索的数据：每条的可搜索字段都是刻意设计的。 */
  function buildStore() {
    var store = T.makeStore();
    var me = 'me_1';

    store.create(T.validFound({
      title: '校园卡一张',
      category: 'card',
      area: 'teaching',
      location: '教学楼 A 栋 301 教室',
      description: '在最后一排捡到的，卡面有贴纸。',
      hidden: [{ q: '卡面姓名', a: '王小明' }, { q: '卡号后四位', a: '3882' }]
    }), me);

    store.create(T.validLost({
      title: '黑色蓝牙耳机',
      category: 'headphone',
      area: 'library',
      location: '图书馆三楼自习区',
      description: '带充电盒，磨砂黑。'
    }), 'other_1');

    store.create(T.validFound({
      title: '粉色折叠雨伞',
      category: 'umbrella',
      area: 'canteen',
      location: '第二食堂门口',
      description: '伞套还在。',
      hidden: [{ q: '伞面颜色', a: '浅粉色' }, { q: '伞柄特征', a: '直柄' }]
    }), 'other_2');

    store.create(T.validLost({
      title: '宿舍钥匙一串',
      category: 'key',
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
});
