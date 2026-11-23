import {
  createInitialStudyData,
  validateStudyData,
  type StudyData,
} from './model';

const DATABASE_NAME = 'hsc-2027-command-center';
const DATABASE_VERSION = 1;
const OBJECT_STORE = 'local-data';
const RECORD_KEY = 'study-data';

let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(
      new Error('This browser does not support local study storage.'),
    );
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OBJECT_STORE)) {
        database.createObjectStore(OBJECT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open local study storage.'));
    request.onblocked = () =>
      reject(new Error('Close other open copies of this app, then try again.'));
  });

  return databasePromise;
}

function readOrCreate(write = false): Promise<StudyData> {
  return openDatabase().then(
    (database) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(
          OBJECT_STORE,
          write ? 'readwrite' : 'readonly',
        );
        const request = transaction.objectStore(OBJECT_STORE).get(RECORD_KEY);
        let result: StudyData | undefined;
        let failed = false;

        request.onsuccess = () => {
          try {
            if (request.result === undefined) {
              result = createInitialStudyData();
              if (write) {
                transaction.objectStore(OBJECT_STORE).put(result, RECORD_KEY);
              }
            } else {
              const storedVersion =
                typeof request.result === 'object' &&
                request.result !== null &&
                'schemaVersion' in request.result
                  ? request.result.schemaVersion
                  : undefined;
              result = validateStudyData(request.result);
              if (write && storedVersion !== result.schemaVersion) {
                transaction.objectStore(OBJECT_STORE).put(result, RECORD_KEY);
              }
            }
          } catch (error) {
            failed = true;
            try {
              transaction.abort();
            } catch {
              reject(error);
            }
            reject(error);
          }
        };
        request.onerror = () => {
          failed = true;
          reject(request.error ?? new Error('Could not read local study data.'));
        };
        transaction.oncomplete = () => {
          if (!failed && result) resolve(result);
        };
        transaction.onerror = () => {
          failed = true;
          reject(transaction.error ?? new Error('Could not read local study data.'));
        };
        transaction.onabort = () => {
          if (!failed) {
            reject(transaction.error ?? new Error('Local study data read was cancelled.'));
          }
        };
      }),
  );
}

export function getStudyData(): Promise<StudyData> {
  return readOrCreate(true);
}

export async function updateStudyData(
  updater: (current: StudyData) => StudyData,
): Promise<StudyData> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OBJECT_STORE, 'readwrite');
    const store = transaction.objectStore(OBJECT_STORE);
    const request = store.get(RECORD_KEY);
    let nextData: StudyData | undefined;
    let failed = false;

    request.onsuccess = () => {
      try {
        const current =
          request.result === undefined
            ? createInitialStudyData()
            : validateStudyData(request.result);
        nextData = validateStudyData({
          ...updater(current),
          lastUpdatedAt: new Date().toISOString(),
        });
        store.put(nextData, RECORD_KEY);
      } catch (error) {
        failed = true;
        try {
          transaction.abort();
        } catch {
          reject(error);
        }
        reject(error);
      }
    };
    request.onerror = () => {
      failed = true;
      reject(request.error ?? new Error('Could not read local study data.'));
    };
    transaction.oncomplete = () => {
      if (!failed && nextData) resolve(nextData);
    };
    transaction.onerror = () => {
      failed = true;
      reject(transaction.error ?? new Error('Could not save local study data.'));
    };
    transaction.onabort = () => {
      if (!failed) {
        reject(transaction.error ?? new Error('Saving local study data was cancelled.'));
      }
    };
  });
}

export async function replaceStudyData(value: unknown): Promise<StudyData> {
  const data = validateStudyData(value);
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OBJECT_STORE, 'readwrite');
    transaction.objectStore(OBJECT_STORE).put(data, RECORD_KEY);
    transaction.oncomplete = () => resolve(data);
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Could not restore local study data.'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Restoring local study data was cancelled.'));
  });
}

export function resetStudyData(): Promise<StudyData> {
  return replaceStudyData(createInitialStudyData());
}
