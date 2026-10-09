const Complaint = require('../models/Complaint');
const ComplaintUpdate = require('../models/ComplaintUpdate');
const { generateComplaintTrackingId } = require('../utils/trackingId');
const { successResponse, errorResponse } = require('../utils/response');
const { logAudit } = require('../services/audit.service');
const { sendNotification } = require('../services/notification.service');
const { buildScopeFilter } = require('../middleware/scope.middleware');

/**
 * POST /api/v1/complaints
 * Citizen registers a complaint or request
 */
async function createComplaint(req, res) {
  try {
    const {
      category,
      subject,
      description,
      priority = 'MEDIUM',
      constituencyId,
      wardId,
      boothId,
      location,
      mediaAttachments
    } = req.body;

    if (!category || !subject || !description) {
      return errorResponse(res, 'शिकायत की श्रेणी (Category), विषय (Subject) और विवरण (Description) अनिवार्य हैं।', 400);
    }

    const trackingId = generateComplaintTrackingId();

    // Use provided geography or fallback to citizen's profile defaults
    const finalConstituencyId = constituencyId || req.user.constituencyId || null;
    const finalWardId = wardId || req.user.wardId || null;
    const finalBoothId = boothId || req.user.boothId || null;

    const complaint = new Complaint({
      trackingId,
      citizenId: req.user._id,
      category: category.trim(),
      subject: subject.trim(),
      description: description.trim(),
      priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(priority) ? priority : 'MEDIUM',
      status: 'SUBMITTED',
      constituencyId: finalConstituencyId,
      wardId: finalWardId,
      boothId: finalBoothId,
      location: location ? location.trim() : undefined,
      mediaAttachments: Array.isArray(mediaAttachments) ? mediaAttachments : []
    });

    await complaint.save();

    // Create initial timeline update
    await ComplaintUpdate.create({
      complaintId: complaint._id,
      authorId: req.user._id,
      authorRole: req.user.role,
      statusBefore: null,
      statusAfter: 'SUBMITTED',
      updateText: 'शिकायत जन कनेक्ट पोर्टल पर सफलतापूर्वक दर्ज की गई।',
      isInternal: false
    });

    // Send in-app notification to the citizen
    await sendNotification({
      recipientId: req.user._id,
      type: 'COMPLAINT',
      title: 'शिकायत दर्ज हुई',
      message: `आपकी शिकायत संख्या ${trackingId} सफलतापूर्वक दर्ज कर ली गई है।`,
      relatedResource: {
        resourceType: 'Complaint',
        resourceId: complaint._id
      }
    });

    // Audit log
    await logAudit({
      userId: req.user._id,
      userRole: req.user.role,
      action: 'COMPLAINT_CREATE',
      resourceType: 'Complaint',
      resourceId: complaint._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: { trackingId, category }
    });

    return successResponse(res, complaint, `आपकी शिकायत सफलतापूर्वक दर्ज कर ली गई है। ट्रैकिंग संख्या: ${trackingId}`, 201);
  } catch (error) {
    return errorResponse(res, `शिकायत दर्ज करने में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * GET /api/v1/complaints
 * Scoped complaint listing with status, category, and date filtering
 */
async function getComplaints(req, res) {
  try {
    const { status, category, priority, trackingId, search, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Apply strict scope filter
    let filter = buildScopeFilter(req.user);

    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;
    if (trackingId) filter.trackingId = trackingId.toUpperCase();
    if (search) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { trackingId: regex },
        { subject: regex },
        { description: regex }
      ];
    }

    const [complaints, total] = await Promise.all([
      Complaint.find(filter)
        .populate('citizenId', 'fullName mobileNumber')
        .populate('constituencyId', 'name code')
        .populate('wardId', 'name wardNumber')
        .populate('boothId', 'name boothNumber')
        .populate('assignedUserId', 'fullName mobileNumber role')
        .populate('assignedOfficeId', 'name address')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Complaint.countDocuments(filter)
    ]);

    return successResponse(res, {
      complaints,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    }, 'शिकायतों की सूची।');
  } catch (error) {
    return errorResponse(res, `शिकायत सूची लोड करने में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * GET /api/v1/complaints/track/:trackingId
 * Public / Citizen tracking with privacy guard: staff internal notes are filtered out
 */
async function trackComplaint(req, res) {
  try {
    const { trackingId } = req.params;
    if (!trackingId) {
      return errorResponse(res, 'ट्रैकिंग संख्या अनिवार्य है।', 400);
    }

    const complaint = await Complaint.findOne({ trackingId: trackingId.toUpperCase().trim() })
      .populate('citizenId', 'fullName mobileNumber')
      .populate('constituencyId', 'name district')
      .populate('wardId', 'name wardNumber')
      .populate('boothId', 'name boothNumber')
      .populate('assignedOfficeId', 'name address phone');

    if (!complaint) {
      return errorResponse(res, `ट्रैकिंग संख्या [${trackingId}] की कोई शिकायत नहीं मिली।`, 404);
    }

    // Determine if requester can view internal staff notes
    const isPrivileged = req.user && ['SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF', 'BOOTH_WORKER'].includes(req.user.role);

    // Filter updates: hide private staff notes from citizens and anonymous users
    const updateFilter = { complaintId: complaint._id };
    if (!isPrivileged) {
      updateFilter.isInternal = false;
    }

    const timeline = await ComplaintUpdate.find(updateFilter)
      .populate('authorId', 'fullName role')
      .sort({ createdAt: 1 });

    return successResponse(res, {
      complaint,
      timeline
    }, 'शिकायत स्थिति और समयरेखा।');
  } catch (error) {
    return errorResponse(res, `शिकायत ट्रैक करने में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * GET /api/v1/complaints/:id
 * Retrieve single complaint by ID with scope validation
 */
async function getComplaintById(req, res) {
  try {
    const complaint = await Complaint.findById(req.params.id)
      .populate('citizenId', 'fullName mobileNumber email address villageMohalla')
      .populate('constituencyId', 'name code district')
      .populate('wardId', 'name wardNumber')
      .populate('boothId', 'name boothNumber')
      .populate('assignedUserId', 'fullName mobileNumber role')
      .populate('assignedOfficeId', 'name address phone');

    if (!complaint) {
      return errorResponse(res, 'शिकायत नहीं मिली।', 404);
    }

    // Scope check
    if (req.user.role === 'CITIZEN' && complaint.citizenId._id.toString() !== req.user._id.toString()) {
      return errorResponse(res, 'आपको केवल अपनी शिकायतों को देखने की अनुमति है।', 403);
    }

    const isPrivileged = ['SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF', 'BOOTH_WORKER'].includes(req.user.role);
    const updateFilter = { complaintId: complaint._id };
    if (!isPrivileged) {
      updateFilter.isInternal = false;
    }

    const timeline = await ComplaintUpdate.find(updateFilter)
      .populate('authorId', 'fullName role')
      .sort({ createdAt: 1 });

    return successResponse(res, {
      complaint,
      timeline
    }, 'शिकायत विवरण प्राप्त हुआ।');
  } catch (error) {
    return errorResponse(res, 'शिकायत लोड करने में त्रुटि।', 500);
  }
}

/**
 * POST /api/v1/complaints/:id/updates
 * Add timeline update / change status / add private staff notes
 */
async function addComplaintUpdate(req, res) {
  try {
    const { updateText, newStatus, isInternal = false, attachments } = req.body;

    if (!updateText || !updateText.trim()) {
      return errorResponse(res, 'प्रगति विवरण अथवा टिप्पणी अनिवार्य है।', 400);
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return errorResponse(res, 'शिकायत नहीं मिली।', 404);
    }

    // Role verification
    const isStaff = ['SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF', 'BOOTH_WORKER'].includes(req.user.role);
    const isCitizenOwner = req.user.role === 'CITIZEN' && complaint.citizenId.toString() === req.user._id.toString();

    if (!isStaff && !isCitizenOwner) {
      return errorResponse(res, 'इस शिकायत पर टिप्पणी जोड़ने की अनुमति नहीं है।', 403);
    }

    // Citizen cannot make internal notes or unilaterally resolve complaints
    const safeIsInternal = isStaff ? Boolean(isInternal) : false;
    const oldStatus = complaint.status;
    let nextStatus = oldStatus;

    if (newStatus && isStaff) {
      nextStatus = newStatus;
      complaint.status = newStatus;
      if (newStatus === 'RESOLVED') {
        complaint.resolutionDate = new Date();
        complaint.resolutionDetails = updateText.trim();
      }
      await complaint.save();
    } else if (newStatus && !isStaff && newStatus === 'REOPENED' && oldStatus === 'RESOLVED') {
      // Citizen can request reopening of a resolved complaint
      nextStatus = 'REOPENED';
      complaint.status = 'REOPENED';
      await complaint.save();
    }

    const updateRecord = await ComplaintUpdate.create({
      complaintId: complaint._id,
      authorId: req.user._id,
      authorRole: req.user.role,
      statusBefore: oldStatus,
      statusAfter: nextStatus,
      updateText: updateText.trim(),
      isInternal: safeIsInternal,
      attachments: Array.isArray(attachments) ? attachments : []
    });

    // Notify citizen if status changed or public note added by staff
    if (isStaff && !safeIsInternal) {
      await sendNotification({
        recipientId: complaint.citizenId,
        type: 'COMPLAINT',
        title: `शिकायत अपडेट: ${complaint.trackingId}`,
        message: `स्थिति: [${nextStatus}] - ${updateText.trim()}`,
        relatedResource: {
          resourceType: 'Complaint',
          resourceId: complaint._id
        }
      });
    }

    await logAudit({
      userId: req.user._id,
      userRole: req.user.role,
      action: 'COMPLAINT_UPDATE',
      resourceType: 'Complaint',
      resourceId: complaint._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: {
        trackingId: complaint.trackingId,
        statusBefore: oldStatus,
        statusAfter: nextStatus,
        isInternal: safeIsInternal
      }
    });

    return successResponse(res, updateRecord, 'प्रगति विवरण सफलतापूर्वक जोड़ दिया गया।', 201);
  } catch (error) {
    return errorResponse(res, `अपडेट जोड़ने में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * PATCH /api/v1/complaints/:id/assign
 * Assign complaint to office or staff member
 */
async function assignComplaint(req, res) {
  try {
    const { assignedUserId, assignedOfficeId } = req.body;

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return errorResponse(res, 'शिकायत नहीं मिली।', 404);
    }

    if (assignedUserId !== undefined) complaint.assignedUserId = assignedUserId || null;
    if (assignedOfficeId !== undefined) complaint.assignedOfficeId = assignedOfficeId || null;

    if (complaint.status === 'SUBMITTED') {
      complaint.status = 'ASSIGNED';
    }

    await complaint.save();

    // Create timeline record
    await ComplaintUpdate.create({
      complaintId: complaint._id,
      authorId: req.user._id,
      authorRole: req.user.role,
      statusBefore: 'SUBMITTED',
      statusAfter: complaint.status,
      updateText: 'शिकायत संबंधित अधिकारी अथवा कार्यालय को आवंटित (Assigned) कर दी गई है।',
      isInternal: false
    });

    // If assigned to a specific worker, notify them
    if (assignedUserId) {
      await sendNotification({
        recipientId: assignedUserId,
        type: 'TASK',
        title: 'नई शिकायत आवंटित हुई',
        message: `शिकायत संख्या ${complaint.trackingId} आपके कार्य हेतु आवंटित की गई है।`,
        relatedResource: {
          resourceType: 'Complaint',
          resourceId: complaint._id
        }
      });
    }

    return successResponse(res, complaint, 'शिकायत सफलतापूर्वक आवंटित की गई।');
  } catch (error) {
    return errorResponse(res, `आवंटन में त्रुटि: ${error.message}`, 500);
  }
}

module.exports = {
  createComplaint,
  getComplaints,
  trackComplaint,
  getComplaintById,
  addComplaintUpdate,
  assignComplaint
};
