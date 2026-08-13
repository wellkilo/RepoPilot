const traceData = {
  input: {
    type: "INPUT",
    time: "10:15:02.184",
    title: "GitHub Issue #1 已进入维护队列",
    copy: "Webhook HMAC 验签通过；delivery ID 已登记。执行策略锁定为 pull_request_only。",
    prev: "GENESIS",
    hash: "4f8ab21e…9c12"
  },
  decision: {
    type: "DECISION",
    time: "10:16:47.029",
    title: "Locator 证明 score=0 被 truthiness fallback 改写",
    copy: "基线复现仅失败一条目标回归用例；根因锁定为 result.score || 1，影响面限定在 evaluation normalization。",
    prev: "4f8ab21e…9c12",
    hash: "7be20f43…1a6d"
  },
  tool: {
    type: "TOOL RESULT",
    time: "10:20:11.603",
    title: "Pull Request 已创建，Fixer 在权限边界内停止",
    copy: "github_create_pull_request 返回 PR 引用、head SHA 与 rollback point。未执行 merge、delete branch 或 force push。",
    prev: "7be20f43…1a6d",
    hash: "9ca13d7b…4f21"
  },
  approval: {
    type: "APPROVAL",
    time: "10:22:38.410",
    title: "高风险动作进入人工门禁",
    copy: "审批记录包含 actor、comment 与 version。审批只能消费一次，旧版本和重复消费都会返回冲突。",
    prev: "9ca13d7b…4f21",
    hash: "c135f1aa…88e0"
  },
  verified: {
    type: "CI RESULT",
    time: "10:27:06.955",
    title: "Verifier 完成 before / after 与 GitHub Checks",
    copy: "基线失败、补丁通过；typecheck、测试与 Check Run 均有证据。Archivist 可以写入经过验证的 Runbook。",
    prev: "c135f1aa…88e0",
    hash: "e8360c91…70bf"
  }
};

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
