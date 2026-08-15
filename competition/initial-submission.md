# RepoPilot 作品简介

## 500 字以内版本

RepoPilot 是可审计仓库自治维护 AgentTeam，解决自动修复缺少独立验证和高风险操作不可审计等问题。系统基于 AgentTeams v1.2.2，由 Repo Lead、Locator、Fixer、Verifier、Archivist 五个 Agent 完成“输入—拆解—上下文—工具—验证—证据—审批—经验”闭环。五项能力封装为开源 Skill，通过 MCP 连接 GitHub、审批、证据与知识服务。默认只允许创建 Pull Request，合并、删分支、破坏性回滚、权限和密钥修改均需人工审批；关键决策、工具结果、Git 引用和 CI 状态进入 SHA-256 证据链。项目已真实跑通测试仓库 Issue #1：五个 CoPaw Worker 协同修复合法 0 分被误写为 1 分的问题，创建 PR #2，仅改 1 个文件、+1/-1，GitHub Actions 全部通过；RepoPilot Run 成功，记录 16 条 Evidence 且链路有效，PR 保持 OPEN、未自动合并。项目公开代码、测试床、控制台、Skill、MCP 和部署文档，可扩展到多仓库及安全维护。

## 一句话

让五个 Agent 在可审计、可审批、可回滚的边界内，把 GitHub 问题安全推进到经过验证的 Pull Request。

## 在线 Demo

https://wellkilo.github.io/RepoPilot/#demo
