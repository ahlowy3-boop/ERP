import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserModelName } from 'src/modules/admin/users/entities/user.model';
import { RoleModelName } from 'src/modules/admin/roles/entities/role.model';
import { PermissionModelName } from 'src/modules/admin/roles/entities/permission.model';

export interface JwtPayload {
  sub: string;
  username: string;
  email: string;
  role: string;
  permissions: string[];
  departmentId?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectModel(UserModelName) private userModel: Model<any>,
    @InjectModel(RoleModelName) private roleModel: Model<any>,
    @InjectModel(PermissionModelName) private permissionModel: Model<any>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') ||
        process.env.JWT_SECRET ||
        'SUlsWrJxCtmNwevnopmfPigA21Wcskdg',
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.userModel
      .findById(payload.sub)
      .populate({ path: 'roleId', model: RoleModelName })
      .lean()
      .exec();

    if (!user || user.status !== 'Active') {
      throw new UnauthorizedException('Account is inactive or not found');
    }

    // جلب الصلاحيات الفعلية من قاعدة البيانات عبر الدور
    const role = user.roleId;
    let permissions: string[] = [];

    if (role && role.permissions && role.permissions.length > 0) {
      const perms = await this.permissionModel
        .find({ _id: { $in: role.permissions } })
        .select('name')
        .lean()
        .exec();
      permissions = perms.map((p: any) => p.name);
    }

    return {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: role?.name || payload.role,
      permissions,
      departmentId: user.departmentId?.toString(),
    };
  }
}
