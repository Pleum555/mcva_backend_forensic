// src/services/s3Service.ts
import { S3 } from 'aws-sdk';
import { Readable } from 'stream';
import dotenv from 'dotenv';

interface LogEntry {
  Name: string;
  Surname: string;
  Activities: JSON[];
}

interface LogResponse {
  Test_Session: string;
  Student_ID: string;
  Name: string;
  Surname: string;
  Activities: JSON[];
}

dotenv.config();

const s3 = new S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
});

const getAllActivityByTestSessionAndStudentID = async (
  Test_Session: string,
  Student_ID: string,
): Promise< LogResponse | undefined> => {
  const params: S3.Types.GetObjectRequest = {
    Bucket: process.env.BUCKET_NAME ?? '',
    Key: `${Test_Session}/${Student_ID}`,
  };

  try {
    const data = await s3.getObject(params).promise();
    const jsonString = data.Body?.toString('utf-8');

    if (!jsonString) {
      throw new Error('Failed to convert Buffer to JSON string');
    }
    let response: LogResponse;
    response = JSON.parse(jsonString)
    response.Test_Session = Test_Session
    response.Student_ID = Student_ID

    return response;
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

const getAllActivityByTestSession = async (
  Test_Session: string,
): Promise<LogResponse[]> => {
  const params: S3.Types.ListObjectsV2Request = {
    Bucket: process.env.BUCKET_NAME ?? '',
    Prefix: `${Test_Session}/`,
  };

  try {
    const data = await s3.listObjectsV2(params).promise();
    const keys = data.Contents?.map((object) => object.Key || '') || [];

    console.log(keys)
    const logEntries: LogResponse[] = [];

    // Loop through each key and retrieve the content
    for (const key of keys) {
      const [,studentId] = key.split('/'); // Assuming the format is "Test_Session/Student_ID"
      try {
        const logEntry = await getAllActivityByTestSessionAndStudentID(Test_Session, studentId);

        if (logEntry) {
          logEntries.push(logEntry);
        }
      } catch (readError) {
        // Handle errors if needed
        console.error(`Error reading file for key ${key} from S3:`, readError);
      }
    }

    return logEntries;
  } catch (error) {
    console.error('Error listing keys from S3:', error);
    throw error;
  }
};


const uploadToS3 = async (
  Test_Session: string,
  Student_ID: string,
  Name: string,
  Surname: string,
  log: JSON,
): Promise<string> => {

  try {
    // Attempt to read the file from S3
    let existingLog: LogResponse | undefined;
    try {
      existingLog = await getAllActivityByTestSessionAndStudentID(Test_Session, Student_ID);
    } catch (readError) {
      // Handle the NoSuchKey error or log it if needed
      console.error('Error reading file from S3:', readError);
    }

    let LogData : LogEntry;

    // If the file exists, update the log list
    // if (existingLog && Array.isArray(existingLog)) {
    if (existingLog) {
      const {Test_Session, Student_ID, ...Data} = existingLog
      LogData = Data
      LogData.Activities.push(log);
    } else {
      // If the file doesn't exist or has invalid content, create a new list with the new log
      LogData = {
        Name: Name,
        Surname: Surname,
        Activities: [log]
      };
    }

    const params: S3.Types.PutObjectRequest = {
      Bucket: process.env.BUCKET_NAME ?? '',
      Key: `${Test_Session}/${Student_ID}`,
      Body: Readable.from(JSON.stringify(LogData)),
    };

    const data = await s3.upload(params).promise();
    return data.Location || '';
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw error;
  }
};



export const s3service = {
  uploadToS3, 
  getAllActivityByTestSessionAndStudentID,
  getAllActivityByTestSession
}