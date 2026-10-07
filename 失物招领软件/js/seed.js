/*!
 * 校园失物招领 —— 演示数据
 *
 * 第一次打开页面时灌入，让使用者不必先发布就能看到完整效果。
 * 时间一律用"距离现在多少小时"来算，避免写死日期导致过几天打开全是"很久以前"。
 *
 * 其中两条归属于本机用户（ownerId = 本机 uid），这样点进「我的发布」不是空的，
 * 可以直接演示"标记已归还""查看认领申请"这些需要发布者身份的功能。
 */
(function (root) {
  'use strict';

  var LF = (root.LF = root.LF || {});

  var HOUR = 60 * 60 * 1000;
  var DAY = 24 * HOUR;

  /** 生成演示数据。@param {Date} now 基准时间 @param {string} myId 本机用户 id */
  LF.buildSeedPosts = function (now, myId) {
    var base = (now instanceof Date ? now : new Date()).getTime();
    var me = myId || 'seed_owner_me';

    /**
     * 距离现在 ms 毫秒的**时间戳**（数字）。
     * 排序是按 createdAt 直接相减做的，所以这里必须和 store.create 里
     * 写进去的类型一致（数字），否则字符串相减会得到 NaN，列表顺序就乱了。
     */
    function ago(ms) {
      return base - ms;
    }

    /** 同一时刻的 ISO 字符串，用于 happenedAt 这类展示型字段。 */
    function agoIso(ms) {
      return new Date(base - ms).toISOString();
    }

    function post(data) {
      var created = data.created;
      return {
        id: data.id,
        type: data.type,
        title: data.title,
        category: data.category,
        area: data.area,
        location: data.location,
        happenedAt: data.happenedAt,
        description: data.description,
        photos: [],
        contactName: data.contactName,
        contactDept: data.contactDept || '',
        contactWay: data.contactWay,
        status: data.status || 'open',
        doneType: data.doneType || null,
        doneAt: data.doneAt || null,
        createdAt: created,
        updatedAt: created,
        views: data.views || 0,
        ownerId: data.ownerId || 'seed_owner_other',
        questions: data.questions || [],
        claims: data.claims || [],
        appeals: data.appeals || [],
        attemptsLeft: typeof data.attemptsLeft === 'number' ? data.attemptsLeft : LF.VERIFY.maxAttempts
      };
    }

    /* 出题小工具：让下面的演示数据一眼能看出"这题问的是什么、哪项是对的"。 */
    function judge(stem, answer) {
      return { type: 'judge', stem: stem, options: LF.JUDGE_OPTIONS.slice(), answer: answer };
    }
    function choice(stem, options, answer) {
      return { type: 'choice', stem: stem, options: options, answer: answer };
    }
    /** 演示用的认领作答记录（发布者在「我的发布」里看到的样子）。 */
    function answer(stem, choiceText, correct) {
      return { id: 'a_' + stem.length, type: 'choice', stem: stem, choice: 0, choiceText: choiceText, correct: correct };
    }

    var list = [
      // —— 归属于本机用户：用来演示"我的发布"和状态维护 ——
      post({
        id: 'seed_mine_1',
        type: 'found',
        title: '校园卡一张（学号 2023****）',
        category: 'card',
        area: 'teaching',
        location: '教学楼 A 栋 301 教室',
        happenedAt: agoIso(0.5 * DAY),
        description: '今天上午第一节课后，在 301 教室最后一排捡到一张校园卡，已交到 A 栋一楼值班室。为避免误领，姓名、卡号等特征已设为隐藏问题。',
        contactName: '张明远',
        contactDept: '信息与计算科学 2023 级',
        contactWay: '微信：zhangmy2023',
        ownerId: me,
        created: ago(3 * HOUR),
        views: 86,
        questions: [
          judge('卡面上写的是「王小明」这个名字', 0),
          judge('卡面贴着一张蓝色小熊贴纸', 0),
          choice('卡号后四位是', ['3882', '1027', '5566', '9120'], 0),
          choice('这张卡是哪个年级的', ['2023 级', '2022 级', '2024 级', '2021 级'], 0)
        ],
        claims: [
          {
            at: ago(2 * HOUR),
            passed: true,
            voucher: 'CL-2026-3882',
            answers: [
              answer('卡面上写的是「王小明」这个名字', '正确', true),
              answer('卡面贴着一张蓝色小熊贴纸', '正确', true),
              answer('卡号后四位是', '3882', true),
              answer('这张卡是哪个年级的', '2023 级', true)
            ]
          },
          {
            at: ago(1.2 * HOUR),
            passed: false,
            answers: [
              answer('卡面上写的是「王小明」这个名字', '正确', true),
              answer('卡面贴着一张蓝色小熊贴纸', '错误', false),
              answer('卡号后四位是', '9120', false),
              answer('这张卡是哪个年级的', '2023 级', true)
            ]
          },
          {
            at: ago(0.6 * HOUR),
            passed: false,
            answers: [
              answer('卡面上写的是「王小明」这个名字', '错误', false),
              answer('卡面贴着一张蓝色小熊贴纸', '错误', false),
              answer('卡号后四位是', '5566', false),
              answer('这张卡是哪个年级的', '2022 级', false)
            ]
          }
        ],
        attemptsLeft: 0,
        // 一条等待处理的申诉，用来演示 3 次全败之后的"人工审核通道"
        appeals: [
          {
            id: 'seed_appeal_1',
            claimantId: 'seed_owner_claimer',
            name: '李思远',
            contact: '微信：lisiyuan2022',
            detail: '这张卡应该是我的：卡号后四位 3882，背面签名栏写的是我的名字，' +
              '卡套里还夹着一张图书馆的借书凭条，日期是上周三。',
            at: ago(0.5 * HOUR),
            decision: 'pending',
            note: '',
            voucher: '',
            decidedAt: null
          }
        ]
      }),
      post({
        id: 'seed_mine_2',
        type: 'found',
        title: '黑色雨伞一把',
        category: 'umbrella',
        area: 'library',
        location: '图书馆一楼大厅',
        happenedAt: agoIso(1.8 * DAY),
        description: '图书馆一楼大厅伞架上多出来的一把黑伞，伞柄有一道划痕，先放在一楼借还书台了。',
        contactName: '张明远',
        contactDept: '信息与计算科学 2023 级',
        contactWay: '微信：zhangmy2023',
        ownerId: me,
        created: ago(1.5 * DAY),
        views: 53,
        questions: [
          judge('伞面是纯黑色、没有花纹', 0),
          choice('伞柄的样子是', ['弯柄', '直柄', '自动伸缩', '折叠短柄'], 0),
          choice('伞面上最明显的特征是', ['一道划痕', '印着校徽', '挂着吊牌', '没有特征'], 0)
        ]
      }),

      // —— 其他同学发布的信息 ——
      post({
        id: 'seed_1',
        type: 'lost',
        title: '黑色蓝牙耳机（带充电盒）',
        category: 'headphone',
        area: 'library',
        location: '图书馆三楼自习区',
        happenedAt: agoIso(0.6 * DAY),
        description: '昨晚在图书馆三楼靠窗的位置自习，走的时候把耳机落在桌上了，充电盒是磨砂黑的，盒盖内侧贴了一张小星星贴纸。捡到的同学麻烦联系我，非常感谢。',
        contactName: '李思远',
        contactDept: '计算机科学与技术 2022 级',
        contactWay: '手机：138****6688',
        created: ago(8 * HOUR),
        views: 64
      }),
      post({
        id: 'seed_2',
        type: 'found',
        title: '粉色折叠雨伞',
        category: 'umbrella',
        area: 'canteen',
        location: '第二食堂门口',
        happenedAt: agoIso(1.1 * DAY),
        description: '中午在第二食堂门口捡到一把粉色折叠伞，伞套也在，先带回了宿舍，看到请尽快认领。',
        contactName: '陈雨桐',
        contactDept: '汉语言文学 2023 级',
        contactWay: 'QQ：1187****52',
        created: ago(1 * DAY),
        views: 41,
        questions: [
          judge('伞面是浅粉色的碎花图案', 0),
          judge('伞柄上挂着一个白色小圆珠', 0),
          choice('伞柄的样子是', ['直柄', '弯柄', '自动伸缩', '木柄'], 0)
        ]
      }),
      post({
        id: 'seed_3',
        type: 'lost',
        title: '宿舍钥匙（蓝色挂绳）',
        category: 'key',
        area: 'gym',
        location: '体育馆篮球场',
        happenedAt: agoIso(1.3 * DAY),
        description: '打完球发现钥匙不见了，上面有蓝色编织挂绳，一共三把。可能掉在篮球场边上的长椅附近，捡到的同学请联系我。',
        contactName: '王一诺',
        contactDept: '机械工程 2023 级',
        contactWay: '微信：wangyn2023',
        created: ago(1.2 * DAY),
        views: 29
      }),
      post({
        id: 'seed_4',
        type: 'found',
        title: '校园卡 + 学生证（一起捡到）',
        category: 'card',
        area: 'canteen',
        location: '第一食堂二楼餐盘回收处',
        happenedAt: agoIso(5.2 * DAY),
        description: '在餐盘回收处捡到一个卡套，里面是校园卡和学生证。已经交还给本人了。',
        contactName: '赵晓萌',
        contactDept: '会计学 2022 级',
        contactWay: '微信：zhaoxm2022',
        created: ago(5 * DAY),
        updatedAt: ago(4 * DAY),
        views: 118,
        status: 'done',
        doneType: 'returned',
        doneAt: ago(4 * DAY),
        questions: [
          judge('卡面上写的是「孙浩」这个名字', 0),
          choice('卡号后四位是', ['1027', '3882', '5566', '9120'], 0),
          choice('一起捡到的学生证是哪一年的', ['2022 级', '2023 级', '2021 级', '2024 级'], 0)
        ],
        claims: [
          {
            at: ago(4.2 * DAY),
            passed: true,
            voucher: 'CL-2026-1027',
            answers: [
              answer('卡面上写的是「孙浩」这个名字', '正确', true),
              answer('卡号后四位是', '1027', true),
              answer('一起捡到的学生证是哪一年的', '2022 级', true)
            ]
          }
        ]
      }),
      post({
        id: 'seed_5',
        type: 'lost',
        title: '白色保温杯（贴着一只小恐龙）',
        category: 'cup',
        area: 'teaching',
        location: '教学楼 B 栋 205 教室',
        happenedAt: agoIso(2.2 * DAY),
        description: '上周四下午在 B205 上课，下课就忘了拿。杯身贴了一只绿色小恐龙贴纸，杯底有磕碰的痕迹，有看到的同学麻烦联系我。',
        contactName: '周子涵',
        contactDept: '软件工程 2023 级',
        contactWay: '手机：159****3321',
        created: ago(2 * DAY),
        views: 37
      }),
      post({
        id: 'seed_6',
        type: 'found',
        title: '《高等数学》上册（有大量笔记）',
        category: 'book',
        area: 'library',
        location: '图书馆二楼自习区',
        happenedAt: agoIso(0.3 * DAY),
        description: '在图书馆二楼自习区捡到一本高数上册，扉页写了名字和班级，书里笔记很密。为避免冒领，姓名和班级已设为隐藏问题。',
        contactName: '孙浩然',
        contactDept: '土木工程 2022 级',
        contactWay: '微信：sunhr2022',
        created: ago(4 * HOUR),
        views: 52,
        questions: [
          judge('扉页上写的是「林小雨」这个名字', 0),
          judge('书里的重点用绿色荧光笔标注过', 0),
          choice('这本书是', ['《高等数学》上册', '《高等数学》下册', '《线性代数》', '《大学物理》'], 0),
          choice('书里笔记最密的一章是', ['第一章', '第三章', '第五章', '第七章'], 0)
        ]
      }),
      post({
        id: 'seed_7',
        type: 'lost',
        title: '白色充电宝（20000mAh）',
        category: 'electronics',
        area: 'road',
        location: '校车站',
        happenedAt: agoIso(0.9 * DAY),
        description: '在校车站等车的时候放在长椅上忘拿了，白色外壳，上面有一道明显的黑色划痕，接口是 Type-C。',
        contactName: '吴桐',
        contactDept: '电子信息工程 2023 级',
        contactWay: 'QQ：2265****17',
        created: ago(6 * HOUR),
        views: 22
      }),
      post({
        id: 'seed_8',
        type: 'found',
        title: '黑色双肩包（内有笔记本）',
        category: 'bag',
        area: 'gym',
        location: '体育馆羽毛球场',
        happenedAt: agoIso(2.1 * DAY),
        description: '羽毛球场边上捡到一个黑色双肩包，里面有一台笔记本电脑和一本笔记，已暂时保管，请先核对特征再认领。',
        contactName: '郑一鸣',
        contactDept: '体育教育 2022 级',
        contactWay: '微信：zhengym2022',
        created: ago(2 * DAY),
        views: 95,
        questions: [
          judge('包上挂着一个小黄色挂饰', 0),
          choice('包的颜色和款式是', ['黑色双肩包', '灰色单肩包', '蓝色双肩包', '棕色帆布包'], 0),
          choice('包里最显眼的物品是', ['一台银色笔记本电脑', '一本蓝色活页本', '一个水杯', '一副耳机'], 0)
        ]
      }),
      post({
        id: 'seed_9',
        type: 'lost',
        title: '黑框眼镜（度数较高）',
        category: 'glasses',
        area: 'library',
        location: '图书馆一楼借还书台',
        happenedAt: agoIso(3.3 * DAY),
        description: '在图书馆借书的时候摘下来放在台子上，走的时候忘了拿。黑框，度数比较高，镜片比较厚。',
        contactName: '何静',
        contactDept: '英语 2023 级',
        contactWay: '手机：186****7742',
        created: ago(3 * DAY),
        views: 48,
        status: 'done',
        doneType: 'found',
        doneAt: ago(2.5 * DAY)
      }),
      post({
        id: 'seed_10',
        type: 'found',
        title: '灰色围巾一条',
        category: 'clothing',
        area: 'road',
        location: '主干道靠近校门口',
        happenedAt: agoIso(2.6 * DAY),
        description: '主干道路边捡到一条灰色围巾，已经交给保卫处了，失主可以直接去保卫处认领。',
        contactName: '林可',
        contactDept: '法学 2023 级',
        contactWay: '微信：linke2023',
        created: ago(2.5 * DAY),
        views: 33,
        status: 'done',
        doneType: 'returned',
        doneAt: ago(2 * DAY)
      }),
      post({
        id: 'seed_11',
        type: 'found',
        title: '蓝色保温杯（杯身有社团贴纸）',
        category: 'cup',
        area: 'dorm',
        location: '3 号宿舍楼下快递柜',
        happenedAt: agoIso(0.7 * DAY),
        description: '在快递柜旁边的台阶上捡到一个蓝色保温杯，杯身贴着社团的贴纸，先放在宿管阿姨那里了。',
        contactName: '钱屿',
        contactDept: '建筑学 2022 级',
        contactWay: '微信：qianyu2022',
        created: ago(12 * HOUR),
        views: 19,
        questions: [
          choice('杯子的主要颜色是', ['深蓝色', '黑色', '白色', '粉色'], 0),
          judge('杯身上贴着一张社团贴纸', 0),
          choice('贴纸上写的是', ['青协', '学生会', '辩论队', '摄影社'], 0)
        ]
      }),
      post({
        id: 'seed_12',
        type: 'lost',
        title: '银色 U 盘（挂着一根红绳）',
        category: 'electronics',
        area: 'teaching',
        location: '教学楼 C 栋 401 机房',
        happenedAt: agoIso(1.7 * DAY),
        description: '在机房上完课把 U 盘落在电脑上了，银色金属外壳，挂着一根红绳，里面有课程设计的资料，对我很重要。',
        contactName: '罗一舟',
        contactDept: '自动化 2023 级',
        contactWay: '手机：137****9908',
        created: ago(1.5 * DAY),
        views: 71
      })
    ];

    // 把 done 状态的两条时间线补完整
    list.forEach(function (item) {
      if (item.status === 'done' && item.doneAt) {
        item.updatedAt = item.doneAt;
      }
    });

    return list;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
