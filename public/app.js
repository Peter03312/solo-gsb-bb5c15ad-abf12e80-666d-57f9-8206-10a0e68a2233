'use strict';
/* 舞台监督提示单系统 —— 前端单页应用（原生 JS，hash 路由） */

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
const connEl = document.getElementById('conn');

const TYPE_TEXT = { light: '灯光', sound: '音效', set: '布景', other: '其他' };
const STATUS_TEXT = { pending: '待执行', fired: '已触发', skipped: '已跳过', blocked: '受阻' };
const REQUEST_STATUS_TEXT = { pending: '待复核', confirmed: '已确认', cancelled: '已撤销', rejected: '已驳回' };
const CLOSURE_REASON_TEXT = {
  incomplete: '未完成提示（无有效已触发 / 已跳过结果）',
  review: '待复核申请未处置',
  fault: '未解除设备故障',
  handover: '待签收交接单',
};

let toastTimer = null;
let pollTimer = null;

/* ---------- 工具 ---------- */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return isNaN(d) ? ts : d.toLocaleString('zh-CN', { hour12: false });
}

function toast(msg, isError) {
  toastEl.textContent = msg;
  toastEl.className = 'toast' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 4200);
}

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    connEl.textContent = '连接失败';
    throw new Error('无法连接服务器');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `请求失败（${res.status}）`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  connEl.textContent = '';
  return data;
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function getOperator() {
  return (document.getElementById('operator-input') || {}).value ||
    localStorage.getItem('operator') || '';
}

/* ---------- 路由 ---------- */

function route() {
  stopPolling();
  const hash = location.hash || '#/';
  const parts = hash.slice(2).split('/').filter(Boolean);
  if (parts.length === 0) return renderShows();
  if (parts[0] === 'shows' && parts[1]) return renderShow(parts[1]);
  if (parts[0] === 'versions' && parts[1]) return renderVersion(parts[1]);
  if (parts[0] === 'performances' && parts[1]) return renderPerformance(parts[1]);
  renderShows();
}
window.addEventListener('hashchange', route);
window.addEventListener('load', route);

/* ---------- 视图：场次列表 ---------- */

async function renderShows() {
  app.innerHTML = '<p class="muted">加载中…</p>';
  try {
    const { shows } = await api('/api/shows');
    app.innerHTML = `
      <h1>场次（剧目）</h1>
      <div class="panel row">
        <input id="new-show-name" type="text" placeholder="新场次名称，如《茶馆》2026 巡演" class="grow">
        <button id="create-show">新建场次</button>
      </div>
      <div class="panel">
        ${shows.length === 0 ? '<p class="muted">还没有场次，请先新建。</p>' : `
        <table>
          <thead><tr><th>名称</th><th>版本数</th><th>已发布</th><th>演出场次</th><th>创建时间</th><th></th></tr></thead>
          <tbody>
            ${shows.map(s => `
              <tr>
                <td>${esc(s.name)}</td>
                <td>${s.version_count}</td>
                <td>${s.published_count}</td>
                <td>${s.performance_count}</td>
                <td class="muted">${fmtTime(s.created_at)}</td>
                <td><a href="#/shows/${s.id}">进入 →</a></td>
              </tr>`).join('')}
          </tbody>
        </table>`}
      </div>`;
    document.getElementById('create-show').onclick = async () => {
      const name = document.getElementById('new-show-name').value.trim();
      if (!name) return toast('请输入场次名称', true);
      try {
        const { show } = await api('/api/shows', { method: 'POST', body: { name } });
        location.hash = `#/shows/${show.id}`;
      } catch (e) { toast(e.message, true); }
    };
  } catch (e) { app.innerHTML = `<div class="error-list">${esc(e.message)}</div>`; }
}

/* ---------- 视图：场次详情（版本 + 演出） ---------- */

async function renderShow(id) {
  app.innerHTML = '<p class="muted">加载中…</p>';
  try {
    const { show, versions, performances } = await api(`/api/shows/${id}`);
    const published = versions.filter(v => v.status === 'published');
    app.innerHTML = `
      <h1>${esc(show.name)}</h1>

      <h2>执行单版本</h2>
      <div class="panel">
        <div class="row" style="margin-bottom:12px">
          <button id="new-draft">＋ 新建草稿（基于最新版本）</button>
          <span class="muted">发布后内容不可变；修改请新建草稿再发布新版本</span>
        </div>
        ${versions.length === 0 ? '<p class="muted">暂无版本。</p>' : `
        <table>
          <thead><tr><th>版本</th><th>状态</th><th>备注</th><th>创建时间</th><th>发布时间</th><th></th></tr></thead>
          <tbody>
            ${versions.map(v => `
              <tr>
                <td>v${v.version_number}</td>
                <td><span class="badge ${v.status}">${v.status === 'published' ? '已发布' : '草稿'}</span></td>
                <td class="muted">${esc(v.note || '')}</td>
                <td class="muted">${fmtTime(v.created_at)}</td>
                <td class="muted">${v.published_at ? fmtTime(v.published_at) : '-'}</td>
                <td><a href="#/versions/${v.id}">${v.status === 'draft' ? '编辑' : '查看'} →</a></td>
              </tr>`).join('')}
          </tbody>
        </table>`}
      </div>

      <h2>启动演出</h2>
      <div class="panel row">
        ${published.length === 0
          ? '<span class="muted">无已发布版本，请先在上方编辑并发布执行单。</span>'
          : `
          <select id="perf-version">
            ${published.map(v => `<option value="${v.id}">v${v.version_number}${v.note ? '（' + esc(v.note) + '）' : ''}</option>`).join('')}
          </select>
          <input id="perf-name" type="text" placeholder="演出名称，如 9月30日 晚场">
          <input id="perf-operator" type="text" placeholder="启动人">
          <button id="start-perf">启动演出</button>`}
      </div>

      <h2>演出记录</h2>
      <div class="panel">
        ${performances.length === 0 ? '<p class="muted">暂无演出记录。</p>' : `
        <table>
          <thead><tr><th>#</th><th>名称</th><th>执行单版本</th><th>状态</th><th>接续关系</th><th>启动人</th><th>开始时间</th><th></th></tr></thead>
          <tbody>
            ${performances.map(p => `
              <tr>
                <td>${p.id}</td>
                <td>${esc(p.name || '（未命名）')}</td>
                <td>v${p.version_number}</td>
                <td>${p.status === 'closed'
                    ? '<span class="badge closed">已封场 · 结项</span>'
                    : p.status === 'readonly'
                      ? '<span class="badge readonly">只读 · 已接续</span>'
                      : '<span class="badge active">可操作</span>'}</td>
                <td class="muted">${p.continued_from_performance_id
                    ? `承接自 <a href="#/performances/${p.continued_from_performance_id}">#${p.continued_from_performance_id}（v${p.continued_from_version_number}）</a>`
                    : '—'}</td>
                <td>${esc(p.started_by || '-')}</td>
                <td class="muted">${fmtTime(p.started_at)}</td>
                <td><a href="#/performances/${p.id}">进入执行台 →</a></td>
              </tr>`).join('')}
          </tbody>
        </table>`}
      </div>`;

    document.getElementById('new-draft').onclick = async () => {
      try {
        const { version } = await api(`/api/shows/${id}/versions`, { method: 'POST', body: {} });
        toast(`已创建草稿 v${version.version_number}`);
        location.hash = `#/versions/${version.id}`;
      } catch (e) { toast(e.message, true); }
    };

    const startBtn = document.getElementById('start-perf');
    if (startBtn) startBtn.onclick = async () => {
      try {
        const { performance } = await api(`/api/shows/${id}/performances`, {
          method: 'POST',
          body: {
            version_id: Number(document.getElementById('perf-version').value),
            name: document.getElementById('perf-name').value.trim(),
            operator: document.getElementById('perf-operator').value.trim(),
          },
        });
        location.hash = `#/performances/${performance.id}`;
      } catch (e) { toast(e.message, true); }
    };
  } catch (e) { app.innerHTML = `<div class="error-list">${esc(e.message)}</div>`; }
}

/* ---------- 视图：版本（草稿编辑器 / 已发布快照） ---------- */

let editorCues = null; // 当前草稿编辑内容

function collectEditorCues() {
  return editorCues.map(c => ({
    label: c.label.trim(),
    type: c.type,
    description: c.description.trim(),
    deps: c.depsText.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean),
    needs_review: !!c.needs_review,
  }));
}

function renderEditorTable() {
  const tbody = document.getElementById('editor-tbody');
  tbody.innerHTML = editorCues.map((c, i) => `
    <tr>
      <td class="muted">${i + 1}</td>
      <td><input type="text" class="label-input" data-i="${i}" data-f="label" value="${esc(c.label)}" placeholder="如 L1"></td>
      <td>
        <select data-i="${i}" data-f="type">
          ${Object.entries(TYPE_TEXT).map(([k, t]) =>
            `<option value="${k}" ${c.type === k ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </td>
      <td><input type="text" data-i="${i}" data-f="description" value="${esc(c.description)}" placeholder="提示内容描述"></td>
      <td><input type="text" class="deps-input" data-i="${i}" data-f="depsText" value="${esc(c.depsText)}" placeholder="前置编号，逗号分隔"></td>
      <td style="text-align:center"><input type="checkbox" data-i="${i}" data-f="needs_review" ${c.needs_review ? 'checked' : ''} title="现场触发需另一操作人复核确认"></td>
      <td style="white-space:nowrap">
        <button class="ghost small" data-act="up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="ghost small" data-act="down" data-i="${i}" ${i === editorCues.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="danger small" data-act="del" data-i="${i}">删</button>
      </td>
    </tr>`).join('');

  tbody.querySelectorAll('input,select').forEach(el => {
    el.onchange = el.oninput = () => {
      const i = Number(el.dataset.i);
      const f = el.dataset.f;
      editorCues[i][f] = el.type === 'checkbox' ? el.checked : el.value;
    };
  });
  tbody.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      const i = Number(btn.dataset.i);
      const act = btn.dataset.act;
      if (act === 'del') editorCues.splice(i, 1);
      else if (act === 'up' && i > 0) [editorCues[i - 1], editorCues[i]] = [editorCues[i], editorCues[i - 1]];
      else if (act === 'down' && i < editorCues.length - 1) [editorCues[i + 1], editorCues[i]] = [editorCues[i], editorCues[i + 1]];
      renderEditorTable();
    };
  });
}

function showErrors(errors) {
  const box = document.getElementById('validate-result');
  if (!box) return;
  if (!errors || errors.length === 0) {
    box.innerHTML = '<div class="ok-box">✓ 校验通过：无缺失引用、无循环依赖</div>';
  } else {
    box.innerHTML = `<div class="error-list"><b>发现 ${errors.length} 个问题：</b><ul>${
      errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
  }
}

async function renderVersion(id) {
  app.innerHTML = '<p class="muted">加载中…</p>';
  try {
    const { version, cues } = await api(`/api/versions/${id}`);
    const isDraft = version.status === 'draft';

    if (!isDraft) {
      // 已发布：只读快照（历史按当时版本回看）
      app.innerHTML = `
        <h1>执行单 v${version.version_number} <span class="badge published">已发布 · 不可变</span></h1>
        <p class="muted">发布于 ${fmtTime(version.published_at)}　${esc(version.note || '')}</p>
        <div class="panel">
          <table>
            <thead><tr><th>#</th><th>编号</th><th>类型</th><th>描述</th><th>前置提示</th><th>复核</th></tr></thead>
            <tbody>
              ${cues.map(c => `
                <tr>
                  <td class="muted">${c.seq}</td>
                  <td><b>${esc(c.label)}</b></td>
                  <td>${TYPE_TEXT[c.type] || c.type}</td>
                  <td>${esc(c.description)}</td>
                  <td>${c.deps.length ? c.deps.map(d => `<span class="dep-chip">${esc(d)}</span>`).join('') : '<span class="muted">无</span>'}</td>
                  <td>${c.needs_review ? '<span class="badge review">双人复核</span>' : '<span class="muted">—</span>'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="row">
          <a href="#/shows/${version.show_id}">← 返回场次</a>
          <button class="ghost" id="copy-draft">以此版本为基准新建草稿</button>
        </div>`;
      document.getElementById('copy-draft').onclick = async () => {
        try {
          const r = await api(`/api/shows/${version.show_id}/versions`, {
            method: 'POST', body: { from_version_id: version.id },
          });
          toast(`已创建草稿 v${r.version.version_number}`);
          location.hash = `#/versions/${r.version.id}`;
        } catch (e) { toast(e.message, true); }
      };
      return;
    }

    // 草稿编辑器
    editorCues = cues.map(c => ({
      label: c.label, type: c.type, description: c.description, depsText: c.deps.join(', '),
      needs_review: !!c.needs_review,
    }));

    app.innerHTML = `
      <h1>执行单 v${version.version_number} <span class="badge draft">草稿</span></h1>
      <p class="muted">前置提示填写其他提示的编号（逗号分隔）。勾选「复核」的提示现场触发时需另一操作人确认。保存不影响已开始的演出。</p>
      <div class="panel">
        <table class="editor-table">
          <thead><tr><th>#</th><th>编号</th><th>类型</th><th>描述</th><th>前置提示</th><th>复核</th><th>操作</th></tr></thead>
          <tbody id="editor-tbody"></tbody>
        </table>
        <div class="row" style="margin-top:12px">
          <button class="ghost" id="add-cue">＋ 添加提示</button>
        </div>
      </div>
      <div id="validate-result"></div>
      <div class="row">
        <button id="save-draft">保存草稿</button>
        <button class="ghost" id="validate-btn">校验</button>
        <button class="big" id="publish-btn">校验并发布</button>
        <a href="#/shows/${version.show_id}" style="margin-left:auto">← 返回场次</a>
      </div>`;

    renderEditorTable();

    document.getElementById('add-cue').onclick = () => {
      editorCues.push({ label: '', type: 'light', description: '', depsText: '' });
      renderEditorTable();
    };

    document.getElementById('save-draft').onclick = async () => {
      try {
        const r = await api(`/api/versions/${id}/cues`, {
          method: 'PUT', body: { cues: collectEditorCues() },
        });
        toast('草稿已保存');
        showErrors(r.errors);
      } catch (e) { toast(e.message, true); }
    };

    document.getElementById('validate-btn').onclick = async () => {
      try {
        const r = await api(`/api/versions/${id}/validate`, {
          method: 'POST', body: { cues: collectEditorCues() },
        });
        showErrors(r.errors);
      } catch (e) { toast(e.message, true); }
    };

    document.getElementById('publish-btn').onclick = async () => {
      try {
        // 先保存当前编辑内容，再发布
        const saved = await api(`/api/versions/${id}/cues`, {
          method: 'PUT', body: { cues: collectEditorCues() },
        });
        if (saved.errors && saved.errors.length) {
          showErrors(saved.errors);
          return toast('校验未通过，无法发布', true);
        }
        await api(`/api/versions/${id}/publish`, { method: 'POST', body: {} });
        toast('已发布，执行单不可再修改');
        renderVersion(id);
      } catch (e) {
        if (e.data && e.data.errors) showErrors(e.data.errors);
        toast(e.message, true);
      }
    };
  } catch (e) { app.innerHTML = `<div class="error-list">${esc(e.message)}</div>`; }
}

/* ---------- 视图：演出执行台 ---------- */

// 接续面板展开状态按演出记忆（2.5s 轮询重绘时保留操作现场）
const continueUiState = new Map();
function getContinueState(perfId) {
  if (!continueUiState.has(perfId)) {
    continueUiState.set(perfId, { formOpen: false, preview: null, versionId: null, name: '', operator: '' });
  }
  return continueUiState.get(perfId);
}

async function renderPerformance(id) {
  try {
    const data = await api(`/api/performances/${id}`);
    drawPerformance(id, data);
    if (!pollTimer) {
      pollTimer = setInterval(async () => {
        try {
          const d = await api(`/api/performances/${id}`);
          drawPerformance(id, d);
        } catch (e) { connEl.textContent = '刷新失败'; }
      }, 2500);
    }
  } catch (e) { app.innerHTML = `<div class="error-list">${esc(e.message)}</div>`; }
}

function drawPerformance(id, { performance: perf, continuation, continue_targets: targets, cues, events, review_requests: reviewRequests, faults, active_fault_count: activeFaultCount, handover, handover_history: handoverHistory, closure }) {
  // 2.5s 轮询整体重绘：记住当前焦点与光标位置，重绘后恢复，避免输入被打断
  const active = document.activeElement;
  const focusKey = active && (active.dataset.focusKey || (active.id === 'operator-input' ? 'operator' : null));
  const caret = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
    ? { start: active.selectionStart, end: active.selectionEnd }
    : null;

  const counts = { pending: 0, fired: 0, skipped: 0, blocked: 0 };
  cues.forEach(c => counts[c.status]++);
  const requests = reviewRequests || [];
  const pendingReqs = requests.filter(r => r.status === 'pending');
  const resolvedReqs = requests.filter(r => r.status !== 'pending');
  const readonly = !!(continuation && continuation.readonly);
  const closed = !!(continuation && continuation.closed);
  const locked = readonly || closed; // 只读（已接续）或已封场：一切现场写操作停用
  const carriedCount = events.filter(e => e.source === 'carried').length;
  const faultList = faults || [];
  const activeFaults = faultList.filter(f => f.status === 'active');
  // 受故障影响（触发被冻结）的提示去重计数（含故障编号本身及其全部下游）
  const blockedByFaultSet = new Set();
  activeFaults.forEach(f => (f.affected_labels || []).forEach(l => blockedByFaultSet.add(l)));

  // 正在操作人框中输入时保留 DOM 中的实时值（下方 innerHTML 重绘前取出），避免光标跳尾
  const opFocused = focusKey === 'operator';
  const opVal = opFocused && active
    ? active.value
    : (document.getElementById('operator-input')
        ? document.getElementById('operator-input').value
        : (localStorage.getItem('operator') || ''));

  app.innerHTML = `
    <div class="perf-head">
      <h1 style="margin:4px 0">${esc(perf.show_name)} · ${esc(perf.name || '演出 #' + perf.id)}</h1>
      <div class="row muted" style="font-size:13px">
        <span>执行单 v${perf.version_number}（已发布快照）</span>
        ${closed
          ? '<span class="badge closed">🔒 已封场 · 结项</span>'
          : readonly
            ? '<span class="badge readonly">只读 · 已接续</span>'
            : '<span class="badge active">可操作</span>'}
        <span>开始：${fmtTime(perf.started_at)}</span>
        <span>启动人：${esc(perf.started_by || '-')}</span>
        ${perf.continued_at ? `<span>接续时间：${fmtTime(perf.continued_at)}（${esc(perf.continued_by || '-')}）</span>` : ''}
        ${closed && closure ? `<span class="status closure-chip">结项：${fmtTime(closure.closed_at)}（${esc(closure.closed_by || '-')}）</span>` : ''}
        <span class="status pending">待执行 ${counts.pending}</span>
        <span class="status fired">已触发 ${counts.fired}</span>
        <span class="status skipped">已跳过 ${counts.skipped}</span>
        <span class="status blocked">受阻 ${counts.blocked}</span>
        ${pendingReqs.length ? `<span class="status review-pending">待复核 ${pendingReqs.length}</span>` : ''}
        ${activeFaults.length ? `<span class="status fault-active">⚠ 故障 ${activeFaults.length} · 冻结 ${blockedByFaultSet.size}</span>` : ''}
        ${handover ? `<span class="status handover-pending-chip">🔁 交接待签收 · ${esc(handover.received_by)}</span>` : ''}
        <span class="grow"></span>
        <label>操作人 <input id="operator-input" type="text" value="${esc(opVal)}" placeholder="姓名" style="width:110px" ${locked ? 'disabled' : ''}></label>
        <a href="#/shows/${perf.show_id}">返回场次</a>
      </div>
    </div>
    ${renderContinuationBanner(perf, continuation, carriedCount)}
    ${closed && closure ? renderClosureBanner(closure) : ''}
    ${locked ? '' : '<div id="batch-panel-mount"></div>'}
    <div id="handover-panel-mount"></div>
    <div id="fault-panel-mount"></div>
    ${locked ? '' : '<div id="continue-panel-mount"></div>'}
    ${closed ? '<div id="closure-panel-mount"></div>' : readonly ? '' : '<div id="closure-panel-mount"></div>'}
    <div class="grid-2">
      <div id="cue-list">
        ${closed
          ? '<div class="readonly-note closure-note-bar">🔒 该演出已封场结项：提示结果、流水、复核、故障、交接均已固定为不可变封场报告，仅可回看；任何现场写操作（单项 / 成组处置、复核、故障、交接、接续）均已关闭。</div>'
          : (readonly && continuation.to
            ? `<div class="readonly-note">🔒 该演出已按修订执行单接续，保留原快照供回看，现场操作请前往<a href="#/performances/${continuation.to.performance_id}">接续演出 #${continuation.to.performance_id}（v${continuation.to.version_number}）</a>。</div>`
            : readonly
              ? '<div class="readonly-note">🔒 该演出已转为只读，保留原快照供回看。</div>'
              : '')}
        ${cues.map(c => cueCard(id, c, locked)).join('')}
      </div>
      <div>
        <div class="panel review-panel">
          <b>复核申请（待处理 ${pendingReqs.length}）</b>
          ${locked ? `<p class="muted">${closed ? '已封场演出' : '只读演出'}：申请记录可查，不能再处置。</p>` : ''}
          ${pendingReqs.length === 0 ? (readonly ? '' : '<p class="muted">暂无待复核申请</p>') : `
          <ul>
            ${pendingReqs.map(r => {
              const reqCue = cues.find(c => c.label === r.label);
              const reqFault = !!(reqCue && (reqCue.fault_blocked || []).length);
              return `
              <li>
                <span class="status review-pending">待复核</span>
                <b>${esc(r.label)}</b>${reqFault ? '<span class="badge fault-badge">故障冻结</span>' : ''}<br>
                <span class="muted">申请人 ${esc(r.requested_by)} · ${fmtTime(r.requested_at)}</span><br>
                ${reqFault ? '<span class="fault-note-text">受未解除故障影响，申请保留但故障解除前不得确认</span><br>' : ''}
                <span class="review-actions">
                  <button class="small" data-req-act="confirm" data-req="${r.id}" ${locked || reqFault ? 'disabled' : ''}>确认触发</button>
                  <button class="danger small" data-req-act="reject" data-req="${r.id}" ${locked ? 'disabled' : ''}>驳回</button>
                  <button class="ghost small" data-req-act="cancel" data-req="${r.id}" ${locked ? 'disabled' : ''}>撤销</button>
                </span>
              </li>`;
            }).join('')}
          </ul>`}
          ${resolvedReqs.length === 0 ? '' : `
          <b class="review-history-title">处置记录</b>
          <ul>
            ${resolvedReqs.map(r => `
              <li>
                <span class="status review-${r.status}">${REQUEST_STATUS_TEXT[r.status]}</span>
                <b>${esc(r.label)}</b><br>
                <span class="muted">申请人 ${esc(r.requested_by)} · ${fmtTime(r.requested_at)}<br>
                处置 ${esc(r.resolved_by || '-')} · ${fmtTime(r.resolved_at)}${r.resolve_reason ? '<br>原因：' + esc(r.resolve_reason) : ''}</span>
              </li>`).join('')}
          </ul>`}
        </div>
        <div class="panel event-log">
          <b>执行记录（最新在上）</b>
          ${events.length === 0 ? '<p class="muted">暂无记录</p>' : `
          <ul>
            ${events.map(e => `
              <li>
                <span class="status ${e.action}">${ACTION_TEXT(e.action)}</span>
                <b>${esc(e.label)}</b>
                ${e.source === 'carried'
                  ? `<span class="badge carried" title="接续时自演出 #${esc(e.carried_from_performance_id)} 承接，非现场再次触发">承接自 #${esc(e.carried_from_performance_id)}</span>`
                  : ''}
                <br>
                <span class="muted">${esc(e.operator)} · ${fmtTime(e.created_at)}${e.reason ? '<br>原因：' + esc(e.reason) : ''}</span>
              </li>`).join('')}
          </ul>`}
        </div>
      </div>
    </div>`;

  const opInput = document.getElementById('operator-input');
  if (opInput) opInput.onchange = opInput.oninput = () => localStorage.setItem('operator', opInput.value.trim());

  // 只读 / 已封场演出仍展示故障影响范围与处理记录（只读形态，无登记 / 解除表单）
  drawHandoverPanel(id, handover, handoverHistory || [], closed ? 'closed' : true);
  if (locked) {
    drawFaultPanel(id, cues, faultList, activeFaults, closed ? 'closed' : true);
    if (closed) drawClosurePanel(id, closure);
    return;
  }

  cues.forEach(c => {
    const fireBtn = document.getElementById(`fire-${c.id}`);
    const skipBtn = document.getElementById(`skip-${c.id}`);
    const retractBtn = document.getElementById(`retract-${c.id}`);
    const faultBtn = document.getElementById(`fault-${c.id}`);
    if (fireBtn) fireBtn.onclick = () => doFire(id, c.id);
    if (skipBtn) skipBtn.onclick = () => doSkip(id, c.id);
    if (retractBtn) retractBtn.onclick = () => doRetract(id, c.id);
    if (faultBtn) faultBtn.onclick = () => doRegisterFault(id, c.label);
  });

  app.querySelectorAll('[data-req-act]').forEach(btn => {
    btn.onclick = () => {
      const reqId = btn.dataset.req;
      const act = btn.dataset.reqAct;
      if (act === 'confirm') doConfirmRequest(id, reqId);
      else if (act === 'reject') doRejectRequest(id, reqId);
      else if (act === 'cancel') doCancelRequest(id, reqId);
    };
  });

  drawBatchPanel(id, cues);
  drawFaultPanel(id, cues, faultList, activeFaults, false);
  drawContinuePanel(id, targets || []);
  drawHandoverPanel(id, handover, handoverHistory || [], false);
  drawClosurePanel(id, null);

  // 恢复焦点（轮询重绘不打断操作人/成组表单输入）
  if (focusKey) {
    const sel = focusKey === 'operator'
      ? document.getElementById('operator-input')
      : document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`);
    if (sel) {
      sel.focus();
      if (caret && sel.setSelectionRange) {
        try { sel.setSelectionRange(caret.start, caret.end); } catch (_) {}
      }
    }
  }
}

/* ---------- 现场换班交接面板 ---------- */

const HANDOVER_STATUS_TEXT = { pending: '待签收', signed: '已签收', superseded: '已被重提替换' };
const HANDOVER_DIFF_SECTIONS = [
  ['event_position', '最新流水位置'],
  ['cue_results', '有效结果'],
  ['review_requests', '复核申请'],
  ['active_faults', '未解除故障'],
  ['pending_cues', '未完成提示'],
];

// 交接表单状态按演出记忆（轮询重绘不丢失正在填写的交班人 / 接班人 / 说明 / 签收人）
const handoverUiState = new Map();
function getHandoverState(perfId) {
  if (!handoverUiState.has(perfId)) {
    handoverUiState.set(perfId, { open: true, handedBy: '', receivedBy: '', note: '', signBy: '' });
  }
  return handoverUiState.get(perfId);
}

function drawHandoverPanel(perfId, handover, history, readonly) {
  const mount = document.getElementById('handover-panel-mount');
  if (!mount) return;
  const st = getHandoverState(perfId);

  const readonlyText = readonly === 'closed' ? '已封场演出' : '只读演出';
  const body = handover
    ? renderPendingHandover(perfId, handover, readonly, st)
    : readonly
      ? `<p class="muted">${readonlyText}：交接历史可回看，不能提交、重提或签收。</p>`
      : renderHandoverForm(perfId, st);

  const historyHtml = renderHandoverHistory(handover, history);

  mount.innerHTML = `
    <div class="panel handover-panel${handover ? ' has-pending' : ''}">
      <div class="row">
        <b>🔁 现场换班交接</b>
        <span class="muted">交班人填写交班人 / 接班人 / 交接说明生成待签收交接单；交接期间现场操作照常，接班人按最新状态逐项核对，无差异方可签收</span>
        <span class="grow"></span>
        ${handover ? '<span class="badge handover-badge">待签收</span>' : ''}
        <button class="ghost small" id="handover-toggle">${st.open ? '收起' : '展开'}</button>
      </div>
      ${st.open ? `<div style="margin-top:10px">${body}${historyHtml}</div>` : ''}
    </div>`;

  document.getElementById('handover-toggle').onclick = () => { st.open = !st.open; drawHandoverPanel(perfId, handover, history, readonly); };
  if (!st.open || readonly) return;

  if (handover) {
    const signBtn = document.getElementById('handover-sign');
    if (signBtn) signBtn.onclick = () => doHandoverSign(perfId);
    const resubmitBtn = document.getElementById('handover-resubmit');
    if (resubmitBtn) resubmitBtn.onclick = () => doHandoverResubmit(perfId, handover);
    const refreshBtn = document.getElementById('handover-refresh');
    if (refreshBtn) refreshBtn.onclick = () => { stopPolling(); renderPerformance(perfId); };
    const signInput = document.getElementById('handover-sign-by');
    if (signInput) signInput.oninput = () => { st.signBy = signInput.value; };
  } else {
    const hb = document.getElementById('handover-handed-by');
    const rb = document.getElementById('handover-received-by');
    const nt = document.getElementById('handover-note');
    if (hb) hb.oninput = () => { st.handedBy = hb.value; };
    if (rb) rb.oninput = () => { st.receivedBy = rb.value; };
    if (nt) nt.oninput = () => { st.note = nt.value; };
    document.getElementById('handover-submit').onclick = () => doHandoverSubmit(perfId);
  }
}

function renderHandoverForm(perfId, st) {
  const handedVal = st.handedBy || getOperator();
  return `
    <div class="handover-form">
      <div class="row">
        <label>交班人 <input id="handover-handed-by" type="text" data-focus-key="handover-${perfId}-hb"
               value="${esc(handedVal)}" placeholder="交班人姓名（必填）" style="width:130px"></label>
        <label>接班人 <input id="handover-received-by" type="text" data-focus-key="handover-${perfId}-rb"
               value="${esc(st.receivedBy)}" placeholder="接班人姓名（必填，须与交班人不同）" style="width:180px"></label>
      </div>
      <div class="row" style="margin-top:8px">
        <textarea id="handover-note" rows="2" class="grow" data-focus-key="handover-${perfId}-note"
          placeholder="交接说明：当前演出进度、注意事项（可选）">${esc(st.note)}</textarea>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="big" id="handover-submit">提交交接单（生成待签收快照）</button>
        <span class="muted">快照固定：各提示有效结果、最新流水位置、待复核申请、未解除故障、尚未完成提示及阻塞原因</span>
      </div>
    </div>`;
}

function renderPendingHandover(perfId, h, readonly, st) {
  const snap = h.snapshot || {};
  const live = h.live_diff || { matched: true, diff_count: 0, groups: {} };
  const cueResults = snap.cue_results || [];
  const done = cueResults.filter(c => c.status);
  const pendingCues = snap.pending_cues || [];
  const reqs = snap.pending_requests || [];
  const faults = snap.active_faults || [];

  const diffBanner = readonly ? '' : live.matched
    ? '<div class="ok-box handover-diff-ok">✓ 与当前最新状态逐项核对一致，接班人可以签收。</div>'
    : `<div class="error-list handover-diff-bad">
         <b>⚠ 快照后现场已变化（${live.diff_count} 项差异），暂不能签收；交接单保持待签收，请由交班人重提替换快照：</b>
         ${renderDiffTable(live.groups)}
       </div>`;

  const cueTable = `
    <details class="handover-details">
      <summary class="muted">提示有效结果（${done.length}/${cueResults.length} 已完成；流水固定到第 ${snap.latest_event_id == null ? '0' : snap.latest_event_id} 条）</summary>
      <div class="hint-table-wrap"><table class="hint-table">
        <thead><tr><th>编号</th><th>快照结果</th><th>操作人</th><th>时间</th></tr></thead>
        <tbody>
          ${cueResults.map(c => `
            <tr>
              <td><b>${esc(c.label)}</b></td>
              <td>${c.status ? `<span class="status ${c.status}">${ACTION_TEXT(c.status)}</span>` : '<span class="muted">未完成</span>'}</td>
              <td class="muted">${c.operator ? esc(c.operator) : '—'}</td>
              <td class="muted">${c.created_at ? fmtTime(c.created_at) : '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table></div>
    </details>`;

  const pendingTable = `
    <details class="handover-details" ${pendingCues.length ? 'open' : ''}>
      <summary class="muted">尚未完成的提示（${pendingCues.length} 项）及阻塞原因</summary>
      ${pendingCues.length === 0 ? '<p class="muted">无</p>' : `
      <div class="hint-table-wrap"><table class="hint-table">
        <thead><tr><th>编号</th><th>阻塞原因</th></tr></thead>
        <tbody>
          ${pendingCues.map(p => `<tr><td><b>${esc(p.label)}</b></td><td>${esc(p.reason_text)}</td></tr>`).join('')}
        </tbody>
      </table></div>`}
    </details>`;

  const reqBlock = `
    <div class="handover-subblock">
      <b>待复核申请（${reqs.length}）</b>
      ${reqs.length === 0 ? '<span class="muted"> 无</span>' : `
      <ul class="handover-mini-list">
        ${reqs.map(r => `<li><b>${esc(r.label)}</b> · ${REQUEST_STATUS_TEXT[r.status]} · 申请人 ${esc(r.requested_by)} · ${fmtTime(r.requested_at)}</li>`).join('')}
      </ul>`}
    </div>
    <div class="handover-subblock">
      <b>未解除故障（${faults.length}）</b>
      ${faults.length === 0 ? '<span class="muted"> 无</span>' : `
      <ul class="handover-mini-list">
        ${faults.map(f => `<li><b>${esc(f.label)}</b> · ${esc(f.reported_by)}：${esc(f.reason)} · 影响 ${(f.affected_labels || []).map(esc).join('、')}</li>`).join('')}
      </ul>`}
    </div>`;

  return `
    <div class="handover-pending">
      <div class="row" style="font-size:14px">
        <span class="badge handover-badge">待签收</span>
        <span>交班人 <b>${esc(h.handed_by)}</b> → 接班人 <b>${esc(h.received_by)}</b></span>
        <span class="muted">提交于 ${fmtTime(h.created_at)}</span>
        ${readonly ? `<span class="badge ${readonly === 'closed' ? 'closed' : 'readonly'}">${readonly === 'closed' ? '已封场演出' : '只读演出'}</span>` : ''}
      </div>
      ${h.note ? `<div class="handover-note">交接说明：${esc(h.note)}</div>` : ''}
      ${diffBanner}
      ${cueTable}
      ${pendingTable}
      ${reqBlock}
      ${readonly ? '' : `
      <div class="row" style="margin-top:10px">
        <label>签收人 <input id="handover-sign-by" type="text" data-focus-key="handover-${perfId}-sign"
               value="${esc(st.signBy || '')}" placeholder="接班人本人姓名" style="width:150px"></label>
        <button class="big" id="handover-sign">逐项核对无误，签收</button>
        <button class="ghost" id="handover-resubmit">交班人重提（替换快照）</button>
        <button class="ghost small" id="handover-refresh">立即核对最新状态</button>
        <span class="muted">仅接班人 ${esc(h.received_by)} 本人可签收；交班人或其他人签收均拒绝</span>
      </div>`}
    </div>`;
}

function renderDiffTable(groups) {
  const rows = [];
  for (const [key, sectionText] of HANDOVER_DIFF_SECTIONS) {
    for (const d of (groups[key] || [])) {
      rows.push(`<tr><td><span class="hint-flag flag-handover-diff">${esc(sectionText)}</span></td><td>${esc(d.message)}</td></tr>`);
    }
  }
  return `
    <div class="hint-table-wrap"><table class="hint-table handover-diff-table">
      <thead><tr><th style="width:110px">差异类型</th><th>差异内容</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table></div>`;
}

function renderHandoverHistory(current, history) {
  const past = history.filter(h => !(current && h.id === current.id));
  if (!past.length) return '';
  return `
    <details class="handover-details" style="margin-top:10px">
      <summary class="muted">交接历史（${past.length} 条，已签收不可变 / 重提替换留痕；点击展开回看快照）</summary>
      <ul class="handover-mini-list">
        ${past.map(h => {
          const snap = h.snapshot || {};
          const cueResults = snap.cue_results || [];
          const doneCount = cueResults.filter(c => c.status).length;
          const pendingCues = snap.pending_cues || [];
          const reqs = snap.pending_requests || [];
          const faults = snap.active_faults || [];
          return `
          <li>
            <div class="row">
              <span class="badge handover-${h.status}">${HANDOVER_STATUS_TEXT[h.status] || h.status}</span>
              <b>#${h.id}</b>
              ${esc(h.handed_by)} → ${esc(h.received_by)}
              <span class="muted">提交 ${fmtTime(h.created_at)}${h.signed_at ? ' · 签收 ' + fmtTime(h.signed_at) : ''}${h.superseded_at ? ' · 替换于 ' + fmtTime(h.superseded_at) : ''}</span>
            </div>
            ${h.note ? `<div class="muted">说明：${esc(h.note)}</div>` : ''}
            <details class="handover-snap-details">
              <summary class="muted">快照：已完成 ${doneCount}/${cueResults.length} · 未完成 ${pendingCues.length} · 复核申请 ${reqs.length} · 未解除故障 ${faults.length}（流水固定到第 ${snap.latest_event_id == null ? '0' : snap.latest_event_id} 条）</summary>
              ${pendingCues.length ? `
              <table class="hint-table" style="margin-top:6px">
                <thead><tr><th style="width:90px">未完成编号</th><th>快照阻塞原因</th></tr></thead>
                <tbody>${pendingCues.map(p => `<tr><td><b>${esc(p.label)}</b></td><td>${esc(p.reason_text)}</td></tr>`).join('')}</tbody>
              </table>` : '<p class="muted" style="margin:6px 0">快照时无未完成提示。</p>'}
              ${faults.length ? `<div class="muted" style="margin-top:4px">未解除故障：${faults.map(f => esc(f.label)).join('、')}</div>` : ''}
              ${reqs.length ? `<div class="muted" style="margin-top:2px">复核申请：${reqs.map(q => esc(q.label) + '（' + REQUEST_STATUS_TEXT[q.status] + '）').join('、')}</div>` : ''}
            </details>
          </li>`;
        }).join('')}
      </ul>
    </details>`;
}

async function doHandoverSubmit(perfId) {
  const st = getHandoverState(perfId);
  const handedBy = (document.getElementById('handover-handed-by').value || '').trim();
  const receivedBy = (document.getElementById('handover-received-by').value || '').trim();
  const note = (document.getElementById('handover-note').value || '').trim();
  st.handedBy = handedBy; st.receivedBy = receivedBy; st.note = note;
  if (!handedBy) return toast('请填写交班人', true);
  if (!receivedBy) return toast('请填写接班人', true);
  if (handedBy === receivedBy) return toast('交班人与接班人不能为同一人', true);
  try {
    const r = await api(`/api/performances/${perfId}/handover`, {
      method: 'POST', body: { handed_by: handedBy, received_by: receivedBy, note },
    });
    st.signBy = '';
    toast(`交接单 #${r.handover.id} 已生成，等待接班人 ${receivedBy} 签收`);
  } catch (e) { return toast(e.message, true); }
  stopPolling();
  renderPerformance(perfId);
}

async function doHandoverResubmit(perfId, handover) {
  const st = getHandoverState(perfId);
  const handedBy = window.prompt('重提交接单须为原交班人，请确认交班人姓名：', handover.handed_by);
  if (handedBy == null) return;
  if (!handedBy.trim()) return toast('交班人不能为空', true);
  const note = window.prompt('交接说明（可修改，留空则清空）：', handover.note || '') ;
  if (note == null) return;
  try {
    const r = await api(`/api/performances/${perfId}/handover`, {
      method: 'POST',
      body: { handed_by: handedBy.trim(), received_by: handover.received_by, note: note.trim() },
    });
    toast(`已由交班人重提，旧单作废、新单 #${r.handover.id} 等待签收`);
  } catch (e) { return toast(e.message, true); }
  stopPolling();
  renderPerformance(perfId);
}

async function doHandoverSign(perfId) {
  const st = getHandoverState(perfId);
  const operator = (document.getElementById('handover-sign-by').value || '').trim();
  st.signBy = operator;
  if (!operator) return toast('请填写签收人（接班人本人）', true);
  try {
    const r = await api(`/api/performances/${perfId}/handover/sign`, {
      method: 'POST', body: { operator },
    });
    st.signBy = '';
    toast(`交接单 #${r.handover.id} 已签收，交接完成`);
  } catch (e) {
    if (e.data && e.data.groups) toast(`核对未通过：${e.data.diff_count} 项差异，见交接面板`, true);
    else toast(e.message, true);
  }
  stopPolling();
  renderPerformance(perfId);
}

/* ---------- 现场成组处置面板 ---------- */

// 成组面板状态按演出记忆：清单编辑内容与最近一次逐项预览（轮询重绘不丢失操作现场）
const batchUiState = new Map();
function getBatchState(perfId) {
  if (!batchUiState.has(perfId)) {
    batchUiState.set(perfId, { open: true, rows: [emptyBatchRow()], preview: null });
  }
  return batchUiState.get(perfId);
}
function emptyBatchRow() {
  return { label: '', action: 'fire', reason: '' };
}
const BATCH_ACTION_TEXTS = { fire: '触发', skip: '跳过', retract: '撤回' };

function collectBatchRows(st) {
  st.rows = st.rows.map(r => ({
    label: r.label.trim(),
    action: BATCH_ACTION_TEXTS[r.action] ? r.action : 'fire',
    reason: r.reason.trim(),
  }));
  return st.rows;
}

function drawBatchPanel(perfId, cues) {
  const mount = document.getElementById('batch-panel-mount');
  if (!mount) return;
  const st = getBatchState(perfId);
  if (!st.open) {
    mount.innerHTML = `
      <div class="panel batch-panel collapsed">
        <div class="row">
          <b>📋 成组连续处置</b>
          <span class="muted">按顺序逐项触发 / 跳过 / 撤回，先预览判定再整组提交（需双人复核的提示请走单项申请）</span>
          <span class="grow"></span>
          <button class="ghost small" id="batch-toggle">展开</button>
        </div>
      </div>`;
    document.getElementById('batch-toggle').onclick = () => { st.open = true; drawBatchPanel(perfId, cues); };
    return;
  }

  const labels = cues.map(c => c.label);
  mount.innerHTML = `
    <div class="panel batch-panel">
      <div class="row">
        <b>📋 成组连续处置</b>
        <span class="muted">按清单顺序逐项判定：前置、下游撤回保护、待复核限制均以前面步骤的有效结果为准；整组全部通过才依次落流水</span>
        <span class="grow"></span>
        <button class="ghost small" id="batch-toggle">收起</button>
      </div>
      <div class="batch-table-wrap">
        <table class="batch-table">
          <thead><tr><th style="width:42px">#</th><th style="width:130px">编号</th><th style="width:96px">动作</th><th>跳过 / 撤回原因（触发无需填写）</th><th style="width:42px"></th></tr></thead>
          <tbody>
            ${st.rows.map((r, i) => `
              <tr>
                <td class="muted">${i + 1}</td>
                <td><input class="batch-label" type="text" list="cue-labels-${perfId}" data-focus-key="batch-${perfId}-label-${i}" value="${esc(r.label)}" placeholder="如 L2"></td>
                <td>
                  <select class="batch-action" data-focus-key="batch-${perfId}-action-${i}">
                    <option value="fire" ${r.action === 'fire' ? 'selected' : ''}>触发</option>
                    <option value="skip" ${r.action === 'skip' ? 'selected' : ''}>跳过</option>
                    <option value="retract" ${r.action === 'retract' ? 'selected' : ''}>撤回</option>
                  </select>
                </td>
                <td><input class="batch-reason" type="text" data-focus-key="batch-${perfId}-reason-${i}" value="${esc(r.reason)}" placeholder="${r.action === 'skip' ? '跳过原因（必填）' : r.action === 'retract' ? '撤回原因（必填）' : '触发无需原因'}" ${r.action === 'fire' ? 'disabled' : ''}></td>
                <td><button class="ghost danger small batch-del" data-i="${i}" ${st.rows.length === 1 ? 'disabled' : ''}>删</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
        <datalist id="cue-labels-${perfId}">
          ${labels.map(l => `<option value="${esc(l)}"></option>`).join('')}
        </datalist>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="ghost small" id="batch-add">＋ 添加一项</button>
        <span class="grow"></span>
        <button class="ghost" id="batch-preview">逐项预览</button>
        <button class="big" id="batch-submit">整组提交</button>
      </div>
      <div id="batch-result"></div>
    </div>`;

  const bindRowInputs = () => {
    mount.querySelectorAll('tbody tr').forEach((tr, i) => {
      const labelEl = tr.querySelector('.batch-label');
      const actionSel = tr.querySelector('.batch-action');
      const reasonEl = tr.querySelector('.batch-reason');
      labelEl.oninput = () => { st.rows[i].label = labelEl.value; st.preview = null; };
      actionSel.onchange = () => {
        st.rows[i].action = actionSel.value;
        if (actionSel.value === 'fire') st.rows[i].reason = '';
        st.preview = null;
        drawBatchPanel(perfId, cues);
      };
      reasonEl.oninput = () => { st.rows[i].reason = reasonEl.value; st.preview = null; };
      tr.querySelector('.batch-del').onclick = () => {
        st.rows.splice(i, 1);
        st.preview = null;
        drawBatchPanel(perfId, cues);
      };
    });
  };
  bindRowInputs();

  document.getElementById('batch-toggle').onclick = () => { st.open = false; drawBatchPanel(perfId, cues); };
  document.getElementById('batch-add').onclick = () => {
    st.rows.push(emptyBatchRow());
    st.preview = null;
    drawBatchPanel(perfId, cues);
  };
  document.getElementById('batch-preview').onclick = () => doBatchPreview(perfId, cues);
  document.getElementById('batch-submit').onclick = () => doBatchSubmit(perfId, cues);
  renderBatchResult(perfId);
}

function renderBatchResult(perfId) {
  const box = document.getElementById('batch-result');
  if (!box) return;
  const st = getBatchState(perfId);
  const pv = st.preview;
  if (!pv) {
    box.innerHTML = '<p class="muted" style="margin:8px 0 0">按现场顺序填写编号与动作后「逐项预览」：每一步会基于前面步骤的有效结果判定前置、下游与待复核限制。</p>';
    return;
  }
  const rowsHtml = pv.results.map(r => `
    <tr class="${r.ok ? 'batch-ok' : 'batch-fail'}">
      <td>${r.index}</td>
      <td><b>${esc(r.label)}</b></td>
      <td>${BATCH_ACTION_TEXTS[r.action] || r.action}${r.ok && r.planned ? ' <span class="hint-flag flag-carried">拟执行</span>' : ''}</td>
      <td>${r.ok
        ? `<span class="status fired">✓ 通过</span>${r.reason ? '<div class="muted">' + esc(r.reason) + '</div>' : ''}`
        : `<span class="status blocked">✗ ${esc(r.error)}</span>`}</td>
    </tr>`).join('');
  const head = pv.can_submit
    ? `<div class="ok-box">✓ 逐项预览全部通过（${pv.success_count} 项）：提交时按最新状态重新逐项判定，全部通过才依次写入与单项一致的流水。</div>`
    : `<div class="error-list"><b>预览发现 ${pv.failure_count} 项不能执行（${pv.success_count} 项可执行）：</b>请按失败项调整清单后再提交；正式提交时任一项失败，整组均不产生流水。</div>`;
  box.innerHTML = `
    ${head}
    <div class="hint-table-wrap">
      <table class="hint-table batch-preview-table">
        <thead><tr><th style="width:42px">序号</th><th style="width:110px">编号</th><th style="width:150px">动作</th><th>判定结果 / 失败原因</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}

async function doBatchPreview(perfId) {
  const st = getBatchState(perfId);
  const operator = getOperator();
  if (!operator) { toast('请先填写本组操作人（顶部操作人输入框）', true); return document.getElementById('operator-input').focus(); }
  collectBatchRows(st);
  if (!st.rows.length) return toast('成组清单为空', true);
  try {
    st.preview = await api(`/api/performances/${perfId}/batch/preview`, {
      method: 'POST',
      body: { operator, items: st.rows.map(r => ({ label: r.label, action: r.action, reason: r.reason })) },
    });
    renderBatchResult(perfId);
  } catch (e) {
    st.preview = null;
    toast(e.message, true);
    renderBatchResult(perfId);
  }
}

async function doBatchSubmit(perfId, cues) {
  const st = getBatchState(perfId);
  const operator = getOperator();
  if (!operator) { toast('请先填写本组操作人（顶部操作人输入框）', true); return document.getElementById('operator-input').focus(); }
  collectBatchRows(st);
  if (!st.rows.length) return toast('成组清单为空', true);

  // 提交前先按当前编辑做一次逐项预览（服务端事务内仍会按最新状态再判定一次）
  let pv;
  try {
    pv = await api(`/api/performances/${perfId}/batch/preview`, {
      method: 'POST',
      body: { operator, items: st.rows.map(r => ({ label: r.label, action: r.action, reason: r.reason })) },
    });
    st.preview = pv;
    renderBatchResult(perfId);
  } catch (e) {
    st.preview = null;
    renderBatchResult(perfId);
    return toast(e.message, true);
  }
  if (!pv.can_submit) {
    return toast('逐项预览存在失败项，请调整后再提交', true);
  }
  if (!window.confirm(`成组 ${pv.success_count} 项预览均通过。确认按顺序整组提交？\n（提交瞬间按最新状态重新判定，任一项失败则整组不产生流水）`)) return;

  try {
    const r = await api(`/api/performances/${perfId}/batch`, {
      method: 'POST',
      body: { operator, items: st.rows.map(row2 => ({ label: row2.label, action: row2.action, reason: row2.reason })) },
    });
    st.rows = [emptyBatchRow()];
    st.preview = null;
    toast(`成组提交成功：已依次写入 ${r.success_count} 条执行流水`);
  } catch (e) {
    // 服务端事务内重新判定发现失败：整组未生效、无流水；用返回的逐项结果替换预览
    if (e.data && Array.isArray(e.data.results)) {
      st.preview = {
        results: e.data.results,
        success_count: e.data.success_count,
        failure_count: e.data.failure_count,
        can_submit: false,
      };
      renderBatchResult(perfId);
    }
    toast(e.message, true);
  }
  // 成功或失败都重新拉取执行台最新状态（成功后提示卡片/流水更新）
  stopPolling();
  renderPerformance(perfId);
}

/* ---------- 现场设备故障：登记 / 解除面板 ---------- */

// 故障登记表单状态按演出记忆（轮询重绘不丢失正在填写的内容）
const faultUiState = new Map();
function getFaultState(perfId) {
  if (!faultUiState.has(perfId)) {
    faultUiState.set(perfId, { open: true, label: '' });
  }
  return faultUiState.get(perfId);
}

function drawFaultPanel(perfId, cues, faultList, activeFaults, readonly) {
  const mount = document.getElementById('fault-panel-mount');
  if (!mount) return;
  const st = getFaultState(perfId);
  const labels = cues.map(c => c.label);
  const cueByLabel = new Map(cues.map(c => [c.label, c]));

  const activeHtml = activeFaults.length === 0
    ? '<p class="muted" style="margin:6px 0 0">当前无未解除故障。</p>'
    : `<ul class="fault-active-list">
        ${activeFaults.map(f => `
          <li>
            <span class="badge fault-badge">⚠ 未解除</span>
            <b>${esc(f.label)}</b>
            <span class="muted">${fmtTime(f.reported_at)} · 登记人 ${esc(f.reported_by)}：${esc(f.reason)}</span>
            <div class="fault-affected">影响范围（沿前置关系，共 ${f.affected_labels.length} 项）：
              ${f.affected_labels.map(l => `<span class="hint-flag flag-fault${l === f.label ? ' flag-fault-self' : ''}">${esc(l)}${l === f.label ? '（故障源）' : ''}</span>`).join('')}
            </div>
            <button class="danger small fault-resolve" data-fault="${f.id}" ${readonly ? 'disabled' : ''}>解除故障（记录操作人与原因）</button>
          </li>`).join('')}
      </ul>`;

  const history = faultList.filter(f => f.status === 'resolved');
  const historyHtml = history.length === 0 ? '' : `
    <details class="fault-history">
      <summary class="muted">处理记录（已解除 ${history.length} 条）</summary>
      <ul>
        ${history.map(f => `
          <li>
            <span class="badge fault-resolved-badge">已解除</span>
            <b>${esc(f.label)}</b><br>
            <span class="muted">
              登记 ${fmtTime(f.reported_at)} · ${esc(f.reported_by)}：${esc(f.reason)}<br>
              解除 ${fmtTime(f.resolved_at)} · ${esc(f.resolved_by || '-')}：${esc(f.resolve_reason || '')}
            </span>
          </li>`).join('')}
      </ul>
    </details>`;

  mount.innerHTML = `
    <div class="panel fault-panel${activeFaults.length ? '' : ' collapsed'}">
      <div class="row">
        <b>⚠ 现场设备故障</b>
        <span class="muted">按提示编号登记：冻结故障提示及所有依赖它的后续提示的触发；跳过 / 撤回规则不变；不改动既有执行流水</span>
        <span class="grow"></span>
        <span class="muted">未解除 ${activeFaults.length}</span>
        <button class="ghost small" id="fault-toggle">${st.open ? '收起' : '展开'}</button>
      </div>
      ${st.open ? `
      ${readonly ? `<p class="muted">${readonly === 'closed' ? '已封场演出' : '只读演出'}：故障处理记录可查，不能登记或解除。</p>` : `
      <div class="row" style="margin-top:10px">
        <label>故障编号
          <input id="fault-label" type="text" list="fault-labels-${perfId}" data-focus-key="fault-${perfId}-label"
                 value="${esc(st.label)}" placeholder="如 S1" style="width:120px">
        </label>
        <datalist id="fault-labels-${perfId}">
          ${labels.map(l => `<option value="${esc(l)}"></option>`).join('')}
        </datalist>
        <input id="fault-reason" type="text" class="grow" data-focus-key="fault-${perfId}-reason"
               placeholder="故障原因（必填，如：功放烧毁无输出）">
        <button class="danger" id="fault-register">登记故障</button>
      </div>`}
      <div class="fault-active-wrap" style="margin-top:10px">${activeHtml}</div>
      ${historyHtml}` : ''}
    </div>`;

  document.getElementById('fault-toggle').onclick = () => { st.open = !st.open; drawFaultPanel(perfId, cues, faultList, activeFaults); };
  if (readonly || !st.open) return;

  const labelEl = document.getElementById('fault-label');
  const reasonEl = document.getElementById('fault-reason');
  if (labelEl) {
    labelEl.oninput = () => { st.label = labelEl.value; };
  }
  document.getElementById('fault-register').onclick = () => {
    const label = (labelEl.value || '').trim();
    const reason = (reasonEl.value || '').trim();
    doRegisterFaultSubmit(perfId, label, reason, cueByLabel);
  };
  mount.querySelectorAll('.fault-resolve').forEach(btn => {
    btn.onclick = () => doResolveFault(perfId, Number(btn.dataset.fault));
  });
}

async function doRegisterFaultSubmit(perfId, label, rawReason, cueByLabel) {
  const operator = getOperator();
  if (!operator) { toast('请先填写操作人（顶部操作人输入框）', true); return document.getElementById('operator-input').focus(); }
  if (!label) return toast('请填写故障提示编号', true);
  if (!rawReason) return toast('登记故障必须填写原因', true);
  const cue = cueByLabel.get(label);
  if (!cue) return toast(`编号「${label}」不属于当前演出的执行单`, true);
  try {
    const r = await api(`/api/performances/${perfId}/cues/${cue.id}/faults`, {
      method: 'POST', body: { operator, reason: rawReason },
    });
    getFaultState(perfId).label = '';
    toast(`已登记「${r.fault.label}」故障，冻结 ${r.fault.affected_labels.length} 个提示的触发`);
  } catch (e) { toast(e.message, true); }
  stopPolling();
  renderPerformance(perfId);
}

async function doRegisterFault(perfId, label) {
  const operator = getOperator();
  if (!operator) { toast('请先填写操作人（顶部操作人输入框）', true); return document.getElementById('operator-input').focus(); }
  const reason = window.prompt(`登记提示「${label}」的现场设备故障，请填写故障原因（必填）：`);
  if (reason == null) return;
  if (!reason.trim()) return toast('登记故障必须填写原因', true);
  const st = (await api(`/api/performances/${perfId}`).catch(() => null));
  if (!st) return;
  const cue = st.cues.find(c => c.label === label);
  if (!cue) return toast(`编号「${label}」不属于当前演出的执行单`, true);
  try {
    const r = await api(`/api/performances/${perfId}/cues/${cue.id}/faults`, {
      method: 'POST', body: { operator, reason: reason.trim() },
    });
    toast(`已登记「${r.fault.label}」故障，冻结 ${r.fault.affected_labels.length} 个提示的触发`);
  } catch (e) { toast(e.message, true); }
  stopPolling();
  renderPerformance(perfId);
}

async function doResolveFault(perfId, faultId) {
  const operator = getOperator();
  if (!operator) { toast('请先填写操作人（顶部操作人输入框）', true); return document.getElementById('operator-input').focus(); }
  const reason = window.prompt('解除故障，请填写处理情况 / 原因（必填）：');
  if (reason == null) return;
  if (!reason.trim()) return toast('解除故障必须填写原因', true);
  try {
    await api(`/api/performances/${perfId}/faults/${faultId}/resolve`, {
      method: 'POST', body: { operator, reason: reason.trim() },
    });
    toast('故障已解除，提示状态已按当前有效结果重算');
  } catch (e) { toast(e.message, true); }
  stopPolling();
  renderPerformance(perfId);
}

/* ---------- 接续关系横幅与接续面板 ---------- */

function renderContinuationBanner(perf, continuation, carriedCount) {
  if (!continuation) return '';
  const parts = [];
  if (continuation.from) {
    const f = continuation.from;
    parts.push(`<span class="chain-chip from">↩ 承接自 <a href="#/performances/${f.performance_id}">演出 #${f.performance_id}（v${f.version_number}${f.name ? ' · ' + esc(f.name) : ''}）</a>${carriedCount ? `，已继承 ${carriedCount} 条有效结果` : ''}</span>`);
  }
  if (continuation.to) {
    const t = continuation.to;
    parts.push(`<span class="chain-chip to">↪ 已接续到 <a href="#/performances/${t.performance_id}">演出 #${t.performance_id}（v${t.version_number}${t.name ? ' · ' + esc(t.name) : ''}）</a>（${fmtTime(perf.continued_at)}，${esc(perf.continued_by || '-')}）</span>`);
  }
  return parts.length ? `<div class="continuation-banner">${parts.join('')}</div>` : '';
}

function drawContinuePanel(perfId, targets) {
  const mount = document.getElementById('continue-panel-mount');
  if (!mount) return;
  const st = getContinueState(perfId);

  if (!targets.length) {
    mount.innerHTML = `
      <div class="panel continue-panel disabled">
        <div class="row">
          <b>改用修订执行单（接续演出）</b>
          <span class="muted">暂无同场次更高且已发布的版本；请先在排演端新建草稿、发布新版本后再接续。</span>
        </div>
      </div>`;
    return;
  }

  mount.innerHTML = `
    <div class="panel continue-panel">
      <div class="row">
        <b>改用修订执行单（接续演出）</b>
        <span class="muted">原演出保留原快照并转为只读；有效结果由新版继承并标注承接，不会再次触发</span>
        <span class="grow"></span>
        <button class="ghost small" id="continue-toggle">${st.formOpen ? '收起' : '发起接续'}</button>
      </div>
      ${st.formOpen ? `
      <div class="continue-form">
        <div class="row" style="margin-top:10px">
          <label>目标版本
            <select id="continue-version">
              ${targets.map(v => `<option value="${v.id}" ${(st.versionId || v.id) === v.id ? 'selected' : ''}>v${v.version_number}${v.note ? '（' + esc(v.note) + '）' : ''}</option>`).join('')}
            </select>
          </label>
          <input id="continue-name" type="text" placeholder="接续演出名称（可选，默认追加「接续」）" class="grow" value="${esc(st.name)}">
          <input id="continue-operator" type="text" placeholder="操作人（必填）" value="${esc(st.operator || getOperator())}">
          <button class="ghost" id="continue-preview">按编号核对</button>
          <button id="continue-run">生成接续演出</button>
        </div>
        <div id="continue-result"></div>
      </div>` : ''}
    </div>`;

  document.getElementById('continue-toggle').onclick = () => {
    st.formOpen = !st.formOpen;
    drawContinuePanel(perfId, targets);
  };

  if (!st.formOpen) return;
  // 轮询重绘时保留表单输入；切换目标版本后旧核对结果作废，需重新核对
  const verSel = document.getElementById('continue-version');
  if (!st.versionId) st.versionId = Number(verSel.value);
  verSel.onchange = () => {
    st.versionId = Number(verSel.value);
    st.preview = null;
    renderContinueResult(perfId);
  };
  const nameInput = document.getElementById('continue-name');
  const opInput2 = document.getElementById('continue-operator');
  nameInput.oninput = () => { st.name = nameInput.value; };
  opInput2.oninput = () => { st.operator = opInput2.value; };
  document.getElementById('continue-preview').onclick = () => doContinuePreview(perfId);
  document.getElementById('continue-run').onclick = () => doContinueRun(perfId);
  renderContinueResult(perfId);
}

function HINT_TEXT(f) {
  return ({ fired: '触发', skipped: '跳过', retracted: '撤回', review: '复核申请', carried: '承接' })[f] || f;
}

function renderContinueResult(perfId) {
  const box = document.getElementById('continue-result');
  if (!box) return;
  const st = getContinueState(perfId);
  const pv = st.preview;
  if (!pv) {
    box.innerHTML = '<p class="muted" style="margin:8px 0 0">先「按编号核对」查看原演出及其接续来源中的触发 / 跳过 / 撤回流水、复核申请与承接结果。</p>';
    return;
  }

  const hintsHtml = pv.hints.length === 0 ? '<p class="muted">无任何已执行痕迹。</p>' : `
    <details open>
      <summary class="muted">按编号核对（${pv.hints.length} 个编号有痕迹）</summary>
      <div class="hint-table-wrap">
        <table class="hint-table">
          <thead><tr><th>编号</th><th>痕迹</th><th>记录数</th></tr></thead>
          <tbody>
            ${pv.hints.map(h => `
              <tr>
                <td><b>${esc(h.label)}</b></td>
                <td>${h.flags.map(f => `<span class="hint-flag flag-${f}">${esc(HINT_TEXT(f))}</span>`).join('')}</td>
                <td class="muted">${h.records.length}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </details>`;

  const carriedHtml = pv.carried.length
    ? `<p class="muted" style="margin:6px 0">将继承 ${pv.carried.length} 条有效结果：${pv.carried.map(c => `<span class="hint-flag flag-${c.action}">${esc(c.label)} ${ACTION_TEXT(c.action)}</span>`).join(' ')}</p>`
    : '<p class="muted" style="margin:6px 0">当前无有效结果需要继承（撤回与未执行的提示不承接，按新版依赖重新计算状态）。</p>';

  if (pv.can_continue) {
    box.innerHTML = `<div class="ok-box">✓ 核对通过：编号、类型、描述、前置集合、复核标记均保留，无待处理申请，可以接续。</div>${carriedHtml}${hintsHtml}`;
  } else {
    box.innerHTML = `
      <div class="error-list"><b>存在 ${pv.conflicts.length} 个冲突编号，原演出保持可操作、不会产生接续：</b>
        <ul>${pv.conflicts.map(c => `<li><b>${esc(c.label)}</b>：${c.reasons.map(esc).join('；')}</li>`).join('')}</ul>
      </div>${carriedHtml}${hintsHtml}`;
  }
}

async function loadContinuePreview(perfId) {
  const st = getContinueState(perfId);
  const versionId = st.versionId || Number(document.getElementById('continue-version').value);
  st.versionId = versionId;
  return api(`/api/performances/${perfId}/continue/preview`, {
    method: 'POST', body: { version_id: versionId },
  });
}

async function doContinuePreview(perfId) {
  try {
    getContinueState(perfId).preview = await loadContinuePreview(perfId);
    renderContinueResult(perfId);
  } catch (e) { toast(e.message, true); }
}

async function doContinueRun(perfId) {
  const st = getContinueState(perfId);
  const operator = (document.getElementById('continue-operator').value || '').trim();
  st.operator = operator;
  if (!operator) return toast('请填写操作人', true);
  const versionId = st.versionId || Number(document.getElementById('continue-version').value);
  const name = (document.getElementById('continue-name').value || '').trim();
  st.name = name;

  // 执行前再次核对，服务端事务内还会串行复核一次
  try {
    const pv = await loadContinuePreview(perfId);
    getContinueState(perfId).preview = pv;
    if (!pv.can_continue) {
      renderContinueResult(perfId);
      return toast('核对未通过，请先处理冲突编号', true);
    }
  } catch (e) { return toast(e.message, true); }

  if (!window.confirm('确认生成接续演出？原演出将立即转为只读（保留原快照）。')) return;
  try {
    const r = await api(`/api/performances/${perfId}/continue`, {
      method: 'POST', body: { version_id: versionId, name, operator },
    });
    continueUiState.delete(r.performance.id);
    toast(`已生成接续演出 #${r.performance.id}，继承 ${r.carried_count} 条有效结果`);
    location.hash = `#/performances/${r.performance.id}`;
  } catch (e) {
    // 事务内串行判定发现冲突：刷新核对结果，原演出未改变
    if (e.data && e.data.conflicts) {
      try { getContinueState(perfId).preview = await loadContinuePreview(perfId); renderContinueResult(perfId); } catch (_) {}
    }
    toast(e.message, true);
  }
}

function ACTION_TEXT(a) {
  return a === 'fired' ? '已触发' : a === 'skipped' ? '已跳过' : '已撤回';
}

/* ---------- 演出封场结项面板（封场前核对 + 封场；已封场展示不可变报告） ---------- */

const closureUiState = new Map();
function getClosureState(perfId) {
  if (!closureUiState.has(perfId)) {
    closureUiState.set(perfId, { open: false, closedBy: '', note: '', preflight: null });
  }
  return closureUiState.get(perfId);
}

function renderClosureBanner(closure) {
  return `
    <div class="continuation-banner">
      <span class="chain-chip closure-chain">🏁 已封场结项 · ${fmtTime(closure.closed_at)} · 结项人 ${esc(closure.closed_by || '-')}${closure.note ? ' · ' + esc(closure.note) : ''}</span>
    </div>`;
}

function drawClosurePanel(perfId, closure) {
  const mount = document.getElementById('closure-panel-mount');
  if (!mount) return;
  if (closure) {
    mount.innerHTML = renderClosureReport(closure);
    return;
  }
  const st = getClosureState(perfId);
  const byVal = st.closedBy || getOperator();
  mount.innerHTML = `
    <div class="panel closure-panel">
      <div class="row">
        <b>🏁 封场结项</b>
        <span class="muted">封场前按当前演出版本核对每条提示：均须有有效已触发 / 已跳过结果；待复核申请、未解除故障、待签收交接单均须处理完。通过后一次性固定不可变封场报告</span>
        <span class="grow"></span>
        <button class="ghost small" id="closure-toggle">${st.open ? '收起' : '展开封场'}</button>
      </div>
      ${st.open ? `
      <div style="margin-top:10px">
        <div id="closure-preflight"></div>
        <div class="row" style="margin-top:10px">
          <label>结项人 <input id="closure-by" type="text" data-focus-key="closure-${perfId}-by"
                 value="${esc(byVal)}" placeholder="结项人姓名（必填）" style="width:150px"></label>
        </div>
        <div class="row" style="margin-top:8px">
          <textarea id="closure-note" rows="2" class="grow" data-focus-key="closure-${perfId}-note"
            placeholder="封场说明（必填，如：全剧终，设备清点正常撤场）">${esc(st.note)}</textarea>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="ghost" id="closure-check">重新核对</button>
          <button class="big closure-run" id="closure-run" disabled>核对通过，执行封场</button>
          <span class="muted">封场与现场写操作串行：有阻项时演出保持可操作、不生成报告；已接续的只读演出不能封场，封场后不可重复封场</span>
        </div>
      </div>` : ''}
    </div>`;
  document.getElementById('closure-toggle').onclick = () => {
    st.open = !st.open;
    if (st.open) loadClosurePreflight(perfId);
    else refreshClosureMount(perfId, null);
  };
  if (!st.open) return;
  const byEl = document.getElementById('closure-by');
  const noteEl = document.getElementById('closure-note');
  byEl.oninput = () => { st.closedBy = byEl.value; };
  noteEl.oninput = () => { st.note = noteEl.value; };
  document.getElementById('closure-check').onclick = () => loadClosurePreflight(perfId);
  document.getElementById('closure-run').onclick = () => doClose(perfId);
  renderClosurePreflight(perfId);
}

function refreshClosureMount(perfId, closure) {
  // 轻量重绘封场面板（不打断其他面板输入）
  drawClosurePanel(perfId, closure);
}

async function loadClosurePreflight(perfId) {
  const st = getClosureState(perfId);
  const box = document.getElementById('closure-preflight');
  if (box) box.innerHTML = '<p class="muted">核对中…</p>';
  try {
    st.preflight = await api(`/api/performances/${perfId}/close/preview`, { method: 'POST', body: {} });
    renderClosurePreflight(perfId);
  } catch (e) {
    st.preflight = null;
    if (box) box.innerHTML = `<div class="error-list">${esc(e.message)}</div>`;
  }
}

function renderClosurePreflight(perfId) {
  const st = getClosureState(perfId);
  const box = document.getElementById('closure-preflight');
  if (!box) return;
  const pv = st.preflight;
  if (!pv) {
    box.innerHTML = '<p class="muted">点「重新核对」按当前演出版本检查封场条件。</p>';
    return;
  }
  const c = pv.counts || {};
  const groups = [];
  if (pv.incomplete_cues.length) {
    groups.push(`
      <div class="closure-block">
        <b>未完成提示（${pv.incomplete_cues.length}，按编号）：</b>
        <div>${pv.incomplete_cues.map(x => `<span class="hint-flag flag-blocker">${esc(x.label)}</span>`).join(' ')}</div>
      </div>`);
  }
  if (pv.review_requests.length) {
    groups.push(`
      <div class="closure-block">
        <b>${CLOSURE_REASON_TEXT.review}（${pv.review_requests.length}）：</b>
        <div>${pv.review_requests.map(x => `<span class="hint-flag flag-blocker">${esc(x.label)}（${esc(x.requested_by)}）</span>`).join(' ')}</div>
      </div>`);
  }
  if (pv.active_faults.length) {
    groups.push(`
      <div class="closure-block">
        <b>${CLOSURE_REASON_TEXT.fault}（${pv.active_faults.length}）：</b>
        <div>${pv.active_faults.map(x => `<span class="hint-flag flag-blocker">${esc(x.label)}（${esc(x.reported_by)}：${esc(x.reason)}）</span>`).join(' ')}</div>
      </div>`);
  }
  if (pv.pending_handovers.length) {
    groups.push(`
      <div class="closure-block">
        <b>${CLOSURE_REASON_TEXT.handover}（${pv.pending_handovers.length}）：</b>
        <div>${pv.pending_handovers.map(x => `<span class="hint-flag flag-blocker">#${x.handover_id} ${esc(x.handed_by)} → ${esc(x.received_by)}</span>`).join(' ')}</div>
      </div>`);
  }

  const head = pv.can_close
    ? `<div class="ok-box">✓ 核对通过：共 ${c.total} 条提示全部有有效结果（已触发 ${c.fired}、已跳过 ${c.skipped}），无待复核申请、未解除故障与待签收交接单，可以封场。</div>`
    : `<div class="error-list"><b>封场核对未通过（${c.completed || 0}/${c.total || 0} 已完成），演出保持可操作、不会生成报告：</b>${groups.join('')}</div>`;
  box.innerHTML = head;
  const runBtn = document.getElementById('closure-run');
  if (runBtn) runBtn.disabled = !pv.can_close;
}

async function doClose(perfId) {
  const st = getClosureState(perfId);
  const closedBy = (document.getElementById('closure-by').value || '').trim();
  const note = (document.getElementById('closure-note').value || '').trim();
  st.closedBy = closedBy; st.note = note;
  if (!closedBy) return toast('请填写结项人', true);
  if (!note) return toast('请填写封场说明', true);
  if (!st.preflight || !st.preflight.can_close) {
    await loadClosurePreflight(perfId);
    return toast('封场核对未通过，请先处理阻项', true);
  }
  if (!window.confirm('确认封场结项？\n封场将一次性固定结项时间、结项人、最终提示结果及原操作人 / 时间 / 流水 / 来源演出；封场后该演出一切现场写操作均拒绝，且不可重复封场。')) return;
  try {
    const r = await api(`/api/performances/${perfId}/close`, { method: 'POST', body: { closed_by: closedBy, note } });
    toast(`已封场结项（${r.closure.closed_at}）`);
  } catch (e) {
    // 事务内串行判定发现阻项（排队期间现场变化）：刷新核对结果，演出保持可操作
    if (e.data && (e.data.incomplete_cues || e.data.review_requests || e.data.active_faults || e.data.pending_handovers)) {
      st.preflight = e.data;
      renderClosurePreflight(perfId);
    }
    return toast(e.message, true);
  }
  stopPolling();
  renderPerformance(perfId);
}

function renderClosureReport(closure) {
  const r = closure.report || {};
  const s = r.summary || {};
  const rows = (r.cue_results || []).map(c => `
    <tr>
      <td>${c.seq}</td>
      <td><b>${esc(c.label)}</b>${c.carried ? '<span class="badge carried">承接</span>' : ''}</td>
      <td><span class="status ${c.result}">${ACTION_TEXT(c.result)}</span></td>
      <td class="muted">${esc(c.operator)}</td>
      <td class="muted">${fmtTime(c.created_at)}</td>
      <td class="muted">
        ${c.carried
          ? `承接自演出 #${esc(c.carried_from_performance_id)}；原流水：#${c.origin.performance_id} 第 ${c.origin.event_id} 条（${ACTION_TEXT(c.origin.action)}，${esc(c.origin.operator)}，${fmtTime(c.origin.created_at)}）`
          : '本场现场操作'}
      </td>
    </tr>`).join('');

  const reviewBlock = (r.review_requests || []).length
    ? `<details class="handover-details"><summary class="muted">复核申请留痕（${r.review_requests.length}）</summary>
        <div class="hint-table-wrap"><table class="hint-table">
          <thead><tr><th>编号</th><th>状态</th><th>申请人/时间</th><th>处置</th></tr></thead>
          <tbody>${r.review_requests.map(q => `
            <tr>
              <td><b>${esc(q.label)}</b></td>
              <td>${REQUEST_STATUS_TEXT[q.status] || q.status}</td>
              <td class="muted">${esc(q.requested_by)} · ${fmtTime(q.requested_at)}</td>
              <td class="muted">${q.resolved_by ? esc(q.resolved_by) + ' · ' + fmtTime(q.resolved_at) + (q.resolve_reason ? ' · ' + esc(q.resolve_reason) : '') : '—'}</td>
            </tr>`).join('')}</tbody>
        </table></div></details>`
    : '';

  const faultBlock = (r.faults || []).length
    ? `<details class="handover-details"><summary class="muted">设备故障留痕（${r.faults.length}，封场时均已解除）</summary>
        <ul class="handover-mini-list">
          ${r.faults.map(f => `<li><b>${esc(f.label)}</b>：登记 ${esc(f.reported_by)} · ${fmtTime(f.reported_at)}：${esc(f.reason)}；解除 ${esc(f.resolved_by || '-')} · ${fmtTime(f.resolved_at)}：${esc(f.resolve_reason || '')}</li>`).join('')}
        </ul></details>`
    : '';

  const handoverBlock = (r.handovers || []).length
    ? `<details class="handover-details"><summary class="muted">交接单留痕（${r.handovers.length}，已签收 ${s.signed_handover_count || 0}）</summary>
        <ul class="handover-mini-list">
          ${r.handovers.map(h => `<li>#${h.id} <b>${esc(h.handed_by)} → ${esc(h.received_by)}</b> · ${HANDOVER_STATUS_TEXT[h.status] || h.status} · ${fmtTime(h.created_at)}${h.signed_at ? ' · 签收 ' + fmtTime(h.signed_at) : ''}</li>`).join('')}
        </ul></details>`
    : '';

  const chain = (r.continuation_chain || []).map((p, i) =>
    `${i ? ' ← ' : ''}演出 #${p.performance_id}（v${p.version_number}${p.name ? ' · ' + esc(p.name) : ''}）`
  ).join('');

  return `
    <div class="panel closure-report">
      <div class="row">
        <b>🏁 封场结项报告（不可变）</b>
        <span class="badge closure-badge">已封场</span>
        <span class="grow"></span>
        <span class="muted">结项时间 ${fmtTime(closure.closed_at)} · 结项人 ${esc(closure.closed_by || '-')}</span>
      </div>
      ${closure.note ? `<div class="handover-note">封场说明：${esc(closure.note)}</div>` : ''}
      <div class="row muted" style="font-size:13px;margin-top:6px">
        <span>${esc(r.show ? r.show.name : '')} · ${esc((r.performance || {}).name || '')}</span>
        <span>执行单 v${r.version ? r.version.version_number : '?'}</span>
        <span>开始 ${fmtTime(r.performance ? r.performance.started_at : null)}（${esc(r.performance ? r.performance.started_by : '-')}）</span>
        ${chain ? `<span>接续链：${chain}</span>` : ''}
      </div>
      <div class="closure-summary">
        <span class="hint-flag flag-fired">已触发 ${s.fired_count || 0}</span>
        <span class="hint-flag flag-skipped">已跳过 ${s.skipped_count || 0}</span>
        <span class="hint-flag flag-carried">承接结果 ${s.carried_result_count || 0}</span>
        <span class="hint-flag">本场流水 ${s.event_count || 0}（现场 ${s.manual_event_count || 0} / 承接 ${s.carried_event_count || 0} / 撤回 ${s.retracted_event_count || 0}）</span>
        <span class="hint-flag">复核申请 ${s.review_request_count || 0}</span>
        <span class="hint-flag">故障 ${s.fault_count || 0}</span>
        <span class="hint-flag">交接单 ${s.handover_count || 0}</span>
      </div>
      <details class="handover-details" open>
        <summary class="muted">最终提示结果（${(r.cue_results || []).length} 条，含原操作人 / 时间 / 本场流水 / 来源演出；承接结果已沿接续链追溯原流水）</summary>
        <div class="hint-table-wrap"><table class="hint-table closure-result-table">
          <thead><tr><th style="width:40px">#</th><th>编号</th><th>最终结果</th><th>本场操作人</th><th>本场时间</th><th>原流水 / 来源</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </details>
      ${reviewBlock}
      ${faultBlock}
      ${handoverBlock}
    </div>`;
}

function cueCard(perfId, c, readonly) {
  const depsHtml = c.deps.length
    ? c.deps.map(d => `<span class="dep-chip ${c.unmet.includes(d) ? 'unmet-chip' : 'met'}">${esc(d)}</span>`).join('')
    : '<span class="muted">无前置</span>';
  const eventHtml = c.event
    ? `<div class="cue-event">${ACTION_TEXT(c.event.action)} · ${esc(c.event.operator)} · ${fmtTime(c.event.created_at)}${c.event.reason ? ' · 原因：' + esc(c.event.reason) : ''}${c.event.source === 'carried' ? ' · <span class="carried-text">承接自演出 #' + esc(c.event.carried_from_performance_id) + '</span>' : ''}</div>`
    : '';
  const blockedHtml = c.status === 'blocked'
    ? `<div class="cue-event"><span class="unmet">受阻：前置 ${c.unmet.map(esc).join('、')} 未触发</span></div>`
    : '';
  const req = c.pending_request;
  const reviewHtml = req
    ? `<div class="cue-event"><span class="review-pending-text">待复核：${esc(req.requested_by)} 于 ${fmtTime(req.requested_at)} 申请触发，需另一操作人确认</span></div>`
    : '';
  const ownFault = c.own_fault;
  const faultSources = c.fault_blocked || [];
  const faultHit = faultSources.length > 0;
  const faultHtml = ownFault
    ? `<div class="cue-event"><span class="fault-text">⚠ 本提示设备故障（${fmtTime(ownFault.reported_at)}，${esc(ownFault.reported_by)}）：${esc(ownFault.reason)}</span></div>`
    : (faultHit
      ? `<div class="cue-event"><span class="fault-text">⚠ 触发冻结：受故障 ${[...new Set(faultSources.map(f => '「' + f.label + '」'))].join('、')} 影响，解除前不得触发</span></div>`
      : '');
  const canAct = !readonly && c.status === 'pending' && !req && !faultHit;
  const done = c.status === 'fired' || c.status === 'skipped';
  const canRetract = !readonly && c.status === 'fired';
  const fireLabel = c.needs_review ? '申请触发' : '触发';
  return `
    <div class="cue-card ${c.status}${faultHit ? ' fault-hit' : ''}">
      <div class="cue-seq">${c.seq}</div>
      <div class="cue-main">
        <div class="cue-title">
          <span class="cue-label">${esc(c.label)}</span>
          <span class="cue-type">${TYPE_TEXT[c.type] || c.type}</span>
          ${c.needs_review ? '<span class="badge review">双人复核</span>' : ''}
          ${c.event && c.event.source === 'carried' ? '<span class="badge carried">承接</span>' : ''}
          ${ownFault ? '<span class="badge fault-badge">⚠ 设备故障</span>' : (faultHit ? '<span class="badge fault-affected-badge">触发冻结</span>' : '')}
          <span class="status ${c.status}">${STATUS_TEXT[c.status]}</span>
        </div>
        ${c.description ? `<div class="cue-desc">${esc(c.description)}</div>` : ''}
        <div class="cue-deps">前置：${depsHtml}</div>
        ${blockedHtml}
        ${faultHtml}
        ${reviewHtml}
        ${eventHtml}
      </div>
      <div class="cue-actions">
        <button id="fire-${c.id}" ${canAct ? '' : 'disabled'}>${fireLabel}</button>
        <button id="skip-${c.id}" class="ghost" ${(!readonly && !done && !req) ? '' : 'disabled'}>跳过</button>
        <button id="retract-${c.id}" class="danger" ${canRetract ? '' : 'disabled'}>撤回</button>
        <button id="fault-${c.id}" class="ghost fault-btn" ${(!readonly && !ownFault) ? '' : 'disabled'} title="登记现场设备故障">⚠ 登记故障</button>
      </div>
    </div>`;
}

async function doFire(perfId, cueId) {
  const operator = getOperator();
  if (!operator) { toast('请先填写操作人', true); return document.getElementById('operator-input').focus(); }
  try {
    const r = await api(`/api/performances/${perfId}/cues/${cueId}/fire`, { method: 'POST', body: { operator } });
    if (r.request) toast('已提交触发申请，待另一操作人复核确认');
  } catch (e) {
    toast(e.message, true); // 409 冲突 / 422 受阻等，消息含当前状态
  }
  stopPolling();
  renderPerformance(perfId);
}

async function doSkip(perfId, cueId) {
  const operator = getOperator();
  if (!operator) { toast('请先填写操作人', true); return document.getElementById('operator-input').focus(); }
  const reason = window.prompt('请填写跳过原因（必填）：');
  if (reason == null) return;
  if (!reason.trim()) return toast('跳过必须填写原因', true);
  try {
    await api(`/api/performances/${perfId}/cues/${cueId}/skip`, {
      method: 'POST', body: { operator, reason: reason.trim() },
    });
  } catch (e) {
    toast(e.message, true);
  }
  stopPolling();
  renderPerformance(perfId);
}

async function doRetract(perfId, cueId) {
  const operator = getOperator();
  if (!operator) { toast('请先填写操作人', true); return document.getElementById('operator-input').focus(); }
  const reason = window.prompt('请填写撤回原因（必填，如：误触发）：');
  if (reason == null) return;
  if (!reason.trim()) return toast('撤回必须填写原因', true);
  try {
    await api(`/api/performances/${perfId}/cues/${cueId}/retract`, {
      method: 'POST', body: { operator, reason: reason.trim() },
    });
    toast('已撤回，该提示可重新执行');
  } catch (e) {
    // 409：当前状态不允许撤回，或下游仍有已触发提示（消息含受影响编号）
    toast(e.message, true);
  }
  stopPolling();
  renderPerformance(perfId);
}

/* ---------- 双人复核：确认 / 驳回 / 撤销 ---------- */

async function doConfirmRequest(perfId, reqId) {
  const operator = getOperator();
  if (!operator) { toast('请先填写操作人（须与申请人不同）', true); return document.getElementById('operator-input').focus(); }
  try {
    await api(`/api/performances/${perfId}/review-requests/${reqId}/confirm`, {
      method: 'POST', body: { operator },
    });
    toast('已确认，提示触发成功');
  } catch (e) {
    // 409：申请已处置 / 确认人与申请人相同；422：前置未触发（申请保持待复核）
    toast(e.message, true);
  }
  stopPolling();
  renderPerformance(perfId);
}

async function doRejectRequest(perfId, reqId) {
  const operator = getOperator();
  if (!operator) { toast('请先填写操作人', true); return document.getElementById('operator-input').focus(); }
  const reason = window.prompt('请填写驳回原因（必填）：');
  if (reason == null) return;
  if (!reason.trim()) return toast('驳回必须填写原因', true);
  try {
    await api(`/api/performances/${perfId}/review-requests/${reqId}/reject`, {
      method: 'POST', body: { operator, reason: reason.trim() },
    });
    toast('已驳回该申请');
  } catch (e) {
    toast(e.message, true);
  }
  stopPolling();
  renderPerformance(perfId);
}

async function doCancelRequest(perfId, reqId) {
  const operator = getOperator();
  if (!operator) { toast('请先填写操作人（须为申请人本人）', true); return document.getElementById('operator-input').focus(); }
  try {
    await api(`/api/performances/${perfId}/review-requests/${reqId}/cancel`, {
      method: 'POST', body: { operator },
    });
    toast('已撤销该申请');
  } catch (e) {
    // 409：非申请人本人 / 申请已处置
    toast(e.message, true);
  }
  stopPolling();
  renderPerformance(perfId);
}
