export enum Evaluation {
	Excellent = 'Excellent',
	VeryGood = 'VeryGood',
	Acceptable = 'Acceptable',
	NeedsImprovement = 'NeedsImprovement',
	Unacceptable = 'Unacceptable',
}

export const EvaluationValues = {
	[Evaluation.Excellent]: '🏆 Excellent',
	[Evaluation.VeryGood]: '👍 Very Good',
	[Evaluation.Acceptable]: '🔄 Acceptable',
	[Evaluation.NeedsImprovement]: '⚠️ Needs Improvement',
	[Evaluation.Unacceptable]: '❌ Unacceptable',
};

export enum IssueType {
	Style = 'Style',
	Structure = 'Structure',
	Quality = 'Quality',
	Security = 'Security',
	Testing = 'Testing',
	Documentation = 'Documentation',
	Performance = 'Performance',
	Mainainability = 'Maintainability',
	Readability = 'Readability',
	Design = 'Design',
	Other = 'Other',
}

export enum Severity {
	Low = 'Low',
	Medium = 'Medium',
	High = 'High',
}

export interface Issue {
	type: IssueType;
	severity: Severity;
	desc: string;
	line: number;
	snippet: string;
	suggestions: string[];
	suggestedCodeReplacement: string;
}

export interface File {
	path: string;
	issues: Issue[];
	comments: string;
}

export interface CommitFeedback {
	hash: string;
	commitMessage: string;
	files: File[];
	evaluation: Evaluation | null;
	commitMessageComments: string;
}

export interface PullRequestFeedback {
	commits: CommitFeedback[];
	prMessageFeedback: string;
	responseContext: string;
}

export interface FunctionContext {
	prMessage: string;
	botContext: string;
	responseContext: string;
}
