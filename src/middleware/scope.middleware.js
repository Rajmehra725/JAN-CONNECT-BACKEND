/**
 * Scope & Geographic Access Control Utility & Middleware
 * Prevents IDOR and cross-constituency / cross-booth / cross-citizen data leakage.
 */

function buildScopeFilter(user, mapping = {}) {
  // Super admin has global scope
  if (user.role === "SUPER_ADMIN") {
    return {};
  }

  // Citizens can only view/query their own records
  if (user.role === "CITIZEN") {
    const citizenField = mapping.citizenField || "citizenId";
    return { [citizenField]: user._id };
  }

  // Booth worker is constrained to their assigned booth
  if (user.role === "BOOTH_WORKER") {
    const boothField = mapping.boothField || "boothId";
    if (user.boothId) {
      return { [boothField]: user.boothId };
    }
    // If no booth assigned, match only directly assigned items or worker ID
    const workerField = mapping.workerField || "assignedWorkerId";
    return { [workerField]: user._id };
  }

  // Politician is constrained to their assigned constituency
  if (user.role === "POLITICIAN") {
    const constituencyField = mapping.constituencyField || "constituencyId";
    if (user.constituencyId) {
      return { [constituencyField]: user.constituencyId };
    }
    return { _id: null }; // No access if unassigned
  }

  // PA / Staff is constrained to their office or constituency
  if (user.role === "PA_STAFF") {
    const officeField = mapping.officeField || "assignedOfficeId";
    const constituencyField = mapping.constituencyField || "constituencyId";
    const conditions = [];

    if (user.officeId) {
      conditions.push({ [officeField]: user.officeId });
    }
    if (user.constituencyId) {
      conditions.push({ [constituencyField]: user.constituencyId });
    }

    if (conditions.length === 1) {
      return conditions[0];
    }
    if (conditions.length > 1) {
      return { $or: conditions };
    }
    return { _id: null };
  }

  return { _id: null };
}

function isResourceInScope(user, resource, mapping = {}) {
  if (!resource || !user) return false;
  if (user.role === "SUPER_ADMIN") return true;

  if (user.role === "CITIZEN") {
    const citizenField = mapping.citizenField || "citizenId";
    const ownerId = resource[citizenField]?._id || resource[citizenField];
    return ownerId && ownerId.toString() === user._id.toString();
  }

  if (user.role === "BOOTH_WORKER") {
    const boothField = mapping.boothField || "boothId";
    const workerField = mapping.workerField || "assignedWorkerId";
    const resourceBooth = resource[boothField]?._id || resource[boothField];
    const assignedWorker = resource[workerField]?._id || resource[workerField];

    if (assignedWorker && assignedWorker.toString() === user._id.toString()) {
      return true;
    }
    if (user.boothId && resourceBooth && resourceBooth.toString() === user.boothId.toString()) {
      return true;
    }
    return false;
  }

  if (user.role === "POLITICIAN") {
    const constituencyField = mapping.constituencyField || "constituencyId";
    const resourceConst = resource[constituencyField]?._id || resource[constituencyField];
    return Boolean(
      user.constituencyId &&
      resourceConst &&
      resourceConst.toString() === user.constituencyId.toString()
    );
  }

  if (user.role === "PA_STAFF") {
    const officeField = mapping.officeField || "assignedOfficeId";
    const constituencyField = mapping.constituencyField || "constituencyId";
    const resourceOffice = resource[officeField]?._id || resource[officeField];
    const resourceConst = resource[constituencyField]?._id || resource[constituencyField];

    if (user.officeId && resourceOffice && resourceOffice.toString() === user.officeId.toString()) {
      return true;
    }
    if (user.constituencyId && resourceConst && resourceConst.toString() === user.constituencyId.toString()) {
      return true;
    }
    return false;
  }

  return false;
}

module.exports = {
  buildScopeFilter,
  isResourceInScope,
};
