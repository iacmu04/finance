/**
 * Finance Report Tracking System - Modern Executive Controller
 * รองรับ Matrix ส่วนงาน x 12 เดือน, KPI คำนวณตามงวด, Drilldown และ Login จริง
 */

const state = {
  user: null,
  departments: [],
  auditors: [],
  configs: { KPI_DAYS: 20 },
  trackingList: [],
  filters: {
    fiscalYear: '2570',
    period: '', // เช่น 'เดือนเมษายน'
    group: '',
    auditor: '',
    department: '',
    search: ''
  },
  selectedDrilldown: null
};

// 12 เดือนในรอบปีงบประมาณไทย (เริ่ม ต.ค. - ก.ย.)
const FISCAL_MONTHS = [
  { key: '10', label: 'ต.ค.', fullName: 'เดือนตุลาคม', quarter: 'Q1' },
  { key: '11', label: 'พ.ย.', fullName: 'เดือนพฤศจิกายน', quarter: 'Q1' },
  { key: '12', label: 'ธ.ค.', fullName: 'เดือนธันวาคม', quarter: 'Q1' },
  { key: '01', label: 'ม.ค.', fullName: 'เดือนมกราคม', quarter: 'Q2', qReport: 'ไตรมาส 1' },
  { key: '02', label: 'ก.พ.', fullName: 'เดือนกุมภาพันธ์', quarter: 'Q2' },
  { key: '03', label: 'มี.ค.', fullName: 'เดือนมีนาคม', quarter: 'Q2' },
  { key: '04', label: 'เม.ย.', fullName: 'เดือนเมษายน', quarter: 'Q3', qReport: 'ไตรมาส 2' },
  { key: '05', label: 'พ.ค.', fullName: 'เดือนพฤษภาคม', quarter: 'Q3' },
  { key: '06', label: 'มิ.ย.', fullName: 'เดือนมิถุนายน', quarter: 'Q3' },
  { key: '07', label: 'ก.ค.', fullName: 'เดือนกรกฎาคม', quarter: 'Q4', qReport: 'ไตรมาส 3' },
  { key: '08', label: 'ส.ค.', fullName: 'เดือนสิงหาคม', quarter: 'Q4' },
  { key: '09', label: 'ก.ย.', fullName: 'เดือนกันยายน', quarter: 'Q4', qReport: 'ไตรมาส 4' }
];

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  checkSession();
  await loadRealtimeData();
});

/**
 * 1. ตรวจสอบการ Login และสิทธิ์จริง
 */
function checkSession() {
  const sessionStr = sessionStorage.getItem('FINANCE_USER_SESSION');
  if (sessionStr) {
    try {
      state.user = JSON.parse(sessionStr);
      renderUserProfile();
    } catch (e) {
      sessionStorage.removeItem('FINANCE_USER_SESSION');
    }
  } else {
    // แสดง Modal ให้กรอกอีเมล Gmail เพื่อยืนยันตัวตน
    openLoginModal();
  }
}

function openLoginModal() {
  const modal = document.getElementById('modal-login');
  if (modal) modal.classList.add('active');
}

function closeLoginModal() {
  const modal = document.getElementById('modal-login');
  if (modal) modal.classList.remove('active');
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const inputEmail = (document.getElementById('login-email-input').value || '').trim().toLowerCase();
  if (!inputEmail) return;

  const errorEl = document.getElementById('login-error-msg');
  if (errorEl) errorEl.style.display = 'none';

  // ค้นหาในชีท "ผู้ตรวจสอบ" (คอลัมน์ G คือ e-mail)
  const matched = state.auditors.find(a => a.email && a.email.toLowerCase() === inputEmail);

  if (!matched) {
    if (errorEl) {
      errorEl.textContent = `อีเมล ${inputEmail} ยังไม่ได้รับสิทธิ์เข้าใช้งานระบบ กรุณาติดต่อ Admin เพื่อลงทะเบียนในชีท 'ผู้ตรวจสอบ'`;
      errorEl.style.display = 'block';
    }
    return;
  }

  // กำหนดสิทธิ์ตามคอลัมน์ F (Role) โดยตรง ไม่ให้เลือกเอง
  state.user = {
    code: matched.code,
    name: matched.name,
    nickname: matched.nickname,
    position: matched.position,
    group: matched.group,
    role: matched.role || 'User',
    email: matched.email
  };

  sessionStorage.setItem('FINANCE_USER_SESSION', JSON.stringify(state.user));
  closeLoginModal();
  renderUserProfile();
  applyFiltersAndRender();
  showToast(`ยินดีต้อนรับ ${state.user.name} (สิทธิ์: ${state.user.role})`, 'success');
}

function logout() {
  sessionStorage.removeItem('FINANCE_USER_SESSION');
  state.user = null;
  location.reload();
}

function renderUserProfile() {
  const u = state.user;
  const nameEl = document.getElementById('user-name-display');
  const roleEl = document.getElementById('user-role-pill');
  const avatarEl = document.getElementById('user-avatar-char');

  if (u) {
    if (nameEl) nameEl.textContent = `${u.name} (${u.nickname || u.group || ''})`;
    if (roleEl) {
      roleEl.className = `role-pill ${u.role}`;
      roleEl.textContent = u.role;
    }
    if (avatarEl) avatarEl.textContent = (u.nickname || u.name || 'U').charAt(0);

    // ปรับมุมมองตามสิทธิ์
    // Leader & User: กรองให้เห็นเฉพาะกลุ่มงานตัวเอง
    if (u.role === 'User' || u.role === 'Leader') {
      const groupFilter = document.getElementById('filter-group');
      if (groupFilter && u.group) {
        state.filters.group = u.group;
        groupFilter.value = u.group;
        groupFilter.disabled = true; // ล็อกกลุ่มงานตนเอง
      }
    }
  } else {
    if (nameEl) nameEl.textContent = 'ยังไม่ได้เข้าสู่ระบบ';
    if (roleEl) {
      roleEl.className = 'role-pill Guest';
      roleEl.textContent = 'Guest';
    }
  }
}

/**
 * 2. โหลดข้อมูล Real-time จาก Google Sheets
 */
async function loadRealtimeData() {
  showLoading(true);
  try {
    const res = await Api.fetchAllRealtimeData();
    if (res.success) {
      state.departments = res.departments;
      state.auditors = res.auditors;
      state.configs = res.configs;
      state.trackingList = res.trackingList;

      populateFilterOptions();
      applyFiltersAndRender();
    }
  } catch (err) {
    console.error(err);
    showToast('โหลดข้อมูลจาก Google Sheets ไม่สำเร็จ: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

/**
 * 3. อัปเดต Dropdowns ตัวกรอง (ไม่มี "รอบรายงาน" เพราะคำนวณอัตโนมัติ)
 */
function populateFilterOptions() {
  // ผู้ตรวจสอบ
  const audSelect = document.getElementById('filter-auditor');
  if (audSelect) {
    audSelect.innerHTML = '<option value="">-- ผู้ตรวจสอบทั้งหมด --</option>';
    state.auditors.forEach(a => {
      audSelect.innerHTML += `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)} (${escapeHtml(a.nickname || a.group)})</option>`;
    });
  }

  // ส่วนงาน/คณะ
  const deptSelect = document.getElementById('filter-department');
  if (deptSelect) {
    deptSelect.innerHTML = '<option value="">-- ส่วนงาน/คณะทั้งหมด --</option>';
    state.departments.filter(d => d.status === 'ใช้งาน').forEach(d => {
      deptSelect.innerHTML += `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`;
    });
  }
}

/**
 * 4. การกรองข้อมูล และคำนวณ KPI Cards เชิงลึก
 */
function applyFiltersAndRender() {
  const f = state.filters;
  const q = (f.search || '').trim().toLowerCase();

  // กรองส่วนงาน
  const filteredDepts = state.departments.filter(d => {
    if (d.status !== 'ใช้งาน') return false;
    if (f.department && d.name !== f.department) return false;
    if (f.auditor && d.auditor !== f.auditor) return false;

    // กรองกลุ่มงานของผู้ตรวจสอบ
    if (f.group) {
      const audObj = state.auditors.find(a => a.name === d.auditor);
      if (audObj && audObj.group !== f.group) return false;
    }

    if (q) {
      const match = d.name.toLowerCase().includes(q) || (d.auditor && d.auditor.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  renderExecutiveKPI(filteredDepts);
  renderMatrixTable(filteredDepts);
}

/**
 * 5. คำนวณ Executive KPI Cards เมื่อเลือกงวดรายงาน เช่น เดือนเมษายน
 */
function renderExecutiveKPI(depts) {
  const fy = state.filters.fiscalYear || '2570';
  const selectedPeriod = state.filters.period; // เช่น 'เดือนเมษายน' หรือ '' (ทั้งหมด)
  const totalDepts = depts.length; // เช่น 41 ส่วนงาน

  let pendingDeanCount = 0; // ค้างยังไม่ได้เสนอ ผอ.
  let pendingPresidentCount = 0; // ยังไม่ได้เสนออธิการบดี (ยังไม่เสร็จสิ้น)
  let completedCount = 0; // เสนออธิการบดีแล้ว
  let totalDaysToPresident = 0;
  let countPresidentWithDays = 0;
  let totalEditDays = 0;
  let totalEditCount = 0;
  let countReportsWithEdits = 0;

  // รายการสำหรับ Drilldown
  const listPendingDean = [];
  const listPendingPresident = [];

  depts.forEach(dept => {
    // หางานตรวจสอบในรอบปีงบประมาณและงวดที่เลือก
    let matchingTracks = state.trackingList.filter(t => t.department === dept.name && t.fiscalYear.toString() === fy.toString());

    if (selectedPeriod) {
      matchingTracks = matchingTracks.filter(t => t.period && t.period.includes(selectedPeriod));
    }

    if (matchingTracks.length === 0) {
      // ยังไม่มีรายการในงวดนี้
      pendingDeanCount++;
      pendingPresidentCount++;
      listPendingDean.push({ department: dept.name, auditor: dept.auditor, status: 'ยังไม่ได้รับงบ/ยังไม่เสนอ ผอ.' });
      listPendingPresident.push({ department: dept.name, auditor: dept.auditor, status: 'ยังไม่เสนออธิการบดี' });
    } else {
      matchingTracks.forEach(t => {
        const hasSubmittedDean = !!t.dateSubmittedToDean;
        const hasSubmittedPresident = !!t.dateSubmittedToPresident;

        if (!hasSubmittedDean) {
          pendingDeanCount++;
          listPendingDean.push({ department: dept.name, auditor: t.auditor || dept.auditor, status: 'ยังไม่เสนอ ผอ.' });
        }

        if (!hasSubmittedPresident) {
          pendingPresidentCount++;
          listPendingPresident.push({ department: dept.name, auditor: t.auditor || dept.auditor, status: hasSubmittedDean ? 'เสนอ ผอ. แล้ว (รอความเห็นชอบ/เสนออธิการบดี)' : 'ยังไม่เสนอ ผอ.' });
        } else {
          completedCount++;
          // คำนวณระยะเวลารับงบถึงเสนออธิการบดี
          if (t.dateAuditorReceived && t.dateSubmittedToPresident) {
            const d1 = parseDateSafe(t.dateAuditorReceived);
            const d2 = parseDateSafe(t.dateSubmittedToPresident);
            if (d1 && d2) {
              const diff = Math.max(0, Math.round((d2 - d1) / (24 * 60 * 60 * 1000)));
              totalDaysToPresident += diff;
              countPresidentWithDays++;
            }
          }
        }

        if (t.editCount > 0) {
          totalEditCount += t.editCount;
          totalEditDays += (t.editTotalDays || 0);
          countReportsWithEdits++;
        }
      });
    }
  });

  const avgDaysToPresident = countPresidentWithDays > 0 ? (totalDaysToPresident / countPresidentWithDays).toFixed(1) : '-';
  const avgEditDays = countReportsWithEdits > 0 ? (totalEditDays / countReportsWithEdits).toFixed(1) : '0';
  const avgEditCount = totalDepts > 0 ? (totalEditCount / totalDepts).toFixed(1) : '0';

  // อัปเดตตัวเลขลง Cards
  const periodLabel = selectedPeriod ? `[${selectedPeriod}]` : 'ทั้งปีงบประมาณ';
  setElText('kpi-period-tag', periodLabel);
  setElText('kpi-total-depts', totalDepts);
  setElText('kpi-completed-ratio', `${completedCount} / ${totalDepts}`);
  setElText('kpi-pending-dean', pendingDeanCount);
  setElText('kpi-pending-president', pendingPresidentCount);
  setElText('kpi-avg-days-president', avgDaysToPresident !== '-' ? `${avgDaysToPresident} วัน` : '-');
  setElText('kpi-avg-edit-days', `${avgEditDays} วัน`);
  setElText('kpi-avg-edit-count', `${avgEditCount} ครั้ง`);

  // บันทึกข้อมูลสำหรับปุ่ม Drilldown
  state.lastDrilldownData = {
    pendingDean: listPendingDean,
    pendingPresident: listPendingPresident,
    period: selectedPeriod || 'ทุกงวด'
  };
}

/**
 * 6. สร้าง Matrix Table: ส่วนงาน x 12 เดือนในรอบปีงบประมาณ (ต.ค. - ก.ย.)
 */
function renderMatrixTable(depts) {
  const container = document.getElementById('matrix-table-body');
  if (!container) return;

  const fy = state.filters.fiscalYear || '2570';
  const isDean = state.user && (state.user.role === 'Dean' || state.user.role === 'Admin');

  if (depts.length === 0) {
    container.innerHTML = `<tr><td colspan="15" style="text-align: center; padding: 40px; color: var(--text-muted);">ไม่พบข้อมูลส่วนงานตามเงื่อนไขที่เลือก</td></tr>`;
    return;
  }

  let html = '';

  depts.forEach((dept, idx) => {
    const isQuarterly = dept.cycle === 'รายไตรมาส';
    const deptTracks = state.trackingList.filter(t => t.department === dept.name && t.fiscalYear.toString() === fy.toString());

    // คำนวณความคืบหน้า (จำนวนเดือนที่เสร็จสิ้น)
    let completedMonths = 0;

    let rowMonthsHtml = '';
    FISCAL_MONTHS.forEach(m => {
      // ตรวจสอบว่าเป็นส่วนงานรายไตรมาสหรือไม่
      if (isQuarterly) {
        if (!m.qReport) {
          // เดือน ต.ค., พ.ย., ธ.ค. ฯลฯ ไม่ได้ส่งรายเดือนเดี่ยวๆ ให้ขึ้นข้อความสีเทาอ่อน "รายไตรมาส"
          rowMonthsHtml += `
            <td>
              <div class="cell-month-box">
                <span class="status-badge-quarterly-placeholder">รายไตรมาส</span>
              </div>
            </td>`;
          return;
        }

        // ในเดือนที่เป็นกำหนดส่งงวดไตรมาส (ม.ค. = Q1, เม.ย. = Q2, ก.ค. = Q3, ก.ย. = Q4)
        const qTrack = deptTracks.find(t => t.period && (t.period.includes(m.qReport) || t.period.includes(m.fullName)));
        rowMonthsHtml += `<td>${renderMonthCellBadge(dept, m.fullName, qTrack)}</td>`;
        if (qTrack && qTrack.dateSubmittedToPresident) completedMonths += 3;
      } else {
        // ส่วนงานรายเดือนปกติ
        const monthTrack = deptTracks.find(t => t.period && t.period.includes(m.fullName));
        rowMonthsHtml += `<td>${renderMonthCellBadge(dept, m.fullName, monthTrack)}</td>`;
        if (monthTrack && monthTrack.dateSubmittedToPresident) completedMonths++;
      }
    });

    const maxPeriods = isQuarterly ? 12 : 12;
    const progressPercent = Math.min(100, Math.round((completedMonths / maxPeriods) * 100));

    // หางานกลุ่มงาน
    const audObj = state.auditors.find(a => a.name === dept.auditor);
    const groupName = audObj ? audObj.group : 'งานตรวจสอบ';

    html += `
      <tr>
        <td class="sticky-col-dept">
          <div style="cursor: pointer;" onclick="openDepartmentDrilldown('${escapeHtml(dept.name)}')">
            <div style="font-weight: 600; color: var(--text-title); font-size: 0.9rem;">
              ${escapeHtml(dept.name)}
            </div>
            <div style="display: flex; align-items: center; gap: 6px; margin-top: 3px;">
              <span class="badge badge-purple" style="font-size: 0.7rem;">👤 ${escapeHtml(dept.auditor)}</span>
              <span style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(groupName)}</span>
            </div>
          </div>
        </td>
        ${rowMonthsHtml}
        <td style="min-width: 110px;">
          <div style="display: flex; align-items: center; gap: 8px; justify-content: center;">
            <div style="flex: 1; height: 6px; background: #ede9fe; border-radius: 4px; overflow: hidden;">
              <div style="width: ${progressPercent}%; height: 100%; background: linear-gradient(90deg, #8b5cf6, #10b981); border-radius: 4px;"></div>
            </div>
            <span style="font-size: 0.78rem; font-weight: 600; color: var(--text-title);">${progressPercent}%</span>
          </div>
        </td>
      </tr>
    `;
  });

  container.innerHTML = html;
}

/**
 * 7. Render Badge ในช่องเดือนของ Matrix
 */
function renderMonthCellBadge(dept, periodName, trackItem) {
  if (!trackItem) {
    return `<div class="cell-month-box" onclick="openDrilldownNew('${escapeHtml(dept.name)}', '${escapeHtml(periodName)}')"><span class="status-badge-empty">-</span></div>`;
  }

  // 1. ถ้า ผอ. กดเสร็จสิ้นเสนออธิการบดีแล้ว -> ขึ้นเครื่องหมายถูกสีเขียว ✓
  if (trackItem.dateSubmittedToPresident) {
    return `
      <div class="cell-month-box" onclick="openItemDrilldown('${trackItem.trackingId}')" title="เสนออธิการบดีแล้วเมื่อ ${trackItem.dateSubmittedToPresident}">
        <div class="status-badge-completed">✓</div>
      </div>
    `;
  }

  // 2. ถ้า ผอ. เห็นชอบแล้ว (รอเสนออธิการบดี)
  if (trackItem.dateDeanApproved) {
    return `
      <div class="cell-month-box" onclick="openItemDrilldown('${trackItem.trackingId}')" title="ผอ. เห็นชอบแล้ว (พร้อมเสนออธิการบดี)">
        <span class="status-badge-pending-dean">ผอ.เห็นชอบ</span>
      </div>
    `;
  }

  // 3. ถ้าอยู่ระหว่างส่งกลับแก้ไข
  if (trackItem.hasPendingEdit) {
    return `
      <div class="cell-month-box" onclick="openItemDrilldown('${trackItem.trackingId}')" title="อยู่ระหว่างส่งกลับแก้ไข">
        <span class="status-badge-editing">รอแก้ไข</span>
      </div>
    `;
  }

  // 4. ถ้าเสนอ ผอ. แล้ว
  if (trackItem.dateSubmittedToDean) {
    return `
      <div class="cell-month-box" onclick="openItemDrilldown('${trackItem.trackingId}')" title="เสนอ ผอ. แล้วเมื่อ ${trackItem.dateSubmittedToDean}">
        <span class="status-badge-pending-dean">เสนอ ผอ.</span>
      </div>
    `;
  }

  // 5. ผู้ตรวจกำลังตรวจ
  if (trackItem.dateAuditorReceived) {
    return `
      <div class="cell-month-box" onclick="openItemDrilldown('${trackItem.trackingId}')" title="ผู้ตรวจสอบกำลังตรวจ (รับงบเมื่อ ${trackItem.dateAuditorReceived})">
        <span class="status-badge-reviewing">กำลังตรวจ</span>
      </div>
    `;
  }

  // 6. ได้รับงบจากส่วนงานแล้ว
  if (trackItem.dateReceivedFromDept) {
    return `
      <div class="cell-month-box" onclick="openItemDrilldown('${trackItem.trackingId}')" title="ได้รับงบแล้ว (รอส่งมอบ)">
        <span class="status-badge-reviewing">ได้รับงบ</span>
      </div>
    `;
  }

  return `<div class="cell-month-box"><span class="status-badge-empty">-</span></div>`;
}

/**
 * 8. Drilldown Drawer (ดูข้อมูลเชิงลึกและสั่งการ)
 */
function openItemDrilldown(trackingId) {
  const item = state.trackingList.find(t => t.trackingId === trackingId);
  if (!item) return;

  state.selectedDrilldown = item;
  const drawer = document.getElementById('drilldown-drawer');
  const backdrop = document.getElementById('drawer-backdrop');

  document.getElementById('drill-title').textContent = `${item.department}`;
  document.getElementById('drill-period-badge').textContent = `${item.period} (ปีงบ ${item.fiscalYear})`;
  document.getElementById('drill-auditor-badge').textContent = `ผู้ตรวจสอบ: ${item.auditor}`;

  // Timeline
  document.getElementById('drill-date-dept').textContent = item.dateReceivedFromDept || 'ยังไม่มีข้อมูล';
  document.getElementById('drill-date-auditor').textContent = item.dateAuditorReceived || 'ยังไม่มีข้อมูล';
  document.getElementById('drill-date-leader').textContent = item.dateSubmittedToLeader || 'ยังไม่มีข้อมูล';
  document.getElementById('drill-date-dean').textContent = item.dateSubmittedToDean || 'ยังไม่มีข้อมูล';
  document.getElementById('drill-date-approved').textContent = item.dateDeanApproved || 'ยังไม่เห็นชอบ';
  document.getElementById('drill-date-president').textContent = item.dateSubmittedToPresident || 'ยังไม่เสนออธิการบดี';

  // สถิติการแก้ไข
  const editBox = document.getElementById('drill-edit-info');
  if (editBox) {
    editBox.innerHTML = `แก้ไขทั้งหมด ${item.editCount || 0} ครั้ง (รวม ${item.editTotalDays || 0} วัน)`;
  }

  // ปุ่มการพิจารณาของ ผอ.
  const isDean = state.user && (state.user.role === 'Dean' || state.user.role === 'Admin');
  const deanActionsBox = document.getElementById('drill-dean-actions');
  if (deanActionsBox) {
    deanActionsBox.style.display = isDean ? 'block' : 'none';
    const btnApprove = document.getElementById('drill-btn-approve');
    const btnComplete = document.getElementById('drill-btn-complete');
    if (btnApprove) btnApprove.disabled = !!item.dateDeanApproved;
    if (btnComplete) btnComplete.disabled = !item.dateDeanApproved || !!item.dateSubmittedToPresident || item.hasPendingEdit;
  }

  if (drawer) drawer.classList.add('open');
  if (backdrop) backdrop.classList.add('active');
}

function openDepartmentDrilldown(deptName) {
  const dept = state.departments.find(d => d.name === deptName);
  if (!dept) return;

  // กรองเมทริกซ์และเปิดดูรายละเอียด
  showToast(`กำลังเปิดดูข้อมูลเชิงลึกส่วนงาน: ${deptName}`, 'info');
  state.filters.department = deptName;
  document.getElementById('filter-department').value = deptName;
  applyFiltersAndRender();
}

function openDrilldownNew(deptName, periodName) {
  const dept = state.departments.find(d => d.name === deptName);
  const isQuarterly = dept && dept.cycle === 'รายไตรมาส';

  if (!state.user) {
    openLoginModal();
    return;
  }

  // เปิดแบบฟอร์มกรอกงานงวดใหม่
  openTrackingModalDirect(deptName, periodName, isQuarterly ? 'รายไตรมาส' : 'รายเดือน');
}

function closeDrilldown() {
  const drawer = document.getElementById('drilldown-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  if (drawer) drawer.classList.remove('open');
  if (backdrop) backdrop.classList.remove('active');
}

/**
 * 9. Action ของ ผอ. (ให้ความเห็นชอบ และ เสร็จสิ้นเสนออธิการบดี)
 */
async function drilldownDeanApprove() {
  if (!state.selectedDrilldown) return;
  if (!confirm('ยืนยันการให้ความเห็นชอบรายงานฉบับสมบูรณ์?')) return;

  showLoading(true);
  try {
    const res = await Api.call('approveByDean', {
      trackingId: state.selectedDrilldown.trackingId,
      approveDate: new Date().toISOString(),
      email: state.user.email
    });
    if (res.success) {
      showToast('ผู้อำนวยการเห็นชอบรายงานฉบับสมบูรณ์เรียบร้อย', 'success');
      closeDrilldown();
      await loadRealtimeData();
    }
  } catch (err) {
    showToast('ดำเนินการไม่สำเร็จ: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function drilldownDeanComplete() {
  if (!state.selectedDrilldown) return;
  if (!confirm('ยืนยันการเสร็จสิ้นและเสนอรายงานต่ออธิการบดี? ระบบจะบันทึกวันที่ปัจจุบันลงในระบบ และแสดงเครื่องหมายเสร็จสิ้นทันที')) return;

  showLoading(true);
  try {
    const res = await Api.call('completeAndSubmit', {
      trackingId: state.selectedDrilldown.trackingId,
      email: state.user.email
    });
    if (res.success) {
      showToast('เสร็จสิ้นและเสนอรายงานต่ออธิการบดีเรียบร้อยแล้ว ✓', 'success');
      closeDrilldown();
      await loadRealtimeData();
    }
  } catch (err) {
    showToast('ดำเนินการไม่สำเร็จ: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

/**
 * 10. Drilldown ดูรายการค้าง (ยังไม่เสนอ ผอ. หรือ ยังไม่เสนออธิการบดี)
 */
function openListDrilldown(type) {
  if (!state.lastDrilldownData) return;
  const data = type === 'dean' ? state.lastDrilldownData.pendingDean : state.lastDrilldownData.pendingPresident;
  const title = type === 'dean' ? 'รายชื่อส่วนงานที่ค้างยังไม่ได้เสนอ ผอ.' : 'รายชื่อส่วนงานที่ยังไม่ได้เสนออธิการบดี';

  const modal = document.getElementById('modal-list-drilldown');
  const titleEl = document.getElementById('drilldown-list-title');
  const container = document.getElementById('drilldown-list-content');

  if (titleEl) titleEl.textContent = `${title} (${state.lastDrilldownData.period})`;
  if (container) {
    if (data.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: #10b981; padding: 20px;">✓ ไม่มีรายการค้าง ดำเนินการครบถ้วน</div>`;
    } else {
      let html = `
        <table class="table-matrix" style="text-align: left;">
          <thead>
            <tr>
              <th>ส่วนงาน</th>
              <th>ผู้ตรวจสอบ</th>
              <th>สถานะปัจจุบัน</th>
            </tr>
          </thead>
          <tbody>
      `;
      data.forEach(item => {
        html += `
          <tr>
            <td style="font-weight: 600;">${escapeHtml(item.department)}</td>
            <td>${escapeHtml(item.auditor)}</td>
            <td><span class="status-badge-pending-dean">${escapeHtml(item.status)}</span></td>
          </tr>
        `;
      });
      html += '</tbody></table>';
      container.innerHTML = html;
    }
  }

  if (modal) modal.classList.add('active');
}

/**
 * Event Listeners
 */
function setupEventListeners() {
  // Bind Filter inputs
  const bindF = (id, key) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        state.filters[key] = el.value;
        applyFiltersAndRender();
      });
    }
  };

  bindF('filter-fy', 'fiscalYear');
  bindF('filter-period', 'period');
  bindF('filter-group', 'group');
  bindF('filter-auditor', 'auditor');
  bindF('filter-department', 'department');

  const searchInput = document.getElementById('filter-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      state.filters.search = searchInput.value;
      applyFiltersAndRender();
    });
  }

  // Login form
  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.addEventListener('submit', handleLoginSubmit);

  // Close modals on overlay click
  document.querySelectorAll('.login-modal-overlay').forEach(o => {
    o.addEventListener('click', (e) => {
      if (e.target === o && state.user) o.classList.remove('active');
    });
  });
}

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
  setTimeout(() => toast.remove(), 4000);
}

function setElText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseDateSafe(str) {
  if (!str) return null;
  const parts = str.toString().split(/[\/\-]/);
  if (parts.length === 3) {
    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);
    if (year > 2400) year -= 543;
    return new Date(year, month, day);
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}
