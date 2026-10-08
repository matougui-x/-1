/*!
 * 发布 / 编辑页控制器
 *
 * 寻物和招领共用这一套表单，靠顶部的分段控件切换：
 *   - 切换类型只改文案（"拾取地点" ⇄ "丢失地点"）和是否显示验证题区块；
 *   - 切换分类会影响「常用模板」里能直接插入的题目。
 *
 * ★ 认领验证题（第二版方案）：
 *   出题的人是拾得者，题型只有判断题和选择题，一次出 3–5 题。
 *   这里维护的 state.questions 是唯一数据源，DOM 只负责显示；
 *   在输入框里打字只回写 state、不重建 DOM，否则每敲一个字都会丢焦点。
 *
 * 编辑模式复用同一个页面：带 ?id=xxx 进来时先读原记录回填，
 * 提交时走 store.update 而不是 store.create（id/发布时间/浏览量在数据层保证不变）。
 */
(function (root) {
  'use strict';

  var LF = root.LF;
  var U = LF.utils;
  var ui = LF.ui;
  var esc = U.escapeHtml;
  var V = LF.VERIFY;

  var app = ui.startPage({ nav: '', tabbar: false, welcome: false });
  var store = app.store;
  var myId = app.myId;

  var form = ui.qs('#postForm');
  var editId = U.query('id');

  /**
   * 表单当前状态。照片单独存，因为它在 DOM 里是 dataURL 数组。
   *
   * features 按特征键存值，**跨分类保留**：填了「电子产品」的品牌又切到「雨伞」，
   * 再切回来品牌还在。但提交时只提交当前分类定义的键（见 currentFeatures），
   * 所以别的分类的残留值不会跟着写进存储。
   */
  var state = {
    type: 'found',
    photos: [],
    questions: [],
    features: {}
  };

  var questionSeq = 0;

  // ---------------------------------------------------------------- 题型与题目

  /** 造一道空题。判断题的选项由系统固定，选择题先给两个空选项。 */
  function blankQuestion(type) {
    questionSeq++;
    return {
      id: 'q' + questionSeq,
      type: type,
      stem: '',
      options: type === 'judge' ? LF.JUDGE_OPTIONS.slice() : ['', ''],
      answer: 0
    };
  }

  function findQuestion(id) {
    for (var i = 0; i < state.questions.length; i++) {
      if (state.questions[i].id === id) return state.questions[i];
    }
    return null;
  }

  function optionRowHtml(question, index, label) {
    var checked = Number(question.answer) === index ? ' checked' : '';
    var removable = question.type === 'choice' && question.options.length > V.minOptions;

    return '<div class="quiz-opt" data-index="' + index + '">' +
      '<label class="quiz-pick" title="把这一项设为正确答案">' +
        '<input type="radio" name="ans_' + esc(question.id) + '" data-act="answer" value="' + index + '"' + checked + '>' +
        '<span class="quiz-pick-dot"></span>' +
      '</label>' +
      '<input class="input quiz-opt-input" data-field="option" maxlength="' + V.optionMax + '" ' +
        'value="' + esc(question.options[index]) + '" ' +
        (question.type === 'judge' ? 'readonly ' : '') +
        'placeholder="选项内容" aria-label="' + label + '">' +
      (removable
        ? '<button type="button" class="link-btn quiz-opt-remove" data-act="remove-option">删除</button>'
        : '') +
    '</div>';
  }

  function questionHtml(question, index) {
    var isJudge = question.type === 'judge';
    var label = isJudge ? LF.questionTypeOf('judge').name : LF.questionTypeOf('choice').name;

    var options = question.options.map(function (option, optionIndex) {
      return optionRowHtml(question, optionIndex, '第 ' + (index + 1) + ' 题选项 ' + (optionIndex + 1));
    }).join('');

    var addOption = (!isJudge && question.options.length < V.maxOptions)
      ? '<button type="button" class="btn btn-ghost btn-sm quiz-add-opt" data-act="add-option">＋ 添加选项</button>'
      : '';

    return '<div class="quiz-card" data-qid="' + esc(question.id) + '">' +
      '<div class="quiz-head">' +
        '<span class="quiz-no">第 ' + (index + 1) + ' 题</span>' +
        '<div class="segmented quiz-type" role="group" aria-label="第 ' + (index + 1) + ' 题的题型">' +
          '<button type="button" data-act="type" data-type="judge"' +
            (isJudge ? ' class="is-on"' : '') + '>判断题</button>' +
          '<button type="button" data-act="type" data-type="choice"' +
            (!isJudge ? ' class="is-on"' : '') + '>选择题</button>' +
        '</div>' +
        '<button type="button" class="link-btn quiz-remove" data-act="remove-question">删除本题</button>' +
      '</div>' +

      '<label class="field-label" for="stem_' + esc(question.id) + '">' + label + '题目<span class="req">*</span></label>' +
      '<input class="input" id="stem_' + esc(question.id) + '" data-field="stem" maxlength="' + V.stemMax + '" ' +
        'value="' + esc(question.stem) + '" placeholder="' +
        (isJudge ? '例如：卡面上有贴纸、签名或其他人为做的标记' : '例如：卡号后四位是') + '">' +

      '<div class="quiz-options">' +
        '<div class="quiz-options-head">' +
          '<span>选项</span>' +
          '<span class="text-muted">' + (isJudge
            ? '判断题固定两个选项，选一个正确答案'
            : '点左边的圆点指定正确答案 · 选项之间要差别明显') + '</span>' +
        '</div>' +
        options +
        addOption +
        // 出错时才填内容（见 updateOptionWarnings），平时留空不占地方
        (isJudge ? '' : '<div class="quiz-opt-warn" data-warn></div>') +
      '</div>' +
    '</div>';
  }

  /** 重建题目列表（只在增删题目、改题型、增删选项时调用）。 */
  function renderQuestions() {
    var list = ui.qs('#questionList');

    if (!state.questions.length) {
      list.innerHTML = '<div class="quiz-empty">还没有题目。' +
        '点上面的「＋ 添加判断题 / ＋ 添加选择题」，或者用「常用模板」快速生成一题。</div>';
      updateQuizHint();
      return;
    }

    list.innerHTML = state.questions.map(questionHtml).join('');
    updateQuizHint();
  }

  /** 实时提示题量与题型分布，比事后报错友好。 */
  function updateQuizHint() {
    var mix = LF.questionMix(state.questions);
    ui.qs('#quizCount').textContent = '已出 ' + state.questions.length + ' 题' +
      (state.questions.length ? '（判断 ' + mix.judge + ' · 选择 ' + mix.choice + '）' : '');

    var hint = ui.qs('#quizHint');
    var enough = state.questions.length >= V.minQuestions && state.questions.length <= V.maxQuestions;
    var text;

    if (state.questions.length < V.minQuestions) {
      text = '还差 ' + (V.minQuestions - state.questions.length) + ' 题：至少 ' + V.minQuestions +
        ' 题（建议 ' + V.suggestedQuestions + ' 题，最多 ' + V.maxQuestions + ' 题）。';
    } else if (state.questions.length > V.maxQuestions) {
      text = '题目太多了，最多 ' + V.maxQuestions + ' 题，请删掉 ' + (state.questions.length - V.maxQuestions) + ' 题。';
    } else {
      text = '题量合适。每道题都要指定正确答案，认领者答错时系统不会告诉他是哪一题错。';
    }

    hint.textContent = text;
    hint.style.color = enough ? 'var(--green-d)' : 'var(--ink-3)';

    updateOptionWarnings();
  }

  /**
   * 逐题检查选项之间分不分得清，把结果写进每题下方的提示位。
   *
   * 在打字过程中就提示，而不是等提交才报错：写选项的人此刻正在想
   * "这两个说法够不够区分"，是唯一能听进建议的时机。
   */
  function updateOptionWarnings() {
    state.questions.forEach(function (question) {
      var card = ui.qs('.quiz-card[data-qid="' + question.id + '"]');
      if (!card) return;

      var warn = card.querySelector('[data-warn]');
      if (!warn) return;

      var pair = LF.confusableOptionPair(question.options);
      if (!pair) {
        warn.textContent = '';
        warn.classList.remove('is-warn');
        return;
      }

      warn.textContent = '⚠️「' + pair.a + '」和「' + pair.b + '」意思太接近，' +
        '真正的失主也可能选错，请改成差别明显的说法。';
      warn.classList.add('is-warn');
    });
  }

  // ---------------------------------------------------------------- 常用模板

  function openTemplatePicker() {
    var templates = LF.templatesFor(ui.qs('#fCategory').value);

    var body = templates.map(function (template, index) {
      var type = LF.questionTypeOf(template.type);
      var options = template.type === 'judge'
        ? (template.options || LF.JUDGE_OPTIONS)
        : template.options;
      return '<div class="tpl-item">' +
        '<div class="tpl-main">' +
          '<div class="tpl-stem"><span class="chip chip-lock">' + esc(type.name) + '</span>' + esc(template.stem) + '</div>' +
          '<div class="tpl-options text-muted text-small">' + options.map(esc).join(' / ') + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-tpl="' + index + '">插入</button>' +
      '</div>';
    }).join('');

    var dialog = ui.modal({
      title: '常用模板（' + LF.categoryOf(ui.qs('#fCategory').value).name + '）',
      bodyHtml: '<p class="text-small text-muted" style="margin-bottom:10px">' +
        '模板只帮你写好题干和候选项，插入后请改成这件物品的实际情况，' +
        '并点圆点指定正确答案——哪一项对，只有你知道。' +
        '选项之间要差别明显，别把「深蓝色」和「藏青」这种意思相近的说法同时列上去。' +
        '<strong>另外，上面填过的公开特征不要再出一遍题</strong>——' +
        '它们本来就公开，问了等于把答案直接送给冒领的人。</p>' + body,
      buttons: [{ text: '关闭', primary: true }]
    });

    ui.qsa('[data-tpl]', dialog.mask).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var template = templates[Number(btn.getAttribute('data-tpl'))];
        state.questions.push({
          id: 'q' + (++questionSeq),
          type: template.type,
          stem: template.stem,
          options: template.type === 'judge'
            ? LF.JUDGE_OPTIONS.slice()
            : (template.options || ['', '']).slice(),
          answer: 0
        });
        renderQuestions();
        dialog.close();
        ui.toast('已插入模板题目，记得改成正确答案', 'ok');
      });
    });
  }

  // ---------------------------------------------------------------- 照片

  function renderPhotos() {
    var grid = ui.qs('#photoGrid');
    grid.innerHTML = '';

    state.photos.forEach(function (src, index) {
      var slot = ui.el('<div class="photo-slot">' +
        '<img src="' + esc(src) + '" alt="照片 ' + (index + 1) + '">' +
        '<button type="button" class="remove" aria-label="删除这张照片">×</button>' +
        '</div>');
      slot.querySelector('.remove').addEventListener('click', function () {
        state.photos.splice(index, 1);
        renderPhotos();
      });
      grid.appendChild(slot);
    });

    if (state.photos.length < U.IMAGE_RULES.maxCount) {
      var add = ui.el('<button type="button" class="photo-add">' +
        '<span class="plus">＋</span><span>添加照片</span></button>');
      add.addEventListener('click', function () { ui.qs('#photoInput').click(); });
      grid.appendChild(add);
    }
  }

  ui.qs('#photoInput').addEventListener('change', function (event) {
    var files = Array.prototype.slice.call(event.target.files || []);
    event.target.value = '';       // 允许重复选同一个文件
    if (!files.length) return;

    var room = U.IMAGE_RULES.maxCount - state.photos.length;
    if (files.length > room) {
      ui.toast('最多上传 ' + U.IMAGE_RULES.maxCount + ' 张照片，只取前 ' + room + ' 张', 'warn');
      files = files.slice(0, room);
    }

    ui.toast('正在压缩照片…');
    var jobs = files.map(function (file) {
      var check = U.validateImage(file, state.photos.length);
      if (!check.ok) {
        ui.toast(check.message, 'error');
        return Promise.resolve(null);
      }
      return U.compressImage(file)['catch'](function (error) {
        ui.toast(error.message || '照片处理失败', 'error');
        return null;
      });
    });

    Promise.all(jobs).then(function (results) {
      results.forEach(function (dataUrl) {
        if (dataUrl && state.photos.length < U.IMAGE_RULES.maxCount) {
          state.photos.push(dataUrl);
        }
      });
      renderPhotos();
      if (results.some(Boolean)) ui.toast('照片已添加', 'ok');
    });
  });

  // ---------------------------------------------------------------- 表单读写

  function readForm() {
    return {
      type: state.type,
      title: ui.qs('#fTitle').value,
      category: ui.qs('#fCategory').value,
      area: ui.qs('#fArea').value,
      location: ui.qs('#fLocation').value,
      happenedAt: ui.qs('#fTime').value,
      // 描述照常读，但数据层会按分类决定收不收（有公开特征的分类一律置空，
      // 见 store.js 的 create/update）。校验放在数据层一处，页面不重复判断。
      description: ui.qs('#fDesc').value,
      features: currentFeatures(),
      photos: state.photos.slice(),
      contactName: ui.qs('#fContactName').value,
      contactDept: ui.qs('#fContactDept').value,
      contactWay: ui.qs('#fContactWay').value,
      questions: isFound() ? state.questions.map(function (question) {
        return {
          id: question.id,
          type: question.type,
          stem: question.stem,
          options: question.options.slice(),
          answer: question.answer
        };
      }) : []
    };
  }

  function fillForm(post) {
    state.type = post.type;
    state.photos = (post.photos || []).slice();

    ui.qs('#fTitle').value = post.title || '';
    ui.qs('#fCategory').value = post.category;
    // 分类是程序设的，不会触发 change，得手动重建一次特征区
    // （跟下面 refreshSpotList() 手动跟进 #fArea 是同一个道理）
    state.features = copyFeatures(post.features);
    renderFeatures();
    ui.qs('#fArea').value = post.area;
    refreshSpotList();
    ui.qs('#fLocation').value = post.location || '';
    ui.qs('#fTime').value = U.toInputValue(U.parseTime(post.happenedAt) || new Date());
    ui.qs('#fDesc').value = post.description || '';
    ui.qs('#fContactName').value = post.contactName || '';
    ui.qs('#fContactDept').value = post.contactDept || '';
    ui.qs('#fContactWay').value = post.contactWay || '';

    applyType();

    // 编辑时要向数据层单独要一次带答案的草稿：公开视图里没有 answer
    var draft = store.getEditable(post.id, myId);
    if (draft.ok && Array.isArray(draft.post.questions) && draft.post.questions.length) {
      state.questions = draft.post.questions.map(function (question) {
        return {
          id: question.id || ('q' + (++questionSeq)),
          type: question.type,
          stem: question.stem,
          options: question.type === 'judge'
            ? LF.JUDGE_OPTIONS.slice()
            : (question.options || []).slice(),
          answer: Number(question.answer) >= 0 ? Number(question.answer) : 0
        };
      });
      renderQuestions();
    }

    // 旧版信息：说明旧答案已停用，需要重新出题
    if (post.legacyVerify) {
      ui.qs('#legacyNotice').hidden = false;
      if (!state.questions.length) renderQuestions();
    }

    renderPhotos();
    updateCounters();
  }

  function updateCounters() {
    ui.qs('#titleCount').textContent = ui.qs('#fTitle').value.length;
    ui.qs('#descCount').textContent = ui.qs('#fDesc').value.length;
  }

  // ---------------------------------------------------------------- 类型切换

  function isFound() {
    return state.type === 'found';
  }

  function applyType() {
    ui.qsa('#typeSeg button').forEach(function (btn) {
      btn.classList.toggle('is-on', btn.getAttribute('data-type') === state.type);
    });

    var found = isFound();
    ui.qs('#locationLabel').textContent = found ? '拾取地点' : '丢失地点';
    ui.qs('#timeLabel').textContent = found ? '拾取时间' : '丢失时间';
    ui.qs('#fLocation').placeholder = found
      ? '例如：教学楼 A 栋 301 教室'
      : '例如：图书馆三楼自习区';
    ui.qs('#fDesc').placeholder = found
      ? '补充一些细节，比如物品当时的状态、你捡到后放在哪里了。注意不要写出验证题的答案。'
      : '补充一些细节，比如物品的颜色、贴纸、磨损等特征，方便捡到的同学认出它。';

    ui.qs('#quizSection').hidden = !found;
    if (found && !ui.qs('#questionList').children.length) renderQuestions();
    if (found) updateQuizHint();
  }

  // ---------------------------------------------------------------- 下拉选项初始化

  function initSelects() {
    ui.qs('#fCategory').innerHTML = LF.CATEGORIES.map(function (category) {
      return '<option value="' + esc(category.key) + '">' + category.icon + ' ' + esc(category.name) + '</option>';
    }).join('');

    ui.qs('#fArea').innerHTML = LF.AREAS.map(function (area) {
      return '<option value="' + esc(area.key) + '">' + area.icon + ' ' + esc(area.name) + '</option>';
    }).join('');
  }

  /** 具体地点的候选词跟着区域变，减少手打错别字。 */
  function refreshSpotList() {
    var area = LF.areaOf(ui.qs('#fArea').value);
    ui.qs('#spotList').innerHTML = area.spots.map(function (spot) {
      return '<option value="' + esc(spot) + '"></option>';
    }).join('');
  }

  // ---------------------------------------------------------------- 公开特征

  /** 当前分类是否有公开特征（也就是"描述框该不该收起来"）。 */
  function currentFeatureDefs() {
    return LF.featuresFor(ui.qs('#fCategory').value);
  }

  /**
   * 按当前分类重建特征输入区。
   *
   * 和 #fArea → refreshSpotList() 是同一套机制：一个下拉驱动另一块内容。
   * 每个特征渲染成标准的 .field[data-field="feat_xxx"] 包裹，
   * 于是字段级报错、自动滚到第一个错误、"开始输入就清红"这些全都白捡。
   */
  function renderFeatures() {
    var container = ui.qs('#featureFields');
    var defs = currentFeatureDefs();

    // 有特征定义的分类：自由描述框收起来（详见 publish.html 里的说明）
    ui.qs('#descField').hidden = defs.length > 0;

    if (!defs.length) {
      container.innerHTML = '';
      container.hidden = true;
      return;
    }

    container.hidden = false;
    container.innerHTML = defs.map(function (def) {
      var field = LF.featureFieldName(def.key);
      var value = state.features[def.key] || '';
      var control;

      if (def.kind === 'select') {
        control = '<select class="select" id="' + esc(field) + '" data-feature="' + esc(def.key) + '">' +
          '<option value="">请选择' + esc(def.name) + '</option>' +
          def.options.map(function (option) {
            return '<option value="' + esc(option) + '"' +
              (option === value ? ' selected' : '') + '>' + esc(option) + '</option>';
          }).join('') +
          '</select>';
      } else {
        control = '<input class="input" id="' + esc(field) + '" data-feature="' + esc(def.key) + '" ' +
          'maxlength="' + (def.maxLen || 20) + '" value="' + esc(value) + '" ' +
          'placeholder="填写' + esc(def.name) + '">';
      }

      return '<div class="field" data-field="' + esc(field) + '">' +
        '<label class="field-label" for="' + esc(field) + '">' + esc(def.name) +
          '<span class="req">*</span></label>' +
        control +
        '<div class="field-error"></div>' +
        (def.hint ? '<div class="field-hint">' + esc(def.hint) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  /**
   * 浅拷贝一份特征值。
   * ★ 必须拷贝，不能直接拿来用：store.toPublic() 是浅拷贝，它返回的 post.features
   *   和存储里那条记录**是同一个对象**。state.features 是要被边打字边改的，
   *   不拷贝就会在编辑页里直接改到数据层。
   */
  function copyFeatures(features) {
    var out = {};
    var src = features || {};
    for (var key in src) {
      if (Object.prototype.hasOwnProperty.call(src, key)) out[key] = src[key];
    }
    return out;
  }

  /** 只取当前分类定义的键，别的分类留下的值不带出去。 */
  function currentFeatures() {
    var out = {};
    currentFeatureDefs().forEach(function (def) {
      out[def.key] = state.features[def.key] || '';
    });
    return out;
  }

  /** 边打字边回写 state（不重建 DOM，否则输入框会丢焦点）。 */
  function onFeatureInput(event) {
    var key = event.target.getAttribute('data-feature');
    if (key) state.features[key] = event.target.value;
  }

  ui.qs('#featureFields').addEventListener('input', onFeatureInput);
  ui.qs('#featureFields').addEventListener('change', onFeatureInput);

  // ---------------------------------------------------------------- 题目编辑事件

  /** 选项输入框、题干输入框：只回写 state，不重建 DOM（否则输入时丢焦点）。 */
  ui.qs('#questionList').addEventListener('input', function (event) {
    var card = event.target.closest('.quiz-card');
    if (!card) return;
    var question = findQuestion(card.getAttribute('data-qid'));
    if (!question) return;

    var field = event.target.getAttribute('data-field');
    if (field === 'stem') {
      question.stem = event.target.value;
    } else if (field === 'option') {
      var row = event.target.closest('.quiz-opt');
      question.options[Number(row.getAttribute('data-index'))] = event.target.value;
    }
    updateQuizHint();
  });

  /** 单选题干、选项、题型切换、增删题：统一走点击委托。 */
  ui.qs('#questionList').addEventListener('click', function (event) {
    var btn = event.target.closest('[data-act]');
    if (!btn) return;

    var action = btn.getAttribute('data-act');
    if (action === 'answer') {          // radio 由 change 处理，这里只兜住点击
      return;
    }

    var card = btn.closest('.quiz-card');
    var question = card ? findQuestion(card.getAttribute('data-qid')) : null;
    if (!question) return;

    if (action === 'remove-question') {
      state.questions = state.questions.filter(function (item) { return item.id !== question.id; });
      renderQuestions();
      return;
    }

    if (action === 'type') {
      var type = btn.getAttribute('data-type');
      if (type === question.type) return;
      question.type = type;
      // 换题型等于换一套选项：判断题固定两项，选择题回到两个空选项
      question.options = type === 'judge' ? LF.JUDGE_OPTIONS.slice() : [question.options[0] || '', ''];
      question.answer = 0;
      renderQuestions();
      return;
    }

    if (action === 'add-option') {
      question.options.push('');
      renderQuestions();
      return;
    }

    if (action === 'remove-option') {
      var row = btn.closest('.quiz-opt');
      var index = Number(row.getAttribute('data-index'));
      question.options.splice(index, 1);
      if (question.answer === index) question.answer = 0;
      else if (question.answer > index) question.answer--;
      renderQuestions();
    }
  });

  /** 指定正确答案。 */
  ui.qs('#questionList').addEventListener('change', function (event) {
    if (event.target.getAttribute('data-act') !== 'answer') return;
    var card = event.target.closest('.quiz-card');
    var question = findQuestion(card.getAttribute('data-qid'));
    if (!question) return;
    question.answer = Number(event.target.value);
  });

  ui.qs('#addJudgeBtn').addEventListener('click', function () {
    state.questions.push(blankQuestion('judge'));
    renderQuestions();
  });

  ui.qs('#addChoiceBtn').addEventListener('click', function () {
    state.questions.push(blankQuestion('choice'));
    renderQuestions();
  });

  ui.qs('#templateBtn').addEventListener('click', openTemplatePicker);

  // ---------------------------------------------------------------- 提交

  function setSubmitting(busy) {
    var btn = ui.qs('#submitBtn');
    btn.disabled = busy;
    btn.textContent = busy ? '处理中…' : (editId ? '保存修改' : '发布');
  }

  function submit() {
    ui.clearFieldErrors(form);
    ui.showFormAlert(form, '');

    var input = readForm();
    var check = LF.validatePost(input);
    if (!check.ok) {
      ui.showFieldErrors(form, check.errors);
      ui.showFormAlert(form, '还有 ' + Object.keys(check.errors).length + ' 处需要修改，请检查标红的字段。');
      if (check.errors.questions) ui.toast(check.errors.questions, 'error');
      return;
    }

    // 记住联系人，下次发布自动带出
    store.saveMe({ name: input.contactName, dept: input.contactDept, way: input.contactWay });

    setSubmitting(true);
    var result = editId
      ? store.update(editId, input, myId)
      : store.create(input, myId);
    setSubmitting(false);

    if (!result.ok) {
      var errors = result.errors || {};
      ui.showFieldErrors(form, errors);
      if (errors._) ui.showFormAlert(form, errors._);
      ui.toast(errors._ || errors.questions || '保存失败，请检查表单', 'error');
      return;
    }

    U.go('success', { id: result.post.id, mode: editId ? 'edit' : 'new' });
  }

  // ---------------------------------------------------------------- 事件绑定

  ui.qs('#typeSeg').addEventListener('click', function (event) {
    var btn = event.target.closest('button[data-type]');
    if (!btn) return;
    if (state.type === btn.getAttribute('data-type')) return;
    state.type = btn.getAttribute('data-type');
    applyType();
  });

  ui.qs('#fArea').addEventListener('change', refreshSpotList);
  // 换分类 = 换一套公开特征，同时也决定描述框收不收起来
  ui.qs('#fCategory').addEventListener('change', renderFeatures);
  ui.qs('#fTitle').addEventListener('input', updateCounters);
  ui.qs('#fDesc').addEventListener('input', updateCounters);

  // 用户开始修改某个字段就把它上面的红色报错清掉，避免一直红着
  form.addEventListener('input', function (event) {
    var holder = event.target.closest('.field.has-error');
    if (holder) holder.classList.remove('has-error');
    ui.showFormAlert(form, '');
  });
  form.addEventListener('change', function (event) {
    var holder = event.target.closest('.field.has-error');
    if (holder) holder.classList.remove('has-error');
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    submit();
  });
  ui.qs('#submitBtn').addEventListener('click', submit);
  ui.qs('#cancelBtn').addEventListener('click', function () {
    if (editId) U.go('mine');
    else if (root.history.length > 1) root.history.back();
    else U.go('index');
  });

  // ---------------------------------------------------------------- 启动

  initSelects();
  refreshSpotList();

  // 默认带上上次填过的联系人信息，减少重复输入
  var me = store.getMe();
  ui.qs('#fContactName').value = me.name || '';
  ui.qs('#fContactDept').value = me.dept || '';
  ui.qs('#fContactWay').value = me.way || '';

  ui.qs('#fTime').value = U.toInputValue(new Date());

  if (editId) {
    var existing = store.get(editId, myId);
    if (!existing) {
      ui.renderEmpty(ui.qs('#postForm'), {
        icon: '🔎',
        title: '这条信息不存在或已被删除',
        actions: [{ text: '返回我的发布', href: 'mine.html', primary: true }]
      });
      ui.qs('#submitBtn').disabled = true;
      ui.markReady({ page: 'publish', mode: 'missing' });
      return;
    }
    if (!existing.isOwner) {
      ui.renderEmpty(ui.qs('#postForm'), {
        icon: '🚫',
        title: '只能编辑自己发布的信息',
        desc: '这条信息不是你发布的，可以回到详情页查看内容。',
        actions: [
          { text: '查看详情', href: 'detail.html?id=' + encodeURIComponent(editId), primary: true },
          { text: '返回首页', href: 'index.html' }
        ]
      });
      ui.qs('#submitBtn').disabled = true;
      ui.markReady({ page: 'publish', mode: 'forbidden' });
      return;
    }

    ui.qs('#barTitle').textContent = '编辑信息';
    root.document.title = '编辑信息 · 校园失物招领';
    ui.qs('#submitBtn').textContent = '保存修改';
    ui.qs('#footTip').textContent = '保存后，首页和搜索结果里的内容会立即更新，浏览量和发布时间保持不变。';
    fillForm(existing);
  } else {
    // 支持 ?category=other 直达。除了分享方便，这也是"其他"分类那条分支
    // （描述框显示、特征区为空）唯一能被 dump-dom 检查到的入口——
    // 新建页默认是「证件卡片」，光加载 publish.html 走不到那条路。
    var preset = U.query('category');
    ui.qs('#fCategory').value =
      (preset && LF.fields(LF.CATEGORIES).indexOf(preset) !== -1) ? preset : 'card';
    applyType();
    renderFeatures();     // 默认分类就有特征，首屏必须渲染出来
    renderQuestions();
    renderPhotos();
  }

  updateCounters();
  ui.markReady({
    page: 'publish',
    mode: editId ? 'edit' : 'new',
    questions: state.questions.length,
    features: currentFeatureDefs().length
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
