# RepoPilot Skills

RepoPilot ships six Apache-2.0 custom Skills:

1. `repository-triage`
2. `root-cause-localization`
3. `safe-patch-authoring`
4. `verification-gate`
5. `runbook-archival`
6. `pull-request-review`

`manifest.json` 是 Skill 的统一发布契约，记录版本、类型、调用者、输入输出、调用条件、
依赖、失败处理、权限边界和验证项。CI 会校验 Manifest、每个 `SKILL.md` 以及
AgentTeams Worker 绑定是否一致：

```bash
pnpm skills:validate
```

The AgentTeams Worker manifests reference these names through `Worker.spec.skills`. Package each directory as a complete Skill or place it under the AgentTeams Manager workspace at:

```text
~/worker-skills/<skill-name>/
```

RepoPilot also integrates the official Alibaba Cloud Skill:

```text
alibabacloud-agentloop-experience
```

Source:

```text
https://github.com/aliyun/alibabacloud-aiops-skills/tree/master/skills/aiml/agentloop/alibabacloud-agentloop-experience
```

This official Skill is optional at runtime because it needs an AgentLoop Recall endpoint. The local PostgreSQL Runbook search remains available without cloud credentials. When AgentLoop is configured, both sources are treated as context rather than authority and must be verified against the current repository.
