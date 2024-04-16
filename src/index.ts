import { readFileSync } from 'fs';
import { processPullRequest } from './processing.js';
import { IssueCommentCreatedEvent, PullRequestOpenedEvent } from '@octokit/webhooks-types';
import * as core from '@actions/core';

async function run() {
	if (!process.env.GITHUB_EVENT_PATH) {
		throw new Error('GITHUB_EVENT_PATH is not set');
	}
	process.env.OPENAI_ASSISTANT_ID = core.getInput('OPENAI_ASSISTANT_ID');

	const eventPath = process.env.GITHUB_EVENT_PATH;
	console.log('GITHUB_EVENT_PATH: ', eventPath);
	const event = readFileSync(eventPath, 'utf8');
	console.log('Event: ', event);

	const payload: PullRequestOpenedEvent | IssueCommentCreatedEvent = JSON.parse(event);
	if (payload.action !== 'opened' && payload.action !== 'created') {
		return;
	}

	return await processPullRequest(payload);
}

run();
