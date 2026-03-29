import { Octokit } from '@octokit/rest';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { pipeline } from 'stream/promises';
import fetch from 'node-fetch';

/**
 * GitHub API client for managing releases, commits, pull requests, and issues
 */
export class GitHubClient {
  constructor(token) {
    this.octokit = new Octokit({ auth: token });
    this.token = token;
  }

  /**
   * Get the latest release for a repository
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @returns {Promise<Object>} Latest release data
   */
  async getLatestRelease(owner, repo) {
    try {
      const { data } = await this.octokit.rest.repos.getLatestRelease({
        owner,
        repo
      });
      return {
        id: data.id,
        tagName: data.tag_name,
        name: data.name,
        body: data.body,
        draft: data.draft,
        prerelease: data.prerelease,
        publishedAt: data.published_at,
        assets: data.assets.map(asset => ({
          id: asset.id,
          name: asset.name,
          url: asset.url,
          browserDownloadUrl: asset.browser_download_url,
          size: asset.size,
          contentType: asset.content_type
        })),
        tarballUrl: data.tarball_url,
        zipballUrl: data.zipball_url
      };
    } catch (error) {
      throw new Error(`Failed to get latest release: ${error.message}`);
    }
  }

  /**
   * Get commits since a specific date
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} since - ISO 8601 timestamp
   * @param {Object} options - Additional options
   * @returns {Promise<Array>} List of commits
   */
  async getCommits(owner, repo, since, options = {}) {
    try {
      const { data } = await this.octokit.rest.repos.listCommits({
        owner,
        repo,
        since,
        sha: options.branch || 'main',
        per_page: options.perPage || 100,
        page: options.page || 1
      });
      
      return data.map(commit => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: {
          name: commit.commit.author.name,
          email: commit.commit.author.email,
          date: commit.commit.author.date,
          username: commit.author?.login
        },
        committer: {
          name: commit.commit.committer.name,
          email: commit.commit.committer.email,
          date: commit.commit.committer.date,
          username: commit.committer?.login
        },
        url: commit.html_url
      }));
    } catch (error) {
      throw new Error(`Failed to get commits: ${error.message}`);
    }
  }

  /**
   * Download an asset to a local path
   * @param {string} url - Asset URL
   * @param {string} path - Local download path
   * @param {Object} options - Download options
   * @returns {Promise<Object>} Download result with path and size
   */
  async downloadAsset(url, path, _options = {}) {
    try {
      // Ensure directory exists
      await mkdir(dirname(path), { recursive: true });

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/octet-stream',
          'User-Agent': 'CogniMesh-UpdateManager/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const fileStream = createWriteStream(path);
      await pipeline(response.body, fileStream);

      const stats = await import('fs/promises').then(fs => fs.stat(path));
      
      return {
        path,
        size: stats.size,
        downloadedAt: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to download asset: ${error.message}`);
    }
  }

  /**
   * Create a pull request
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} title - PR title
   * @param {string} body - PR body
   * @param {string} head - Branch containing changes
   * @param {string} base - Branch to merge into
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Created PR data
   */
  async createPullRequest(owner, repo, title, body, head, base, options = {}) {
    try {
      const { data } = await this.octokit.rest.pulls.create({
        owner,
        repo,
        title,
        body,
        head,
        base,
        draft: options.draft || false,
        maintainer_can_modify: options.maintainerCanModify !== false
      });

      return {
        number: data.number,
        title: data.title,
        state: data.state,
        url: data.html_url,
        diffUrl: data.diff_url,
        patchUrl: data.patch_url,
        head: {
          ref: data.head.ref,
          sha: data.head.sha
        },
        base: {
          ref: data.base.ref,
          sha: data.base.sha
        },
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        mergeable: data.mergeable,
        mergeableState: data.mergeable_state
      };
    } catch (error) {
      throw new Error(`Failed to create pull request: ${error.message}`);
    }
  }

  /**
   * Merge a pull request
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} pullNumber - PR number
   * @param {Object} options - Merge options
   * @returns {Promise<Object>} Merge result
   */
  async mergePullRequest(owner, repo, pullNumber, options = {}) {
    try {
      const { data } = await this.octokit.rest.pulls.merge({
        owner,
        repo,
        pull_number: pullNumber,
        commit_title: options.commitTitle,
        commit_message: options.commitMessage,
        sha: options.sha,
        merge_method: options.mergeMethod || 'merge' // merge, squash, rebase
      });

      return {
        sha: data.sha,
        merged: data.merged,
        message: data.message,
        mergedAt: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to merge pull request: ${error.message}`);
    }
  }

  /**
   * Create an issue
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} title - Issue title
   * @param {string} body - Issue body
   * @param {Array<string>} labels - Issue labels
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Created issue data
   */
  async createIssue(owner, repo, title, body, labels = [], options = {}) {
    try {
      const { data } = await this.octokit.rest.issues.create({
        owner,
        repo,
        title,
        body,
        labels,
        assignees: options.assignees,
        milestone: options.milestone,
        state: options.state || 'open'
      });

      return {
        number: data.number,
        title: data.title,
        state: data.state,
        url: data.html_url,
        labels: data.labels.map(label => ({
          name: label.name,
          color: label.color,
          description: label.description
        })),
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        assignees: data.assignees.map(assignee => assignee.login)
      };
    } catch (error) {
      throw new Error(`Failed to create issue: ${error.message}`);
    }
  }

  /**
   * Get release by tag
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} tag - Tag name
   * @returns {Promise<Object>} Release data
   */
  async getReleaseByTag(owner, repo, tag) {
    try {
      const { data } = await this.octokit.rest.repos.getReleaseByTag({
        owner,
        repo,
        tag
      });
      return {
        id: data.id,
        tagName: data.tag_name,
        name: data.name,
        body: data.body,
        draft: data.draft,
        prerelease: data.prerelease,
        publishedAt: data.published_at,
        assets: data.assets.map(asset => ({
          id: asset.id,
          name: asset.name,
          url: asset.url,
          browserDownloadUrl: asset.browser_download_url,
          size: asset.size,
          contentType: asset.content_type
        }))
      };
    } catch (error) {
      throw new Error(`Failed to get release by tag: ${error.message}`);
    }
  }

  /**
   * Compare two commits/tags
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} base - Base reference
   * @param {string} head - Head reference
   * @returns {Promise<Object>} Comparison result
   */
  async compareCommits(owner, repo, base, head) {
    try {
      const { data } = await this.octokit.rest.repos.compareCommits({
        owner,
        repo,
        base,
        head
      });

      return {
        status: data.status, // ahead, behind, diverged
        aheadBy: data.ahead_by,
        behindBy: data.behind_by,
        totalCommits: data.total_commits,
        commits: data.commits.map(commit => ({
          sha: commit.sha,
          message: commit.commit.message,
          author: commit.author?.login,
          date: commit.commit.author.date
        })),
        files: data.files.map(file => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes
        }))
      };
    } catch (error) {
      throw new Error(`Failed to compare commits: ${error.message}`);
    }
  }
}
