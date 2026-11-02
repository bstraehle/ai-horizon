# Infrastructure as code

`template.yaml` is the AI HORIZON production infrastructure, managed by the CloudFormation stack
**`ai-horizon`** in `us-west-2`. The live resources were imported into the stack (CloudFormation IaC
generator + resource import), so the template holds the real names and IDs; a drift check after
the import reported the stack `IN_SYNC`.

| Area     | Resources                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------ |
| Site     | S3 bucket `ai-horizon` + bucket policy, CloudFront distribution, origin access control, cache policy                     |
| API      | REST API `0p6x6bw6c2`, `/leaderboard`, `/purchases`, `/purchases/stripe`, 7 methods, stage `dev`, CORS gateway responses |
| Backend  | Lambdas `ai-horizon-leaderboard`, `-analysis`, `-purchases` (configuration) + invoke permissions                         |
| Data     | DynamoDB tables `ai-horizon-leaderboard`, `ai-horizon-purchases`                                                         |
| Identity | Cognito identity pool (unauthenticated) + role mapping, IAM roles and managed policies                                   |
| Secrets  | `Eleven_Labs`, `ai-horizon-stripe`, `ai-horizon-purchases-signing` (no values)                                           |
| Alerts   | SNS topic `ai-horizon-alerts`                                                                                            |

Every resource has `DeletionPolicy` and `UpdateReplacePolicy` `Retain`: deleting the stack or a
replacement never deletes production resources or data.

## Not in the template (on purpose)

- **Lambda code**: deployed as before with `aws lambda update-function-code` (see `AGENTS.md`).
  The template's `Code` is a placeholder; CloudFormation owns only the configuration (runtime,
  memory, timeout, role, environment variables).
- **Secret values**: set with `aws secretsmanager put-secret-value` from `.secrets/` (gitignored).
- The alerts e-mail subscription (a personal address), the ACM certificate (`us-east-1`) and the
  CloudFront function `apex-to-www-redirect` (referenced by ARN).

## Changing the infrastructure

Edit `template.yaml`, then review a change set before anything happens:

```bash
aws cloudformation validate-template --region us-west-2 --template-body file://infra/template.yaml
aws cloudformation create-change-set --region us-west-2 --stack-name ai-horizon \
  --change-set-name my-change --template-body file://infra/template.yaml --capabilities CAPABILITY_NAMED_IAM
aws cloudformation describe-change-set --region us-west-2 --stack-name ai-horizon --change-set-name my-change \
  --query "Changes[].ResourceChange.[Action,LogicalResourceId,Replacement]" --output table
aws cloudformation execute-change-set --region us-west-2 --stack-name ai-horizon --change-set-name my-change
```

Only execute when the change set lists exactly the intended actions (no unexpected `Replacement`).
Changes made outside the template (console, CLI) show up as drift:

```bash
aws cloudformation detect-stack-drift --region us-west-2 --stack-name ai-horizon
aws cloudformation describe-stack-resource-drifts --region us-west-2 --stack-name ai-horizon \
  --stack-resource-drift-status-filters MODIFIED DELETED
```

Fold such changes back into the template (or revert them) so the stack stays `IN_SYNC`.
`import-resources.json` lists the identifiers used for the import; it is only needed to import
resources again (an `IMPORT` change set with `--resources-to-import`).
