// src/services/s3Service.ts
import { S3 } from 'aws-sdk';
import { Readable } from 'stream';
import dotenv from 'dotenv';
import { float } from 'aws-sdk/clients/cloudfront';

dotenv.config();

const s3 = new S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
});

interface Activity {
  Status: string;
  Timestamp: string;
  IP: string; // Assuming IP is a string
}

interface LogEntry {
  Test_Session?: string;
  Student_ID: string;
  Name: string;
  Activities: Activity[];
}

enum SuggestType {
  DifferentIP = 'DifferentIP',
  Screen_Activity = 'Screen_Activity',
  Short_Interval_between_Answers = 'Short_Interval_between_Answers',
  Rapid_Response_Submission = 'Rapid_Response_Submission',
}

interface SuggestEntry {
  Test_Session?: string;
  Student_ID: string;
  Name: string;
  Type: SuggestType,
  Description: string,
}

interface PaginationResult<T> {
  data: T[];
  countAllPages: number;
  currentPage: number;
}

// ------------------------ Private Function ------------------------ //
const uploadToS3 = async( Key: string, LogData: any ) :Promise<any> => {
  try {
    const params: S3.Types.PutObjectRequest = {
      Bucket: process.env.BUCKET_NAME ?? '',
      Key: Key,
      Body: Readable.from(JSON.stringify(LogData)),
    };

    const data = await s3.upload(params).promise();
    return data.Location || '';
  } catch (error) {
    throw error;
  }
}

const getDataFromS3 = async(Key: string) :Promise<any> => {
  try {
    const params: S3.Types.GetObjectRequest = {
      Bucket: process.env.BUCKET_NAME ?? '',
      Key: Key,
    };

    const data = await s3.getObject(params).promise();

    return data;
  } catch(error) {
    throw error;
  }
}

const uploadSuggestion = async(Test_Session: string, Student_ID, Suggest: SuggestEntry) : Promise<any> => {
  try{
  const params: S3.Types.ListObjectsV2Request = {
    Bucket: process.env.BUCKET_NAME ?? '',
    Prefix: `${Test_Session}/suggestions/${Student_ID}/`,
  };
  const data = await s3.listObjectsV2(params).promise();
  return await uploadToS3(`${Test_Session}/suggestions/${Student_ID}/suggest_${(data.KeyCount || 0) + 1}`, Suggest)

  } catch (error) {
    console.log(error)
    throw error;
  }
}

const cleanSuggestions = async (Test_Session: string, Student_ID: string): Promise<void> => {
  try {
    const params: AWS.S3.Types.ListObjectsV2Request = {
      Bucket: process.env.BUCKET_NAME ?? '',
      Prefix: `${Test_Session}/suggestions/${Student_ID}/`,
    };
    const data = await s3.listObjectsV2(params).promise();
    
    if (data.Contents && data.Contents.length > 0) {
      const objectsToDelete = data.Contents.map(obj => ({ Key: obj.Key }));
      
      const deleteParams: AWS.S3.Types.DeleteObjectsRequest = {
        Bucket: process.env.BUCKET_NAME ?? '',
        Delete: {
          Objects: objectsToDelete,
        },
      };
      
      await s3.deleteObjects(deleteParams).promise();
    }
    
    // console.log(`Suggestion data for Test_Session ${Test_Session} cleaned successfully.`);
  } catch (error) {
    console.error('Error cleaning suggestion data:', error);
    throw error;
  }
};

// ------------------------ Suggest Function ------------------------ //
const checkDifferent_IP = (Log: LogEntry) :void => {
  // Process Analyze
  const uniqueIPs: Set<string> = new Set();
  Log.Activities.forEach((activity) => {
    const ip = activity.IP;
    if (ip && ip !== 'N/A') {
      uniqueIPs.add(ip);
    }
  });
  
  // Check Fore Different IPs
  if(uniqueIPs.size > 1) {
    let suggestion: SuggestEntry = {
      // Test_Session: Log.Test_Session,
      Student_ID: Log.Student_ID,
      Name: Log.Name,
      Type: SuggestType.DifferentIP,
      Description: `Student have ${uniqueIPs.size} IPs`,
    };
    uploadSuggestion(Log.Test_Session, Log.Student_ID, suggestion)
  }
}

const checkScreen_Activity = (Log: LogEntry) :void => {
  // Process Analyze
  const InActivePeriods : number[] = []
  let When_InActive: number = -1; // Initialize to a default value
  Log.Activities.forEach((activity) => {
    if( activity.Status  == 'Inactive Tab') {
      When_InActive = Date.parse(activity.Timestamp);
    }
    if (activity.Status === 'Active Tab') {
      if (When_InActive !== -1) { // Check if When_InActive is not the default value
        const DifferentTime: number = parseFloat(((Date.parse(activity.Timestamp) - When_InActive) / 1000).toFixed(2));
        InActivePeriods.push(DifferentTime);
        When_InActive = -1; // Reset When_InActive to the default value
      }
    }
  });

  // Check For Screen Activity
  if(InActivePeriods.length >= 1) {
    let suggestion: SuggestEntry = {
      // Test_Session: Log.Test_Session,
      Student_ID: Log.Student_ID,
      Name: Log.Name,
      Type: SuggestType.Screen_Activity,
      Description: `Student experienced ${InActivePeriods.length} periods of inactivity with durations: ${InActivePeriods.join(', ')} seconds`,

    };
    uploadSuggestion(Log.Test_Session, Log.Student_ID, suggestion)
  }
}

const checkShort_Interval_between_Answers1 = (Log: LogEntry): void => {
  // Example of Log
    // {
    //     "Student_ID": "1",
    //     "Name": "John Doe",
    //     "Activities": [
    //         {
    //             "Status": "Submit from password required",
    //             "Timestamp": "4/30/2024, 11:32 AM",
    //             "IP": "10.203.176.177"
    //         },
    //         {
    //             "Status": "Back from All parts page",
    //             "Timestamp": "5/1/2024, 9:43 PM",
    //             "IP": "192.168.1.19"
    //         }
    //     ],
    //     "Test_Session": "cef28a1f-166d-4b81-b2f0-8e7fd2af7b07"
    // }

  // Process Analyze
  const shortIntervals: number[] = []; // Array to store short intervals

  let startQuestionTime: number | undefined;

  // Process Analyze
  Log.Activities.forEach((activity, index) => {
    const status = activity.Status;

    // Check for start of a question
    if (
      status.startsWith('Back to prev question') ||
      status.startsWith('Go to next question') ||
      status.startsWith('Back to first question') ||
      status.startsWith('Next to last question') ||
      status.startsWith('Go to question')
    ) {
      startQuestionTime = Date.parse(activity.Timestamp);
    }

    // Check for end of a question
    if (status === 'Submit' || status === 'Finish Button' || status === 'Save and Close') {
      if (startQuestionTime !== undefined) {
        const endQuestionTime = Date.parse(activity.Timestamp);
        const timeDifference = (endQuestionTime - startQuestionTime) / 1000; // Convert to seconds

        // If time difference is less than 5 seconds, store it
        if (timeDifference < 5) {
          shortIntervals.push(timeDifference);
        }
        startQuestionTime = undefined; // Reset startQuestionTime
      }
    }
  });

  // Check for short intervals between submissions
  if(1) {
    const suggestion: SuggestEntry = {
      Student_ID: Log.Student_ID,
      Name: Log.Name,
      Type: SuggestType.Short_Interval_between_Answers,
      Description: `Test`,
    };
    uploadSuggestion(Log.Test_Session, Log.Student_ID, suggestion);
  }
}

const checkShort_Interval_between_Answers = (Log: LogEntry): void => {
  const shortIntervals: { question: string, interval: number }[] = []; // Array to store short intervals with question numbers

  let startQuestionTime: number | undefined;
  let currentQuestion: string | undefined;

  // Process Analyze
  Log.Activities.forEach((activity, index) => {
    const status = activity.Status;

    // Check for start of a question
    if (status.startsWith('Back to prev question') || status.startsWith('Go to next question') || status.startsWith('Back to first question') || status.startsWith('Next to last question') || status.startsWith('Go to question')) {
      startQuestionTime = Date.parse(activity.Timestamp);
      currentQuestion = status.match(/\(([^)]+)\)/)?.[1]; // Extract question number from status
    }

    // Check for end of a question
    if (status === 'Submit' || status === 'Finish Button' || status === 'Save and Close') {
      if (startQuestionTime !== undefined && currentQuestion !== undefined) {
        const endQuestionTime = Date.parse(activity.Timestamp);
        const timeDifference = (endQuestionTime - startQuestionTime) / 1000; // Convert to seconds

        // If time difference is less than 5 seconds, store it with question number
        if (timeDifference < 5) {
          shortIntervals.push({ question: currentQuestion, interval: timeDifference });
        }
        startQuestionTime = undefined; // Reset startQuestionTime
        currentQuestion = undefined; // Reset currentQuestion
      }
    }
  });

  // Check for short intervals between answers
  if (shortIntervals.length > 0) {
    const intervalsDescription = shortIntervals.map(({ question, interval }) => `Question ${question}: ${interval} seconds`).join(', ');
    const suggestion: SuggestEntry = {
      Student_ID: Log.Student_ID,
      Name: Log.Name,
      Type: SuggestType.Short_Interval_between_Answers,
      Description: `Detected short intervals between answers: ${intervalsDescription}`,
    };
    uploadSuggestion(Log.Test_Session, Log.Student_ID, suggestion);
  }
};

const checkRapid_Response_Submission = (Log: LogEntry): void => {
  let response_submission, starttime: number;
  let RAPID_RESPONSE_THRESHOLD: number = 30 * 60 * 1000; // 30 minutes threshold in milliseconds

  Log.Activities.forEach((activity) => {
    if (activity.Status === 'Start test from cover page') {
      starttime = Date.parse(activity.Timestamp);
    } else if (activity.Status === 'Test submission confirm') {
      response_submission = Date.parse(activity.Timestamp) - starttime
    }
  });

  // Check for rapid response submission
  if (response_submission && response_submission > RAPID_RESPONSE_THRESHOLD) {
    const suggestion: SuggestEntry = {
      Student_ID: Log.Student_ID,
      Name: Log.Name,
      Type: SuggestType.Rapid_Response_Submission,
      Description: `Rapid response submission detected (${(response_submission / (1000 * 60)).toFixed(2)} minutes). Which is greater than ${(RAPID_RESPONSE_THRESHOLD / (1000 * 60)).toFixed(2)} minutes.`,
    };
    uploadSuggestion(Log.Test_Session, Log.Student_ID, suggestion);
  }
};


// ------------------------ Public Function ------------------------ //
const uploadActivity = async (
  Test_Session: string,
  Student_ID: string,
  Name: string,
  // Surname: string,
  log: Activity,
  // IP: string | undefined | null,
): Promise<string> => {
  try {
    // Attempt to read the file from S3
    let existingLog: LogEntry | undefined;
    try {
      existingLog = await getActivitiesByTestSessionAndStudentID(Test_Session, Student_ID);
    } catch (readError) {
      // Handle the NoSuchKey error or log it if needed
      console.error('Error reading file from S3:', readError);
    }
    // Create a new object by merging log and IP
    // const newActivity = {
    //   ...log,
    //   IP: IP || 'N/A',
    // };
    
    let LogData : LogEntry;

    // If the file exists, update the log list
    // if (existingLog && Array.isArray(existingLog)) {
    if (existingLog) {
      const {Test_Session, Student_ID, ...Data} = existingLog
      LogData = {Student_ID, ...Data}
      LogData.Activities.push(log)

    } else {
      // If the file doesn't exist or has invalid content, create a new list with the new log
      LogData = {
        Student_ID: Student_ID,
        Name: Name,
        Activities: [log],
      };
    }
    
    return await uploadToS3(`${Test_Session}/activities/${Student_ID}`, LogData)
    // const params: S3.Types.PutObjectRequest = {
    //   Bucket: process.env.BUCKET_NAME ?? '',
    //   Key: `${Test_Session}/activities/${Student_ID}`,
    //   Body: Readable.from(JSON.stringify(LogData)),
    // };

    // const data = await s3.upload(params).promise();
    // return data.Location || '';
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw error;
  }
};

const getActivitiesByTestSessionAndStudentID = async (
  Test_Session: string,
  Student_ID: string,
): Promise< LogEntry | undefined > => {
  try {

    const data = await getDataFromS3(`${Test_Session}/activities/${Student_ID}`);
    const jsonString = data.Body?.toString('utf-8');

    let response: LogEntry;
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

const getActivitiesByTestSession = async (
  Test_Session: string,
  pageNumber?: number,
  pageSize?: number
): Promise<PaginationResult<LogEntry>> => {
  // If pageNumber and pageSize are not provided, set default values to retrieve all logs
  if (pageNumber === undefined) pageNumber = 1;
  if(pageSize === undefined) pageSize = Number.MAX_SAFE_INTEGER;

  const params: S3.Types.ListObjectsV2Request = {
    Bucket: process.env.BUCKET_NAME ?? '',
    Prefix: `${Test_Session}/activities/`,
  };

  try {
    const data = await s3.listObjectsV2(params).promise();
    const keys = data.Contents?.map((object) => object.Key || '') || [];

    // console.log(keys)
    const logEntries: LogEntry[] = [];
    let startIndex = (pageNumber - 1) * pageSize;
    let endIndex = pageNumber * pageSize;

    // Loop through each key and retrieve the content
    for (let i = startIndex; i < Math.min(endIndex, keys.length); i++) {
      const [,,studentId] = keys[i].split('/'); // Assuming the format is "Test_Session/Student_ID"
      try {
        const logEntry = await getActivitiesByTestSessionAndStudentID(Test_Session, studentId);

        if (logEntry) {
          logEntries.push(logEntry);
        }
      } catch (readError) {
        // Handle errors if needed
        console.error(`Error reading file for key ${keys[i]} from S3:`, readError);
      }
    }

    const countAllPages = Math.ceil(keys.length / pageSize);

    return {
      data: logEntries,
      countAllPages,
      currentPage: pageNumber
    };
  } catch (error) {
    console.error('Error listing keys from S3:', error);
    throw error;
  }
};

const getSuggestionsByTestSession = async (
  Test_Session: string,
  // Student_ID: string,
  pageNumber?: number,
  pageSize?: number
): Promise<PaginationResult<SuggestEntry>> => {
  // If pageNumber and pageSize are not provided, set default values to retrieve all suggestions
  if (pageNumber === undefined) pageNumber = 1;
  if(pageSize === undefined) pageSize = Number.MAX_SAFE_INTEGER;

  const params: S3.Types.ListObjectsV2Request = {
    Bucket: process.env.BUCKET_NAME ?? '',
    Prefix: `${Test_Session}/suggestions/`,
  };

  try {
    const data = await s3.listObjectsV2(params).promise();
    const keys = data.Contents?.map((object) => object.Key || '') || [];

    // console.log(keys)
    const suggestEntries: SuggestEntry[] = [];
    let startIndex = (pageNumber - 1) * pageSize;
    let endIndex = pageNumber * pageSize;

    // Loop through each key and retrieve the content
    for (let i = startIndex; i < Math.min(endIndex, keys.length); i++) {
      const [,,Student_ID,file_name] = keys[i].split('/'); // Assuming the format is "Test_Session/Student_ID"
      try {
        const data = await getDataFromS3(`${Test_Session}/suggestions/${Student_ID}/${file_name}`);
        const jsonString = data.Body?.toString('utf-8');
        if (jsonString) {
          suggestEntries.push({Test_Session,...JSON.parse(jsonString)});
        }
      } catch (readError) {
        // Handle errors if needed
        console.error(`Error reading file for key ${keys[i]} from S3:`, readError);
      }
    }

    const countAllPages = Math.ceil(keys.length / pageSize);

    return {
      data: suggestEntries,
      countAllPages,
      currentPage: pageNumber
    };
  } catch (error) {
    console.error('Error listing keys from S3:', error);
    throw error;
  }
};

const analyze = async (Test_Session: string, Student_ID: string,): Promise<any> => {
  try {
    // Clean suggestion data for the test session
    await cleanSuggestions(Test_Session, Student_ID);

    // Retrieve all activity logs for the given test session
    const activityLog = await getActivitiesByTestSessionAndStudentID(Test_Session, Student_ID);
    
    // Check if activityLogs is undefined
    if (!activityLog) {
      throw 'Activity logs not found.'
    }

    
    // Sort activities by Timestamp
    activityLog.Activities.sort((a, b) => {
      return Date.parse(a.Timestamp) - Date.parse(b.Timestamp);
    });

    try {
      // Analyze forensic for each activity log
      checkDifferent_IP(activityLog);
    } catch (error) {
      console.error('Error in checkDifferent_IP:', error);
      // Handle error or continue to the next log
    }

    try {
      checkScreen_Activity(activityLog);
    } catch (error) {
      console.error('Error in checkScreen_Activity:', error);
      // Handle error or continue to the next log
    }

    try {
      checkShort_Interval_between_Answers(activityLog);
    } catch (error) {
      console.error('Error in checkShort_Interval_between_Answers:', error);
      // Handle error or continue to the next log
    }

    try {
      checkRapid_Response_Submission(activityLog);
    } catch (error) {
      console.error('Error in checkRapid_Response_Submission:', error);
      // Handle error or continue to the next log
    }
    
  } catch (error) {
    console.error(error);
    throw error;
  }
};


export const s3service = {
  uploadActivity, 
  getActivitiesByTestSessionAndStudentID,
  getActivitiesByTestSession,
  getSuggestionsByTestSession,
  analyze,
}