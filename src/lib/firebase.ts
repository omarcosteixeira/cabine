import { initializeApp, deleteApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, deleteDoc, type Firestore } from 'firebase/firestore';
import type { FirebaseSettings } from '../types';

const STORAGE_KEY = 'cabine-firebase-config';

function env(key: string) {
  return (import.meta.env[`VITE_FIREBASE_${key}`] as string | undefined)?.trim() || '';
}

export function getDefaultFirebaseSettings(): FirebaseSettings {
  return {
    apiKey: env('API_KEY'),
    authDomain: env('AUTH_DOMAIN'),
    projectId: env('PROJECT_ID'),
    storageBucket: env('STORAGE_BUCKET'),
    messagingSenderId: env('MESSAGING_SENDER_ID'),
    appId: env('APP_ID'),
  };
}

export function getStoredFirebaseSettings(): FirebaseSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        apiKey: parsed.apiKey || '',
        authDomain: parsed.authDomain || '',
        projectId: parsed.projectId || '',
        storageBucket: parsed.storageBucket || '',
        messagingSenderId: parsed.messagingSenderId || '',
        appId: parsed.appId || '',
      };
    }
  } catch {
    // fallback
  }
  return getDefaultFirebaseSettings();
}

export function saveStoredFirebaseSettings(settings: FirebaseSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function clearStoredFirebaseSettings() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

let app: FirebaseApp | undefined;
let firestore: Firestore | undefined;

export function isFirebaseConfigComplete(config: FirebaseSettings): boolean {
  return Boolean(
    config.apiKey &&
    config.authDomain &&
    config.projectId &&
    config.appId
  );
}

export function getMissingKeys(config: FirebaseSettings = getStoredFirebaseSettings()): string[] {
  const missing: string[] = [];
  if (!config.apiKey) missing.push('API Key (apiKey)');
  if (!config.authDomain) missing.push('Auth Domain (authDomain)');
  if (!config.projectId) missing.push('Project ID (projectId)');
  if (!config.appId) missing.push('App ID (appId)');
  return missing;
}

export function initFirebase(customSettings?: FirebaseSettings): boolean {
  const config = customSettings || getStoredFirebaseSettings();
  
  if (!isFirebaseConfigComplete(config)) {
    firestore = undefined;
    return false;
  }

  try {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      // Re-initialize app
      for (const existingApp of existingApps) {
        deleteApp(existingApp).catch(() => undefined);
      }
    }
    app = initializeApp(config);
    firestore = getFirestore(app);
    return true;
  } catch (error) {
    app = undefined;
    firestore = undefined;
    console.error('Erro ao inicializar Firebase:', error);
    return false;
  }
}

// Initial boot initialization
initFirebase();

export const firebaseEnabled = isFirebaseConfigComplete(getStoredFirebaseSettings());
export const firebaseReady = Boolean(firestore);
export const missingFirebaseKeys = getMissingKeys();

export function db() {
  if (!firestore) {
    // try to re-init
    initFirebase();
  }
  if (!firestore) throw new Error('O Firebase não está configurado neste ambiente.');
  return firestore;
}

export async function testFirebaseConnection(settings: FirebaseSettings): Promise<{ success: boolean; message: string }> {
  if (!isFirebaseConfigComplete(settings)) {
    return {
      success: false,
      message: 'Preencha todos os campos obrigatórios (API Key, Auth Domain, Project ID e App ID).',
    };
  }

  try {
    // Create temporary test app instance
    const testAppName = `test-${Date.now()}`;
    const testApp = initializeApp(settings, testAppName);
    const testDb = getFirestore(testApp);

    const testDocId = `test_ping_${Date.now()}`;
    const testDocRef = doc(testDb, '_connection_test', testDocId);

    // Try writing a test document
    await setDoc(testDocRef, {
      ping: true,
      timestamp: new Date().toISOString(),
      source: 'Cabine Teste de Conexão',
    });

    // Try reading it back
    const snapshot = await getDoc(testDocRef);
    if (!snapshot.exists()) {
      throw new Error('Documento de teste não pôde ser recuperado.');
    }

    // Clean up
    await deleteDoc(testDocRef).catch(() => undefined);
    await deleteApp(testApp).catch(() => undefined);

    return {
      success: true,
      message: 'Conexão com o Firebase Firestore testada e confirmada com sucesso! Gravação e leitura liberadas.',
    };
  } catch (error: any) {
    console.error('Falha no teste do Firebase:', error);
    let errorMsg = error?.message || 'Erro desconhecido ao conectar ao Firestore.';
    if (error?.code === 'permission-denied' || errorMsg.includes('permission-denied') || errorMsg.includes('insufficient permissions')) {
      errorMsg = 'Acesso negado pelas regras de segurança do Firestore. Verifique se o arquivo firestore.rules foi publicado com "allow read, write: if true;".';
    } else if (error?.code === 'unavailable' || errorMsg.includes('unavailable')) {
      errorMsg = 'Serviço do Firestore indisponível ou offline. Verifique sua conexão com a internet.';
    } else if (errorMsg.includes('auth/invalid-api-key') || errorMsg.includes('API_KEY_INVALID')) {
      errorMsg = 'A chave API Key informada é inválida.';
    }
    return {
      success: false,
      message: errorMsg,
    };
  }
}
