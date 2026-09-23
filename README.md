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

**Approving a submission**
1. Open the responses Sheet. Each row is one submission; the photo is a Google Drive link.
2. Download their photo from the Drive link.
3. On the site, search their name → **Edit** (or **+ Add member** / **+ Add a little** if they're new). Fill in class year, phone and email, upload the photo, then **Save**.
4. Add an "Approved" column in the Sheet and mark the row, so you know it's done.

To reject, just skip the row (and delete it if you like). To close sign-ups, clear the form link or turn off "Accepting responses" in the form.

**Privacy:** phone numbers and emails that you approve are visible to anyone with the site link, and they're stored in this public repo. The form's consent box makes sure people agree to that first.

## What's in here

| File | What it is |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The site itself |
| `data.json` | Everyone in the tree, plus the sign-up form link. The editor writes this; you can also edit it on GitHub by hand |
| `photos/` | Member photos (the editor uploads these, cropped square) |

Each person in `data.json` looks like:
```json
{"id": "john-thagard", "name": "John Thagard", "big": "sam-podgoreanu", "cohort": "2025–26", "classYear": "'28", "phone": "(919) 555-0123", "email": "jt@unc.edu", "photo": "photos/john-thagard.jpg"}
```
`big` is the big's `id`. The `id` never changes, even if a name is edited.

**Lineage rule:** a person's big is whoever they were *first* assigned to. Returners who get put in a new group for points later keep their original big here.
