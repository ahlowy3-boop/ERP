import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { MailerService } from '@nestjs-modules/mailer';

import { UserModelName } from 'src/modules/admin/users/entities/user.model';
import { RoleModelName } from 'src/modules/admin/roles/entities/role.model';
import { PermissionModelName } from 'src/modules/admin/roles/entities/permission.model';
import { RefreshTokenModelName } from 'src/modules/admin/users/entities/refresh-token.model';
import { PasswordResetTokenModelName } from 'src/modules/admin/users/entities/password-reset-token.model';
import { AuditLogService } from 'src/shared/audit-logs/audit-logs.service';
import { VendorModelName } from 'src/modules/vendors/entities/vendor.model';

const BCRYPT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;
const ACCESS_TOKEN_EXPIRY = 3600; // 1 hour
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(UserModelName) private userModel: Model<any>,
    @InjectModel(RoleModelName) private roleModel: Model<any>,
    @InjectModel(PermissionModelName) private permissionModel: Model<any>,
    @InjectModel(RefreshTokenModelName) private refreshTokenModel: Model<any>,
    @InjectModel(PasswordResetTokenModelName)
    private resetTokenModel: Model<any>,
    @InjectModel(VendorModelName) private vendorModel: Model<any>,
    @InjectConnection() private connection: Connection,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailerService: MailerService,
    private auditLogService: AuditLogService,
  ) {}

  // ─── Validate User (used by LocalStrategy) ────────────────────────────────
  async validateUser(username: string, password: string) {
    const cleanUsername = (username || '').trim();
    const user = await this.userModel
      .findOne({
        $or: [
          { username: cleanUsername },
          { email: cleanUsername.toLowerCase() },
          { username: new RegExp(`^${cleanUsername}$`, 'i') },
        ],
      })
      .populate({ path: 'roleId', model: RoleModelName })
      .lean()
      .exec();

    if (!user) {
      this.logger.warn(`Login failed: User '${cleanUsername}' not found`);
      return null;
    }

    // فحص الحساب المقفل
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      throw new HttpException(
        {
          statusCode: 423,
          message: `Account locked. Try again after ${LOCK_DURATION_MINUTES} minutes.`,
          lockedUntil: user.lockedUntil,
        },
        423,
      );
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      await this._handleFailedLogin(user);
      return null;
    }

    // إعادة تعيين محاولات الفشل عند النجاح
    await this.userModel.updateOne(
      { _id: user._id },
      { $set: { failedLoginAttempts: 0, lockedUntil: null } },
    );

    return user;
  }

  // ─── Login ────────────────────────────────────────────────────────────────
  async login(
    user: any,
    rememberMe = false,
    ipAddress?: string,
    deviceInfo?: string,
  ) {
    if (user.status !== 'Active') {
      throw new ForbiddenException(
        'Your account is not active. Please contact admin.',
      );
    }

    const role = user.roleId;
    const permissions = await this._getPermissions(role?.permissions || []);

    const accessTokenPayload = {
      sub: user._id.toString(),
      username: user.username,
      email: user.email,
      role: role?.name || 'Employee',
      permissions,
      departmentId: user.departmentId?.toString(),
    };

    const accessToken = this.jwtService.sign(accessTokenPayload, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    // توليد Refresh Token
    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(
      expiresAt.getDate() + (rememberMe ? 30 : REFRESH_TOKEN_EXPIRY_DAYS),
    );

    await this.refreshTokenModel.create({
      userId: user._id,
      tokenHash,
      deviceInfo,
      ipAddress,
      expiresAt,
    });

    // تحديث آخر دخول
    await this.userModel.updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date() } },
    );

    // تسجيل الحدث
    try {
      await this.auditLogService.log({
        userId: user._id.toString(),
        action: 'LOGIN',
        entity: 'User',
        entityId: user._id.toString(),
        details: `User logged in from IP: ${ipAddress || 'unknown'}`,
      });
    } catch {
      // audit log failure should not break login
    }

    const departmentId = user.departmentId;
    let department: any = null;
    if (departmentId) {
      department = await this.connection
        .model('Department')
        .findById(departmentId)
        .lean()
        .exec();
    }

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRY,
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        fullNameAr: user.fullNameAr,
        role: role?.name,
        permissions,
        department: department?.nameEn || department?.code,
        avatar: user.avatar,
        preferredLanguage: user.preferredLanguage,
        timezone: user.timezone,
        lastLogin: user.lastLogin,
        mustChangePassword: user.mustChangePassword ?? false, // TASK 5
      },
    };
  }

  // ─── Refresh Token ────────────────────────────────────────────────────────
  async refreshToken(rawToken: string) {
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const stored = await this.refreshTokenModel
      .findOne({ tokenHash, revoked: false })
      .exec();

    if (!stored)
      throw new UnauthorizedException('Invalid or expired refresh token');
    if (new Date(stored.expiresAt) < new Date()) {
      await this.refreshTokenModel.deleteOne({ _id: stored._id });
      throw new UnauthorizedException(
        'Refresh token expired. Please login again.',
      );
    }

    const user = await this.userModel
      .findById(stored.userId)
      .populate({ path: 'roleId', model: RoleModelName })
      .lean()
      .exec();

    if (!user || user.status !== 'Active') {
      throw new UnauthorizedException('User not found or inactive');
    }

    const role = user.roleId;
    const permissions = await this._getPermissions(role?.permissions || []);

    const accessToken = this.jwtService.sign(
      {
        sub: user._id.toString(),
        username: user.username,
        email: user.email,
        role: role?.name,
        permissions,
        departmentId: user.departmentId?.toString(),
      },
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );

    // Token Rotation: إلغاء القديم وإنشاء جديد
    await this.refreshTokenModel.deleteOne({ _id: stored._id });

    const newRawToken = crypto.randomBytes(64).toString('hex');
    const newHash = crypto
      .createHash('sha256')
      .update(newRawToken)
      .digest('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await this.refreshTokenModel.create({
      userId: user._id,
      tokenHash: newHash,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken: newRawToken,
      expiresIn: ACCESS_TOKEN_EXPIRY,
    };
  }

  // ─── Logout ───────────────────────────────────────────────────────────────
  async logout(userId: string, rawRefreshToken?: string) {
    if (rawRefreshToken) {
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawRefreshToken)
        .digest('hex');
      await this.refreshTokenModel.deleteOne({
        userId: new Types.ObjectId(userId),
        tokenHash,
      });
    } else {
      // إلغاء جميع Refresh Tokens
      await this.refreshTokenModel.deleteMany({
        userId: new Types.ObjectId(userId),
      });
    }

    try {
      await this.auditLogService.log({
        userId,
        action: 'LOGOUT',
        entity: 'User',
        entityId: userId,
        details: 'User logged out',
      });
    } catch {}

    return { message: 'Logged out successfully' };
  }

  // ─── Get Current User Profile ─────────────────────────────────────────────
  async getMe(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .populate({ path: 'roleId', model: RoleModelName })
      .populate({ path: 'departmentId', model: 'Department' })
      .lean()
      .exec();

    if (!user) throw new NotFoundException('User not found');

    const role = user.roleId;
    const permissions = await this._getPermissions(role?.permissions || []);
    const department = user.departmentId;

    return {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      fullNameAr: user.fullNameAr,
      role: role?.name,
      roleName: role?.nameAr,
      permissions,
      department: department
        ? {
            code: department.code,
            nameEn: department.nameEn,
            nameAr: department.nameAr,
          }
        : null,
      avatar: user.avatar,
      avatarUrl: user.avatarUrl,
      preferredLanguage: user.preferredLanguage,
      timezone: user.timezone,
      emailNotifications: user.emailNotifications,
      mustChangePassword: user.mustChangePassword,
      lastLogin: user.lastLogin,
    };
  }

  // ─── Change Password ──────────────────────────────────────────────────────
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) {
    if (newPassword !== confirmPassword) {
      throw new BadRequestException(
        'New password and confirmation do not match',
      );
    }

    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch)
      throw new BadRequestException('Current password is incorrect');

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.userModel.updateOne(
      { _id: userId },
      {
        $set: {
          passwordHash: newHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
        },
      },
    );

    // إلغاء جميع Refresh Tokens لإجبار إعادة الدخول
    await this.refreshTokenModel.deleteMany({
      userId: new Types.ObjectId(userId),
    });

    try {
      await this.auditLogService.log({
        userId,
        action: 'CHANGE_PASSWORD',
        entity: 'User',
        entityId: userId,
        details: 'User changed their password',
      });
    } catch {}

    return { message: 'Password changed successfully. Please login again.' };
  }

  // ─── Update Profile ───────────────────────────────────────────────────────
  async updateProfile(userId: string, updates: any) {
    const allowed = [
      'fullName',
      'fullNameAr',
      'preferredLanguage',
      'timezone',
      'emailNotifications',
    ];
    const filtered: any = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) filtered[key] = updates[key];
    }

    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: filtered }, { new: true })
      .lean()
      .exec();

    if (!user) throw new NotFoundException('User not found');
    return { message: 'Profile updated successfully', data: user };
  }

  // ─── Forgot Password ──────────────────────────────────────────────────────
  async forgotPassword(emailOrUsername: string) {
    const cleanInput = (emailOrUsername || '').trim();
    if (!cleanInput) throw new BadRequestException('Email or username is required');

    const user = await this.userModel
      .findOne({
        $or: [
          { email: new RegExp(`^${cleanInput}$`, 'i') },
          { username: cleanInput },
        ],
      })
      .lean()
      .exec();

    if (!user) {
      this.logger.warn(`ForgotPassword failed: No user found for '${cleanInput}'`);
      throw new NotFoundException(`No account found matching '${cleanInput}'`);
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Valid for 1 hour

    // Revoke previous tokens
    await this.resetTokenModel.deleteMany({ userId: user._id });

    await this.resetTokenModel.create({
      userId: user._id,
      tokenHash,
      expiresAt,
    });

    const frontendUrl =
      this.configService.get('FRONTEND_URL') || 'http://localhost:4200';
    const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;

    this.logger.log(`🔑 Password Reset Link for ${user.email}: ${resetLink}`);

    const mailUser = this.configService.get<string>('MAIL_USER');
    const mailPass = this.configService.get<string>('MAIL_PASS');
    const isMailConfigured = !!(mailUser && mailPass);

    if (isMailConfigured) {
      // Send mail asynchronously in the background so HTTP response returns INSTANTLY (< 50ms)
      this.mailerService
        .sendMail({
          to: user.email,
          subject: 'PetroFlow ERP — Password Reset Request',
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
              <h2 style="color: #1e3a8a;">PetroFlow ERP — Password Reset</h2>
              <p>Hello <strong>${user.fullName || 'User'}</strong>,</p>
              <p>You requested a password reset for your PetroFlow ERP account.</p>
              <p style="margin: 25px 0;">
                <a href="${resetLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
              </p>
              <p>This link is valid for <strong>60 minutes</strong>. If you did not request this, please ignore this email.</p>
              <hr style="border: none; border-top: 1px solid #e0e0e0; margin-top: 30px;" />
              <small style="color: #6b7280;">PetroFlow ERP System &mdash; Confidential</small>
            </div>
          `,
        })
        .then(() => this.logger.log(`📧 Email successfully sent to ${user.email}`))
        .catch((err) =>
          this.logger.warn(
            `⚠️ Could not deliver email to ${user.email}: ${err?.message || err}`,
          ),
        );
    }

    try {
      await this.auditLogService.log({
        userId: user._id.toString(),
        action: 'FORGOT_PASSWORD',
        entity: 'User',
        entityId: user._id.toString(),
        details: `Password reset requested for ${user.email}`,
      });
    } catch {}

    return {
      message: isMailConfigured
        ? `Reset link sent to ${user.email}`
        : `Reset token generated. (Mail server is not configured in Railway environment variables).`,
      mailSent: isMailConfigured,
      resetToken: rawToken,
      resetLink,
    };
  }

  // ─── Reset Password ───────────────────────────────────────────────────────
  async resetPassword(token: string, newPassword: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const resetToken = await this.resetTokenModel
      .findOne({ tokenHash, used: false })
      .exec();

    if (!resetToken)
      throw new BadRequestException('Invalid or expired reset token');
    if (new Date(resetToken.expiresAt) < new Date()) {
      await this.resetTokenModel.deleteOne({ _id: resetToken._id });
      throw new BadRequestException(
        'Reset token has expired. Please request a new one.',
      );
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.userModel.updateOne(
      { _id: resetToken.userId },
      {
        $set: {
          passwordHash: newHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
        },
      },
    );

    await this.resetTokenModel.updateOne(
      { _id: resetToken._id },
      { $set: { used: true } },
    );

    // إلغاء جميع Refresh Tokens
    await this.refreshTokenModel.deleteMany({ userId: resetToken.userId });

    try {
      await this.auditLogService.log({
        userId: resetToken.userId.toString(),
        action: 'RESET_PASSWORD',
        entity: 'User',
        entityId: resetToken.userId.toString(),
        details: 'Password reset via email token',
      });
    } catch {}

    return {
      message:
        'Password reset successfully. Please login with your new password.',
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────
  private async _getPermissions(
    permissionIds: Types.ObjectId[],
  ): Promise<string[]> {
    if (!permissionIds || permissionIds.length === 0) return [];
    const perms = await this.permissionModel
      .find({ _id: { $in: permissionIds } })
      .select('name')
      .lean()
      .exec();
    return perms.map((p: any) => p.name);
  }

  private async _handleFailedLogin(user: any) {
    const attempts = (user.failedLoginAttempts || 0) + 1;
    const updates: any = { failedLoginAttempts: attempts };

    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      const lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + LOCK_DURATION_MINUTES);
      updates.lockedUntil = lockedUntil;
      updates.failedLoginAttempts = 0;

      try {
        await this.auditLogService.log({
          userId: user._id.toString(),
          action: 'ACCOUNT_LOCKED',
          entity: 'User',
          entityId: user._id.toString(),
          details: `Account locked after ${MAX_LOGIN_ATTEMPTS} failed attempts`,
        });
      } catch {}
    }

    await this.userModel.updateOne({ _id: user._id }, { $set: updates });
  }

  // ─── Public Vendor Self-Registration ──────────────────────────────────────
  async registerVendor(dto: any) {
    // Duplicate checks
    if (dto.taxNumber) {
      const existing = await this.vendorModel.findOne({ taxNumber: dto.taxNumber });
      if (existing) throw new BadRequestException('A vendor with this tax number is already registered');
    }
    if (dto.contactEmail) {
      const existingUser = await this.userModel.findOne({
        email: dto.contactEmail.toLowerCase(),
      });
      if (existingUser) throw new BadRequestException('An account with this email already exists');
    }

    // Generate vendor code
    const year = new Date().getFullYear();
    const prefix = `VND-${year}-`;
    const last = await this.vendorModel
      .findOne({ vendorCode: { $regex: `^${prefix}` } })
      .sort({ vendorCode: -1 })
      .lean();
    let nextSeq = 1;
    if (last) {
      const parts = ((last as any).vendorCode || '').split('-');
      nextSeq = (parseInt(parts[parts.length - 1], 10) || 0) + 1;
    }
    const vendorCode = `${prefix}${String(nextSeq).padStart(4, '0')}`;

    // Create Vendor document
    const vendor = await this.vendorModel.create({
      vendorCode,
      vendorName:             dto.companyName || dto.vendorName,
      arabicName:             dto.arabicName,
      category:               dto.category,
      taxNumber:              dto.taxNumber,
      vatNumber:              dto.vatNumber,
      commercialRegistration: dto.commercialRegistration,
      country:                dto.country,
      address:                dto.address,
      contactPerson:          dto.contactPerson,
      contactEmail:           dto.contactEmail,
      contactPhone:           dto.contactPhone,
      paymentTerms:           dto.paymentTerms || 'Net 30',
      currency:               dto.currency || 'USD',
      bankAccounts:           dto.bankAccounts || [],
      contactPersons:         dto.contactPersons || [],
      status:                 'Pending',
      approvalStatus:         'Pending',
    });

    // Generate portal username and temp password
    const emailPrefix  = (dto.contactEmail || '').split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const username     = `${emailPrefix}_vendor`;
    const tempPassword = 'Welcome@2026';
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

    // Find or create Vendor role
    let vendorRole = await this.roleModel.findOne({ name: 'Vendor' });
    if (!vendorRole) {
      vendorRole = await this.roleModel.create({ name: 'Vendor', permissions: [] });
    }

    // Create User account for portal login
    await this.userModel.create({
      username,
      email:       dto.contactEmail.toLowerCase(),
      fullName:    dto.contactPerson || dto.companyName || username,
      passwordHash,
      roleId:      vendorRole._id,
      vendorId:    vendor._id,
      status:      'Active',
      mustChangePassword: true,
    });

    this.logger.log(`Vendor self-registration: ${vendorCode} → portal user: ${username}`);

    return {
      statusCode: 201,
      message: 'Vendor registration submitted successfully. Credentials created.',
      data: {
        vendorId:   vendor._id,
        vendorCode,
        credentials: {
          username,
          tempPassword,
        },
      },
    };
  }
}
