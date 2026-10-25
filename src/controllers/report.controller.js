const XLSX = require('xlsx');
const mongoose = require('mongoose');
const Complaint = require('../models/Complaint');
const User = require('../models/User');
const Task = require('../models/Task');
const Attendance = require('../models/Attendance');
const AuditLog = require('../models/AuditLog');
const BotQueryLog = require('../models/BotQueryLog');
const { successResponse, errorResponse } = require('../utils/response');
const { buildScopeFilter } = require('../middleware/scope.middleware');

/**
 * Sanitize cell value to prevent CSV Formula Injection (CWE-1236)
 */
function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return '';
  let str = String(value).trim();
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return str;
}

/**
 * GET /api/v1/reports/summary
 * Platform-wide / Constituency / Role-based operational overview metrics
 */
async function getDashboardSummary(req, res) {
  try {
    const { startDate, endDate, district, designation } = req.query;

    const scopeFilter = buildScopeFilter(req.user);
    let userFilter = buildScopeFilter(req.user, { isUserQuery: true });

    // Optional district & designation filters
    if (district && district !== 'ALL') {
      userFilter.district = new RegExp(`^${district.trim()}$`, 'i');
    }
    if (designation && designation !== 'ALL') {
      userFilter.designation = new RegExp(`^${designation.trim()}$`, 'i');
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    // Complaint aggregation
    const [
      totalComplaints,
      resolvedComplaints,
      inProgressComplaints,
      submittedComplaints,
      rejectedComplaints,
      urgentComplaints,
      todayComplaints,
      overdueComplaints
    ] = await Promise.all([
      Complaint.countDocuments(scopeFilter),
      Complaint.countDocuments({ ...scopeFilter, status: 'RESOLVED' }),
      Complaint.countDocuments({ ...scopeFilter, status: { $in: ['IN_PROGRESS', 'ASSIGNED', 'UNDER_REVIEW'] } }),
      Complaint.countDocuments({ ...scopeFilter, status: 'SUBMITTED' }),
      Complaint.countDocuments({ ...scopeFilter, status: 'REJECTED' }),
      Complaint.countDocuments({ ...scopeFilter, priority: 'URGENT', status: { $ne: 'RESOLVED' } }),
      Complaint.countDocuments({ ...scopeFilter, createdAt: { $gte: startOfToday } }),
      Complaint.countDocuments({ ...scopeFilter, status: { $nin: ['RESOLVED', 'REJECTED'] }, createdAt: { $lte: fifteenDaysAgo } })
    ]);

    // User aggregation
    const [
      totalUsers,
      totalCitizens,
      totalBoothWorkers,
      totalStaff,
      totalPoliticians,
      totalSuperAdmins,
      todayRegistrations,
      activeUsers,
      suspendedUsers,
      deactivatedUsers,
      pendingUsers,
      verifiedUsers,
      unverifiedUsers,
      pendingReviewUsers,
      rejectedUsers,
      missingDesignationUsers,
      missingLocationUsers,
      incompleteContactUsers
    ] = await Promise.all([
      User.countDocuments(userFilter),
      User.countDocuments({ ...userFilter, role: 'CITIZEN' }),
      User.countDocuments({ ...userFilter, role: 'BOOTH_WORKER' }),
      User.countDocuments({ ...userFilter, role: 'PA_STAFF' }),
      User.countDocuments({ ...userFilter, role: 'POLITICIAN' }),
      User.countDocuments({ ...userFilter, role: 'SUPER_ADMIN' }),
      User.countDocuments({ ...userFilter, createdAt: { $gte: startOfToday } }),
      User.countDocuments({ ...userFilter, accountStatus: 'ACTIVE' }),
      User.countDocuments({ ...userFilter, accountStatus: 'SUSPENDED' }),
      User.countDocuments({ ...userFilter, accountStatus: 'DEACTIVATED' }),
      User.countDocuments({ ...userFilter, accountStatus: 'PENDING' }),
      User.countDocuments({ ...userFilter, verificationStatus: 'VERIFIED' }),
      User.countDocuments({ ...userFilter, verificationStatus: 'UNVERIFIED' }),
      User.countDocuments({ ...userFilter, verificationStatus: 'PENDING_REVIEW' }),
      User.countDocuments({ ...userFilter, verificationStatus: 'REJECTED' }),
      User.countDocuments({ ...userFilter, $or: [{ designation: { $exists: false } }, { designation: '' }, { designation: null }] }),
      User.countDocuments({ ...userFilter, $or: [{ district: { $exists: false } }, { district: '' }, { district: null }] }),
      User.countDocuments({ ...userFilter, $or: [{ email: { $exists: false } }, { email: '' }, { email: null }] })
    ]);

    // Optional period registrations if date range passed
    let periodRegistrations = todayRegistrations;
    if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);
      periodRegistrations = await User.countDocuments({ ...userFilter, createdAt: { $gte: s, $lte: e } });
    }

    // Top Designations breakdown
    const designationBreakdown = await User.aggregate([
      { $match: { ...userFilter, designation: { $nin: ['', null] } } },
      { $group: { _id: '$designation', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 }
    ]);

    // Top Districts breakdown
    const districtBreakdown = await User.aggregate([
      { $match: { ...userFilter, district: { $nin: ['', null] } } },
      { $group: { _id: '$district', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 }
    ]);

    // Area Type breakdown
    const [ruralCount, urbanCount] = await Promise.all([
      User.countDocuments({ ...userFilter, areaType: 'RURAL' }),
      User.countDocuments({ ...userFilter, areaType: 'URBAN' })
    ]);

    // Bot query logs stats
    let botStats = { totalQueries: 0, unansweredCount: 0 };
    try {
      const [totalBot, unansweredBot] = await Promise.all([
        BotQueryLog.countDocuments(),
        BotQueryLog.countDocuments({ status: 'UNANSWERED' })
      ]);
      botStats = { totalQueries: totalBot, unansweredCount: unansweredBot };
    } catch (_) {}

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

    // Recent 5 member registrations
    const recentMembers = await User.find(userFilter)
      .select('fullName mobileNumber role accountStatus createdAt designation district assemblyConstituency verificationStatus')
      .sort({ createdAt: -1 })
      .limit(5);

    // Recent 5 complaints
    const recentComplaints = await Complaint.find(scopeFilter)
      .populate('citizenId', 'fullName mobileNumber')
      .select('trackingId subject category priority status createdAt')
      .sort({ createdAt: -1 })
      .limit(5);

    // Recent 5 audit activity logs
    let recentActivity = [];
    try {
      recentActivity = await AuditLog.find()
        .populate('userId', 'fullName mobileNumber role')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();
    } catch (_) {}

    // 7-day activity trend for charts
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      const dateLabel = dayStart.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });

      const [regCount, compCount] = await Promise.all([
        User.countDocuments({ ...userFilter, createdAt: { $gte: dayStart, $lte: dayEnd } }),
        Complaint.countDocuments({ ...scopeFilter, createdAt: { $gte: dayStart, $lte: dayEnd } })
      ]);

      trend.push({
        date: dateLabel,
        registrations: regCount,
        complaints: compCount
      });
    }

    const resolutionRate = totalComplaints > 0 ? Math.round((resolvedComplaints / totalComplaints) * 100) : 0;
    const dbConnected = mongoose.connection.readyState === 1;

    return successResponse(res, {
      systemHealth: {
        database: dbConnected ? 'CONNECTED' : 'DISCONNECTED',
        apiStatus: 'HEALTHY',
        timestamp: new Date().toISOString()
      },
      complaints: {
        total: totalComplaints,
        submitted: submittedComplaints,
        inProgress: inProgressComplaints,
        resolved: resolvedComplaints,
        rejected: rejectedComplaints,
        urgent: urgentComplaints,
        overdue: overdueComplaints,
        todayComplaints,
        resolutionRate
      },
      users: {
        total: totalUsers,
        citizens: totalCitizens,
        boothWorkers: totalBoothWorkers,
        staff: totalStaff,
        politicians: totalPoliticians,
        superAdmins: totalSuperAdmins,
        todayRegistrations,
        periodRegistrations,
        active: activeUsers,
        suspended: suspendedUsers,
        deactivated: deactivatedUsers,
        pending: pendingUsers,
        verified: verifiedUsers,
        unverified: unverifiedUsers,
        pendingReview: pendingReviewUsers,
        rejected: rejectedUsers,
        missingDesignation: missingDesignationUsers,
        missingLocation: missingLocationUsers,
        incompleteContact: incompleteContactUsers
      },
      distribution: {
        byDesignation: designationBreakdown.map(d => ({ title: d._id, count: d.count })),
        byDistrict: districtBreakdown.map(d => ({ district: d._id, count: d.count })),
        byArea: {
          rural: ruralCount,
          urban: urbanCount
        }
      },
      botStats,
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        pending: pendingTasks
      },
      todayAttendance: todayAttendanceCount,
      recentMembers: recentMembers.map(u => u.toJSON()),
      recentComplaints,
      recentActivity,
      trend
    }, 'डैशबोर्ड सांख्यिकी प्राप्त हुई।');
  } catch (error) {
    return errorResponse(res, `सांख्यिकी गणना में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * GET /api/v1/reports/export/complaints
 * Stream sanitized CSV or Excel export with formula injection protection
 */
async function exportComplaintsCsv(req, res) {
  try {
    const { status, category, priority, search, format = 'csv' } = req.query;
    let scopeFilter = buildScopeFilter(req.user);

    if (status && status !== 'ALL') scopeFilter.status = status;
    if (category && category !== 'ALL') scopeFilter.category = category;
    if (priority && priority !== 'ALL') scopeFilter.priority = priority;
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      scopeFilter.$or = [
        { trackingId: regex },
        { subject: regex },
        { description: regex }
      ];
    }

    const complaints = await Complaint.find(scopeFilter)
      .populate('citizenId', 'fullName mobileNumber email')
      .populate('constituencyId', 'name')
      .populate('wardId', 'name wardNumber')
      .populate('boothId', 'name boothNumber')
      .populate('assignedUserId', 'fullName role')
      .sort({ createdAt: -1 })
      .limit(5000);

    const rows = complaints.map(c => ({
      'ट्रैकिंग ID (Tracking ID)': sanitizeCsvCell(c.trackingId),
      'नागरिक का नाम (Citizen Name)': sanitizeCsvCell(c.citizenId?.fullName || 'N/A'),
      'मोबाइल (Mobile)': sanitizeCsvCell(c.citizenId?.mobileNumber || 'N/A'),
      'श्रेणी (Category)': sanitizeCsvCell(c.category),
      'विषय (Subject)': sanitizeCsvCell(c.subject),
      'प्राथमिकता (Priority)': sanitizeCsvCell(c.priority),
      'स्थिति (Status)': sanitizeCsvCell(c.status),
      'विधानसभा (Constituency)': sanitizeCsvCell(c.constituencyId?.name || 'N/A'),
      'वार्ड (Ward)': sanitizeCsvCell(c.wardId?.wardNumber || 'N/A'),
      'बूथ (Booth)': sanitizeCsvCell(c.boothId?.boothNumber || 'N/A'),
      'आवंटित अधिकारी (Assigned To)': sanitizeCsvCell(c.assignedUserId?.fullName || 'N/A'),
      'दर्ज करने की तिथि (Submitted Date)': c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN') : '',
      'निस्तारण विवरण / अस्वीकृति कारण (Resolution / Remarks)': sanitizeCsvCell(c.resolutionDetails || c.rejectionReason || '')
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Complaints');

    if (String(format).toLowerCase() === 'xlsx') {
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="jan-connect-complaints-${Date.now()}.xlsx"`);
      return res.status(200).send(buffer);
    }

    const csvContent = XLSX.utils.sheet_to_csv(worksheet);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="jan-connect-complaints-${Date.now()}.csv"`);
    return res.status(200).send('\uFEFF' + csvContent);
  } catch (error) {
    return errorResponse(res, `शिकायत निर्यात में त्रुटि: ${error.message}`, 500);
  }
}

module.exports = {
  getDashboardSummary,
  exportComplaintsCsv
};
