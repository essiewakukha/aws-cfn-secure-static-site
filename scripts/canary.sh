#!/usr/bin/env bash
# Promotes the staging (canary) distribution to primary once its CloudWatch
# alarm confirms it's healthy, then updates the CloudFormation stack so its
# declared state matches what actually happened - CloudFront's promotion API
# is imperative (UpdateDistributionWithStagingConfig), so without this last
# step the stack would drift from reality on every successful canary.
#
# Required env vars: STACK_NAME, PRIMARY_DISTRIBUTION_ID,
# STAGING_DISTRIBUTION_ID, RELEASE_ID, APP_NAME
set -euo pipefail

echo "Promoting staging config to primary distribution..."

# UpdateDistributionWithStagingConfig requires the PRIMARY distribution's
# current ETag (optimistic locking) - fetch it fresh right before the call.
PRIMARY_ETAG=$(aws cloudfront get-distribution \
  --id "$PRIMARY_DISTRIBUTION_ID" \
  --query 'ETag' --output text)

aws cloudfront update-distribution-with-staging-config \
  --id "$PRIMARY_DISTRIBUTION_ID" \
  --staging-distribution-id "$STAGING_DISTRIBUTION_ID" \
  --if-match "$PRIMARY_ETAG" \
  > /dev/null

echo "Promoted. Primary now serves the release that was canarying."
echo "This also disabled the continuous deployment policy - CloudFront reset it automatically."

# CloudFormation still thinks CanaryEnabled=true and CurrentReleaseId is the
# old release, because the promotion happened outside CFN. Reconcile the
# stack now so `aws cloudformation detect-stack-drift` stays clean and the
# next deploy starts from a correct baseline.
echo "Reconciling CloudFormation stack state with the promoted config..."

aws cloudformation deploy \
  --stack-name "$STACK_NAME" \
  --template-file cloudformation/main.packaged.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    AppName="$APP_NAME" \
    CurrentReleaseId="$RELEASE_ID" \
    CandidateReleaseId="$RELEASE_ID" \
    CanaryEnabled=false \
    CanaryWeight=0 \
  --no-fail-on-empty-changeset

echo "Stack reconciled. Release $RELEASE_ID is now fully live."