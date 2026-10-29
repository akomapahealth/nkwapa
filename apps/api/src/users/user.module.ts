import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { KeycloakModule } from '../keycloak/keycloak.module';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';
import { UserProfileService } from './user-profile.service';

@Module({
  imports: [PrismaModule, KeycloakModule],
  providers: [UserRepository, UserService, UserProfileService],
  exports: [UserService, UserRepository, UserProfileService],
})
export class UserModule {}
