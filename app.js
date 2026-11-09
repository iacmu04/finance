/**
 * Finance Report Tracking System - Main Application Logic
 * ควบคุมการทำงานของหน้าเว็บ Dashboard และการประมวลผล
 */

// Application State
const state = {
  user: null,
  departments: [],
  auditors: [],
  configs: { KPI_DAYS: 20 },
  trackingList: [],
  filteredTracking: [],
  selectedTracking: null,
  activeTab: 'dashboard',
  filters: {
    fiscalYear: '2570',
    cycle: '',
    group: '',
    auditor: '',
    department: '',
    status: '',
    search: ''
  }
};

// Thai Month Names (ตามปีงบประมาณ เริ่ม ต.ค. - ก.ย.)
const FISCAL_MONTHS = [
  { key: '10', name: 'เดือนตุลาคม', quarter: 'Q1' },
  { key: '11', name: 'เดือนพฤศจิกายน', quarter: 'Q1' },
  { key: '12', name: 'เดือนธันวาคม', quarter: 'Q1' },
  { key: '01', name: 'เดือนมกราคม', quarter: 'Q2' },
  { key: '02', name: 'เดือนกุมภาพันธ์', quarter: 'Q2' },
  { key: '03', name: 'เดือนมีนาคม', quarter: 'Q2' },
  { key: '04', name: 'เดือนเมษายน', quarter: 'Q3' },
  { key: '05', name: 'เดือนพฤษภาคม', quarter: 'Q3' },
  { key: '06', name: 'เดือนมิถุนายน', quarter: 'Q3' },
  { key: '07', name: 'เดือนกรกฎาคม', quarter: 'Q4' },
  { key: '08', name: 'เดือนสิงหาคม', quarter: 'Q4' },
  { key: '09', name: 'เดือนกันยายน', quarter: 'Q4' }
];

const QUARTERS = [
  { key: 'Q1', name: 'ไตรมาส 1 (ต.ค. - ธ.ค.)' },
  { key: 'Q2', name: 'ไตรมาส 2 (ม.ค. - มี.ค.)' },
  { key: 'Q3', name: 'ไตรมาส 3 (เม.ย. - มิ.ย.)' },
  { key: 'Q4', name: 'ไตรมาส 4 (ก.ค. - ก.ย.)' }
];

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadInitialData();
  await refreshTrackingData();
});

/**
 * โหลดข้อมูลตั้งต้นจาก Backend
 */
async function loadInitialData() {
  showLoading(true);
  try {
    const res = await Api.call('getInitialData', { email: window.currentUserEmail });
    if (res.success) {
      state.user = res.user;
      state.departments = res.departments || [];
      state.auditors = res.auditors || [];
      state.configs = res.configs || { KPI_DAYS: 20 };

      renderUserProfile();
      populateDropdowns();
    }
  } catch (err) {
    showToast('โหลดข้อมูลเริ่มต้นไม่สำเร็จ: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

/**
 * ดึงรายการงานตรวจสอบและอัปเดตหน้าจอ
 */
async function refreshTrackingData() {
  showLoading(true);
  try {
    const res = await Api.call('getTrackingList', {
      filters: state.filters,
      email: state.user ? state.user.email : ''
    });

    if (res.success) {
      state.trackingList = res.data || [];
      applyFiltersAndSearch();
      renderCurrentTab();
    }
  } catch (err) {
    showToast('โหลดข้อมูลงานตรวจสอบไม่สำเร็จ: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

/**
 * จัดการสลับแท็บเมนู
 */
function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll('.nav-tab-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content-section').forEach(el => {
    el.style.display = el.id === `tab-${tabId}` ? 'block' : 'none';
  });

  renderCurrentTab();
}

/**
 * Render เนื้อหาของแท็บที่เลือก
 */
function renderCurrentTab() {
  if (state.activeTab === 'dashboard') {
    renderDashboard();
  } else if (state.activeTab === 'tracking') {
    renderTrackingTable();
  } else if (state.activeTab === 'departments') {
    renderDepartmentsTable();
  } else if (state.activeTab === 'settings') {
    renderSettingsView();
  }
}

/**
 * แสดงโปรไฟล์ผู้ใช้งานและ Role Badge
 */
function renderUserProfile() {
  const user = state.user;
  if (!user) return;

  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-role-badge');
  const groupEl = document.getElementById('user-group-name');

  if (nameEl) nameEl.textContent = user.name ? `${user.name} (${user.nickname || ''})` : user.email;
  if (groupEl) groupEl.textContent = user.group || 'สำนักงานตรวจสอบภายใน';
  if (roleEl) {
    roleEl.className = `role-tag ${user.role}`;
    roleEl.textContent = user.role;
  }

  // ซ่อน/แสดง เมนูตามสิทธิ์
  const isDean = user.role === 'Dean' || user.role === 'Admin';
  const isAdmin = user.role === 'Admin';

  const deanOnlyEls = document.querySelectorAll('.dean-only');
  deanOnlyEls.forEach(el => el.style.display = isDean ? '' : 'none');

  const adminOnlyEls = document.querySelectorAll('.admin-only');
  adminOnlyEls.forEach(el => el.style.display = isAdmin ? '' : 'none');
}

/**
 * Render Dashboard: Summary Cards, Lagging Reports, Group/Auditor Performance
 */
function renderDashboard() {
  const list = state.filteredTracking;
  const user = state.user || {};
  const isDean = user.role === 'Dean' || user.role === 'Admin';
  const kpiStandard = parseInt(state.configs.KPI_DAYS, 10) || 20;

  // 1. คำนวณตัวเลขสถิติภาพรวม
  let totalCount = list.length;
  let receivedCount = 0;
  let inProgressCount = 0;
  let submittedDeanCount = 0;
  let completedCount = 0;
  let onTimeCount = 0;
  let overdueCount = 0;
  let pendingEditCount = 0;
  let totalEditDays = 0;
  let totalEditRounds = 0;

  list.forEach(item => {
    if (item.dateAuditorReceived) receivedCount++;
    if (item.status === 'ผู้ตรวจสอบกำลังตรวจสอบ' || item.status === 'เสนอหัวหน้ากลุ่มงานแล้ว') inProgressCount++;
    if (item.dateSubmittedToDean) submittedDeanCount++;
    if (item.dateSubmittedToPresident) completedCount++;

    if (item.kpiStatus === 'ทันกำหนด') onTimeCount++;
    if (item.kpiStatus === 'เกินกำหนด') overdueCount++;

    if (item.hasPendingEdit) pendingEditCount++;
    if (item.editCount) totalEditRounds += item.editCount;
    if (item.editTotalDays) totalEditDays += item.editTotalDays;
  });

  const kpiPercent = submittedDeanCount > 0 ? Math.round((onTimeCount / submittedDeanCount) * 100) : 100;

  // Update Summary Elements
  setElText('stat-total', totalCount);
  setElText('stat-received', receivedCount);
  setElText('stat-in-progress', inProgressCount);
  setElText('stat-submitted-dean', submittedDeanCount);
  setElText('stat-completed', completedCount);
  setElText('stat-kpi-ontime', `${onTimeCount} (${kpiPercent}%)`);
  setElText('stat-kpi-overdue', overdueCount);

  // สถิติการแก้ไข (แสดงเฉพาะ Dean / Admin)
  if (isDean) {
    setElText('stat-pending-edit', pendingEditCount);
    setElText('stat-total-edit-rounds', totalEditRounds);
    setElText('stat-total-edit-days', `${totalEditDays} วัน`);
  }

  // 2. คำนวณการติดตาม "งบการเงินที่ไม่เป็นปัจจุบัน (Lagging Periods)"
  calculateAndRenderLaggingReports();

  // 3. Render ตารางสรุปรายบุคคล / กลุ่มงาน
  renderPerformanceSummary();
}

/**
 * คำนวณและแสดงผล: งบการเงินค้างส่งที่ไม่เป็นปัจจุบัน
 * เช่น: ปัจจุบันเดือน พฤศจิกายน 2569 แต่งบล่าสุดที่ได้รับถึงแค่ เมษายน 2569
 * -> จะมีรายงานค้างที่ไม่เป็นปัจจุบัน 6 งวด
 */
function calculateAndRenderLaggingReports() {
  const container = document.getElementById('lagging-reports-container');
  const countBadge = document.getElementById('lagging-total-count');
  if (!container) return;

  const depts = state.departments.filter(d => d.status === 'ใช้งาน');
  const currentFy = state.filters.fiscalYear || '2570';

  // วันที่ปัจจุบัน (หรือรอบปีงบประมาณที่เลือก)
  const today = new Date();
  const currentMonthNum = today.getMonth() + 1; // 1-12
  const currentYearBE = today.getFullYear() + 543;

  // หาว่างวดที่ "ควรจะส่งแล้วตามเกณฑ์ (ไม่เกินวันที่ 20 ของเดือนถัดไป)" คืออะไรบ้าง
  // ในปีงบประมาณ ต.ค. (M10), พ.ย. (M11), ธ.ค. (M12)...
  const laggingItems = [];

  depts.forEach(dept => {
    // หางานตรวจสอบของส่วนงานนี้ในปีงบประมาณที่เลือก
    const deptTracks = state.trackingList.filter(t => t.department === dept.name && t.fiscalYear.toString() === currentFy.toString());

    if (dept.cycle === 'รายไตรมาส') {
      // ตรวจสอบรายไตรมาส (FS014 งบรวม มช.)
      QUARTERS.forEach((q, idx) => {
        const found = deptTracks.find(t => t.period.includes(q.key) || t.period.includes(`ไตรมาส ${idx + 1}`));
        if (!found || !found.dateReceivedFromDept) {
          laggingItems.push({
            department: dept.name,
            auditor: dept.auditor,
            cycle: 'รายไตรมาส',
            period: q.name,
            expectedBy: `ภายใน 20 ของเดือนถัดไปหลังสิ้นไตรมาส`,
            status: found ? 'ยังไม่ได้รับงบจากส่วนงาน' : 'ยังไม่ได้สร้างรายการงวด'
          });
        }
      });
    } else {
      // ตรวจสอบรายเดือน 12 เดือน
      FISCAL_MONTHS.forEach(m => {
        const found = deptTracks.find(t => t.period.includes(m.name));
        // ถ้างวดนี้ยังไม่ได้รับงบ หรือยังไม่มีรายการ
        if (!found || !found.dateReceivedFromDept) {
          laggingItems.push({
            department: dept.name,
            auditor: dept.auditor,
            cycle: 'รายเดือน',
            period: m.name,
            expectedBy: `วันที่ 20 ของเดือนถัดไป`,
            status: found ? 'ยังไม่ได้รับงบจากส่วนงาน' : 'ยังไม่ได้สร้างรายการงวด'
          });
        }
      });
    }
  });

  if (countBadge) countBadge.textContent = laggingItems.length;

  if (laggingItems.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 20px;">
        <span style="color: #10b981; font-size: 1.1rem; font-weight: 600;">✓ เป็นปัจจุบันครบถ้วน ไม่มีงบการเงินค้างส่ง</span>
      </div>`;
    return;
  }

  // สร้างตารางสรุปงบค้างส่ง
  let html = `
    <div class="table-responsive" style="max-height: 280px;">
      <table class="custom-table">
        <thead>
          <tr>
            <th>ส่วนงาน</th>
            <th>รอบ</th>
            <th>งวดที่ค้าง</th>
            <th>ผู้รับผิดชอบ</th>
            <th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
  `;

  laggingItems.slice(0, 15).forEach(item => {
    html += `
      <tr>
        <td style="font-weight: 500;">${escapeHtml(item.department)}</td>
        <td><span class="badge ${item.cycle === 'รายไตรมาส' ? 'badge-purple' : 'badge-info'}">${item.cycle}</span></td>
        <td style="color: #b91c1c; font-weight: 600;">${escapeHtml(item.period)}</td>
        <td>${escapeHtml(item.auditor)}</td>
        <td><span class="badge badge-warning">${escapeHtml(item.status)}</span></td>
      </tr>
    `;
  });

  if (laggingItems.length > 15) {
    html += `<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">และอีก ${laggingItems.length - 15} รายการ...</td></tr>`;
  }

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

/**
 * Render รายละเอียดประสิทธิภาพรายบุคคล / รายกลุ่มงาน (สำหรับ ผอ. และ หัวหน้ากลุ่มงาน)
 */
function renderPerformanceSummary() {
  const container = document.getElementById('auditor-performance-container');
  if (!container) return;

  const isDean = state.user && (state.user.role === 'Dean' || state.user.role === 'Admin');

  // จัดกลุ่มตามผู้ตรวจสอบ
  const summaryMap = {};

  state.filteredTracking.forEach(t => {
    const name = t.auditor || 'ไม่ระบุผู้ตรวจ';
    if (!summaryMap[name]) {
      summaryMap[name] = {
        name: name,
        group: t.auditorGroup || '-',
        total: 0,
        received: 0,
        submittedDean: 0,
        onTime: 0,
        overdue: 0,
        totalDays: 0,
        editCount: 0,
        editDays: 0
      };
    }

    summaryMap[name].total++;
    if (t.dateAuditorReceived) summaryMap[name].received++;
    if (t.dateSubmittedToDean) {
      summaryMap[name].submittedDean++;
      if (t.kpiStatus === 'ทันกำหนด') summaryMap[name].onTime++;
      if (t.kpiStatus === 'เกินกำหนด') summaryMap[name].overdue++;
      if (t.kpiDays) summaryMap[name].totalDays += t.kpiDays;
    }
    if (t.editCount) summaryMap[name].editCount += t.editCount;
    if (t.editTotalDays) summaryMap[name].editDays += t.editTotalDays;
  });

  const rows = Object.values(summaryMap);
  if (rows.length === 0) {
    container.innerHTML = '<div class="empty-state">ไม่มีข้อมูลตามเงื่อนไขที่เลือก</div>';
    return;
  }

  let html = `
    <div class="table-responsive">
      <table class="custom-table">
        <thead>
          <tr>
            <th>ผู้ตรวจสอบ</th>
            <th>กลุ่มงาน</th>
            <th style="text-align: center;">งานมอบหมาย</th>
            <th style="text-align: center;">เสนอ ผอ. แล้ว</th>
            <th style="text-align: center;">ทันตาม KPI</th>
            <th style="text-align: center;">เกินกำหนด</th>
            <th style="text-align: center;">เวลาเฉลี่ย (วัน)</th>
            ${isDean ? '<th style="text-align: center; color: #6d28d9;">ส่งกลับแก้ไข (ครั้ง)</th><th style="text-align: center; color: #6d28d9;">วันแก้ไขรวม</th>' : ''}
          </tr>
        </thead>
        <tbody>
  `;

  rows.forEach(r => {
    const avgDays = r.submittedDean > 0 ? (r.totalDays / r.submittedDean).toFixed(1) : '-';
    const kpiRate = r.submittedDean > 0 ? Math.round((r.onTime / r.submittedDean) * 100) : '-';

    html += `
      <tr>
        <td style="font-weight: 600;">${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.group)}</td>
        <td style="text-align: center;">${r.total}</td>
        <td style="text-align: center;">${r.submittedDean}</td>
        <td style="text-align: center;"><span class="badge badge-success">${r.onTime} (${kpiRate}%)</span></td>
        <td style="text-align: center;">${r.overdue > 0 ? `<span class="badge badge-danger">${r.overdue}</span>` : '0'}</td>
        <td style="text-align: center; font-weight: 500;">${avgDays}</td>
        ${isDean ? `<td style="text-align: center; font-weight: 600; color: #6d28d9;">${r.editCount}</td><td style="text-align: center;">${r.editDays} วัน</td>` : ''}
      </tr>
    `;
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

/**
 * Render ตารางติดตามงานตรวจสอบ (Tracking Table)
 */
function renderTrackingTable() {
  const container = document.getElementById('tracking-table-container');
  if (!container) return;

  const list = state.filteredTracking;
  const user = state.user || {};
  const isDean = user.role === 'Dean' || user.role === 'Admin';

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <h4>ไม่พบรายการงานตรวจสอบ</h4>
        <p>คลิกปุ่ม "+ เพิ่มรายการตรวจสอบ" เพื่อเริ่มต้นสร้างงวดงาน</p>
      </div>`;
    return;
  }

  let html = `
    <table class="custom-table">
      <thead>
        <tr>
          <th>รหัสงาน</th>
          <th>ส่วนงาน</th>
          <th>งวดรายงาน</th>
          <th>ผู้ตรวจสอบ</th>
          <th>วันที่รับงบ</th>
          <th>เสนอ ผอ.</th>
          <th>KPI 20 วัน</th>
          <th>สถานะ</th>
          ${isDean ? '<th>แก้ไข</th>' : ''}
          <th style="text-align: right;">การจัดการ</th>
        </tr>
      </thead>
      <tbody>
  `;

  list.forEach(item => {
    let kpiBadgeClass = 'badge-secondary';
    if (item.kpiStatus === 'ทันกำหนด') kpiBadgeClass = 'badge-success';
    else if (item.kpiStatus === 'เกินกำหนด') kpiBadgeClass = 'badge-danger';
    else if (item.kpiStatus === 'ใกล้ครบกำหนด') kpiBadgeClass = 'badge-warning';
    else if (item.kpiStatus === 'อยู่ระหว่างตรวจสอบ') kpiBadgeClass = 'badge-info';

    let statusBadgeClass = 'badge-secondary';
    if (item.status === 'เสนออธิการบดีแล้ว') statusBadgeClass = 'badge-success';
    else if (item.status === 'ผู้อำนวยการเห็นชอบแล้ว') statusBadgeClass = 'badge-purple';
    else if (item.status === 'ผู้อำนวยการส่งกลับแก้ไข') statusBadgeClass = 'badge-danger';
    else if (item.status === 'เสนอผู้อำนวยการแล้ว') statusBadgeClass = 'badge-info';
    else if (item.status === 'ผู้ตรวจสอบกำลังตรวจสอบ') statusBadgeClass = 'badge-warning';

    html += `
      <tr>
        <td style="font-weight: 600; font-family: monospace;">${escapeHtml(item.trackingId)}</td>
        <td style="font-weight: 500;">
          ${escapeHtml(item.department)}
          <span class="badge ${item.cycle === 'รายไตรมาส' ? 'badge-purple' : 'badge-secondary'}" style="font-size: 0.7rem; margin-left: 4px;">${item.cycle}</span>
        </td>
        <td>${escapeHtml(item.period)}</td>
        <td>${escapeHtml(item.auditor)}</td>
        <td>${item.dateAuditorReceived || '<span style="color:#94a3b8;">-</span>'}</td>
        <td>${item.dateSubmittedToDean || '<span style="color:#94a3b8;">-</span>'}</td>
        <td>
          <span class="badge ${kpiBadgeClass}">
            ${item.kpiStatus} ${item.kpiDays !== null ? `(${item.kpiDays} วัน)` : ''}
          </span>
        </td>
        <td><span class="badge ${statusBadgeClass}">${item.status}</span></td>
        ${isDean ? `<td>${item.editCount > 0 ? `<span class="badge badge-warning">${item.editCount} ครั้ง (${item.editTotalDays} วัน)</span>` : '<span style="color:#94a3b8;">0</span>'}</td>` : ''}
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm" onclick="openTrackingModal('${item.trackingId}')" title="ดูรายละเอียดและบันทึกข้อมูล">
              ✏️ จัดการ
            </button>
            <button class="btn btn-secondary btn-sm" onclick="openEditModal('${item.trackingId}')" title="ประวัติการส่งกลับแก้ไข">
              🔄 แก้ไข (${item.editCount || 0})
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

/**
 * เปิด Modal กรอก/แก้ไขข้อมูล Tracking
 */
function openTrackingModal(trackingId) {
  const item = state.trackingList.find(t => t.trackingId === trackingId) || null;
  state.selectedTracking = item;

  const modal = document.getElementById('modal-tracking');
  const titleEl = document.getElementById('modal-tracking-title');
  const form = document.getElementById('tracking-form');
  if (!modal || !form) return;

  form.reset();

  const user = state.user || {};
  const isDean = user.role === 'Dean' || user.role === 'Admin';

  if (item) {
    titleEl.textContent = `จัดการงานตรวจสอบ: ${item.trackingId} (${item.department})`;
    document.getElementById('input-track-id').value = item.trackingId;
    document.getElementById('input-track-fy').value = item.fiscalYear;
    document.getElementById('input-track-cycle').value = item.cycle;
    document.getElementById('input-track-dept').value = item.department;
    document.getElementById('input-track-period').value = item.period;
    document.getElementById('input-track-auditor').value = item.auditor;

    document.getElementById('input-date-dept').value = formatDateForInput(item.dateReceivedFromDept);
    document.getElementById('input-date-auditor').value = formatDateForInput(item.dateAuditorReceived);
    document.getElementById('input-date-leader').value = formatDateForInput(item.dateSubmittedToLeader);
    document.getElementById('input-date-dean').value = formatDateForInput(item.dateSubmittedToDean);
    document.getElementById('input-date-approved').value = formatDateForInput(item.dateDeanApproved);
    document.getElementById('input-date-president').value = formatDateForInput(item.dateSubmittedToPresident);

    // แสดงปุ่ม ผอ. เห็นชอบ และ ปุ่มเสนออธิการบดี
    const deanActions = document.getElementById('dean-workflow-actions');
    if (deanActions) {
      deanActions.style.display = isDean ? 'flex' : 'none';
      const btnApprove = document.getElementById('btn-dean-approve');
      const btnComplete = document.getElementById('btn-dean-complete');
      const btnCancel = document.getElementById('btn-dean-cancel');

      if (btnApprove) btnApprove.disabled = !!item.dateDeanApproved;
      if (btnComplete) btnComplete.disabled = !item.dateDeanApproved || !!item.dateSubmittedToPresident || item.hasPendingEdit;
      if (btnCancel) btnCancel.style.display = item.dateSubmittedToPresident ? 'inline-flex' : 'none';
    }
  } else {
    titleEl.textContent = 'เพิ่มรายการตรวจสอบงบการเงินใหม่';
    document.getElementById('input-track-id').value = '';
    document.getElementById('input-track-fy').value = state.filters.fiscalYear || '2570';
    document.getElementById('input-track-cycle').value = 'รายเดือน';

    const deanActions = document.getElementById('dean-workflow-actions');
    if (deanActions) deanActions.style.display = 'none';
  }

  modal.classList.add('active');
}

/**
 * บันทึกฟอร์มงานตรวจสอบ (Save Tracking)
 */
async function handleTrackingFormSubmit(e) {
  e.preventDefault();
  showLoading(true);

  const payload = {
    trackingId: document.getElementById('input-track-id').value,
    fiscalYear: document.getElementById('input-track-fy').value,
    cycle: document.getElementById('input-track-cycle').value,
    department: document.getElementById('input-track-dept').value,
    period: document.getElementById('input-track-period').value,
    auditor: document.getElementById('input-track-auditor').value,
    dateReceivedFromDept: document.getElementById('input-date-dept').value,
    dateAuditorReceived: document.getElementById('input-date-auditor').value,
    dateSubmittedToLeader: document.getElementById('input-date-leader').value,
    dateSubmittedToDean: document.getElementById('input-date-dean').value,
    dateDeanApproved: document.getElementById('input-date-approved').value,
    dateSubmittedToPresident: document.getElementById('input-date-president').value
  };

  try {
    const res = await Api.call('saveTracking', {
      trackingData: payload,
      email: state.user ? state.user.email : ''
    });

    if (res.success) {
      showToast('บันทึกข้อมูลงานตรวจสอบเรียบร้อย', 'success');
      closeModal('modal-tracking');
      await refreshTrackingData();
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการบันทึก: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

/**
 * การดำเนินการของ ผอ. (Approve, Complete, Cancel)
 */
async function onDeanApprove() {
  if (!state.selectedTracking) return;
  if (!confirm('ยืนยันการให้ความเห็นชอบรายงานฉบับสมบูรณ์?')) return;

  showLoading(true);
  try {
    const res = await Api.call('approveByDean', {
      trackingId: state.selectedTracking.trackingId,
      approveDate: new Date().toISOString(),
      email: state.user.email
    });

    if (res.success) {
      showToast('บันทึกความเห็นชอบของผู้อำนวยการเรียบร้อย', 'success');
      closeModal('modal-tracking');
      await refreshTrackingData();
    }
  } catch (err) {
    showToast('ดำเนินการไม่สำเร็จ: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function onDeanComplete() {
  if (!state.selectedTracking) return;
  if (!confirm('ยืนยันการเสร็จสิ้นและเสนอรายงานต่ออธิการบดี? ระบบจะบันทึกวันที่ปัจจุบันลงในระบบ')) return;

  showLoading(true);
  try {
    const res = await Api.call('completeAndSubmit', {
      trackingId: state.selectedTracking.trackingId,
      email: state.user.email
    });

    if (res.success) {
      showToast('เสร็จสิ้นและเสนอรายงานต่ออธิการบดีเรียบร้อยแล้ว', 'success');
      closeModal('modal-tracking');
      await refreshTrackingData();
    }
  } catch (err) {
    showToast('ดำเนินการไม่สำเร็จ: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function onDeanCancelCompletion() {
  if (!state.selectedTracking) return;
  const reason = prompt('กรุณาระบุเหตุผลในการยกเลิกการเสนออธิการบดี:');
  if (!reason || reason.trim() === '') return;

  showLoading(true);
  try {
    const res = await Api.call('cancelCompletion', {
      trackingId: state.selectedTracking.trackingId,
      reason: reason.trim(),
      email: state.user.email
    });

    if (res.success) {
      showToast('ยกเลิกสถานะเสนออธิการบดีเรียบร้อยแล้ว', 'info');
      closeModal('modal-tracking');
      await refreshTrackingData();
    }
  } catch (err) {
    showToast('ยกเลิกไม่สำเร็จ: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

/**
 * เปิด Modal ประวัติการส่งกลับแก้ไข (Edit Modal)
 */
function openEditModal(trackingId) {
  const item = state.trackingList.find(t => t.trackingId === trackingId);
  if (!item) return;

  state.selectedTracking = item;
  const modal = document.getElementById('modal-edit');
  const title = document.getElementById('modal-edit-title');
  const container = document.getElementById('edit-rounds-container');

  if (title) title.textContent = `ประวัติการส่งกลับแก้ไข: ${item.trackingId} (${item.department})`;

  // Render ฟอร์มรอบใหม่
  const newRoundForm = document.getElementById('new-edit-round-form');
  if (newRoundForm) {
    newRoundForm.reset();
    document.getElementById('input-edit-tracking-id').value = item.trackingId;
    document.getElementById('input-edit-date-return').value = new Date().toISOString().split('T')[0];
  }

  // Render ตารางรอบการแก้ไข
  renderEditHistoryList(item);
  modal.classList.add('active');
}

/**
 * บันทึกรอบการแก้ไขใหม่
 */
async function handleNewEditRoundSubmit(e) {
  e.preventDefault();
  showLoading(true);

  const payload = {
    trackingId: document.getElementById('input-edit-tracking-id').value,
    dateReturned: document.getElementById('input-edit-date-return').value,
    dateResubmitted: document.getElementById('input-edit-date-resubmit').value,
    note: document.getElementById('input-edit-note').value
  };

  try {
    const res = await Api.call('saveEditRound', {
      editData: payload,
      email: state.user ? state.user.email : ''
    });

    if (res.success) {
      showToast('บันทึกรอบการแก้ไขเรียบร้อย', 'success');
      closeModal('modal-edit');
      await refreshTrackingData();
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

function renderEditHistoryList(item) {
  const container = document.getElementById('edit-rounds-container');
  if (!container) return;

  if (!item.editCount || item.editCount === 0) {
    container.innerHTML = '<div class="empty-state" style="padding: 20px;">ไม่มีประวัติการส่งกลับแก้ไขสำหรับรายการนี้</div>';
    return;
  }

  let html = `
    <div class="table-responsive">
      <table class="custom-table">
        <thead>
          <tr>
            <th>รอบที่</th>
            <th>วันที่ ผอ. ส่งกลับ</th>
            <th>วันที่ส่งคืน ผอ.</th>
            <th>จำนวนวันแก้ไข</th>
            <th>หมายเหตุ/ประเด็น</th>
            <th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
  `;

  // ถ้ามีรอบย่อยใน item ให้แสดง
  html += `
    <tr>
      <td>ครั้งที่ 1</td>
      <td>-</td>
      <td>-</td>
      <td>${item.editTotalDays || 0} วัน</td>
      <td>-</td>
      <td><span class="badge ${item.hasPendingEdit ? 'badge-danger' : 'badge-success'}">${item.hasPendingEdit ? 'รอแก้ไข' : 'ส่งคืนแล้ว'}</span></td>
    </tr>
  `;

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

/**
 * จัดการส่วนงาน & เปลี่ยนตัวผู้รับผิดชอบ (Department Management)
 */
function renderDepartmentsTable() {
  const container = document.getElementById('departments-table-container');
  if (!container) return;

  const list = state.departments;
  const user = state.user || {};
  const canEdit = user.role === 'Admin' || user.role === 'Leader';

  let html = `
    <table class="custom-table">
      <thead>
        <tr>
          <th>รหัส</th>
          <th>ชื่อส่วนงาน</th>
          <th>รอบการรายงาน</th>
          <th>ผู้รับผิดชอบปัจจุบัน</th>
          <th>วันที่เริ่มรับผิดชอบ</th>
          <th>สถานะ</th>
          ${canEdit ? '<th style="text-align: right;">การจัดการ</th>' : ''}
        </tr>
      </thead>
      <tbody>
  `;

  list.forEach(dept => {
    html += `
      <tr>
        <td style="font-family: monospace; font-weight: 600;">${dept.code}</td>
        <td style="font-weight: 500;">${escapeHtml(dept.name)}</td>
        <td><span class="badge ${dept.cycle === 'รายไตรมาส' ? 'badge-purple' : 'badge-info'}">${dept.cycle}</span></td>
        <td style="font-weight: 500; color: #4338ca;">${escapeHtml(dept.auditor)}</td>
        <td>${dept.startDate}</td>
        <td><span class="badge ${dept.status === 'ใช้งาน' ? 'badge-success' : 'badge-danger'}">${dept.status}</span></td>
        ${canEdit ? `
          <td style="text-align: right;">
            ${dept.status === 'ใช้งาน' ? `
              <button class="btn btn-secondary btn-sm" onclick="openChangeAuditorModal('${dept.code}', '${escapeHtml(dept.name)}', '${escapeHtml(dept.auditor)}')">
                🔄 เปลี่ยนผู้รับผิดชอบ
              </button>` : ''}
          </td>` : ''}
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function openChangeAuditorModal(deptCode, deptName, currentAuditor) {
  document.getElementById('change-dept-code').value = deptCode;
  document.getElementById('change-dept-name-display').textContent = `${deptCode} - ${deptName}`;
  document.getElementById('change-dept-old-auditor').textContent = currentAuditor;
  document.getElementById('change-dept-start-date').value = new Date().toISOString().split('T')[0];

  document.getElementById('modal-change-auditor').classList.add('active');
}

async function handleChangeAuditorSubmit(e) {
  e.preventDefault();
  showLoading(true);

  const deptCode = document.getElementById('change-dept-code').value;
  const newAuditor = document.getElementById('change-dept-new-auditor').value;
  const startDate = document.getElementById('change-dept-start-date').value;

  try {
    const res = await Api.call('changeAuditor', {
      deptCode: deptCode,
      newAuditor: newAuditor,
      startDate: startDate,
      email: state.user ? state.user.email : ''
    });

    if (res.success) {
      showToast('เปลี่ยนตัวผู้รับผิดชอบเรียบร้อยแล้ว (อัปเดตสถานะเดิมเป็นยกเลิก)', 'success');
      closeModal('modal-change-auditor');
      await loadInitialData();
      renderDepartmentsTable();
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

/**
 * การตั้งค่าระบบ และ SystemLog View (Settings)
 */
function renderSettingsView() {
  const kpiInput = document.getElementById('config-kpi-days');
  if (kpiInput) {
    kpiInput.value = state.configs.KPI_DAYS || 20;
  }

  loadSystemLogs();
}

async function handleConfigSave(e) {
  e.preventDefault();
  showLoading(true);

  const kpiVal = document.getElementById('config-kpi-days').value;

  try {
    const res = await Api.call('updateConfig', {
      key: 'KPI_DAYS',
      value: kpiVal,
      email: state.user ? state.user.email : ''
    });

    if (res.success) {
      state.configs.KPI_DAYS = parseInt(kpiVal, 10);
      showToast('บันทึกการตั้งค่าเกณฑ์ KPI เรียบร้อย', 'success');
      await refreshTrackingData();
    }
  } catch (err) {
    showToast('ไม่สามารถบันทึกได้: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function loadSystemLogs() {
  const container = document.getElementById('system-logs-container');
  if (!container) return;

  try {
    const res = await Api.call('getSystemLogs', { limit: 30, email: state.user.email });
    if (res.success && res.logs) {
      let html = `
        <div class="table-responsive" style="max-height: 380px;">
          <table class="custom-table" style="font-size: 0.8rem;">
            <thead>
              <tr>
                <th>วันเวลา</th>
                <th>ผู้ใช้</th>
                <th>การกระทำ</th>
                <th>รหัสงาน</th>
                <th>เหตุผล/รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
      `;

      res.logs.forEach(l => {
        html += `
          <tr>
            <td>${l.timestamp}</td>
            <td>${escapeHtml(l.user)}</td>
            <td><span class="badge badge-info">${escapeHtml(l.action)}</span></td>
            <td style="font-family: monospace;">${escapeHtml(l.trackingId || '-')}</td>
            <td>${escapeHtml(l.reason || '-')}</td>
          </tr>
        `;
      });

      html += '</tbody></table></div>';
      container.innerHTML = html;
    }
  } catch (err) {
    container.innerHTML = `<div style="color: red; padding: 10px;">โหลด Log ไม่สำเร็จ: ${err.message}</div>`;
  }
}

/**
 * Filter & Search Helper
 */
function applyFiltersAndSearch() {
  const f = state.filters;
  const q = (f.search || '').trim().toLowerCase();

  state.filteredTracking = state.trackingList.filter(item => {
    if (f.fiscalYear && item.fiscalYear.toString() !== f.fiscalYear.toString()) return false;
    if (f.cycle && item.cycle !== f.cycle) return false;
    if (f.group && item.auditorGroup !== f.group) return false;
    if (f.auditor && item.auditor !== f.auditor) return false;
    if (f.department && item.department !== f.department) return false;
    if (f.status && item.status !== f.status) return false;

    if (q) {
      const match = (item.trackingId && item.trackingId.toLowerCase().includes(q)) ||
                    (item.department && item.department.toLowerCase().includes(q)) ||
                    (item.auditor && item.auditor.toLowerCase().includes(q)) ||
                    (item.period && item.period.toLowerCase().includes(q));
      if (!match) return false;
    }

    return true;
  });
}

/**
 * สลับสิทธิ์จำลอง (Role Switcher สำหรับ Preview/ทดสอบระบบ)
 */
function onRoleSwitchChange(role) {
  if (!state.user) return;
  state.user.role = role;
  showToast(`จำลองการใช้งานในบทบาท: ${role}`, 'info');
  renderUserProfile();
  applyFiltersAndSearch();
  renderCurrentTab();
}

/**
 * Populate Dropdowns (Department, Auditors, Periods)
 */
function populateDropdowns() {
  // Department dropdown for modal
  const deptSelect = document.getElementById('input-track-dept');
  if (deptSelect) {
    deptSelect.innerHTML = '<option value="">-- เลือกส่วนงาน --</option>';
    state.departments.filter(d => d.status === 'ใช้งาน').forEach(d => {
      deptSelect.innerHTML += `<option value="${escapeHtml(d.name)}" data-cycle="${d.cycle}" data-auditor="${escapeHtml(d.auditor)}">${escapeHtml(d.name)}</option>`;
    });

    deptSelect.addEventListener('change', () => {
      const opt = deptSelect.selectedOptions[0];
      if (opt && opt.value) {
        const cycle = opt.dataset.cycle || 'รายเดือน';
        const auditor = opt.dataset.auditor || '';
        document.getElementById('input-track-cycle').value = cycle;
        document.getElementById('input-track-auditor').value = auditor;
        updatePeriodOptions(cycle);
      }
    });
  }

  // Auditor dropdowns
  const audSelect = document.getElementById('change-dept-new-auditor');
  const filterAud = document.getElementById('filter-auditor');
  if (audSelect) {
    audSelect.innerHTML = '<option value="">-- เลือกผู้ตรวจสอบ --</option>';
    state.auditors.forEach(a => {
      audSelect.innerHTML += `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)} (${escapeHtml(a.nickname || a.position)})</option>`;
    });
  }
  if (filterAud) {
    filterAud.innerHTML = '<option value="">-- ผู้ตรวจสอบทั้งหมด --</option>';
    state.auditors.forEach(a => {
      filterAud.innerHTML += `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`;
    });
  }

  // Filter Departments
  const filterDept = document.getElementById('filter-department');
  if (filterDept) {
    filterDept.innerHTML = '<option value="">-- ส่วนงานทั้งหมด --</option>';
    state.departments.filter(d => d.status === 'ใช้งาน').forEach(d => {
      filterDept.innerHTML += `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`;
    });
  }

  updatePeriodOptions('รายเดือน');
}

function updatePeriodOptions(cycle) {
  const periodSelect = document.getElementById('input-track-period');
  if (!periodSelect) return;

  periodSelect.innerHTML = '';
  if (cycle === 'รายไตรมาส') {
    QUARTERS.forEach(q => {
      periodSelect.innerHTML += `<option value="${q.name}">${q.name}</option>`;
    });
  } else {
    FISCAL_MONTHS.forEach(m => {
      periodSelect.innerHTML += `<option value="${m.name} 2569">${m.name} 2569</option>`;
    });
  }
}

/**
 * Event Listeners Binding
 */
function setupEventListeners() {
  // Nav tabs
  document.querySelectorAll('.nav-tab-item').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.tab));
  });

  // Filter inputs
  const bindFilter = (id, key) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        state.filters[key] = el.value;
        applyFiltersAndSearch();
        renderCurrentTab();
      });
    }
  };

  bindFilter('filter-fy', 'fiscalYear');
  bindFilter('filter-cycle', 'cycle');
  bindFilter('filter-group', 'group');
  bindFilter('filter-auditor', 'auditor');
  bindFilter('filter-department', 'department');
  bindFilter('filter-status', 'status');

  const searchInput = document.getElementById('filter-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      state.filters.search = searchInput.value;
      applyFiltersAndSearch();
      renderCurrentTab();
    });
  }

  // Role Switcher
  const roleSelect = document.getElementById('role-switcher-select');
  if (roleSelect) {
    roleSelect.addEventListener('change', (e) => onRoleSwitchChange(e.target.value));
  }

  // Forms
  const trackForm = document.getElementById('tracking-form');
  if (trackForm) trackForm.addEventListener('submit', handleTrackingFormSubmit);

  const editForm = document.getElementById('new-edit-round-form');
  if (editForm) editForm.addEventListener('submit', handleNewEditRoundSubmit);

  const changeAudForm = document.getElementById('change-auditor-form');
  if (changeAudForm) changeAudForm.addEventListener('submit', handleChangeAuditorSubmit);

  const configForm = document.getElementById('config-form');
  if (configForm) configForm.addEventListener('submit', handleConfigSave);

  // Close Modals on click overlay
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('active');
    });
  });
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('active');
}

/**
 * UI Utilities
 */
function showLoading(show) {
  const el = document.getElementById('global-loading');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function setElText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateForInput(dateStr) {
  if (!dateStr) return '';
  // Convert dd/mm/yyyy to yyyy-mm-dd
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    let yr = parseInt(parts[2], 10);
    if (yr > 2400) yr -= 543;
    return `${yr}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return dateStr;
}
