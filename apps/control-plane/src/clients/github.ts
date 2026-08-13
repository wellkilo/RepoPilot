import { createHmac, timingSafeEqual } from "node:crypto";

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  labels: string[];
  htmlUrl: string;
}

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  status: string | null;
  conclusion: string | null;
  headSha: string;
  htmlUrl: string;
}

export interface PullRequestInput {
  owner: string;
  repository: string;
  title: string;
  body: string;
  head: string;
  base: string;
}

export interface PullRequestResult {
  number: number;
  htmlUrl: string;
  state: string;
}

export interface MergePullRequestInput {
  owner: string;
  repository: string;
  pullNumber: number;
  commitTitle?: string;
}

interface GitHubErrorBody {
  message?: string;
  documentation_url?: string;
}

export class GitHubClient {
  constructor(
    private readonly token: string | undefined,
    private readonly baseUrl = "https://api.github.com"
  ) {}

  verifyWebhookSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
    if (!signatureHeader.startsWith("sha256=")) {
      return false;
    }
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const actual = signatureHeader.slice("sha256=".length);
    if (!/^[a-f0-9]{64}$/i.test(actual)) {
      return false;
    }
    return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
  }

  async getIssue(owner: string, repository: string, issueNumber: number): Promise<GitHubIssue> {
    const response = await this.request<{
      number: number;
      title: string;
      body: string | null;
      state: string;
      labels: Array<string | { name?: string | null }>;
      html_url: string;
    }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues/${issueNumber}`
    );
    return {
      number: response.number,
      title: response.title,
      body: response.body,
      state: response.state,
      labels: response.labels
        .map((label) => (typeof label === "string" ? label : label.name))
        .filter((label): label is string => Boolean(label)),
      htmlUrl: response.html_url
    };
  }

  async getWorkflowRun(
    owner: string,
    repository: string,
    workflowRunId: number
  ): Promise<GitHubWorkflowRun> {
    const response = await this.request<{
      id: number;
      name: string;
      status: string | null;
      conclusion: string | null;
      head_sha: string;
      html_url: string;
    }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/runs/${workflowRunId}`
    );
    return {
      id: response.id,
      name: response.name,
      status: response.status,
      conclusion: response.conclusion,
      headSha: response.head_sha,
      htmlUrl: response.html_url
    };
  }

  async createPullRequest(input: PullRequestInput): Promise<PullRequestResult> {
    const response = await this.request<{
      number: number;
      html_url: string;
      state: string;
    }>(`/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        head: input.head,
        base: input.base
      })
    });
    return {
      number: response.number,
      htmlUrl: response.html_url,
      state: response.state
    };
  }

  async getPullRequestChecks(
    owner: string,
    repository: string,
    pullNumber: number
  ): Promise<{
    pullNumber: number;
    sha: string;
    state: string;
    statuses: Array<{ context: string; state: string; description: string | null }>;
    checkRuns: Array<{
      id: number;
      name: string;
      status: string;
      conclusion: string | null;
      htmlUrl: string | null;
    }>;
  }> {
    const pull = await this.request<{ head: { sha: string } }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls/${pullNumber}`
    );
    const [status, checks] = await Promise.all([
      this.request<{
        state: string;
        statuses: Array<{ context: string; state: string; description: string | null }>;
      }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits/${pull.head.sha}/status`
      ),
      this.request<{
        check_runs: Array<{
          id: number;
          name: string;
          status: string;
          conclusion: string | null;
          html_url: string | null;
        }>;
      }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits/${pull.head.sha}/check-runs`
      )
    ]);
    return {
      pullNumber,
      sha: pull.head.sha,
      state: status.state,
      statuses: status.statuses,
      checkRuns: checks.check_runs.map((check) => ({
        id: check.id,
        name: check.name,
        status: check.status,
        conclusion: check.conclusion,
        htmlUrl: check.html_url
      }))
    };
  }

  async mergePullRequest(
    input: MergePullRequestInput
  ): Promise<{ merged: boolean; message: string; sha: string | null }> {
    const response = await this.request<{
      merged: boolean;
      message: string;
      sha?: string;
    }>(
      `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}/pulls/${input.pullNumber}/merge`,
      {
        method: "PUT",
        body: JSON.stringify({
          merge_method: "squash",
          ...(input.commitTitle ? { commit_title: input.commitTitle } : {})
        })
      }
    );
    return {
      merged: response.merged,
      message: response.message,
      sha: response.sha ?? null
    };
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.token) {
      throw new Error("GITHUB_TOKEN is required for GitHub API calls");
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "User-Agent": "RepoPilot/0.1",
        "X-GitHub-Api-Version": "2022-11-28",
        ...init.headers
      }
    });
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as GitHubErrorBody;
      throw new Error(
        `GitHub API ${response.status}: ${error.message ?? response.statusText}${
          error.documentation_url ? ` (${error.documentation_url})` : ""
        }`
      );
    }
    return (await response.json()) as T;
  }
}
