import { getMessages } from './messages.js';
import { CommitFeedback, EvaluationValues, FunctionContext, PullRequestFeedback } from './types.js';

const specialContext: Record<string, string> = {
	'.gitignore':
		"Keep in mind this is the .gitignore file. What you see here is what is ignored by git, not what is included in version control. Just because something is listed here it doesn't mean it was ever added to version control.",
};

export function fileTemplate(filename: string, context: FunctionContext, patch: string) {
	let result = `
interface Issue {
	type: 'Style' | 'Structure' | 'Quality' | 'Security' | 'Testing' | 'Documentation' | 'Performance' | 'Maintainability' | 'Readability' | 'Design' | 'Other';
	severity: 'Low' | 'Medium' | 'High';
	desc: string;
	line: number;
	snippet: string;
	suggestions: string[];
	suggestedCodeReplacement: string;
}

interface IssueEnumeration {
	issues: Issue[];
	comments: string; // this is where you should give feedback to the user, tell them what they did wrong and/or praise them.
}
Analyze the diff to this file and enumerate all issues with the diff, returning an IssueEnumeration. ${
		specialContext[filename] ? `\n\n${specialContext[filename]}` : ''
	}\n\n
As context, here is the pull request body. Check if the changes made in this file are reflected in the PR description and are relevant to achieving the PR's goal:
${context.prMessage}
\n\n
This extra content was also passed by a user, perhaps replying to a previous evaluation you made:
${context.responseContext}
\n\n
${context.botContext ? 'And here is the context of the project:' : ''}
${context.botContext}`;

	if (patch)
		result += `
\n\n--- START OF DIFF (GIVE FEEDBACK TO THIS) ---\n\n
${patch}
\n\n--- END OF DIFF ---\n\n`;
	else {
		result += '\n\nThere are no diffs in this file, so no need to return ';
	}
	return result;
}

export function commitTemplate(feedback: CommitFeedback, commitMessage: string, context: FunctionContext) {
	let prompt = `
interface Feedback {
	eval: 'Excellent' | 'VeryGood' | 'Acceptable' | 'NeedsImprovement' | 'Unacceptable';
	commitMessageComments: string; // in case the user doesn't submit relevant commit titles and/or descriptions, this is where you should call them out on it.
}

Keeping in mind all the issues found in the files of this commit, evaluate the commit and provide a Feedback object with an additional commitMessageComments string field. As a reminder, here is the analysis of the files in this commit:
${JSON.stringify(feedback.files, null, 2)}\n\n
And here is the commit message (keep in mind commit messages should be succint and descriptive, and should try to be under 50 characters. Don't be harsh on commit messages unless they are majorly deficient.):
${commitMessage}\n\n
\n\n
As context, here is the pull request body. Check if the changes made in this commit are reflected in the PR description and are relevant to achieving the PR's goal:\n\n
${context.prMessage}
\n\n
This extra content was also passed by a user, perhaps replying to a previous evaluation you made:
${context.responseContext}
\n\n`;
	if (context.botContext) {
		prompt += `And here is the context of the project:\n${context.botContext}`;
	}
	return prompt;
}

export function prDescriptionTemplate(description: string) {
	return `
interface TextFeedback {
	value: string;
}
Greet the user then give feedback on their Pull Request body, making it clear you're talking about the Pull Request's description and returning a TextFeedback:\n\n${description}`;
}

export function pullRequestResponseTemplate(response: PullRequestFeedback) {
	let markdown = '';
	if (response.responseContext) {
		markdown += `<blockquote>${response.responseContext}</blockquote>\n\n`;
	}
	markdown += `${response.prMessageFeedback}\n\n`;

	for (const commit of response.commits) {
		markdown += `\n<hr style="border:4px solid gray">\n\n## Commit ${commit.hash}\n\n`;
		markdown += `<blockquote>${commit.commitMessage}</blockquote>\n\n`;
		if (commit.commitMessageComments?.trim()) {
			markdown += `${commit.commitMessageComments}\n\n\n`;
		}

		for (const file of commit.files) {
			markdown += `\n<hr>\n\n### File: \`${file.path}\`\n`;
			if (file.comments?.trim()) {
				markdown += `${file.comments}\n\n\n`;
			}

			// Loop through each issue in the file. This was given by chatGPT, so we don't trust that it actually exists
			if (!file.issues || !Array.isArray(file.issues)) continue;
			for (const [index, issue] of Object.entries(file.issues)) {
				markdown += `\n\n<hr>\n\n`;
				markdown += `#### Problem ${Number(index) + 1} (${issue.type})\n`;
				markdown += `**Severity:** ${issue.severity}\n`;
				markdown += `**Description:** ${issue.desc}\n`;
				if (issue.line) {
					markdown += `**Line:** ${issue.line}\n`;
				}
				if (issue.snippet?.trim()) {
					markdown += `**Snippet:**\n`;
					markdown += '```\n';
					markdown += `${issue.snippet}\n`;
					markdown += '```\n';
				}
				if (issue.suggestions?.length > 0) {
					markdown += `**Suggestions:**\n`;

					for (const suggestion of issue.suggestions) {
						markdown += `- ${suggestion}\n`;
					}
				}
				if (issue.suggestedCodeReplacement?.trim()) {
					markdown += `\n\n**Suggested Code Replacement:**\n`;
					markdown += '```\n';
					markdown += `${issue.suggestedCodeReplacement}\n`;
					markdown += '```\n';
				}

				markdown += '\n';
			}
		}

		if (commit.evaluation) {
			markdown += `**Evaluation:** ${EvaluationValues[commit.evaluation]}\n\n`;
		} else {
			markdown += `**Evaluation:** No evaluation provided.\n\n`;
		}
	}

	return markdown;
}

export function gitHubMessageTemplate(pullRequestFeedback: PullRequestFeedback) {
	return `_${getMessages().messageByCodeGPT}_ \n\n

${pullRequestResponseTemplate(pullRequestFeedback)}

<hr>

<details>
	<summary>Raw JSON</summary>

\`\`\`json
${JSON.stringify(pullRequestFeedback, null, 2)}
\`\`\`

</details>`;
}
