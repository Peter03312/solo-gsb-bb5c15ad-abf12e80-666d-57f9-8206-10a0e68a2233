'use strict';
/**
 * 数据层：Node.js 内置 SQLite（node:sqlite），关系型存储，数据落本地文件。
 * 启动时自动建表（初始化），空库时可选写入演示数据（SEED_DEMO=0 关闭）。
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS shows (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 执行单版本：draft 可改，published 不可变
CREATE TABLE IF NOT EXISTS versions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  show_id        INTEGER NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  note           TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  published_at   TEXT,
  UNIQUE (show_id, version_number)
);

-- 提示：deps 为 JSON 数组，存放前置提示的编号（label）；
-- needs_review=1 表示现场触发需双人复核（草稿可改，发布后随版本锁定）
CREATE TABLE IF NOT EXISTS cues (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id   INTEGER NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL,
  label        TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('light','sound','set','other')),
  description  TEXT NOT NULL DEFAULT '',
  deps         TEXT NOT NULL DEFAULT '[]',
  needs_review INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cues_version ON cues(version_id, seq);

-- 每场演出：锁定一个已发布版本，独立记录
-- status: active 可现场操作；readonly 为已接续的原演出（保留原快照，仅可回看）；
--         closed 为已封场结项（原记录与不可变封场报告可回看，一切现场写操作拒绝）
-- continued_from_performance_id: 接续演出指向其来源演出（沿此链可追溯全部历史）
-- closed_at/by/note: 封场结项时间、结项人、封场说明；closure_report_id 指向一次性固定的不可变报告
CREATE TABLE IF NOT EXISTS performances (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  show_id     INTEGER NOT NULL REFERENCES shows(id),
  version_id  INTEGER NOT NULL REFERENCES versions(id),
  name        TEXT NOT NULL DEFAULT '',
  started_by  TEXT NOT NULL DEFAULT '',
  started_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','readonly','closed')),
  continued_from_performance_id INTEGER REFERENCES performances(id),
  continued_at TEXT,
  continued_by TEXT,
  closed_at   TEXT,
  closed_by   TEXT,
  closure_note TEXT NOT NULL DEFAULT '',
  closure_report_id INTEGER REFERENCES closure_reports(id)
);

-- 封场结项报告：封场通过核对后在同一事务内一次性写入，此后不可变（无任何更新 / 删除入口）。
-- 一场演出至多一份（UNIQUE(performance_id)）；report 为固定下来的完整 JSON：
-- 结项时间 / 结项人 / 最终提示结果（含原操作人、原时间、本场流水、来源演出；
-- 承接结果沿接续链追溯到原 manual 流水）、全部流水、复核、故障、交接留痕与接续链。
CREATE TABLE IF NOT EXISTS closure_reports (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  performance_id INTEGER NOT NULL UNIQUE REFERENCES performances(id),
  closed_by      TEXT NOT NULL,
  closed_note    TEXT NOT NULL DEFAULT '',
  closed_at      TEXT NOT NULL,
  report         TEXT NOT NULL
);

-- 执行流水：触发 / 跳过 / 撤回 全量留痕；同一演出同一提示的"当前有效结果"
-- 由最新一条事件推导（retracted 表示已撤回、当前无有效结果），
-- 并发一致性由 BEGIN IMMEDIATE 事务内"读最新事件→判定→写入"保证
-- source: manual 现场操作；carried 接续时从来源演出承接的有效结果（非再次触发，
--   carried_* 列指向来源事件 / 来源演出，原流水在来源演出中仍可查）
CREATE TABLE IF NOT EXISTS cue_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  performance_id INTEGER NOT NULL REFERENCES performances(id) ON DELETE CASCADE,
  cue_id         INTEGER NOT NULL REFERENCES cues(id),
  action         TEXT NOT NULL CHECK (action IN ('fired','skipped','retracted')),
  operator       TEXT NOT NULL,
  reason         TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  source         TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','carried')),
  carried_from_performance_id INTEGER REFERENCES performances(id),
  carried_from_event_id       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_cue_events_perf ON cue_events(performance_id, cue_id, id);

-- 双人复核触发申请：对 needs_review 提示的"触发"先登记申请（记录申请人与时间），
-- 提示不算已触发；另一操作人确认且前置均已触发后才写入 fired 流水并关联 event_id。
-- 申请人可撤销、其他人可填原因驳回；申请与处置全量留痕，状态机：
--   pending → confirmed / cancelled / rejected（终态，并发处置在事务内判定，只有一种结局）
CREATE TABLE IF NOT EXISTS cue_review_requests (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  performance_id INTEGER NOT NULL REFERENCES performances(id) ON DELETE CASCADE,
  cue_id         INTEGER NOT NULL REFERENCES cues(id),
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled','rejected')),
  requested_by   TEXT NOT NULL,
  requested_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_by    TEXT,
  resolved_at    TEXT,
  resolve_reason TEXT,
  event_id       INTEGER REFERENCES cue_events(id)
);
CREATE INDEX IF NOT EXISTS idx_review_requests_perf ON cue_review_requests(performance_id, cue_id, id);

-- 现场设备故障登记：舞台监督按提示编号登记故障（操作人 + 原因），系统沿已发布执行单的
-- 前置关系标出故障提示本身及所有依赖它的后续提示；未解除期间受影响提示不得触发
-- （跳过 / 撤回仍遵守原有规则；待复核申请保留但不得确认）。解除须记录操作人与原因。
-- 登记 / 解除均为独立留痕记录，不改写任何既有执行流水；提示状态在解除后按当前有效结果重算。
-- 部分唯一索引：同一演出同一提示至多一条未解除（active）故障。
CREATE TABLE IF NOT EXISTS cue_faults (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  performance_id INTEGER NOT NULL REFERENCES performances(id) ON DELETE CASCADE,
  cue_id         INTEGER NOT NULL REFERENCES cues(id),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved')),
  reported_by    TEXT NOT NULL,
  reason         TEXT NOT NULL,
  reported_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_by    TEXT,
  resolved_at    TEXT,
  resolve_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_faults_perf ON cue_faults(performance_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_faults_active_unique
  ON cue_faults (performance_id, cue_id) WHERE status = 'active';

-- 现场换班交接单：舞台监督在当前可操作演出填写交班人 / 接班人 / 交接说明，
-- 形成待签收交接单（pending）。snapshot 为当时固定快照（各提示有效结果与最新流水位置、
-- 待复核申请、未解除故障、尚未完成提示及阻塞原因），交接期间现场操作照常进行。
-- 接班人按最新状态逐项核对：任一快照内容变化则返回差异、交接单保持待签收（可由原交班人
-- 重提替换快照）；核对通过后签收（signed），记录签收时间，成为不可变历史。
-- 再次提交时由原交班人重提：旧待签收单置为 superseded（保留留痕）后写入新单。
-- 部分唯一索引：同一演出至多保留一张待签收交接单。
CREATE TABLE IF NOT EXISTS cue_handovers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  performance_id INTEGER NOT NULL REFERENCES performances(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed','superseded')),
  handed_by      TEXT NOT NULL,
  received_by    TEXT NOT NULL,
  note           TEXT NOT NULL DEFAULT '',
  snapshot       TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  superseded_by_handover_id INTEGER REFERENCES cue_handovers(id),
  superseded_at  TEXT,
  signed_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_handovers_perf ON cue_handovers(performance_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_handovers_pending_unique
  ON cue_handovers (performance_id) WHERE status = 'pending';
`);

/**
 * 旧库迁移：早期 cue_events 带 UNIQUE(performance_id, cue_id) 且不含 retracted 动作，
 * 无法记录多条流水。检测后重建表（保留全部既有记录），新库此函数为空操作。
 */
function migrateCueEventsIfNeeded() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cue_events'").get();
  if (!row || row.sql.includes('retracted')) return;
  db.exec('PRAGMA foreign_keys = OFF');
  withTx(() => {
    db.exec(`
      CREATE TABLE cue_events_mig (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        performance_id INTEGER NOT NULL REFERENCES performances(id) ON DELETE CASCADE,
        cue_id         INTEGER NOT NULL REFERENCES cues(id),
        action         TEXT NOT NULL CHECK (action IN ('fired','skipped','retracted')),
        operator       TEXT NOT NULL,
        reason         TEXT,
        created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      INSERT INTO cue_events_mig (id, performance_id, cue_id, action, operator, reason, created_at)
        SELECT id, performance_id, cue_id, action, operator, reason, created_at FROM cue_events;
      DROP TABLE cue_events;
      ALTER TABLE cue_events_mig RENAME TO cue_events;
      CREATE INDEX IF NOT EXISTS idx_cue_events_perf ON cue_events(performance_id, cue_id, id);
    `);
  });
  db.exec('PRAGMA foreign_keys = ON');
  console.log('[init] 已迁移 cue_events 表：支持撤回流水（保留全部历史记录）');
}

migrateCueEventsIfNeeded();

/**
 * 旧库迁移：早期 cues 表无 needs_review 列。检测后补列，
 * 既有提示（含已发布旧版本）默认 0，按"无需复核"处理。新库此函数为空操作。
 */
function migrateCuesNeedsReviewIfNeeded() {
  const cols = db.prepare('PRAGMA table_info(cues)').all();
  if (cols.some((c) => c.name === 'needs_review')) return;
  db.exec('ALTER TABLE cues ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0');
  console.log('[init] 已迁移 cues 表：新增 needs_review 列（既有提示默认无需复核）');
}

migrateCuesNeedsReviewIfNeeded();

/**
 * 旧库迁移：performances 表新增接续相关列
 * （status 读写状态、continued_from_performance_id 来源演出、continued_at/by 接续时间与操作人）。
 * 既有演出均为现场启动、可操作，status 默认 active。新库此函数为空操作。
 */
function migratePerformancesContinuationIfNeeded() {
  const cols = db.prepare('PRAGMA table_info(performances)').all();
  const has = (name) => cols.some((c) => c.name === name);
  if (!has('status')) {
    db.exec("ALTER TABLE performances ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  }
  if (!has('continued_from_performance_id')) {
    db.exec('ALTER TABLE performances ADD COLUMN continued_from_performance_id INTEGER REFERENCES performances(id)');
  }
  if (!has('continued_at')) db.exec('ALTER TABLE performances ADD COLUMN continued_at TEXT');
  if (!has('continued_by')) db.exec('ALTER TABLE performances ADD COLUMN continued_by TEXT');
  if (!has('status') || !has('continued_from_performance_id') || !has('continued_at') || !has('continued_by')) {
    console.log('[init] 已迁移 performances 表：新增接续关系列（status / continued_from_performance_id / continued_at / continued_by，既有演出默认可操作）');
  }
}

migratePerformancesContinuationIfNeeded();

/**
 * 旧库迁移：performances 表新增封场结项列（closed_at / closed_by / closure_note /
 * closure_report_id），并放宽 status CHECK 约束以容纳 closed（已封场）状态；
 * 同时新建 closure_reports 不可变封场报告表。既有演出均保持 active，封场列留空。
 * 新库（建表时已含全部列与三态约束、且报告表已建）此函数为空操作。
 */
function migratePerformancesClosureIfNeeded() {
  const cols = db.prepare('PRAGMA table_info(performances)').all();
  const has = (name) => cols.some((c) => c.name === name);
  if (!has('closed_at')) db.exec('ALTER TABLE performances ADD COLUMN closed_at TEXT');
  if (!has('closed_by')) db.exec('ALTER TABLE performances ADD COLUMN closed_by TEXT');
  if (!has('closure_note')) db.exec("ALTER TABLE performances ADD COLUMN closure_note TEXT NOT NULL DEFAULT ''");
  if (!has('closure_report_id')) {
    db.exec('ALTER TABLE performances ADD COLUMN closure_report_id INTEGER REFERENCES closure_reports(id)');
  }

  // 旧库 status CHECK 仅允许 active/readonly：检出后按新结构整表重建（历史记录全部保留）
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'performances'").get();
  const checkAllowsClosed = /'closed'/.test(row.sql);
  if (!checkAllowsClosed) {
    db.exec('PRAGMA foreign_keys = OFF');
    withTx(() => {
      db.exec(`
        CREATE TABLE performances_mig (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          show_id     INTEGER NOT NULL REFERENCES shows(id),
          version_id  INTEGER NOT NULL REFERENCES versions(id),
          name        TEXT NOT NULL DEFAULT '',
          started_by  TEXT NOT NULL DEFAULT '',
          started_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
          status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','readonly','closed')),
          continued_from_performance_id INTEGER REFERENCES performances(id),
          continued_at TEXT,
          continued_by TEXT,
          closed_at   TEXT,
          closed_by   TEXT,
          closure_note TEXT NOT NULL DEFAULT '',
          closure_report_id INTEGER REFERENCES closure_reports(id)
        );
        INSERT INTO performances_mig
          (id, show_id, version_id, name, started_by, started_at, status,
           continued_from_performance_id, continued_at, continued_by,
           closed_at, closed_by, closure_note, closure_report_id)
        SELECT id, show_id, version_id, name, started_by, started_at, status,
           continued_from_performance_id, continued_at, continued_by,
           closed_at, closed_by, closure_note, closure_report_id
        FROM performances;
        DROP TABLE performances;
        ALTER TABLE performances_mig RENAME TO performances;
      `);
    });
    db.exec('PRAGMA foreign_keys = ON');
    console.log('[init] 已迁移 performances 表：status 支持 closed（已封场）状态并补齐封场结项列');
  }
}

migratePerformancesClosureIfNeeded();

/**
 * 旧库迁移：cue_events 表新增承接来源列（source / carried_from_performance_id /
 * carried_from_event_id）。既有流水均为现场手动操作，source 默认 manual。新库为空操作。
 */
function migrateCueEventsCarryIfNeeded() {
  const cols = db.prepare('PRAGMA table_info(cue_events)').all();
  const has = (name) => cols.some((c) => c.name === name);
  if (!has('source')) {
    db.exec("ALTER TABLE cue_events ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
  }
  if (!has('carried_from_performance_id')) {
    db.exec('ALTER TABLE cue_events ADD COLUMN carried_from_performance_id INTEGER REFERENCES performances(id)');
  }
  if (!has('carried_from_event_id')) db.exec('ALTER TABLE cue_events ADD COLUMN carried_from_event_id INTEGER');
  if (!has('source') || !has('carried_from_performance_id') || !has('carried_from_event_id')) {
    console.log('[init] 已迁移 cue_events 表：新增承接来源列（source / carried_from_performance_id / carried_from_event_id，既有流水默认手动）');
  }
}

migrateCueEventsCarryIfNeeded();

/** 事务包装：BEGIN IMMEDIATE 保证写操作串行，冲突时整体回滚 */
function withTx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) { /* already rolled back */ }
    throw err;
  }
}

/** 空库初始化演示数据（便于一键启动后直接体验） */
function seedDemoIfEmpty() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM shows').get();
  if (row.n > 0) return;

  const insertShow = db.prepare('INSERT INTO shows (name) VALUES (?)');
  const insertVersion = db.prepare(
    "INSERT INTO versions (show_id, version_number, status, note, published_at) VALUES (?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
  );
  const insertCue = db.prepare(
    'INSERT INTO cues (version_id, seq, label, type, description, deps, needs_review) VALUES (?,?,?,?,?,?,?)'
  );
  const insertPerformance = db.prepare(
    'INSERT INTO performances (show_id, version_id, name, started_by) VALUES (?,?,?,?)'
  );
  const insertEvent = db.prepare(
    "INSERT INTO cue_events (performance_id, cue_id, action, operator, reason) VALUES (?,?,?,?,?)"
  );

  withTx(() => {
    const showId = Number(insertShow.run('示例剧目《夜航》').lastInsertRowid);

    // 第 5 列：needs_review（1 = 现场触发需双人复核）
    const demoCues = [
      ['L1', 'light', '开场灯渐亮', '[]', 0],
      ['S1', 'sound', '开场音乐起', '["L1"]', 0],
      ['B1', 'set', '大幕升起', '["S1"]', 0],
      ['L2', 'light', '追光打在主角位', '["L1"]', 0],
      ['S2', 'sound', '远雷声', '["B1"]', 0],
      ['B2', 'set', '船台推出（危险机关，需双人复核）', '["B1","L2"]', 1],
    ];

    const v1 = Number(insertVersion.run(showId, 1, 'published', '首演版').lastInsertRowid);
    demoCues.forEach((c, i) => insertCue.run(v1, i + 1, c[0], c[1], c[2], c[3], c[4]));

    // v2 已发布：新增 S3 并调整 L2 描述（编号、类型、前置、复核标记均保留），可作为接续目标
    const v2 = Number(insertVersion.run(showId, 2, 'published', '现场修订版：新增雨声 S3').lastInsertRowid);
    demoCues.forEach((c, i) => {
      const desc = c[0] === 'L2' ? '追光打在主角位（提亮）' : c[2];
      insertCue.run(v2, i + 1, c[0], c[1], desc, c[3], c[4]);
    });
    insertCue.run(v2, demoCues.length + 1, 'S3', 'sound', '雨声渐入（新增）', '["S2"]', 0);

    // 一场进行中的演出（v1）：L1 已触发、S1 已跳过，其余未执行，可直接体验接续到 v2
    const perfId = Number(insertPerformance.run(showId, v1, '9月30日 晚场（进行中）', '王导').lastInsertRowid);
    const cueIdByLabel = (versionId, label) =>
      db.prepare('SELECT id FROM cues WHERE version_id = ? AND label = ?').get(versionId, label).id;
    insertEvent.run(perfId, cueIdByLabel(v1, 'L1'), 'fired', '张三', null);
    insertEvent.run(perfId, cueIdByLabel(v1, 'S1'), 'skipped', '李四', '音乐设备故障，跳过开场音乐');
  });

  console.log('[init] 已写入演示数据（SEED_DEMO=0 可关闭）');
}

if (process.env.SEED_DEMO !== '0') {
  seedDemoIfEmpty();
}

module.exports = { db, withTx, DB_PATH };
