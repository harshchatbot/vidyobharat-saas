# JACK publish step: Instagram Reels + YouTube Shorts by API

The publish step runs after QA and the post pack. It never posts anything you have not approved.

```
video thread                         prod server (EC2, jack-publisher container)
------------                         --------------------------------------------
cli queue <run dir>  ── Firebase ──▶  worker, every minute
   (review summary)     Storage         YouTube: upload private, publishAt = 7 PM IST
you say OK                              Instagram: create Reel container 15 min before,
cli approve <id> --by <name>                       publish at 7 PM IST
```

Rules built into the code:

- Nothing is posted until `JACK_PUBLISH_ENABLED=1`. Before that, the worker only logs what it would do.
- An item needs an approval, and the approval is tied to a hash of the video, cover, captions, title,
  description and slot. Any change after approval clears it.
- One post per day unless `--allow-same-day`. `cli block <dates>` keeps hand-scheduled days free.
- Nothing posts more than 3 hours late. After 3 failed attempts a platform is marked failed and a
  notification goes to `JACK_PUBLISH_NOTIFY_URL` (optional webhook, e.g. n8n).
- Instagram: the Reel uploads from a short-lived signed Firebase URL, with the custom cover. If that
  fails, it falls back to uploading the file directly (resumable upload); with no cover URL it uses
  the frame at 1 s. The pinned comment from the post pack is posted as the first comment. The API
  can't pin it, so pin it in the app.
- YouTube: Science & Technology, not made for kids, altered/synthetic content "No", language Hindi.
  The custom thumbnail is tried, but YouTube allows it only on phone-verified channels.

## One-time setup (about 20 minutes)

Secrets are typed on the server. Never paste them into chat or commit them.

### 1. Instagram (Meta app, Instagram Login)

1. Open https://developers.facebook.com/apps, then **Create app**. For the use case pick
   **Manage messaging & content on Instagram**. Name it e.g. "TTF Publisher". No business portfolio is needed.
2. In the app, open **Instagram → API setup with Instagram business login**.
3. Under **Generate access tokens**, click **Add account** and log in as **@thetechnologyfiction**.
   If Meta asks for a tester invite, accept it in Instagram: Settings → Website permissions → Apps and
   websites → Tester invites.
4. Allow `instagram_business_basic` and `instagram_business_content_publish`, then click **Generate token**.
   Copy the token and the numeric Instagram user ID shown next to the account.
5. Leave the app in **Development** mode. Your own account has a role on the app, so no App Review is needed.

### 2. YouTube (Google OAuth client in project `rangmanch-ai-backend`)

1. https://console.cloud.google.com/apis/library/youtube.googleapis.com: check **YouTube Data API v3** is enabled.
2. **Google Auth Platform → Branding / Audience**: user type **External**, app name "TTF Publisher",
   then **Publish app** so the status is **In production**. Testing mode makes the sign-in expire every 7 days.
3. **Clients → Create client → TVs and Limited Input devices**. Copy the client ID and client secret.
4. Request the API audit at https://support.google.com/youtube/contact/yt_api_form. Until the project
   passes, YouTube keeps API uploads **private**: they reach Studio but don't go public on their own.
   Keep posting Shorts by hand in Studio until the audit is approved.

### 3. Server (EC2)

```bash
cd <repo> && git pull
# add to apps/api/.env.production (IDs only, no tokens):
#   JACK_PUBLISH_STORE=gs://<FIREBASE_STORAGE_BUCKET>/jack-publish
#   JACK_IG_USER_ID=<numeric id from step 1.4>
#   JACK_YT_CLIENT_ID=...   JACK_YT_CLIENT_SECRET=...
#   JACK_YT_CHANNEL_ID=UCuEiM2vTQ2q4_BkPmvwuWjw
#   JACK_PUBLISH_ENABLED=0
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d jack-publisher
docker compose -f docker-compose.prod.yml run --rm jack-publisher python -m app.services.jack_publish.cli instagram-token
docker compose -f docker-compose.prod.yml run --rm jack-publisher python -m app.services.jack_publish.cli youtube-auth
docker compose -f docker-compose.prod.yml run --rm jack-publisher python -m app.services.jack_publish.cli check
```

`instagram-token` asks for the token with hidden input, checks it, and saves it in the
`rangmanch-data` volume. The worker refreshes it every week, so the 60-day expiry never hits.
`youtube-auth` prints a code: open google.com/device on your phone, enter it, and sign in with
the Google account that owns the channel. Click through the "unverified app" screen: it's your own app.

Once `check` is green and a dry-run item looks right in the logs, set `JACK_PUBLISH_ENABLED=1` and
run `up -d jack-publisher` again.

### 4. Cloud environment (so video threads can queue)

In the project's cloud environment settings, add:

- `JACK_PUBLISH_STORE` = the same `gs://…/jack-publish` value
- `JACK_FIREBASE_SA_JSON` = the Firebase service-account JSON (raw or base64), as a secret

## Daily use (in each video thread)

```bash
cd apps/api
python -m app.services.jack_publish queue /mnt/project-files/jack-runs/<run> --caption A   # prints the review summary
# human says OK on the summary
python -m app.services.jack_publish approve <id> --by <name>
python -m app.services.jack_publish status            # all items
python -m app.services.jack_publish cancel <id>       # before the slot
python -m app.services.jack_publish retry <id>        # after fixing a failure
```
