const Complaint = require('../models/Complaint');
const User = require('../models/User');
const Task = require('../models/Task');
const Attendance = require('../models/Attendance');
const { successResponse, errorResponse } = require('../utils/response');
const { buildScopeFilter } = require('../middleware/scope.middleware');

/**
 * Sanitize cell value to prevent CSV Formula Injection (CWE-1236)
 * When a cell starts with =, +, -, @, \t, or \r, prefix with a single quote '
 */
function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return '""';
  let str = String(value).trim();
  // If starts with dangerous character, escape with single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // Escape double quotes
  str = str.replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * GET /api/v1/reports/summary
 * Constituency / Role-based operational overview metrics
 */
async function getDashboardSummary(req, res) {
  try {
    const scopeFilter = buildScopeFilter(req.user);

    // Complaint aggregation
    const [
      totalComplaints,
      resolvedComplaints,
      inProgressComplaints,
      submittedComplaints,
      urgentComplaints
    ] = await Promise.all([
      Complaint.countDocuments(scopeFilter),
      Complaint.countDocuments({ ...scopeFilter, status: 'RESOLVED' }),
      Complaint.countDocuments({ ...scopeFilter, status: { $in: ['IN_PROGRESS', 'ASSIGNED', 'UNDER_REVIEW'] } }),
      Complaint.countDocuments({ ...scopeFilter, status: 'SUBMITTED' }),
      Complaint.countDocuments({ ...scopeFilter, priority: 'URGENT', status: { $ne: 'RESOLVED' } })
    ]);

    // User aggregation
    let userFilter = {};
    if (req.user.role !== 'SUPER_ADMIN' && req.user.constituencyId) {
      userFilter.constituencyId = req.user.constituencyId;
    }

    const [
      totalCitizens,
      totalBoothWorkers,
      totalStaff
    ] = await Promise.all([
      User.countDocuments({ ...userFilter, role: 'CITIZEN' }),
      User.countDocuments({ ...userFilter, role: 'BOOTH_WORKER' }),
      User.countDocuments({ ...userFilter, role: 'PA_STAFF' })
    ]);

    // Task aggregation
    let taskFilter = {};
    if (req.user.role === 'BOOTH_WORKER') {
      taskFilter.assignedWorkerId = req.user._id;
    } else if (req.user.role !== 'SUPER_ADMIN' && req.user.constituencyId) {
      taskFilter.constituencyId = req.user.constituencyId;
    }

    const [totalTasks, completedTasks, pendingTasks] = await Promise.all([
      Task.countDocuments(taskFilter),
      Task.countDocuments({ ...taskFilter, status: 'COMPLETED' }),
      Task.countDocuments({ ...taskFilter, status: { $in: ['PENDING', 'IN_PROGRESS', 'ACCEPTED'] } })
    ]);

    // Today's attendance
    const todayStr = new Date().toISOString().split('T')[0];
    const todayAttendanceCount = await Attendance.countDocuments({ attendanceDate: todayStr });

    return successResponse(res, {
      complaints: {
        total: totalComplaints,
        submitted: submittedComplaints,
        inProgress: inProgressComplaints,
        resolved: resolvedComplaints,
        urgent: urgentComplaints
      },
      users: {
        citizens: totalCitizens,
        boothWorkers: totalBoothWorkers,
        staff: totalStaff
      },
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        pending: pendingTasks
      },
      todayAttendance: todayAttendanceCount
    }, 'डैशबोर्ड सांख्यिकी प्राप्त हुई।');
  } catch (error) {
    return errorResponse(res, `सांख्यिकी गणना में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * GET /api/v1/reports/export/complaints
 * Stream sanitized CSV export with formula injection protection
 */
async function exportComplaintsCsv(req, res) {
  try {
    const scopeFilter = buildScopeFilter(req.user);
    const complaints = await Complaint.find(scopeFilter)
      .populate('citizenId', 'fullName mobileNumber')
      .populate('constituencyId', 'name')
      .populate('wardId', 'wardNumber')
      .populate('boothId', 'boothNumber')
      .sort({ createdAt: -1 })
      .limit(1000);

    const headers = [
      'Tracking ID',
      'Citizen Name',
      'Mobile',
      'Category',
      'Subject',
      'Priority',
      'Status',
      'Constituency',
      'Ward',
      'Booth',
      'Date Submitted'
    ];

    const rows = complaints.map(c => [
      sanitizeCsvCell(c.trackingId),
      sanitizeCsvCell(c.citizenId?.fullName || 'N/A'),
      sanitizeCsvCell(c.citizenId?.mobileNumber || 'N/A'),
      sanitizeCsvCell(c.category),
      sanitizeCsvCell(c.subject),
      sanitizeCsvCell(c.priority),
      sanitizeCsvCell(c.status),
      sanitizeCsvCell(c.constituencyId?.name || 'N/A'),
      sanitizeCsvCell(c.wardId?.wardNumber || 'N/A'),
      sanitizeCsvCell(c.boothId?.boothNumber || 'N/A'),
      sanitizeCsvCell(c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN') : '')
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="jan-connect-complaints-${Date.now()}.csv"`);
    return res.status(200).send('\uFEFF' + csvContent); // UTF-8 BOM for Excel support
  } catch (error) {
    return errorResponse(res, `CSV निर्यात में त्रुटि: ${error.message}`, 500);
  }
}

module.exports = {
  getDashboardSummary,
  exportComplaintsCsv
};
