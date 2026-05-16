'use strict';
const User = require('../models/User');
const Project = require('../models/Project');
const Task = require('../models/Task');
const HrEmployee = require('../models/HrEmployee');
const Attendance = require('../models/Attendance');
const { successResponse, errorResponse } = require('../utils/helpers');

// GET /api/admin/users
const getUsers = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const filter = { organizationId };
    if (req.query.status) filter.status = req.query.status;

    // Fetch ALL users — no skip/limit so no pagination cuts off results
    const users = await User.find(filter)
      .select('-passwordHash -refreshTokenHash')
      .sort({ createdAt: -1 })
      .populate('roleId', 'name displayName')
      .lean();

    // Determine which users have ever clocked in (at least one attendance record)
    const userIds = users.map(u => u._id);
    const usersWithAttendance = await Attendance.find({ user: { $in: userIds } }).distinct('user');
    const attendanceSet = new Set(usersWithAttendance.map(id => id.toString()));

    // Compute effective status:
    //   - If DB status is 'inactive' or 'suspended' → keep it (manual disable preserved)
    //   - If DB status is 'active' but no attendance record ever → show as 'inactive'
    //   - If DB status is 'active' and has attendance → show as 'active'
    const enrichedUsers = users.map(u => {
      let effectiveStatus = u.status;
      if (u.status === 'active' && !attendanceSet.has(u._id.toString())) {
        effectiveStatus = 'inactive';
      }
      return { ...u, status: effectiveStatus };
    });

    return successResponse(res, enrichedUsers);
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
};

// POST /api/admin/users
const createUser = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { name, email, password, role } = req.body;

    const exists = await User.findOne({ email, organizationId });
    if (exists) return errorResponse(res, 'User with this email already exists', 409);

    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password || 'TempPass@123', 12);

    const Role = require('../models/Role');
    const roleName = (role || 'employee').toLowerCase();
    let dbRole = await Role.findOne({ name: roleName, organizationId });
    
    if (!dbRole) {
      // Fallback to any employee role in org
      dbRole = await Role.findOne({ name: 'employee', organizationId });
    }

    // ✅ STEP 1: Create User
    const user = await User.create({
      name,
      email,
      passwordHash: hash,
      organizationId,
      roleId: dbRole?._id || null,
      role: dbRole?.name || 'employee',
      status: 'active',
    });

    // ✅ STEP 2: Create Employee (LINK)
    await HrEmployee.create({
      organizationId,
      userId: user._id,   // 🔥 LINK
      name,
      email,
      role: dbRole?.name || 'employee',
      department: 'General',
      status: 'active'
    });

    const safe = user.toObject();
    delete safe.passwordHash;

    return successResponse(res, safe, 'User created', 201);

  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
};
// PUT /api/admin/users/:id
const updateUser = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const user = await User.findOne({ _id: req.params.id, organizationId });
    if (!user) return errorResponse(res, 'User not found', 404);

    const { name, email, status, roleId } = req.body;
    if (name) user.name = name;
    if (email) user.email = email;
    if (status) user.status = status;
    if (roleId) user.roleId = roleId;

    await user.save();
    const safe = user.toObject();
    delete safe.passwordHash;
    return successResponse(res, safe, 'User updated');
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
};

// DELETE /api/admin/users/:id
const deleteUser = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const user = await User.findOneAndDelete({ _id: req.params.id, organizationId });
    if (!user) return errorResponse(res, 'User not found', 404);
    return successResponse(res, null, 'User deleted');
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
};

// GET /api/users/team
const getTeam = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const users = await User.find({ organizationId, status: 'active' })
      .select('name email status')
      .populate('roleId', 'displayName name')
      .lean();

    return successResponse(
      res,
      users.map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        role: u.roleId?.displayName || u.roleId?.name || 'Member',
      }))
    );
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
};

module.exports = { getUsers, createUser, updateUser, deleteUser, getTeam };
