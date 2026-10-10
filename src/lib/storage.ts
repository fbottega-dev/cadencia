import { createDemoState, validateState, type State } from './domain';

const DATABASE = 'cadencia';
const STORE = 'workspace';
const KEY = 'current';
const MISSING = Symbol('missing');
export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

let databasePromise: Promise<IDBDatabase> | undefined;

function storageError(error: unknown): Error {
  if (error instanceof Error && error.name === 'QuotaExceededError') {
    return new Error('O navegador está sem espaço para salvar. Exporte um backup e libere espaço antes de tentar novamente.', { cause: error });
  }
  if (error instanceof Error && error.name === 'SecurityError') {
    return new Error('O navegador bloqueou o armazenamento local. Permita o uso de dados neste site para continuar.', { cause: error });
  }
  if (error instanceof Error) return error;
  return new Error('Não foi possível acessar os dados locais. Tente recarregar a página.', { cause: error });
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador não oferece o armazenamento local necessário para o Cadência.'));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    let settled = false;

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
    };
    request.onerror = () => {
      settled = true;
      reject(storageError(request.error));
    };
    request.onblocked = () => {
      settled = true;
      reject(new Error('Outra aba está impedindo a abertura dos dados. Feche as outras abas do Cadência e recarregue.'));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      database.onversionchange = () => {
        database.close();
        if (databasePromise === opening) databasePromise = undefined;
      };
      database.onclose = () => {
        if (databasePromise === opening) databasePromise = undefined;
      };
      resolve(database);
    };
  });

  databasePromise = opening;
  // A denied or temporarily blocked opening must not poison subsequent attempts.
  void opening.catch(() => {
    if (databasePromise === opening) databasePromise = undefined;
  });
  return opening;
}

function validateStored(input: unknown): State {
  try {
    return validateState(input);
  } catch (cause) {
    throw new Error('Os dados locais estão corrompidos ou são incompatíveis. O conteúdo original foi preservado.', { cause });
  }
}

/** Resolve only after IndexedDB commits, so the UI never announces an unsaved change. */
async function transact(update: (current: unknown) => State | { state: State; write: true }): Promise<State> {
  try {
    const database = await openDatabase();
    return await new Promise<State>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      let result: State | undefined;
      let failure: unknown;

      transaction.oncomplete = () => {
        if (result) resolve(result);
        else reject(new Error('A leitura dos dados locais não foi concluída. Recarregue a página.'));
      };
      transaction.onabort = () => reject(storageError(failure ?? transaction.error));
      transaction.onerror = () => {
        failure ??= transaction.error;
      };

      // A cursor distinguishes an absent record from a corrupt stored `undefined`.
      const request = store.openCursor(KEY);
      request.onsuccess = () => {
        try {
          const change = update(request.result ? request.result.value : MISSING);
          if ('write' in change) {
            result = change.state;
            const write = store.put(result, KEY);
            write.onerror = () => { failure = write.error; };
          } else {
            result = change;
          }
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      request.onerror = () => { failure = request.error; };
    });
  } catch (error) {
    throw storageError(error);
  }
}

export function loadState(): Promise<State> {
  return transact((current) => {
    if (current !== MISSING) return validateStored(current);
    return { state: validateState(createDemoState()), write: true };
  });
}

export async function saveState(next: State, expectedRevision: number): Promise<State> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) {
    throw new Error('A revisão dos dados é inválida. Recarregue a página antes de salvar.');
  }
  // Snapshot before the first await: callers may edit their in-memory copy while saving.
  const snapshot = validateState(structuredClone(next));
  const candidate = { ...snapshot, revision: expectedRevision + 1 };
  assertBackupSize(JSON.stringify(candidate), 'O limite local é 2 MiB. Reduza o tamanho dos cartões antes de salvar.');
  return transact((current) => {
    if (current === MISSING || validateStored(current).revision !== expectedRevision) {
      throw new Error('Os dados foram alterados em outra aba. Recarregue a página antes de salvar para preservar as alterações.');
    }
    return { state: candidate, write: true };
  });
}

function assertBackupSize(text: string, message: string): void {
  if (text.length > MAX_BACKUP_BYTES || new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    throw new Error(message);
  }
}

export function parseBackup(text: string): State {
  assertBackupSize(text, 'O backup ultrapassa o limite de 2 MiB. Escolha um arquivo menor.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw new Error('O arquivo não contém um backup JSON válido.', { cause });
  }
  return validateState(value);
}

export function serializeBackup(state: State): string {
  const text = JSON.stringify(validateState(state));
  assertBackupSize(text, 'O backup ultrapassa o limite de 2 MiB. Reduza o tamanho dos cartões antes de exportar.');
  return text;
}
