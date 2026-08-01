import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret && process.env.NODE_ENV === 'production') {
          // Fail fast: a known fallback secret would let anyone forge tokens.
          throw new Error('JWT_SECRET must be set in production — refusing to start');
        }
        return {
          secret: secret ?? 'mfd-dev-secret-do-not-use-in-prod',
          signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '12h' },
        };
      },
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [
    AuthService,
    UsersService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, UsersService],
})
export class AuthModule {}
