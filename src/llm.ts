import OpenAI from 'openai';

export type LLMClient = {
	openai: OpenAI;
	_assistant_id: string;
};

export function createClient(): LLMClient {
	const { OPENAI_ASSISTANT_ID } = process.env;
	if (!OPENAI_ASSISTANT_ID) {
		throw new Error('OPENAI_ASSISTANT_ID is not set');
	}
	return {
		openai: new OpenAI(),
		_assistant_id: OPENAI_ASSISTANT_ID,
	};
}

export async function getJSONResponse(client: LLMClient, content: string) {
	let run;
	try {
		run = await client.openai.beta.threads.createAndRunPoll(
			{
				assistant_id: client._assistant_id,
				thread: {
					messages: [
						{
							role: 'user',
							content,
						},
					],
				},
				response_format: {
					type: 'json_object',
				},
			},
			{ pollIntervalMs: 5000 },
		);

		if (run.status === 'completed') {
			const messages = await client.openai.beta.threads.messages.list(run.thread_id, {
				order: 'desc',
				limit: 1,
			});
			for (const message of messages.data) {
				try {
					if (message.content[0].type === 'text') {
						return JSON.parse(message.content[0].text?.value || '{}');
					}
				} catch (e) {
					console.error('Thread ID: ' + run.thread_id, e);
				}
			}
		}
	} catch (e) {
		console.error('Thread ID: ' + run?.thread_id, e);
	}
	return {};
}
