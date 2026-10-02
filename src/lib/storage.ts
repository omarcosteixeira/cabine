import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db, firebaseEnabled, firebaseReady } from './firebase';
import { compactImage } from './strip';
import { normalizeEvent, type BoothEvent, type PhotoSession } from '../types';

const DB_NAME = 'cabine-local';
let database: Promise<IDBDatabase> | undefined;

export const storageMode: 'firebase' | 'local' = firebaseEnabled ? 'firebase' : 'local';

export function openDatabase() {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('O armazenamento local não está disponível.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('events', { keyPath: 'id' });
        request.result.createObjectStore('sessions', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); database = undefined; };
        resolve(request.result);
      };
      request.onerror = () => {
        database = undefined;
        reject(request.error);
      };
    });
  }
  return database;
}

async function localAll<T>(store: string): Promise<T[]> {
  const dbLocal = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = dbLocal.transaction(store, 'readonly').objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

async function localPut<T>(store: string, value: T) {
  const dbLocal = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = dbLocal.transaction(store, 'readwrite');
    transaction.objectStore(store).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function localRemove(store: string, id: string) {
  const dbLocal = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = dbLocal.transaction(store, 'readwrite');
    transaction.objectStore(store).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// Firestore rejects documents containing undefined values and caps them at
// 1 MB, so payloads are pruned and images are re-encoded before upload.
function prune<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

const eventsCollection = () => collection(db(), 'events');
const sessionsCollection = () => collection(db(), 'sessions');

async function remoteEvents(): Promise<BoothEvent[]> {
  const snapshot = await getDocs(eventsCollection());
  return snapshot.docs.map((item) => normalizeEvent({ ...(item.data() as Partial<BoothEvent>), id: item.id }));
}

async function remoteEvent(id: string): Promise<BoothEvent | null> {
  const snapshot = await getDoc(doc(db(), 'events', id));
  if (!snapshot.exists()) return null;
  return normalizeEvent({ ...(snapshot.data() as Partial<BoothEvent>), id: snapshot.id });
}

async function remoteSaveEvent(event: BoothEvent) {
  const template = event.template ? await compactImage(event.template, 420, 'image/png') : undefined;
  const logo = event.logo ? await compactImage(event.logo, 300, 'image/png') : undefined;
  await setDoc(doc(db(), 'events', event.id), prune({ ...event, template, logo }), { merge: true });
}

async function remoteSessions(): Promise<PhotoSession[]> {
  const snapshot = await getDocs(sessionsCollection());
  return snapshot.docs.map((item) => {
    const value = item.data() as Partial<PhotoSession>;
    return { ...value, id: item.id, photos: value.photos ?? [] } as PhotoSession;
  });
}

async function remoteSaveSession(session: PhotoSession) {
  const strip = await compactImage(session.strip, 320, 'image/jpeg', 0.72);
  await setDoc(doc(db(), 'sessions', session.id), prune({ ...session, photos: [], strip }));
}

function mergeById<T extends { id: string }>(primary: T[], secondary: T[]) {
  const map = new Map(secondary.map((item) => [item.id, item]));
  primary.forEach((item) => map.set(item.id, item));
  return [...map.values()];
}

export const storage = {
  async getEvents(): Promise<BoothEvent[]> {
    const cached = (await localAll<BoothEvent>('events').catch(() => [])).map(normalizeEvent);
    if (!firebaseReady) return cached;
    try {
      return mergeById(await remoteEvents(), cached);
    } catch (error) {
      console.warn('Leitura de eventos no Firestore falhou, usando o cache local.', error);
      return cached;
    }
  },

  async getEvent(id: string): Promise<BoothEvent | null> {
    if (!firebaseReady) return null;
    try {
      const remote = await remoteEvent(id);
      if (remote) await localPut('events', remote).catch(() => undefined);
      return remote;
    } catch (error) {
      console.warn('Leitura do evento no Firestore falhou.', error);
      return null;
    }
  },

  async getSessions(): Promise<PhotoSession[]> {
    const cached = await localAll<PhotoSession>('sessions').catch(() => []);
    if (!firebaseReady) return cached;
    try {
      return mergeById(await remoteSessions(), cached);
    } catch (error) {
      console.warn('Leitura de sessões no Firestore falhou, usando o cache local.', error);
      return cached;
    }
  },

  // The local copy always succeeds first, so an offline booth keeps working.
  // The returned flag tells the caller whether the cloud write also succeeded.
  async saveEvent(event: BoothEvent): Promise<boolean> {
    await localPut('events', event);
    if (!firebaseReady) return false;
    await remoteSaveEvent(event);
    return true;
  },

  async saveSession(session: PhotoSession): Promise<boolean> {
    await localPut('sessions', session);
    if (!firebaseReady) return false;
    await remoteSaveSession(session);
    return true;
  },

  async deleteEvent(id: string): Promise<void> {
    await localRemove('events', id);
    if (firebaseReady) await deleteDoc(doc(db(), 'events', id));
  },

  async deleteSession(id: string): Promise<void> {
    await localRemove('sessions', id);
    if (firebaseReady) await deleteDoc(doc(db(), 'sessions', id));
  },
};

export const SEED_EVENT: BoothEvent = normalizeEvent({ id: 'modelo-inicial', name: 'Meu primeiro evento', date: new Date().toISOString().slice(0, 10), tagline: 'comece por aqui' });
