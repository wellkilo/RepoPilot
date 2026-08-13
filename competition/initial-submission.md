# RepoPilot 初赛作品简介

## 500 字以内版本

RepoPilot 是面向开源与企业研发团队的仓库自治维护 AgentTeam，解决 Issue 分诊慢、根因定位依赖专家、自动修复缺少验证证据、高风险操作不可审计等问题。系统以 AgentTeams v1.2.2 为协同基点，由 Repo Lead、Locator、Fixer、Verifier、Archivist 五个不同职能 Agent 完成“GitHub Issue/失败 CI 输入—任务拆解—根因定位—最小补丁—Pull Request—独立验证—人工审批—Runbook 沉淀”闭环。关键能力封装为五个可复用 Skill，并通过 Streamable HTTP MCP 接入 GitHub、审批和证据服务；同时可使用阿里云官方 AgentLoop Experience Skill 召回历史经验。RepoPilot 默认只允许 Agent 创建 Pull Request，合并、分支删除、破坏性回滚、权限和密钥修改均要求一次性人工审批。每个决策、工具调用、Git 引用和 CI 结果写入 PostgreSQL 追加式 SHA-256 证据链，并以 OpenTelemetry Trace 和飞行记录器式 Web 控制台支持回放审计。项目提供可复现测试仓库，当前包含“合法 0 分被误判为 1 分”的确定性缺陷、失败测试和真实 GitHub Actions，可完整展示 AgentTeams 协同、修复验证和安全边界。项目采用 Apache-2.0，未来可扩展到多仓库、多语言、依赖升级和安全告警维护。

## 一句话

让五个 Agent 在可审计、可审批、可回滚的边界内，把 GitHub 问题安全推进到经过验证的 Pull Request。
