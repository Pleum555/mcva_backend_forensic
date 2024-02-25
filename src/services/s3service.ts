// src/services/s3Service.ts
import { S3 } from 'aws-sdk';
import { Readable } from 'stream';
import dotenv from 'dotenv';

dotenv.config();

const s3 = new S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
});

export const uploadToS3 = async (
  file: Readable,
  bucketName: string,
  key: string
): Promise<string> => {
  const params: S3.Types.PutObjectRequest = {
    Bucket: bucketName,
    Key: key,
    Body: file,
  };

  try {
    const data = await s3.upload(params).promise();
    return data.Location || '';
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw error;
  }
};
