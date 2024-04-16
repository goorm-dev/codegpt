const messages = {
	noPRDescription: 'No PR description provided. Please provide a description of the changes in this PR.',
	messageByCodeGPT: 'The following is a message from CodeGPT:',
	codeGPTSummon: 'CodeGPT',
	noFilePatch: "I can't analyze this file because there are no diffs in it. It's likely a binary file or similar.",
};

export function getMessages() {
	return messages;
}
