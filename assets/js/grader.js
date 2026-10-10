/* =========================================================
   批改引擎（规则版）
   思路：先做文本特征抽取，再按维度给出可解释的得分与建议。
   ========================================================= */
const Grader = (function () {

  /* ---------- 工具 ---------- */
  function stripSpace(t) { return (t || "").replace(/\s/g, ""); }

  function countOccur(text, kw) {
    if (!kw) return 0;
    let c = 0, i = 0;
    while ((i = text.indexOf(kw, i)) !== -1) { c++; i += kw.length; }
    return c;
  }

  // 从作者字段里抽出可用于匹配的中文姓名
  function authorKeys(author) {
    if (!author) return [];
    const head = author.split(/[（(]/)[0];
    return head.split(/[&／\/、\s]+/)
      .map(s => s.replace(/[^一-龥]/g, ""))
      .filter(s => s.length >= 2);
  }

  // 过于通用的词，命中也不代表真正运用了该理论，予以剔除，避免误判
  const STOP = new Set([
    "形式", "情感", "表现", "符号", "文本", "读者", "观众", "作者", "解读", "意图",
    "消费", "资本", "生产", "媒介", "教育", "审美", "娱乐", "批判", "选择", "叙事",
    "话语", "关系", "人情", "圈子", "社群", "桥梁", "普及", "扩散", "注意力", "需求",
    "满足", "真实", "共性", "个性", "层次", "语境", "图像", "观看", "舞蹈", "表演",
    "纯粹", "抽象", "色彩", "线条", "空白", "价值", "意义", "文化", "技术", "社会"
  ]);

  function buildKeys(items) {
    return items.map(it => {
      const kw = new Set();
      if (it.name) kw.add(it.name);   // 名称始终计入
      [...(it.keywords || []), ...authorKeys(it.author)].forEach(k => {
        if (k && k.length >= 2 && !STOP.has(k)) kw.add(k);
      });
      return { item: it, kws: [...kw] };
    });
  }

  function matchItems(text, items) {
    const baked = buildKeys(items);
    const hits = [];
    baked.forEach(({ item, kws }) => {
      let count = 0; const found = [];
      kws.forEach(k => {
        const n = countOccur(text, k);
        if (n > 0) { count += n; found.push(k); }
      });
      if (count > 0) hits.push({ item, count, found });
    });
    hits.sort((a, b) => b.count - a.count);
    return hits;
  }

  /* ---------- 文本特征 ---------- */
  function analyze(text) {
    const clean = stripSpace(text);
    const paras = text.split(/\n+/).map(s => s.trim()).filter(s => s.length > 0);
    const sentences = text.split(/[。！？；\n]+/).map(s => s.trim()).filter(s => s.length > 1);
    const avgSent = sentences.length ? clean.length / sentences.length : 0;
    const paraLens = paras.map(p => stripSpace(p).length).filter(n => n > 0);
    const maxPara = paraLens.length ? Math.max(...paraLens) : 0;
    const minPara = paras.length > 1 ? Math.min(...paraLens.slice(1)) : maxPara; // 忽略首段
    const balance = minPara > 0 ? maxPara / minPara : 9;

    const count = re => (text.match(re) || []).length;

    return {
      clean, charCount: clean.length,
      paras, paraCount: paras.length,
      sentences: sentences.length, avgSent,
      maxPara, balance,
      markers: count(/首先|其次|再次|最后|第一|第二|第三|其一|其二|其三|一方面|另一方面|再者|此外|进一步/g),
      conclusion: count(/综上所述|总而言之|总之|由此可见|概而言之|因此|可见|说到底|归根结底|总之/g),
      dialectic: count(/然而|但是|不过|反之|固然|诚然|另一方面|尽管如此|值得注意的是|不可否认/g),
      question: count(/[？?]/) + count(/何为|何以|如何|为何|是否|能否|究竟/g),
      quotes: count(/「[^」]+」|“[^”]+”|《[^》]+》/g),
      punctu: ["，", "。", "；", "：", "、"].filter(p => text.includes(p)).length,
      valueWords: count(/主体性|尊严|意义|价值|责任|反思|启示|人文|温度|初心|守护|回归|精神/g),
      exampleWords: count(/例如|比如|以.{2,12}为例|正如|譬如/g)
    };
  }

  /* ---------- 各维度计分 ---------- */
  function scoreDimensions(subject, f, theoryHits, caseHits) {
    const rubric = RUBRICS[subject];
    const dims = {};
    const totalTheoryHits = theoryHits.reduce((s, h) => s + h.count, 0);
    const totalCaseHits = caseHits.reduce((s, h) => s + h.count, 0);

    // 理论
    let theory = theoryHits.length * 7 + Math.min(totalTheoryHits, 14) * 0.75;
    if (theoryHits.length === 0) theory = 0;
    dims.theory = theory;

    // 案例
    let caseS = caseHits.length * 6 + Math.min(totalCaseHits, 10) * 0.8;
    caseS += Math.min(f.exampleWords, 3) * 1.3;   // 泛例证少量给分
    dims.case = caseS;

    // 结构
    let st = 0;
    if (f.paraCount >= 4) st += 5; else if (f.paraCount === 3) st += 3; else if (f.paraCount === 2) st += 1;
    if (f.markers >= 2) st += 5; else if (f.markers === 1) st += 3;
    if (f.conclusion >= 1) st += 3;
    if (f.dialectic >= 1) st += 4;
    if (f.balance <= 3) st += 3;      // 段落长度均衡
    if (f.charCount >= 1000) st += 5; else if (f.charCount >= 700) st += 3; else if (f.charCount >= 400) st += 1.5;
    dims.structure = st;

    // 立意
    let idea = 0;
    if (f.question >= 1) idea += 2;
    if (f.valueWords >= 2) idea += 3; else if (f.valueWords === 1) idea += 1.5;
    if (f.dialectic >= 2) idea += 3; else if (f.dialectic === 1) idea += 1.5;
    if (f.paraCount >= 3 && f.conclusion >= 1) idea += 2;
    dims.idea = idea;

    // 语言
    let lang = 0;
    if (f.avgSent >= 14 && f.avgSent <= 55) lang += 3; else if (f.avgSent > 0) lang += 1.2;
    if (f.punctu >= 4) lang += 2;
    if (f.quotes >= 2) lang += 2; else if (f.quotes === 1) lang += 1;
    if (f.maxPara > 0 && f.maxPara <= 420) lang += 3; else if (f.maxPara <= 600) lang += 1.5;
    dims.language = lang;

    // 归一化到配分上限（内部按 100 分制调校，输出换算为 150 分制）
    const out = rubric.map(r => {
      const raw = (dims[r.key] || 0) * SCORE_SCALE;
      const val = Math.max(0, Math.min(r.max, raw));
      return { key: r.key, name: r.name, max: r.max, score: Math.round(val * 10) / 10 };
    });
    return out;
  }

  /* ---------- 建议生成 ---------- */
  function buildAdvice(subject, f, theoryHits, caseHits, dims) {
    const advice = [];
    const dimMap = {}; dims.forEach(d => dimMap[d.key] = d);

    if (f.charCount < 1000) {
      advice.push(`正文约 ${f.charCount} 字，低于建议篇幅（1000—1500 字），已按缺口比例扣减总分。补充展开分论点与论证可回补这部分分数。`);
    }
    if (theoryHits.length === 0) {
      advice.push("未检测到理论运用。写作不能只讲道理，要有学理支撑。建议在分论点处至少嵌入 2—3 个理论（如麦克卢汉、布尔迪厄、本雅明等），形成「理论—现象—判断」的闭环。");
    } else if (theoryHits.length < 2) {
      advice.push(`仅检测到 ${theoryHits.length} 个理论，理论密度偏低。建议再补充 1—2 个不同视角的理论，形成层次。`);
    }
    if (dimMap.theory && dimMap.theory.score / dimMap.theory.max < 0.6) {
      advice.push("理论多停留在「提及名称」，缺少对核心概念的解释与运用。建议写清「该理论说了什么」再落到「所以这个现象说明什么」。");
    }
    if (caseHits.length === 0) {
      advice.push("未检测到具体案例。论证需要实证支撑，建议至少引用 2 个具体案例（作品、事件、现象），并写清它与论点的关系。");
    } else if (caseHits.length < 2) {
      advice.push("案例数量偏少，建议每个分论点配一个案例，避免论证空转。");
    }
    if (f.paraCount < 4) {
      advice.push(`全文仅 ${f.paraCount} 段，结构层次不足。建议采用「总—分—分—分—总」的五段式结构。`);
    }
    if (f.markers < 2) {
      advice.push("缺少分论点标识词。建议使用「首先/其次/再者/最后」或「其一/其二/其三」让阅卷老师一眼看清层次。");
    }
    if (f.dialectic === 0) {
      advice.push("全文缺少辩证转折。高分卷通常会在主体部分做一次「先立后破」或「但是/然而」的翻转，以展现思维深度。");
    }
    if (f.conclusion === 0) {
      advice.push("结尾缺少收束性表述。建议用「综上所述」「由此可见」等标志收束全文，并完成价值升华。");
    }
    if (f.maxPara > 500) {
      advice.push(`存在过长段落（约 ${f.maxPara} 字）。建议拆分为 2—3 段，每段只承担一个分论点。`);
    }
    if (f.balance > 3.2) {
      advice.push("各段落篇幅差距较大，建议让分论点段落长度相对均衡，避免头重脚轻。");
    }
    if (f.quotes < 1) {
      advice.push("几乎没有引号或书名号。建议加入理论原句引用或具体作品名称，提升学理感与可信度。");
    }
    if (advice.length === 0) {
      advice.push("整体完成度较高。下一步可在个别段落补入更精准的理论原句与案例细节，冲击更高分。");
    }
    return advice;
  }

  /* ---------- 主入口 ---------- */
  function grade(subject, text, meta) {
    const f = analyze(text);
    const theoryPool = THEORIES.filter(t => t.subject === subject);
    const casePool = CASES.filter(c => c.subject === subject);
    const theoryHits = matchItems(text, theoryPool);
    const caseHits = matchItems(text, casePool);

    const dims = scoreDimensions(subject, f, theoryHits, caseHits);
    const rawTotal = dims.reduce((s, d) => s + d.score, 0);

    // 篇幅完成度折扣：不足 1000 字按缺口比例扣分（最多 22.5 分），避免短篇靠理论堆砌拿高分
    const EXPECTED = 1000;
    const PENALTY_MAX = 15 * SCORE_SCALE;
    const lengthPenalty = f.charCount < EXPECTED
      ? Math.round((EXPECTED - f.charCount) / EXPECTED * PENALTY_MAX) : 0;
    const total = Math.max(0, Math.round(rawTotal - lengthPenalty));

    const matchedTheoryIds = theoryHits.map(h => h.item.id);
    const matchedCaseIds = caseHits.map(h => h.item.id);
    const recTheory = theoryPool.filter(t => !matchedTheoryIds.includes(t.id)).slice(0, 4);
    const recCase = casePool.filter(c => !matchedCaseIds.includes(c.id)).slice(0, 3);

    const band = bandOfScore(total);

    return {
      subject, total, band,
      rawTotal: Math.round(rawTotal * 10) / 10,
      lengthPenalty,
      time: Date.now(),
      student: (meta && meta.student) || "",
      topic: (meta && meta.topic) || "",
      preview: text.replace(/\s+/g, " ").slice(0, 60),
      fullText: text,
      stats: {
        charCount: f.charCount, paraCount: f.paraCount,
        avgSent: Math.round(f.avgSent),
        markers: f.markers, dialectic: f.dialectic, conclusion: f.conclusion,
        theoryCount: theoryHits.length, caseCount: caseHits.length
      },
      dims,
      theories: theoryHits.map(h => ({ id: h.item.id, name: h.item.name, count: h.count, found: h.found.slice(0, 4) })),
      cases: caseHits.map(h => ({ id: h.item.id, title: h.item.title, count: h.count, found: h.found.slice(0, 4) })),
      recommendTheory: recTheory.map(t => ({ id: t.id, name: t.name })),
      recommendCase: recCase.map(c => ({ id: c.id, title: c.title })),
      advice: buildAdvice(subject, f, theoryHits, caseHits, dims)
    };
  }

  return { grade, analyze };
})();
