const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../config/config');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization ID is required'],
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: [false, 'Role ID is required'],
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'pending', 'suspended'],
      default: 'pending',
    },
    avatar: {
      type: String,
      default: null,
    },
    phone: {
      type: String,
      default: null,
    },
    timezone: {
      type: String,
      default: 'UTC',
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    lastLoginIp: {
      type: String,
      default: null,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetToken: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
      select: false,
    },
    refreshTokens: [
      {
        token: { type: String, select: false },
        device: { type: String },
        createdAt: { type: Date, default: Date.now },
        expiresAt: { type: Date },
      },
    ],
    role: {
      type: String,
      enum: ['admin', 'hr', 'manager', 'employee'],
      default: 'employee',
    },
    // ✅ NEW PROFILE FIELDS
    employeeId: { type: String, unique: true, sparse: true },
    birthday: { type: Date },
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    address: { type: String },
    emergencyContact: {
      name: { type: String },
      relation: { type: String },
      phone: { type: String },
    },
    department: { type: String },
    joiningDate: { type: Date },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    workLocation: { type: String },
    employmentType: { type: String, enum: ['Full-time', 'Part-time', 'Contract', 'Intern'] },
    profileImage: { type: String },
    skills: [{ type: String }],
    preferences: {
      notifications: { type: Boolean, default: true },
      emailAlerts: { type: Boolean, default: true },
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      language: { type: String, default: 'en' },
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    inviteAcceptedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.passwordHash;
        delete ret.refreshTokens;
        delete ret.emailVerificationToken;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpires;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
// userSchema.index({ email: 1 }); // redundant with unique: true
userSchema.index({ organizationId: 1 });
userSchema.index({ organizationId: 1, status: 1 });
userSchema.index({ organizationId: 1, roleId: 1 });

// ─── Pre-save: hash password ──────────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, config.bcrypt.saltRounds);
  next();
});

// ─── Instance Methods ─────────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

userSchema.methods.addRefreshToken = function (token, device, expiresAt) {
  // Keep max 5 refresh tokens per user (device management)
  if (this.refreshTokens.length >= 5) {
    this.refreshTokens.shift();
  }
  this.refreshTokens.push({ token, device, expiresAt });
};

userSchema.methods.removeRefreshToken = function (token) {
  this.refreshTokens = this.refreshTokens.filter((t) => t.token !== token);
};

userSchema.methods.removeAllRefreshTokens = function () {
  this.refreshTokens = [];
};

userSchema.methods.isRefreshTokenValid = function (token) {
  const found = this.refreshTokens.find((t) => t.token === token);
  if (!found) return false;
  if (found.expiresAt && new Date() > found.expiresAt) return false;
  return true;
};

// ─── Virtuals ─────────────────────────────────────────────────────────────────
userSchema.virtual('fullProfile', {
  ref: 'Role',
  localField: 'roleId',
  foreignField: '_id',
  justOne: true,
});

module.exports = mongoose.model('User', userSchema);
