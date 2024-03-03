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
  test_Session: string, // Change to lowercase 'string'
  student_ID: string, // Change to lowercase 'string'
  log: JSON,
): Promise<string> => {

  try {
    // Attempt to read the file from S3
    let existingLog: JSON[] | undefined;
    try {
      existingLog = await readFileFromS3(test_Session, student_ID);
    } catch (readError) {
      // Handle the NoSuchKey error or log it if needed
      console.error('Error reading file from S3:', readError);
    }


    // If the file exists, update the log list
    if (existingLog && Array.isArray(existingLog)) {
      existingLog.push(log);
    } else {
      // If the file doesn't exist or has invalid content, create a new list with the new log
      existingLog = [log];
    }

    const params: S3.Types.PutObjectRequest = {
      Bucket: process.env.BUCKET_NAME ?? 'test-forensic-backend',
      Key: `${test_Session}/${student_ID}`,
      Body: Readable.from(JSON.stringify(existingLog)),
    };

    const data = await s3.upload(params).promise();
    return data.Location || '';
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw error;
  }
};

export const readFileFromS3 = async (
  test_Session: string,
  student_ID: string,
): Promise<JSON[] | undefined> => {
  const params: S3.Types.GetObjectRequest = {
    Bucket: process.env.BUCKET_NAME ?? 'test-forensic-backend',
    Key: `${test_Session}/${student_ID}`,
  };

  try {
    const data = await s3.getObject(params).promise();
    const jsonString = data.Body?.toString('utf-8');

    if (!jsonString) {
      throw new Error('Failed to convert Buffer to JSON string');
    }

    return JSON.parse(jsonString) as JSON[];
  } catch (error: any) {
    if (error.code === 'NoSuchKey') {
      console.error('File not found on S3:', error);
      return undefined; // Return undefined when the key is not found
    } else {
      console.error('Error reading file from S3:', error);
      throw error; // Rethrow other errors
    }
  }
};
