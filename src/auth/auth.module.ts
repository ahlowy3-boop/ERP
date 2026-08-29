import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { join } from 'path';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';

import { UserModel } from 'src/modules/admin/users/entities/user.model';
import { RoleModel } from 'src/modules/admin/roles/entities/role.model';
import { PermissionModel } from 'src/modules/admin/roles/entities/permission.model';
import { RefreshTokenModel } from 'src/modules/admin/users/entities/refresh-token.model';
import { PasswordResetTokenModel } from 'src/modules/admin/users/entities/password-reset-token.model';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('JWT_SECRET') ||
          process.env.JWT_SECRET ||
          'SUlsWrJxCtmNwevnopmfPigA21Wcskdg',
        signOptions: { expiresIn: '1h' },
      }),
    }),

    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const rawPass = config.get<string>('MAIL_PASS') || '';
        const mailPass = rawPass.replace(/\s+/g, ''); // Remove spaces from App Password if present
        const mailUser = config.get<string>('MAIL_USER') || '';
        const mailHost = config.get<string>('MAIL_HOST') || 'smtp.gmail.com';
        const mailPort = Number(config.get('MAIL_PORT') || 587);

        return {
          transport: {
            host: mailHost,
            port: mailPort,
            secure: mailPort === 465,
            auth: mailUser && mailPass ? { user: mailUser, pass: mailPass } : undefined,
            connectionTimeout: 8000,
            socketTimeout: 8000,
          },
          defaults: {
            from: config.get<string>('MAIL_FROM') || `"PetroFlow ERP" <${mailUser || 'noreply@petroflow.com'}>`,
          },
        };
      },
    }),

    // Models
    UserModel,
    RoleModel,
    PermissionModel,
    RefreshTokenModel,
    PasswordResetTokenModel,
  ],
  providers: [AuthService, JwtStrategy, LocalStrategy],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, PassportModule, MailerModule],
})
export class AuthModule {}
