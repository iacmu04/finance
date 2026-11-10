/**
 * Finance Report Tracking System - Google Apps Script Backend
 * เชื่อมต่อ Google Spreadsheet ฐานข้อมูลรายงานงบการเงิน
 */

const SPREADSHEET_ID = '1BFzdwv5j7nRqvnzjFUHZpxScs2hZz80ZrBRYkipLBdM';

// ชื่อชีทที่ใช้ในระบบ
const SHEETS = {
  DEPARTMENTS: 'ส่วนงาน',
  AUDITORS: 'ผู้ตรวจสอบ',
  TRACKING: 'Tracking',
  EDIT: 'Edit',
  CONFIG: 'Config',
  SYSTEM_LOG: 'SystemLog',
  OFFICE: 'Office',
  HOLIDAY: 'Holiday'
};

/**
 * ดึง Spreadsheet Object
 */
function getSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID !== '') {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Web App Entry Point (doGet)
 * รองรับทั้งการแสดงผลเว็บ HTML (HtmlService) และการเรียก API ผ่าน JSON (CORS/REST)
 */
function doGet(e) {
  e = e || {};
  const params = e.parameter || {};
  const action = params.action;

  // ถ้าเป็นการเรียก API ขอข้อมูลแบบ JSON
  if (action) {
    try {
      const result = handleApiRequest(action, params);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: err.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ถ้าเปิดหน้าเว็บโดยตรง
  const template = HtmlService.createTemplateFromFile('Index');
  template.email = Session.getActiveUser().getEmail() || '';
  
  return template.evaluate()
    .setTitle('ระบบติดตามงานตรวจสอบงบการเงิน - Finance Report Tracking')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Web App Entry Point (doPost)
 * รองรับการบันทึกข้อมูลผ่าน HTTP POST (REST API)
 */
function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (pErr) {
        payload = e.parameter || {};
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    // ถอดรหัสกรณีส่งแบบ Form Parameter
    if (typeof payload.trackingData === 'string') {
      try { payload.trackingData = JSON.parse(payload.trackingData); } catch (e) {}
    }
    if (typeof payload.officeData === 'string') {
      try { payload.officeData = JSON.parse(payload.officeData); } catch (e) {}
    }
    if (typeof payload.editData === 'string') {
      try { payload.editData = JSON.parse(payload.editData); } catch (e) {}
    }
    
    const action = payload.action;
    const result = handleApiRequest(action, payload);
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Helper function สำหรับ Include ไฟล์ HTML ย่อยใน Apps Script (เช่น CSS, JS)
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * API Router
 */
function handleApiRequest(action, data) {
  switch (action) {
    case 'getInitialData':
      return getInitialData(data.email);
    case 'getUserProfile':
      return getUserProfile(data.email);
    case 'getTrackingList':
      return getTrackingList(data.filters, data.email);
    case 'getTrackingDetail':
      return getTrackingDetail(data.trackingId, data.email);
    case 'saveTracking':
      return saveTracking(data.trackingData, data.email);
    case 'saveEditRound':
      return saveEditRound(data.editData, data.email);
    case 'approveByDean':
      return approveByDean(data.trackingId, data.approveDate, data.email);
    case 'completeAndSubmit':
      return completeAndSubmit(data.trackingId, data.email);
    case 'cancelCompletion':
      return cancelCompletion(data.trackingId, data.reason, data.email);
    case 'changeAuditor':
      return changeDepartmentAuditor(data.deptCode, data.newAuditor, data.startDate, data.email);
    case 'updateConfig':
      return updateConfig(data.key, data.value, data.email);
    case 'saveOfficeAttendance':
      return saveOfficeAttendance(data.officeData, data.email);
    case 'getOfficeAttendance':
      return getOfficeAttendance(data.date, data.email);
    case 'getSystemLogs':
      return getSystemLogs(data.limit, data.email);
    default:
      throw new Error('ไม่พบ Action ที่ระบุ: ' + action);
  }
}

/* =========================================================================
 * 1. ระบบยืนยันตัวตนและการตรวจสอบสิทธิ์ (Authentication & RBAC)
 * ========================================================================= */

/**
 * ค้นหาข้อมูลผู้ใช้งานจาก Email
 */
function getUserProfile(email) {
  email = (email || Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.AUDITORS);
  if (!sheet) throw new Error('ไม่พบชีท ' + SHEETS.AUDITORS);

  const data = sheet.getDataRange().getValues();
  // Headers: A:รหัส, B:ชื่อ-สกุล, C:ชื่อเล่น, D:ตำแหน่ง, E:กลุ่มงาน, F:Role, G:e-mail, H:สถานะ
  let foundUser = null;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowEmail = (row[6] || '').toString().trim().toLowerCase();
    if (email && rowEmail === email) {
      foundUser = {
        code: row[0],
        name: row[1],
        nickname: row[2],
        position: row[3],
        group: row[4],
        role: row[5],
        email: row[6],
        status: row[7]
      };
      break;
    }
  }

  // หากไม่พบ email ตรงเป๊ะ ให้ส่งข้อมูลเบื้องต้นเพื่อแจ้งเตือน
  if (!foundUser) {
    return {
      authenticated: false,
      email: email,
      role: 'Guest',
      message: 'อีเมลนี้ (' + (email || 'ไม่ระบุ') + ') ยังไม่ได้รับสิทธิ์เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ (Admin)'
    };
  }

  foundUser.authenticated = true;
  return foundUser;
}

/**
 * ตรวจสอบสิทธิ์ที่จำเป็น (Enforce Permission)
 */
function assertPermission(email, allowedRoles) {
  const profile = getUserProfile(email);
  if (!profile.authenticated) {
    throw new Error('ไม่ได้รับอนุญาต: บัญชีผู้ใช้นี้ไม่มีสิทธิ์เข้าถึงระบบ');
  }
  if (profile.status && profile.status.toLowerCase() !== 'active' && profile.status !== 'ใช้งาน') {
    throw new Error('บัญชีผู้ใช้งานนี้ถูกระงับการใช้งาน');
  }
  if (allowedRoles && allowedRoles.length > 0) {
    const hasRole = allowedRoles.some(r => r.toLowerCase() === profile.role.toLowerCase());
    if (!hasRole) {
      throw new Error('ท่านไม่มีสิทธิ์ดำเนินการในส่วนนี้ (ต้องการสิทธิ์: ' + allowedRoles.join(', ') + ')');
    }
  }
  return profile;
}

/* =========================================================================
 * 2. การดึงข้อมูลเริ่มต้นและ Dashboard (Data Aggregation)
 * ========================================================================= */

/**
 * ดึงข้อมูลตั้งค่าทั้งหมด (Config)
 */
function getConfigMap() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.CONFIG);
  const configs = {
    KPI_DAYS: 20
  };
  if (!sheet) return configs;

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const key = (data[i][0] || '').toString().trim();
    const val = data[i][1];
    if (key) {
      configs[key] = val;
    }
  }
  return configs;
}

/**
 * ดึงข้อมูลเริ่มต้นทั้งหมด (Departments, Auditors, Config, UserProfile)
 */
function getInitialData(email) {
  const profile = getUserProfile(email);
  const ss = getSpreadsheet();
  
  // 1. ส่วนงาน
  const deptSheet = ss.getSheetByName(SHEETS.DEPARTMENTS);
  const deptData = deptSheet ? deptSheet.getDataRange().getValues() : [];
  const departments = [];
  for (let i = 1; i < deptData.length; i++) {
    const r = deptData[i];
    if (r[0]) {
      departments.push({
        code: r[0],
        name: r[1],
        auditor: r[2],
        startDate: formatDateDisplay(r[3]),
        cycle: r[4] || 'รายเดือน',
        status: r[5] || 'ใช้งาน'
      });
    }
  }

  // 2. ผู้ตรวจสอบ
  const audSheet = ss.getSheetByName(SHEETS.AUDITORS);
  const audData = audSheet ? audSheet.getDataRange().getValues() : [];
  const auditors = [];
  for (let i = 1; i < audData.length; i++) {
    const r = audData[i];
    if (r[0]) {
      auditors.push({
        code: r[0],
        name: r[1],
        nickname: r[2],
        position: r[3],
        group: r[4],
        role: r[5],
        email: r[6],
        status: r[7]
      });
    }
  }

  // 3. Config
  const configs = getConfigMap();

  return {
    success: true,
    user: profile,
    departments: departments,
    auditors: auditors,
    configs: configs
  };
}

/* =========================================================================
 * 3. ข้อมูลงานตรวจสอบ (Tracking CRUD & Workflow)
 * ========================================================================= */

/**
 * ดึงรายการงานตรวจสอบ พร้อมคำนวณ KPI และสถานะตามเงื่อนไข
 */
function getTrackingList(filters, email) {
  filters = filters || {};
  const profile = getUserProfile(email);
  const ss = getSpreadsheet();
  const trackSheet = ss.getSheetByName(SHEETS.TRACKING);
  const editSheet = ss.getSheetByName(SHEETS.EDIT);
  const configs = getConfigMap();
  const kpiStandardDays = parseInt(configs.KPI_DAYS, 10) || 20;

  if (!trackSheet) return { success: true, data: [] };

  const trackData = trackSheet.getDataRange().getValues();
  if (trackData.length <= 1) return { success: true, data: [] };

  // อ่านข้อมูลการแก้ไขทั้งหมดเพื่อ Map รวดเร็ว
  const editMap = {};
  if (editSheet && editSheet.getLastRow() > 1) {
    const editData = editSheet.getDataRange().getValues();
    // A:รหัสรายการแก้ไข, B:รหัสงานตรวจสอบ, C:ครั้งที่แก้ไข, D:ส่งกลับแก้ไข, E:แก้ไขส่งกลับผอ., F:จำนวนวันที่ใช้, G:หมายเหตุ, H:รหัสผู้บันทึก, I:วันเวลาบันทึก, J:สถานะ
    for (let i = 1; i < editData.length; i++) {
      const r = editData[i];
      const tid = (r[1] || '').toString().trim();
      if (!tid) continue;
      if (!editMap[tid]) {
        editMap[tid] = {
          rounds: [],
          totalDays: 0,
          pendingEdit: false,
          count: 0
        };
      }
      const days = parseFloat(r[5]) || 0;
      const isPending = (r[9] === 'รอแก้ไข' || (!r[4] && r[3]));
      editMap[tid].count++;
      editMap[tid].totalDays += days;
      if (isPending) editMap[tid].pendingEdit = true;
      editMap[tid].rounds.push({
        editId: r[0],
        round: r[2],
        dateReturned: formatDateDisplay(r[3]),
        dateResubmitted: formatDateDisplay(r[4]),
        daysUsed: days,
        note: r[6],
        recorder: r[7],
        recordedAt: formatDateDisplay(r[8]),
        status: r[9] || (isPending ? 'รอแก้ไข' : 'ส่งคืนแล้ว')
      });
    }
  }

  // อ่านผู้ตรวจสอบเพื่อ map กับกลุ่มงาน
  const audSheet = ss.getSheetByName(SHEETS.AUDITORS);
  const audData = audSheet ? audSheet.getDataRange().getValues() : [];
  const auditorGroupMap = {};
  for (let i = 1; i < audData.length; i++) {
    const name = (audData[i][1] || '').toString().trim();
    const grp = (audData[i][4] || '').toString().trim();
    if (name) auditorGroupMap[name] = grp;
  }

  const result = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 1; i < trackData.length; i++) {
    const row = trackData[i];
    const trackingId = (row[0] || '').toString().trim();
    if (!trackingId) continue;

    const cycle = row[1];
    const period = row[2];
    const fiscalYear = row[3];
    const department = row[4];
    const auditor = row[5];
    const dateReceivedFromDept = row[6];
    const dateAuditorReceived = row[7];
    const dateSubmittedToLeader = row[8];
    const dateSubmittedToDean = row[9];
    const dateSubmittedToPresident = row[10];
    const dateDeanApproved = row[11];
    const periodKey = row[12];

    const auditorGroup = auditorGroupMap[auditor] || '';

    // การกรองสิทธิ์ระดับ Backend
    if (profile.role === 'User') {
      // User เห็นเฉพาะงานที่ตนเองรับผิดชอบ หรืออยู่ในกลุ่มงานตนเอง
      const isOwner = (auditor === profile.name || auditor === profile.code);
      const isSameGroup = (auditorGroup && auditorGroup === profile.group);
      if (!isOwner && !isSameGroup) {
        continue;
      }
    } else if (profile.role === 'Leader') {
      // Leader เห็นเฉพาะงานของกลุ่มงานตนเอง
      if (auditorGroup && auditorGroup !== profile.group) {
        continue;
      }
    }

    // ตัวกรองจาก Frontend
    if (filters.fiscalYear && filters.fiscalYear.toString() !== fiscalYear.toString()) continue;
    if (filters.cycle && filters.cycle !== cycle) continue;
    if (filters.group && auditorGroup !== filters.group) continue;
    if (filters.auditor && auditor !== filters.auditor) continue;
    if (filters.department && department !== filters.department) continue;

    // คำนวณ KPI 20 วัน
    let kpiDays = null;
    let kpiStatus = 'ยังไม่เริ่มนับ'; // ยังไม่ได้รับงบ
    let dueDate = null;
    let daysRemaining = null;

    if (dateAuditorReceived && isValidDate(dateAuditorReceived)) {
      const dtAudRec = new Date(dateAuditorReceived);
      dtAudRec.setHours(0, 0, 0, 0);

      dueDate = new Date(dtAudRec.getTime() + (kpiStandardDays * 24 * 60 * 60 * 1000));

      if (dateSubmittedToDean && isValidDate(dateSubmittedToDean)) {
        const dtDean = new Date(dateSubmittedToDean);
        dtDean.setHours(0, 0, 0, 0);
        kpiDays = Math.round((dtDean.getTime() - dtAudRec.getTime()) / (24 * 60 * 60 * 1000));
        kpiStatus = kpiDays <= kpiStandardDays ? 'ทันกำหนด' : 'เกินกำหนด';
      } else {
        // ยังไม่ได้เสนอ ผอ. คำนวณจากปัจจุบัน
        const daysPassed = Math.round((today.getTime() - dtAudRec.getTime()) / (24 * 60 * 60 * 1000));
        daysRemaining = Math.round((dueDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
        if (daysRemaining < 0) {
          kpiStatus = 'เกินกำหนด';
        } else if (daysRemaining <= 5) {
          kpiStatus = 'ใกล้ครบกำหนด';
        } else {
          kpiStatus = 'อยู่ระหว่างตรวจสอบ';
        }
        kpiDays = daysPassed;
      }
    }

    // คำนวณสถานะงานแบบ Dynamic
    const editInfo = editMap[trackingId] || { count: 0, totalDays: 0, pendingEdit: false, rounds: [] };
    let status = 'รอส่วนงานส่งงบ';

    if (dateSubmittedToPresident && isValidDate(dateSubmittedToPresident)) {
      status = 'เสนออธิการบดีแล้ว';
    } else if (dateDeanApproved && isValidDate(dateDeanApproved)) {
      status = 'ผู้อำนวยการเห็นชอบแล้ว';
    } else if (editInfo.pendingEdit) {
      status = 'ผู้อำนวยการส่งกลับแก้ไข';
    } else if (dateSubmittedToDean && isValidDate(dateSubmittedToDean)) {
      status = 'เสนอผู้อำนวยการแล้ว';
    } else if (dateSubmittedToLeader && isValidDate(dateSubmittedToLeader)) {
      status = 'เสนอหัวหน้ากลุ่มงานแล้ว';
    } else if (dateAuditorReceived && isValidDate(dateAuditorReceived)) {
      status = 'ผู้ตรวจสอบกำลังตรวจสอบ';
    } else if (dateReceivedFromDept && isValidDate(dateReceivedFromDept)) {
      status = 'ได้รับงบแล้ว รอสารบรรณส่งมอบ';
    }

    if (filters.status && filters.status !== status) continue;

    result.push({
      rowIndex: i + 1,
      trackingId: trackingId,
      cycle: cycle,
      period: period,
      fiscalYear: fiscalYear,
      department: department,
      auditor: auditor,
      auditorGroup: auditorGroup,
      dateReceivedFromDept: formatDateDisplay(dateReceivedFromDept),
      dateAuditorReceived: formatDateDisplay(dateAuditorReceived),
      dateSubmittedToLeader: formatDateDisplay(dateSubmittedToLeader),
      dateSubmittedToDean: formatDateDisplay(dateSubmittedToDean),
      dateSubmittedToPresident: formatDateDisplay(dateSubmittedToPresident),
      dateDeanApproved: formatDateDisplay(dateDeanApproved),
      periodKey: periodKey,
      kpiDays: kpiDays,
      kpiStandardDays: kpiStandardDays,
      kpiStatus: kpiStatus,
      dueDate: formatDateDisplay(dueDate),
      daysRemaining: daysRemaining,
      status: status,
      editCount: editInfo.count,
      editTotalDays: editInfo.totalDays,
      hasPendingEdit: editInfo.pendingEdit
    });
  }

  return {
    success: true,
    data: result,
    userRole: profile.role,
    userGroup: profile.group
  };
}

/**
 * บันทึก/แก้ไขข้อมูลงานตรวจสอบ
 */
function saveTracking(item, email) {
  const profile = assertPermission(email, ['User', 'Leader', 'Dean', 'Admin']);
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.TRACKING);
  if (!sheet) throw new Error('ไม่พบชีท ' + SHEETS.TRACKING);

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;
    let oldDataStr = '';

    // หากมี trackingId ให้หาแถวเดิม หรือค้นหาจาก ส่วนงาน + งวด + ปีงบประมาณ
    if (item.trackingId) {
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] && data[i][0].toString().trim() === item.trackingId.trim()) {
          rowIndex = i + 1;
          oldDataStr = JSON.stringify(data[i]);
          break;
        }
      }
    }
    if (rowIndex === -1 && item.department && item.period && item.fiscalYear) {
      for (let i = 1; i < data.length; i++) {
        if (data[i][4] && data[i][4].toString().trim() === item.department.trim() &&
            data[i][2] && data[i][2].toString().trim() === item.period.trim() &&
            data[i][3] && data[i][3].toString().trim() === item.fiscalYear.toString().trim()) {
          rowIndex = i + 1;
          item.trackingId = data[i][0];
          oldDataStr = JSON.stringify(data[i]);
          break;
        }
      }
    }

    // สร้าง ID อัตโนมัติถ้าเป็นรายการใหม่
    const fy = item.fiscalYear || '2570';
    if (rowIndex === -1) {
      const newId = generateTrackingId(data, fy);
      item.trackingId = newId;

      const newRow = [
        item.trackingId,
        item.cycle || 'รายเดือน',
        item.period || '',
        item.fiscalYear || fy,
        item.department || '',
        item.auditor || '',
        parseDateInput(item.dateReceivedFromDept),
        parseDateInput(item.dateAuditorReceived),
        parseDateInput(item.dateSubmittedToLeader),
        parseDateInput(item.dateSubmittedToDean),
        parseDateInput(item.dateSubmittedToPresident),
        parseDateInput(item.dateDeanApproved),
        item.periodKey || (fy + '-' + item.period)
      ];

      sheet.appendRow(newRow);

      logAction(
        profile.email,
        'สร้างงานตรวจสอบใหม่',
        item.trackingId,
        '-',
        JSON.stringify(newRow),
        'เพิ่มงวดงาน ' + item.period + ' ส่วนงาน ' + item.department
      );

      return { success: true, trackingId: item.trackingId, isNew: true };
    } else {
      // อัปเดตแถวเดิม
      const rowValues = [
        item.trackingId,
        item.cycle || data[rowIndex - 1][1],
        item.period || data[rowIndex - 1][2],
        item.fiscalYear || data[rowIndex - 1][3],
        item.department || data[rowIndex - 1][4],
        item.auditor || data[rowIndex - 1][5],
        parseDateInput(item.dateReceivedFromDept),
        parseDateInput(item.dateAuditorReceived),
        parseDateInput(item.dateSubmittedToLeader),
        parseDateInput(item.dateSubmittedToDean),
        parseDateInput(item.dateSubmittedToPresident),
        parseDateInput(item.dateDeanApproved),
        item.periodKey || data[rowIndex - 1][12]
      ];

      sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);

      logAction(
        profile.email,
        'แก้ไขข้อมูลงานตรวจสอบ',
        item.trackingId,
        oldDataStr,
        JSON.stringify(rowValues),
        'อัปเดตวันที่ดำเนินงาน'
      );

      return { success: true, trackingId: item.trackingId, isNew: false };
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * สร้าง Tracking ID ใหม่ ไม่ซ้ำกัน เช่น FR-2570-001
 */
function generateTrackingId(existingData, fiscalYear) {
  let maxNum = 0;
  const prefix = 'FR-' + fiscalYear + '-';

  for (let i = 1; i < existingData.length; i++) {
    const id = (existingData[i][0] || '').toString().trim();
    if (id.startsWith(prefix)) {
      const numPart = parseInt(id.replace(prefix, ''), 10);
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    }
  }

  const nextNum = maxNum + 1;
  const padded = ('000' + nextNum).slice(-3);
  return prefix + padded;
}

/* =========================================================================
 * 4. ระบบประวัติการส่งกลับแก้ไข (Edit History & Tracking)
 * ========================================================================= */

/**
 * บันทึกรอบการส่งกลับแก้ไข (Edit Round)
 */
function saveEditRound(editData, email) {
  const profile = assertPermission(email, ['Dean', 'Admin', 'Leader', 'User']);
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.EDIT);
  if (!sheet) throw new Error('ไม่พบชีท ' + SHEETS.EDIT);

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const data = sheet.getDataRange().getValues();
    const tid = editData.trackingId;
    if (!tid) throw new Error('ไม่พบรหัสงานตรวจสอบ (trackingId)');

    // หาจำนวนรอบเดิมของ trackingId นี้
    let maxRound = 0;
    let editRowIndex = -1;

    for (let i = 1; i < data.length; i++) {
      if (data[i][1] && data[i][1].toString().trim() === tid.trim()) {
        const rnd = parseInt(data[i][2], 10);
        if (!isNaN(rnd) && rnd > maxRound) maxRound = rnd;
        if (editData.editId && data[i][0] && data[i][0].toString().trim() === editData.editId.trim()) {
          editRowIndex = i + 1;
        }
      }
    }

    // คำนวณจำนวนวัน
    let days = '';
    const dateReturned = parseDateInput(editData.dateReturned);
    const dateResubmitted = parseDateInput(editData.dateResubmitted);

    if (dateReturned && dateResubmitted) {
      const dtRet = new Date(dateReturned);
      const dtRes = new Date(dateResubmitted);
      days = Math.max(0, Math.round((dtRes.getTime() - dtRet.getTime()) / (24 * 60 * 60 * 1000)));
    }

    const status = (dateResubmitted && dateResubmitted !== '') ? 'ส่งคืนแล้ว' : 'รอแก้ไข';

    if (editRowIndex === -1) {
      // สร้างรอบใหม่
      const nextRound = maxRound + 1;
      const editId = 'ED-' + tid.replace('FR-', '') + '-' + ('0' + nextRound).slice(-2);
      const nowStr = new Date();

      const newRow = [
        editId,
        tid,
        nextRound,
        dateReturned,
        dateResubmitted,
        days,
        editData.note || '',
        profile.code || profile.name,
        nowStr,
        status
      ];

      sheet.appendRow(newRow);

      logAction(
        profile.email,
        'ส่งกลับแก้ไขรายงาน',
        tid,
        '-',
        JSON.stringify(newRow),
        'รอบที่ ' + nextRound + ' หมายเหตุ: ' + (editData.note || '-')
      );

      return { success: true, editId: editId, round: nextRound };
    } else {
      // อัปเดตข้อมูลรอบเดิม (เช่น ผู้ตรวจสอบบันทึกวันที่ส่งคืน)
      const oldRow = data[editRowIndex - 1];
      const updatedRow = [
        oldRow[0],
        oldRow[1],
        oldRow[2],
        dateReturned || oldRow[3],
        dateResubmitted,
        days !== '' ? days : oldRow[5],
        editData.note !== undefined ? editData.note : oldRow[6],
        profile.code || profile.name,
        new Date(),
        status
      ];

      sheet.getRange(editRowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);

      logAction(
        profile.email,
        'อัปเดตผลการส่งคืนแก้ไข',
        tid,
        JSON.stringify(oldRow),
        JSON.stringify(updatedRow),
        'แก้ไขส่งคืนรอบที่ ' + oldRow[2]
      );

      return { success: true, editId: oldRow[0], round: oldRow[2] };
    }
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================================
 * 5. การพิจารณาของผู้อำนวยการ และการเสนออธิการบดี (Dean Actions)
 * ========================================================================= */

/**
 * ผู้อำนวยการเห็นชอบรายงานฉบับสมบูรณ์ (บันทึกลงคอลัมน์ L)
 */
function approveByDean(trackingId, approveDate, email) {
  const profile = assertPermission(email, ['Dean', 'Admin']);
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.TRACKING);
  if (!sheet) throw new Error('ไม่พบชีท ' + SHEETS.TRACKING);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim() === trackingId.trim()) {
        const appDateVal = approveDate ? parseDateInput(approveDate) : new Date();
        sheet.getRange(i + 1, 12).setValue(appDateVal); // Col L

        logAction(
          profile.email,
          'ผู้อำนวยการเห็นชอบรายงาน',
          trackingId,
          data[i][11] ? formatDateDisplay(data[i][11]) : '-',
          formatDateDisplay(appDateVal),
          'ผอ. ให้ความเห็นชอบรายงานฉบับสมบูรณ์'
        );

        return { success: true, dateDeanApproved: formatDateDisplay(appDateVal) };
      }
    }
    throw new Error('ไม่พบรหัสงานตรวจสอบ: ' + trackingId);
  } finally {
    lock.releaseLock();
  }
}

/**
 * เสร็จสิ้นและเสนออธิการบดี (บันทึก Col K อัตโนมัติ)
 */
function completeAndSubmit(trackingId, email) {
  const profile = assertPermission(email, ['Dean', 'Admin']);
  const ss = getSpreadsheet();
  const trackSheet = ss.getSheetByName(SHEETS.TRACKING);
  const editSheet = ss.getSheetByName(SHEETS.EDIT);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    // 1. ตรวจสอบเงื่อนไขใน Tracking
    const trackData = trackSheet.getDataRange().getValues();
    let rowIndex = -1;
    let trackRow = null;

    for (let i = 1; i < trackData.length; i++) {
      if (trackData[i][0] && trackData[i][0].toString().trim() === trackingId.trim()) {
        rowIndex = i + 1;
        trackRow = trackData[i];
        break;
      }
    }

    if (rowIndex === -1) throw new Error('ไม่พบรหัสงาน ' + trackingId);

    // เงื่อนไข 1: ต้องมีวันที่ ผอ. เห็นชอบรายงาน (Col L)
    if (!trackRow[11] || trackRow[11] === '') {
      throw new Error('ไม่สามารถเสนออธิการบดีได้: รายงานนี้ยังไม่ได้รับการเห็นชอบรายงานฉบับสมบูรณ์จากผู้อำนวยการ');
    }

    // เงื่อนไข 2: ยังไม่ถูกเสนออธิการบดี (Col K ว่าง)
    if (trackRow[10] && trackRow[10] !== '') {
      throw new Error('รายงานนี้ได้ถูกเสนออธิการบดีไปแล้วเมื่อวันที่ ' + formatDateDisplay(trackRow[10]));
    }

    // เงื่อนไข 3: ต้องไม่มีการส่งกลับแก้ไขที่ยังค้างอยู่
    if (editSheet && editSheet.getLastRow() > 1) {
      const editData = editSheet.getDataRange().getValues();
      for (let j = 1; j < editData.length; j++) {
        if (editData[j][1] && editData[j][1].toString().trim() === trackingId.trim()) {
          if (editData[j][9] === 'รอแก้ไข' || (!editData[j][4] && editData[j][3])) {
            throw new Error('ไม่สามารถเสนออธิการบดีได้: ยังมีรายการแก้ไขรอบที่ ' + editData[j][2] + ' ที่อยู่ระหว่างแก้ไข');
          }
        }
      }
    }

    const todayDate = new Date();
    trackSheet.getRange(rowIndex, 11).setValue(todayDate); // Col K

    logAction(
      profile.email,
      'เสร็จสิ้นและเสนออธิการบดี',
      trackingId,
      '-',
      formatDateDisplay(todayDate),
      'บันทึกวันที่เสนออธิการบดีเรียบร้อย'
    );

    return {
      success: true,
      submittedDate: formatDateDisplay(todayDate)
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ยกเลิกการเสร็จสิ้น (Cancel Completion)
 */
function cancelCompletion(trackingId, reason, email) {
  const profile = assertPermission(email, ['Dean', 'Admin']);
  if (!reason || reason.trim() === '') {
    throw new Error('กรุณาระบุเหตุผลในการยกเลิกการเสนออธิการบดี');
  }

  const ss = getSpreadsheet();
  const trackSheet = ss.getSheetByName(SHEETS.TRACKING);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const data = trackSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim() === trackingId.trim()) {
        const oldVal = data[i][10];
        trackSheet.getRange(i + 1, 11).setValue(''); // เคลียร์ Col K

        logAction(
          profile.email,
          'ยกเลิกการเสนออธิการบดี',
          trackingId,
          formatDateDisplay(oldVal),
          'ยกเลิกสถานะ',
          reason
        );

        return { success: true };
      }
    }
    throw new Error('ไม่พบรหัสงาน: ' + trackingId);
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================================
 * 6. การจัดการส่วนงานและเปลี่ยนตัวผู้ตรวจสอบ (Department Management)
 * ========================================================================= */

/**
 * เปลี่ยนผู้ตรวจสอบที่รับผิดชอบส่วนงาน
 * ตามโจทย์: หากมีการเปลี่ยนผู้ตรวจสอบใหม่ ให้กรอกเปลี่ยนชื่อกับวันที่เริ่ม แล้วสถานะของผู้เดิมให้เปลี่ยนเป็น ยกเลิก
 */
function changeDepartmentAuditor(deptCode, newAuditor, startDate, email) {
  const profile = assertPermission(email, ['Admin', 'Leader']);
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.DEPARTMENTS);
  if (!sheet) throw new Error('ไม่พบชีท ' + SHEETS.DEPARTMENTS);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const data = sheet.getDataRange().getValues();
    let found = false;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim() === deptCode.trim() && data[i][5] === 'ใช้งาน') {
        const oldAuditor = data[i][2];
        const deptName = data[i][1];
        const cycle = data[i][4];

        // เปลี่ยนแถวเดิมเป็น 'ยกเลิก'
        sheet.getRange(i + 1, 6).setValue('ยกเลิก');

        // เพิ่มแถวใหม่สถานะ 'ใช้งาน'
        const newRow = [
          deptCode,
          deptName,
          newAuditor,
          parseDateInput(startDate) || new Date(),
          cycle,
          'ใช้งาน'
        ];
        sheet.appendRow(newRow);

        logAction(
          profile.email,
          'เปลี่ยนผู้รับผิดชอบส่วนงาน',
          deptCode,
          oldAuditor,
          newAuditor,
          'เปลี่ยนผู้รับผิดชอบ ' + deptName + ' เริ่ม ' + startDate
        );

        found = true;
        break;
      }
    }

    if (!found) throw new Error('ไม่พบส่วนงานที่ใช้งานอยู่: ' + deptCode);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================================
 * 7. การตั้งค่าระบบ และ SystemLog (Config & Audit Log)
 * ========================================================================= */

/**
 * อัปเดตค่า Config (Admin เท่านั้น)
 */
function updateConfig(key, value, email) {
  const profile = assertPermission(email, ['Admin']);
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.CONFIG);
  if (!sheet) throw new Error('ไม่พบชีท ' + SHEETS.CONFIG);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const data = sheet.getDataRange().getValues();
    let updated = false;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim() === key.trim()) {
        const oldVal = data[i][1];
        sheet.getRange(i + 1, 2).setValue(value);
        sheet.getRange(i + 1, 4).setValue(new Date() + ' โดย ' + profile.name);

        logAction(
          profile.email,
          'แก้ไขการตั้งค่าระบบ',
          key,
          oldVal.toString(),
          value.toString(),
          'ปรับปรุงค่า ' + key
        );

        updated = true;
        break;
      }
    }

    if (!updated) {
      sheet.appendRow([key, value, 'การตั้งค่าระบบ', new Date() + ' โดย ' + profile.name]);
      logAction(profile.email, 'เพิ่มการตั้งค่าระบบ', key, '-', value.toString(), 'สร้าง Key ใหม่');
    }

    return { success: true, key: key, value: value };
  } finally {
    lock.releaseLock();
  }
}

/**
 * บันทึก SystemLog
 */
function logAction(userEmail, action, trackingId, oldVal, newVal, reason) {
  try {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName(SHEETS.SYSTEM_LOG);
    if (!sheet) {
      sheet = ss.insertSheet(SHEETS.SYSTEM_LOG);
      sheet.appendRow(['Log ID', 'วันและเวลา', 'ผู้ใช้งาน', 'การกระทำ', 'รหัสงานตรวจสอบ', 'ข้อมูลเดิม', 'ข้อมูลใหม่', 'เหตุผลประกอบ']);
    }

    const logId = 'LOG-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 900 + 100);
    const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss');

    sheet.appendRow([
      logId,
      now,
      userEmail || 'System',
      action || '',
      trackingId || '',
      typeof oldVal === 'object' ? JSON.stringify(oldVal) : (oldVal || ''),
      typeof newVal === 'object' ? JSON.stringify(newVal) : (newVal || ''),
      reason || ''
    ]);
  } catch (err) {
    Logger.log('Error writing log: ' + err.toString());
  }
}

/**
 * ดึง SystemLogs ล่าสุด
 */
function getSystemLogs(limit, email) {
  assertPermission(email, ['Dean', 'Admin']);
  limit = limit || 50;
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.SYSTEM_LOG);
  if (!sheet) return { success: true, logs: [] };

  const data = sheet.getDataRange().getValues();
  const logs = [];
  const start = Math.max(1, data.length - limit);

  for (let i = data.length - 1; i >= start; i--) {
    const r = data[i];
    if (r[0]) {
      logs.push({
        id: r[0],
        timestamp: r[1],
        user: r[2],
        action: r[3],
        trackingId: r[4],
        oldValue: r[5],
        newValue: r[6],
        reason: r[7]
      });
    }
  }

  return { success: true, logs: logs };
}

/* =========================================================================
 * 8. Date Helpers & Formatter
 * ========================================================================= */

function isValidDate(d) {
  if (!d) return false;
  if (d instanceof Date) return !isNaN(d.getTime());
  const parsed = Date.parse(d);
  return !isNaN(parsed);
}

function formatDateDisplay(val) {
  if (!val) return '';
  let d = val;
  if (!(d instanceof Date)) {
    d = new Date(val);
  }
  if (isNaN(d.getTime())) return val.toString();

  const day = ('0' + d.getDate()).slice(-2);
  const month = ('0' + (d.getMonth() + 1)).slice(-2);
  const yearBE = d.getFullYear() + 543;

  return day + '/' + month + '/' + yearBE;
}

function parseDateInput(str) {
  if (!str) return '';
  if (str instanceof Date) return str;
  str = str.toString().trim();
  if (str === '') return '';

  // ตรวจสอบรูปแบบ YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(str)) {
    const parts = str.split('-');
    let y = parseInt(parts[0], 10);
    if (y > 2400) y -= 543;
    return new Date(y, parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }

  // รูปแบบ dd/mm/yyyy หรือ dd-mm-yyyy (พ.ศ. หรือ ค.ศ.)
  const parts = str.split(/[\/\-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) { // YYYY/MM/DD
      let y = parseInt(parts[0], 10);
      if (y > 2400) y -= 543;
      return new Date(y, parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else { // DD/MM/YYYY
      let day = parseInt(parts[0], 10);
      let month = parseInt(parts[1], 10) - 1;
      let year = parseInt(parts[2], 10);
      if (year > 2400) year -= 543; // แปลง พ.ศ. เป็น ค.ศ.
      return new Date(year, month, day);
    }
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? str : d;
}

/* =========================================================================
 * 8. ระบบบันทึกข้อมูลการปฏิบัติงาน (Office Attendance)
 * ========================================================================= */

/**
 * บันทึกการเข้างานลงชีท Office
 * Cols: A:รหัส, B:วัน/เดือน/ปี, C:ภาค, D:การทำงาน
 */
function saveOfficeAttendance(officeData, email) {
  const profile = getUserProfile(email);
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.OFFICE);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.OFFICE);
    sheet.appendRow(['รหัส', 'วัน/เดือน/ปี', 'ภาค', 'การทำงาน']);
  }

  const userCode = officeData.userCode || profile.code || profile.nickname || 'Unknown';
  const dateStr = formatDateDisplay(officeData.date) || officeData.date;
  const session = (officeData.session || 'เช้า').trim();
  const workType = (officeData.workType || 'เข้า Office').trim();

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const data = sheet.getDataRange().getValues();
    let foundRow = -1;

    for (let i = 1; i < data.length; i++) {
      const rowCode = (data[i][0] || '').toString().trim();
      const rowDate = formatDateDisplay(data[i][1]);
      const rowSession = (data[i][2] || '').toString().trim();
      if (rowCode === userCode && rowDate === dateStr && rowSession === session) {
        foundRow = i + 1;
        break;
      }
    }

    if (foundRow !== -1) {
      sheet.getRange(foundRow, 4).setValue(workType);
    } else {
      sheet.appendRow([userCode, dateStr, session, workType]);
    }

    return {
      success: true,
      userCode: userCode,
      date: dateStr,
      session: session,
      workType: workType
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ดึงข้อมูลการเข้างานจากชีท Office
 */
function getOfficeAttendance(dateStr, email) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.OFFICE);
  if (!sheet) return { success: true, data: [] };

  const data = sheet.getDataRange().getValues();
  const list = [];
  const targetDate = dateStr ? formatDateDisplay(dateStr) : '';

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const dStr = formatDateDisplay(row[1]);
    if (!targetDate || dStr === targetDate) {
      list.push({
        code: row[0],
        date: dStr,
        session: row[2],
        workType: row[3]
      });
    }
  }

  return { success: true, data: list };
}

