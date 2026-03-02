// ============================================================
// FIRE INSPECTOR PORTAL — Google Apps Script Backend
// Town of Yorktown
// ============================================================

const SHEET_NAME     = 'Submissions';
const USERS_SHEET    = 'Users';
const PENDING_SHEET  = 'Pending';
const COL = {
  ID: 1, REF: 2, TYPE: 3, DEPARTMENT: 4, STATUS: 5, ARCHIVED: 6,
  TIMESTAMP: 7, SUBMITTED_BY_USER: 8, SUBMITTED_BY_NAME: 9,
  ADDRESS: 10, PROPERTY_NAME: 11, DATA_JSON: 12, CHANGELOG_JSON: 13,
};
const NUM_COLS = 13;

function doGet(e) {
  // Handle requests sent as GET with payload query param
  if (e && e.parameter && e.parameter.payload) {
    try {
      const body = JSON.parse(e.parameter.payload);
      let result;
      switch (body.action) {
        case 'getAll':         result = getAll();                              break;
        case 'create':         result = create(body.data);                     break;
        case 'update':         result = update(body.id, body.updates);         break;
        case 'delete':         result = deleteRow(body.id);                    break;
        case 'getUsers':       result = getUsers();                            break;
        case 'createUser':     result = createUser(body.user);                 break;
        case 'updateUser':     result = updateUser(body.username, body.updates); break;
        case 'deleteUser':     result = deleteUser(body.username);             break;
        case 'createPending':  result = createPending(body.req);               break;
        case 'deletePending':  result = deletePending(body.username);          break;
        default:               result = { error: 'Unknown action' };
      }
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService
        .createTextOutput(JSON.stringify({ error: err.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, msg: 'Fire Inspector Portal API' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    let result;
    switch (body.action) {
      case 'getAll':  result = getAll();                        break;
      case 'create':  result = create(body.data);               break;
      case 'update':  result = update(body.id, body.updates);   break;
      case 'delete':  result = deleteRow(body.id);              break;
      default:        result = { error: 'Unknown action' };
    }
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, NUM_COLS).setValues([[
      'ID','Ref','Type','Department','Status','Archived',
      'Timestamp','SubmittedByUser','SubmittedByName',
      'Address','PropertyName','DataJSON','ChangeLogJSON'
    ]]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, NUM_COLS).setFontWeight('bold');
  }
  return sheet;
}

function generateRef(type, sheet) {
  const prefix = { inspection:'INS', violation:'VIO', knox:'KNX' }[type] || 'UNK';
  const d = new Date();
  const ymd = String(d.getFullYear()).slice(-2)
    + String(d.getMonth()+1).padStart(2,'0')
    + String(d.getDate()).padStart(2,'0');
  const count = Math.max(sheet.getLastRow(), 1);
  return prefix + '-' + ymd + '-' + String(count).padStart(4,'0');
}

function rowToObject(row) {
  let data = {}, changeLog = [];
  try { data = JSON.parse(row[COL.DATA_JSON-1] || '{}'); } catch(e) {}
  try { changeLog = JSON.parse(row[COL.CHANGELOG_JSON-1] || '[]'); } catch(e) {}
  return {
    id:              row[COL.ID-1],
    ref:             row[COL.REF-1],
    type:            row[COL.TYPE-1],
    department:      row[COL.DEPARTMENT-1],
    status:          row[COL.STATUS-1],
    archived:        row[COL.ARCHIVED-1] === true || row[COL.ARCHIVED-1] === 'true',
    timestamp:       row[COL.TIMESTAMP-1],
    submittedByUser: row[COL.SUBMITTED_BY_USER-1],
    submittedByName: row[COL.SUBMITTED_BY_NAME-1],
    address:         row[COL.ADDRESS-1],
    property_name:   row[COL.PROPERTY_NAME-1],
    changeLog,
    ...data,
  };
}

function findRowById(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, COL.ID, lastRow-1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2;
  }
  return -1;
}

function getAll() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { data: [] };
  const rows = sheet.getRange(2, 1, lastRow-1, NUM_COLS).getValues();
  return { data: rows.filter(r => r[COL.ID-1]).map(rowToObject) };
}

function create(formData) {
  const sheet = getSheet();
  const id  = 'fp_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  const ref = generateRef(formData.type, sheet);
  const { type, department, status, archived, timestamp,
          submittedByUser, submittedByName, address,
          property_name, changeLog, ...rest } = formData;

  const row = new Array(NUM_COLS).fill('');
  row[COL.ID-1]               = id;
  row[COL.REF-1]              = ref;
  row[COL.TYPE-1]             = type;
  row[COL.DEPARTMENT-1]       = department;
  row[COL.STATUS-1]           = status || 'submitted';
  row[COL.ARCHIVED-1]         = false;
  row[COL.TIMESTAMP-1]        = timestamp || new Date().toISOString();
  row[COL.SUBMITTED_BY_USER-1]= submittedByUser || '';
  row[COL.SUBMITTED_BY_NAME-1]= submittedByName || '';
  row[COL.ADDRESS-1]          = address || '';
  row[COL.PROPERTY_NAME-1]    = property_name || '';
  row[COL.DATA_JSON-1]        = JSON.stringify(rest);
  row[COL.CHANGELOG_JSON-1]   = JSON.stringify(changeLog || []);
  sheet.appendRow(row);

  return { data: { id, ref, type, department, status: 'submitted', archived: false,
    timestamp: row[COL.TIMESTAMP-1], submittedByUser, submittedByName,
    address, property_name, changeLog: changeLog||[], ...rest } };
}

function update(id, updates) {
  const sheet = getSheet();
  const rowNum = findRowById(sheet, id);
  if (rowNum === -1) return { error: 'Ticket not found' };
  const row = sheet.getRange(rowNum, 1, 1, NUM_COLS).getValues()[0];

  if (updates.status    !== undefined) row[COL.STATUS-1]        = updates.status;
  if (updates.archived  !== undefined) row[COL.ARCHIVED-1]      = updates.archived;
  if (updates.changeLog !== undefined) row[COL.CHANGELOG_JSON-1]= JSON.stringify(updates.changeLog);

  const { status, archived, changeLog, ...extraUpdates } = updates;
  if (Object.keys(extraUpdates).length > 0) {
    let existing = {};
    try { existing = JSON.parse(row[COL.DATA_JSON-1] || '{}'); } catch(e) {}
    row[COL.DATA_JSON-1] = JSON.stringify({ ...existing, ...extraUpdates });
  }
  sheet.getRange(rowNum, 1, 1, NUM_COLS).setValues([row]);
  return { data: rowToObject(row) };
}

function deleteRow(id) {
  const sheet = getSheet();
  const rowNum = findRowById(sheet, id);
  if (rowNum === -1) return { error: 'Ticket not found' };
  sheet.deleteRow(rowNum);
  return { ok: true };
}

// ── USER MANAGEMENT ───────────────────────────────────────────────────────
function getUsersSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET);
    sheet.getRange(1,1,1,6).setValues([['Username','FullName','Role','Dept','PwHash','CreatedAt']]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,6).setFontWeight('bold');
    // Hide the PwHash column from casual viewing
    sheet.hideColumns(5);
  }
  return sheet;
}

function getPendingSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PENDING_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(PENDING_SHEET);
    sheet.getRange(1,1,1,5).setValues([['Username','FullName','Dept','PwHash','RequestedAt']]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,5).setFontWeight('bold');
    sheet.hideColumns(4);
  }
  return sheet;
}

function getUsers() {
  const uSheet = getUsersSheet();
  const pSheet = getPendingSheet();
  const uLast = uSheet.getLastRow();
  const pLast = pSheet.getLastRow();

  const users = uLast < 2 ? [] : uSheet.getRange(2,1,uLast-1,6).getValues()
    .filter(r => r[0])
    .map(r => ({ username:r[0], fullName:r[1], role:r[2], dept:r[3], pwHash:r[4] }));

  const pending = pLast < 2 ? [] : pSheet.getRange(2,1,pLast-1,5).getValues()
    .filter(r => r[0])
    .map(r => ({ username:r[0], fullName:r[1], dept:r[2], pwHash:r[3], requestedAt:r[4] }));

  return { users, pending };
}

function createUser(user) {
  const sheet = getUsersSheet();
  // Check for duplicate
  const last = sheet.getLastRow();
  if (last >= 2) {
    const existing = sheet.getRange(2,1,last-1,1).getValues().flat();
    if (existing.includes(user.username)) return { error: 'Username already exists' };
  }
  sheet.appendRow([user.username, user.fullName, user.role||'user', user.dept, user.pwHash, new Date().toISOString()]);
  return { ok: true };
}

function updateUser(username, updates) {
  const sheet = getUsersSheet();
  const last = sheet.getLastRow();
  if (last < 2) return { error: 'User not found' };
  const rows = sheet.getRange(2,1,last-1,6).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === username) {
      const rowNum = i + 2;
      if (updates.pwHash)   sheet.getRange(rowNum,5).setValue(updates.pwHash);
      if (updates.role)     sheet.getRange(rowNum,3).setValue(updates.role);
      if (updates.fullName) sheet.getRange(rowNum,2).setValue(updates.fullName);
      if (updates.dept)     sheet.getRange(rowNum,4).setValue(updates.dept);
      return { ok: true };
    }
  }
  return { error: 'User not found' };
}

function deleteUser(username) {
  const sheet = getUsersSheet();
  const last = sheet.getLastRow();
  if (last < 2) return { error: 'User not found' };
  const rows = sheet.getRange(2,1,last-1,1).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === username) { sheet.deleteRow(i+2); return { ok: true }; }
  }
  return { error: 'User not found' };
}

function createPending(req) {
  const sheet = getPendingSheet();
  const last = sheet.getLastRow();
  if (last >= 2) {
    const existing = sheet.getRange(2,1,last-1,1).getValues().flat();
    if (existing.includes(req.username)) return { error: 'Pending request already exists' };
  }
  sheet.appendRow([req.username, req.fullName, req.dept, req.pwHash, req.requestedAt||new Date().toISOString()]);
  return { ok: true };
}

function deletePending(username) {
  const sheet = getPendingSheet();
  const last = sheet.getLastRow();
  if (last < 2) return { ok: true };
  const rows = sheet.getRange(2,1,last-1,1).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === username) { sheet.deleteRow(i+2); return { ok: true }; }
  }
  return { ok: true };
}
