/*!
 * 单元测试 —— 公共夹具
 *
 * 这里解决两个问题：
 *   1. 断言库：浏览器里把 chai 挂成全局 assert；将来用 Node 跑时由 node-setup.js 挂。
 *   2. 确定性：把"当前时间"固定下来。否则涉及过期、排序的测试会随运行
 *      时刻时好时坏，那种测试比没有还糟。
 */
(function (root) {
  'use strict';

  // 浏览器里 chai 是全局变量，挂成 assert 让用例写法统一
  if (root.chai && root.chai.assert && !root.assert) {
    root.assert = root.chai.assert;
  }
  if (root.chai && root.chai.expect && !root.expect) {
    root.expect = root.chai.expect;
  }

  var LF = root.LF;

  /** 所有测试共用的"现在"。写死之后，时间相关的断言才有确定结果。 */
  var FIXED_NOW = new Date('2026-10-02T10:00:00');

  /**
   * 一套标准验证题：判断题 2 道 + 选择题 2 道，正确答案一律是第 1 个选项。
   * 判断题的选项由数据层固定成「正确 / 错误」，所以这里不用写 options。
   */
  function questions() {
    return [
      { id: 'q1', type: 'judge', stem: '卡面上写的是王小明这个名字', answer: 0 },
      { id: 'q2', type: 'judge', stem: '卡面贴着一张蓝色小熊贴纸', answer: 0 },
      { id: 'q3', type: 'choice', stem: '卡号后四位是', options: ['3882', '1027', '5566'], answer: 0 },
      { id: 'q4', type: 'choice', stem: '这张卡属于哪个年级', options: ['2023 级', '2022 级'], answer: 0 }
    ];
  }

  /**
   * 一份作答。不传参数表示全部答对；传 ['q3'] 表示第 3 题故意答错。
   * @param {Array<string>} [wrongIds]
   */
  function answers(wrongIds) {
    var wrong = wrongIds || [];
    return questions().map(function (question) {
      return {
        id: question.id,
        choice: wrong.indexOf(question.id) === -1 ? 0 : 1
      };
    });
  }

  /**
   * 造一个用于测试的 store。
   * 关键点：注入内存适配器 —— 测试完全不碰 localStorage，
   * 每个用例都是干净的环境，互不污染。
   */
  function makeStore(options) {
    var opts = options || {};
    var adapter = opts.adapter || LF.createMemoryAdapter();
    var store = LF.createStore(adapter, { now: opts.now || FIXED_NOW });
    store.init(opts.seed || []);
    return store;
  }

  /** 一份"填得完全正确"的招领信息，用例在此基础上改某一项来构造异常。 */
  function validFound(overrides) {
    var base = {
      type: 'found',
      title: '校园卡一张',
      category: 'card',
      area: 'teaching',
      location: '教学楼 A 栋 301 教室',
      happenedAt: new Date('2026-10-02T09:00:00'),
      description: '今天上午第一节课后，在 301 教室最后一排捡到一张校园卡。',
      photos: [],
      contactName: '张明远',
      contactDept: '信息与计算科学 2023 级',
      contactWay: '微信：zhangmy2023',
      questions: questions()
    };
    return merge(base, overrides);
  }

  /** 一份合法的寻物信息：寻物不需要出验证题。 */
  function validLost(overrides) {
    var base = {
      type: 'lost',
      title: '黑色蓝牙耳机',
      category: 'headphone',
      area: 'library',
      location: '图书馆三楼自习区',
      happenedAt: new Date('2026-10-02T08:00:00'),
      description: '昨晚自习时把耳机落在桌子上了。',
      photos: [],
      contactName: '李思远',
      contactDept: '计算机科学与技术 2022 级',
      contactWay: '手机：13800000000',
      questions: []
    };
    return merge(base, overrides);
  }

  function merge(base, overrides) {
    var out = {};
    var key;
    for (key in base) {
      if (Object.prototype.hasOwnProperty.call(base, key)) out[key] = base[key];
    }
    if (overrides) {
      for (key in overrides) {
        if (Object.prototype.hasOwnProperty.call(overrides, key)) out[key] = overrides[key];
      }
    }
    return out;
  }

  /** 发布一条招领信息并返回它（省掉每个用例都写创建样板）。 */
  function publishFound(store, actor, overrides) {
    var result = store.create(validFound(overrides), actor);
    if (!result.ok) {
      throw new Error('夹具发布失败：' + JSON.stringify(result.errors));
    }
    return result.post;
  }

  function publishLost(store, actor, overrides) {
    var result = store.create(validLost(overrides), actor);
    if (!result.ok) {
      throw new Error('夹具发布失败：' + JSON.stringify(result.errors));
    }
    return result.post;
  }

  /** 取内部原始记录（含正确答案），只有测试需要，页面代码不该用它。 */
  function rawPost(store, id) {
    var exported = store.exportAll();
    for (var i = 0; i < exported.posts.length; i++) {
      if (exported.posts[i].id === id) return exported.posts[i];
    }
    return null;
  }

  /** 从一批公开视图里按 id 找一条。 */
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  root.T = {
    FIXED_NOW: FIXED_NOW,
    questions: questions,
    answers: answers,
    makeStore: makeStore,
    validFound: validFound,
    validLost: validLost,
    publishFound: publishFound,
    publishLost: publishLost,
    rawPost: rawPost,
    byId: byId,
    merge: merge
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
