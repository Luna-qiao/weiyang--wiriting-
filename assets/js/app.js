/* =========================================================
   交互逻辑
   ========================================================= */
(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const STORE = "weiyang_reports_v1";

  /* ---------- 导航 ---------- */
  function switchView(name) {
    $$(".nav-item").forEach(t => t.classList.toggle("active", t.dataset.view === name));
    $$(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + name));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  $$(".nav-item").forEach(t => t.addEventListener("click", () => switchView(t.dataset.view)));
  document.addEventListener("click", e => {
    const g = e.target.closest("[data-goto]");
    if (g) switchView(g.dataset.goto);
  });

  /* ---------- 侧边栏折叠 ---------- */
  const SIDE_KEY = "weiyang_side_collapsed";
  function applySideCollapsed(c) {
    document.body.classList.toggle("side-collapsed", c);
    $$(".nav-item").forEach(t => {
      const label = t.querySelector(".nav-txt");
      if (c && label) t.setAttribute("title", label.textContent);
      else t.removeAttribute("title");
    });
    const btn = $("#sideToggle");
    if (btn) btn.setAttribute("aria-label", c ? "展开侧边栏" : "收起侧边栏");
  }
  const sideToggleBtn = $("#sideToggle");
  if (sideToggleBtn) {
    sideToggleBtn.addEventListener("click", () => {
      const c = !document.body.classList.contains("side-collapsed");
      applySideCollapsed(c);
      try { localStorage.setItem(SIDE_KEY, c ? "1" : "0"); } catch (e) {}
    });
  }
  try { applySideCollapsed(localStorage.getItem(SIDE_KEY) === "1"); } catch (e) { applySideCollapsed(false); }

  /* ---------- 弹窗 ---------- */
  function openModal(html) { $("#modalBody").innerHTML = html; $("#modal").classList.add("open"); }
  function closeModal() { $("#modal").classList.remove("open"); }
  $("#modalClose").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

  /* ---------- 总览 ---------- */
  function bandOf(s) { return bandOfScore(s); }

  function renderDashboard() {
    const mine = loadReports();
    const now = new Date();
    const month = mine.filter(r => {
      const d = new Date(r.time);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const monthCount = month.length;
    const avg = monthCount ? Math.round(month.reduce((s, r) => s + r.total, 0) / monthCount) : 0;
    const best = mine.length ? Math.max(...mine.map(r => r.total)) : 0;

    $("#dashSub").textContent = monthCount
      ? `本月你已完成 ${monthCount} 篇写作训练，平均 ${avg} 分。保持节奏，把「我的改进问题」里的短板逐个补掉。`
      : "你本月还没有提交作业。先写一篇，系统会给出可解释的批改报告与改进建议。";

    const kpis = [
      { l: "本月提交", n: monthCount, unit: "篇", hint: `累计 ${mine.length} 篇`, bar: Math.min(100, monthCount * 10) },
      { l: "本月平均分", n: avg, unit: "分", hint: avg ? bandOf(avg) : "暂无数据", bar: Math.round(avg / SCORE_FULL * 100) },
      { l: "历史最高分", n: best, unit: "分", hint: best ? bandOf(best) : "暂无数据", bar: Math.round(best / SCORE_FULL * 100) }
    ];
    $("#kpiRow").innerHTML = kpis.map(k => `
      <div class="kpi">
        <div class="l">${k.l}</div>
        <div class="n">${k.n}<small>${k.unit}</small></div>
        <div class="hint">${k.hint}</div>
        <div class="bar"><i style="width:${k.bar ? Math.max(k.bar, 5) : 0}%"></i></div>
      </div>`).join("");

    renderWeakPanel(mine);
    renderRubricPreview();
  }

  function renderRubricPreview() {
    const rows = RUBRICS["783"].map((r, i) => {
      const r8 = RUBRICS["887"][i];
      return `<div class="rubric-row"><span>${r.name}</span><span>783 <b>${r.max}</b> ｜ 887 <b>${r8.max}</b></span></div>`;
    }).join("");
    const full = k => RUBRICS[k].reduce((n, r) => n + r.max, 0);
    $("#rubricPreview").innerHTML = rows + `<div class="rubric-row"><span>满分</span><span>783 <b>${full("783")}</b> ｜ 887 <b>${full("887")}</b></span></div>`;
  }

  function renderWeakPanel(mine) {
    const box = $("#weakPanel");
    if (!mine.length) {
      box.innerHTML = `<div class="weak-empty">还没有批改数据。提交作业后，这里会自动汇总你最需要改进的维度与高频问题。</div>`;
      return;
    }

    // 各维度平均得分率，越低越需优先改进
    const agg = {};
    mine.forEach(r => (r.dims || []).forEach(d => {
      const k = d.key || d.name;
      agg[k] = agg[k] || { name: d.name, sum: 0, max: 0 };
      agg[k].sum += d.score; agg[k].max += d.max;
    }));
    const dims = Object.values(agg)
      .map(d => ({ name: d.name, ratio: d.max ? d.sum / d.max : 0 }))
      .sort((a, b) => a.ratio - b.ratio).slice(0, 3);

    // 高频批改意见
    const freq = {};
    mine.forEach(r => (r.advice || []).forEach(a => {
      const key = a.replace(/\d+/g, "").slice(0, 20);
      freq[key] = freq[key] || { text: a, count: 0 };
      freq[key].count++;
    }));
    const top = Object.values(freq).sort((a, b) => b.count - a.count).slice(0, 3);

    box.innerHTML = `
      <div class="muted" style="margin-bottom:4px">维度得分率 · 越低越需优先改进</div>
      ${dims.map(d => `
        <div class="weak-dim">
          <span class="wname">${esc(d.name)}</span>
          <span class="wbar"><i style="width:${Math.round(d.ratio * 100)}%"></i></span>
          <span class="wval">${Math.round(d.ratio * 100)}%</span>
        </div>`).join("")}
      ${top.length ? `<div class="muted" style="margin:18px 0 0">高频问题 · 按出现次数排序</div>
        <ul class="weak-list">${top.map(t => `<li><span class="weak-count">${t.count} 次</span>${esc(t.text)}</li>`).join("")}</ul>` : ""}`;
  }


  /* ---------- 理论库 ---------- */
  let theoryFilter = { q: "", subject: "all", category: "all" };

  function initTheory() {
    const cats = [...new Set(THEORIES.map(t => t.subject + "|" + t.category))];
    const byCat = {};
    THEORIES.forEach(t => byCat[t.category] = (byCat[t.category] || 0) + 1);
    $("#theoryCategory").innerHTML = '<option value="all">全部类别</option>' +
      Object.keys(byCat).map(c => `<option value="${esc(c)}">${esc(c)} (${byCat[c]})</option>`).join("");

    $("#theorySearch").addEventListener("input", e => { theoryFilter.q = e.target.value.trim(); renderTheory(); });
    $("#theorySubject").addEventListener("change", e => { theoryFilter.subject = e.target.value; renderTheory(); });
    $("#theoryCategory").addEventListener("change", e => { theoryFilter.category = e.target.value; renderTheory(); });
    renderTheory();
  }

  function renderTheory() {
    const { q, subject, category } = theoryFilter;
    const list = THEORIES.filter(t => {
      if (subject !== "all" && t.subject !== subject) return false;
      if (category !== "all" && t.category !== category) return false;
      if (q) {
        const hay = [t.name, t.en, t.author, t.core, t.category, ...(t.keywords || [])].join(" ");
        if (!hay.toLowerCase().includes(q.toLowerCase())) return false;
      }
      return true;
    });
    $("#theoryCount").textContent = list.length;
    $("#theoryList").innerHTML = list.length ? list.map(t => `
      <div class="card" data-theory="${t.id}">
        <div class="chip-row">
          <span class="chip sub-${t.subject}">${t.subject}</span>
          <span class="chip cat">${esc(t.category)}</span>
        </div>
        <h4>${esc(t.name)}</h4>
        <div class="sub">${esc(t.en || "")}</div>
        <div class="desc">${esc(t.core)}</div>
        <div class="more">查看解析 →</div>
      </div>`).join("") : `<div class="empty">没有匹配的理论，换个关键词试试</div>`;

    $$("#theoryList .card").forEach(c => c.addEventListener("click", () => showTheory(c.dataset.theory)));
  }

  function showTheory(id) {
    const t = THEORIES.find(x => x.id === id);
    if (!t) return;
    openModal(`
      <div class="md">
        <h3>${esc(t.name)}</h3>
        <div class="meta">${esc(t.en || "")} ｜ ${esc(t.author)} ｜ <span class="chip sub-${t.subject}">${t.subject}</span> <span class="chip cat">${esc(t.category)}</span></div>
        <h5>核心观点</h5><p>${esc(t.core)}</p>
        <h5>原句引用</h5><div class="quote">${esc(t.quote)}</div>
        <h5>适用的题目类型</h5><p>${esc(t.apply)}</p>
        <h5>考场怎么用</h5><ul>${(t.usage || []).map(u => `<li>${esc(u)}</li>`).join("")}</ul>
        <h5>检索关键词</h5><div class="chip-row">${(t.keywords || []).map(k => `<span class="chip">${esc(k)}</span>`).join("")}</div>
      </div>`);
  }

  /* ---------- 案例库 ---------- */
  let caseFilter = { q: "", subject: "all", category: "all" };

  function initCases() {
    const byCat = {};
    CASES.forEach(c => byCat[c.category] = (byCat[c.category] || 0) + 1);
    $("#caseCategory").innerHTML = '<option value="all">全部类别</option>' +
      Object.keys(byCat).map(c => `<option value="${esc(c)}">${esc(c)} (${byCat[c]})</option>`).join("");

    $("#caseSearch").addEventListener("input", e => { caseFilter.q = e.target.value.trim(); renderCases(); });
    $("#caseSubject").addEventListener("change", e => { caseFilter.subject = e.target.value; renderCases(); });
    $("#caseCategory").addEventListener("change", e => { caseFilter.category = e.target.value; renderCases(); });
    renderCases();
  }

  function renderCases() {
    const { q, subject, category } = caseFilter;
    const list = CASES.filter(c => {
      if (subject !== "all" && c.subject !== subject) return false;
      if (category !== "all" && c.category !== category) return false;
      if (q) {
        const hay = [c.title, c.intro, c.category, ...(c.keywords || [])].join(" ");
        if (!hay.toLowerCase().includes(q.toLowerCase())) return false;
      }
      return true;
    });
    $("#caseCount").textContent = list.length;
    $("#caseList").innerHTML = list.length ? list.map(c => `
      <div class="card" data-case="${c.id}">
        <div class="chip-row">
          <span class="chip sub-${c.subject}">${c.subject}</span>
          <span class="chip cat">${esc(c.category)}</span>
          <span class="chip cat">${esc(c.year)}</span>
        </div>
        <h4>${esc(c.title)}</h4>
        <div class="desc">${esc(c.intro)}</div>
        <div class="more">查看分析角度 →</div>
      </div>`).join("") : `<div class="empty">没有匹配的案例</div>`;

    $$("#caseList .card").forEach(el => el.addEventListener("click", () => showCase(el.dataset.case)));
  }

  function showCase(id) {
    const c = CASES.find(x => x.id === id);
    if (!c) return;
    const linked = (c.theories || []).map(tid => THEORIES.find(t => t.id === tid)).filter(Boolean);
    openModal(`
      <div class="md">
        <h3>${esc(c.title)}</h3>
        <div class="meta">${esc(c.year)} ｜ <span class="chip sub-${c.subject}">${c.subject}</span> <span class="chip cat">${esc(c.category)}</span></div>
        <h5>案例简介</h5><p>${esc(c.intro)}</p>
        <h5>可展开的分析角度</h5><ul>${(c.points || []).map(p => `<li>${esc(p)}</li>`).join("")}</ul>
        <h5>可对接的理论</h5>
        <div class="chip-row">${linked.map(t => `<span class="chip" data-theory="${t.id}">${esc(t.name)}</span>`).join("")}</div>
        <h5>检索关键词</h5><div class="chip-row">${(c.keywords || []).map(k => `<span class="chip">${esc(k)}</span>`).join("")}</div>
      </div>`);
    $("#modalBody").querySelectorAll("[data-theory]").forEach(el =>
      el.addEventListener("click", () => showTheory(el.dataset.theory)));
  }

  /* ---------- 材料库 ---------- */
  let materialFilter = { q: "", subject: "all", category: "all" };

  function initMaterials() {
    const byCat = {};
    MATERIALS.forEach(m => byCat[m.category] = (byCat[m.category] || 0) + 1);
    $("#materialCategory").innerHTML = '<option value="all">全部类别</option>' +
      Object.keys(byCat).map(c => `<option value="${esc(c)}">${esc(c)} (${byCat[c]})</option>`).join("");

    $("#materialSearch").addEventListener("input", e => { materialFilter.q = e.target.value.trim(); renderMaterials(); });
    $("#materialSubject").addEventListener("change", e => { materialFilter.subject = e.target.value; renderMaterials(); });
    $("#materialCategory").addEventListener("change", e => { materialFilter.category = e.target.value; renderMaterials(); });
    renderMaterials();
  }

  function renderMaterials() {
    const { q, subject, category } = materialFilter;
    const list = MATERIALS.filter(m => {
      if (subject !== "all" && m.subject !== subject) return false;
      if (category !== "all" && m.category !== category) return false;
      if (q) {
        const hay = [m.title, m.source, m.summary, m.category, ...(m.keywords || [])].join(" ");
        if (!hay.toLowerCase().includes(q.toLowerCase())) return false;
      }
      return true;
    });
    $("#materialCount").textContent = list.length;
    $("#materialList").innerHTML = list.length ? list.map(m => `
      <div class="card" data-material="${m.id}">
        <div class="chip-row">
          <span class="chip sub-${m.subject}">${m.subject}</span>
          <span class="chip cat">${esc(m.category)}</span>
        </div>
        <h4>${esc(m.title)}</h4>
        <div class="sub">${esc(m.source || "")}</div>
        <div class="desc">${esc(m.summary)}</div>
        <div class="more">查看材料 →</div>
      </div>`).join("") : `<div class="empty">没有匹配的材料</div>`;

    $$("#materialList .card").forEach(el => el.addEventListener("click", () => showMaterial(el.dataset.material)));
  }

  function showMaterial(id) {
    const m = MATERIALS.find(x => x.id === id);
    if (!m) return;
    const linked = (m.theories || []).map(tid => THEORIES.find(t => t.id === tid)).filter(Boolean);
    openModal(`
      <div class="md">
        <h3>${esc(m.title)}</h3>
        <div class="meta">${esc(m.source || "")} ｜ <span class="chip sub-${m.subject}">${m.subject}</span> <span class="chip cat">${esc(m.category)}</span></div>
        <h5>材料内容</h5><p>${esc(m.content)}</p>
        <h5>可论证的角度</h5><ul>${(m.points || []).map(p => `<li>${esc(p)}</li>`).join("")}</ul>
        ${linked.length ? `<h5>可对接的理论</h5>
        <div class="chip-row">${linked.map(t => `<span class="chip" data-theory="${t.id}">${esc(t.name)}</span>`).join("")}</div>` : ""}
        <h5>检索关键词</h5><div class="chip-row">${(m.keywords || []).map(k => `<span class="chip">${esc(k)}</span>`).join("")}</div>
      </div>`);
    $("#modalBody").querySelectorAll("[data-theory]").forEach(el =>
      el.addEventListener("click", () => showTheory(el.dataset.theory)));
  }

  /* ---------- 评分标准 ---------- */
  function initStandard() { renderStandard(); }

  function renderStandard() {
    const rows = RUBRICS["783"].map((r, i) => {
      const r8 = RUBRICS["887"][i];
      return `<div class="rubric-row"><span>${r.name}</span><span>783 <b>${r.max}</b> ｜ 887 <b>${r8.max}</b></span></div>`;
    }).join("");

    const blocks = STANDARDS.sections.map(s => {
      const body = s.items && s.items.length
        ? `<ul class="std-list">${s.items.map(it => `<li>${typeof it === "string" ? esc(it) : esc(it.text || "")}</li>`).join("")}</ul>`
        : `<div class="std-empty">待补充</div>`;
      return `<div class="panel std-block">
        <h3 class="panel-title">${esc(s.title)}</h3>
        ${s.desc ? `<p class="muted">${esc(s.desc)}</p>` : ""}
        ${body}
      </div>`;
    }).join("");

    $("#standardView").innerHTML = `
      <div class="panel std-intro">
        <p>${esc(STANDARDS.intro)}</p>
        <p class="muted">${STANDARDS.updated ? "标准更新：" + esc(STANDARDS.updated) : "标准内容尚待补充，补充后本页自动显示。"}</p>
      </div>
      <div class="panel">
        <h3 class="panel-title">批改维度与配分（当前系统使用）</h3>
        ${rows}
        <div class="rubric-row"><span>满分</span><span>783 <b>${RUBRICS["783"].reduce((n, r) => n + r.max, 0)}</b> ｜ 887 <b>${RUBRICS["887"].reduce((n, r) => n + r.max, 0)}</b></span></div>
      </div>
      <div class="grid-2 std-grid">${blocks}</div>`;
  }

  /* ---------- 模范答题卡 ---------- */
  function initModels() {
    $("#modelSubject").addEventListener("change", renderModels);
    renderModels();
  }

  function renderModels() {
    const sub = $("#modelSubject").value;
    const list = MODELS.filter(m => sub === "all" || m.subject === sub);
    $("#modelList").innerHTML = list.length ? list.map(m => `
      <div class="model-item" data-model="${m.id}">
        <div class="model-head">
          <div>
            <h4>${esc(m.title)}</h4>
            <div class="meta muted">题目：${esc(m.topic)} ｜ 约 ${m.words} 字 ｜ 科目 ${m.subject}</div>
          </div>
          <div class="score">${esc(m.score)}</div>
        </div>
        <div class="model-body">
          <div class="model-col left">
            <h5>范文原文</h5>
            ${m.paras.map(p => `<div class="para"><span class="tag">${esc(p.tag)}</span>${esc(p.text)}</div>`).join("")}
          </div>
          <div class="model-col">
            <h5>批注与拆解</h5>
            ${m.notes.map(n => `<div class="note ${n.type === "warn" ? "accent" : ""}">${n.text}</div>`).join("")}
          </div>
        </div>
      </div>`).join("") : `<div class="empty">暂无该科目的模范卷</div>`;

    $$("#modelList .model-head").forEach(h =>
      h.addEventListener("click", () => h.parentElement.classList.toggle("open")));
  }

  /* ---------- 往年练习 ---------- */
  function allSessions() { return [...TRAINING_PLAN.months, ...TRAINING_PLAN.mocks]; }
  function findPast(id) {
    for (const y of PAST_EXERCISES) {
      const it = (y.items || []).find(x => x.id === id);
      if (it) return it;
    }
    return null;
  }

  function initPast() {
    const total = PAST_EXERCISES.reduce((n, y) => n + (y.items || []).length, 0);
    $("#pastCount").textContent = total;

    const blocks = PAST_EXERCISES.map(y => {
      const body = (y.items || []).length
        ? `<div class="past-grid">${y.items.map(it => `
            <div class="past-card" data-past="${it.id}">
              <div class="chip-row">
                <span class="chip sub-${it.subject}">${it.subject}</span>
                ${it.sample ? `<span class="chip cat">示例</span>` : ""}
              </div>
              <h4>${esc(it.title)}</h4>
              <div class="desc">${esc(it.topic || "")}</div>
              <div class="more">拿去练习 →</div>
            </div>`).join("")}</div>`
        : `<div class="empty">该年份题目待补充</div>`;
      return `<div class="panel past-block"><h3 class="panel-title">${esc(y.year)}</h3>${body}</div>`;
    }).join("");

    $("#pastView").innerHTML = `
      <div class="panel past-note">
        <p>这里收录「往年练习」题目，方便按年份回看与重练；点击任一题目即可带入「提交批改」。</p>
        <p class="muted">当前条目为结构示例（非真实考题），正式题目待补充校对。</p>
      </div>` + blocks;

    $$("#pastView .past-card").forEach(card => card.addEventListener("click", () => {
      const it = findPast(card.dataset.past);
      if (!it) return;
      switchView("submit");
      if (it.subject) $("#subjSelect").value = it.subject;
      if (it.title) $("#topicInput").value = it.title;
      $("#essayInput").focus();
    }));
  }

  /* ---------- 本月题目库 ---------- */
  const MONTH_NUM = { m04: 4, m05: 5, m06: 6, m07: 7, m08: 8, m09: 9, m10: 10, m11: 11 };

  function currentMonthId() {
    const n = new Date().getMonth() + 1;
    const hit = MONTHLY_TOPICS.find(g => MONTH_NUM[g.month] === n);
    return hit ? hit.month : "";
  }

  function findTopic(id) {
    for (const g of MONTHLY_TOPICS) {
      const it = (g.items || []).find(x => x.id === id);
      if (it) return it;
    }
    return null;
  }

  function initTopics() { renderTopics(); }

  function renderTopics() {
    const total = MONTHLY_TOPICS.reduce((n, g) => n + (g.items || []).length, 0);
    $("#topicLibCount").textContent = total;

    const cur = currentMonthId();
    const groups = [...MONTHLY_TOPICS].sort((a, b) => (b.month === cur) - (a.month === cur));

    const blocks = groups.map(g => {
      const body = (g.items || []).length
        ? `<div class="past-grid">${g.items.map(it => `
            <div class="past-card" data-topic="${it.id}">
              <div class="chip-row">
                <span class="chip sub-${it.subject}">${it.subject}</span>
                ${it.material ? `<span class="chip cat">含材料</span>` : ""}
              </div>
              <h4>${esc(it.title)}</h4>
              <div class="desc">${esc(it.topic || "")}</div>
              <div class="more">拿去练习 →</div>
            </div>`).join("")}</div>`
        : `<div class="empty">该月题目待补充</div>`;
      return `<div class="panel past-block"><h3 class="panel-title">${esc(g.label)}${g.month === cur ? ` <span class="chip cat">本月</span>` : ""}</h3>${body}</div>`;
    }).join("");

    $("#topicLibView").innerHTML = `
      <div class="panel past-note">
        <p>按月份组织的题目库，与「练习计划」一一对应；点击任一题目即可带入「提交批改」。</p>
        <p class="muted">题目与材料可随教学进度更新，当前为结构示例。</p>
      </div>` + blocks;

    $$("#topicLibView .past-card").forEach(card => card.addEventListener("click", () => {
      const it = findTopic(card.dataset.topic);
      if (!it) return;
      switchView("submit");
      if (it.subject) $("#subjSelect").value = it.subject;
      const parts = [it.topic || it.title];
      if (it.material) parts.push("材料：" + it.material);
      if (it.require) parts.push("要求：" + it.require);
      $("#topicInput").value = parts.join("　");
      $("#essayInput").focus();
    }));
  }

  /* ---------- 片段练习 ---------- */
  function findFragment(id) {
    for (const g of FRAGMENT_PRACTICES) {
      const it = (g.items || []).find(x => x.id === id);
      if (it) return it;
    }
    return null;
  }

  function initFragments() { renderFragments(); }

  function renderFragments() {
    const total = FRAGMENT_PRACTICES.reduce((n, g) => n + (g.items || []).length, 0);
    $("#fragmentCount").textContent = total;

    const blocks = FRAGMENT_PRACTICES.map(g => {
      const body = (g.items || []).length
        ? `<div class="past-grid">${g.items.map(it => `
            <div class="past-card" data-fragment="${it.id}">
              <div class="chip-row">
                <span class="chip sub-${it.subject}">${it.subject}</span>
                <span class="chip cat">${esc(g.label)}</span>
              </div>
              <h4>${esc(it.title)}</h4>
              <div class="desc">${esc(it.task || "")}</div>
              <div class="more">开始练习 →</div>
            </div>`).join("")}</div>`
        : `<div class="empty">该组片段待补充</div>`;
      return `<div class="panel past-block">
        <h3 class="panel-title">${esc(g.label)}</h3>
        <p class="muted frag-desc">${esc(g.desc || "")}</p>${body}</div>`;
    }).join("");

    $("#fragmentView").innerHTML = `
      <div class="panel past-note">
        <p>把整篇写作拆成可单独训练的小片段，逐个突破开头、论据、过渡与结尾；点击任一任务即可带入「提交批改」。</p>
        <p class="muted">片段练习不必写完整篇，聚焦一个目标写透即可。</p>
      </div>` + blocks;

    $$("#fragmentView .past-card").forEach(card => card.addEventListener("click", () => {
      const it = findFragment(card.dataset.fragment);
      if (!it) return;
      switchView("submit");
      if (it.subject) $("#subjSelect").value = it.subject;
      const parts = [it.task || it.title];
      if (it.tips && it.tips.length) parts.push("要点：" + it.tips.join("；"));
      $("#topicInput").value = parts.join("　");
      $("#essayInput").focus();
    }));
  }

  /* ---------- 练习计划 ---------- */
  function initPlan() {
    const sel = $("#sessionSelect");
    if (sel) {
      sel.innerHTML = '<option value="">不指定（自由练习）</option>' +
        '<optgroup label="月度练习（4—11 月）">' +
        TRAINING_PLAN.months.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join("") +
        '</optgroup>' +
        '<optgroup label="模拟考试">' +
        TRAINING_PLAN.mocks.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join("") +
        '</optgroup>';
    }
    renderPlan();
  }

  function renderPlan() {
    const reports = loadReports();
    const cards = arr => arr.map(s => {
      const rs = reports.filter(r => r.session === s.id);
      const best = rs.length ? Math.max(...rs.map(r => r.total)) : null;
      const done = rs.length > 0;
      return `<div class="plan-card ${done ? "done" : ""}" data-session="${s.id}">
        <div class="plan-top">
          <span class="plan-name">${esc(s.label)}</span>
          <span class="plan-state ${done ? "ok" : ""}">${done ? "已完成" : "未开始"}</span>
        </div>
        <div class="plan-body">
          ${done
            ? `<span class="plan-score">${best}<small> 分</small></span><span class="muted">已提交 ${rs.length} 篇</span>`
            : `<span class="muted">还没有提交，点开写一篇</span>`}
        </div>
        <div class="plan-more">${done ? "再练一篇 →" : "去练习 →"}</div>
      </div>`;
    }).join("");

    $("#planView").innerHTML = `
      <div class="panel">
        <h3 class="panel-title">月度练习 · 4—11 月</h3>
        <div class="plan-grid">${cards(TRAINING_PLAN.months)}</div>
      </div>
      <div class="panel" style="margin-top:16px">
        <h3 class="panel-title">模拟考试 · 三次</h3>
        <div class="plan-grid">${cards(TRAINING_PLAN.mocks)}</div>
      </div>`;

    $$("#planView .plan-card").forEach(c => c.addEventListener("click", () => gotoSession(c.dataset.session)));
  }

  function gotoSession(id) {
    if (!allSessions().some(s => s.id === id)) return;
    switchView("submit");
    const sel = $("#sessionSelect");
    if (sel) sel.value = id;
    $("#essayInput").focus();
  }

  /* ---------- 提交批改 ---------- */
  const DEMO = {
    "783": `当技术开始替我们思考

打开手机的这一刻，算法已经替我们筛好了今天该看的内容。技术从未像今天这样深入地介入我们的认知过程。它带来效率，也带来了一个尖锐的问题：当技术开始替我们思考，人的主体性该安放何处？

首先，媒介形式的改变重塑了人的感知结构。麦克卢汉提出「媒介即讯息」，强调真正改变社会的并非媒介承载的内容，而是媒介形式本身。短视频的竖屏交互与无限下滑，塑造的是一种碎片化、预判式的接收习惯。我们不再主动检索，而是等待被推送。

其次，技术的注意力攫取背后是资本的逻辑。德波在《景观社会》中指出，生活本身表现为景观的庞大堆积。在算法时代，一切都被图像化、可展示、可消费。打卡、出片、分享构成新的日常仪式，景观以更精确的方式实现了对人的包围，这正是文化工业所描述的标准化生产与伪个性化。

然而，技术并非只有驯化的一面。使用与满足理论提醒我们，受众从来不是被动的靶子。人们用短视频学习技能、寻找同好、获得情绪价值。技术同时提供了过去难以企及的连接与学习机会，关键在于我们能否从被推荐转向主动选择。

综上所述，技术不会停下，真正需要守护的是人在技术面前的主体性。与其焦虑于技术是否取代人，不如练习一种新的能力：在加速的世界里，保留慢下来的自由。这种自由既是媒介素养，也是人的尊严所在。`,
    "887": `复制之后：数字时代的艺术灵晕

当敦煌的壁画可以在一台平板里被无限放大，我们与艺术之间的经验正在被重新定义。本雅明在《机械复制时代的艺术作品》中指出，机械复制使艺术品脱离了其独一无二的时空存在，其光韵即灵晕随之消散。数字技术把这一进程推向极致。

首先，高清扫描剥离了颜料随时间沉积的物质质感，虚拟展陈则取消了实地观看的仪式性。当我们随时随地都能看到《千里江山图》，它身上那层只在此时此地的光晕也随之稀薄。

其次，复制也带来了艺术的解放。它让艺术走出殿堂，成为普通人日常可享的经验，这正是本雅明本人所肯定的进步意义所在。

再者，灵晕未必单向消逝，它也可能转移。人们之所以愿意在数字观看之后仍长途跋涉去敦煌，恰恰说明原作的灵晕以另一种方式被强化。丹托认为艺术的身份由语境授予，当数字语境成为新的艺术界，新的灵晕也随之生长。

因此，问题不在于技术会不会毁掉艺术，而在于我们如何与技术共处。数字复制削弱了旧的神圣，却打开了新的公共性。艺术的灵晕不会消失，它只是在寻找新的居所。`
  };

  function initSubmit() {
    const ta = $("#essayInput");
    ta.addEventListener("input", () => { $("#charCount").textContent = ta.value.replace(/\s/g, "").length; });
    $("#demoBtn").addEventListener("click", () => {
      ta.value = DEMO[$("#subjSelect").value];
      ta.dispatchEvent(new Event("input"));
    });
    $("#clearBtn").addEventListener("click", () => {
      ta.value = ""; ta.dispatchEvent(new Event("input"));
      $("#reportPanel").innerHTML = '<div class="empty-hint">批改报告会显示在这里</div>';
    });
    $("#gradeBtn").addEventListener("click", doGrade);
  }

  function doGrade() {
    const text = $("#essayInput").value.trim();
    if (text.length < 80) { alert("正文太短了，至少写 80 字再提交吧。"); return; }
    const report = Grader.grade($("#subjSelect").value, text, {
      topic: $("#topicInput").value.trim()
    });
    const sid = $("#sessionSelect") ? $("#sessionSelect").value : "";
    const session = allSessions().find(s => s.id === sid);
    report.session = sid || "";
    report.sessionLabel = session ? session.label : "";
    renderReport(report, "#reportPanel");
    saveReport(report);
    $("#reportPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderReport(r, target) {
    const dims = r.dims.map(d => {
      const ratio = d.score / d.max;
      const cls = ratio >= 0.8 ? "" : ratio >= 0.55 ? "mid" : "low";
      return `<div class="dim">
        <div class="dim-top"><span>${d.name}</span><span><b>${d.score}</b> / ${d.max}</span></div>
        <div class="dim-bar"><i class="${cls}" style="width:${Math.round(ratio * 100)}%"></i></div>
      </div>`;
    }).join("");

    const hitT = r.theories.length
      ? r.theories.map(t => `<span class="t">${esc(t.name)} ×${t.count}</span>`).join("")
      : `<span class="t miss">未检测到理论运用</span>`;
    const hitC = r.cases.length
      ? r.cases.map(c => `<span class="t">${esc(c.title)} ×${c.count}</span>`).join("")
      : `<span class="t miss">未检测到具体案例</span>`;

    const recT = r.recommendTheory.length
      ? r.recommendTheory.map(t => `<span class="chip" data-theory="${t.id}">${esc(t.name)}</span>`).join("")
      : `<span class="muted">已覆盖较多理论</span>`;
    const recC = r.recommendCase.length
      ? r.recommendCase.map(c => `<span class="chip" data-case="${c.id}">${esc(c.title)}</span>`).join("")
      : `<span class="muted">已覆盖较多案例</span>`;

    const html = `
      <div class="score-hero">
        <div class="score-big">${r.total}<small> / ${SCORE_FULL}</small></div>
        <div class="score-meta">
          <b>${r.band}</b>　科目 ${r.subject}<br>
          ${r.student ? esc(r.student) + "　" : ""}${new Date(r.time).toLocaleString("zh-CN")}
        </div>
      </div>

      <div class="stats muted" style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px">
        <span>字数 ${r.stats.charCount}</span>
        <span>段落 ${r.stats.paraCount}</span>
        <span>平均句长 ${r.stats.avgSent} 字</span>
        <span>分论点标志 ${r.stats.markers}</span>
        <span>辩证转折 ${r.stats.dialectic}</span>
        ${r.lengthPenalty ? `<span style="color:#b4341f">篇幅折扣 −${r.lengthPenalty}（各项小计 ${r.rawTotal}）</span>` : ""}
      </div>

      ${dims}

      <div class="findings">
        <h5>理论命中</h5><div class="tagflow">${hitT}</div>
        <h5>案例命中</h5><div class="tagflow">${hitC}</div>
      </div>

      <div class="advice">
        <h5>推荐补充的理论</h5><div class="chip-row">${recT}</div>
        <h5>推荐补充的案例</h5><div class="chip-row">${recC}</div>
        <h5>批改意见</h5>
        <ol>${r.advice.map(a => `<li>${esc(a)}</li>`).join("")}</ol>
      </div>`;

    const box = $(target);
    box.innerHTML = html;
    box.querySelectorAll("[data-theory]").forEach(el => el.addEventListener("click", () => showTheory(el.dataset.theory)));
    box.querySelectorAll("[data-case]").forEach(el => el.addEventListener("click", () => showCase(el.dataset.case)));
  }

  /* ---------- 记录 ---------- */
  function loadReports() { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch (e) { return []; } }
  function saveReport(r) {
    const all = loadReports();
    all.unshift(r);
    localStorage.setItem(STORE, JSON.stringify(all.slice(0, 50)));
    renderHistory();
    renderDashboard();
    renderPlan();
  }
  function deleteReport(idx) {
    const all = loadReports();
    all.splice(idx, 1);
    localStorage.setItem(STORE, JSON.stringify(all));
    renderHistory();
    renderDashboard();
    renderPlan();
  }
  function renderHistory() {
    const arr = loadReports();
    if (!arr.length) { $("#historyList").innerHTML = '<div class="empty">还没有批改记录，去「提交批改」写一篇吧</div>'; return; }
    $("#historyList").innerHTML = arr.map((r, i) => `
      <div class="hist-item">
        <div>
          <h4>${esc(r.topic || "未填题目")}　<span class="chip sub-${r.subject}">${r.subject}</span>${r.sessionLabel ? ` <span class="chip cat">${esc(r.sessionLabel)}</span>` : ""}</h4>
          <div class="meta">${new Date(r.time).toLocaleString("zh-CN")} ｜ ${r.stats.charCount} 字 ｜ ${esc(r.band || "")}</div>
        </div>
        <div style="display:flex;align-items:center;gap:16px">
          <div class="sc">${r.total}</div>
          <div class="hist-actions">
            <button data-open="${i}">查看</button>
            <button data-del="${i}">删除</button>
          </div>
        </div>
      </div>`).join("");

    $$("#historyList [data-open]").forEach(b => b.addEventListener("click", () => {
      const r = loadReports()[+b.dataset.open];
      openModal(`<div class="md" id="histReport"></div>`);
      renderReport(r, "#histReport");
    }));
    $$("#historyList [data-del]").forEach(b => b.addEventListener("click", () => deleteReport(+b.dataset.del)));
  }

  /* ---------- 启动 ---------- */
  let booted = false;
  function initSections() {
    if (booted) return;
    booted = true;
    initTheory();
    initCases();
    initMaterials();
    initStandard();
    initModels();
    initPast();
    initTopics();
    initFragments();
    initPlan();
    initSubmit();
  }

  function refresh() {
    renderDashboard();
    renderHistory();
  }

  function boot() {
    $("#clearHistoryBtn").addEventListener("click", () => {
      if (!confirm("确定清空全部批改记录？")) return;
      localStorage.removeItem(STORE);
      renderHistory();
      renderDashboard();
      renderPlan();
    });

    initSections();
    refresh();
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
