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
  fileContent: JSON,
  // jsonObject: JSON,
  // bucketName: string,
  fileName: string
): Promise<string> => {
  
  const params: S3.Types.PutObjectRequest = {
    Bucket: process.env.BUCKET_NAME ?? 'test-forensic-backend',
    // Bucket: bucketName,
    Key: fileName,
    // Body: jsonObject,
    Body: Readable.from(JSON.stringify(fileContent)),
  };

  try {
    const data = await s3.upload(params).promise();
    return data.Location || '';
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw error;
  }
};

export const readFileFromS3 = async (
  fileName: string
): Promise<JSON> => {
  const params: S3.Types.GetObjectRequest = {
    Bucket: process.env.BUCKET_NAME ?? 'test-forensic-backend',
    Key: fileName,
  };

  try {
    const data = await s3.getObject(params).promise();
    return data.Body as JSON;
  } catch (error) {
    console.error('Error reading file from S3:', error);
    throw error;
  }
};

// export const forensic = async (
//   fileName: string
// ):Promise<JSON> => {
//   return {test: ''} as JSON;
// };