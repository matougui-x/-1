/*!
 * 校园失物招领 —— 全局配置
 * 所有"业务字典"集中在这里：信息类型、物品分类、地点区域、状态、认领验证题型的出题模板。
 * 页面与数据层都不写死中文字面量，一律从这里取，便于统一维护。
 */
(function (root) {
  'use strict';

  var LF = (root.LF = root.LF || {});

  /** 数据版本号，改变数据结构时递增，用于旧数据迁移（见 store.js 的 migratePost）。 */
  LF.DATA_VERSION = 2;

  /** 本地存储键名。加前缀避免与同源下其它页面冲突。 */
  LF.KEYS = {
    posts: 'lf.posts.v1',        // 全部失物招领信息（键名不变，靠 DATA_VERSION 做就地迁移）
    history: 'lf.history.v1',    // 搜索历史
    unlocked: 'lf.unlocked.v1',  // 本机已通过认领验证的信息 id
    lastClaim: 'lf.lastClaim.v1',// 最近一次认领验证的结果（验证页跳结果页时传递）
    lastAppeal: 'lf.lastAppeal.v1', // 最近一次提交的申诉（申诉页跳结果页时传递）
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
   * 认领验证的题型。第二版方案只允许客观题：
   * 判断题由系统固定给出「正确 / 错误」，选择题由发布者写 2–4 个选项。
   */
  LF.QUESTION_TYPES = [
    { key: 'judge', name: '判断题', hint: '系统固定给出「正确 / 错误」两个选项' },
    { key: 'choice', name: '选择题', hint: '自己写 2–4 个选项，并指定正确答案' }
  ];

  /** 判断题的固定选项，顺序即答案下标（0 = 正确，1 = 错误）。 */
  LF.JUDGE_OPTIONS = ['正确', '错误'];

  /**
   * 出题模板：按物品分类给两条可直接插入的客观题，发布者改一改就能用。
   * 只提供题干和候选项，"哪一项才是对的"必须由发布者自己指定。
   */
  LF.QUESTION_TEMPLATES = {
    card: [
      { type: 'judge', stem: '卡面上有贴纸、签名或其他人为做的标记' },
      { type: 'choice', stem: '卡主所在的年级是', options: ['大一', '大二', '大三', '大四'] }
    ],
    key: [
      { type: 'judge', stem: '钥匙上挂着挂件或装饰' },
      { type: 'choice', stem: '这一串钥匙的用途是', options: ['宿舍钥匙', '车钥匙', '柜子钥匙', '其他'] }
    ],
    headphone: [
      { type: 'judge', stem: '充电盒或耳机上有贴纸、明显划痕' },
      { type: 'choice', stem: '耳机的品牌是', options: ['苹果', '华为', '小米', '索尼'] }
    ],
    umbrella: [
      { type: 'judge', stem: '伞面是纯色、没有花纹' },
      { type: 'choice', stem: '伞柄的样子是', options: ['直柄', '弯柄', '自动伸缩', '折叠短柄'] }
    ],
    book: [
      { type: 'judge', stem: '书的扉页或内页写有名字' },
      { type: 'choice', stem: '书里的笔记主要用什么颜色标注', options: ['黑色', '红色', '蓝色', '荧光黄'] }
    ],
    cup: [
      { type: 'judge', stem: '杯身贴着贴纸或印有图案' },
      { type: 'choice', stem: '杯子的主要颜色是', options: ['白色', '黑色', '蓝色', '粉色'] }
    ],
    electronics: [
      { type: 'judge', stem: '设备上有明显的划痕或磕碰' },
      { type: 'choice', stem: '设备外面的保护壳是', options: ['透明壳', '黑色壳', '彩色壳', '没有保护壳'] }
    ],
    bag: [
      { type: 'judge', stem: '包上挂着挂饰或徽章' },
      { type: 'choice', stem: '包里最显眼的物品是', options: ['笔记本电脑', '课本', '水杯', '雨伞'] }
    ],
    clothing: [
      { type: 'judge', stem: '衣物上有污渍、破损或自己做的记号' },
      { type: 'choice', stem: '衣物的尺码是', options: ['S', 'M', 'L', 'XL'] }
    ],
    glasses: [
      { type: 'judge', stem: '镜片有明显的厚度或特殊镀膜' },
      { type: 'choice', stem: '镜框的材质看起来是', options: ['塑料', '金属', '半框', '无框'] }
    ],
    other: [
      { type: 'judge', stem: '物品上有一眼能认出的个人标记' },
      { type: 'choice', stem: '物品是在什么地方被捡到的', options: ['教室或自习室', '食堂', '路上', '运动场'] }
    ]
  };

  /**
   * 认领验证规则（第二版：纯客观题 + 限制次数）。
   *
   * 第一版是"系统按分类预设问题、发布者只填答案、认领时随机抽 2 题手打答案"，
   * 有两个绕不开的毛病：答案措辞稍有出入（"深蓝色"和"藏青"）就误判，
   * 而且答错时系统要指出是哪题错，等于把剩余题目的答案范围缩小了。
   * 第二版改成发布者自己出客观题、一次答完、统一判定。
   */
  LF.VERIFY = {
    minQuestions: 3,        // 至少出几题
    maxQuestions: 5,        // 最多出几题
    suggestedQuestions: 4,  // 建议题量（界面上按这个提示）
    maxAttempts: 3,         // 认领者最多答几次，用完才解锁【申诉】
    minOptions: 2,          // 选择题最少几个选项
    maxOptions: 4,          // 选择题最多几个选项
    stemMin: 4,             // 题干最短字数
    stemMax: 60,            // 题干最长字数
    optionMax: 16           // 单个选项最长字数
  };

  /** 申诉（3 次全败后的人工审核通道）。 */
  LF.APPEAL = {
    nameMax: 20,
    contactMin: 3,
    contactMax: 60,
    detailMin: 10,
    detailMax: 300
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

  /** 某个分类可用的出题模板。 */
  LF.templatesFor = function (categoryKey) {
    return LF.QUESTION_TEMPLATES[categoryKey] || LF.QUESTION_TEMPLATES.other;
  };

  /** 题型字典查询。 */
  LF.questionTypeOf = function (key) {
    return LF.findBy(LF.QUESTION_TYPES, key) || LF.QUESTION_TYPES[0];
  };

  /** 判断题与选择题各几道，界面上用来说明"这套题长什么样"。 */
  LF.questionMix = function (questions) {
    var list = Array.isArray(questions) ? questions : [];
    var mix = { judge: 0, choice: 0, total: list.length };
    list.forEach(function (item) {
      if (item && item.type === 'judge') mix.judge++;
      else if (item && item.type === 'choice') mix.choice++;
    });
    return mix;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
