/*!
 * 校园失物招领 —— 全局配置
 * 所有"业务字典"集中在这里：信息类型、物品分类、地点区域、状态、隐藏特征预设问题。
 * 页面与数据层都不写死中文字面量，一律从这里取，便于统一维护。
 */
(function (root) {
  'use strict';

  var LF = (root.LF = root.LF || {});

  /** 数据版本号，改变数据结构时递增，用于旧数据迁移。 */
  LF.DATA_VERSION = 1;

  /** 本地存储键名。加前缀避免与同源下其它页面冲突。 */
  LF.KEYS = {
    posts: 'lf.posts.v1',        // 全部失物招领信息
    history: 'lf.history.v1',    // 搜索历史
    unlocked: 'lf.unlocked.v1',  // 本机已通过认领验证的信息 id
    lastClaim: 'lf.lastClaim.v1',// 最近一次认领验证的结果（验证页跳结果页时传递）
    me: 'lf.me.v1',              // 本机身份（昵称 + 联系方式，发布时自动带出）
    uid: 'lf.uid.v1'             // 本机唯一标识，用于判断"我的发布"
  };

  /** 信息类型。 */
  LF.TYPES = [
    { key: 'lost', name: '寻物', full: '寻物（我丢了东西）', tag: 'lost' },
    { key: 'found', name: '招领', full: '招领（我捡到了东西）', tag: 'found' }
  ];

  /** 物品分类，icon 同时作为没有照片时的缩略图。 */
  LF.CATEGORIES = [
    { key: 'card', name: '证件卡片', icon: '💳' },
    { key: 'key', name: '钥匙', icon: '🔑' },
    { key: 'headphone', name: '耳机', icon: '🎧' },
    { key: 'umbrella', name: '雨伞', icon: '☂️' },
    { key: 'book', name: '书籍', icon: '📚' },
    { key: 'cup', name: '水杯', icon: '🥤' },
    { key: 'electronics', name: '电子产品', icon: '📱' },
    { key: 'bag', name: '包与书包', icon: '🎒' },
    { key: 'clothing', name: '衣物配饰', icon: '🧥' },
    { key: 'glasses', name: '眼镜', icon: '👓' },
    { key: 'other', name: '其他', icon: '📦' }
  ];

  /** 地点区域，用于列表筛选；具体地点由用户在此基础上补充。 */
  LF.AREAS = [
    { key: 'teaching', name: '教学楼', icon: '🏫', spots: ['教学楼 A 栋', '教学楼 B 栋', '教学楼 C 栋', '阶梯教室', '一楼值班室'] },
    { key: 'library', name: '图书馆', icon: '📖', spots: ['图书馆一楼大厅', '图书馆一楼借还书台', '图书馆二楼自习区', '图书馆三楼自习区'] },
    { key: 'canteen', name: '食堂', icon: '🍽️', spots: ['第一食堂', '第一食堂二楼', '第二食堂', '第二食堂门口', '清真食堂'] },
    { key: 'gym', name: '体育馆与运动场', icon: '🏀', spots: ['体育馆篮球场', '体育馆羽毛球场', '田径场', '网球场'] },
    { key: 'dorm', name: '宿舍区', icon: '🏠', spots: ['1 号宿舍楼', '2 号宿舍楼', '3 号宿舍楼', '宿舍楼下快递柜'] },
    { key: 'road', name: '校园道路', icon: '🛣️', spots: ['主干道', '校车站', '校门口', '共享单车停放点'] },
    { key: 'other', name: '其他地点', icon: '📍', spots: [] }
  ];

  /** 信息状态。open = 进行中，done = 已完成。 */
  LF.STATUS = {
    open: { key: 'open', name: '进行中' },
    done: { key: 'done', name: '已完成' }
  };

  /** 已完成的具体类型：寻物信息标记"已找到"，招领信息标记"已归还"。 */
  LF.DONE_TYPES = {
    lost: { key: 'found', name: '已找到', chip: '已完成' },
    found: { key: 'returned', name: '已归还', chip: '已完成' }
  };

  /** 列表排序方式。 */
  LF.SORTS = [
    { key: 'latest', name: '最新发布' },
    { key: 'oldest', name: '最早发布' },
    { key: 'hot', name: '最多浏览' }
  ];

  /**
   * 隐藏特征预设问题：按物品分类给出候选问题，发布者只需填写答案。
   * 答案不会出现在首页、搜索结果和详情页（详见 store.js 的 toPublic）。
   */
  LF.HIDDEN_PRESETS = {
    card: [
      { q: '卡面姓名', ask: '卡面上的姓名是什么？' },
      { q: '卡号后四位', ask: '卡号后四位是多少？' },
      { q: '卡面标记', ask: '卡面上有什么贴纸、签名或磨损特征？' }
    ],
    key: [
      { q: '挂件特征', ask: '钥匙上有什么挂件或装饰？' },
      { q: '钥匙数量', ask: '这一串一共有几把钥匙？' },
      { q: '钥匙用途', ask: '是宿舍钥匙、车钥匙还是别的？' }
    ],
    headphone: [
      { q: '品牌型号', ask: '耳机的品牌或型号是什么？' },
      { q: '颜色特征', ask: '耳机是什么颜色？' },
      { q: '充电盒标记', ask: '充电盒上有什么贴纸或划痕？' }
    ],
    umbrella: [
      { q: '伞面颜色', ask: '伞面是什么颜色、什么花纹？' },
      { q: '伞柄特征', ask: '伞柄是什么样式、有什么特征？' },
      { q: '品牌标记', ask: '伞上有品牌标志吗？是什么？' }
    ],
    book: [
      { q: '书名', ask: '这本书的书名是什么？' },
      { q: '扉页签名', ask: '扉页或封面内页写了什么？' },
      { q: '笔记特征', ask: '书里有什么样的笔记或标记？' }
    ],
    cup: [
      { q: '杯身颜色', ask: '杯子是什么颜色？' },
      { q: '容量与品牌', ask: '容量多大？是什么品牌？' },
      { q: '杯身图案', ask: '杯身上有什么图案或贴纸？' }
    ],
    electronics: [
      { q: '品牌型号', ask: '设备是什么品牌和型号？' },
      { q: '锁屏或壁纸', ask: '锁屏壁纸或桌面是什么样子？' },
      { q: '外观特征', ask: '机身有什么划痕、贴纸或保护壳？' }
    ],
    bag: [
      { q: '颜色与款式', ask: '包是什么颜色、什么款式？' },
      { q: '包内物品', ask: '包里有什么标志性的物品？' },
      { q: '挂饰特征', ask: '包上有什么挂饰或徽章？' }
    ],
    clothing: [
      { q: '颜色与尺码', ask: '衣物是什么颜色、多大尺码？' },
      { q: '品牌标记', ask: '有什么品牌标志或洗标信息？' },
      { q: '特殊记号', ask: '有什么污渍、破损或自己做的记号？' }
    ],
    glasses: [
      { q: '镜框颜色', ask: '镜框是什么颜色、什么材质？' },
      { q: '镜片特征', ask: '镜片有什么特殊处理或厚度特征？' },
      { q: '镜盒特征', ask: '镜盒或镜布是什么样式？' }
    ],
    other: [
      { q: '外观特征', ask: '物品有什么一眼能认出的外观特征？' },
      { q: '内部标记', ask: '物品内部或底部有什么标记？' },
      { q: '来源线索', ask: '在哪里购买或获得的？' }
    ]
  };

  /** 认领验证规则。 */
  LF.VERIFY = {
    askCount: 3,        // 一次最多抽几题（不足则按实际数量抽）
    pickCount: 2,       // 实际抽取作答的题数
    maxAttempts: 3,     // 最多尝试次数，用完转人工核对
    minHidden: 2,       // 招领信息至少设置几项隐藏特征
    maxHidden: 3
  };

  /** 首页"大家都在搜"，按实际数据可调整。 */
  LF.HOT_WORDS = ['校园卡', '雨伞', '水杯', '充电宝', '钥匙', '耳机', '学生证'];

  /** 搜索历史最多保留条数。 */
  LF.HISTORY_MAX = 10;

  // ---- 便捷查询函数 ----

  LF.categoryOf = function (key) {
    return LF.findBy(LF.CATEGORIES, key) || { key: key, name: '未分类', icon: '📦' };
  };

  LF.areaOf = function (key) {
    return LF.findBy(LF.AREAS, key) || { key: key, name: '其他地点', icon: '📍', spots: [] };
  };

  LF.typeOf = function (key) {
    return LF.findBy(LF.TYPES, key) || LF.TYPES[0];
  };

  LF.findBy = function (list, key) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key) return list[i];
    }
    return null;
  };

  LF.fields = function (list) {
    return list.map(function (item) { return item.key; });
  };

  /** 某个分类可用的隐藏特征预设问题。 */
  LF.presetsFor = function (categoryKey) {
    return LF.HIDDEN_PRESETS[categoryKey] || LF.HIDDEN_PRESETS.other;
  };

  /** 按问题名反查提问句（详情页和答题页都用它把"卡面姓名"变成一句问话）。 */
  LF.askOf = function (categoryKey, questionName) {
    var presets = LF.presetsFor(categoryKey);
    for (var i = 0; i < presets.length; i++) {
      if (presets[i].q === questionName) return presets[i].ask;
    }
    return '请回答：' + questionName + '？';
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
