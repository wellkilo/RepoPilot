const traceData = {
  input: {
    type: "INPUT",
    time: "18:10:46",
    title: "GitHub Issue #1 已进入维护队列",
    copy: "Webhook HMAC 验签通过；delivery ID 已登记。执行策略锁定为 pull_request_only。",
    prev: "GENESIS",
    hash: "1186ee63…7969c0"
  },
  decision: {
    type: "DECISION",
    time: "18:14:09",
    title: "Locator 证明 score=0 被 truthiness fallback 改写",
    copy: "基线复现仅失败一条目标回归用例；根因锁定为 result.score || 1，影响面限定在 evaluation normalization。",
    prev: "EVIDENCE #02",
    hash: "VERIFIED IN LEDGER"
  },
  tool: {
    type: "TOOL RESULT",
    time: "18:18:32",
    title: "Fixer 提交一行最小补丁",
    copy: "result.score || 1 被替换为 result.score ?? 1；提交 dd67868d 只修改一个文件，保留合法的零分。",
    prev: "EVIDENCE #08",
    hash: "COMMIT dd67868d"
  },
  approval: {
    type: "POLICY",
    time: "18:20:05",
    title: "自治在 Pull Request 处停止",
    copy: "PR #2 已创建并保持 OPEN。系统没有执行 merge、delete branch、force push 或权限修改。",
    prev: "EVIDENCE #12",
    hash: "PR #2 · OPEN"
  },
  verified: {
    type: "CI RESULT",
    time: "18:23:41",
    title: "Verifier 确认 GitHub Actions 全部通过",
    copy: "npm ci、typecheck 与测试均为 SUCCESS。Run 以 16 条 Evidence 完成，证据链校验有效。",
    prev: "EVIDENCE #15",
    hash: "CHAIN VALID"
  }
};

const demoData = [
  {
    owner: "REPO LEAD",
    status: "INPUT ACCEPTED",
    title: "合法的 0 分被错误改写为 1 分",
    copy: "RepoPilot 读取 GitHub Issue，锁定执行策略为 pull_request_only，并把验收标准交给维护团队。",
    evidence: "01 · task_input",
    artifact: "Issue #1",
    boundary: "PR only",
    terminalLabel: "source-context.json",
    code: `{
  "repository": "wellkilo/repopilot-testbed",
  "issueNumber": 1,
  "executionPolicy": "pull_request_only"
}`
  },
  {
    owner: "LOCATOR",
    status: "ROOT CAUSE PROVED",
    title: "truthiness fallback 吞掉了合法零分",
    copy: "Locator 复现目标测试并限定影响面：数值 0 是合法结果，但 result.score || 1 把它当成缺失值。",
    evidence: "06 · root_cause",
    artifact: "src/evaluation.ts",
    boundary: "Read-only analysis",
    terminalLabel: "baseline-reproduction.log",
    code: `$ npm run typecheck
PASS

$ npm test
Expected score: 0
Received score: 1`
  },
  {
    owner: "FIXER",
    status: "MINIMAL PATCH",
    title: "只改一处回退运算符",
    copy: "Fixer 使用空值合并运算符保留 0，仅在 score 为 null 或 undefined 时回退；补丁范围为 1 个文件、+1/-1。",
    evidence: "09 · patch",
    artifact: "Commit dd67868d",
    boundary: "No force push",
    terminalLabel: "src/evaluation.ts.diff",
    code: `- score: result.score || 1,
+ score: result.score ?? 1,`
  },
  {
    owner: "VERIFIER",
    status: "CI SUCCESS",
    title: "类型检查与目标回归测试全部通过",
    copy: "Verifier 独立检查补丁结果；GitHub Actions Run 31793190761 的 test job 完成且结论为 SUCCESS。",
    evidence: "13 · verification",
    artifact: "CI 31793190761",
    boundary: "Verifier cannot edit",
    terminalLabel: "github-actions.log",
    code: `npm ci              SUCCESS
npm run typecheck   SUCCESS
npm test            SUCCESS`
  },
  {
    owner: "FIXER + REPO LEAD",
    status: "PR OPEN / CLEAN",
    title: "PR #2 已创建，但没有自动合并",
    copy: "系统交付可审查的 Pull Request，并在安全边界内停止。合并仍由人类决定。",
    evidence: "14 · pull_request",
    artifact: "PR #2",
    boundary: "No auto-merge",
    terminalLabel: "pull-request.json",
    code: `{
  "number": 2,
  "state": "OPEN",
  "mergeStateStatus": "CLEAN",
  "changedFiles": 1,
  "additions": 1,
  "deletions": 1
}`
  },
  {
    owner: "ARCHIVIST",
    status: "CHAIN VALID",
    title: "16 条 Evidence 构成可回放证据链",
    copy: "任务输入、根因、补丁、Git 引用和 CI 结果全部关联到同一 Run 与 Trace；经验被整理为可复用规则。",
    evidence: "16 · runbook",
    artifact: "Run 11c63758",
    boundary: "Verified facts only",
    terminalLabel: "verified-runbook.md",
    code: `Rule:
Nullable numeric fields must not use
truthiness fallback.

Run: 11c63758
Trace: 332f8652f35d
Evidence: 16 · VALID`
  }
];

const loopData = [
  {
    owner: "CONTROL PLANE",
    title: "任务输入",
    copy: "接收 GitHub Issue 或失败 Workflow Run。原始请求经过 HMAC-SHA256 验签，仓库必须命中 allowlist。",
    input: "Issue / Failed CI / Policy",
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
  owner: document.querySelector("[data-demo-owner]"),
  status: document.querySelector("[data-demo-status]"),
  title: document.querySelector("[data-demo-title]"),
  copy: document.querySelector("[data-demo-copy]"),
  evidence: document.querySelector("[data-demo-evidence]"),
  artifact: document.querySelector("[data-demo-artifact]"),
  boundary: document.querySelector("[data-demo-boundary]"),
  terminalLabel: document.querySelector("[data-demo-terminal-label]"),
  code: document.querySelector("[data-demo-code]"),
  scene: document.querySelector("#demo-scene"),
  progress: document.querySelector("[data-demo-progress]"),
  play: document.querySelector("[data-demo-play]"),
  playIcon: document.querySelector("[data-demo-play-icon]"),
  playLabel: document.querySelector("[data-demo-play-label]")
};

let activeDemoStep = 0;
let demoTimer = null;

const renderDemoStep = (index, animate = true) => {
  const data = demoData[index];
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
  demoElements.terminalLabel.textContent = data.terminalLabel;
  demoElements.code.textContent = data.code;
  demoElements.progress.style.width = `${((index + 1) / demoData.length) * 100}%`;

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
  demoElements.playLabel.textContent = playing ? "暂停回放" : "播放完整 Run";
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
    const nextStep = (activeDemoStep + 1) % demoData.length;
    renderDemoStep(nextStep);
    if (nextStep === demoData.length - 1) {
      window.setTimeout(stopDemoPlayback, 1800);
    }
  }, 3400);
};

document.querySelectorAll("[data-demo-step]").forEach((button, index) => {
  button.addEventListener("click", () => {
    stopDemoPlayback();
    renderDemoStep(index);
  });
});

demoElements.play?.addEventListener("click", () => {
  if (demoTimer !== null) {
    stopDemoPlayback();
    return;
  }
  if (activeDemoStep === demoData.length - 1) {
    renderDemoStep(0);
  }
  startDemoPlayback();
});

renderDemoStep(0, false);

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

const updateRepositoryFacts = async () => {
  const source = document.querySelector("[data-live-source]");
  try {
    const response = await fetch("https://api.github.com/repos/wellkilo/RepoPilot", {
      headers: { Accept: "application/vnd.github+json" }
    });
    if (!response.ok) {
      throw new Error(`GitHub API ${response.status}`);
    }
    const repository = await response.json();
    document.querySelector("[data-stars]").textContent = repository.stargazers_count ?? "0";
    document.querySelector("[data-forks]").textContent = repository.forks_count ?? "0";
    document.querySelector("[data-open-issues]").textContent = repository.open_issues_count ?? "0";
    document.querySelector("[data-repo-status]").textContent =
      `${repository.visibility === "public" ? "Public" : repository.visibility} · Apache-2.0`;
    source.textContent = "GitHub API 实时数据";
  } catch {
    source.textContent = "GitHub API 不可用，展示静态证据";
  }
};

void updateRepositoryFacts();

document.querySelector("[data-year]").textContent = String(new Date().getFullYear());
