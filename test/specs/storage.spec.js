/*!
 * 单元测试 —— 存储适配器与容错
 *
 * 本地存储是这个项目唯一的"数据库"，它随时可能出问题：
 * 用户手动改过、上一版数据格式不兼容、空间写满、浏览器禁用了存储。
 * 这些情况在真实使用中一定会遇到，所以专门测一轮——
 * 目标是"任何情况下页面都不能白屏"。
 */
describe('存储适配器与容错', function () {
  var root = typeof globalThis !== 'undefined' ? globalThis : this;
  var LF = root.LF;
  var T = root.T;

  describe('内存适配器', function () {
    it('能存能取', function () {
      var adapter = LF.createMemoryAdapter();
      adapter.setItem('a', '1');
      assert.strictEqual(adapter.getItem('a'), '1');
    });

    it('取不存在的键返回 null', function () {
      assert.isNull(LF.createMemoryAdapter().getItem('没有这个键'));
    });

    it('删除之后就取不到了', function () {
      var adapter = LF.createMemoryAdapter();
      adapter.setItem('a', '1');
      adapter.removeItem('a');
      assert.isNull(adapter.getItem('a'));
    });

    it('值会被转成字符串，和 localStorage 的行为保持一致', function () {
      var adapter = LF.createMemoryAdapter();
      adapter.setItem('n', 123);
      assert.strictEqual(adapter.getItem('n'), '123');
    });
  });

  describe('首次运行灌入演示数据', function () {
    it('空存储时灌入演示数据', function () {
      var store = T.makeStore({ seed: [{ id: 'a', type: 'lost', title: '演示数据' }] });
      assert.lengthOf(store.list(), 1);
    });

    it('已经有数据时不会被覆盖', function () {
      var adapter = LF.createMemoryAdapter();
      var store1 = LF.createStore(adapter, { now: T.FIXED_NOW });
      store1.init([{ id: 'seed', type: 'lost', title: '演示数据' }]);
      T.publishLost(store1, 'u1', { title: '我自己发的' });

      // 模拟刷新页面：用同一个存储再建一个 store
      var store2 = LF.createStore(adapter, { now: T.FIXED_NOW });
      var result = store2.init([{ id: 'seed', type: 'lost', title: '演示数据' }]);

      assert.isFalse(result.seeded);
      assert.lengthOf(store2.list(), 2, '原有数据应当保留');
    });

    it('用户把数据全删光之后，刷新不会又被塞回演示数据', function () {
      var adapter = LF.createMemoryAdapter();
      var seed = [{ id: 'seed', type: 'lost', title: '演示数据', ownerId: 'seed_owner' }];

      var store1 = LF.createStore(adapter, { now: T.FIXED_NOW });
      store1.init(seed);
      assert.isTrue(store1.remove('seed', 'seed_owner').ok, '发布者本人应当能删除自己的信息');

      var store2 = LF.createStore(adapter, { now: T.FIXED_NOW });
      store2.init(seed);
      assert.lengthOf(store2.list(), 0, '空列表是用户的真实状态，不该被覆盖');
    });

    it('演示数据里的时间相对于打开时刻，不会一打开就全是"很久以前"', function () {
      var posts = LF.buildSeedPosts(new Date('2026-10-02T10:00:00'), 'me_x');
      assert.isAbove(posts.length, 5);
      posts.forEach(function (post) {
        var created = new Date(post.createdAt).getTime();
        assert.isBelow(created, new Date('2026-10-02T10:00:01').getTime(), post.title);
      });
    });

    it('演示数据里有归属于本机用户的信息，保证"我的发布"不是空的', function () {
      var posts = LF.buildSeedPosts(new Date('2026-10-02T10:00:00'), 'me_x');
      var mine = posts.filter(function (p) { return p.ownerId === 'me_x'; });
      assert.isAtLeast(mine.length, 2);
    });

    it('演示数据里包含已完成的信息，便于展示状态维护效果', function () {
      var posts = LF.buildSeedPosts(new Date('2026-10-02T10:00:00'), 'me_x');
      var done = posts.filter(function (p) { return p.status === 'done'; });
      assert.isAtLeast(done.length, 2);
      done.forEach(function (post) {
        assert.isNotNull(post.doneType, post.title + ' 已完成但没有 doneType');
        assert.isNotNull(post.doneAt);
      });
    });

    it('演示数据的分类、区域都必须在字典里，否则页面会显示"未分类"', function () {
      var posts = LF.buildSeedPosts(new Date('2026-10-02T10:00:00'), 'me_x');
      posts.forEach(function (post) {
        assert.include(LF.fields(LF.CATEGORIES), post.category, post.title);
        assert.include(LF.fields(LF.AREAS), post.area, post.title);
        assert.include(LF.fields(LF.TYPES), post.type, post.title);
      });
    });

    /**
     * 演示数据是最容易被忘掉的一环：seed.js 的 post() 是个白名单构造函数，
     * 漏了 features 那一行不会报任何错，页面上只是"特征行不见了"。
     */
    it('演示数据的公开特征必须齐全、取值合法，且不能有多余字段', function () {
      var posts = LF.buildSeedPosts(new Date('2026-10-02T10:00:00'), 'me_x');

      posts.forEach(function (post) {
        var defs = LF.featuresFor(post.category);

        defs.forEach(function (def) {
          var value = post.features ? post.features[def.key] : '';
          assert.notStrictEqual(value, '', post.title + ' 缺少公开特征：' + def.key);
          if (def.kind === 'select') {
            assert.include(def.options, value,
              post.title + ' 的 ' + def.key + ' 取值「' + value + '」不在字典选项里');
          }
          if (def.kind === 'text' && def.pattern) {
            assert.match(value, def.pattern, post.title + ' 的 ' + def.key + ' 格式不对');
          }
        });

        assert.lengthOf(LF.featureValues(post), defs.length,
          post.title + ' 出现了字典里没定义的特征字段（换分类后的残留？）');
      });
    });

    it('锁了公开特征的分类，演示数据里不再留自由描述', function () {
      var posts = LF.buildSeedPosts(new Date('2026-10-02T10:00:00'), 'me_x');

      posts.forEach(function (post) {
        if (!LF.featuresFor(post.category).length) return;   // 「其他」保留描述
        assert.strictEqual(post.description, '',
          post.title + ' 属于锁死特征的分类，公开描述应当留空');
      });
    });
  });

  describe('脏数据容错', function () {
    it('存储里是坏掉的 JSON 时，返回空列表而不是抛异常', function () {
      var adapter = LF.createMemoryAdapter();
      adapter.setItem(LF.KEYS.posts, '{这不是合法的 JSON');
      var store = LF.createStore(adapter, { now: T.FIXED_NOW });

      var list;
      assert.doesNotThrow(function () { list = store.list(); });
      assert.lengthOf(list, 0);
    });

    it('存储里是字符串而不是数组时，也返回空列表', function () {
      var adapter = LF.createMemoryAdapter();
      adapter.setItem(LF.KEYS.posts, '"我是个字符串"');
      var store = LF.createStore(adapter, { now: T.FIXED_NOW });
      assert.lengthOf(store.list(), 0);
    });

    it('数组里混入结构不对的条目时，坏条目被跳过，好条目照常显示', function () {
      var adapter = LF.createMemoryAdapter();
      var good = {
        id: 'good_1', type: 'lost', title: '正常的信息', category: 'card', area: 'teaching',
        location: '教学楼', happenedAt: '2026-10-01T09:00:00.000Z', description: '',
        photos: [], contactName: '张三', contactDept: '', contactWay: '微信：abc',
        status: 'open', doneType: null, doneAt: null,
        createdAt: 1759300000000, updatedAt: 1759300000000, views: 0,
        ownerId: 'u1', questions: [], claims: [], appeals: [], attemptsLeft: 3
      };
      adapter.setItem(LF.KEYS.posts, JSON.stringify([good, null, '字符串', { 没有id: true }, 42]));

      var store = LF.createStore(adapter, { now: T.FIXED_NOW });
      var list = store.list();
      assert.lengthOf(list, 1, '只有结构完整的条目应当出现');
      assert.strictEqual(list[0].title, '正常的信息');
    });

    it('取一条不存在的 id 返回 null，页面据此显示"信息不存在"', function () {
      var store = T.makeStore();
      assert.isNull(store.get('根本没有这个 id'));
      assert.isFalse(store.exists('根本没有这个 id'));
    });

    it('存储读失败时不抛异常，退化成空数据', function () {
      var broken = {
        name: 'broken',
        getItem: function () { throw new Error('读失败'); },
        setItem: function () { throw new Error('写失败'); },
        removeItem: function () { throw new Error('删失败'); }
      };
      var store = LF.createStore(broken, { now: T.FIXED_NOW });
      assert.doesNotThrow(function () { store.list(); });
      assert.lengthOf(store.list(), 0);
    });
  });

  describe('存储空间不足', function () {
    it('写入超出配额时返回中文提示，而不是把异常抛给页面', function () {
      var quotaError = new Error('quota');
      quotaError.name = 'QuotaExceededError';
      var adapter = {
        name: 'quota',
        getItem: function () { return null; },
        setItem: function () { throw quotaError; },
        removeItem: function () {}
      };
      var store = LF.createStore(adapter, { now: T.FIXED_NOW });

      var result = store.create(T.validFound(), 'u1');
      assert.isFalse(result.ok);
      assert.match(result.errors._, /存储空间不足/);
      assert.match(result.errors._, /删除/, '提示里要告诉用户怎么解决');
    });

    it('非配额类错误也给出可读提示', function () {
      var adapter = {
        name: 'bad',
        getItem: function () { return null; },
        setItem: function () { throw new Error('磁盘错误'); },
        removeItem: function () {}
      };
      var store = LF.createStore(adapter, { now: T.FIXED_NOW });
      var result = store.create(T.validFound(), 'u1');
      assert.isFalse(result.ok);
      assert.match(result.errors._, /保存失败/);
    });
  });

  describe('本机身份', function () {
    it('第一次调用生成 id，之后保持不变', function () {
      var store = T.makeStore();
      var first = store.myId();
      assert.isString(first);
      assert.isAbove(first.length, 0);
      assert.strictEqual(store.myId(), first, '刷新后必须还是同一个身份，否则我的发布会丢');
    });

    it('身份标识里带上了可读前缀，便于排查问题', function () {
      var store = T.makeStore();
      assert.match(store.myId(), /^me_/);
    });

    it('保存并读取联系信息', function () {
      var store = T.makeStore();
      store.saveMe({ name: '张明远', dept: '信息与计算科学 2023 级', way: '微信：zhangmy2023' });
      var me = store.getMe();
      assert.strictEqual(me.name, '张明远');
      assert.strictEqual(me.way, '微信：zhangmy2023');
    });

    it('没有保存过联系信息时返回空对象而不是 null', function () {
      var store = T.makeStore();
      var me = store.getMe();
      assert.isObject(me);
      assert.strictEqual(me.name, '');
    });
  });

  describe('数据导出与复位', function () {
    it('导出的数据包含全部信息、搜索历史和解锁记录', function () {
      var store = T.makeStore();
      var post = T.publishFound(store, 'u1');
      store.pushHistory('校园卡');
      store.markUnlocked(post.id, 'CL-2026-0001');

      var dump = store.exportAll();
      assert.lengthOf(dump.posts, 1);
      assert.deepEqual(dump.history, ['校园卡']);
      assert.lengthOf(dump.unlocked, 1);
      assert.strictEqual(dump.version, LF.DATA_VERSION);
    });

    it('复位后回到只剩演示数据的状态，历史与解锁记录被清空', function () {
      var store = T.makeStore();
      T.publishFound(store, 'u1');
      store.pushHistory('校园卡');

      store.resetAll([{ id: 'seed', type: 'lost', title: '演示数据', createdAt: 1, category: 'card', area: 'teaching' }]);

      assert.lengthOf(store.list(), 1);
      assert.lengthOf(store.readHistory(), 0);
      assert.lengthOf(store.readUnlocked(), 0);
    });

    it('估算的占用大小随照片增加而增长', function () {
      var store = T.makeStore();
      T.publishLost(store, 'u1');
      var before = store.usage().bytes;

      T.publishFound(store, 'u1', { photos: ['data:image/jpeg;base64,' + new Array(500).join('A')] });
      var after = store.usage().bytes;
      assert.isAbove(after, before);
    });
  });
});
