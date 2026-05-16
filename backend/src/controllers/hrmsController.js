'use strict';

const HrEmployee = require('../models/HrEmployee');
const Department = require('../models/Department');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const User = require('../models/User');
const Role = require('../models/Role');
const bcrypt = require('bcryptjs');
const { logActivity } = require('../services/activityService');
const { sendNotification } = require('../services/notificationService');
const { errorResponse, successResponse } = require('../utils/helpers');
const { enforceAutoLogout } = require('../utils/attendanceHelper');

// ─── HRMS Stats ───────────────────────────────────────────────────────────────

exports.getHrmsStats = async (req, res) => {
  try {
    // FORCE FETCH ALL: No filters as per instruction to debug missing users
    const employees = await User.find({}).populate('roleId').lean();
    
    // Attendance-based status check
    const userIds = employees.map(e => e._id);
    const usersWithAttendance = await Attendance.find({ user: { $in: userIds } }).distinct('user');
    const attendanceSet = new Set(usersWithAttendance.map(id => id.toString()));

    const activeEmployeesCount = employees.filter(e => attendanceSet.has(e._id.toString())).length;
    const departments = await Department.find({}).lean();
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const attendanceToday = await Attendance.find({
      date: { $gte: todayStart }
    }).lean();

    // Process employees with fallbacks and dynamic status
    const processedEmployees = employees.map(e => {
        let roleVal = e.role || (e.roleId ? (e.roleId.displayName || e.roleId.name) : null) || e.designation || e.position;
        return {
            ...e,
            department: e.department || '—',
            status: attendanceSet.has(e._id.toString()) ? 'Active' : 'Inactive',
            role: roleVal || '—',
            joiningDate: e.joiningDate || e.createdAt || new Date()
        };
    });

    console.log(`[HRMS STATS] FORCE FETCHED: ${employees.length} users. ${activeEmployeesCount} active by attendance.`);

    return res.json({
      totalWorkforce: employees.length,
      activeDeployment: activeEmployeesCount,
      departmentsCount: departments.length,
      attendanceToday: attendanceToday.length,
      employees: processedEmployees
    });
  } catch (err) {
    console.error("[HRMS STATS ERROR]:", err);
    return res.status(500).json({ message: err.message });
  }
};

// ─── Employees ────────────────────────────────────────────────────────────────

exports.getEmployees = async (req, res) => {
  try {
    // FORCE FETCH ALL: Remove all filters, orgId isolation, search, status, and department constraints
    console.log("[HRMS] PERFORMING FORCE FETCH FROM DATABASE: User.find({}).populate('roleId')");
    
    const employees = await User.find({}).populate('roleId').sort({ createdAt: -1 }).lean();
    
    // Attendance-based status calculation
    const userIds = employees.map(e => e._id);
    const usersWithAttendance = await Attendance.find({ user: { $in: userIds } }).distinct('user');
    const attendanceSet = new Set(usersWithAttendance.map(id => id.toString()));

    console.log(`[HRMS] RAW QUERY SUCCESS: Found ${employees.length} users. ${attendanceSet.size} have attendance.`);

    // Map with absolute fallbacks as per requirement
    const unified = employees.map(e => {
        // Resolve role: check string role, then populated roleId, then designation/position
        let roleVal = e.role || (e.roleId ? (e.roleId.displayName || e.roleId.name) : null) || e.designation || e.position;
        
        return {
            ...e,
            role: roleVal || "—",
            department: e.department || "—",
            // ACTIVE if at least one attendance record exists, else INACTIVE
            status: attendanceSet.has(e._id.toString()) ? "Active" : "Inactive",
            joiningDate: e.joiningDate || e.createdAt || new Date()
        };
    });

    return successResponse(res, unified, 'Employees fetched.');
  } catch (err) {
    console.error("[HRMS] getEmployees Error:", err);
    return errorResponse(res, err.message, 500);
  }
};

exports.createEmployee = async (req, res) => {
  try {
    const { name, email, role } = req.body;
    const { organizationId, userId: adminId } = req.user;
    
    if (!name || !email) return errorResponse(res, 'Name and email are required.', 400);

    const exists = await User.findOne({ email });
    if (exists) return errorResponse(res, 'User with this email already exists', 409);

    // Find or Create the correct roleId from DB
    const roleName = (role || 'employee').toLowerCase();
    let dbRole = await Role.findOne({ name: roleName, organizationId });
    if (!dbRole) {
        // Fallback or create default role
        dbRole = await Role.findOne({ name: 'employee', organizationId });
        if (!dbRole) {
            dbRole = await Role.create({
                name: 'employee',
                displayName: 'Employee',
                organizationId,
                permissions: [],
                isSystemRole: true,
                level: 10
            });
        }
    }

    // 1. Create User
    const tempPassword = 'User@123'; // Default password for new members
    const newUser = await User.create({
      name,
      email,
      passwordHash: tempPassword, // Hashed in pre-save hook
      organizationId,
      roleId: dbRole._id,
      role: dbRole.name,
      status: 'active',
    });

    // 2. Create Employee record
    const employee = await HrEmployee.create({
      organizationId,
      userId: newUser._id, 
      name,
      email,
      role: dbRole.name,
      status: 'active',
      department: 'General',
      joiningDate: new Date()
    });

    await logActivity({
      userId: adminId,
      organizationId,
      action: 'employee:added',
      entityType: 'user',
      entityId: newUser._id,
      description: `New employee added: ${name} (${email})`
    });

    return successResponse(res, { employee, userId: newUser._id }, 'Employee successfully created.', 201);
  } catch (err) {
    console.error("[HRMS] createEmployee Error:", err);
    return errorResponse(res, err.message, 500);
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const employee = await User.findOneAndUpdate(
      { _id: req.params.id, ...req.orgFilter },
      req.body,
      { new: true, runValidators: true }
    ).lean();
    
    if (!employee) return errorResponse(res, 'Employee identity not found.', 404);
    
    // Also update HrEmployee if it exists (legacy sync)
    await HrEmployee.findOneAndUpdate({ userId: req.params.id }, req.body);

    return successResponse(res, employee, 'Employee updated.');
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    const employee = await User.findOneAndDelete({ _id: req.params.id, ...req.orgFilter });
    if (!employee) return errorResponse(res, 'Employee identity not found.', 404);
    
    // Also delete legacy HrEmployee record
    await HrEmployee.findOneAndDelete({ userId: req.params.id });

    return successResponse(res, 'Employee identity purged.');
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
};

// ─── Departments ──────────────────────────────────────────────────────────────

exports.getDepartments = async (req, res) => {
  try {
    const depts = await Department.find({ ...req.orgFilter }).sort({ name: 1 }).lean();
    return successResponse(res, depts, 'Departments fetched.');
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
};

exports.createDepartment = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return errorResponse(res, 'Department name is required.', 400);
    const dept = await Department.create({ 
      organizationId: req.user.organizationId, 
      name, 
      description: description || '' 
    });
    return successResponse(res, dept, 'Department created.', 201);
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
};

exports.updateDepartment = async (req, res) => {
  try {
    const dept = await Department.findOneAndUpdate(
      { _id: req.params.id, ...req.orgFilter },
      req.body,
      { new: true }
    );
    if (!dept) return errorResponse(res, 'Department not found.', 404);
    return successResponse(res, dept, 'Department updated.');
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
};

exports.deleteDepartment = async (req, res) => {
  try {
    const dept = await Department.findOneAndDelete({ _id: req.params.id, ...req.orgFilter });
    if (!dept) return errorResponse(res, 'Department not found.', 404);
    return successResponse(res, 'Department deleted.');
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
};

// ─── Attendance (Admin/HR view) ───────────────────────────────────────────────────

exports.getAttendance = async (req, res) => {
  try {
    const { date, employeeId, month } = req.query;
    const { getISTDayStart, getISTDayEnd } = require('../utils/istTime');

    // If a specific employeeId or month is requested, use the original filtered logic
    if (employeeId || month) {
      const filter = { ...req.orgFilter };

      if (employeeId) {
        const empRecord = await HrEmployee.findById(employeeId).lean();
        filter.user = empRecord ? empRecord.userId : employeeId;
      }

      if (month) {
        const [year, m] = month.split('-').map(Number);
        const start = new Date(year, m - 1, 1);
        const end = new Date(year, m, 1);
        filter.date = { $gte: start, $lt: end };
      }

      const records = await Attendance.find(filter)
        .populate('user', 'name email')
        .sort({ date: -1 })
        .lean();

      const processedRecords = await Promise.all(records.map(r => enforceAutoLogout(r)));
      return successResponse(res, processedRecords, 'Attendance fetched.');
    }

    // ── Default: Today's attendance for ALL employees in org ──────────────────
    // Compute IST-aware today's boundaries
    const now = new Date();
    const todayStart = getISTDayStart(now);
    const todayEnd   = getISTDayEnd(now);

    // Allow override with ?date= param
    let queryStart = todayStart;
    let queryEnd   = todayEnd;
    if (date) {
      const d = new Date(date);
      queryStart = getISTDayStart(d);
      queryEnd   = getISTDayEnd(d);
    }

    console.log("[HRMS] Attendance query: today IST range", queryStart.toISOString(), "→", queryEnd.toISOString());

    // 1. Fetch today's attendance records (all employees in org)
    const records = await Attendance.find({
      ...req.orgFilter,
      date: { $gte: queryStart, $lte: queryEnd }
    })
      .populate('user', 'name email')
      .lean();

    // Apply auto-logout logic
    const processedRecords = await Promise.all(records.map(r => enforceAutoLogout(r)));

    // Build a map of userId -> record for quick lookup
    const attendedUserIds = new Set(
      processedRecords.map(r => (r.user?._id || r.user)?.toString())
    );

    // 2. Fetch ALL users to find absent employees (same scope as getEmployees)
    const allUsers = await User.find({}).select('name email').lean();

    // 3. Build virtual "Absent" entries for employees who haven't clocked in today
    const absentEntries = allUsers
      .filter(u => !attendedUserIds.has(u._id.toString()))
      .map(u => ({
        _id: null,
        user: { _id: u._id, name: u.name, email: u.email },
        date: queryStart,
        checkIn: null,
        checkOut: null,
        status: 'Absent',
        workingHours: 0,
      }));

    // 4. Merge: real records first, then absent
    const unified = [...processedRecords, ...absentEntries];

    return successResponse(res, unified, 'Attendance fetched.');
  } catch (err) {
    console.error("[HRMS] getAttendance Error:", err);
    return errorResponse(res, err.message, 500);
  }
};

// ─── Leaves (Admin/HR view) ──────────────────────────────────────────────────────

exports.getLeaves = async (req, res) => {
  try {
    const { status, employeeId } = req.query;
    const filter = { ...req.orgFilter };
    if (status) filter.status = status;
    
    if (employeeId) {
      const empRecord = await HrEmployee.findById(employeeId).lean();
      filter.user = empRecord ? empRecord.userId : employeeId;
    }

    const leaves = await Leave.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return successResponse(res, leaves, 'Leaves fetched.');
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
};

exports.updateLeaveStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    if (!['Approved', 'Rejected', 'Pending'].includes(status?.charAt(0).toUpperCase() + status?.slice(1).toLowerCase())) {
        return errorResponse(res, 'Invalid status.', 400);
    }
    const normalizedStatus = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
    
    const leave = await Leave.findOneAndUpdate(
      { _id: req.params.id, ...req.orgFilter },
      {
        status: normalizedStatus,
        approvedBy: req.user.userId,
        approvedAt: new Date(),
        rejectionReason: rejectionReason || null,
      },
      { new: true }
    ).populate('user', 'name email');
    
    if (!leave) return errorResponse(res, 'Leave request not found.', 404);

    await logActivity({
      userId: req.user.userId,
      organizationId: req.user.organizationId,
      action: `leave:${normalizedStatus.toLowerCase()}`,
      entityType: 'leave',
      entityId: leave._id,
      description: `Leave ${normalizedStatus} for user: ${leave.user?.name}`
    });

    await sendNotification({
      userId: leave.user?._id || leave.user,
      organizationId: req.user.organizationId,
      title: `Leave ${normalizedStatus}`,
      message: `Your leave request for ${leave.leaveType} has been ${normalizedStatus.toLowerCase()}.`,
      type: normalizedStatus === 'Approved' ? 'leave_approved' : 'leave_rejected',
      link: { type: 'leave', id: leave._id }
    });

    return successResponse(res, leave, `Leave ${normalizedStatus}.`);
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
};

exports.approveLeave = async (req, res) => {
    req.body.status = 'Approved';
    return exports.updateLeaveStatus(req, res);
};

exports.rejectLeave = async (req, res) => {
    req.body.status = 'Rejected';
    return exports.updateLeaveStatus(req, res);
};
