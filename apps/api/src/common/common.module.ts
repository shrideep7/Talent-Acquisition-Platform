import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { CryptoService } from './crypto.service';
import { PrismaService } from './prisma.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [PrismaService, CryptoService, StorageService, AuditService],
  exports: [PrismaService, CryptoService, StorageService, AuditService],
})
export class CommonModule {}
