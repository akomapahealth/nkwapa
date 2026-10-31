# 28. Reading The Research Dataset

For researchers with read access to the research bucket (#166). Everything here is de-identified:
keys are clinic-scoped HMACs, timestamps are rounded, and there are no names or free text. See
`26_RESEARCH_EXPORT_TRANSFORMS_V1.md` for the pack contract.

## What is in the bucket

```text
research/catalog/runs/<runKey>.json                     one entry per run, every clinic
research/v5/clinic=<clinicKey>/current.json             the clinic's newest complete run
research/v5/clinic=<clinicKey>/runs/<runKey>/
  manifest.json  SHA256SUMS.txt  changes.json
  tables/research_subjects.csv.gz  research_clinical_vitals.csv.gz  ...
```

A run key reads `rx-<clinic>-<period>`: `m2026-10` is the October 2026 monthly run, `w2026-41`
a weekly one, `a20261005-k3m2` a run someone started by hand, and a trailing `-r2` a rerun of the
same period. Quote the run key in a paper or a ticket: it names exactly the data you used.

Each run is a full snapshot from the schedule's coverage start, not a delta, so use one run at a
time. Runs expire after the bucket's retention period (90 days), which is how a patient who
revokes consent leaves the data; the catalog keeps the record that a run existed.

## Get read access

Ask the data steward for a read-only R2 token scoped to the research bucket. You get an access key
id, a secret and the account id. Keep them out of notebooks you share and out of git.

## DuckDB

DuckDB 1.1 or later reads R2 directly.

```sql
INSTALL httpfs;
LOAD httpfs;

CREATE SECRET research (
  TYPE r2,
  KEY_ID 'your-access-key-id',
  SECRET 'your-secret',
  ACCOUNT_ID 'your-account-id'
);
```

List the runs:

```sql
SELECT runKey, clinicKey, trigger, fromDate, toDate, consentedSubjects, generatedAt
FROM read_json('r2://nkwapa-research/research/catalog/runs/*.json')
ORDER BY generatedAt DESC;
```

Find a clinic's newest run:

```sql
SELECT runKey, path
FROM read_json('r2://nkwapa-research/research/v5/clinic=*/current.json');
```

Read one table from one run (the files are gzipped CSV, which DuckDB detects):

```sql
SELECT *
FROM read_csv('r2://nkwapa-research/research/v5/clinic=<clinicKey>/runs/<runKey>/tables/research_subjects.csv.gz');
```

Join within a run on the research keys:

```sql
WITH run AS (SELECT 'r2://nkwapa-research/research/v5/clinic=<clinicKey>/runs/<runKey>/tables/' AS dir)
SELECT s.sex, s.birth_year, count(*) AS visits
FROM read_csv((SELECT dir FROM run) || 'research_subjects.csv.gz') s
JOIN read_csv((SELECT dir FROM run) || 'research_clinical_vitals.csv.gz') v
  USING (research_patient_key)
GROUP BY ALL;
```

## Check what you read

`SHA256SUMS.txt` lists the hash of every uncompressed CSV. `manifest.json` carries
`contentSha256`, the hash of those table lines: two runs with the same value hold identical data.
To verify a download:

```bash
mkdir run && cd run
# download the run folder with any S3 client, then:
gunzip -k tables/*.csv.gz
mv tables/*.csv .
sha256sum -c SHA256SUMS.txt --ignore-missing
```

## What changed since the last run

`changes.json` compares a run with the clinic's previous one: consented patients, how many joined,
how many revoked, how many were merged or removed, and the row count change per table. It holds
counts only.

## Joining across clinics and key versions

Keys are scoped to a clinic, so the same person at two clinics has two keys, by design. Keys made
under different `hmacKeyId` values (in the manifest) do not join either; compare runs that share
one.
