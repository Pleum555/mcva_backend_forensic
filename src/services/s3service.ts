// src/services/s3Service.ts
import { S3 } from 'aws-sdk';
import { Readable } from 'stream';
import dotenv from 'dotenv';

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
const checkDifferent_IP = async (Log: LogEntry): Promise<any> => {
  // Process Analyze
  const uniqueIPs: Set<string> = new Set();
  let isCheckIPs: boolean = false

  Log.Activities.forEach((activity) => {
    if(activity.Status == 'Start test from cover page') {
      uniqueIPs.clear()
      isCheckIPs = true;
    } else if(activity.Status == 'Start test from cover page') {
      isCheckIPs = false;
    }
    
    if(isCheckIPs && activity.IP) {
      uniqueIPs.add(activity.IP);
    }
  });
  
  // Check Fore Different IPs
  if(uniqueIPs.size > 1) {
  let ipsDescription = ''; // Initialize description for IPs
  uniqueIPs.forEach((ip) => {
    ipsDescription += `${ip}, `;
  });
  ipsDescription = ipsDescription.slice(0, -2); // Remove the last comma and space
  
  let suggestion: SuggestEntry = {
    Test_Session: Log.Test_Session,
    Student_ID: Log.Student_ID,
    Name: Log.Name,
    Type: SuggestType.DifferentIP,
    Description: `Student have ${uniqueIPs.size} IPs: ${ipsDescription}.`,
  };
  await uploadSuggestion(Log.Test_Session, Log.Student_ID, suggestion);
  }
}

const checkScreen_Activity = async (Log: LogEntry): Promise<any> => {
  // Process Analyze
  let InActivePeriods: string[] = [];
  let When_InActive: number = -1; // Initialize to a default value
  let isActiveTest = false; // Flag to track if the test is active

  Log.Activities.forEach((activity, index) => {
    if (activity.Status === 'Start test from cover page') {
      InActivePeriods = [] // Clear Data
      isActiveTest = true; // Set test active when starting the test
    }

    if (isActiveTest) {
      if (activity.Status === 'Inactive tab') {
        When_InActive = Date.parse(activity.Timestamp);
      }
      if (activity.Status === 'Active tab') {
        if (When_InActive !== -1) { // Check if When_InActive is not the default value
          const DifferentTime: number = parseFloat(((Date.parse(activity.Timestamp) - When_InActive) / 1000).toFixed(2));
          if (DifferentTime >= 60) {
            const hours = Math.floor(DifferentTime / 3600);
            const minutes = Math.floor((DifferentTime % 3600) / 60);
            const seconds = Math.floor(DifferentTime % 60);
            InActivePeriods.push(`${hours}h ${minutes}m ${seconds}s`);
          } else {
            InActivePeriods.push(`${DifferentTime}s`);
          }
          When_InActive = -1; // Reset When_InActive to the default value
        }
      }
    }

    if (activity.Status === 'Test submission confirm') {
      isActiveTest = false; // Set test inactive after test submission confirm
    }
  });

  // Check For Screen Activity
  if (InActivePeriods.length >= 1) {
    let suggestion: SuggestEntry = {
      Test_Session: Log.Test_Session,
      Student_ID: Log.Student_ID,
      Name: Log.Name,
      Type: SuggestType.Screen_Activity,
      Description: `Student experienced ${InActivePeriods.length} periods of inactivity with durations: ${InActivePeriods.join(', ')}.`,
    };
    await uploadSuggestion(Log.Test_Session, Log.Student_ID, suggestion);
  }
};

const checkShort_Interval_between_Answers = async (Log: LogEntry): Promise<any> => {
  let shortIntervals: { part: string, question: string, interval: number }[] = []; // Array to store short intervals with part titles and question numbers

  let startQuestionTime: number | undefined;
  let currentQuestion: string | undefined;
  let currentPart: string | undefined;

  let isCheckShort: boolean = false;

  // Process Analyze
  Log.Activities.forEach((activity, index) => {
    const status = activity.Status;
    
    if(activity.Status == 'Start test from cover page') {
      shortIntervals = []
      startQuestionTime = undefined;
      currentQuestion = undefined;
      currentPart = undefined;
      isCheckShort = true;
    } else if(activity.Status == 'Start test from cover page') {
      isCheckShort = false;
    }

    // Check for start of a question
    if (isCheckShort && status.startsWith('Go to question')) {
      const questionMatch = status.match(/Go to question (\d+)/); // Extract question number from status
      if (questionMatch) {
        currentQuestion = questionMatch[1]; // Extracted question number
        startQuestionTime = Date.parse(activity.Timestamp);
      }
    }
    // Check for start of a part
    else if (isCheckShort && status.startsWith('Go to')) {
      const partMatch = status.match(/Go to (.+)/); // Extract part title from status
      if (partMatch) {
        currentPart = partMatch[1]; // Extracted part title
        currentQuestion = '1';
        startQuestionTime = Date.parse(activity.Timestamp)
      }
    }
    // Check for change question
    else if (
      isCheckShort && (
      status.startsWith('Back to prev question') ||
      status.startsWith('Go to next question') ||
      status.startsWith('Back to first question') ||
      status.startsWith('Next to last question')
      )
    ) {
      if (startQuestionTime !== undefined && currentQuestion !== undefined) {
        const endQuestionTime = Date.parse(activity.Timestamp);
        const timeDifference = (endQuestionTime - startQuestionTime);

        // Check if the currentPart and currentQuestion already exist in shortIntervals
        const existingIndex = shortIntervals.findIndex(item => item.part === currentPart && item.question === currentQuestion);

        if (existingIndex !== -1) {
          // If exists, add the timeDifference to the existing interval
          shortIntervals[existingIndex].interval += timeDifference;
        } else {
          // If doesn't exist, push it with the timeDifference
          shortIntervals.push({ part: currentPart, question: currentQuestion, interval: timeDifference });
        }

        startQuestionTime = Date.parse(activity.Timestamp); // Reset startQuestionTime

        // Increment or decrement currentQuestion based on the status
        if (status.startsWith('Back to prev question')) {
          currentQuestion = (parseInt(currentQuestion) - 1).toString(); // Decrement currentQuestion
        } else if (status.startsWith('Go to next question')) {
          currentQuestion = (parseInt(currentQuestion) + 1).toString(); // Increment currentQuestion
        } else if (status.startsWith('Back to first question')) {
          currentQuestion = '1'; // Set currentQuestion to first question
        } else if (status.startsWith('Next to last question')) {
          const nextToLastQuestionMatch = status.match(/Next to last question (\d+)/);
          if (nextToLastQuestionMatch) {
            currentQuestion = nextToLastQuestionMatch[1];
          }
        }
      }
    }
    // Check for end of a question
    else if (isCheckShort && (status === 'Submit' || status === 'Finish Button' || status === 'Save and Close')) {
      if (startQuestionTime !== undefined && currentQuestion !== undefined) {
        const endQuestionTime = Date.parse(activity.Timestamp);
        const timeDifference = (endQuestionTime - startQuestionTime);

        // Check if the currentPart and currentQuestion already exist in shortIntervals
        const existingIndex = shortIntervals.findIndex(item => item.part === currentPart && item.question === currentQuestion);

        if (existingIndex !== -1) {
          // If exists, add the timeDifference to the existing interval
          shortIntervals[existingIndex].interval += timeDifference;
        } else {
          // If doesn't exist, push it with the timeDifference
          shortIntervals.push({ part: currentPart, question: currentQuestion, interval: timeDifference });
        }

        startQuestionTime = undefined; // Reset startQuestionTime
        currentQuestion = undefined; // Reset currentQuestion
        currentPart = undefined; // Reset currentPart
      }
    }
  });

  // Check for short intervals between answers
  const SHORT_INTERVAL_THRESHOLD = 5 * 1000; // Threshold for short intervals in milliseconds
  const shortIntervalsFiltered = shortIntervals.filter(({ interval }) => interval < SHORT_INTERVAL_THRESHOLD); // Filter short intervals

  if (shortIntervalsFiltered.length > 0) {
    

    const shortIntervalsDescription = shortIntervalsFiltered
      .map(({ part, question, interval }) => `${part}, Question ${question}: ${(interval / 1000).toFixed(2)} seconds`)
      .join(', ');

    const suggestion: SuggestEntry = {
      Student_ID: Log.Student_ID,
      Name: Log.Name,
      Type: SuggestType.Short_Interval_between_Answers,
      Description: `Detected ${shortIntervalsFiltered.length} short intervals between answers (less than ${SHORT_INTERVAL_THRESHOLD / 1000} seconds): ${shortIntervalsDescription}.`,
    };
    await uploadSuggestion(Log.Test_Session, Log.Student_ID, suggestion);
  }
};

const checkRapid_Response_Submission = async (Log: LogEntry): Promise<any> => {
  let starttime: Date | undefined;
  let response_submission: number | undefined;

  Log.Activities.forEach((activity) => {
    if (activity.Status === 'Start test from cover page') {
      starttime = new Date(activity.Timestamp);
      console.log('starttime = ', starttime)
    } else if (activity.Status === 'Test submission confirm' && starttime) {
      response_submission = Date.parse(activity.Timestamp) - starttime.getTime();
      console.log('response_submission = ', response_submission)
    }
  });

  if (response_submission !== undefined) {
    // Check for rapid response submission
    const RAPID_RESPONSE_THRESHOLD: number = 30 * 60 * 1000; // 30 minutes threshold in milliseconds

    if (response_submission < RAPID_RESPONSE_THRESHOLD) {
      const seconds = Math.floor((response_submission / 1000) % 60);
      const minutes = Math.floor((response_submission / (1000 * 60)) % 60);
      const hours = Math.floor(response_submission / (1000 * 60 * 60));
      
      const suggestion: SuggestEntry = {
        Student_ID: Log.Student_ID,
        Name: Log.Name,
        Type: SuggestType.Rapid_Response_Submission,
        Description: `Rapid response submission detected (less than ${Math.floor(RAPID_RESPONSE_THRESHOLD / (1000 * 60))} minutes): ${hours}h ${minutes}m ${seconds}s.`,
      };
      try {
        await uploadSuggestion(Log.Test_Session, Log.Student_ID, suggestion);
      } catch (error) {
        console.error("Error uploading suggestion:", error);
        // Handle error accordingly
      }
    }
  } else {
    console.warn("No test submission confirmation found or missing start time.");
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

    console.log(activityLog.Activities)

    try {
      // Analyze forensic for each activity log
      await checkDifferent_IP(activityLog);
    } catch (error) {
      console.error('Error in checkDifferent_IP:', error);
      // Handle error or continue to the next log
    }

    try {
      await checkScreen_Activity(activityLog);
    } catch (error) {
      console.error('Error in checkScreen_Activity:', error);
      // Handle error or continue to the next log
    }

    try {
      await checkShort_Interval_between_Answers(activityLog);
    } catch (error) {
      console.error('Error in checkShort_Interval_between_Answers:', error);
      // Handle error or continue to the next log
    }

    try {
      await checkRapid_Response_Submission(activityLog);
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