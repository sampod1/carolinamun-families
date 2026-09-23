# CarolinaMUN Families

A click-through big/little family tree for CarolinaMUN, hosted free on GitHub Pages.

## Editing (no code needed)

1. Open the live site and click **Editor sign in** at the very bottom.
2. The first time, you'll need a GitHub token (the sign-in box walks you through it):
   - github.com → Settings → Developer settings → **Fine-grained tokens → Generate new token**
   - **Repository access:** Only select repositories → this repo
   - **Permissions → Contents:** Read and write
   - Copy the token and paste it into the sign-in box. It stays in that browser only.
3. A yellow bar means you're in edit mode. Now you can:
   - **Edit** anyone (button on their page): name, class year, MUN cohort, phone, email, big, family name, photo
   - **+ Add a little** on any person's page
   - **+ New family** on the home page, **+ Add member** on the "Waiting on a big" page
   - **Delete** someone (inside Edit). Anyone with littles has to have those littles moved first.

Every save goes straight into this repo, and GitHub Pages republishes the site for everyone in about a minute. Your own browser shows the change right away.

**Undoing a mistake:** each save is a commit. On GitHub, open `data.json` → **History**, find the good version, and restore it (or ask whoever set this up).

**Handing it off:** the next person makes their own token. If they don't own the repo, add them first under **Settings → Collaborators**. Tokens expire, so when yours does, just sign in again with a new one.

## Sign-up portal ("Add yourself")

Anyone can open **Add yourself** (top of the site) and submit their photo, name, class year, phone and email through a Google Form. Nothing goes on the site until an editor approves it.

**One-time setup: make the Google Form**
1. forms.google.com → blank form, title it "CarolinaMUN Family Tree Sign-Up".
2. Add these questions:
   - **Full name**: Short answer, required
   - **Class year**: Dropdown (2027, 2028, 2029, 2030), required
   - **Who is your big?**: Short answer, optional (helps you place new members)
   - **Phone number**: Short answer, required
   - **Email**: Short answer, required, with Response validation → Text → Email
   - **Photo of yourself**: File upload, 1 file, Image only, max 10 MB, required
   - **Consent**: Checkboxes, required, with one option: "I understand my name, class year, photo, phone number and email will be shown on the public CarolinaMUN family tree site."
3. **Responses** tab → **Link to Sheets** so submissions land in a private spreadsheet.
4. Click **Send → link icon**, copy the link. On the site (signed in as editor), open **Add yourself → Add the form link** and paste it.

**Approving a submission: tick the box**

The responses Sheet runs a small script ([`apps-script/FamilyTreeSync.gs`](apps-script/FamilyTreeSync.gs)). Every new response gets an **Approve** checkbox. Tick it and the script publishes that person to the site within about a minute, then writes the result in the **Status** column:
- If someone on the site has the same email or name, their class year, phone, email and photo are updated. Their big never changes.
- Otherwise they're added as a new member: under their big if the name they gave matches someone on the site, or on "Waiting on a big" if not.
- Photos come straight from Drive, resized by Google (iPhone HEIC photos are converted too).
- If something goes wrong, Status says `Error: …` and the box unticks itself so you can try again.

To reject, just don't tick it (delete the row if you like). To close sign-ups, clear the form link on the site or turn off "Accepting responses" in the form. You can still approve by hand with the site editor anytime.

**One-time script setup** (already done if the Sheet has a *Family Tree* menu)
1. Make a GitHub token for the script: Fine-grained tokens → Generate new token → *Only select repositories* → this repo → **Contents: Read and write**.
2. In the responses Sheet: **Extensions → Apps Script**, replace the placeholder code with `apps-script/FamilyTreeSync.gs`, and save.
3. Reload the Sheet. Use **Family Tree → Set up automation**. Google will ask you to authorize the script ("Google hasn't verified this app" → *Advanced* → *Go to … (unsafe)* → *Allow*; it's your own script). Run **Set up automation** again if needed, and paste the token when asked.

**Privacy:** phone numbers and emails that you approve are visible to anyone with the site link, and they're stored in this public repo. The form's consent box makes sure people agree to that first.

## What's in here

| File | What it is |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The site itself |
| `data.json` | Everyone in the tree, plus the sign-up form link. The editor writes this; you can also edit it on GitHub by hand |
| `photos/` | Member photos (the editor and the Sheet script upload these) |
| `apps-script/FamilyTreeSync.gs` | The responses Sheet's Approve-box script (a copy for reference) |

Each person in `data.json` looks like:
```json
{"id": "john-thagard", "name": "John Thagard", "big": "sam-podgoreanu", "cohort": "2025–26", "classYear": "'28", "phone": "(919) 555-0123", "email": "jt@unc.edu", "photo": "photos/john-thagard.jpg"}
```
`big` is the big's `id`. The `id` never changes, even if a name is edited.

**Changing the site's code?** Bump the `?v=` tag on `styles.css` and `app.js` in `index.html` so browsers fetch the new files right away instead of using cached ones for up to 10 minutes.

**Lineage rule:** a person's big is whoever they were *first* assigned to. Returners who get put in a new group for points later keep their original big here.
