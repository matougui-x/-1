/*!
 * 页面自检钩子
 *
 * 必须在所有其它脚本之前加载。作用是把自己页面里发生的 JS 报错收集起来，
 * 最后由 ui.markReady() 写到 <html data-selftest="..."> 上。
 *
 * 为什么需要它：浏览器里 JS 抛异常时，Chrome 的进程退出码仍然是 0，
 * 光看退出码会以为一切正常。开发阶段用 headless 抓 DOM 时，
 * 这个属性是判断"页面到底跑没跑起来"的可靠依据。
 */
(function (root) {
  'use strict';

  var errors = (root.__LF_ERRORS = root.__LF_ERRORS || []);

  function record(kind, detail) {
    var text = kind + ': ' + (detail || '未知错误');
    errors.push(text);
    // 同时打一份到控制台，方便直接用浏览器调试
    if (root.console && root.console.error) root.console.error('[校园失物招领] ' + text);
    refreshMarker();
  }

  /**
   * 如果页面已经写过自检标记，出错后要立刻把它改成 FAIL。
   *
   * 这一步很关键：ui.markReady() 只在渲染完成那一刻调用一次，
   * 如果之后（比如用户点了个按钮）才抛异常，标记会一直停在 PASS，
   * 自动化检查就查不出来了。
   */
  function refreshMarker() {
    var el = root.document && root.document.documentElement;
    if (!el || !el.hasAttribute('data-selftest')) return;
    var current = el.getAttribute('data-selftest');
    if (current.indexOf('FAIL') === 0) return;      // 已经是失败态，不重复追加
    el.setAttribute('data-selftest', 'FAIL:' + errors.join(' | '));
  }

  root.addEventListener('error', function (event) {
    // 资源加载失败（比如图片 404）也会走这里，单独标出来便于区分
    if (event.target && event.target !== root && event.target.tagName) {
      record('resource', event.target.tagName + ' 加载失败：' + (event.target.src || event.target.href || ''));
      return;
    }
    record('error', event.message || event.type);
  }, true);

  root.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    record('rejection', reason && reason.message ? reason.message : reason);
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
