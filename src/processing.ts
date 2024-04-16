import { Octokit } from '@octokit/action';
import { Endpoints } from '@octokit/types';
import { IssueCommentCreatedEvent, PullRequestOpenedEvent } from '@octokit/webhooks-types';
import { LLMClient, getJSONResponse, createClient } from './llm.js';
import { getMessages } from './messages.js';
import { commitTemplate, fileTemplate, gitHubMessageTemplate, prDescriptionTemplate } from './templates.js';
import { FunctionContext, CommitFeedback, Evaluation, PullRequestFeedback, Issue, File } from './types.js';

async function getCodeMd(payload: PullRequestOpenedEvent | IssueCommentCreatedEvent, octokit: Octokit) {
	try {
		// get /codegpt.md from the current repo if it exists
		const codeGPTMD = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
			owner: payload.repository.owner.login,
			repo: payload.repository.name,
			path: 'CODEGPT.md',
		});
		if (Array.isArray(codeGPTMD.data) && codeGPTMD.data.length > 0 && codeGPTMD.data[0].type === 'file' && codeGPTMD.data[0].content) {
			return atob(codeGPTMD.data[0].content);
		} else if (!Array.isArray(codeGPTMD.data) && codeGPTMD.data && codeGPTMD.data.type === 'file' && codeGPTMD.data.content) {
			return atob(codeGPTMD.data.content);
		}
	} catch (e) {
		console.log('No CODEGPT.md file found in the repository');
	}
	return '';
}

async function processFile(
	file: Exclude<Endpoints['GET /repos/{owner}/{repo}/commits/{ref}']['response']['data']['files'], undefined>[number],
	client: LLMClient,
	context: FunctionContext,
): Promise<File> {
	const f: File = {
		path: file.filename,
		issues: [],
		comments: '',
	};

	if (file.patch) {
		const message = fileTemplate(file.filename, context, file.patch);
		await getJSONResponse(client, message).then((response) => {
			const issues: {
				issues: Issue[];
				comments: string;
			} = response;
			f.issues = issues.issues;
			f.comments = issues.comments;
		});
	} else {
		f.comments = getMessages().noFilePatch;
	}

	return f;
}

async function processCommit(
	commit: {
		sha: string;
		commit: Endpoints['GET /repos/{owner}/{repo}/commits/{ref}']['response']['data']['commit'];
		owner: string;
		repo: string;
	},
	context: FunctionContext,
	client: LLMClient,
	octokit: Octokit,
): Promise<CommitFeedback> {
	const feedback: CommitFeedback = {
		hash: commit.sha,
		commitMessage: commit.commit.message,
		files: [],
		evaluation: null,
		commitMessageComments: '',
	};

	const commit_data = await octokit.request('GET /repos/{owner}/{repo}/commits/{ref}', {
		owner: commit.owner,
		repo: commit.repo,
		ref: commit.sha,
	});

	feedback.files = await Promise.all(commit_data.data.files?.map((file) => processFile(file, client, context)) || []);

	let prompt = commitTemplate(feedback, commit.commit.message, context);

	await getJSONResponse(client, prompt).then((response) => {
		const evaluation: { eval: Evaluation; commitMessageComments: string } = response;
		feedback.evaluation = evaluation.eval;
		feedback.commitMessageComments = evaluation.commitMessageComments;
	});

	return feedback;
}

async function processPRDescription(description: string, client: LLMClient): Promise<string> {
	if (!description?.trim()) {
		return getMessages().noPRDescription;
	}

	let result = '';

	await getJSONResponse(client, prDescriptionTemplate(description)).then((res) => {
		result = res.value;
	});

	return result;
}

async function fetchRemotePullRequest(payload: PullRequestOpenedEvent | IssueCommentCreatedEvent, octokit: Octokit) {
	const remotePR = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
		owner: payload.repository.owner.login,
		repo: payload.repository.name,
		pull_number: payload.action === 'created' ? payload.issue.number : payload.pull_request.number,
	});
	return remotePR.data;
}

async function extractPullRequest(
	payload: PullRequestOpenedEvent | IssueCommentCreatedEvent,
	octokit: Octokit,
): Promise<{
	responseContext: string;
	pullRequest:
		| Endpoints['GET /repos/{owner}/{repo}/pulls/{pull_number}']['response']['data']
		| PullRequestOpenedEvent['pull_request']
		| null;
}> {
	if (
		payload.action === 'created' &&
		payload.comment?.body.includes(getMessages().codeGPTSummon) &&
		!payload.comment.body.includes(getMessages().messageByCodeGPT)
	) {
		return { responseContext: payload.comment.body, pullRequest: await fetchRemotePullRequest(payload, octokit) };
	} else if (payload.action === 'opened') {
		return { responseContext: '', pullRequest: payload.pull_request };
	}
	return { responseContext: '', pullRequest: null };
}

export async function processPullRequest(payload: PullRequestOpenedEvent | IssueCommentCreatedEvent): Promise<string> {
	const octokit = new Octokit();

	let { pullRequest, responseContext } = await extractPullRequest(payload, octokit);
	if (!pullRequest) throw new Error('No pull request found');

	const client = createClient();

	const pullRequestFeedback: PullRequestFeedback = {
		commits: [],
		prMessageFeedback: '',
		responseContext: responseContext,
	};
	let botContext = await getCodeMd(payload, octokit);

	const prDescriptionPromise = processPRDescription(pullRequest.body ?? '', client);

	const commits = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/commits', {
		owner: payload.repository.owner.login,
		repo: payload.repository.name,
		pull_number: pullRequest.number,
	});

	const promises = commits.data.map((commit) =>
		processCommit(
			{
				sha: commit.sha,
				owner: payload.repository.owner.login,
				repo: payload.repository.name,
				commit: commit.commit,
			},
			{ prMessage: pullRequest.body ?? '', botContext, responseContext },
			client,
			octokit,
		),
	);

	pullRequestFeedback.commits = await Promise.all(promises);

	pullRequestFeedback.prMessageFeedback = await prDescriptionPromise;

	console.log('Result: ', pullRequestFeedback);

	const result = gitHubMessageTemplate(pullRequestFeedback);

	await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
		owner: payload.repository.owner.login,
		repo: payload.repository.name,
		issue_number: pullRequest.number,
		body: result,
	});

	return result;
}
