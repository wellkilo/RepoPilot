# 评审维度映射

| 评审维度                       | 权重 | RepoPilot 证据                                                                          |
| ------------------------------ | ---: | --------------------------------------------------------------------------------------- |
| 场景价值与行业可复制性         |  25% | GitHub/企业代码仓库通用；Issue 与 CI 公开可复现；支持多语言扩展                         |
| 多 Agent 协同与自主闭环        |  25% | AgentTeams Team Leader + 4 Worker；显式 DAG；异常重规划；完整八阶段闭环                 |
| Skill 工程体系与生态复用       |  25% | 5 个 Apache-2.0 Skill；输入输出、条件、依赖、失败、安全、复用完整；官方 AgentLoop Skill |
| 工程落地、运行验证与安全可审计 |  20% | 真实 GitHub API/MCP；失败 CI；PostgreSQL 不可变 evidence；审批一次性消费；OTel          |
| 开放/开源贡献                  |   5% | Apache-2.0；CRD 模板；Skill；接口契约；测试床；部署和 Demo 文档                         |

## 可量化指标

- Issue 到首次可复现根因的耗时。
- 自动创建 PR 成功率。
- Verifier PASS/FAIL/BLOCKED 分布。
- Tool/MCP 成功率。
- Webhook 重复派单率：目标 `0`。
- 未审批高风险动作执行数：目标 `0`。
- Evidence 链验证通过率：目标 `100%`。
- Runbook 后续召回命中率。
