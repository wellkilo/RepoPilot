# RepoPilot Skills

RepoPilot ships five Apache-2.0 custom Skills:

1. `repository-triage`
2. `root-cause-localization`
3. `safe-patch-authoring`
4. `verification-gate`
5. `runbook-archival`

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
