# AgentTeams Deployment

RepoPilot targets AgentTeams `v1.2.2` and the `agentteams.io/v1beta1` Worker and Team contracts.

## Prerequisites

- AgentTeams `v1.2.2`
- Six complete RepoPilot Skill directories installed into the Manager Worker Skill library
- Official `alibabacloud-agentloop-experience` Skill installed when AgentLoop Recall is enabled
- RepoPilot MCP exposed through Higress, for example:

```text
https://agentteams.example.com/mcp-servers/repopilot/mcp
```

- Model and GitHub credentials managed by the AgentTeams/Higress gateway

## Render

The manifest intentionally uses three explicit placeholders:

```text
${AGENTTEAMS_MODEL}
${AGENTTEAMS_COPAW_WORKER_IMAGE}
${REPOPILOT_MCP_URL}
```

Render them without writing secrets:

```bash
export AGENTTEAMS_MODEL=qwen3.5-plus
export AGENTTEAMS_COPAW_WORKER_IMAGE=higress-registry.cn-hangzhou.cr.aliyuncs.com/agentteams/agentteams-copaw-worker:v1.2.2
export REPOPILOT_MCP_URL=https://agentteams.example.com/mcp-servers/repopilot/mcp
envsubst < deploy/agentteams/repopilot-team.yaml > /tmp/repopilot-team.yaml
agt apply -f /tmp/repopilot-team.yaml
```

The model API key and GitHub credential are not part of this manifest.

CoPaw is the default Worker runtime exposed by the AgentTeams `v1.2.2`
installer. The QwenPaw runtime remains opt-in in this release and is not used by
the reproducible RepoPilot deployment.

## Validate

```bash
agt get workers -o json
agt get teams -o json
```

Expected state:

- all six Workers: `Running`
- `repopilot-maintainers`: `Active`
- exactly one `team_leader`
- every Worker has the RepoPilot MCP endpoint assigned
