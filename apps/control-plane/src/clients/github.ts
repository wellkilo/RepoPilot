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

export interface GitHubPullRequest {
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft: boolean;
  htmlUrl: string;
  baseRef: string;
  baseSha: string;
  headRef: string;
  headSha: string;
  author: string | null;
  changedFiles: number;
  additions: number;
  deletions: number;
}

export interface GitHubPullRequestFile {
  sha: string;
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch: string | null;
  blobUrl: string;
}

interface GitHubPullRequestFileResponse {
  sha: string;
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  blob_url: string;
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

export interface PullRequestCommentResult {
  id: number;
  htmlUrl: string;
  action: "created" | "updated";
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

  async getPullRequest(
    owner: string,
    repository: string,
    pullNumber: number
  ): Promise<GitHubPullRequest> {
    const response = await this.request<{
      number: number;
      title: string;
      body: string | null;
      state: string;
      draft: boolean;
      html_url: string;
      base: { ref: string; sha: string };
      head: { ref: string; sha: string };
      user: { login: string } | null;
      changed_files: number;
      additions: number;
      deletions: number;
    }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls/${pullNumber}`);
    return {
      number: response.number,
      title: response.title,
      body: response.body,
      state: response.state,
      draft: response.draft,
      htmlUrl: response.html_url,
      baseRef: response.base.ref,
      baseSha: response.base.sha,
      headRef: response.head.ref,
      headSha: response.head.sha,
      author: response.user?.login ?? null,
      changedFiles: response.changed_files,
      additions: response.additions,
      deletions: response.deletions
    };
  }

  async listPullRequestFiles(
    owner: string,
    repository: string,
    pullNumber: number
  ): Promise<GitHubPullRequestFile[]> {
    const files: GitHubPullRequestFile[] = [];
    for (let page = 1; page <= 30; page += 1) {
      const response = await this.getPullRequestFilesPage(owner, repository, pullNumber, page);
      files.push(...response);
      if (response.length < 100) {
        break;
      }
    }
    return files;
  }

  async getPullRequestFilesPage(
    owner: string,
    repository: string,
    pullNumber: number,
    page: number
  ): Promise<GitHubPullRequestFile[]> {
    const response = await this.request<GitHubPullRequestFileResponse[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls/${pullNumber}/files?per_page=100&page=${page}`
    );
    return response.map((file) => ({
      sha: file.sha,
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch ?? null,
      blobUrl: file.blob_url
    }));
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

  async upsertPullRequestComment(
    owner: string,
    repository: string,
    pullNumber: number,
    marker: string,
    body: string
  ): Promise<PullRequestCommentResult> {
    const comments: Array<{ id: number; body: string | null; html_url: string }> = [];
    let listingComplete = false;
    for (let page = 1; page <= 30; page += 1) {
      const response = await this.request<
        Array<{ id: number; body: string | null; html_url: string }>
      >(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues/${pullNumber}/comments?per_page=100&page=${page}`
      );
      comments.push(...response);
      if (response.some((comment) => comment.body?.includes(marker))) {
        listingComplete = true;
        break;
      }
      if (response.length < 100) {
        listingComplete = true;
        break;
      }
    }
    const existing = comments.find((comment) => comment.body?.includes(marker));
    if (existing) {
      const updated = await this.request<{ id: number; html_url: string }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues/comments/${existing.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ body })
        }
      );
      return { id: updated.id, htmlUrl: updated.html_url, action: "updated" };
    }
    if (!listingComplete) {
      throw new Error(
        `GitHub comment listing exceeded 30 pages for ${owner}/${repository}#${pullNumber}`
      );
    }

    const created = await this.request<{ id: number; html_url: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues/${pullNumber}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ body })
      }
    );
    return { id: created.id, htmlUrl: created.html_url, action: "created" };
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
        "User-Agent": "RepoPilot/0.2",
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
