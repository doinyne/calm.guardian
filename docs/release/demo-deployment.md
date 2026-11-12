# Deploying the cloud demo (ADR-0017)

Phase 2: the accounts and commands to put Calm Guardian in the cloud and open it on your iPhone with
Expo Go. Do the steps in order. Anything you need to keep secret goes into Secret Manager or the
Supabase dashboard, never into a file in the repo.

**You'll need:** a Google account with billing, a free Supabase account, a free Expo account, and a
Gmail address with 2-step verification turned on.

**Expected cost: £0.** Everything sits in free tiers: Cloud Run scales to zero; Cloud Tasks (1 million
operations a month), Cloud Scheduler (3 jobs; we use 1), Artifact Registry (0.5 GB) and Secret Manager
(6 secret versions; we use 4) are free at this size, and so are Supabase, Expo and Gmail. GCP still
needs a billing account linked, so step 1 sets a **£1** budget alert.

**Free-tier limits to know:** a free Supabase project pauses after a week without use (resume it in the
dashboard; the Sweep running every 5 minutes usually keeps it awake). The first request after a quiet
spell takes a few seconds while Cloud Run starts up.

---

## 1. Google Cloud project

```bash
gcloud auth login
gcloud auth application-default login          # lets Terraform use your login
gcloud projects create calm-guardian-demo      # pick a unique ID if this one's taken
gcloud config set project calm-guardian-demo
```

Then, in the Google Cloud console:
1. **Billing** → link a billing account to the project.
2. **Billing → Budgets & alerts** → create a budget of **£1** a month, with an email alert at 100%.
   Nothing should ever reach it.

## 2. Gmail app password (for all emails)

1. Go to https://myaccount.google.com/apppasswords (2-step verification must be on).
2. Create one called "Calm Guardian". Copy the 16-character password; spaces don't matter.

Your SMTP address is then:
`smtps://you%40gmail.com:<app password without spaces>@smtp.gmail.com:465`
(the `@` in your email becomes `%40`).

## 3. Hosted Supabase

1. At https://supabase.com create a project: **Region: London (eu-west-2)**, free plan. Save the
   database password.
2. **Project Settings → JWT Keys:** make sure the **current** signing key is an **ECC (P-256)**
   or RSA key, not the legacy shared secret. If it's legacy, create a standby ECC key and rotate to
   it. The API only accepts asymmetric keys (ES256/RS256).
3. **Authentication → Sign In / Providers → Email:** enabled. **Confirm email:** off (the code
   is the confirmation). **Email OTP length:** 6.
4. **Authentication → Emails → Templates:** set both **Magic link** and **Confirm signup** to:
   - Subject: `Your Calm Guardian sign-in code`
   - Body: the contents of `supabase/templates/sign-in-code.html`
5. **Authentication → Emails → SMTP settings:** enable custom SMTP:
   - Host `smtp.gmail.com`, port `465`, username your Gmail address, password the app password.
   - Sender email: your Gmail address. Sender name: `Calm Guardian`.

   Without this, hosted Supabase only sends codes to your own team's addresses.
6. Apply the schema (this writes to the remote database):
   ```bash
   supabase link --project-ref <project ref>      # asks for the database password
   supabase db push
   ```
7. Collect, from **Project Settings → API keys**: the **publishable** key and a **secret** key.
   From **Connect → ORMs / Connection string → Transaction pooler** (port **6543**): the
   database URL with your password filled in. Use the pooler: Cloud Run can't reach the direct
   (IPv6) address.

## 4. Infrastructure, first apply (no API yet)

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars    # then fill in project_id, supabase_url, email_from
terraform init
terraform plan                                   # read it
terraform apply                                  # registry, secrets, job queue, service accounts
```

## 5. Secrets

Each value goes straight into Secret Manager:

```bash
printf '%s' '<Supabase secret key>'                    | gcloud secrets versions add supabase-secret-key --data-file=-
printf '%s' '<transaction pooler URL, with password>'  | gcloud secrets versions add database-url --data-file=-
printf '%s' "k1:$(openssl rand -base64 32)"            | gcloud secrets versions add token-encryption-keys --data-file=-
printf '%s' '<smtps://… from step 2>'                  | gcloud secrets versions add smtp-url --data-file=-
```

⚠️ The **token encryption key** protects every stored Bluesky session and every backed-up post. If
it's lost, so are they. It lives in Secret Manager: don't delete that secret or its versions.

## 6. Build and push the API image

From the repo root:

```bash
REPO=$(terraform -chdir=infra output -raw image_repository)
gcloud auth configure-docker europe-west2-docker.pkg.dev
docker build --platform linux/amd64 -f apps/api/Dockerfile -t "$REPO/api:v1" .
docker push "$REPO/api:v1"
```

## 7. Infrastructure, second apply (the API)

Add the image to `infra/terraform.tfvars`:

```hcl
image = "europe-west2-docker.pkg.dev/<project>/calm-guardian/api:v1"
```

```bash
cd infra && terraform apply
terraform output -raw api_url        # e.g. https://calm-guardian-api-123456789.europe-west2.run.app
```

Check it:

```bash
API=$(terraform -chdir=infra output -raw api_url)
curl -s "$API/ready"                          # {"status":"ok"}: it can reach the database
curl -s "$API/oauth/client-metadata.json"     # Bluesky's view of us
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$API/internal/sweep"   # 401: only Google may call it
```

## 8. The app, in Expo Go

1. Make a free account at https://expo.dev, then:
   ```bash
   cd apps/mobile
   npx eas-cli login
   npx eas-cli init          # creates the project; note the project ID it prints
   ```
2. Publish the app for Expo Go:
   ```bash
   EXPO_PUBLIC_APP_VARIANT=preview \
   EXPO_PUBLIC_API_URL='<api_url from step 7>' \
   EXPO_PUBLIC_SUPABASE_URL='https://<project ref>.supabase.co' \
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY='<publishable key>' \
   EAS_PROJECT_ID='<project ID>' \
   npx eas-cli update --channel demo --message "Cloud demo"
   ```
   These values are public by design: never put the Supabase **secret** key here.
3. On your iPhone, install **Expo Go** from the App Store. Open the update's page on expo.dev
   (the command prints the link), and scan its **Preview** QR code with the iPhone camera.
   Colleagues do the same.
4. Publish again with the same command after any app change. Expo Go picks it up next time it opens.

**If Expo Go won't open the update:** run it from your Mac instead, while you demo:
```bash
cd apps/mobile
EXPO_PUBLIC_APP_VARIANT=preview EXPO_PUBLIC_API_URL='<api_url>' \
EXPO_PUBLIC_SUPABASE_URL='https://<project ref>.supabase.co' \
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY='<publishable key>' \
npx expo start --go --tunnel
```
and scan the QR code it shows with Expo Go.

## 9. Try it

1. Sign in with your email address: the code comes from your Gmail address.
2. Connect a **test** Bluesky account, never one you rely on.
3. Turn Calm Mode on for **the last 24 hours**, then off, then bring the posts back from Review.

## Updating the API later

Build and push a new tag (step 6, e.g. `api:v2`), set `image` in `terraform.tfvars`, and
`terraform apply`. New database migrations: `supabase db push`.

## Taking it down

`terraform destroy` removes Cloud Run, the queue, the schedule, the registry and the secrets. Keep a
copy of the encryption key first, or the stored data can't be read again.
