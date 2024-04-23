// src/services/s3Service.ts
import { S3 } from 'aws-sdk';
import { Readable } from 'stream';
import dotenv from 'dotenv';

interface InitialLog {
  Status: string;
  Timestamp: string;
}

interface Activity {
  Status: string;
  Timestamp: string;
  IP: string; // Assuming IP is a string
}

interface Suggestion {
  DifferentIP: number;
}

interface LogEntry {
  Name: string;
  // Surname: string;
  Activities: Activity[];
  Suggestion?: Suggestion;
}

interface LogResponse {
  Test_Session: string;
  Student_ID: string;
  Name: string;
  // Surname: string;
  Activities: Activity[];
  Suggestion?: Suggestion;
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

    // console.log(keys)
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
  // Surname: string,
  log: InitialLog,
  IP: string | undefined | null,
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
    // Create a new object by merging log and IP
    const newActivity = {
      ...log,
      IP: IP || 'N/A',
    };
    
    let LogData : LogEntry;

    // If the file exists, update the log list
    // if (existingLog && Array.isArray(existingLog)) {
    if (existingLog) {
      const {Test_Session, Student_ID, ...Data} = existingLog
      LogData = Data
      LogData.Activities.push(newActivity)

    } else {
      // If the file doesn't exist or has invalid content, create a new list with the new log
      LogData = {
        Name: Name,
        // Surname: Surname,
        Activities: [newActivity],
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

const analyzeIPsForTestSession = async (Test_Session: string, Student_ID: string): Promise<any> => {
  try {
    // Retrieve all activity logs for the given test session
    const activityLogs = await getAllActivityByTestSessionAndStudentID(Test_Session, Student_ID);
    // Check if activityLogs is undefined
    if (!activityLogs) {
      throw 'Activity logs not found.'
    }

    // Extract unique IP addresses from the activity logs and update the logs
    const uniqueIPs: Set<string> = new Set();
    activityLogs?.Activities.forEach((activity) => {
      const ip = activity.IP;
      if (ip && ip !== 'N/A') {
        uniqueIPs.add(ip);
      }
    });
    
    // Add suggestion field to the log entry
    activityLogs.Suggestion = { DifferentIP : uniqueIPs.size}; // Assigning the count of unique IPs to the Suggestion field

    // Update activity logs in S3
    const params: S3.Types.PutObjectRequest = {
      Bucket: process.env.BUCKET_NAME ?? '',
      Key: `${Test_Session}/${Student_ID}`,
      Body: Readable.from(JSON.stringify(activityLogs)),
    };
    const data = await s3.upload(params).promise();
    return data.Location || '';
  
  } catch (error) {
    console.error('Error analyzing IPs:', error);
    throw error;
  }
};

export const s3service = {
  uploadToS3, 
  getAllActivityByTestSessionAndStudentID,
  getAllActivityByTestSession,
  analyzeIPsForTestSession
}