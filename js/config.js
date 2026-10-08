/*!
 * 校园失物招领 —— 全局配置
 * 所有"业务字典"集中在这里：信息类型、物品分类、地点区域、状态、认领验证题型的出题模板。
 * 页面与数据层都不写死中文字面量，一律从这里取，便于统一维护。
 */
(function (root) {
  'use strict';

  var LF = (root.LF = root.LF || {});

  /** 数据版本号，改变数据结构时递增，用于旧数据迁移（见 store.js 的 migratePost）。 */
  LF.DATA_VERSION = 4;

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

  /**
   * 物品分类，icon 同时作为没有照片时的缩略图。
   *
   * ★ searchHint 是给**失主**看的引导语，首页选中分类时显示。
   *
   * 为什么要专门写这句话：分类的公开特征被 LF.FEATURES 锁死之后，
   * 一条信息能"搜得到"的内容只剩标题、地点和那一两个特征。可失主不知道，
   * 他还是会搜「蓝色充电宝」这种描述里才有的词，结果是 0 条——而
   * "0 条结果"和"没人捡到"在页面上长得一模一样，他会直接得出错误的结论。
   * 所以每个分类都要明说"这里能搜什么、什么搜不到"。
   *
   * 不变的规矩：只要某个分类在 LF.FEATURES 里定义了特征，它就**必须**有 searchHint；
   * 兜底的「其他」也有，但它讲的是另一件事——那一类没有可锁的特征、也不出验证题，
   * 所以引导失主"翻列表、按地点找、直接联系发布者"（信任原则，见 store.js 的 LF.allowVerifyFor）。
   * test/specs/validate.spec.js 有两条用例替我们守着这两半规矩。
   */
  LF.CATEGORIES = [
    { key: 'card', name: '证件卡片', icon: '💳', searchHint: '本类只公开卡号：请按证件号搜索（记不全的位用 * 顶位，位数要和卡号一样长），姓名、院系、卡号之外的细节都不公开。' },
    { key: 'headphone', name: '耳机', icon: '🎧', searchHint: '本类只公开品牌和颜色：请按品牌或颜色搜索，充电盒、外观磨损这类细节不公开。' },
    { key: 'umbrella', name: '雨伞', icon: '☂️', searchHint: '本类只公开伞面颜色和柄型：请按颜色或柄型搜索，图案、划痕这类细节不公开。' },
    { key: 'cup', name: '水杯', icon: '🥤', searchHint: '本类只公开颜色和材质：请按颜色或材质搜索，贴纸、图案这类细节不公开。' },
    { key: 'electronics', name: '电子产品', icon: '📱', searchHint: '本类只公开品牌和型号：请按品牌或型号搜索，颜色、外观、保护壳都不在公开信息里。' },
    { key: 'bag', name: '包与书包', icon: '🎒', searchHint: '本类只公开类型和颜色：请按类型或颜色搜索，包里的东西、挂饰这类细节不公开。' },
    { key: 'clothing', name: '衣物配饰', icon: '🧥', searchHint: '本类只公开类型和颜色：请按类型或颜色搜索，尺码、污渍、记号这类细节不公开。' },
    { key: 'glasses', name: '眼镜', icon: '👓', searchHint: '本类只公开镜框材质和镜框颜色：请按材质或颜色搜索，镜片、镜腿上的细节不公开。' },
    { key: 'other', name: '其他', icon: '📦', searchHint: '这一类不好指定公开特征，也不出认证题：发布者会把描述和照片直接公开，请翻列表（或用描述里的词、按地点）找，翻到了直接联系发布者核对。' }
  ];

  /**
   * 特征字段的类型。
   * select：取值来自固定选项，两两分得清（失主能直接拿来筛选）；
   * text：取值发散（型号、卡号前缀），不做下拉，只进搜索。
   */
  LF.FEATURE_KINDS = ['select', 'text'];

  /** 颜色类特征共用的选项。七个分类都引用这一份，改一次全生效。只读，别改它。 */
  LF.COMMON_COLORS = ['黑色', '白色', '灰色', '蓝色', '红色', '粉色', '绿色', '黄色', '棕色', '紫色', '其他'];

  /**
   * 公开特征字典：★ 每个分类对外**只能**露出这里定死的 1–2 项，别的都不许写。
   *
   * 为什么要把公开信息锁死：
   *   1. 防泄漏。原来那条 300 字的自由描述，是拾得者"顺手把特征写出来"的主要出口——
   *      演示数据里就有：描述写着"伞柄有一道划痕"，而验证题正好问伞面最明显的特征。
   *   2. 方便查找。特征取值固定，失主才能按"品牌=华为"这种条件筛，也才能搜得到。
   *
   * ★ 还有一条不写在代码里但必须守的规矩：**这份白名单同时是"出题禁区"。**
   *   品牌既然公开了，验证题就不能再问品牌，否则就是给冒领者送分。
   *   QUESTION_TEMPLATES 里的题目只问磨损、内容物、个人记号这类公开面看不到的东西。
   *
   * ⚠️ 改这个字典时记得同步三处：seed.js 的演示数据、test/specs 的夹具、
   *    README 与博客里的出题规则表。
   *    再加一处：LF.CATEGORIES 里每个分类的 searchHint（首页给失主的"请搜什么"引导，
   *    见 LF.searchHintFor）。字段名改了而引导语照旧，失主就会照着错的提示去搜——
   *    test/specs/validate.spec.js 有一条用例专门守这个。
   *
   * other 刻意不定义：它在发布页保留自由描述框，是唯一的兜底分类。
   */
  LF.FEATURES = {
    card: [
      {
        key: 'cardPrefix', name: '卡号（打码）', kind: 'text', wildcard: true,
        minLen: 6, maxLen: 24, maxDigits: 6,
        pattern: /^[0-9*]+$/, format: '只能填数字，其余位置请用 * 代替',
        hint: '照卡号的总位数写满，其中最多写出 6 位数字，其余一律用 * 顶位：' +
          '比如 18 位的身份证写成「350504************」。' +
          '失主搜索时位数也要写满，不记得的位置同样用 * 代替，' +
          '比如搜 350504200510291653、35050420********** 或 350504********1653 都能找到这条。'
      }
    ],
    headphone: [
      { key: 'brand', name: '品牌', kind: 'select', options: ['苹果', '华为', '小米', '索尼', '三星', '漫步者', '其他'] },
      { key: 'color', name: '外观颜色', kind: 'select', options: LF.COMMON_COLORS }
    ],
    umbrella: [
      { key: 'color', name: '伞面颜色', kind: 'select', options: LF.COMMON_COLORS },
      { key: 'handle', name: '柄型', kind: 'select', options: ['直柄', '弯柄', '自动伸缩', '折叠短柄'] }
    ],
    cup: [
      { key: 'color', name: '颜色', kind: 'select', options: LF.COMMON_COLORS },
      { key: 'material', name: '材质', kind: 'select', options: ['不锈钢', '塑料', '玻璃', '陶瓷', '其他'] }
    ],
    electronics: [
      { key: 'brand', name: '品牌', kind: 'select', options: ['苹果', '华为', '小米', '联想', '戴尔', '索尼', '其他'] },
      { key: 'model', name: '型号', kind: 'text', maxLen: 20, hint: '只填型号，比如「FreeBuds SE」。' }
    ],
    bag: [
      { key: 'bagType', name: '类型', kind: 'select', options: ['双肩包', '单肩包', '斜挎包', '手提包', '行李箱'] },
      { key: 'color', name: '颜色', kind: 'select', options: LF.COMMON_COLORS }
    ],
    clothing: [
      { key: 'clothType', name: '类型', kind: 'select', options: ['外套', '卫衣', 'T恤', '裤子', '帽子', '围巾', '其他'] },
      { key: 'color', name: '颜色', kind: 'select', options: LF.COMMON_COLORS }
    ],
    glasses: [
      { key: 'frameMaterial', name: '镜框材质', kind: 'select', options: ['塑料', '金属', '半框', '无框', '其他'] },
      { key: 'color', name: '镜框颜色', kind: 'select', options: LF.COMMON_COLORS }
    ]
  };

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
   *
   * ★ 出题禁区：这里的问题**只问 LF.FEATURES 看不到的东西**——磨损、内容物、
   *   个人记号、附件细节。凡是已经公开的特征（品牌、颜色、柄型、材质…）都不能再问，
   *   问了就是给冒领者送分：他翻一眼列表就知道该选哪项。
   *   改模板前先对照上面那份白名单。
   */
  LF.QUESTION_TEMPLATES = {
    card: [
      { type: 'judge', stem: '卡面上有贴纸、签名或其他人为做的标记' },
      { type: 'choice', stem: '卡套的样子是', options: ['透明卡套', '带图案的卡套', '卡套背面贴了东西', '没有卡套'] }
    ],
    headphone: [
      { type: 'judge', stem: '充电盒或耳机上有贴纸、明显划痕' },
      { type: 'choice', stem: '充电盒的磨损情况是', options: ['几乎全新', '有轻微划痕', '有明显磕碰', '盒盖有点松'] }
    ],
    umbrella: [
      { type: 'judge', stem: '伞骨内侧有生锈的痕迹' },
      { type: 'choice', stem: '伞面上最特别的细节是', options: ['印着校徽或字样', '有卡通或碎花图案', '有一道划痕或破损', '没有特别图案'] }
    ],
    cup: [
      { type: 'judge', stem: '杯身贴着贴纸或印有图案' },
      { type: 'choice', stem: '杯盖的样子是', options: ['带吸管', '翻盖式', '旋盖式', '没有杯盖'] }
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
      { type: 'choice', stem: '镜腿上的细节是', options: ['印着品牌字样', '缠着透明胶带', '有明显划痕', '没有特别之处'] }
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

  /**
   * 易混词组：同一组里的说法，认领者常常分不清该选哪个。
   *
   * 这不是同义词表，而是"会让真失主自己选错"的说法。最典型的是颜色：
   * 发布者把「深蓝色」和「藏青」当成两个选项，东西明明是藏青色的同学，
   * 看见「深蓝色」也会觉得说的就是自己那件，随手就选错了——
   * 这等于把第一版"自由文本判不准"的老毛病搬到了选项里，必须拦下来。
   *
   * 组怎么划分（匹配算法见 store.js 的 confusableOptionPair）：
   *   - 一个说法只归一组，取命中的**最长**那个词，所以「深蓝色」落在第一组、
   *     「浅蓝色」落在第二组，深蓝和浅蓝是两种能分清的颜色，不会被误判成同一色；
   *   - 浅色系与深色系刻意分开，同一个色系里的深浅两档（深蓝 / 浅蓝）不算易混。
   */
  LF.CONFUSABLE_GROUPS = [
    ['蓝色', '深蓝', '深蓝色', '藏青', '藏蓝色', '靛蓝', '宝蓝', '宝蓝色'],
    ['浅蓝', '浅蓝色', '淡蓝', '淡蓝色', '天蓝', '天蓝色', '湖蓝', '湖蓝色'],
    ['绿色', '深绿', '深绿色', '墨绿', '墨绿色', '军绿', '军绿色', '橄榄绿'],
    ['浅绿', '浅绿色', '草绿', '草绿色', '薄荷绿', '苹果绿'],
    ['红色', '深红', '深红色', '暗红', '暗红色', '酒红', '酒红色', '砖红', '枣红'],
    ['粉色', '粉红', '粉红色', '浅红', '浅红色', '淡粉', '藕粉'],
    ['白色', '纯白', '纯白色', '雪白', '米白', '米白色', '米色', '奶白', '奶白色', '象牙白', '杏色', '米黄', '米黄色'],
    ['黑色', '纯黑', '炭黑', '墨色'],
    ['灰色', '深灰', '深灰色', '浅灰', '浅灰色', '银灰', '银灰色', '银色'],
    ['棕色', '咖色', '咖啡色', '褐色', '深棕', '卡其', '卡其色'],
    ['紫色', '深紫', '深紫色', '浅紫', '浅紫色', '紫罗兰', '香芋紫']
  ];

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

  /**
   * 某个分类的公开特征定义。
   * 没有定义的分类（目前只有 other，以及任何脏数据里的未知分类）返回空数组，
   * 调用方据此决定"要不要显示特征区、要不要保留描述框"——所以**别返回 null**。
   */
  LF.featuresFor = function (categoryKey) {
    return LF.FEATURES[categoryKey] || [];
  };

  /** 某个分类的特征键列表，数据层清洗 features 对象时用。 */
  LF.featureKeysFor = function (categoryKey) {
    return LF.featuresFor(categoryKey).map(function (item) { return item.key; });
  };

  /** 某个分类的公开特征名，顿号分隔；搜索引导语直接引用字典，不另抄一份。 */
  LF.featureNamesFor = function (categoryKey) {
    return LF.featuresFor(categoryKey).map(function (item) { return item.name; }).join('、');
  };

  /**
   * 有公开特征的分类才有的收尾句："这一两项就是全部可搜内容"。
   *
   * 写上它是因为光说"请搜品牌"不够——失主得知道"除了这一两项，别的都搜不到"，
   * 才不会拿描述里的词去试。
   */
  LF.SEARCH_HINT_SUFFIX = '（就是全部可搜的公开特征）';

  /**
   * 某个分类给失主看的搜索引导语，首页选中分类时显示。
   *
   * 正文一律来自 LF.CATEGORIES 的 searchHint（见那里的说明），这个函数只负责补两件事：
   *   1. 有公开特征的分类补一句"这一两项就是全部可搜内容"，免得引导语和字典各说各话；
   *      顺带在字典改了、引导语忘了改时把真实字段名追加在后面自曝其短，
   *      而不是让失主照着一条过时的提示搜；
   *   2. 没有公开特征的分类（「其他」）把话讲清楚：别按特征找，翻列表、按地点找。
   *
   * ★ 没写 searchHint 的分类返回空串，页面据此不显示。**不要在代码里编一句默认文案**——
   *   那样脏数据里的未知分类会凭空冒出一条引导，config.js 这个唯一数据源就废了。
   *
   * ★ 「其他」也会返回字符串——它不是"没有引导的例外"，而是**对照组**：
   *   别的分类是"锁定特征 + 出题验证"，它是"描述和照片直接公开、不出题"（信任原则）。
   *   流程完全不同，所以引导语也必须不一样。
   */
  LF.searchHintFor = function (categoryKey) {
    var category = LF.findBy(LF.CATEGORIES, categoryKey);
    if (!category) return '';                       // 未知分类：没有引导，也别编

    var text = LF.utils.clean(category.searchHint);
    if (!text) return '';                           // 新加的分类忘了写 searchHint

    var keys = LF.featureKeysFor(categoryKey);
    if (!keys.length) return '🔍 ' + text;

    var names = LF.featureNamesFor(categoryKey);
    if (text.indexOf(names) === -1) text = text + '（' + names + '）';
    return '🔍 ' + text + LF.SEARCH_HINT_SUFFIX;
  };

  /** 按分类 + 特征键取单条定义，找不到返回 null。 */
  LF.featureOf = function (categoryKey, featureKey) {
    var list = LF.featuresFor(categoryKey);
    return LF.findBy(list, featureKey);
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
