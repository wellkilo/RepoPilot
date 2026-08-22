# RepoPilot 复赛工程对齐

本文档只描述复赛新增工程能力，不修改已提交的初赛材料。评分要求来自 2026 GOAI
「新智基座｜Agent Infra」参赛手册与官网在 2026-08-21 的公开内容。

## 复赛必交

- 更新版项目方案 PPT/PDF；
- 可执行 AgentTeams 代码包或评审可访问仓库；
- 运行入口、依赖、配置、样例输入输出与运行证据；
- 可运行 Demo 或 Demo 视频；
- 日志、Trace、Metrics、评测结果与自动化验证证据；
- Agent Identity 清单与完整 Skill 工程说明。

## 评分差距矩阵

| 评分维度                | 权重 | 当前可核验证据                                          | 已补强                                                                                      | 仍需复赛前完成                                                     |
| ----------------------- | ---: | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 场景价值与可复制性      |  25% | 公开 Issue #3、失败 CI、五文件修复、PR #4、绿色 CI      | 将交付定义为 Proof-Carrying Pull Request；新增五类公开 Benchmark 规划                       | 为至少 3 类缺陷生成真实 Issue→PR 证据并统计耗时与成功率            |
| 多 Agent 协同与自主闭环 |  25% | 6 个 AgentTeams Worker、Matrix 事件、16 条历史 Evidence | 新增幂等 Step 生命周期、Agent/Skill 强绑定、控制台实时状态与只读 PR Reviewer                | 用新版本完成一次五 Step 真实维护 Run，并完成一次真实 PR Review Run |
| Skill 工程与生态复用    |  25% | 6 个 Apache-2.0 Skill、官方 AgentLoop Skill 可选接入    | 新增 `skills/manifest.json`、版本、发布兼容、权限、失败与验证契约，CI 自动校验              | 发布带校验摘要的 Skill Release，并在第二个仓库复用至少一个 Skill   |
| 工程验证与安全审计      |  20% | HMAC、幂等、显式状态机、一次性审批、Evidence 哈希链     | 新增 Proof Bundle、PR Proof/Review Comment、stale SHA 防护、Trace/Metrics、46/46 可靠性报告 | 部署 OTLP 后端并保留真实 Trace/Metrics 截图或导出文件              |
| 开放与开源贡献          |   5% | Apache-2.0、公开仓库、API/Method、部署、测试床          | 新增评测协议与可移植 Proof Schema                                                           | 创建版本化 Release、贡献指南、复现者反馈或外部使用证据             |

## 差异化主张

RepoPilot 不把“模型生成了一个补丁”当作成功，而是为每个 Pull Request 生成一份
**Proof Bundle**：

```text
Run identity
  + AgentTeams Step timeline
  + Skill versions
  + tool and decision evidence
  + Git and CI references
  + approval history
  + SHA-256 chain head
  + deterministic quality gates
```

这使 PR 自带可验证执行证明：评审者可以检查谁做了什么、用了哪个 Skill、基于什么
证据、是否独立验证、是否越过权限边界，以及经验是否被沉淀。

## 评测分层

### 控制面可靠性

CI 运行 `pnpm benchmark:reliability`，当前本地基线为 **46/46 tests passed**。该报告只
验证确定性工程契约，包括：

- Webhook HMAC 与并发幂等；
- Run 状态机；
- Evidence 哈希链与数据库不可变触发器；
- 审批版本和一次性消费；
- Agent Skill Step 幂等与终态；
- Proof Bundle 评分器；
- PR Review 事件过滤、来源绑定、评论幂等和 stale SHA 拒绝；
- Console 标签与构建契约。

### AgentTeam 任务质量

真实模型运行不能由单元测试代替。每个 Benchmark Case 必须导出：

- Issue / 失败 Workflow；
- AgentTeams Matrix 与 Step 时间线；
- 根因、补丁、PR 和 CI Evidence；
- Proof Bundle 与离线评分报告；
- 失败、阻塞或拒绝路径，不只保留成功样本。

详见 [`../evaluation/README.md`](../evaluation/README.md)。

## 复赛前优先级

1. 使用新 Step 工具真实重跑 testbed Issue #3，生成完整 Proof Bundle 并发布到 PR。
2. 增加工具失败恢复、审批拒绝、跨语言缺陷三个公开 Case。
3. 接入一个 OTLP 后端，导出 Agent/Skill/MCP/Run Trace 与 Metrics。
4. 发布 `skills/manifest.json` 对应的版本化 Skill 包。
5. 基于真实报告更新复赛 PPT、视频和项目页，不使用推测数字。
