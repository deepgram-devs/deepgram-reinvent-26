# Reset the knowledge base

This guide erases the claim records in your Amazon Bedrock knowledge base and loads the auto claims in [kb-data/claims/](../kb-data/claims/). Use it when the knowledge base still holds older sample data, or any time you want to start the claims data over.

Uploading new files on top of the old ones isn't enough. The old records stay searchable, and a caller could be read a claim that no longer exists in the repo. The reset removes the old files from S3, then syncs the knowledge base so it drops their passages and indexes the new files. The knowledge base keeps its ID, so `KB_ID` in your `.env` doesn't change.

The workshop's quick start creates a **managed** knowledge base: AWS runs the vector store and chooses how files are split into passages. The main steps below are for that setup. If yours is self-managed, with your own vector store, see [the appendix](#appendix-self-managed-knowledge-bases).

> [!WARNING]
> These steps delete data in your AWS account. Run them against the workshop knowledge base only, and read each command before you run it.

## 1. Sign in

You need the AWS CLI v2 and `jq`. Run everything from the root of this repo.

The agent's `.env` holds the AWS keys, region, and `KB_ID`, so load it into your shell:

```bash
set -a; source .env; set +a
aws sts get-caller-identity
```

The `sts` call should show the workshop account. If it fails with `ExpiredToken`, copy fresh keys from the workshop's AWS access page into `.env` and run it again.

The reset needs more permissions than the agent does. If a later step fails with `AccessDenied`, sign in with an admin role instead, for example with `aws sso login` or `aws login`.

## 2. Inspect and back up the current setup

Save the knowledge base and data source settings. Later steps read from these files:

```bash
mkdir -p kb-backup

aws bedrock-agent get-knowledge-base --knowledge-base-id "$KB_ID" \
  > kb-backup/knowledge-base.json

aws bedrock-agent list-data-sources --knowledge-base-id "$KB_ID" \
  --query 'dataSourceSummaries[].[dataSourceId,name,status]' --output table
```

The workshop knowledge base has one data source. Set its ID, then save its settings:

```bash
export DS_ID=<data source ID from the table>

aws bedrock-agent get-data-source --knowledge-base-id "$KB_ID" --data-source-id "$DS_ID" \
  > kb-backup/data-source.json
```

`kb-backup/` is in `.gitignore`, so these files stay on your machine.

Now check the knowledge base type and pull out the values the rest of the guide uses:

```bash
jq -r '.knowledgeBase.knowledgeBaseConfiguration.type' kb-backup/knowledge-base.json
```

This should print `MANAGED`. If it prints `VECTOR`, go to [the appendix](#appendix-self-managed-knowledge-bases).

```bash
CONNECTOR='.dataSource.dataSourceConfiguration.managedKnowledgeBaseConnectorConfiguration'

export BUCKET=$(jq -r "$CONNECTOR.connectorParameters | fromjson | .connectionConfiguration.bucketName" kb-backup/data-source.json)

echo "Bucket: $BUCKET"
jq "{deletionPolicy: .dataSource.dataDeletionPolicy, deletionProtection: $CONNECTOR.deletionProtectionConfiguration}" kb-backup/data-source.json
```

Check what's printed before you go on:

- **Bucket** is where the claim files live. The managed connector reads the whole bucket, so it should hold only claim records.
- **deletionProtection** stops a sync from removing more than a set percentage of documents at once (`deletionProtectionThreshold`). The reset removes every old record, so it must be `DISABLED`. If it's `ENABLED`, turn it off in step 3.

## 3. Turn off deletion protection (only if it's enabled)

Skip this step if `deletionProtectionStatus` was `DISABLED`.

The update has to resend the data source's full configuration, so it's read from the backup with only the protection status changed:

```bash
aws bedrock-agent update-data-source \
  --knowledge-base-id "$KB_ID" --data-source-id "$DS_ID" \
  --name "$(jq -r '.dataSource.name' kb-backup/data-source.json)" \
  --data-source-configuration "$(jq -c "$CONNECTOR.deletionProtectionConfiguration.deletionProtectionStatus = \"DISABLED\" | .dataSource.dataSourceConfiguration" kb-backup/data-source.json)" \
  --vector-ingestion-configuration "$(jq -c '.dataSource.vectorIngestionConfiguration' kb-backup/data-source.json)" \
  --data-deletion-policy "$(jq -r '.dataSource.dataDeletionPolicy' kb-backup/data-source.json)"
```

After the reset, you can turn it back on the same way with `"ENABLED"`.

## 4. Replace the files in S3

List what's there first:

```bash
aws s3 ls "s3://$BUCKET" --recursive
```

You should see only the old claim files, such as `claim-10001.txt`. Delete them, then upload the new records:

```bash
aws s3 rm "s3://$BUCKET" --recursive
aws s3 cp kb-data/claims/ "s3://$BUCKET" --recursive --exclude "*" --include "CLM-*.txt"
aws s3 ls "s3://$BUCKET" --recursive
```

Expect exactly 10 files, `CLM-2026-159827.txt` through `CLM-2026-981345.txt`.

## 5. Sync the knowledge base

An ingestion job compares the bucket with the index. It removes the passages of every deleted file, then splits, embeds, and indexes the new ones:

```bash
JOB_ID=$(aws bedrock-agent start-ingestion-job --knowledge-base-id "$KB_ID" --data-source-id "$DS_ID" \
  --query 'ingestionJob.ingestionJobId' --output text)

while true; do
  STATUS=$(aws bedrock-agent get-ingestion-job --knowledge-base-id "$KB_ID" --data-source-id "$DS_ID" \
    --ingestion-job-id "$JOB_ID" --query 'ingestionJob.status' --output text)
  echo "$STATUS"
  case "$STATUS" in COMPLETE|FAILED|STOPPED) break ;; esac
  sleep 10
done

aws bedrock-agent get-ingestion-job --knowledge-base-id "$KB_ID" --data-source-id "$DS_ID" \
  --ingestion-job-id "$JOB_ID" --query 'ingestionJob.[statistics, failureReasons]'
```

A good run ends `COMPLETE` with `numberOfNewDocumentsIndexed: 10`, `numberOfDocumentsDeleted: 10`, and `numberOfDocumentsFailed: 0`.

If it goes wrong:

| What you see | Likely cause |
|---|---|
| `FAILED`, mentioning deletion protection | Protection is still on. Do step 3, then start the job again. |
| `FAILED`, access denied on S3 | The knowledge base's service role can't read the bucket. Check the role in `kb-backup/knowledge-base.json` (`roleArn`). |
| 0 new documents indexed | The files didn't upload. Check `aws s3 ls` from step 4. |

## 6. Verify retrieval

This check searches the knowledge base the same way the agent does, with the managed search settings. It lists the file behind each result, and whether that passage carries its claim ID:

```bash
check() {
  aws bedrock-agent-runtime retrieve --knowledge-base-id "$KB_ID" \
    --retrieval-query text="$1" \
    --retrieval-configuration '{"managedSearchConfiguration":{"numberOfResults":20}}' \
  | jq -r '.retrievalResults[] | [(.location | tostring | capture("(?<f>[^/\"]+\\.txt)").f), (.content.text | test("Claim ID CLM-") | if . then "has claim ID" else "NO CLAIM ID" end)] | @tsv'
}

check "Claim ID CLM-2026-847291 policyholder"
check "Claim ID CLM-2026-527613 adjuster notes"
check "Claim ID 10001"
```

What to look for:

- **Every file name starts with `CLM-2026-`.** Any `claim-1000N.txt` means old passages are still indexed. Wait a minute and run the check again; if they're still there, start another sync from step 5.
- **The first query returns `CLM-2026-847291.txt`.** That passage should include `Policyholder: Daniel Mitchell`, because the agent verifies callers against it:

  ```bash
  aws bedrock-agent-runtime retrieve --knowledge-base-id "$KB_ID" \
    --retrieval-query text="Claim ID CLM-2026-847291 policyholder" \
    --retrieval-configuration '{"managedSearchConfiguration":{"numberOfResults":20}}' \
  | jq -r '.retrievalResults[].content.text' | grep -m1 "Policyholder:"
  ```

- **Every passage says `has claim ID`.** The agent drops any passage without its claim ID, which is why every section header in the records repeats it. A `NO CLAIM ID` passage means the knowledge base split a section in a way the records didn't plan for. Tell the workshop team which file it came from.

Finally, run the agent and call it. Ask for the repair estimate on claim C L M, 2026, 847291, with the last name Mitchell.

## 7. Roll back

To go back to the earlier sample claims, check out `a4f993e`, the last commit with the five-digit sample claims. Its prompts and claim ID handling match the old data:

```bash
git switch --detach a4f993e
```

Then repeat step 4, uploading `claim-*.txt` instead of `CLM-*.txt`, and step 5.

## If the sync won't clear the old records

A sync normally removes everything a deleted file produced. If old records survive repeated syncs, delete and recreate the data source instead. Its `dataDeletionPolicy` must be `DELETE`, so deleting it erases every passage it indexed. The workshop's data source already uses `DELETE`.

```bash
aws bedrock-agent delete-data-source --knowledge-base-id "$KB_ID" --data-source-id "$DS_ID"
```

Wait until it's gone. The loop prints `DELETING` while it waits:

```bash
until ! aws bedrock-agent get-data-source --knowledge-base-id "$KB_ID" --data-source-id "$DS_ID" \
    --query 'dataSource.status' --output text 2>/dev/null; do
  sleep 10
done

export DS_ID=$(aws bedrock-agent create-data-source \
  --knowledge-base-id "$KB_ID" \
  --name "$(jq -r '.dataSource.name' kb-backup/data-source.json)" \
  --data-source-configuration "$(jq -c '.dataSource.dataSourceConfiguration' kb-backup/data-source.json)" \
  --vector-ingestion-configuration "$(jq -c '.dataSource.vectorIngestionConfiguration' kb-backup/data-source.json)" \
  --data-deletion-policy DELETE \
  --query 'dataSource.dataSourceId' --output text)
echo "New data source: $DS_ID"
```

Then run steps 5 and 6 with the new `DS_ID`. If you'd rather use the console, open the knowledge base in the Amazon Bedrock console, delete the data source, and add an S3 data source pointing at the same bucket.

## Appendix: self-managed knowledge bases

If step 2 printed `VECTOR`, the knowledge base uses your own vector store, such as Aurora PostgreSQL with pgvector, and an `S3` data source. The flow is the same, with these differences:

- **Bucket and prefix.** They're in a different place in the backup:

  ```bash
  export BUCKET=$(jq -r '.dataSource.dataSourceConfiguration.s3Configuration.bucketArn | sub("arn:aws:s3:::"; "")' kb-backup/data-source.json)
  export PREFIX=$(jq -r '.dataSource.dataSourceConfiguration.s3Configuration.inclusionPrefixes[0] // ""' kb-backup/data-source.json)
  ```

  Use `s3://$BUCKET/$PREFIX` wherever step 4 uses `s3://$BUCKET`. Deletion protection doesn't apply, so skip step 3.

- **Chunking.** You choose it. Use fixed-size chunks of 300 tokens with 20% overlap. Every section of a claim record is under about 160 tokens, so any 300-token chunk includes at least one header with the claim ID. [tests/test_claims.py](../tests/test_claims.py) checks the records follow these rules. If you change the chunk size, keep it at least twice the longest section. Chunking can only be set when a data source is created, so recreate it with:

  ```bash
  --vector-ingestion-configuration '{"chunkingConfiguration":{"chunkingStrategy":"FIXED_SIZE","fixedSizeChunkingConfiguration":{"maxTokens":300,"overlapPercentage":20}}}'
  ```

- **Retrieval.** Self-managed knowledge bases use `vectorSearchConfiguration` instead of `managedSearchConfiguration`. In step 6, pass `'{"vectorSearchConfiguration":{"numberOfResults":20,"overrideSearchType":"HYBRID"}}'`.

- **Checking the vector store is empty.** After you delete a data source, you can count what's left. For Aurora, use the RDS Data API with the values under `storageConfiguration.rdsConfiguration` in `kb-backup/knowledge-base.json`:

  ```bash
  aws rds-data execute-statement --resource-arn "<resourceArn>" --secret-arn "<credentialsSecretArn>" \
    --database "<databaseName>" --sql "SELECT count(*) FROM <tableName>" \
    --query 'records[0][0].longValue'
  ```

  Expect `0`.

A new embedding model or vector store needs a new knowledge base, which gets a new ID. Follow the knowledge base steps in the [AWS workshop](https://catalog.workshops.aws/voice-ai-agents/en-US), load the records with steps 4 to 6, and update `KB_ID` in your `.env`.
