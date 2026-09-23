/**
 * CarolinaMUN Family Tree: responses Sheet -> live site.
 *
 * Tick "Approve" on a form response row and this script publishes that person
 * (photo, class year, phone, email) to the site by committing to the GitHub repo.
 * GitHub Pages then republishes the site in about a minute.
 *
 * Install: Extensions -> Apps Script in the responses Sheet, paste this file, save,
 * reload the Sheet, then use the "Family Tree" menu -> "Set up automation".
 */

const REPO_OWNER = 'sampod1';
const REPO_NAME = 'carolinamun-families';
const FIELDS = ['id', 'name', 'big', 'family', 'cohort', 'classYear', 'phone', 'email', 'photo'];
const PHOTO_SIZE = 800;
const EN_DASH = String.fromCharCode(8211);

// Header text each column starts with (matched case-insensitively).
const HEADERS = {
  name: 'full name',
  classYear: 'class year',
  big: 'who is your big',
  phone: 'phone number',
  email: 'email',
  photo: 'photo of yourself',
  status: 'status',
  approve: 'approve',
};

// ── Menu + triggers ──────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Family Tree')
    .addItem('Set up automation', 'setup')
    .addItem('Publish selected row now', 'publishSelectedRow')
    .addItem('Change GitHub token', 'promptForToken')
    .addToUi();
}

function setup() {
  const ui = SpreadsheetApp.getUi();
  if (!PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN') && !promptForToken()) return;

  const ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onFormSubmitInstalled').forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger('onEditInstalled').forSpreadsheet(ss).onEdit().create();

  const sheet = responsesSheet_();
  const cols = columns_(sheet, true);
  const last = sheet.getLastRow();
  if (last >= 2) sheet.getRange(2, cols.approve, last - 1, 1).insertCheckboxes();

  ui.alert('Family Tree automation is on.\n\nTick "Approve" on any row to publish that person to the site. The Status column shows what happened.');
}

function promptForToken() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt(
    'GitHub token',
    `Paste a fine-grained GitHub token for ${REPO_OWNER}/${REPO_NAME} with Contents: Read and write. It's stored only in this script.`,
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return false;
  const token = res.getResponseText().trim();
  if (!token) return false;
  try {
    github_('get', '', null, token);
  } catch (err) {
    ui.alert(`That token didn't work: ${err.message}`);
    return false;
  }
  PropertiesService.getScriptProperties().setProperty('GITHUB_TOKEN', token);
  ui.alert('Token saved.');
  return true;
}

function onFormSubmitInstalled(e) {
  const sheet = e.range.getSheet();
  const cols = columns_(sheet, true);
  const row = e.range.getRow();
  sheet.getRange(row, cols.approve).insertCheckboxes();
  sheet.getRange(row, cols.status).setValue('Waiting for approval');
}

function onEditInstalled(e) {
  const range = e.range;
  const sheet = range.getSheet();
  if (sheet.getSheetId() !== responsesSheet_().getSheetId()) return;
  const cols = columns_(sheet, false);
  if (!cols.approve || range.getColumn() > cols.approve || range.getLastColumn() < cols.approve) return;
  for (let r = Math.max(2, range.getRow()); r <= range.getLastRow(); r++) {
    if (sheet.getRange(r, cols.approve).getValue() === true) publishRow_(sheet, r, cols);
  }
}

function publishSelectedRow() {
  const sheet = responsesSheet_();
  const row = sheet.getActiveRange().getRow();
  if (row < 2) return SpreadsheetApp.getUi().alert('Click a cell in a response row first.');
  publishRow_(sheet, row, columns_(sheet, true));
}

// ── Publishing ───────────────────────────────────────────────

function publishRow_(sheet, row, cols) {
  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  const statusCell = sheet.getRange(row, cols.status);
  try {
    statusCell.setValue('Publishing…');
    SpreadsheetApp.flush();
    const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
    const get = (key) => (cols[key] ? String(values[cols[key] - 1] == null ? '' : values[cols[key] - 1]).trim() : '');
    const sub = {
      name: get('name').replace(/\s+/g, ' '),
      classYear: get('classYear'),
      big: get('big'),
      phone: formatPhone_(get('phone')),
      email: get('email').toLowerCase(),
      photoUrl: get('photo'),
    };
    if (!sub.name) throw new Error('This row has no name.');
    const note = updateSite_(sub);
    statusCell.setValue(`Published ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'M/d/yyyy h:mm a')} · ${note}`);
  } catch (err) {
    statusCell.setValue(`Error: ${err.message}`);
    sheet.getRange(row, cols.approve).setValue(false);
  } finally {
    lock.releaseLock();
  }
}

// Re-reads data.json on every attempt so a save made on the site at the same time isn't lost.
function updateSite_(sub) {
  let photoPath = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { data, sha } = readData_();
    const { person, note } = upsertPerson_(data, sub);
    if (sub.photoUrl && photoPath === null) photoPath = uploadPhoto_(person.id, person.name, sub.photoUrl);
    if (photoPath) person.photo = photoPath;
    data.updated = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMMM d, yyyy');
    try {
      writeData_(data, sha, `Publish sign-up: ${person.name}`);
      return note + (photoPath ? ' + photo' : '');
    } catch (err) {
      if (err.code !== 409 || attempt === 3) throw err;
    }
  }
}

// Updates the matching person, or adds a new one. Never changes an existing person's big.
function upsertPerson_(data, sub) {
  let person = (sub.email && data.people.find((p) => p.email && p.email.toLowerCase() === sub.email)) ||
    findByName_(data.people, sub.name);
  let note;
  if (person) {
    note = `updated ${person.name}`;
  } else {
    person = { id: uniqueId_(data.people, sub.name), name: sub.name, cohort: currentCohort_() };
    const big = sub.big ? findByName_(data.people, sub.big) : null;
    if (big) person.big = big.id;
    data.people.push(person);
    note = big ? `added under ${big.name}` : 'added to "waiting on a big"';
  }
  if (sub.classYear) person.classYear = sub.classYear;
  if (sub.phone) person.phone = sub.phone;
  if (sub.email) person.email = sub.email;
  return { person, note };
}

function uploadPhoto_(id, name, url) {
  const match = String(url).match(/[-\w]{25,}/);
  if (!match) throw new Error("Couldn't read the photo link.");
  const blob = photoBlob_(match[0]);
  const path = `photos/${id}.jpg`;
  let sha;
  try {
    sha = github_('get', `/contents/${path}`).sha;
  } catch (err) {
    if (err.code !== 404) throw err;
  }
  const body = { message: `Photo for ${name}`, content: Utilities.base64Encode(blob.getBytes()) };
  if (sha) body.sha = sha;
  github_('put', `/contents/${path}`, body);
  return `${path}?v=${Date.now()}`;
}

// Drive's thumbnail service hands back a resized JPEG, which also converts iPhone HEIC photos.
function photoBlob_(fileId) {
  const file = DriveApp.getFileById(fileId);
  const auth = { headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` }, muteHttpExceptions: true };
  const meta = UrlFetchApp.fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink`, auth);
  const link = meta.getResponseCode() === 200 ? JSON.parse(meta.getContentText()).thumbnailLink : null;
  if (link) {
    const res = UrlFetchApp.fetch(link.replace(/=s\d+$/, `=s${PHOTO_SIZE}`), auth);
    if (res.getResponseCode() === 200) return res.getBlob();
  }
  if (/^image\/(jpeg|png|webp|gif)$/.test(file.getMimeType()) && file.getSize() < 8 * 1024 * 1024) return file.getBlob();
  throw new Error("Couldn't process the photo yet. Wait a minute and tick Approve again, or ask for a JPG/PNG.");
}

// ── GitHub ───────────────────────────────────────────────────

function readData_() {
  const file = github_('get', '/contents/data.json');
  const text = Utilities.newBlob(Utilities.base64Decode(file.content.replace(/\s/g, ''))).getDataAsString('UTF-8');
  return { data: JSON.parse(text), sha: file.sha };
}

function writeData_(data, sha, message) {
  github_('put', '/contents/data.json', {
    message,
    sha,
    content: Utilities.base64Encode(serialize_(data), Utilities.Charset.UTF_8),
  });
}

// Same layout the site's editor writes: one person per line.
function serialize_(d) {
  const lines = d.people.map((p) => {
    const o = {};
    FIELDS.forEach((k) => { if (p[k]) o[k] = p[k]; });
    return '    ' + JSON.stringify(o);
  });
  return '{\n  "updated": ' + JSON.stringify(d.updated || '') +
    ',\n  "joinFormUrl": ' + JSON.stringify(d.joinFormUrl || '') +
    ',\n  "people": [\n' + lines.join(',\n') + '\n  ]\n}\n';
}

function github_(method, path, body, token) {
  const key = token || PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!key) throw new Error('No GitHub token yet. Use Family Tree -> Set up automation.');
  const res = UrlFetchApp.fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}${path}`, {
    method,
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    payload: body ? JSON.stringify(body) : undefined,
  });
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code >= 300) {
    let msg = text;
    try { msg = JSON.parse(text).message; } catch (_) { /* not JSON */ }
    if (code === 401) msg = 'GitHub rejected the token. Use Family Tree -> Change GitHub token.';
    if (code === 403 && method === 'put') msg = 'The token can read but not save. Give it Contents: Read and write on GitHub.';
    const err = new Error(`${msg} (${code})`);
    err.code = code;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

// ── Helpers ──────────────────────────────────────────────────

function responsesSheet_() {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheets().find((s) => s.getFormUrl()) || ss.getSheets()[0];
}

// 1-based column numbers by header; adds Status / Approve columns when missing.
function columns_(sheet, create) {
  const width = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0].map((h) => String(h).trim().toLowerCase());
  const cols = {};
  Object.keys(HEADERS).forEach((key) => {
    const i = headers.findIndex((h) => h.startsWith(HEADERS[key]));
    if (i >= 0) cols[key] = i + 1;
  });
  ['status', 'approve'].forEach((key) => {
    if (!cols[key] && create) {
      const col = sheet.getLastColumn() + 1;
      sheet.getRange(1, col).setValue(key === 'status' ? 'Status' : 'Approve');
      cols[key] = col;
    }
  });
  return cols;
}

const norm_ = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function slug_(s) {
  return norm_(String(s).replace(/['’]/g, '')).replace(/ /g, '-');
}

function findByName_(people, name) {
  const target = norm_(name);
  return people.find((p) => norm_(p.name) === target || p.id === slug_(name)) || null;
}

function uniqueId_(people, name) {
  const base = slug_(name) || 'member';
  let id = base;
  for (let i = 2; people.some((p) => p.id === id); i++) id = `${base}-${i}`;
  return id;
}

// Aug-Dec starts a new academic year, e.g. "2026–27".
function currentCohort_() {
  const d = new Date();
  const start = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${start}${EN_DASH}${String(start + 1).slice(2)}`;
}

function formatPhone_(raw) {
  const digits = String(raw).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : String(raw).trim();
}
