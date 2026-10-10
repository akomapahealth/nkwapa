import { Module, forwardRef } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { UserModule } from '../users/user.module';
import { ClinicModule } from '../clinics/clinic.module';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RbacGuard } from './guards/rbac.guard';
import { ClinicScopeGuard } from './guards/clinic-scope.guard';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    PrismaModule,
    UserModule,
    forwardRef(() => ClinicModule),
  ],
  providers: [JwtStrategy, JwtAuthGuard, RbacGuard, ClinicScopeGuard],
  controllers: [AuthController],
  exports: [JwtAuthGuard, RbacGuard, ClinicScopeGuard],
})
export class AuthModule {}
