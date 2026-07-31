import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

/**
 * S3-compatible object storage (MinIO locally). Stores original JD/CV files
 * and exported CV artifacts.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET') ?? 'mfd-documents';
    this.client = new S3Client({
      endpoint: config.get<string>('S3_ENDPOINT') ?? 'http://localhost:9000',
      region: config.get<string>('S3_REGION') ?? 'us-east-1',
      credentials: {
        accessKeyId: config.get<string>('S3_ACCESS_KEY') ?? 'mfd-minio',
        secretAccessKey: config.get<string>('S3_SECRET_KEY') ?? 'mfd-minio-secret',
      },
      forcePathStyle: (config.get<string>('S3_FORCE_PATH_STYLE') ?? 'true') === 'true',
    });
  }

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Created bucket ${this.bucket}`);
      } catch (err) {
        this.logger.warn(
          `Could not verify/create bucket "${this.bucket}" — file storage may be unavailable: ${(err as Error).message}`,
        );
      }
    }
  }

  /** Store a buffer and return the object key. */
  async put(prefix: string, fileName: string, body: Buffer, contentType: string): Promise<string> {
    const safeName = fileName.replace(/[^\w.\-]+/g, '_').slice(-100);
    const key = `${prefix}/${Date.now()}-${randomBytes(4).toString('hex')}-${safeName}`;
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
    return key;
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
