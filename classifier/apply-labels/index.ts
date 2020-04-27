import * as core from '@actions/core'
import { readFileSync } from 'fs'
import { join } from 'path'
import { context } from '@actions/github'
import { OctoKit, OctoKitIssue } from '../../api/octokit'
import { getRequiredInput, logErrorToIssue, logRateLimit } from '../../utils/utils'

const token = getRequiredInput('token')
const allowLabels = getRequiredInput('allowLabels').split('|')

type ClassifierConfig = {
	[area: string]: { skipLabeling?: boolean; comment?: string; assign?: [string] }
}

const main = async () => {
	const github = new OctoKit(token, context.repo)
	const config: ClassifierConfig = await github.readConfig(getRequiredInput('config-path'))
	const labelings: { number: number; labels: string[] }[] = JSON.parse(
		readFileSync(join(__dirname, '../issue_labels.json'), { encoding: 'utf8' }),
	)
	for (const labeling of labelings) {
		const label = labeling.labels.length === 1 ? labeling.labels[0] : undefined
		const issue = new OctoKitIssue(token, context.repo, { number: labeling.number })
		const issueData = await issue.getIssue()
		if (
			!label ||
			issueData.assignee ||
			issueData.numComments ||
			issueData.labels.some((label) => !allowLabels.includes(label))
		) {
			continue
		}

		const labelConfig = config[label]
		await Promise.all<any>([
			labelConfig?.skipLabeling ? Promise.resolve() : issue.addLabel(label),
			labelConfig?.comment ? issue.postComment(labelConfig.comment) : Promise.resolve(),
			...(labelConfig?.assign ? labelConfig.assign.map((assignee) => issue.addAssignee(assignee)) : []),
		])
	}
}

main()
	.then(() => logRateLimit(token))
	.catch(async (error) => {
		core.setFailed(error.message)
		await logErrorToIssue(error.message, true, token)
	})
