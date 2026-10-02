# 舞台监督提示单系统（Stage Cue Manager）

供舞台监督在**排演**与**现场执行**中使用的 Web 应用：录入场次与执行单（灯光 / 音效 / 布景提示及其前置提示），校验后发布不可变执行单；每场演出从某一已发布版本启动独立记录，现场按依赖关系触发或跳过提示，全程留痕。

## 功能

- **场次与执行单管理**：按序编排提示（编号、类型、描述、前置提示）
- **发布前校验**：缺失引用（前置编号不存在）、编号重复、自依赖、循环依赖（给出环路径）
- **不可变执行单**：发布后内容锁定；修改须新建草稿再发布新版本
- **现场执行台**：实时展示 待执行 / 已触发 / 已跳过 / 受阻（前置未触发） 四种状态
  - 仅当前置全部**已触发**时才可触发；受阻项触发按钮禁用且服务端同样拒绝
  - 跳过必须填写原因；每次结果留存操作人与时间
  - **双人复核触发**：草稿中可将个别提示标记为「需双人复核」（发布后随版本锁定，旧版本提示按无需复核处理）。现场对这类提示发起的是**触发申请**（记录申请人与时间），提示仍不算已触发、下游前置仍受阻；须**另一操作人确认**且前置当前均已触发后，才写入有效触发流水。申请人可撤销待处理申请，其他人可填原因驳回，申请与处置全程留痕；待处理期间拒绝跳过、重复申请和撤回
  - **撤回误触发**：对当前「已触发」的提示可撤回（须填撤回人与原因）；若其下游（沿前置关系可达的后续提示）仍有有效「已触发」，则整体拒绝并列出受影响编号，任何记录都不改变。撤回后原触发与撤回流水全部保留，提示按当前前置结果回到「待执行 / 受阻」，可再次触发或跳过；已跳过与未触发的提示不可撤回
  - 多人并发操作同一提示只记一次有效结果，冲突方会收到当前状态提示；复核的确认与撤销 / 驳回并发时也只有一种结局
- **版本隔离与回看**：演出锁定启动时的已发布版本；排演改草稿不影响进行中的演出，历史演出始终按当时版本回看
- **改用修订执行单（接续演出）**：现场需改用新版本时，舞台监督指定当前演出、同场次更高且已发布的目标版本与非空操作人，先按编号核对（原演出及其接续来源中有任意触发 / 跳过 / 撤回流水、复核申请或承接结果的编号都会列出并标记），再生成接续演出。原演出仍绑定原快照并转为只读；新版中这些编号的类型、描述、前置编号集合、复核标记均须保留且不存在待处理复核申请，否则按编号返回冲突原因，原演出保持可操作、不产生接续记录。接续演出继承有效结果（标注「承接」及来源演出 / 来源流水，保留原操作人与时间，非再次触发），原流水仍可在原演出查看，未执行提示按新版依赖重算待执行 / 受阻；接续与现场操作串行判定，已只读演出拒绝后续操作，多次接续只能从当前可操作演出发起
  - **成组连续处置**：现场需按顺序连续处置多条提示时，舞台监督在当前**可操作演出**中一次性选择不同编号、逐项指定**触发 / 跳过 / 撤回**，填写本组操作人及各项跳过 / 撤回原因；空清单或重复编号直接拒绝。执行台先展示**逐项预览**（每一步基于前面步骤产生的有效结果判定前置满足、下游撤回保护与待复核限制）与失败原因；**需双人复核的提示不得在成组中直接触发**（请走单项申请—确认）。提交瞬间在事务内按最新状态**重新逐项判定**，任一项失败都指出序号、编号与原因且**整组不产生流水**，全部通过才依次留下与单项操作一致的执行流水并返回各项结果；只读演出拒绝预览与提交，成组提交与接续、单项操作、故障处置在同一事务级串行，现有单项接口与响应保持兼容
- **现场设备故障登记与解除**：舞台监督在当前可操作演出按提示编号登记故障（操作人 + 原因）；编号不属于该演出、信息为空或该编号已有未解除故障时拒绝。系统沿已发布执行单的前置关系标出故障提示及所有依赖它的后续提示；未解除期间受影响提示**不得触发**（单项触发、双人复核确认、成组预览与提交均按最新故障状态判 422），**待复核申请保留但不得确认**，跳过与撤回仍遵守原有规则；登记不改写任何既有执行流水。解除须记录操作人与原因，解除后按当前有效结果重算提示状态。故障登记 / 解除与现场操作、接续串行判定：接续前有未解除故障则拒绝且原演出保持可操作，已接续的只读演出不得登记或解除；执行台展示故障影响范围与登记 / 解除处理记录
- **现场换班交接（交接单）**：舞台监督在**当前可操作演出**填写交班人、接班人（均非空且不能相同）与交接说明，生成一张**待签收交接单**；同一演出只保留一张待签收单（部分唯一索引保证）。交接单**固定当时快照**：各提示有效结果、最新流水位置、待复核申请、未解除故障（含影响范围），并列出尚未完成的提示及阻塞原因（前置未触发 / 待复核 / 故障冻结 / 待执行）。**交接期间现场操作照常进行**，不冻结任何操作；接班人签收时系统按最新状态**逐项核对**，任一快照内容已变化即返回分组差异、交接单保持待签收，交班人可据此**重提替换快照**（旧单标记「已被重提替换」并留痕，重提人须为原交班人）；全部一致才签收，签收记录不可变。交班人本人或其他人签收、重复签收均拒绝；接续后的只读演出只可回看交接单，不能提交、重提或签收（接续时未签收单自动作废留痕）。交接写操作与现场操作、复核、故障处置、接续在同一 `BEGIN IMMEDIATE` 事务内串行判定，执行台展示交接单快照与实时差异
- **演出封场结项（不可变封场报告）**：演出结束时，舞台监督对**当前可操作（active）演出**填写非空**结项人**与**封场说明**执行封场。封场前按**当前演出版本**逐条核对：每条提示都必须有有效的**已触发 / 已跳过**结果（已撤回 / 无结果即未完成），且**待复核申请、未解除设备故障、待签收交接单**均已处理完；有阻项时**按编号列出未完成提示**、其余阻项分类列出（`review_requests` / `active_faults` / `pending_handovers`），演出保持可操作、**不生成报告**。核对通过后在同一事务内**一次性固定**结项时间、结项人、最终提示结果及原操作人 / 时间 / 本场流水 / 来源演出为不可变封场报告；**承接结果沿接续链追溯到原流水**（`source=carried` 的结果逐级回溯到最早一条现场 `manual` 流水），不算作本场再次触发。**已接续的只读演出不能封场**（须在当前可操作的接续演出上封场）；封场后演出转为 `closed`：原记录与不可变报告可回看，该演出的单项 / 成组处置、复核、故障、交接及接续写操作一律拒绝，**重复封场拒绝**。封场核对与现场写操作在同一 `BEGIN IMMEDIATE` 事务内串行，不可能留下部分结项；执行台与 HTTP API（`GET /api/performances/:id/closure-report`）均可查看报告
- **明确错误**：无已发布版本、非法依赖、前置未满足、缺少操作人 / 原因等均有中文错误提示

## 一键启动（Docker Compose）

```bash
docker compose up --build
```

启动后访问：**http://localhost:3000**

- 首次启动自动初始化数据库（建表），空库时写入一份演示数据（可用 `SEED_DEMO: "0"` 关闭）
- SQLite 数据保存在名为 `cue-data` 的卷中（容器内 `/app/data/app.db`），删除容器不丢数据

## 配置（环境变量）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | Web 服务端口（compose 中映射为 `宿主机:容器`，改宿主机端口请改 `ports`，如 `"8080:3000"`） |
| `DB_PATH` | `/app/data/app.db`（本地运行为 `./data/app.db`） | SQLite 数据库文件路径 |
| `SEED_DEMO` | `1` | 空库时是否写入演示数据，`0` 关闭 |
| `HOST` | `0.0.0.0` | 监听地址 |

## 本地开发（不用 Docker）

要求 Node.js ≥ 22.13（推荐 24，使用内置 `node:sqlite`，**无任何第三方依赖**）：

```bash
npm start          # 或 node server.js
# 打开 http://localhost:3000
```

## 使用流程

1. **新建场次** → 进入场次后「新建草稿」
2. 在草稿编辑器中按序录入提示，前置提示填编号（逗号分隔）；危险或关键提示勾选「复核」列；随时「校验」
3. 「校验并发布」→ 生成不可变执行单（如 v1），复核标记随版本锁定
4. 回到场次页「启动演出」，选择已发布版本 → 进入执行台
5. 执行台中填写操作人，对提示执行「触发 / 跳过」；需复核提示点「申请触发」后在右侧「复核申请」面板由**另一操作人**确认（前置未齐会被拒并保持待复核），申请人可撤销、其他人可填原因驳回；误触发可点「撤回」并填写撤回人与原因；页面每 2.5 秒自动刷新，多人可同时操作；右侧展示复核申请处置记录与完整执行流水（含撤回记录）
   - 需要连续处置多条提示时，用顶部「📋 成组连续处置」：按顺序添加编号与动作（触发 / 跳过 / 撤回）、填写各项原因，先「逐项预览」确认每步前置 / 下游 / 复核判定，再「整组提交」（事务内重判，任一失败整组不留流水；需双人复核的提示不在此触发）
   - **现场设备故障**：点提示卡片上的「⚠ 登记故障」或顶部「⚠ 现场设备故障」面板，按编号填写原因登记；面板展示影响范围（故障源 + 全部下游）与处理记录。故障未解除时受影响提示的触发按钮与待复核「确认触发」按钮冻结（跳过 / 撤回照常）；设备恢复后在面板点「解除故障」并填写处理人 / 原因，提示状态立即按当前有效结果重算，全过程不改写既有流水
6. 排演中要改执行单：新建草稿（自动复制最新版本，含复核标记）→ 修改 → 发布为 v2；新演出即可选 v2，旧演出仍按 v1 回看
7. **现场需改用新版**：进入当前演出执行台，点「改用修订执行单 → 发起接续」，选择更高的已发布版本、填写操作人，先「按编号核对」查看有痕迹编号（触发 / 跳过 / 撤回 / 复核 / 承接）与冲突，通过后「生成接续演出」。原演出立即只读（顶部横幅可跳到接续演出），接续演出继承有效结果并标注「承接」；需要再次修订时，只能从最新的接续演出发起下一次接续
8. **现场换班**：执行台顶部「🔁 现场换班交接」面板填写交班人、接班人（须不同）与交接说明后「提交交接单」，面板即展示固定快照（各提示结果、最新流水位置、待复核申请、未解除故障、未完成提示及阻塞原因）；交接期间现场照常操作，页面 2.5 秒轮询会实时标出与快照的**差异**。接班人在面板填本人姓名点「逐项核对无误，签收」：有差异会被拒绝并列出差异，交班人点「交班人重提」即可用最新快照替换旧单（旧单留痕）；核对一致才签收，签收单进入下方不可变「交接历史」。只读（已接续）演出只可回看交接单
9. **封场结项**：全部提示处理完毕、无待复核申请 / 未解除故障 / 待签收交接单后，在执行台底部「🏁 封场结项」面板填结项人与封场说明，先自动核对（未完成提示按编号列出、其他阻项分类列出，演出不受影响），核对通过后确认封场：页面固定并展示不可变**封场结项报告**（最终提示结果、原操作人 / 时间 / 本场流水 / 来源演出；承接结果已沿接续链追溯原流水），此后该演出只读回看、所有写操作关闭。已接续的只读演出不能封场，请到当前可操作的接续演出封场；接续链每场可分别结项

## 技术栈与结构

- **后端**：Node.js 内置 `node:http`（API + 静态页面），零第三方依赖
- **数据库**：SQLite（Node 内置 `node:sqlite`），关系型 schema，WAL 模式，事务 + 唯一约束保证并发一致
- **前端**：原生 HTML/CSS/JS 单页应用（hash 路由），无需构建

```
server.js            # HTTP 入口：API 分发、静态文件、统一错误处理
src/db.js            # SQLite 连接、建表初始化、事务包装、演示数据
src/validate.js      # 执行单校验：缺失引用 / 重复编号 / 自依赖 / 循环依赖
src/api.js           # 全部 REST 接口与业务规则
public/              # 前端单页应用（index.html / app.js / style.css）
Dockerfile           # node:24-slim，零依赖构建
docker-compose.yml   # 一键启动 + 数据卷
```

## API 摘要

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/api/shows` | 场次列表 / 新建场次 |
| GET | `/api/shows/:id` | 场次详情（版本 + 演出记录） |
| POST | `/api/shows/:id/versions` | 新建草稿（默认复制最新版本） |
| GET | `/api/versions/:id` | 版本快照（含提示与前置） |
| PUT | `/api/versions/:id/cues` | 保存草稿（已发布返回 409） |
| POST | `/api/versions/:id/validate` | 校验（缺失引用 / 循环依赖） |
| POST | `/api/versions/:id/publish` | 发布（校验失败 422 并附问题清单） |
| POST | `/api/shows/:id/performances` | 启动演出（无已发布版本返回 400） |
| GET | `/api/performances/:id` | 执行台状态（提示状态 + 事件流水 + 复核申请 + **设备故障** + **交接单**；附 `continuation` 接续关系与 `continue_targets` 可接续目标版本；各提示附 `needs_review`、`pending_request` 与故障字段 `fault_blocked` / `fault_blocked_labels` / `own_fault`；顶层附 `faults` 全部登记解除记录（含 `affected_labels`）与 `active_fault_count`；承接流水 `source:"carried"`；附当前待签收单 `handover`（含固定 `snapshot` 与按最新状态实时计算的 `live_diff`）及全部 `handover_history` 交接历史（`pending` / `signed` / `superseded`）；演出 `status` 新增 `closed`（已封场结项），`continuation.closed=true` 时顶层附 `closure`（`closed_at/closed_by/note/report` 不可变封场报告）） |
| POST | `/api/performances/:id/continue/preview` | **接续前按编号核对**（不改数据）：返回有痕迹编号及标记 `hints`、冲突清单 `conflicts`、待处理申请 `pending_requests`、拟承接结果 `carried` 与 `can_continue` |
| POST | `/api/performances/:id/continue` | **生成接续演出**（body：`version_id` 目标版本、`operator` 必填、`name` 可选）。成功返回新演出与承接清单；冲突 409 附编号与原因；只读演出 / 非更高或未发布目标 4xx |
| POST | `/api/performances/:id/batch/preview` | **成组连续处置·逐项预览**（不改数据）：body `{operator, items:[{label,action,reason}]}`，`action` 为 `fire/skip/retract`。返回逐项判定 `results`、成功/失败计数与 `can_submit`；空清单、重复编号、非法动作 400；只读演出 409 |
| POST | `/api/performances/:id/batch` | **成组连续处置·整组提交**：事务内按最新状态重新逐项判定，全部通过才依次写入与单项一致的流水并返回各项结果；任一项失败回滚、**整组不产生流水**，4xx 附逐项 `results`（含序号、编号、原因）；只读演出 409。**受未解除设备故障影响的编号触发判 422（附 `blocked_by_faults`），跳过 / 撤回不受故障影响** |
| POST | `/api/performances/:id/cues/:cueId/faults` | **登记现场设备故障**（body：`operator`、`reason` 必填）：编号不属于该演出 404；信息为空 400；该编号已有未解除故障 409；只读演出 409。返回 `fault`（含沿前置关系计算的 `affected_labels`：故障编号本身及全部依赖它的后续提示）；不改写任何既有执行流水 |
| POST | `/api/performances/:id/faults/:faultId/resolve` | **解除故障**（body：`operator`、`reason` 必填）：不存在 404；已解除 409；只读演出 409。解除后按当前有效结果重算提示状态（无新增 / 改写流水），返回剩余未解除故障与仍受影响编号 |
| POST | `/api/performances/:id/handover` | **提交 / 重提交接单**（body：`handed_by` 交班人、`received_by` 接班人、`note` 交接说明可选）：两人非空且不同，否则 400；只读演出 409。同一演出只保留一张待签收单：已有待签收单时须由**原交班人**重提（旧单置 `superseded` 留痕、替换为新快照），非原交班人 409。返回 `handover`（含 `snapshot` 快照与 `live_diff`）与 `replaced_handover_id` |
| POST | `/api/performances/:id/handover/check` | **签收前只读核对**（不改数据）：返回待签收交接单、`matched`、`diff_count`、分组差异 `groups` 与打平清单 `diffs`；无待签收单 409 |
| POST | `/api/performances/:id/handover/sign` | **接班人签收**（body：`operator` 必填，须为接班人本人）：交班人本人或其他人签收 409；重复签收 409；只读演出 409；快照后现场有任何变化则 409 返回 `groups` / `diffs` 差异且交接单保持待签收；全部一致才置 `signed`（记录 `signed_at`，不可变历史） |
| POST | `/api/performances/:id/close/preview` | **封场前核对**（只读，不改数据）：按当前演出版本返回 `can_close`、未完成提示（按编号）`incomplete_cues`（`cue_id/label/seq`）与分类阻项 `review_requests` / `active_faults` / `pending_handovers`，及计数 `counts`（总数 / 已完成 / 未完成 / 已触发 / 已跳过）。已接续只读演出 409；已封场 409 |
| POST | `/api/performances/:id/close` | **封场结项**（body：`closed_by` 结项人必填、`note` 封场说明必填；`operator` 可作为 `closed_by` 别名）：事务内按最新状态重跑核对，有阻项整体回滚、409 返回未完成提示与分类阻项，**演出保持可操作、不生成报告**；通过则一次性写入不可变报告并置演出 `closed`，返回 `performance` 与 `closure`（`closed_at/closed_by/note/report`）。已接续只读演出 409；缺结项人 / 说明 400；**重复封场 409** |
| GET | `/api/performances/:id/closure-report` | **查看不可变封场报告**：返回 `closed_at` / `closed_by` / `note` / `report`；未封场 409（附 `status`），演出不存在 404。报告固定最终提示结果（含原操作人 / 时间 / 本场流水 / 来源演出；承接结果 `origin` 沿接续链追溯原 `manual` 流水、`carried_chain` 给出逐级来源）、全部流水 / 复核 / 故障 / 交接留痕与接续链 |
| POST | `/api/performances/:id/cues/:cueId/fire` | 触发（前置未满足 422；**受未解除设备故障影响 422 附 `blocked_by_faults`**；已有结果 409 附当前状态；只读演出 409）。**需复核提示调用本接口不会直接触发**，而是登记复核申请并返回 `{ request }`（申请阶段不受故障限制，确认时才判定）；普通提示响应保持 `{ event }` |
| POST | `/api/performances/:id/cues/:cueId/skip` | 跳过（缺原因 400；已有结果 409；待复核期间 409；只读演出 409） |
| POST | `/api/performances/:id/cues/:cueId/retract` | 撤回已触发（缺撤回人/原因 400；非已触发 409；下游仍已触发 409 附 `affected` 编号列表；待复核期间 409；只读演出 409） |
| POST | `/api/performances/:id/cues/:cueId/review-requests` | 登记触发申请（仅需复核提示可用，普通提示 400；重复申请 409；只读演出 409） |
| POST | `/api/performances/:id/review-requests/:reqId/confirm` | 确认申请（确认人须与申请人不同 409；前置未触发 422 且申请保持待复核；**受未解除设备故障影响 422 且申请保留待复核，解除后可再确认**；已处置 409；只读演出 409） |
| POST | `/api/performances/:id/review-requests/:reqId/cancel` | 撤销申请（仅申请人本人，否则 409；已处置 409；只读演出 409） |
| POST | `/api/performances/:id/review-requests/:reqId/reject` | 驳回申请（缺原因 400；申请人请走撤销 409；已处置 409；只读演出 409） |

## 撤回误触发（本轮新增）

现场误触发需要可追溯地撤回：不删除任何记录，而是追加一条 `retracted` 流水，使该提示的当前有效结果失效。

**规则**

- 仅当前有效结果为「已触发」的提示可撤回；「已跳过」与「未触发（含已撤回）」返回 409
- 请求必须携带 `operator`（撤回人）与 `reason`（原因），缺一则 400
- 若沿前置关系可达的后续提示仍存在有效「已触发」，撤回整体拒绝（409），响应 `affected` 字段列出受影响提示编号，任何记录都不改变；需自下游向上游逐级撤回
- 撤回成功后：原触发与撤回流水全部保留（执行台右侧完整展示）；该提示按当前前置结果重新显示「待执行」或「受阻」，可再次触发或跳过
- 撤回、触发、跳过在同一有效状态上判定（`BEGIN IMMEDIATE` 事务内读最新事件再写入），至多一个当前有效结果，并发冲突方收到 409 及当前结果
- 仅影响本场演出；已发布版本与其他演出不受影响

**调用示例**（假设演出 id=1，提示 id=3）：

```bash
# 1) 触发（原有能力）
curl -X POST http://localhost:3000/api/performances/1/cues/3/fire \
  -H 'Content-Type: application/json' \
  -d '{"operator":"张三"}'
# → 200 {"event":{"id":7,"action":"fired","operator":"张三",...}}

# 2) 发现误触发，撤回
curl -X POST http://localhost:3000/api/performances/1/cues/3/retract \
  -H 'Content-Type: application/json' \
  -d '{"operator":"李四","reason":"误触发，未到cue点"}'
# → 200 {"event":{"id":9,"action":"retracted","operator":"李四","reason":"误触发，未到cue点",...}}

# 3) 若下游仍有已触发提示，撤回被拒并列出受影响编号（任何记录不变）
# → 409 {"error":"无法撤回：以下后续提示仍处于已触发状态，请先撤回：S1、B1","affected":["S1","B1"]}

# 4) 查看完整流水与提示状态（撤回后该提示回到 待执行/受阻，可再次触发或跳过）
curl http://localhost:3000/api/performances/1
# events 中同时保留 fired 与 retracted 记录；cues[].status 为 pending 或 blocked
```

## 双人复核触发（本轮新增）

排演时在草稿编辑器勾选提示的「复核」列（`needs_review`），发布后标记随版本锁定；旧版本提示一律按无需复核处理。现场对这类提示的触发改为**申请—确认**两步：

**规则**

- 对需复核提示调用 `fire`（或 `POST .../review-requests`）只登记**触发申请**：记录申请人与时间，提示**不算已触发**，下游前置仍受阻；普通提示 `fire` 行为与响应（`{ event }`）不变，直接调用既有触发接口无法绕过复核
- **确认**：须由申请人之外的另一操作人执行，且前置当前均已触发才写入有效 `fired` 流水（事件关联申请）；前置失效（未触发或已撤回）时确认返回 422，**申请保持待复核**，前置恢复后可再次确认
- **撤销 / 驳回**：申请人本人可撤销待处理申请；其他人可填原因驳回（申请人驳回返回 409，请走撤销）；申请与处置（处置人、时间、原因）全部留痕
- **待处理期间**：该提示拒绝跳过、重复申请和撤回（均 409）；确认与撤销 / 驳回在事务内串行判定，并发只有一种结局，后到者收到 409 及当前处置结果
- 已确认（已触发）的提示与普通提示一样受现有撤回及下游保护；撤回后可重新申请
- 执行台右侧展示待复核申请（确认 / 驳回 / 撤销按钮）与处置记录，提示卡片上标注「双人复核」与待复核状态

**调用示例**（假设演出 id=1，需复核提示 id=6，申请 id=2）：

```bash
# 1) 申请人发起触发申请（对需复核提示调 fire 自动转为登记申请，不会直接触发）
curl -X POST http://localhost:3000/api/performances/1/cues/6/fire \
  -H 'Content-Type: application/json' \
  -d '{"operator":"张三"}'
# → 200 {"request":{"id":2,"status":"pending","requested_by":"张三","requested_at":"...",...}}
#    提示仍未触发，下游前置仍受阻；重复申请 / 跳过 / 撤回该提示均 409

# 2) 另一操作人确认：前置未全部触发时拒绝，申请保持待复核
curl -X POST http://localhost:3000/api/performances/1/review-requests/2/confirm \
  -H 'Content-Type: application/json' \
  -d '{"operator":"李四"}'
# → 422 {"error":"前置提示未触发，无法确认：B1、L2","unmet":["B1","L2"],...}
#    申请人自己确认 → 409「复核确认人不能与申请人相同」

# 3) 前置全部触发后再次确认 → 写入有效触发流水
# → 200 {"request":{"status":"confirmed","event_id":12,...},"event":{"action":"fired","operator":"李四",...}}

# 4) 申请人撤销待处理申请（非申请人撤销 409）
curl -X POST http://localhost:3000/api/performances/1/review-requests/2/cancel \
  -H 'Content-Type: application/json' \
  -d '{"operator":"张三"}'

# 5) 其他人填原因驳回（缺原因 400；申请人驳回 409，请走撤销）
curl -X POST http://localhost:3000/api/performances/1/review-requests/2/reject \
  -H 'Content-Type: application/json' \
  -d '{"operator":"李四","reason":"时机不对"}'

# 6) 执行台状态含复核申请流水与每提示的待复核申请
curl http://localhost:3000/api/performances/1
# review_requests：全部申请及处置留痕（最新在上）
# cues[].needs_review / cues[].pending_request：复核标记与当前待复核申请
```

## 现场改用修订执行单（接续演出）（本轮新增）

现场进行中需要改用新发布的修订执行单时，不重开一场空白演出，而是从当前演出**接续**：

1. 舞台监督在执行台「改用修订执行单」面板选择**目标版本**（必须是同场次、版本号更高、已发布）并填写非空**操作人**；
2. 先「按编号核对」：系统沿接续链汇总**原演出及其全部接续来源**中，有任意**触发 / 跳过 / 撤回流水、复核申请（含已处置）或承接结果**的编号；
3. 核对要求：这些编号在新版中必须保留，且**类型、描述、前置编号集合、复核标记**与当前版本完全一致；同时演出上不得有**待处理（pending）复核申请**（先去确认 / 撤销 / 驳回）；
4. 通过后「生成接续演出」：新建演出绑定新版本（可操作），原演出仍绑定原版本快照并立即转为**只读**；
5. 接续演出**继承有效结果**（当前有效 `fired`/`skipped`）：复制为 `source:"carried"` 的流水，保留原操作人与原时间，并记录来源演出与来源事件——**不是再次触发**；已撤回 / 未执行的提示不继承，按新版依赖重新计算「待执行 / 受阻」（承接的已触发同样满足前置）；
6. 原演出的流水、复核申请全部保留可查，执行台顶部以横幅展示「承接自 / 已接续到」关系，提示卡片与流水对承接结果标注「承接」徽章。

**串行与冲突**

- 接续与触发 / 跳过 / 撤回 / 复核处置在同一 `BEGIN IMMEDIATE` 事务内判定：接续提交瞬间仍会再读最新状态并重跑核对，现场操作与接续不可能互相覆盖。
- 冲突时（含事务内才出现的冲突）整体回滚：返回 409 与 `conflicts`（每个编号附原因），**原演出保持可操作，不产生任何接续记录或承接流水**。
- 已转只读的演出拒绝全部现场操作（fire/skip/retract/复核处置/再次接续），统一 409 并在响应中给出接续演出位置；只读演出的 GET 回看不受影响。
- 多次接续只能从**当前可操作（最新接续）演出**发起；核对范围自动覆盖整条接续链，因此早期演出里的触发 / 撤回 / 申请痕迹不会丢失。
- 原有的触发、跳过、撤回及复核接口路径、请求体与响应结构保持兼容（仅新增只读拒绝与事件上的 `source` 等字段）。

**调用示例**（假设当前演出 id=1 使用 v1，目标已发布 v3，version_id=3）：

```bash
# 1) 按编号核对（只读，不改任何数据）
curl -X POST http://localhost:3000/api/performances/1/continue/preview \
  -H 'Content-Type: application/json' \
  -d '{"version_id":3}'
# → 200
# {
#   "can_continue": true,
#   "target_version": {"id":3,"version_number":3,...},
#   "hints": [
#     {"label":"L1","flags":["fired"],"flag_text":"有触发流水","records":[...]},
#     {"label":"S1","flags":["skipped"],...},
#     {"label":"L2","flags":["carried","retracted","fired"],...}
#   ],
#   "carried": [
#     {"label":"L1","action":"fired","operator":"张三","source_event_id":1,"target_cue_id":12},
#     {"label":"S1","action":"skipped","operator":"李四","source_event_id":2,"target_cue_id":13}
#   ],
#   "conflicts": [], "pending_requests": []
# }

# 2) 生成接续演出（operator 必填；name 可选，默认追加「接续 vN」）
curl -X POST http://localhost:3000/api/performances/1/continue \
  -H 'Content-Type: application/json' \
  -d '{"version_id":3,"operator":"王监","name":"10月1日 晚场（修订版）"}'
# → 200
# {
#   "performance": {"id":7,"version_id":3,"status":"active",
#                   "continued_from_performance_id":1,"continued_by":"王监",...},
#   "source_performance_id": 1,
#   "target_version": {"id":3,"version_number":3},
#   "carried_count": 2,
#   "carried": [{"label":"L1","action":"fired","operator":"张三"},
#               {"label":"S1","action":"skipped","operator":"李四"}]
# }

# 3) 冲突时（编号缺失 / 类型 / 描述 / 前置集合 / 复核标记被改，或存在待处理申请）
# → 409 {"error":"接续核对未通过，请按冲突清单处理后重试",
#        "conflicts":[{"label":"B2","reasons":["存在待处理的复核申请，接续前须先确认、撤销或驳回"]},
#                     {"label":"L1","reasons":["类型不一致：v3 为 sound，当前为 light"]}],
#        "pending_requests":[...]}
#   原演出仍为 active、可操作，数据库无接续记录

# 4) 原演出只读：后续现场操作与再次接续统一 409
curl -X POST http://localhost:3000/api/performances/1/cues/12/fire \
  -H 'Content-Type: application/json' -d '{"operator":"赵六"}'
# → 409 {"error":"该演出已按修订执行单接续（…），原演出保持原快照且为只读，请到接续演出继续操作",
#        "readonly":true,"continuation":{"performance_id":7,"version_number":3,...}}

# 5) 查看接续演出：承接流水标来源，未执行提示按新版依赖计算
curl http://localhost:3000/api/performances/7
# continuation.from = {performance_id:1, version_number:1,...}
# events 中承接项：{"action":"fired","source":"carried",
#                  "carried_from_performance_id":1,"carried_from_event_id":1, ...}
# cues[]：承接提示 status=fired/skipped；未执行提示按新 deps 计算 pending/blocked
# continue_targets：同场次更高已发布版本（为空则前端接续面板提示先发布新版）
```

目标版本不合法时的状态码：不属于本场次 / 未发布 / 版本号不更高 → 400（含中文原因）；版本不存在 → 404；缺 `operator` → 400。

## 现场成组连续处置（本轮新增）

现场需要按顺序连续处置多条提示（例如开场段落一次处理多个 cue）时，不必逐条点按钮：舞台监督在执行台顶部「📋 成组连续处置」面板按现场顺序添加清单，每项选择**编号**与**触发 / 跳过 / 撤回**并填写跳过 / 撤回原因（触发无需原因），复用顶部「操作人」作为本组操作人。

**规则**

- 仅在**当前可操作（active）演出**上可用；只读（已接续）演出拒绝预览与提交（409，附接续演出位置）
- 整组结构校验（不通过直接 400，不进入逐项判定）：本组操作人必填；`items` 为非空数组（上限 500 项）；每项编号非空、动作仅可为 `fire/skip/retract`；**同一编号在清单中不得重复**
- **逐项预览（只读）**：按清单顺序逐项判定，每一步基于**前面步骤产生的有效结果**计算——前面步骤触发的提示满足后续前置、前面步骤撤回的提示使下游重新受阻、撤回的下游保护同样把同组前序步骤计入。返回每项的通过情况或失败原因（含序号、编号），以及 `can_submit`；预览不写任何数据
- 单项规则在逐项判定中完全一致：前置未全部已触发 → 422（列出未满足编号）；已有有效结果 → 409（附当前结果）；撤回仅对有效「已触发」可用，已跳过 / 未触发拒绝，且沿前置关系可达的下游仍有有效「已触发」时拒绝（附 `affected`）；待复核申请期间该提示拒绝触发 / 跳过 / 撤回；跳过与撤回原因必填（400）
- **需双人复核的提示不得在成组中直接触发**：该步直接失败并提示去单项「申请触发」；成组操作不会登记复核申请，申请—确认仍只能走单项接口（对复核提示执行跳过不受此限，规则与单项一致）
- **整组提交**：在 `BEGIN IMMEDIATE` 事务内**按最新状态重新逐项判定**（不信任此前预览），与单项操作、接续相互串行；全部通过才按清单顺序依次写入 `manual` 流水，字段、操作人、原因与单项操作完全一致；任一项失败则整体回滚、**整组不产生任何流水**，响应给出首个失败的序号 / 编号 / 原因，并在 `results` 中给出全部逐项判定（含 400/409/422 状态），状态码取首个失败项语义（含前置失败为 422，其余为 409/400）
- 原有触发 / 跳过 / 撤回 / 复核 / 接续接口路径、请求体与响应结构均未改变

**调用示例**（假设演出 id=2，版本中 L1→S1→B1 依次为前置关系）：

```bash
# 1) 逐项预览（不改数据）：链式前置 + 跳过原因 + 复核限制一次看清
curl -X POST http://localhost:3000/api/performances/2/batch/preview \
  -H 'Content-Type: application/json' \
  -d '{"operator":"王监","items":[
        {"label":"L1","action":"fire"},
        {"label":"S1","action":"skip","reason":"设备故障，跳过开场音乐"},
        {"label":"S2","action":"fire"},
        {"label":"B2","action":"fire"}
      ]}'
# → 200
# {
#   "can_submit": false, "success_count": 1, "failure_count": 3,
#   "results": [
#     {"index":1,"label":"L1","action":"fire","ok":true,"planned":true},
#     {"index":2,"label":"S1","action":"skip","ok":true,"planned":true,"reason":"设备故障，…"},
#     {"index":3,"label":"S2","action":"fire","ok":false,"status":422,
#      "error":"前置提示未触发，无法触发：B1","unmet":["B1"]},
#     {"index":4,"label":"B2","action":"fire","ok":false,"status":409,
#      "error":"该提示需双人复核，不能在成组操作中直接触发；请先在执行台发起触发申请…"}
#   ]
# }

# 2) 全部可执行的清单整组提交：事务内重判通过后依次落流水
curl -X POST http://localhost:3000/api/performances/2/batch \
  -H 'Content-Type: application/json' \
  -d '{"operator":"王监","items":[
        {"label":"L1","action":"fire"},
        {"label":"S1","action":"fire"},
        {"label":"B1","action":"fire"}
      ]}'
# → 200 {"submitted":true,"success_count":3,"failure_count":0,
#        "results":[{"index":1,"label":"L1","ok":true,"event":{"id":21,"action":"fired",...}}, ...]}

# 3) 提交瞬间被并发单项操作抢先 / 某步前置失效：整组回滚、零流水，并指出失败项
# → 409 {"error":"成组操作未执行：第 2 项（编号 B1）前置提示未触发，无法触发：S1。整组均未生效、无流水产生…",
#        "success_count":0,"failure_count":2,
#        "results":[{"index":1,"label":"L1","ok":false,"status":409,"error":"该提示已有结果：…","current":{…}},
#                   {"index":2,"label":"B1","ok":false,"status":422,"error":"前置提示未触发，无法触发：S1","unmet":["S1"]}]}

# 4) 结构错误：空清单 / 重复编号 / 非法动作 → 400
# {"error":"第 2 项：编号「L1」在本组清单中重复，每个编号只能出现一次"}

# 5) 只读演出：预览与提交统一 409（附 readonly 与接续演出位置）
```

执行台「📋 成组连续处置」面板支持编号自动补全（datalist）、动作切换后原因栏自动启停；「逐项预览」结果在表格中按序号列出 ✓ / ✗ 与原因，「整组提交」前自动再预览一次，服务端事务内还会最终重判，成功后自动刷新提示卡片与流水。页面 2.5 秒轮询重绘不会打断正在填写的清单（焦点与光标位置保留）。

## 现场设备故障登记与解除（本轮新增）

现场设备故障时，舞台监督在**当前可操作演出**中按**提示编号**登记故障并填写**操作人与原因**；系统沿已发布执行单的**前置关系**标出故障提示本身及所有依赖它的后续提示。故障不删除、不改写任何既有执行流水，是独立的登记 / 解除留痕。

**登记规则**

- 仅在当前**可操作（active）**演出上可登记；只读（已接续）演出登记与解除均 409（附接续演出位置）
- 编号必须属于该演出锁定的已发布执行单，否则 404；`operator` 或 `reason` 为空 → 400
- 同一编号存在**未解除**故障时拒绝重复登记（409，附当前故障）；一条故障解除后该编号可再次登记
- 登记响应返回故障记录与 `affected_labels`：故障编号本身 + 沿 `deps` 反向可达的全部后续提示（传递依赖也包含），按执行单序号排列
- **登记故障不改写既有执行流水**：已触发 / 已跳过的提示维持原结果，执行流水一条不变

**故障期间的现场判定（全部按最新故障状态）**

- 受影响提示（含故障编号本身）**不得触发**：单项触发、双人复核的**确认**、成组预览与成组提交中的触发统一判 422，响应附 `blocked_by_faults`（故障编号、登记人、原因、登记时间）
- **双人复核申请保留但不得确认**：故障期间仍可对需复核提示发起申请（申请不是触发）；待处理申请不会丢失，确认被拒（422）且保持待复核，故障解除后按当时前置结果再判定
- **跳过与撤回仍完全遵守原有规则**，不受故障影响：受影响提示可填原因跳过；撤回仍要求当前已触发且下游无有效已触发（下游保护照常）
- 单项触发、复核确认、成组预览 / 提交、故障登记 / 解除、接续都在同一 `BEGIN IMMEDIATE` 事务级**串行判定**，按最新故障状态为准

**解除规则**

- 解除须记录**操作人与原因**（缺一则 400）；故障不存在 404、已解除 409、只读演出 409
- 解除后**依据当前有效结果重算提示状态**：不新增 / 改写任何执行流水；已触发（含承接）的提示继续满足下游前置，未执行提示恢复「待执行 / 受阻」
- 接续前若存在未解除故障则拒绝接续（409，冲突清单与 `active_faults` 列出故障编号与影响范围，原演出保持可操作）；已接续的只读演出不得登记或解除故障

执行台以「⚠ 现场设备故障」面板展示**故障影响范围**（故障源徽章 + 受影响编号 chips）与**处理记录**（登记 / 解除的操作人、时间、原因）；提示卡片对故障源显示「⚠ 设备故障」、对受影响提示显示「触发冻结」，并提供「⚠ 登记故障」快捷按钮；顶部统计显示未解除故障数与冻结提示数。

**调用示例**（假设演出 id=2，版本中 L1→S1→B1，B1→R1）：

```bash
# 1) 登记故障：操作人 + 原因必填；返回故障记录及影响范围（故障编号本身 + 全部下游）
curl -X POST http://localhost:3000/api/performances/2/cues/14/faults \
  -H 'Content-Type: application/json' \
  -d '{"operator":"王监","reason":"功放烧毁无输出"}'
# → 200
# {
#   "fault": {
#     "id": 3, "performance_id": 2, "cue_id": 14, "status": "active",
#     "label": "S1", "reported_by": "王监", "reason": "功放烧毁无输出",
#     "reported_at": "2026-10-02T19:30:10.000Z",
#     "resolved_by": null, "resolved_at": null, "resolve_reason": null,
#     "affected_labels": ["S1", "B1", "R1"]
#   }
# }

# 2) 登记校验：空信息 / 编号不属于该演出 / 已有未解除故障
# → 400 {"error":"登记故障必须填写原因"}
# → 404 {"error":"该提示不属于此演出使用的版本"}
# → 409 {"error":"提示「S1」已有未解除故障（登记人 王监，时间 …），请先解除后再登记","fault":{...}}

# 3) 故障期间受影响提示不得触发（单项 / 复核确认 / 成组同样判定）
curl -X POST http://localhost:3000/api/performances/2/cues/14/fire \
  -H 'Content-Type: application/json' -d '{"operator":"张三"}'
# → 422
# {"error":"存在未解除的设备故障，受影响提示不得触发：「S1」故障（登记人 王监：功放烧毁无输出）。请先解除故障或改走跳过",
#  "blocked_by_faults":[{"fault_id":3,"label":"S1","reported_by":"王监","reason":"功放烧毁无输出","reported_at":"..."}]}

# 4) 跳过 / 撤回不受故障影响，仍遵守原有规则
curl -X POST http://localhost:3000/api/performances/2/cues/15/skip \
  -H 'Content-Type: application/json' -d '{"operator":"张三","reason":"音响故障，大幕手动处理跳过"}'
# → 200 {"event":{"action":"skipped",...}}

# 5) 需复核提示：申请可登记、确认被阻断且申请保留
curl -X POST http://localhost:3000/api/performances/2/cues/17/fire \
  -H 'Content-Type: application/json' -d '{"operator":"张三"}'
# → 200 {"request":{"status":"pending",...}}
curl -X POST http://localhost:3000/api/performances/2/review-requests/4/confirm \
  -H 'Content-Type: application/json' -d '{"operator":"李四"}'
# → 422 {"error":"该提示受未解除的设备故障影响，故障解除前不能确认触发，申请保持待复核：「S1」（功放烧毁无输出）",
#        "blocked_by_faults":[...], "request":{...}}   # request.status 仍为 pending

# 6) 成组预览 / 提交：受影响编号的触发逐项判 422，提交整组不留流水
curl -X POST http://localhost:3000/api/performances/2/batch/preview \
  -H 'Content-Type: application/json' \
  -d '{"operator":"王监","items":[{"label":"S1","action":"fire"}]}'
# → 200 {"can_submit":false,"results":[{"index":1,"label":"S1","ok":false,"status":422,
#        "blocked_by_faults":[...],"error":"存在未解除的设备故障，受影响提示不得触发：…"}]}

# 7) 解除故障：操作人 + 原因必填；之后按当前有效结果重算（无流水改动）
curl -X POST http://localhost:3000/api/performances/2/faults/3/resolve \
  -H 'Content-Type: application/json' \
  -d '{"operator":"王监","reason":"已更换功放并试音正常"}'
# → 200
# {"fault":{"id":3,"status":"resolved","resolved_by":"王监",
#           "resolved_at":"...","resolve_reason":"已更换功放并试音正常","affected_labels":[]},
#  "remaining_active_faults":[],"still_blocked_labels":[]}

# 8) 执行台状态：故障处理记录 + 每提示故障字段
curl http://localhost:3000/api/performances/2
# {
#   "active_fault_count": 0,
#   "faults": [
#     {"id":3,"status":"resolved","label":"S1","reported_by":"王监","reason":"功放烧毁无输出",
#      "reported_at":"...","resolved_by":"王监","resolved_at":"...",
#      "resolve_reason":"已更换功放并试音正常","affected_labels":[]}
#   ],
#   "cues": [
#     {"label":"S1","status":"pending",
#      "fault_blocked":[],"fault_blocked_labels":[],"own_fault":null, ...},
#     ...
#   ]
# }
# 故障未解除时，受影响提示形如：
#   {"label":"B1","fault_blocked_labels":["S1"],
#    "fault_blocked":[{"fault_id":3,"label":"S1","reported_by":"王监","reason":"...","reported_at":"..."}],
#    "own_fault":null}
# 故障源提示 own_fault 为该故障的精简结构，且自身也在 fault_blocked_labels 中（含自身编号）

# 9) 接续前有未解除故障：核对不通过、拒绝接续，原演出保持可操作
# → 409 {"error":"接续核对未通过，请按冲突清单处理后重试",
#        "conflicts":[{"label":"S1","reasons":["存在未解除的设备故障，接续前须先解除并记录操作人与原因"]}],
#        "active_faults":[{"label":"S1","affected_labels":["S1","B1","R1"],...}], ...}

# 10) 只读（已接续）演出：登记 / 解除统一 409（附 readonly 与接续演出位置）
```

## 现场换班交接（本轮新增）

现场换班时，舞台监督在**当前可操作演出**填写交班人、接班人与交接说明，生成一张**待签收交接单**；交接期间现场操作照常进行，接班人按最新状态逐项核对无误后签收，签收记录成为不可变历史。

**规则**

- 交班人、接班人均必填且**不能为同一人**（400）；交接说明可选。仅当前**可操作（active）**演出可提交，只读（已接续）演出 409
- **同一演出只保留一张待签收单**（数据库部分唯一索引 `WHERE status='pending'` 保证）；再次提交时：
  - 须由**原交班人**用同一姓名重提——旧单置为 `superseded`（标记替换时间、指向新单，全量留痕），同时写入以当前状态固定的**新快照**；
  - 非原交班人重提返回 409（附当前待签收单）。
- **快照固定内容**（提交 / 重提瞬间在写事务内读取）：
  - 各提示当前有效结果（已触发 / 已跳过 / 未完成）与对应操作人、时间；
  - **最新流水位置**（`cue_events` 最大 id）；
  - 全部**待复核申请**（含已处置状态，另列待处理明细）；
  - **未解除故障**（登记人、原因、沿前置关系计算的影响范围）；
  - **尚未完成的提示**及阻塞原因：`blocked`（前置未触发，附未满足编号）、`review_pending`（待复核申请未处置）、`own_fault`（本提示故障）、`fault_blocked`（受其他故障影响触发冻结）、`pending`（待执行）。
- **交接期间现场操作照常**：交接单不冻结触发 / 跳过 / 撤回 / 复核 / 成组 / 故障 / 接续等任何接口。
- **签收核对**：接班人签收时在 `BEGIN IMMEDIATE` 事务内按最新状态**逐项比对**快照，差异分五组返回——
  1. `event_position` 最新流水位置变化（交接后新增了任意流水）；
  2. `cue_results` 某提示有效结果变化（未完成→已触发 / 已跳过、已触发被撤回等）；
  3. `review_requests` 快照中的申请已确认 / 撤销 / 驳回，或出现新申请；
  4. `active_faults` 快照中的故障已解除，或登记了新故障；
  5. `pending_cues` 尚未完成提示的**阻塞原因**变化（如前置补齐、故障解除、新增待复核）。

  任一差异存在即返回 **409** 与 `groups`（分组）/ `diffs`（打平清单），**交接单保持待签收**，交班人可据此重提替换快照；差异为 0 才签收成功（`signed`，记录 `signed_at`），签收后不可再修改，成为不可变历史；签收完成后同一演出可发起**新一轮**交接。
- **签收人身份**：只有接班人本人可签收；交班人本人签收、其他人签收均 409；对已签收单重复签收 409（提示如需再次换班请重新发起）。
- **与接续的关系**：接续成功时原演出的待签收交接单随原演出一并**自动作废**（置 `superseded` 留痕）；接续后的只读演出只能回看交接单及其快照，**不能提交、重提或签收**；接续演出是新的演出，交接历史不跨演出继承。
- 交接提交、重提、签收与现场操作、复核处置、故障登记 / 解除、接续都在同一事务级**串行判定**；既有接口路径、请求体与响应结构保持兼容（GET 仅新增 `handover` / `handover_history` 字段）。

**调用示例**（假设演出 id=1；演示数据中 L1 已触发、S1 已跳过）：

```bash
# 1) 交班人提交交接单（两人非空且不同；快照当场固定）
curl -X POST http://localhost:3000/api/performances/1/handover \
  -H 'Content-Type: application/json' \
  -d '{"handed_by":"张三","received_by":"李四","note":"开场段完成，B1 前置 S1 已跳过，注意 B2 需双人复核"}'
# → 200
# {
#   "replaced_handover_id": null,
#   "handover": {
#     "id": 1, "status": "pending", "handed_by": "张三", "received_by": "李四",
#     "note": "…", "created_at": "…",
#     "snapshot": {
#       "latest_event_id": 2,
#       "cue_results": [
#         {"label":"L1","status":"fired","operator":"张三", ...},
#         {"label":"S1","status":"skipped","operator":"李四", ...},
#         {"label":"B1","status":null, ...}, ...
#       ],
#       "pending_requests": [],
#       "active_faults": [],
#       "pending_cues": [
#         {"label":"B1","reason_codes":["blocked"],
#          "reason_text":"受阻：前置未触发（S1）"},
#         {"label":"L2","reason_codes":["pending"],"reason_text":"待执行"},
#         {"label":"B2","reason_codes":["blocked"],
#          "reason_text":"受阻：前置未触发（B1、L2）"}
#       ]
#     },
#     "live_diff": {"matched": true, "diff_count": 0, "groups": {…5 组…}}
#   }
# }

# 2) 参数校验
curl -X POST http://localhost:3000/api/performances/1/handover \
  -H 'Content-Type: application/json' -d '{"handed_by":"张三","received_by":"张三"}'
# → 400 {"error":"交班人与接班人不能为同一人"}

# 3) 交接期间现场照常操作（例如触发 L2）
curl -X POST http://localhost:3000/api/performances/1/cues/4/fire \
  -H 'Content-Type: application/json' -d '{"operator":"赵六"}'
# → 200 {"event":{…}}   交接单不冻结现场

# 4) 接班人签收前可先只读核对（也可直接签收，服务端同样会核对）
curl -X POST http://localhost:3000/api/performances/1/handover/check \
  -H 'Content-Type: application/json' -d '{}'
# → 200 {"matched": false, "diff_count": 2,
#        "groups": {"event_position":[{"message":"最新流水位置已变化：快照固定为第 2 条，当前为第 3 条", …}],
#                   "cue_results":[{"label":"L2","message":"提示「L2」有效结果已变化：未完成 → 已触发", …}],
#                   "review_requests": [], "active_faults": [], "pending_cues": []},
#        "diffs": [ {"section":"event_position", …}, {"section":"cue_results", …} ]}

# 5) 交班人本人 / 其他人签收 → 拒绝
curl -X POST http://localhost:3000/api/performances/1/handover/sign \
  -H 'Content-Type: application/json' -d '{"operator":"张三"}'
# → 409 {"error":"交班人本人不能签收交接单：签收人须为接班人 李四", "expected_received_by":"李四"}

# 6) 接班人在有差异时签收 → 409 返回差异，交接单保持待签收
curl -X POST http://localhost:3000/api/performances/1/handover/sign \
  -H 'Content-Type: application/json' -d '{"operator":"李四"}'
# → 409
# {"error":"交接单核对未通过：自 … 提交以来现场已有 2 项与快照不一致，交接单保持待签收；请逐项核对差异，由交班人 张三 重提替换快照后再签收",
#  "matched": false, "diff_count": 2, "groups": {…}, "diffs": [ … ], "handover": { …保持 pending… }}

# 7) 交班人据此重提（必须为原交班人；旧单作废留痕、替换为新快照；接班人 / 说明可调整）
curl -X POST http://localhost:3000/api/performances/1/handover \
  -H 'Content-Type: application/json' \
  -d '{"handed_by":"张三","received_by":"李四","note":"更新：L2 已由赵六触发，目前待办 B1、S2、B2"}'
# → 200 {"replaced_handover_id": 1, "handover": {"id": 2, "status":"pending", …新快照 live_diff.matched=true…}}

# 非原交班人重提：
# → 409 {"error":"该演出已有待签收交接单（交班人 张三，提交时间 …），只能由原交班人重提以替换快照"}

# 8) 现场无变化，接班人本人签收 → 成功，不可变历史
curl -X POST http://localhost:3000/api/performances/1/handover/sign \
  -H 'Content-Type: application/json' -d '{"operator":"李四"}'
# → 200 {"handover": {"id": 2, "status": "signed", "signed_at": "…",
#                     "live_diff": {"matched": true, "diff_count": 0, …}}}

# 9) 重复签收 → 409；签收后可再发起新一轮交接（POST /handover 生成新待签收单）
# → 409 {"error":"该演出的交接单已签收（接班人 李四，签收时间 …），请勿重复签收；如需再次换班请重新发起交接"}

# 10) 执行台状态：当前待签收单（含快照与实时差异）+ 全部交接历史
curl http://localhost:3000/api/performances/1
# {
#   "handover": { …当前待签收单，含 snapshot 与 live_diff… } 或 null,
#   "handover_history": [
#     {"id":3,"status":"pending",  "handed_by":"李四","received_by":"钱七", …},
#     {"id":2,"status":"signed",   "handed_by":"张三","received_by":"李四","signed_at":"…"},
#     {"id":1,"status":"superseded","handed_by":"张三","received_by":"李四",
#      "superseded_at":"…","superseded_by_handover_id":2}
#   ]
# }
```

**接续后的只读演出**：待签收单在接续事务内自动置 `superseded`；对其调用提交 / 重提 / 签收统一 409（提交 / 重提返回既有只读错误并附接续演出位置，签收返回只读提示），交接单与快照在该演出中永久可回看。

## 演出封场结项（本轮新增）

演出结束时，舞台监督在**当前可操作演出**填写非空**结项人**与**封场说明**执行封场：系统按当前演出版本核对全部提示与遗留事项，通过后一次性固定一份**不可变封场结项报告**，演出随即转为终态 `closed`。

**封场前核对（按当前演出版本逐条）**

- 每条提示都必须有有效的**已触发或已跳过**结果；最新流水为 `retracted`（已撤回）或无流水的提示视为**未完成**，在 `incomplete_cues` 中**按编号**（附序号）列出
- 其余阻项**分类列出**，三类都必须为空：
  - `review_requests`：`pending` 待复核申请（先去确认 / 撤销 / 驳回；注意申请本身不算结果，对应提示仍需触发或跳过）
  - `active_faults`：未解除设备故障（先解除并记录操作人与原因）
  - `pending_handovers`：待签收交接单（先由接班人签收，或不再交接则由交班人重提后签收；未签收单不允许封场）
- 有任一阻项：封场返回 **409**，响应同时给出 `incomplete_cues` 与三类阻项及 `counts`（总数 / 已完成 / 未完成 / 已触发 / 已跳过）；**演出保持可操作，不产生任何报告或结项记录**，处理后可重新封场

**封场通过后一次性固定（同一事务原子提交）**

- 结项时间（`closed_at`）、结项人（`closed_by`）、封场说明（`note`）
- **最终提示结果**：逐条固定结果（fired/skipped）、**原操作人、原时间、本场流水 id 与来源演出**
- **承接结果沿接续链追溯原流水**：本场最终结果为 `source:"carried"` 时，按 `carried_from_event_id` 逐级回溯到最早一条现场 `manual` 流水，报告中给出：
  - 本场承接流水（`carried` / `carried_from_performance_id` / `carried_from_event_id`，保留原操作人与时间）
  - `origin`：原流水（原 `event_id`、原演出、原操作人、原时间、`source=manual`）
  - `carried_chain`：逐级来源清单（多级接续也能一路追溯到首场）
  - 承接结果**绝不算作本场再次触发**（报告 `summary` 区分 `manual_event_count` 与 `carried_event_count`）
- 同时固定本场全部流水（含撤回）、复核申请全量留痕、故障登记 / 解除留痕（封场时必无未解除）、交接单全量留痕（含已签收）与接续链
- 报告写入独立不可变表 `closure_reports`（一场一份，无任何更新 / 删除入口），演出置 `closed` 并回填 `closure_report_id`——写报告与状态翻转同一 `BEGIN IMMEDIATE` 事务提交，**不可能留下部分结项**

**终态约束**

- **已接续的只读演出（`readonly`）不能封场**（409）；需要结项时在当前可操作的接续演出上封场，链上每场分别结项
- 封场后（`closed`）该演出的**单项触发 / 跳过 / 撤回、成组预览 / 提交、复核申请与确认 / 撤销 / 驳回、故障登记 / 解除、交接提交 / 重提 / 签收、接续**等写操作统一拒绝（409，附 `closed:true` 与结项信息）；GET 回看与封场报告查看不受影响
- **重复封场拒绝**（409）；对已封场演出调用封场前核对同样 409
- 封场核对 / 封场与全部现场写操作在同一事务级**串行判定**：封场提交瞬间仍会重读最新状态重跑核对，排队期间的现场变化（如新登记故障、新增待复核申请、某提示被撤回）都会被捕获，有阻项整体回滚
- 执行台在已封场演出顶部展示「🔒 已封场 · 结项」与结项信息，下方展示不可变封场报告；场次页演出记录标注「已封场 · 结项」。启动方式（`npm start` / Docker）与既有接口保持兼容

**调用示例**（假设演出 id=1，已完成全部提示；演示数据初始为 L1 已触发、S1 已跳过）：

```bash
# 1) 封场前只读核对：未完成提示按编号、其余阻项分类；此时演出不受任何影响
curl -X POST http://localhost:3000/api/performances/1/close/preview \
  -H 'Content-Type: application/json' -d '{}'
# 有阻项时：
# → 200
# {
#   "can_close": false,
#   "incomplete_cues": [
#     {"cue_id":3,"label":"B1","seq":3},
#     {"cue_id":4,"label":"L2","seq":4},
#     {"cue_id":5,"label":"S2","seq":5},
#     {"cue_id":6,"label":"B2","seq":6}
#   ],
#   "review_requests": [],
#   "active_faults": [
#     {"fault_id":3,"cue_id":1,"label":"L1","reported_by":"王监","reason":"功放烧毁","reported_at":"…"}
#   ],
#   "pending_handovers": [
#     {"handover_id":1,"handed_by":"张三","received_by":"李四","created_at":"…"}
#   ],
#   "counts": {"total":6,"completed":2,"incomplete":4,"fired":1,"skipped":1}
# }

# 2) 有阻项时执行封场 → 409，演出保持 active，数据库无报告
curl -X POST http://localhost:3000/api/performances/1/close \
  -H 'Content-Type: application/json' \
  -d '{"closed_by":"王监","note":"全剧终，设备清点正常撤场"}'
# → 409
# {"error":"封场核对未通过：存在未完成提示或其他阻项，演出保持可操作，未生成封场报告；请按编号处理后重试",
#  "incomplete_cues":[…按编号…], "review_requests":[…], "active_faults":[…], "pending_handovers":[…], "counts":{…}}

# 3) 参数缺失
# → 400 {"error":"请填写结项人"}
# → 400 {"error":"请填写封场说明"}

# 4) 处理完所有阻项（示例：L2 触发，其余跳过；B2 先撤复核申请再跳过；故障解除；交接签收）后核对通过
# → 200 {"can_close":true,"incomplete_cues":[],"review_requests":[],"active_faults":[],"pending_handovers":[],
#        "counts":{"total":6,"completed":6,"incomplete":0,"fired":2,"skipped":4}}

# 5) 执行封场：一次性固定不可变报告，演出转为 closed
curl -X POST http://localhost:3000/api/performances/1/close \
  -H 'Content-Type: application/json' \
  -d '{"closed_by":"王监","note":"全剧终，设备清点正常撤场"}'
# → 200
# {
#   "performance": {"id":1,"status":"closed","closed_at":"2026-10-02T20:00:00.000Z",
#                   "closed_by":"王监","closure_note":"全剧终…","closure_report_id":1},
#   "closure": {
#     "closed_at":"2026-10-02T20:00:00.000Z", "closed_by":"王监", "note":"全剧终…",
#     "report": { …见下… }
#   }
# }

# 6) 报告内容（cue_results 逐条固定最终结果与原操作人/时间/本场流水/来源演出）
# report.summary:
# {"cue_count":6,"fired_count":2,"skipped_count":4,"carried_result_count":0,
#  "event_count":6,"manual_event_count":6,"carried_event_count":0,"retracted_event_count":0,
#  "review_request_count":1,"pending_review_count":0,"fault_count":1,"active_fault_count":0,
#  "handover_count":1,"signed_handover_count":1}
# report.cue_results[] 形如：
# {"label":"L2","seq":4,"result":"fired","event_id":10,"operator":"张三","created_at":"…",
#  "source":"manual","carried":false,
#  "origin":{"event_id":10,"performance_id":1,"source":"manual","action":"fired","operator":"张三",…},
#  "carried_chain":[]}

# 7) 封场后查看报告（执行台与 HTTP API 均可；未封场 409）
curl http://localhost:3000/api/performances/1/closure-report
# → 200 {"performance_id":1,"closed_at":"…","closed_by":"王监","note":"…","report":{ …不可变… }}

# 8) 重复封场 / 封场后任何写操作 → 统一 409
curl -X POST http://localhost:3000/api/performances/1/close \
  -H 'Content-Type: application/json' -d '{"closed_by":"王监","note":"再封一次"}'
# → 409 {"error":"该演出已封场结项（结项时间 …，结项人 王监），不能重复封场；原记录与不可变封场报告可回看",
#        "closed":true,"closed_at":"…","closed_by":"王监"}
curl -X POST http://localhost:3000/api/performances/1/cues/4/fire \
  -H 'Content-Type: application/json' -d '{"operator":"张三"}'
# → 409 {"error":"该演出已封场结项（…），封场后单项 / 成组处置、复核、故障、交接及接续写操作均拒绝；原记录与不可变封场报告可回看",
#        "readonly":true,"closed":true,…}

# 9) 已接续的只读演出不能封场（须在当前可操作接续演出封场）
curl -X POST http://localhost:3000/api/performances/1/close \
  -H 'Content-Type: application/json' -d '{"closed_by":"王监","note":"x"}'
# → 409 {"error":"已接续的只读演出不能封场；如需结项请在当前可操作（接续）演出上封场",
#        "readonly":true,"closed":false}
```

**接续演出封场：承接结果追溯原流水**（演出 #1 →v2 接续为 #7，#7 封场）：

```bash
# #7 中 L1 为承接结果（本场流水 source=carried，指向 #2 那场的承接事件），
# 报告沿接续链一直追溯到 #1 的现场原 manual 流水：
curl http://localhost:3000/api/performances/7/closure-report
# report.cue_results 中 L1 形如：
# {
#   "label":"L1","result":"fired","carried":true,"source":"carried",
#   "event_id":31,                              # 本场（#7）承接流水
#   "operator":"张三","created_at":"原触发时间",  # 沿用原操作人/原时间
#   "carried_from_performance_id":2,"carried_from_event_id":24,
#   "origin": {                                 # 沿链追溯到的原流水
#     "event_id":1,"performance_id":1,"performance_name":"9月30日 晚场（进行中）",
#     "version_number":1,"source":"manual","action":"fired",
#     "operator":"张三","created_at":"最早触发时间"
#   },
#   "carried_chain": [                          # 逐级来源（#2 → #1）
#     {"performance_id":2,"event_id":24,"source":"carried", …},
#     {"performance_id":1,"event_id":1,"source":"manual", …}
#   ]
# }
# report.summary.carried_result_count 计入承接条数，但 manual_event_count 不含它们（非本场再次触发）
# report.continuation_chain: [演出 #7(v2), 演出 #1(v1)]
```

## 数据与并发说明

- `cue_events` 为**流水表**：触发 / 跳过 / 撤回逐条追加，全量留痕；同一演出同一提示的「当前有效结果」由最新一条事件推导（`retracted` 表示已撤回、当前无有效结果），至多一个当前有效结果。`source` 区分 `manual`（现场操作）与 `carried`（接续时自来源演出承接，附 `carried_from_performance_id` / `carried_from_event_id`，沿用原操作人与时间，非再次触发）
- `cue_review_requests` 为**复核申请表**：申请（申请人、时间）与处置（确认 / 撤销 / 驳回、处置人、时间、原因、关联的触发流水 `event_id`）全量留痕；`pending → confirmed / cancelled / rejected` 为终态迁移，同一提示至多一条待复核申请
- `cue_faults` 为**现场设备故障表**：登记（编号、登记人、原因、时间）与解除（解除人、时间、原因）全量留痕，`active → resolved` 终态迁移；部分唯一索引 `WHERE status='active'` 保证同一演出同一提示至多一条未解除故障。故障为独立记录，**不改写任何执行流水**；影响范围（故障编号本身 + 沿前置关系反向可达的全部下游）在读取时按版本依赖实时计算，解除后自然消失，提示状态按当前有效结果重算
- `cue_handovers` 为**现场换班交接表**：提交（交班人、接班人、说明、固定快照 JSON、时间）、签收（`signed_at`）、重提替换（`superseded` + `superseded_at` + `superseded_by_handover_id`）全量留痕，状态机 `pending → signed`（签收终态、不可变）或 `pending → superseded`（原交班人重提 / 接续作废旧单）。部分唯一索引 `WHERE status='pending'` 保证**同一演出至多一张待签收单**；快照只在提交 / 重提时写入，签收核对始终实时比对当前状态而不修改快照
- `closure_reports` 为**封场结项报告表**：封场核对通过后在同一事务一次性写入（结项人、说明、结项时间、完整 JSON 报告），此后**不可变**（无更新 / 删除入口）；`UNIQUE(performance_id)` 保证一场演出至多一份。报告固定每条提示的最终结果与原操作人 / 时间 / 本场流水 / 来源演出，其中承接结果（`source=carried`）在生成报告时沿 `carried_from_event_id` **逐级追溯到原 `manual` 流水**（`origin` 与 `carried_chain`），不作为本场再次触发；同时固定全部流水 / 复核 / 故障 / 交接留痕与接续链
- `performances` 记录接续与结项关系：`status` 三态 `active`（可现场操作）/ `readonly`（已接续只读）/ `closed`（已封场结项终态）；接续关系列为 `continued_from_performance_id` / `continued_at` / `continued_by`；结项列为 `closed_at` / `closed_by` / `closure_note` / `closure_report_id`（指向不可变报告）。接续演出绑定目标版本，原演出仍绑定原版本快照；`readonly` 与 `closed` 均为只读终态，区别是 readonly 仍可能作为接续链中的来源被回看，而 closed 已固定封场报告，二者都拒绝一切现场写操作
- 触发、跳过、撤回、复核处置、成组提交、**故障登记 / 解除**、**交接提交 / 重提 / 签收**、**接续**与**封场核对 / 封场**均在 `BEGIN IMMEDIATE` 事务内「读最新事件 / 申请 / 故障 / 交接单 / 演出状态 → 判定 → 写入」，并发操作串行判定，后到的冲突请求收到对应错误与当前状态（操作人、时间、原因、故障清单、交接差异、接续演出位置、结项信息）。**封场事务内先插入不可变报告、再翻转演出状态，二者同提交同回滚，不可能留下部分结项**；有阻项时整体回滚，演出保持可操作且无报告。交接单本身**不冻结任何现场操作**：交接期间触发 / 跳过 / 撤回 / 复核 / 成组 / 故障照常，变化只在签收核对时体现为差异。未解除故障只冻结受影响提示的**触发**（含复核确认），跳过与撤回按原有规则判定；成组提交在事务内对整组清单**重新逐项判定**，任一项失败整体回滚（含同组已拟写入项），因此成组提交不可能只落一半流水；成组预览为只读快照判定（Node 单线程同步读，不穿插写操作），不写任何数据
- 前置是否满足、提示状态（待执行/已触发/已跳过/受阻）均按**当前有效结果**计算：前置被撤回后，未执行的下游提示重新变为受阻；复核确认时同样按当前有效结果判定，前置失效或存在故障则确认拒绝且申请保持待复核；接续后未执行提示一律按**新版依赖**重算（承接的已触发计入满足）
- 封场核对覆盖**当前演出版本的每一条提示**：有效结果只认最新事件为 fired/skipped（retracted / 无事件即未完成，按编号列出）；另要求当前无 pending 复核申请、无 active 故障、无 pending 交接单。承接结果不在本场重算触发，而是按 `carried_from_event_id` 沿**整条接续链**追溯最早的现场 manual 流水作为原操作人 / 时间 / 流水 / 来源演出
- 接续前的按编号核对覆盖**整条接续链**（当前演出 + 逐级来源演出）：任一环节有触发 / 跳过 / 撤回流水、复核申请或承接结果的编号都须在新版保留其编号、类型、描述、前置集合与复核标记，且当前无待处理申请，否则整体拒绝并按编号返回原因
- 旧版数据库启动时自动迁移：`cue_events` 唯一约束表重建为流水表、`cues` 补 `needs_review` 列（既有提示默认 0，按无需复核处理），`performances` 补 `status / continued_from_performance_id / continued_at / continued_by` 列（既有演出默认 `active`），`cue_events` 补 `source / carried_from_*` 列（既有流水默认 `manual`），自动新建 `cue_faults` 故障登记表（含 active 部分唯一索引）与 `cue_handovers` 交接单表（含 pending 部分唯一索引）；本轮再为 `performances` 补 `closed_at / closed_by / closure_note / closure_report_id` 列并把 status CHECK 放宽为 `active/readonly/closed`（旧库整表重建、历史记录全部保留），同时新建不可变 `closure_reports` 表（`UNIQUE(performance_id)`），无需手工操作
- 演出与版本通过外键绑定，版本发布后无更新入口（含 `needs_review` 标记），因此历史回看永远呈现演出当时的执行单内容；接续只新建演出并把原演出置为只读，**不改动任何版本快照**
- 接续关系可在执行台顶部横幅与场次页演出记录中查看；只读演出仍可随时打开回看其流水、复核申请与当时版本
