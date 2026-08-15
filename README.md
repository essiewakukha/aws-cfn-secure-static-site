# DevOps Portfolio — React + CloudFormation Canary Pipeline

A React SPA deployed to AWS via CloudFormation, served from a private S3
origin behind two CloudFront distributions (primary + staging), with every
release canaried through **CloudFront Continuous Deployment** before it goes
fully live — all driven by a GitHub Actions pipeline with no long-lived AWS
credentials (OIDC).

**Live site:** https://d1xzsblye2kc6p.cloudfront.net

## Repo layout

app/ React app (Vite)
cloudformation/ 5 nested-stack templates
scripts/ Canary health check + promotion logic
.github/workflows/ deploy.yml — the CI/CD pipeline

## Stack
- React 19 + Vite, plain CSS design tokens (`app/src/index.css`)
- CloudFormation: private S3 origin, CloudFront (OAC-secured) primary +
  staging distributions, `ContinuousDeploymentPolicy` for weighted canary
  traffic (capped at 15%, an AWS platform limit), CloudWatch alarm gating
  promotion, GitHub OIDC + least-privilege deploy role
- GitHub Actions: build → test → deploy infra → sync release → bake → check
  canary health → promote or hold

## Local development
```bash
cd app
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs to app/dist/
```

Customize the site by editing `app/src/data/content.js` — name, tagline,
skills, and project list. No component code needs to change.

## Deploying

### One-time bootstrap (do this by hand, once, with your own AWS credentials)

The pipeline needs an IAM role to assume and a bucket to stage templates in
before it can deploy anything itself - so this first step isn't automated.

```bash
aws cloudformation deploy \
  --stack-name react-portfolio-bootstrap \
  --template-file cloudformation/iam.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1 \
  --parameter-overrides \
    AppName=react-portfolio \
    GitHubOrg=your-github-username \
    GitHubOrgId=your-numeric-github-account-id \
    GitHubRepo=your-repo-name \
    GitHubRepoId=your-numeric-github-repo-id \
    CreateOidcProvider=true
```

`GitHubOrgId` and `GitHubRepoId` matter because GitHub's OIDC token now
sends an "immutable" `sub` claim with numeric IDs embedded in it (see
Incident #1 below) - find them via:
```bash
curl -s https://api.github.com/users/YOUR_USERNAME | jq .id
curl -s https://api.github.com/repos/YOUR_USERNAME/YOUR_REPO | jq .id
```

If you've connected GitHub Actions to AWS before on this same account, the
OIDC provider is account-wide (not per-project) and may already exist - set
`CreateOidcProvider=false` and add `ExistingOidcProviderArn=...` instead, or
CloudFormation will fail trying to create a duplicate.

Then read the two outputs and put them in the GitHub repo's
**Settings → Secrets and variables → Actions → Variables** tab:

```bash
aws cloudformation describe-stacks --stack-name react-portfolio-bootstrap \
  --query 'Stacks[0].Outputs'
```

| Output               | GitHub variable name  |
|-----------------------|------------------------|
| `DeployRoleArn`        | `AWS_DEPLOY_ROLE_ARN`  |
| `ArtifactsBucketName`  | `AWS_ARTIFACTS_BUCKET` |

Optionally also add a repo variable `ALERT_EMAIL` if you want deploy/rollback
notifications - you'll get one confirmation email to accept the SNS
subscription the first time the stack deploys.

### Every deploy after that: just push to `main`

`.github/workflows/deploy.yml` handles the rest:

1. **First push** creates the whole stack (S3, both CloudFront distributions,
   the continuous deployment policy, monitoring) with no canary - there's no
   live traffic yet, so there's nothing to canary against.
2. **Every push after that**: builds, uploads the new release to its own
   `releases/<commit-sha>/` prefix, opens a 10% canary on the staging
   distribution, waits for two CloudWatch evaluation periods, and either
   promotes (if the 5xx alarm stayed OK) or leaves it be (if it tripped -
   blast radius was capped at 15% traffic the whole time).

### Checking for drift

`UpdateDistributionWithStagingConfig` changes the primary distribution
outside of CloudFormation's knowledge, which is exactly the kind of thing
that causes stack drift. The pipeline resolves this itself (see
`scripts/canary.sh`), but you can verify it's actually clean:

```bash
aws cloudformation detect-stack-drift --stack-name react-portfolio
# then, after a few seconds:
aws cloudformation describe-stack-drift-detection-status \
  --stack-drift-detection-id <id-from-previous-command>
```

### Manual promote/rollback (if you ever need to intervene)

```bash
# Check the canary alarm directly
aws cloudwatch describe-alarms --alarm-names react-portfolio-canary-5xx-error-rate

# Preview a candidate release before/without exposing it to real traffic
open https://<StagingDomainName from stack outputs>

# Force-stop a canary without promoting (reset weight to 0)
aws cloudformation deploy --stack-name react-portfolio \
  --template-file cloudformation/main.packaged.yml \
  --parameter-overrides CanaryEnabled=false CanaryWeight=0 \
  --capabilities CAPABILITY_NAMED_IAM
```

---

## Incident log: what actually broke, and why

Every one of these happened on a real deploy against a real AWS account.
Logging them here on purpose — a portfolio project that only shows the
happy path doesn't prove you can operate infrastructure; this does.

### 1. OIDC: `Not authorized to perform sts:AssumeRoleWithWebIdentity`
**Symptom:** GitHub Actions could never assume the deploy role, even though
the OIDC provider existed, the trust policy's repo name was correct, and
the `permissions: id-token: write` block was in place.

**Root cause:** GitHub changed the format of the OIDC token's `sub` claim.
It no longer sends the plain `repo:owner/repo:*` string — it sends an
**immutable** form with numeric IDs embedded in the middle:

'''
repo:essiewakukha@137600196/aws-cfn-secure-static-site@1332408105:ref:refs/heads/main 
'''
The trust policy's `StringLike` condition was written for the old
plain-name format, so it silently never matched — `StringLike`'s wildcard
only trails at the end of a pattern, it can't match around an unexpected
segment in the middle of the string.

**Fix:** Decoded the actual JWT the workflow was receiving (via a temporary
debug step that calls the Actions OIDC token endpoint directly and prints
the decoded claims) rather than guessing, then rewrote the trust policy's
`sub` condition to include both the numeric org ID and repo ID:
```yaml
token.actions.githubusercontent.com:sub: !Sub 'repo:${GitHubOrg}@${GitHubOrgId}/${GitHubRepo}@${GitHubRepoId}:*'
```

### 2. Malformed workflow YAML
**Symptom:** `Invalid workflow file — Unexpected value 'deploy'`.

**Root cause:** A stray `deploy:` block (with its own `permissions:` and
`steps:`) ended up nested directly under the `on:` trigger section instead
of under `jobs:` — invalid YAML placement. It also referenced
`secrets.AWS_DEPLOY_ROLE_ARN` instead of `vars.AWS_DEPLOY_ROLE_ARN`, and
the file was missing its top-level `env:` block entirely.

**Fix:** Full-file replacement rather than patching piecemeal, since the
drift between the working copy and what was actually on GitHub had gotten
large enough that diffing it wasn't reliable.

### 3. `TemplateURL parameter of S3Stack resource is invalid`
**Symptom:** `aws cloudformation package` failed trying to upload
`./s3-bucket.yaml`.

**Root cause:** The CloudFormation templates were renamed from `.yaml` to
`.yml` partway through the build (a naming preference), but `main.yml`'s
`TemplateURL` references to the nested stacks weren't updated to match, and
neither were the two shell scripts and the workflow that referenced
`main.yaml`/`main.packaged.yaml` by name.

**Fix:** Grepped every file in the repo for `.yaml` and updated all cross
references together in one pass, rather than one at a time (extension
renames like this are exactly the kind of change that needs a full
find-and-fix sweep, not spot fixes).

### 4. `AccessDenied: cloudformation:DescribeStacks`
**Symptom:** The pipeline's very first real AWS call failed.

**Root cause:** The deploy role's CloudFormation resource ARN pattern was
`stack/${AppName}-*/*` — but the actual stack is named exactly
`react-portfolio`, with no trailing suffix. `AppName-*` requires a literal
hyphen immediately after the name to match, so a stack named exactly
`AppName` (no suffix at all) never matches its own policy.

**Fix:** Changed the wildcard to `${AppName}*/*` (no hyphen), which matches
both the bare name and any suffixed variant.

### 5. `AccessDenied: s3:CreateBucket`
**Symptom:** The S3 nested stack failed to create its bucket.

**Root cause:** The deploy policy only granted **object-level** S3 actions
(`GetObject`, `PutObject`, `DeleteObject`, `ListBucket`) for reading and
writing files inside a bucket — it never granted the **bucket-management**
actions CloudFormation needs to create the bucket itself with its
configured properties (`CreateBucket`, `PutBucketVersioning`,
`PutEncryptionConfiguration`, `PutBucketPublicAccessBlock`,
`PutLifecycleConfiguration`, `PutBucketTagging`, and their `Get*`
counterparts, since CloudFormation reads state back to diff it).

**Fix:** Added the full bucket-management action set. Also proactively
added the equivalent missing actions for CloudFront (`DeleteDistribution`,
`DeleteOriginAccessControl`, tagging) and SNS/CloudWatch
(`CreateTopic`/`DeleteTopic`/`Subscribe`, `PutMetricAlarm`/`DeleteAlarms`)
before hitting the same class of error twice more in separate runs.

### 6. `ROLLBACK_FAILED` stack state
**Symptom:** After the S3 permission failure above, the stack got stuck in
`ROLLBACK_FAILED` — even `delete-stack` initially seemed risky to run
blind.

**Root cause:** CloudFormation's automatic rollback after the failed create
also needs permission to undo what it started, and the same missing S3
permissions blocked the cleanup too.

**Fix:** Once the IAM policy was actually fixed, a plain `delete-stack` +
`wait stack-delete-complete` cleared it — the stuck state was a symptom of
the same root cause, not a separate problem needing `--retain-resources`.

### 7. `AccessDenied: cloudformation:GetTemplateSummary`
**Symptom:** A later run failed at the packaging/changeset stage.

**Root cause:** `aws cloudformation deploy` calls `GetTemplateSummary`
internally to inspect a template's parameters before creating a changeset
— an implementation detail not obvious from the command's own
documentation.

**Fix:** Added it, and at the same time added `ListStacks` and
`ListChangeSets` preemptively based on AWS's documented minimum permission
set for this command, rather than discovering each one individually.

### 8. `InvalidIfMatchVersion` on promotion
**Symptom:** Everything else worked end to end — build, deploy, canary
ramp-up, 10-minute bake, health check passed — and then the final promote
call failed: *"The If-Match header does not contain the correct number of
etags."*

**Root cause:** `UpdateDistributionWithStagingConfig` is the one CloudFront
API call that's inconsistent with every other CloudFront update operation:
its `IfMatch` header needs **both** distributions' ETags together in a
single value, comma-separated (`<primary ETag>, <staging ETag>`), not just
the primary's. This isn't mentioned in the CLI's own `--help` output — it's
documented only in the underlying API reference.

**Fix:**
```bash
STAGING_ETAG=$(aws cloudfront get-distribution --id "$STAGING_DISTRIBUTION_ID" --query 'ETag' --output text)
--if-match "${PRIMARY_ETAG}, ${STAGING_ETAG}"
```

### 9. `Invalid template path cloudformation/main.packaged.yml`
**Symptom:** Promotion itself succeeded — CloudFront confirmed the primary
distribution now served the canaried release — but the final step (syncing
CloudFormation's declared state to match) failed immediately after.

**Root cause:** `main.packaged.yml` is a generated file, created by `aws
cloudformation package` in an earlier job (`deploy-infra`). Each GitHub
Actions job runs on its own fresh runner with an empty workspace — files
created in one job don't automatically exist in a later job unless
explicitly passed via `actions/upload-artifact`/`download-artifact`. The
promote job (`canary-bake-and-promote`) never had that file.

**Fix:** Re-ran `aws cloudformation package` again in the promote job,
right before the step that needs it. Regenerating it is cheap and
idempotent, so this was simpler than wiring up an artifact transfer between
jobs for one file.

---

## Design notes
The page structure mirrors an actual CI/CD pipeline run — Source → Build →
Test → Deploy → Monitor — connected by a vertical rail with status nodes
that activate as you scroll. The footer shows a live "deployed" status line
populated at build time from `VITE_COMMIT_SHA` and `VITE_DEPLOY_TIME` env
vars, so the site proves the pipeline works rather than just describing it.