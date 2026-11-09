/**
 * Finance Report Tracking System - API Client Adapter
 * จัดการการเชื่อมต่อระหว่าง Frontend กับ Google Apps Script Backend
 */

const Api = (function () {
  // ฝังค่า Google Apps Script Web App URL ไว้ถาวร
  const DEFAULT_APP_URL = 'https://script.google.com/macros/s/AKfycbz2Kapu8a9COWnLLBd-1kiCnQZJSFZoIha9r4mJ2A0gk5UooVj5nEOcf9lNOPT_doEb7A/exec';
  let scriptAppUrl = localStorage.getItem('FINANCE_REPORT_APP_URL') || DEFAULT_APP_URL;

  // เช็คว่ารันอยู่ภายใน Google Apps Script Web App หรือไม่
  const isGasEnvironment = typeof google !== 'undefined' && google.script && google.script.run;

  /**
   * เรียก API ฟังก์ชัน
   * @param {string} action ชื่อ Action
   * @param {object} payload พารามิเตอร์
   * @returns {Promise<any>}
   */
  async function call(action, payload = {}) {
    payload.action = action;
    payload.email = window.currentUserEmail || '';

    // 1. ถ้ารันใน Apps Script ให้ใช้ google.script.run
    if (isGasEnvironment) {
      return new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler(response => {
            if (response && response.success === false) {
              reject(new Error(response.error || 'เกิดข้อผิดพลาดในการประมวลผล'));
            } else {
              resolve(response);
            }
          })
          .withFailureHandler(err => {
            reject(new Error(err ? (err.message || err.toString()) : 'การเชื่อมต่อ Apps Script ล้มเหลว'));
          })
          .handleApiRequest(action, payload);
      });
    }

    // 2. เรียกผ่าน Google Apps Script Web App URL
    if (scriptAppUrl) {
      try {
        const response = await fetch(scriptAppUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify(payload),
          redirect: 'follow'
        });
        const result = await response.json();
        if (result && result.success === false) {
          throw new Error(result.error || 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์');
        }
        return result;
      } catch (err) {
        console.warn('API Call error via POST, trying fallback or mock:', err);
        return mockHandler(action, payload);
      }
    }

    // 3. Fallback โหมดสาธิต
    return mockHandler(action, payload);
  }

  /**
   * Mock Data สำหรับการทดสอบ
   */
  function mockHandler(action, payload) {
    return new Promise(resolve => {
      setTimeout(() => {
        if (action === 'getInitialData') {
          resolve({
            success: true,
            user: {
              code: 'D370002',
              name: 'นางธรรมิกา กรเพ็ชร์',
              nickname: 'หยก',
              position: 'ผู้อำนวยการ',
              group: 'ผู้อำนวยการ',
              role: 'Dean',
              email: 'amornrath.f@gmail.com',
              status: 'Active',
              authenticated: true
            },
            departments: [
              { code: 'FS001', name: 'คณะสัตวแพทยศาสตร์ (งบคณะ)', auditor: 'ณิชนันทน์ โอสถาพันธุ์', startDate: '01/10/2569', cycle: 'รายเดือน', status: 'ใช้งาน' },
              { code: 'FS002', name: 'สำนักงานบริหารและจัดการทรัพย์สิน', auditor: 'ณิชนันทน์ โอสถาพันธุ์', startDate: '01/10/2569', cycle: 'รายเดือน', status: 'ใช้งาน' },
              { code: 'FS003', name: 'คณะวิจิตรศิลป์', auditor: 'ทิพย์วรรณ ตุ่นวิชัย', startDate: '01/10/2569', cycle: 'รายเดือน', status: 'ใช้งาน' },
              { code: 'FS004', name: 'คณะเกษตรศาสตร์', auditor: 'ทิพย์วรรณ ตุ่นวิชัย', startDate: '01/10/2569', cycle: 'รายเดือน', status: 'ใช้งาน' },
              { code: 'FS014', name: 'งบรวมมหาวิทยาลัย (รายไตรมาส)', auditor: 'กุลรภัส แสงวณิช', startDate: '01/10/2569', cycle: 'รายไตรมาส', status: 'ใช้งาน' }
            ],
            auditors: [
              { code: 'D370002', name: 'นางธรรมิกา กรเพ็ชร์', nickname: 'หยก', position: 'ผู้อำนวยการ', group: 'ผู้อำนวยการ', role: 'Dean', email: '', status: 'Active' },
              { code: 'E370002', name: 'นางสาวณิชนันทน์ โอสถาพันธุ์', nickname: 'เพลิน', position: 'หัวหน้างานตรวจสอบ 1', group: 'งานตรวจสอบ 1', role: 'Leader', email: '', status: 'Active' },
              { code: 'E370005', name: 'นางสุมาลี เชเดฟ', nickname: 'น้อง', position: 'หัวหน้างานตรวจสอบ 2', group: 'งานตรวจสอบ 2', role: 'Leader', email: '', status: 'Active' },
              { code: 'E370009', name: 'นางสาววรรษิกา แก้วประดิษฐ์', nickname: 'แสตมป์', position: 'หัวหน้างานตรวจสอบ 3', group: 'งานตรวจสอบ 3', role: 'Leader', email: '', status: 'Active' },
              { code: 'E370003', name: 'นางสาวทิพย์วรรณ ตุ่นวิชัย', nickname: 'กิมจิ', position: 'นักตรวจสอบภายใน', group: 'งานตรวจสอบ 1', role: 'User', email: '', status: 'Active' },
              { code: 'E370012', name: 'นางสาวอมรรัตน์ เฟื่องวรธรรม', nickname: 'ปุ้ย', position: 'นักจัดการงานทั่วไป', group: 'งานบริหารและธุรการ', role: 'Admin', email: 'amornrath.f@gmail.com', status: 'Active' }
            ],
            configs: { KPI_DAYS: 20 }
          });
        } else if (action === 'getTrackingList') {
          resolve({
            success: true,
            data: [
              {
                trackingId: 'FR-2570-001',
                cycle: 'รายเดือน',
                period: 'เดือนตุลาคม 2569',
                fiscalYear: '2570',
                department: 'คณะสัตวแพทยศาสตร์ (งบคณะ)',
                auditor: 'ณิชนันทน์ โอสถาพันธุ์',
                auditorGroup: 'งานตรวจสอบ 1',
                dateReceivedFromDept: '15/11/2569',
                dateAuditorReceived: '18/11/2569',
                dateSubmittedToLeader: '28/11/2569',
                dateSubmittedToDean: '02/12/2569',
                dateSubmittedToPresident: '',
                dateDeanApproved: '05/12/2569',
                kpiDays: 14,
                kpiStandardDays: 20,
                kpiStatus: 'ทันกำหนด',
                dueDate: '08/12/2569',
                daysRemaining: null,
                status: 'ผู้อำนวยการเห็นชอบแล้ว',
                editCount: 0,
                editTotalDays: 0,
                hasPendingEdit: false
              }
            ],
            userRole: 'Dean',
            userGroup: 'ผู้อำนวยการ'
          });
        } else {
          resolve({ success: true, message: 'บันทึกข้อมูลเรียบร้อย' });
        }
      }, 300);
    });
  }

  function setScriptUrl(url) {
    scriptAppUrl = url;
    localStorage.setItem('FINANCE_REPORT_APP_URL', url);
  }

  function getScriptUrl() {
    return scriptAppUrl;
  }

  return {
    call,
    setScriptUrl,
    getScriptUrl,
    isGasEnvironment
  };
})();
