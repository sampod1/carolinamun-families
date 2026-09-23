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
   - **Edit** anyone (button on their page): name, class year, MUN cohort, big, family name, photo
   - **+ Add a little** on any person's page
   - **+ New family** on the home page, **+ Add member** on the "Waiting on a big" page
   - **Delete** someone (inside Edit). Anyone with littles has to have those littles moved first.

Every save goes straight into this repo, and GitHub Pages republishes the site for everyone in about a minute. Your own browser shows the change right away.

**Undoing a mistake:** each save is a commit. On GitHub, open `data.json` → **History**, find the good version, and restore it (or ask whoever set this up).

**Handing it off:** the next person makes their own token. If they don't own the repo, add them first under **Settings → Collaborators**. Tokens expire, so when yours does, just sign in again with a new one.

## What's in here

| File | What it is |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The site itself |
| `data.json` | Everyone in the tree. The editor writes this; you can also edit it on GitHub by hand |
| `photos/` | Member photos (the editor uploads these, cropped square) |

Each person in `data.json` looks like:
```json
{"id": "john-thagard", "name": "John Thagard", "big": "sam-podgoreanu", "cohort": "2025–26", "classYear": "'28", "photo": "photos/john-thagard.jpg"}
```
`big` is the big's `id`. The `id` never changes, even if a name is edited.

**Lineage rule:** a person's big is whoever they were *first* assigned to. Returners who get put in a new group for points later keep their original big here.
