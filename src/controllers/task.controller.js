const Task = require('../models/Task');
const { successResponse, errorResponse } = require('../utils/response');
const { logAudit } = require('../services/audit.service');
const { sendNotification } = require('../services/notification.service');
const { buildScopeFilter } = require('../middleware/scope.middleware');

async function createTask(req, res) {
  try {
    const {
      title,
      description,
      assignedWorkerId,
      priority = 'MEDIUM',
      dueDate,
      constituencyId,
      wardId,
      boothId
    } = req.body;

    if (!title || !description || !assignedWorkerId) {
      return errorResponse(res, 'शीर्षक, विवरण और कार्यकर्ता पहचान (Assigned Worker) अनिवार्य हैं।', 400);
    }

    const task = new Task({
      title: title.trim(),
      description: description.trim(),
      assignedWorkerId,
      createdById: req.user._id,
      priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(priority) ? priority : 'MEDIUM',
      dueDate: dueDate ? new Date(dueDate) : undefined,
      constituencyId: constituencyId || req.user.constituencyId || null,
      wardId: wardId || null,
      boothId: boothId || null,
      status: 'PENDING'
    });

    await task.save();

    // Notify assigned worker
    await sendNotification({
      recipientId: assignedWorkerId,
      type: 'TASK',
      title: 'नया कार्य आवंटित हुआ',
      message: `कार्य: ${title.trim()}`,
      relatedResource: {
        resourceType: 'Task',
        resourceId: task._id
      }
    });

    await logAudit({
      userId: req.user._id,
      userRole: req.user.role,
      action: 'TASK_CREATE',
      resourceType: 'Task',
      resourceId: task._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: { title, assignedWorkerId }
    });

    return successResponse(res, task, 'कार्य सफलतापूर्वक आवंटित किया गया।', 201);
  } catch (error) {
    return errorResponse(res, `कार्य बनाने में त्रुटि: ${error.message}`, 500);
  }
}

async function getTasks(req, res) {
  try {
    const { status, priority, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    let filter = buildScopeFilter(req.user);

    // If booth worker, enforce only their own tasks
    if (req.user.role === 'BOOTH_WORKER') {
      filter.assignedWorkerId = req.user._id;
    }

    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    const [tasks, total] = await Promise.all([
      Task.find(filter)
        .populate('assignedWorkerId', 'fullName mobileNumber role')
        .populate('createdById', 'fullName role')
        .populate('constituencyId', 'name code')
        .populate('wardId', 'name wardNumber')
        .populate('boothId', 'name boothNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Task.countDocuments(filter)
    ]);

    return successResponse(res, {
      tasks,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    }, 'कार्य सूची।');
  } catch (error) {
    return errorResponse(res, `कार्य सूची लोड करने में त्रुटि: ${error.message}`, 500);
  }
}

async function getTaskById(req, res) {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignedWorkerId', 'fullName mobileNumber role')
      .populate('createdById', 'fullName role')
      .populate('constituencyId', 'name')
      .populate('wardId', 'name wardNumber')
      .populate('boothId', 'name boothNumber');

    if (!task) {
      return errorResponse(res, 'कार्य नहीं मिला।', 404);
    }

    if (req.user.role === 'BOOTH_WORKER' && task.assignedWorkerId._id.toString() !== req.user._id.toString()) {
      return errorResponse(res, 'इस कार्य को देखने की अनुमति नहीं है।', 403);
    }

    return successResponse(res, task, 'कार्य विवरण प्राप्त हुआ।');
  } catch (error) {
    return errorResponse(res, 'कार्य लोड करने में त्रुटि।', 500);
  }
}

async function updateTask(req, res) {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return errorResponse(res, 'कार्य नहीं मिला।', 404);
    }

    const { status, completionNotes, completionMedia } = req.body;

    const isWorker = task.assignedWorkerId.toString() === req.user._id.toString();
    const isManager = ['SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'].includes(req.user.role);

    if (!isWorker && !isManager) {
      return errorResponse(res, 'इस कार्य को अद्यतन करने की अनुमति नहीं है।', 403);
    }

    if (status) {
      task.status = status;
    }
    if (completionNotes !== undefined) {
      task.completionNotes = completionNotes.trim();
    }
    if (Array.isArray(completionMedia)) {
      task.completionMedia = completionMedia;
    }

    await task.save();

    // If completed by worker, notify creator
    if (status === 'COMPLETED' && isWorker) {
      await sendNotification({
        recipientId: task.createdById,
        type: 'TASK',
        title: 'कार्य पूर्ण हुआ',
        message: `कार्य [${task.title}] कार्यकर्ता द्वारा पूर्ण कर लिया गया है।`,
        relatedResource: {
          resourceType: 'Task',
          resourceId: task._id
        }
      });
    }

    await logAudit({
      userId: req.user._id,
      userRole: req.user.role,
      action: 'TASK_UPDATE',
      resourceType: 'Task',
      resourceId: task._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: { newStatus: status }
    });

    return successResponse(res, task, 'कार्य सफलतापूर्वक अपडेट हुआ।');
  } catch (error) {
    return errorResponse(res, `कार्य अपडेट में त्रुटि: ${error.message}`, 500);
  }
}

module.exports = {
  createTask,
  getTasks,
  getTaskById,
  updateTask
};
