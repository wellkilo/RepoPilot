<div align="center">
  <a href="https://wellkilo.github.io/RepoPilot/">
    <img
      src="docs/assets/brand/repopilot-logo.svg"
      width="520"
      alt="RepoPilot — Evidence-first AgentTeam"
    />
  </a>
  <br /><br />
  <p><strong>面向开源与企业研发团队的可审计仓库自治维护 AgentTeam</strong></p>
  <p>
    将 GitHub Issue 与失败 CI 安全推进到携带可验证执行证明的 Pull Request，
    并完整保留 Agent、Skill、工具、审批、回滚点与经验证据。
  </p>
  <br />
</div>

<a href="https://wellkilo.github.io/RepoPilot/">
  <img
    src="docs/assets/brand/readme-hero.svg"
    width="100%"
    alt="RepoPilot 从 Issue 到 Verified PR，不跳过任何证据"
  />
</a>

<br />

<div align="center">
  <p>
    <a href="https://wellkilo.github.io/RepoPilot/">
      <img alt="Project Site" src="https://img.shields.io/badge/project_site-live-49d6d0?style=flat-square" />
    </a>
    <a href="https://github.com/wellkilo/RepoPilot/actions/workflows/ci.yml">
      <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/wellkilo/RepoPilot/ci.yml?branch=main&label=CI&style=flat-square" />
    </a>
    <a href="LICENSE">
      <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-5c7cfa?style=flat-square" />
    </a>
    <a href="https://github.com/agentscope-ai/AgentTeams/releases/tag/v1.2.2">
      <img alt="AgentTeams" src="https://img.shields.io/badge/AgentTeams-v1.2.2-28a745?style=flat-square" />
    </a>
    <img alt="Node.js" src="https://img.shields.io/badge/Node.js-%E2%89%A520-339933?style=flat-square&logo=nodedotjs&logoColor=white" />
    <img alt="Safety Policy" src="https://img.shields.io/badge/policy-PR--only-f59f00?style=flat-square" />
  </p>
  <p>
    <a href="https://wellkilo.github.io/RepoPilot/">项目网站</a> ·
    <a href="https://wellkilo.github.io/RepoPilot/#demo">在线 Demo</a> ·
    <a href="#使用过程演示">流程演示</a> ·
    <a href="#快速开始">快速开始</a> ·
    <a href="docs/architecture.md">架构</a> ·
    <a href="API.md">API / MCP</a> ·
    <a href="docs/security.md">安全</a> ·
    <a href="docs/demo.md">Demo</a> ·
    <a href="competition/initial-submission.md">参赛材料</a>
  </p>
  <br />
</div>

<table>
  <tr>
    <td align="center"><strong>5</strong><br /><sub>不同职能 Agent</sub></td>
    <td align="center"><strong>11</strong><br /><sub>Streamable HTTP MCP 工具</sub></td>
    <td align="center"><strong>27/27</strong><br /><sub>控制面可靠性测试</sub></td>
    <td align="center"><strong>0</strong><br /><sub>未审批自动合并</sub></td>
  </tr>
</table>

> RepoPilot 建立在 [AgentTeams](https://github.com/agentscope-ai/AgentTeams) `v1.2.2`
> 之上，面向 GOAI「新智基座 · Agent Infra」赛道设计。默认策略为
> `pull_request_only`：Agent 可以创建分支、提交和 Pull Request，但不能自动合并、
> 删除分支、修改权限或密钥。

## 使用过程演示

<div align="center">
  <a href="https://wellkilo.github.io/RepoPilot/#demo">
    <img
      src="docs/assets/demo/repopilot-agentteam-demo.gif"
      width="100%"
      alt="RepoPilot 完整演示：Webhook 事件、Agent 分诊、根因定位、多文件补丁、并发验证与安全 PR"
    />
  </a>
  <p>
    <sub>
      公开 Issue #3 → 失败 CI → Repo Lead 分诊 → Locator 证明竞态 → Fixer 五文件修复 → Verifier 7/7 验证 → PR #4
    </sub>
  </p>
  <p>
    <a href="https://wellkilo.github.io/RepoPilot/#demo"><strong>打开 Issue → PR 交互 Demo ↗</strong></a>
    ·
    <a href="docs/assets/demo/repopilot-agentteam-demo.mp4">观看高清 MP4</a>
    ·
    <a href="https://github.com/wellkilo/repopilot-testbed/pull/4">核验公开 PR #4</a>
  </p>
</div>

> 在线 Demo 无需模型服务或管理员账号。默认回放
> [`repopilot-testbed#3`](https://github.com/wellkilo/repopilot-testbed/issues/3)
> 的真实交付：失败基线稳定复现并发竞态，RepoPilot 通过
> `Types + Store + Processor + Tests + Docs` 五文件补丁修复，GitHub Actions
> 通过后创建 [`PR #4`](https://github.com/wellkilo/repopilot-testbed/pull/4)。
> PR 保持开放，合并权仍由人类持有。

## 维护闭环

<div align="center">

```text
GitHub Issue / Failed CI
          │
          ▼
   Repo Lead 分诊与拆解
          │
          ▼
 Locator 根因定位 ──► Fixer 最小修复 ──► Verifier 独立验证
                                                │
                  人工审批 ◄── 高风险门禁 ◄─────┤
                                                │
                                                ▼
                                      Archivist 沉淀 Runbook
```

</div>

每个关键阶段都会把决策、工具调用、Git 引用、CI 结果和审批事件写入
PostgreSQL 追加式 SHA-256 证据链，并通过 OpenTelemetry Trace 与证据控制台支持回放。

## Proof-Carrying Pull Request

RepoPilot 的差异化不只是“自动生成 PR”，而是让每个 PR 携带一份机器可核验的
**Proof Bundle**：

```text
Run 身份 + AgentTeams Step 时间线 + Skill 版本
         + 工具与决策 Evidence + Git / CI 引用
         + 审批历史 + SHA-256 链根 + 确定性质量门禁
```

```bash
curl http://127.0.0.1:3000/api/v1/runs/<run-id>/proof \
  --output artifacts/proof-bundle.json
pnpm build
pnpm evaluate artifacts/proof-bundle.json artifacts/evaluation-report.json
```

Proof Score 衡量证明完整性，不把控制面测试冒充模型修复质量；补丁正确性仍由公开
测试床、独立 Verifier 与 GitHub Checks 判定。

完成 Runbook 归档后，Archivist 调用 `repopilot_publish_proof_comment`，将脱敏后的
评分、Agent/Skill 执行结果和 SHA-256 链根幂等发布到对应 PR。重复执行会更新同一条
评论，因此 Proof 真正随 PR 交付，而不是只存在于控制面 API。

## 为什么是 RepoPilot

<table>
  <thead>
    <tr>
      <th>问题</th>
      <th>RepoPilot 的处理方式</th>
      <th>可验证证据</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Issue 分诊依赖人工</td>
      <td>Repo Lead 统一分类、风险判断和 DAG 拆解</td>
      <td>任务计划、Matrix 事件、Run 状态</td>
    </tr>
    <tr>
      <td>自动修复容易直接猜答案</td>
      <td>Locator 与 Fixer 职责分离，先复现和证明根因</td>
      <td>复现命令、代码位置、影响面、补丁</td>
    </tr>
    <tr>
      <td>修复者自行验证存在偏差</td>
      <td>Verifier 独立运行 before/after 测试与 GitHub Checks</td>
      <td>测试结果、Check Runs、残余风险</td>
    </tr>
    <tr>
      <td>高风险动作缺少控制</td>
      <td>合并等动作要求带版本号的一次性人工审批</td>
      <td>审批人、意见、版本、消费时间</td>
    </tr>
    <tr>
      <td>经验无法复用</td>
      <td>Archivist 查重、脱敏并写入 Runbook</td>
      <td>来源 Run、证据链、检索结果</td>
    </tr>
  </tbody>
</table>

## AgentTeam

<table>
  <thead>
    <tr>
      <th width="18%">Agent</th>
      <th width="42%">职责</th>
      <th width="40%">自主边界</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Repo Lead</strong></td>
      <td>分诊、风险判断、DAG 拆解、任务委派</td>
      <td>不修改代码；高风险动作必须发起审批</td>
    </tr>
    <tr>
      <td><strong>Locator</strong></td>
      <td>复现、代码/符号定位、影响面分析</td>
      <td>仅读取和实验，不修改仓库</td>
    </tr>
    <tr>
      <td><strong>Fixer</strong></td>
      <td>最小补丁、回归测试、分支、提交、PR</td>
      <td>停在 Pull Request，不合并、不强推</td>
    </tr>
    <tr>
      <td><strong>Verifier</strong></td>
      <td>独立复现、测试、CI 和残余风险验证</td>
      <td>不修改补丁，不把绿灯视为合并授权</td>
    </tr>
    <tr>
      <td><strong>Archivist</strong></td>
      <td>Runbook 查重、脱敏、结构化和沉淀</td>
      <td>不修改仓库或 GitHub 状态</td>
    </tr>
  </tbody>
</table>

Agent Identity 完整定义位于
[`deploy/agentteams/repopilot-team.yaml`](deploy/agentteams/repopilot-team.yaml)，
Skill 契约位于 [`skills/`](skills/)。

## 核心能力

<details open>
  <summary><strong>AgentTeams 原生协作</strong></summary>
  <br />
  使用官方 <code>agentteams.io/v1beta1</code> Worker/Team CRD、Team Leader、
  Matrix 房间、共享任务状态与 MinIO 工作区，而不是自建多 Agent 模拟器。
</details>

<details>
  <summary><strong>Skill 与 MCP 工程化</strong></summary>
  <br />
  提供 5 个 Apache-2.0 自定义 Skill 与统一版本化 Manifest；控制面暴露 11 个
  Streamable HTTP MCP 工具，覆盖 Agent Step、Evidence、审批、Runbook、Issue、PR、
  Checks、PR Proof Comment 和受控合并。
</details>

<details>
  <summary><strong>不可变执行证据</strong></summary>
  <br />
  Evidence 使用 canonical JSON 与 SHA-256 哈希链；数据库触发器拒绝更新和删除。
  控制台会重新验证完整链路并展示 <code>CHAIN VERIFIED</code>。
</details>

<details>
  <summary><strong>生产级安全边界</strong></summary>
  <br />
  包含 GitHub 仓库 allowlist、Webhook HMAC 验签、delivery 并发幂等、显式状态机、
  审批乐观锁和审批一次性消费。
</details>

<details>
  <summary><strong>RAG 与可观测</strong></summary>
  <br />
  PostgreSQL 提供 Runbook 全文检索并预留 pgvector；可选接入阿里云官方
  <code>alibabacloud-agentloop-experience</code> Skill。OpenTelemetry 通过 OTLP
  输出 HTTP、Agent Skill、MCP 与端到端 Run Trace 和 Metrics。
</details>

## 系统架构

```mermaid
flowchart LR
    GH[GitHub Issue / Failed CI] --> CP[RepoPilot Control Plane]
    CP --> DB[(PostgreSQL + pgvector)]
    CP --> MX[Matrix Admin → Manager DM]
    MX --> M[AgentTeams Manager]
    M --> TL[Repo Lead]
    TL --> L[Locator]
    TL --> F[Fixer]
    TL --> V[Verifier]
    TL --> A[Archivist]
    L & F & V & A --> MCP[RepoPilot MCP via Higress]
    MCP --> GHAPI[GitHub REST API]
    MCP --> DB
    DB --> UI[Evidence Console]
    CP --> OTEL[OTLP / AgentLoop / LoongSuite]
```

更多设计细节见 [`docs/architecture.md`](docs/architecture.md)。

## 工程结构

```text
RepoPilot/
├── apps/
│   ├── control-plane/       # Fastify REST / Webhook / MCP / 审批 / 证据账本
│   └── console/             # 飞行记录器风格 React 证据控制台
├── packages/contracts/      # Zod Schema、共享类型和显式状态机
├── deploy/agentteams/       # AgentTeams v1.2.2 Worker / Team 清单
├── skills/                  # 5 个可复用 RepoPilot Skills
├── evaluation/              # Proof Bundle 协议与复赛 Benchmark
├── scripts/                 # Skill 校验、可靠性基线与离线评测
├── competition/             # 初赛简介、评审映射和提交清单
├── docs/                    # 架构、安全、部署和 Demo 文档
├── API.md                   # REST / Webhook / MCP 出入参
├── Method.md                # 外部 SDK、HTTP Method 与调用契约
└── docker-compose.yml       # PostgreSQL 16 + pgvector
```

## 快速开始

### 环境要求

- Node.js `20+`
- pnpm `9+`
- Docker Desktop / Docker Engine

模型凭证不是构建、测试或本地控制面运行的前置条件。

```bash
git clone https://github.com/wellkilo/RepoPilot.git
cd RepoPilot
cp .env.example .env
docker compose up -d postgres
pnpm install --registry=https://registry.npmjs.org
pnpm build
pnpm --filter @repopilot/control-plane start
```

访问控制台：

```text
http://127.0.0.1:3000
```

也可以使用一键初始化：

```bash
./init.sh
```

### 创建首个 Run

```bash
curl -X POST http://127.0.0.1:3000/api/v1/runs \
  -H 'Content-Type: application/json' \
  -d '{
    "source": {
      "type": "github_issue",
      "repository": "wellkilo/repopilot-testbed",
      "issueNumber": 1
    },
    "executionPolicy": "pull_request_only"
  }'
```

需要读取 GitHub Issue 时，在本机 `.env` 配置 `GITHUB_TOKEN`。如果没有配置
AgentTeams Matrix，Run 会停在 `awaiting_dispatch`，不会用 Mock Agent 伪造执行结果。

## AgentTeams 真实协作

真实五 Agent 推理需要一个 OpenAI 兼容模型端点，可以使用：

- 阿里云百炼等托管服务；
- 其他 OpenAI 兼容 API；
- 本地 Ollama 等兼容端点。

模型密钥只交给 AgentTeams/Higress，不进入 RepoPilot 源码、数据库或部署清单。

部署说明：

- [`docs/deployment.md`](docs/deployment.md)
- [`deploy/agentteams/README.md`](deploy/agentteams/README.md)

## 可复现测试床

<table>
  <tr>
    <td><strong>仓库</strong></td>
    <td><a href="https://github.com/wellkilo/repopilot-testbed">wellkilo/repopilot-testbed</a></td>
  </tr>
  <tr>
    <td><strong>Issue</strong></td>
    <td><a href="https://github.com/wellkilo/repopilot-testbed/issues/3">#3 · Duplicate webhook retries dispatch multiple maintenance tasks</a></td>
  </tr>
  <tr>
    <td><strong>失败基线</strong></td>
    <td><a href="https://github.com/wellkilo/repopilot-testbed/actions/runs/32444544920">GitHub Actions Run 32444544920</a></td>
  </tr>
  <tr>
    <td><strong>修复 PR</strong></td>
    <td><a href="https://github.com/wellkilo/repopilot-testbed/pull/4">Pull Request #4 · 5 files · +75 / -22</a></td>
  </tr>
  <tr>
    <td>绿色 CI</td>
    <td><a href="https://github.com/wellkilo/repopilot-testbed/actions/runs/32444690068">GitHub Actions Run 32444690068 · 7/7 tests</a></td>
  </tr>
</table>

测试床包含一个确定性并发缺陷：相同 GitHub delivery 的两个请求可同时穿透
`find` / `save` 窗口，创建两个 task 并执行两次 dispatch。RepoPilot 将
create-or-reuse 收口到 `DeliveryTaskStore.getOrCreate`，使相同 delivery
共享一个 in-flight Promise，并补充顺序重试和不同 delivery 的负对照。
PR 保持开放，便于审查且未触发自动合并。

## 验证

```bash
pnpm typecheck
pnpm benchmark:reliability
pnpm skills:validate
pnpm lint
pnpm format:check
pnpm build
```

当前控制面可靠性基线为 `27/27`。测试覆盖状态机、Webhook 验签、证据哈希、数据库
不可变触发器、delivery 并发幂等、审批版本与一次性消费、Agent Skill Step 生命周期、
Proof Bundle 评分、HTTP 冲突语义及控制台标签。CI 生成结构化 JSON 报告。

## 安全边界

<table>
  <tr>
    <th>默认允许</th>
    <th>必须人工审批</th>
  </tr>
  <tr>
    <td>
      读取 Issue / CI、创建分支与提交、推送非保护分支、创建 Pull Request、读取 Checks、
      记录 evidence
    </td>
    <td>
      合并 Pull Request、删除分支、破坏性回滚、修改权限、修改密钥、执行其他高风险工具
    </td>
  </tr>
</table>

详细威胁模型与生产加固项见 [`docs/security.md`](docs/security.md)。

## 文档导航

| 文档                                                         | 内容                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------- |
| [`API.md`](API.md)                                           | REST、Webhook 和 MCP Schema                             |
| [`Method.md`](Method.md)                                     | AgentTeams、Matrix、GitHub、PostgreSQL 和 OTel 方法契约 |
| [`docs/architecture.md`](docs/architecture.md)               | 架构、状态机和部署剖面                                  |
| [`docs/security.md`](docs/security.md)                       | 权限、审批、凭证和 evidence 完整性                      |
| [`docs/deployment.md`](docs/deployment.md)                   | 本地、AgentTeams、Webhook 和可观测部署                  |
| [`docs/demo.md`](docs/demo.md)                               | 比赛 Demo 流程与失败分支                                |
| [`evaluation/README.md`](evaluation/README.md)               | 评测分层、Proof Bundle 和复赛 Benchmark                 |
| [`docs/semifinal-readiness.md`](docs/semifinal-readiness.md) | 复赛要求、评分差距和工程优先级                          |
| [`competition/`](competition/)                               | 初赛简介、评审映射和提交清单                            |

## 当前边界

- 未配置模型服务时，不能完成真实 AgentTeams 推理；构建、测试、控制面和测试床不受影响。
- Runbook 默认使用 PostgreSQL 全文检索；`vector(1536)` 已为语义召回预留。
- AgentLoop Recall 是可选能力，没有凭证时自动降级到本地 Runbook。
- 控制台审批身份当前通过受信反向代理 Header 演示；生产环境必须接入 OIDC/SSO。

<hr />

<div align="center">
  <p>
    <strong>RepoPilot</strong> · Make repository automation observable, reviewable and reversible.
  </p>
  <p>Apache-2.0</p>
</div>
