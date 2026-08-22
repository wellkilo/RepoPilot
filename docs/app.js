const traceData = {
  input: {
    type: "INPUT",
    time: "PUBLIC",
    title: "GitHub Issue #3 定义了并发重放缺陷",
    copy: "Issue 给出公开基线、失败 CI、复现命令、七条验收标准和 pull_request_only 安全边界。",
    prev: "BASE 7c117e9",
    hash: "ISSUE #3 · OPEN"
  },
  decision: {
    type: "FAILING CI",
    time: "RUN 32444544920",
    title: "并发回归稳定得到两个不同 task ID",
    copy: "基线类型检查通过，只有 concurrent retry 用例失败；两个请求在 find/save 之间同时穿透。",
    prev: "ISSUE #3",
    hash: "CONCLUSION · FAILURE"
  },
  tool: {
    type: "PATCH",
    time: "COMMIT a215065",
    title: "Fixer 交付五文件幂等补丁",
    copy: "Types、Store、Processor、Tests 与 README 共同约束同 delivery 共享一个 in-flight creation。",
    prev: "BASE 7c117e9",
    hash: "5 FILES · +75 / -22"
  },
  approval: {
    type: "PULL REQUEST",
    time: "PR #4",
    title: "修复已进入 PR，合并仍由人类决定",
    copy: "PR #4 以故障基线为 base，状态 OPEN / CLEAN；未执行 merge、delete branch、force push 或权限修改。",
    prev: "COMMIT a215065",
    hash: "PR #4 · OPEN"
  },
  verified: {
    type: "CI RESULT",
    time: "RUN 32444690068",
    title: "Verifier 确认 7 个测试与类型检查通过",
    copy: "并发同 ID、顺序重试和不同 ID 负对照全部通过。GitHub Actions 结论为 SUCCESS。",
    prev: "PR #4",
    hash: "CI SUCCESS · PR OPEN"
  }
};

const demoModes = {
  scenario: {
    runKind: "PUBLIC ISSUE → PR · EXTERNALLY VERIFIABLE",
    repository: "wellkilo/repopilot-testbed · Issue #3 → PR #4",
    fileSummary: "5 FILES",
    runStatus: "CI PASSED · PR OPEN",
    disclosure:
      "Issue、失败基线、修复提交、CI 和 PR 均可在 GitHub 核验；Agent 交接是依据这些公开产物构建的确定性流程回放。",
    chain: "8 EVIDENCE STEPS · PR #4 OPEN",
    playLabel: "播放 Issue → PR",
    outcomes: [
      ["5", "Agent 职责隔离", "Lead → Locator → Fixer → Verifier → Archivist"],
      ["5 files", "公开 PR 补丁", "Types + Store + Processor + Tests + Docs"],
      ["7 / 7", "回归测试通过", "Concurrent · sequential · negative control"],
      ["PR ONLY", "自治安全边界", "Merge remains human-controlled"]
    ],
    steps: [
      {
        label: "Issue",
        caption: "公开输入",
        owner: "REPO LEAD",
        agent: "lead",
        status: "ISSUE ACCEPTED",
        title: "Issue #3：重复 webhook 创建两个维护任务",
        copy: "公开 Issue 给出故障分支、失败 CI、复现命令和七条验收标准。流程策略锁定为 pull_request_only。",
        evidence: "01 · GitHub Issue #3",
        artifact: "Issue #3 · OPEN",
        boundary: "PR only",
        changeSummary: "public source · 7 criteria",
        terminalLabel: "github://issues/3",
        log: "repopilot-testbed#3 · policy pull_request_only · OPEN",
        proofCount: "01 / 08",
        proof: [
          ["done", "Issue #3 已创建"],
          ["next", "等待失败基线"],
          ["next", "等待五文件补丁"],
          ["next", "等待绿色 PR"]
        ],
        gateTitle: "MERGE LOCKED",
        gateCopy: "系统可创建 PR，但不能自行合并。",
        files: [
          {
            label: "issue-3.md",
            code: `Symptom:
same GitHub delivery → two maintenance tasks

Acceptance:
✓ same taskId
✓ one newlyCreated result
✓ one stored task
✓ one dispatch
✓ sequential retry remains idempotent
✓ different delivery IDs stay independent
✓ typecheck + tests pass`
          }
        ]
      },
      {
        label: "Triage",
        caption: "建立验收",
        owner: "REPO LEAD",
        agent: "lead",
        status: "ACCEPTANCE LOCKED",
        title: "把 Issue 拆成可独立验证的任务 DAG",
        copy: "Repo Lead 将任务拆为并发复现、竞态定位、原子去重、负对照验证和 PR 交付；Fixer 在根因证明前不写代码。",
        evidence: "02 · Acceptance DAG",
        artifact: "Issue #3 criteria",
        boundary: "Lead cannot patch",
        changeSummary: "5 tasks · 1 human gate",
        terminalLabel: "agentteams://project/replay-guard",
        log: "Lead → Locator · reproduce concurrency before authoring patch",
        proofCount: "02 / 08",
        proof: [
          ["done", "Issue 输入已固化"],
          ["done", "验收标准已拆解"],
          ["next", "Locator 复现并发"],
          ["next", "Fixer 等待证据"]
        ],
        gateTitle: "PATCH LOCKED",
        gateCopy: "根因未证明前，Fixer 不获得写权限。",
        files: [
          {
            label: "acceptance.md",
            code: `Concurrent duplicate delivery:
✓ same task ID
✓ one stored task
✓ one dispatch

Negative controls:
✓ sequential retry
✓ different delivery IDs

Forbidden:
merge · force push · secret change`
          }
        ]
      },
      {
        label: "Locate",
        caption: "证明竞态",
        owner: "LOCATOR",
        agent: "locator",
        status: "RACE REPRODUCED",
        title: "先 find 后 save 的异步窗口允许两个请求穿透",
        copy: "Locator 在公开基线提交 7c117e9 上运行 Promise.all。类型检查和旧测试通过，只有同 delivery 并发重试返回两个不同 task ID。",
        evidence: "03 · Failing CI",
        artifact: "Run 32444544920",
        boundary: "Read-only analysis",
        changeSummary: "TOCTOU window found",
        terminalLabel: "github-actions://32444544920",
        log: "typecheck PASS · 4 tests PASS · concurrent retry FAIL",
        proofCount: "03 / 08",
        proof: [
          ["done", "失败 CI 已公开"],
          ["done", "竞态窗口已定位"],
          ["done", "其他测试保持通过"],
          ["next", "Fixer 准备跨层补丁"]
        ],
        gateTitle: "WRITE SCOPED",
        gateCopy: "仅允许修改幂等链路和对应测试。",
        files: [
          {
            label: "race.log",
            code: `delivery=delivery-issue-42
request A  find → empty
request B  find → empty
request A  save → task-a
request B  save → task-b

dispatches: 2   expected: 1`
          },
          {
            label: "processor.ts",
            code: `const existing = await store.find(deliveryId);
if (existing) return existing;

await Promise.resolve(); // race window

await store.save(task);
await dispatchTask(task);`
          }
        ]
      },
      {
        label: "Types",
        caption: "明确契约",
        owner: "FIXER",
        agent: "fixer",
        status: "RESULT TYPED",
        title: "创建或复用的结果先进入类型契约",
        copy: "Fixer 新增 StoredTaskResult，明确返回 task 与 newlyCreated；Processor 不再猜测 Store 是否发生创建。",
        evidence: "04 · Patch contract",
        artifact: "src/webhooks/types.ts",
        boundary: "No API expansion",
        changeSummary: "+ StoredTaskResult",
        terminalLabel: "patch://types.ts",
        log: "contract added · task + newlyCreated",
        proofCount: "04 / 08",
        proof: [
          ["done", "根因证据已关联"],
          ["done", "返回契约已显式化"],
          ["next", "Store 原子化处理中"],
          ["next", "回归测试待执行"]
        ],
        gateTitle: "MERGE LOCKED",
        gateCopy: "类型改动仍只能进入 Pull Request。",
        files: [
          {
            label: "types.ts",
            code: `+ export interface StoredTaskResult {
+   task: MaintenanceTask;
+   newlyCreated: boolean;
+ }`
          }
        ]
      },
      {
        label: "Store",
        caption: "原子去重",
        owner: "FIXER",
        agent: "fixer",
        status: "IN-FLIGHT DEDUP",
        title: "相同 delivery 共享一个 in-flight Promise",
        copy: "Store 将 create-or-reuse 收口为 getOrCreate。并发重试等待同一 creation；完成后的任务用于顺序重试，finally 保证清理 in-flight。",
        evidence: "05 · Store patch",
        artifact: "src/webhooks/store.ts",
        boundary: "Idempotent write",
        changeSummary: "+ getOrCreate",
        terminalLabel: "patch://store",
        log: "same delivery → shared Promise → same task ID",
        proofCount: "05 / 08",
        proof: [
          ["done", "已完成任务可复用"],
          ["done", "in-flight creation 可共享"],
          ["done", "finally 清理 pending 状态"],
          ["next", "Processor 接入契约"]
        ],
        gateTitle: "FORCE PUSH BLOCKED",
        gateCopy: "Fixer 只能推送非保护分支。",
        files: [
          {
            label: "store.ts",
            code: `const pending = inFlight.get(deliveryId);
if (pending) {
  const result = await pending;
  return { task: result.task, newlyCreated: false };
}

const creation = createTask()
  .then((task) => {
    tasks.set(deliveryId, task);
    return { task, newlyCreated: true };
  })
  .finally(() => inFlight.delete(deliveryId));`
          }
        ]
      },
      {
        label: "Processor",
        caption: "一次副作用",
        owner: "FIXER",
        agent: "fixer",
        status: "SIDE EFFECT GUARDED",
        title: "创建 task 与 dispatch 进入同一个原子工厂",
        copy: "Processor 把 task 创建和 dispatch 作为 getOrCreate 的 factory。只有首个请求执行 factory，所有重试只复用结果。",
        evidence: "06 · Processor patch",
        artifact: "src/webhooks/processor.ts",
        boundary: "One external write",
        changeSummary: "- find/save · + factory",
        terminalLabel: "patch://processor.ts",
        log: "one creation · one dispatch · shared result",
        proofCount: "06 / 08",
        proof: [
          ["done", "Store 幂等完成"],
          ["done", "dispatch 纳入原子工厂"],
          ["done", "重复请求复用 Promise"],
          ["next", "Verifier 独立执行"]
        ],
        gateTitle: "MERGE LOCKED",
        gateCopy: "补丁完成不等于允许合并。",
        files: [
          {
            label: "processor.ts",
            code: `return store.getOrCreate(
  delivery.deliveryId,
  async () => {
    const task = createTask(delivery);
    await dispatchTask(task);
    return task;
  }
);`
          }
        ]
      },
      {
        label: "Verify",
        caption: "并发回归",
        owner: "VERIFIER",
        agent: "verifier",
        status: "ALL GATES PASS",
        title: "7 个测试覆盖并发、顺序重试和不同 ID",
        copy: "Verifier 重放失败用例，并增加顺序 retry 与不同 delivery 并行作为负对照。GitHub Actions Run 32444690068 全绿。",
        evidence: "07 · Passing CI",
        artifact: "Run 32444690068",
        boundary: "Verifier cannot edit",
        changeSummary: "7 / 7 tests passed",
        terminalLabel: "github-actions://32444690068",
        log: "npm ci ✓ · typecheck ✓ · 7 tests ✓",
        proofCount: "07 / 08",
        proof: [
          ["done", "并发回归通过"],
          ["done", "顺序 retry 通过"],
          ["done", "不同 ID 负对照通过"],
          ["next", "生成可审查 PR"]
        ],
        gateTitle: "CHAIN VERIFIED",
        gateCopy: "Verifier 只签发结论，不能修改补丁。",
        files: [
          {
            label: "processor.test.ts",
            code: `const [first, second] = await Promise.all([
  processor.process(delivery),
  processor.process(delivery)
]);

expect(first.task.taskId)
  .toBe(second.task.taskId);
expect([first.newlyCreated, second.newlyCreated])
  .toEqual([false, true].sort());
expect(store.size()).toBe(1);
expect(dispatchTask).toHaveBeenCalledOnce();`
          },
          {
            label: "checks.log",
            code: `GitHub Actions Run 32444690068

npm ci              SUCCESS
npm run typecheck   SUCCESS
npm test            7 PASSED

Conclusion: SUCCESS`
          }
        ]
      },
      {
        label: "PR Gate",
        caption: "安全停靠",
        owner: "REPO LEAD + ARCHIVIST",
        agent: "archivist",
        status: "PR OPEN / CLEAN",
        title: "PR #4 已创建并保持 OPEN",
        copy: "PR #4 包含五文件、+75/-22、提交 a215065 和绿色 CI。它关联 Issue #3，但合并权仍由人类持有。",
        evidence: "08 · Pull Request #4",
        artifact: "PR #4 · OPEN",
        boundary: "Human merge only",
        changeSummary: "5 files · +75 / -22",
        terminalLabel: "github://pull/4",
        log: "PR #4 OPEN · CLEAN · CI SUCCESS · merge locked",
        proofCount: "08 / 08",
        proof: [
          ["done", "Issue #3 可追溯"],
          ["done", "提交 a215065 可核验"],
          ["done", "绿色 CI 已关联"],
          ["done", "PR #4 保持 OPEN"]
        ],
        gateTitle: "HUMAN APPROVAL REQUIRED",
        gateCopy: "RepoPilot 在 PR 处停止，不自动合并。",
        files: [
          {
            label: "pr-summary.md",
            code: `PR #4
Deduplicate concurrent GitHub webhook retries

Files: 5
Diff: +75 / -22
Commit: a215065
CI: 32444690068 · SUCCESS

Status: READY FOR HUMAN REVIEW
Merge: LOCKED`
          },
          {
            label: "runbook.md",
            code: `Rule:
Idempotency must cover both task creation
and downstream dispatch.

Verify:
concurrent same ID + sequential retry
+ different-ID negative control.`
          }
        ]
      }
    ]
  },
  verified: {
    runKind: "VERIFIED RUN · EXTERNAL EVIDENCE",
    repository: "wellkilo/repopilot-testbed · Issue #1",
    fileSummary: "1 FILE",
    runStatus: "SUCCEEDED",
    disclosure:
      "该模式逐项回放真实 Run。PR #2、GitHub Actions Run 31793190761 与 16 条 Evidence 均可通过下方链接核验。",
    chain: "16 EVIDENCE · CHAIN VALID",
    playLabel: "播放真实 Run",
    outcomes: [
      ["5", "Agent 职责隔离", "Repo Lead + 4 specialists"],
      ["1 file", "最小补丁", "+1 / -1"],
      ["SUCCESS", "GitHub Actions", "typecheck + test"],
      ["OPEN", "Pull Request #2", "Clean · not auto-merged"]
    ],
    steps: [
      {
        label: "Issue",
        caption: "接收任务",
        owner: "REPO LEAD",
        agent: "lead",
        status: "INPUT ACCEPTED",
        title: "合法的 0 分被错误改写为 1 分",
        copy: "RepoPilot 读取 GitHub Issue，锁定执行策略为 pull_request_only，并把验收标准交给维护团队。",
        evidence: "01 · task_input",
        artifact: "Issue #1",
        boundary: "PR only",
        changeSummary: "verified source",
        terminalLabel: "source-context.json",
        log: "GitHub Issue #1 accepted · policy pull_request_only",
        proofCount: "01 / 16",
        proof: [
          ["done", "Webhook 验签通过"],
          ["next", "等待根因证据"],
          ["next", "等待补丁提交"],
          ["next", "等待 CI 结果"]
        ],
        gateTitle: "MERGE LOCKED",
        gateCopy: "真实 Run 同样不能自动合并。",
        files: [
          {
            label: "source.json",
            code: `{
  "repository": "wellkilo/repopilot-testbed",
  "issueNumber": 1,
  "executionPolicy": "pull_request_only"
}`
          }
        ]
      },
      {
        label: "Locate",
        caption: "证明根因",
        owner: "LOCATOR",
        agent: "locator",
        status: "ROOT CAUSE PROVED",
        title: "truthiness fallback 吞掉合法零分",
        copy: "Locator 复现目标测试并限定影响面：数值 0 是合法结果，但 result.score || 1 把它当成缺失值。",
        evidence: "06 · root_cause",
        artifact: "src/evaluation.ts",
        boundary: "Read-only analysis",
        changeSummary: "1 failing assertion",
        terminalLabel: "baseline-reproduction.log",
        log: "Expected score: 0 · Received score: 1",
        proofCount: "06 / 16",
        proof: [
          ["done", "目标失败已复现"],
          ["done", "根因已定位"],
          ["next", "等待最小补丁"],
          ["next", "等待独立验证"]
        ],
        gateTitle: "WRITE SCOPED",
        gateCopy: "Fixer 仅能修改目标逻辑。",
        files: [
          {
            label: "evaluation.ts",
            code: `return {
  score: result.score || 1
};`
          },
          {
            label: "failure.log",
            code: `Expected score: 0
Received score: 1

Tests: 1 failed, 4 passed`
          }
        ]
      },
      {
        label: "Patch",
        caption: "最小修复",
        owner: "FIXER",
        agent: "fixer",
        status: "MINIMAL PATCH",
        title: "只改一处回退运算符",
        copy: "Fixer 使用空值合并运算符保留 0，仅在 score 为 null 或 undefined 时回退；补丁范围为一个文件、+1/-1。",
        evidence: "09 · patch",
        artifact: "Commit dd67868d",
        boundary: "No force push",
        changeSummary: "+1 / -1",
        terminalLabel: "patch://src/evaluation.ts",
        log: "commit dd67868d · one file changed",
        proofCount: "09 / 16",
        proof: [
          ["done", "根因证据已关联"],
          ["done", "最小补丁已提交"],
          ["next", "Verifier 等待执行"],
          ["next", "CI 尚未签发结论"]
        ],
        gateTitle: "MERGE LOCKED",
        gateCopy: "提交补丁不代表允许合并。",
        files: [
          {
            label: "evaluation.ts",
            code: `- score: result.score || 1,
+ score: result.score ?? 1,`
          }
        ]
      },
      {
        label: "Verify",
        caption: "独立验证",
        owner: "VERIFIER",
        agent: "verifier",
        status: "CI SUCCESS",
        title: "类型检查与目标回归测试全部通过",
        copy: "Verifier 独立检查补丁；GitHub Actions Run 31793190761 的 test job 完成且结论为 SUCCESS。",
        evidence: "13 · verification",
        artifact: "CI 31793190761",
        boundary: "Verifier cannot edit",
        changeSummary: "3 checks passed",
        terminalLabel: "github-actions.log",
        log: "npm ci ✓  typecheck ✓  test ✓",
        proofCount: "13 / 16",
        proof: [
          ["done", "依赖安装通过"],
          ["done", "类型检查通过"],
          ["done", "目标回归通过"],
          ["next", "等待 PR 引用"]
        ],
        gateTitle: "CHAIN VALID",
        gateCopy: "验证者不能修改被验证补丁。",
        files: [
          {
            label: "checks.log",
            code: `npm ci              SUCCESS
npm run typecheck   SUCCESS
npm test            SUCCESS

Run 31793190761`
          }
        ]
      },
      {
        label: "PR",
        caption: "安全交付",
        owner: "FIXER + REPO LEAD",
        agent: "lead",
        status: "PR OPEN / CLEAN",
        title: "PR #2 已创建，但没有自动合并",
        copy: "系统交付可审查的 Pull Request，并在安全边界内停止。合并仍由人类决定。",
        evidence: "14 · pull_request",
        artifact: "PR #2",
        boundary: "No auto-merge",
        changeSummary: "OPEN · CLEAN",
        terminalLabel: "github://pull/2",
        log: "PR #2 open · merge state clean · auto-merge disabled",
        proofCount: "14 / 16",
        proof: [
          ["done", "分支已推送"],
          ["done", "PR #2 已创建"],
          ["done", "CI 关联完成"],
          ["next", "等待经验沉淀"]
        ],
        gateTitle: "HUMAN APPROVAL REQUIRED",
        gateCopy: "Pull Request 保持 OPEN。",
        files: [
          {
            label: "pull-request.json",
            code: `{
  "number": 2,
  "state": "OPEN",
  "mergeStateStatus": "CLEAN",
  "changedFiles": 1,
  "additions": 1,
  "deletions": 1
}`
          }
        ]
      },
      {
        label: "Archive",
        caption: "沉淀证据",
        owner: "ARCHIVIST",
        agent: "archivist",
        status: "CHAIN VALID",
        title: "16 条 Evidence 构成可回放证据链",
        copy: "任务输入、根因、补丁、Git 引用和 CI 结果全部关联到同一 Run 与 Trace；经验被整理为可复用规则。",
        evidence: "16 · runbook",
        artifact: "Run 11c63758",
        boundary: "Verified facts only",
        changeSummary: "16 records",
        terminalLabel: "evidence://run/11c63758",
        log: "Trace 332f8652f35d · Evidence 16 · CHAIN VALID",
        proofCount: "16 / 16",
        proof: [
          ["done", "任务输入已追溯"],
          ["done", "Git 引用已核验"],
          ["done", "CI 结果已记录"],
          ["done", "Runbook 已沉淀"]
        ],
        gateTitle: "RUN COMPLETE",
        gateCopy: "证据完整，PR 仍等待人工审查。",
        files: [
          {
            label: "runbook.md",
            code: `Rule:
Nullable numeric fields must not use
truthiness fallback.

Run: 11c63758
Trace: 332f8652f35d
Evidence: 16 · VALID`
          }
        ]
      }
    ]
  }
};

const loopData = [
  {
    owner: "CONTROL PLANE",
    title: "任务输入",
    copy: "接收 GitHub Issue、失败 Workflow Run 或 Pull Request。原始请求经过 HMAC-SHA256 验签，仓库必须命中 allowlist。",
    input: "Issue / Failed CI / PR / Policy",
    output: "Run ID + immutable source context",
    failure: "签名错误或仓库越界时立即拒绝"
  },
  {
    owner: "REPO LEAD",
    title: "任务拆解",
    copy: "Repo Lead 定义问题、风险等级与验收标准，再把 ready DAG 节点交给匹配的 Worker，而不是直接尝试修复。",
    input: "Source context + recalled runbooks",
    output: "Risk-ranked DAG + approval checkpoints",
    failure: "无法复现时创建澄清任务"
  },
  {
    owner: "AGENTTEAMS",
    title: "上下文传递",
    copy: "Matrix Room 传递可见协作信息，MinIO Task Workspace 保存共享文件；Project / Task 状态由工具持有。",
    input: "Task spec + evidence references",
    output: "Versioned shared context",
    failure: "同步失败时停止，不手工修补状态"
  },
  {
    owner: "SKILL + MCP",
    title: "工具调用",
    copy: "Agent 使用 Skill 决定调用条件，再通过 Streamable HTTP MCP 访问 GitHub、Evidence、Approval 与 Runbook。",
    input: "Typed tool arguments",
    output: "Structured tool result + audit record",
    failure: "外部写操作先检查幂等结果"
  },
  {
    owner: "VERIFIER",
    title: "结果验证",
    copy: "独立运行 before / after 复现、测试、lint、typecheck 与 GitHub Checks。CI pending 时返回 BLOCKED。",
    input: "Base SHA + patched SHA + acceptance criteria",
    output: "PASS / FAIL / BLOCKED + residual risk",
    failure: "区分历史失败与改动引入失败"
  },
  {
    owner: "EVIDENCE LEDGER",
    title: "证据沉淀",
    copy: "决策、工具结果、Git 引用和 CI 结果追加到 SHA-256 哈希链；PostgreSQL trigger 拒绝更新与删除。",
    input: "Canonical JSON payload",
    output: "payloadHash + previousHash + chainHash",
    failure: "链不连续时判定验证失败"
  },
  {
    owner: "HUMAN GATE",
    title: "审批与回滚",
    copy: "合并、删分支、破坏性回滚、权限或密钥修改必须人工确认；审批使用乐观锁并且只能消费一次。",
    input: "Action + risk + exact target",
    output: "Approved / rejected versioned decision",
    failure: "拒绝或过期时取消高风险动作"
  },
  {
    owner: "ARCHIVIST",
    title: "经验沉淀",
    copy: "最终结论被查重、脱敏并写入 Runbook。未来召回只作为上下文，仍需对当前仓库重新验证。",
    input: "Evidence chain + final verdict",
    output: "Reusable verified runbook",
    failure: "存储不可用时保留任务产物"
  }
];

const header = document.querySelector("[data-header]");
const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");

const setNavOpen = (open) => {
  navToggle?.setAttribute("aria-expanded", String(open));
  nav?.classList.toggle("is-open", open);
  document.body.style.overflow = open ? "hidden" : "";
};

navToggle?.addEventListener("click", () => {
  setNavOpen(navToggle.getAttribute("aria-expanded") !== "true");
});

nav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => setNavOpen(false));
});

window.addEventListener(
  "scroll",
  () => {
    header?.classList.toggle("is-scrolled", window.scrollY > 24);
  },
  { passive: true }
);

document.querySelectorAll("[data-trace-node]").forEach((node) => {
  node.addEventListener("click", () => {
    const key = node.dataset.traceNode;
    const data = traceData[key];
    if (!data) {
      return;
    }

    document.querySelectorAll("[data-trace-node]").forEach((candidate) => {
      const active = candidate === node;
      candidate.classList.toggle("is-active", active);
      candidate.setAttribute("aria-pressed", String(active));
    });

    const detail = document.querySelector("[data-trace-detail]");
    detail?.animate(
      [
        { opacity: 0.35, transform: "translateY(7px)" },
        { opacity: 1, transform: "translateY(0)" }
      ],
      { duration: 220, easing: "ease-out" }
    );

    document.querySelector("[data-trace-type]").textContent = data.type;
    document.querySelector("[data-trace-time]").textContent = data.time;
    document.querySelector("[data-trace-title]").textContent = data.title;
    document.querySelector("[data-trace-copy]").textContent = data.copy;
    document.querySelector("[data-trace-prev]").textContent = data.prev;
    document.querySelector("[data-trace-hash]").textContent = data.hash;
  });
});

const loopElements = {
  index: document.querySelector("[data-loop-index]"),
  owner: document.querySelector("[data-loop-owner]"),
  title: document.querySelector("[data-loop-title]"),
  copy: document.querySelector("[data-loop-copy]"),
  input: document.querySelector("[data-loop-input]"),
  output: document.querySelector("[data-loop-output]"),
  failure: document.querySelector("[data-loop-failure]")
};

document.querySelectorAll("[data-loop-step]").forEach((tab) => {
  tab.addEventListener("click", () => {
    const index = Number(tab.dataset.loopStep);
    const data = loopData[index];
    if (!data) {
      return;
    }

    document.querySelectorAll("[data-loop-step]").forEach((candidate) => {
      candidate.setAttribute("aria-selected", String(candidate === tab));
    });

    loopElements.index.textContent = String(index + 1).padStart(2, "0");
    loopElements.owner.textContent = data.owner;
    loopElements.title.textContent = data.title;
    loopElements.copy.textContent = data.copy;
    loopElements.input.textContent = data.input;
    loopElements.output.textContent = data.output;
    loopElements.failure.textContent = data.failure;

    document.querySelector("#loop-panel")?.animate(
      [
        { opacity: 0.4, transform: "translateX(10px)" },
        { opacity: 1, transform: "translateX(0)" }
      ],
      { duration: 240, easing: "ease-out" }
    );
  });
});

const demoElements = {
  runKind: document.querySelector("[data-demo-run-kind]"),
  repository: document.querySelector("[data-demo-repository]"),
  files: document.querySelector("[data-demo-files]"),
  runStatus: document.querySelector("[data-demo-run-status]"),
  disclosure: document.querySelector("[data-demo-disclosure]"),
  timeline: document.querySelector("[data-demo-timeline]"),
  owner: document.querySelector("[data-demo-owner]"),
  status: document.querySelector("[data-demo-status]"),
  title: document.querySelector("[data-demo-title]"),
  copy: document.querySelector("[data-demo-copy]"),
  evidence: document.querySelector("[data-demo-evidence]"),
  artifact: document.querySelector("[data-demo-artifact]"),
  boundary: document.querySelector("[data-demo-boundary]"),
  fileTabs: document.querySelector("[data-demo-file-tabs]"),
  editorLabel: document.querySelector("[data-demo-editor-label]"),
  changeSummary: document.querySelector("[data-demo-change-summary]"),
  terminalLabel: document.querySelector("[data-demo-terminal-label]"),
  code: document.querySelector("[data-demo-code]"),
  log: document.querySelector("[data-demo-log]"),
  proofCount: document.querySelector("[data-demo-proof-count]"),
  proofList: document.querySelector("[data-demo-proof-list]"),
  gate: document.querySelector("[data-demo-policy-state]"),
  gateTitle: document.querySelector("[data-demo-gate-title]"),
  gateCopy: document.querySelector("[data-demo-gate-copy]"),
  chain: document.querySelector("[data-demo-chain]"),
  scene: document.querySelector("#demo-scene"),
  progress: document.querySelector("[data-demo-progress]"),
  play: document.querySelector("[data-demo-play]"),
  playIcon: document.querySelector("[data-demo-play-icon]"),
  playLabel: document.querySelector("[data-demo-play-label]")
};

const agentOrder = ["lead", "locator", "fixer", "verifier", "archivist"];
let activeDemoMode = "scenario";
let activeDemoStep = 0;
let demoTimer = null;

const renderDemoFile = (fileIndex) => {
  const data = demoModes[activeDemoMode]?.steps[activeDemoStep];
  const file = data?.files[fileIndex];
  if (!file) {
    return;
  }

  demoElements.fileTabs.querySelectorAll("button").forEach((button, index) => {
    button.classList.toggle("is-active", index === fileIndex);
    button.setAttribute("aria-pressed", String(index === fileIndex));
  });
  demoElements.editorLabel.textContent = file.label;
  demoElements.code.textContent = file.code;
};

const renderDemoFileTabs = (files) => {
  demoElements.fileTabs.replaceChildren();
  files.forEach((file, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = file.label;
    button.dataset.demoFileTab = String(index);
    button.setAttribute("aria-pressed", String(index === 0));
    button.classList.toggle("is-active", index === 0);
    button.addEventListener("click", () => renderDemoFile(index));
    demoElements.fileTabs.append(button);
  });
};

const renderDemoProof = (proof) => {
  demoElements.proofList.replaceChildren();
  proof.forEach(([state, copy], index) => {
    const item = document.createElement("li");
    item.classList.toggle("is-complete", state === "done");

    const number = document.createElement("span");
    number.textContent = String(index + 1).padStart(2, "0");
    const text = document.createElement("p");
    text.textContent = copy;

    item.append(number, text);
    demoElements.proofList.append(item);
  });
};

const renderDemoTimeline = () => {
  const mode = demoModes[activeDemoMode];
  demoElements.timeline.replaceChildren();
  mode.steps.forEach((step, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.demoStep = String(index);
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", "demo-scene");
    button.setAttribute("aria-selected", String(index === activeDemoStep));
    button.classList.toggle("is-active", index === activeDemoStep);

    const number = document.createElement("span");
    number.textContent = String(index + 1).padStart(2, "0");
    const label = document.createElement("strong");
    label.textContent = step.label;
    const caption = document.createElement("small");
    caption.textContent = step.caption;

    button.append(number, label, caption);
    button.addEventListener("click", () => {
      stopDemoPlayback();
      renderDemoStep(index);
    });
    demoElements.timeline.append(button);
  });
};

const renderDemoOutcomes = (outcomes) => {
  document.querySelectorAll(".demo-outcomes article").forEach((article, index) => {
    const outcome = outcomes[index];
    if (!outcome) {
      return;
    }
    article.querySelector("strong").textContent = outcome[0];
    article.querySelector("span").textContent = outcome[1];
    article.querySelector("small").textContent = outcome[2];
  });
};

const renderDemoStep = (index, animate = true) => {
  const mode = demoModes[activeDemoMode];
  const data = mode.steps[index];
  if (!data) {
    return;
  }

  activeDemoStep = index;
  document.querySelectorAll("[data-demo-step]").forEach((button, buttonIndex) => {
    const active = buttonIndex === index;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });

  demoElements.owner.textContent = data.owner;
  demoElements.status.textContent = data.status;
  demoElements.title.textContent = data.title;
  demoElements.copy.textContent = data.copy;
  demoElements.evidence.textContent = data.evidence;
  demoElements.artifact.textContent = data.artifact;
  demoElements.boundary.textContent = data.boundary;
  demoElements.changeSummary.textContent = data.changeSummary;
  demoElements.terminalLabel.textContent = data.terminalLabel;
  demoElements.log.textContent = data.log;
  demoElements.proofCount.textContent = data.proofCount;
  demoElements.gateTitle.textContent = data.gateTitle;
  demoElements.gateCopy.textContent = data.gateCopy;
  demoElements.gate.dataset.demoPolicyState =
    index === mode.steps.length - 1 ? "attention" : "locked";
  demoElements.progress.style.width = `${((index + 1) / mode.steps.length) * 100}%`;

  renderDemoFileTabs(data.files);
  renderDemoFile(0);
  renderDemoProof(data.proof);

  const activeAgentIndex = agentOrder.indexOf(data.agent);
  document.querySelectorAll("[data-demo-agent]").forEach((agent) => {
    const agentIndex = agentOrder.indexOf(agent.dataset.demoAgent);
    agent.classList.toggle("is-active", agent.dataset.demoAgent === data.agent);
    agent.classList.toggle("is-complete", agentIndex >= 0 && agentIndex < activeAgentIndex);
  });

  if (animate) {
    demoElements.scene?.animate(
      [
        { opacity: 0.35, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" }
      ],
      { duration: 260, easing: "ease-out" }
    );
  }
};

const setDemoPlaying = (playing) => {
  demoElements.play?.setAttribute("aria-pressed", String(playing));
  demoElements.playIcon.textContent = playing ? "Ⅱ" : "▶";
  demoElements.playLabel.textContent = playing ? "暂停回放" : demoModes[activeDemoMode].playLabel;
};

const stopDemoPlayback = () => {
  if (demoTimer !== null) {
    window.clearInterval(demoTimer);
    demoTimer = null;
  }
  setDemoPlaying(false);
};

const startDemoPlayback = () => {
  stopDemoPlayback();
  setDemoPlaying(true);
  demoTimer = window.setInterval(() => {
    const steps = demoModes[activeDemoMode].steps;
    const nextStep = (activeDemoStep + 1) % steps.length;
    renderDemoStep(nextStep);
    if (nextStep === steps.length - 1) {
      window.setTimeout(stopDemoPlayback, 1600);
    }
  }, 2800);
};

const renderDemoMode = (modeKey) => {
  const mode = demoModes[modeKey];
  if (!mode) {
    return;
  }
  stopDemoPlayback();
  activeDemoMode = modeKey;
  activeDemoStep = 0;

  document.querySelectorAll("[data-demo-mode]").forEach((button) => {
    const active = button.dataset.demoMode === modeKey;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });

  demoElements.runKind.textContent = mode.runKind;
  demoElements.repository.textContent = mode.repository;
  demoElements.files.textContent = mode.fileSummary;
  demoElements.runStatus.textContent = mode.runStatus;
  demoElements.disclosure.textContent = mode.disclosure;
  demoElements.chain.textContent = mode.chain;
  renderDemoOutcomes(mode.outcomes);
  renderDemoTimeline();
  renderDemoStep(0, false);
  setDemoPlaying(false);
};

document.querySelectorAll("[data-demo-mode]").forEach((button) => {
  button.addEventListener("click", () => renderDemoMode(button.dataset.demoMode));
});

demoElements.play?.addEventListener("click", () => {
  if (demoTimer !== null) {
    stopDemoPlayback();
    return;
  }
  if (activeDemoStep === demoModes[activeDemoMode].steps.length - 1) {
    renderDemoStep(0);
  }
  startDemoPlayback();
});

const demoQuery = new window.URLSearchParams(window.location.search);
const requestedDemoMode = demoQuery.get("demoMode");
const initialDemoMode = requestedDemoMode in demoModes ? requestedDemoMode : "scenario";
renderDemoMode(initialDemoMode);

const requestedDemoStep = Number(demoQuery.get("demoStep"));
if (
  Number.isInteger(requestedDemoStep) &&
  requestedDemoStep >= 0 &&
  requestedDemoStep < demoModes[initialDemoMode].steps.length
) {
  renderDemoStep(requestedDemoStep, false);
}

if (demoQuery.get("capture") === "1") {
  document.documentElement.classList.add("capture-mode");
  document.querySelectorAll(".reveal").forEach((element) => element.classList.add("is-visible"));
}

const revealObserver =
  "IntersectionObserver" in window
    ? new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
      )
    : null;

document.querySelectorAll(".reveal").forEach((element) => {
  const delay = Number(element.dataset.delay || 0);
  element.style.setProperty("--reveal-delay", `${delay}ms`);
  if (revealObserver) {
    revealObserver.observe(element);
  } else {
    element.classList.add("is-visible");
  }
});

const copyButton = document.querySelector("[data-copy-command]");
copyButton?.addEventListener("click", async () => {
  const command = copyButton.querySelector("code")?.textContent?.trim();
  const label = copyButton.querySelector("[data-copy-label]");
  if (!command || !label) {
    return;
  }

  try {
    await navigator.clipboard.writeText(command);
    label.textContent = "已复制";
  } catch {
    label.textContent = "复制失败";
  }

  window.setTimeout(() => {
    label.textContent = "复制";
  }, 1800);
});

document.querySelector("[data-year]").textContent = String(new Date().getFullYear());
