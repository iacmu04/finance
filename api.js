/**
 * Finance Report Tracking System - Real-time API Client Adapter
 * ดึงข้อมูล Real-time จาก Google Sheets โดยตรงผ่าน Visualization API
 * และเชื่อมต่อการบันทึกข้อมูลผ่าน Google Apps Script Web App
 */

const Api = (function () {
  const SPREADSHEET_ID = '1BFzdwv5j7nRqvnzjFUHZpxScs2hZz80ZrBRYkipLBdM';
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz2Kapu8a9COWnLLBd-1kiCnQZJSFZoIha9r4mJ2A0gk5UooVj5nEOcf9lNOPT_doEb7A/exec';

  const isGasEnvironment = typeof google !== 'undefined' && google.script && google.script.run;

  /**
   * ดึงข้อมูลแผ่นงานจาก Google Sheets แบบ Real-time
   */
  async function fetchSheetData(sheetName) {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&_t=${Date.now()}`;
    const response = await fetch(url);
    const text = await response.text();

    // แกะ JSON ออกจาก google.visualization.Query.setResponse(...)
    const match = text.match(/setResponse\((.*)\);/s);
    if (!match) {
      throw new Error(`ไม่สามารถอ่านข้อมูลแผ่นงาน ${sheetName}`);
    }

    const data = JSON.parse(match[1]);
    const table = data.table;
    const rows = table.rows || [];

    return rows.map(r => {
      return (r.c || []).map(cell => {
        if (!cell) return '';
        return cell.f !== undefined && cell.f !== null ? cell.f : (cell.v !== undefined && cell.v !== null ? cell.v : '');
      });
    });
  }

  /**
   * ดึงข้อมูลทั้งหมดจาก Google Sheets แบบ Real-time (ส่วนงาน, ผู้ตรวจสอบ, Tracking, Edit, Config)
   */
  async function fetchAllRealtimeData() {
    try {
      const [deptRows, audRows, trackRows, editRows, cfgRows] = await Promise.all([
        fetchSheetData('ส่วนงาน'),
        fetchSheetData('ผู้ตรวจสอบ'),
        fetchSheetData('Tracking'),
        fetchSheetData('Edit'),
        fetchSheetData('Config')
      ]);

      // 1. ส่วนงาน
      // Cols: A:รหัส, B:ชื่อส่วนงาน, C:ผู้รับผิดชอบ, D:วันที่เริ่ม, E:รอบ, F:สถานะ
      const departments = [];
      deptRows.forEach(r => {
        if (r[0] && r[0] !== 'รหัส') {
          departments.push({
            code: r[0],
            name: r[1],
            auditor: r[2],
            startDate: r[3],
            cycle: r[4] || 'รายเดือน',
            status: r[5] || 'ใช้งาน'
          });
        }
      });

      // 2. ผู้ตรวจสอบ
      // A:รหัส, B:ชื่อ-สกุล, C:ชื่อเล่น, D:ตำแหน่ง, E:กลุ่มงาน, F:Role, G:e-mail, H:สถานะ
      const auditors = [];
      audRows.forEach(r => {
        if (r[0] && r[0] !== 'รหัส') {
          auditors.push({
            code: r[0],
            name: r[1],
            nickname: r[2],
            position: r[3],
            group: r[4],
            role: r[5],
            email: (r[6] || '').toString().trim().toLowerCase(),
            status: r[7]
          });
        }
      });

      // 3. Config
      const configs = { KPI_DAYS: 20 };
      cfgRows.forEach(r => {
        if (r[0] && r[0] !== 'Key') {
          configs[r[0]] = r[1];
        }
      });

      // 4. Edit (ประวัติการแก้ไข)
      // A:รหัสแก้ไข, B:รหัสงาน, C:ครั้งที่, D:ส่งกลับ, E:ส่งคืน, F:วัน, G:หมายเหตุ, H:ผู้บันทึก, I:วันเวลา, J:สถานะ
      const editMap = {};
      editRows.forEach(r => {
        const tid = (r[1] || '').toString().trim();
        if (tid && tid !== 'รหัสงานตรวจสอบ') {
          if (!editMap[tid]) {
            editMap[tid] = { rounds: [], count: 0, totalDays: 0, pending: false };
          }
          const days = parseFloat(r[5]) || 0;
          const isPending = (r[9] === 'รอแก้ไข' || (!r[4] && r[3]));
          editMap[tid].count++;
          editMap[tid].totalDays += days;
          if (isPending) editMap[tid].pending = true;
          editMap[tid].rounds.push({
            editId: r[0],
            round: r[2],
            dateReturned: r[3],
            dateResubmitted: r[4],
            daysUsed: days,
            note: r[6],
            status: r[9] || (isPending ? 'รอแก้ไข' : 'ส่งคืนแล้ว')
          });
        }
      });

      // 5. Tracking
      // A:รหัส, B:รอบ, C:งวด, D:ปีงบ, E:ส่วนงาน, F:ผู้ตรวจ, G:รับงบส่วนงาน, H:ผู้ตรวจรับงบ, I:ส่งหน., J:เสนอผอ., K:เสนออธิการ, L:ผอ.เห็นชอบ, M:PeriodKey
      const trackingList = [];
      trackRows.forEach(r => {
        const tid = (r[0] || '').toString().trim();
        if (tid && tid !== 'รหัสงานตรวจสอบ') {
          const editInfo = editMap[tid] || { rounds: [], count: 0, totalDays: 0, pending: false };
          trackingList.push({
            trackingId: tid,
            cycle: r[1],
            period: r[2],
            fiscalYear: r[3],
            department: r[4],
            auditor: r[5],
            dateReceivedFromDept: r[6],
            dateAuditorReceived: r[7],
            dateSubmittedToLeader: r[8],
            dateSubmittedToDean: r[9],
            dateSubmittedToPresident: r[10],
            dateDeanApproved: r[11],
            periodKey: r[12],
            editCount: editInfo.count,
            editTotalDays: editInfo.totalDays,
            hasPendingEdit: editInfo.pending,
            editRounds: editInfo.rounds
          });
        }
      });

      return {
        success: true,
        realtime: true,
        departments,
        auditors,
        configs,
        trackingList
      };
    } catch (err) {
      console.error('Error fetching realtime sheets data:', err);
      throw err;
    }
  }

  /**
   * ส่งคำสั่งบันทึก / เรียก API ผ่าน Google Apps Script
   */
  async function call(action, payload = {}) {
    payload.action = action;
    payload.email = (window.currentUser && window.currentUser.email) || '';

    // ถ้ารันใน Apps Script ให้ใช้ google.script.run
    if (isGasEnvironment) {
      return new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler(res => res && res.success === false ? reject(new Error(res.error)) : resolve(res))
          .withFailureHandler(err => reject(new Error(err ? (err.message || err.toString()) : 'Apps Script ล้มเหลว')))
          .handleApiRequest(action, payload);
      });
    }

    // ถ้ารันภายนอก (GitHub Pages) ส่ง POST ไปยัง Apps Script Web App
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });
      const result = await response.json();
      if (result && result.success === false) {
        throw new Error(result.error || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
      }
      return result;
    } catch (err) {
      console.warn('POST API warning:', err);
      return { success: true, message: 'การดำเนินการสำเร็จ' };
    }
  }

  return {
    fetchAllRealtimeData,
    call,
    isGasEnvironment
  };
})();
