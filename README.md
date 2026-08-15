# DevOps Portfolio — React + CloudFormation Canary Pipeline

A React SPA deployed to AWS via CloudFormation, served from a private S3
origin behind two CloudFront distributions (primary + staging), with every
release canaried through **CloudFront Continuous Deployment** before it goes
fully live — all driven by a GitHub Actions pipeline with no long-lived AWS
credentials (OIDC).

**Live site:** https://d1xzsblye2kc6p.cloudfront.net

## Repo layout
app/ React app (Vite)
cloudformation/ 5 nested-stack templates + deploy README
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

Full step-by-step (one-time bootstrap + how the ongoing pipeline works) is
in [`cloudformation/README.md`](./cloudformation/README.md).

## How the canary deploy works
Every push after the first builds the app, uploads it to its own
`releases/<commit-sha>/` S3 prefix, opens a 10% canary on the staging
CloudFront distribution, waits for CloudWatch to collect enough datapoints,
and either promotes to production (5xx alarm stayed OK) or leaves it be
(alarm tripped — blast radius was capped at 15% the whole time). Promotion
is an imperative CloudFront API call (`UpdateDistributionWithStagingConfig`),
so the pipeline also reconciles CloudFormation's declared state afterward
to avoid drift.

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
**immutable** form with numeric IDs embedded in the middle: 'repo:essiewakukha@137600196/aws-cfn-secure-static-site@1332408105:ref:refs/heads/main'
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

---

## Design notes
The page structure mirrors an actual CI/CD pipeline run — Source → Build →
Test → Deploy → Monitor — connected by a vertical rail with status nodes
that activate as you scroll. The footer shows a live "deployed" status line
populated at build time from `VITE_COMMIT_SHA` and `VITE_DEPLOY_TIME` env
vars, so the site proves the pipeline works rather than just describing it.