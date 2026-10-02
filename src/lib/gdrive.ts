import type { GoogleDriveSettings } from '../types';

const STORAGE_KEY = 'cabine-gdrive-config';

export function getDefaultGDriveSettings(): GoogleDriveSettings {
  return {
    enabled: false,
    method: 'webhook',
    webhookUrl: '',
    folderId: '',
    folderName: 'Cabine de Fotos & Vídeos',
    autoUploadStrips: true,
    autoUploadVideos: true,
    accessToken: '',
  };
}

export function getStoredGDriveSettings(): GoogleDriveSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...getDefaultGDriveSettings(),
        ...parsed,
      };
    }
  } catch {
    // fallback
  }
  return getDefaultGDriveSettings();
}

export function saveStoredGDriveSettings(settings: GoogleDriveSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export const APPS_SCRIPT_TEMPLATE = `// =====================================================================
// SCRIPT GOOGLE DRIVE PARA CABINE DE FOTOS & VIDEO 360
// =====================================================================
// Como instalar em 3 passos:
// 1. Acesse https://script.google.com e clique em "Novo projeto"
// 2. Apague o código padrão, cole todo este código e salve (Ctrl+S)
// 3. Clique em "Implantar" > "Nova implantação" > Tipo: "App da Web"
//    - Executar como: "Eu (seu e-mail)"
//    - Quem tem acesso: "Qualquer pessoa" (ou "Qualquer pessoa com o link")
//    - Copie a "URL do App da Web" gerada e cole no painel de configurações!

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var base64Data = data.base64;
    var filename = data.filename || ("arquivo_" + Date.now());
    var mimeType = data.mimeType || "image/png";
    var folderId = data.folderId;
    var eventName = data.eventName || "Eventos";

    // Decodifica o arquivo base64
    var decoded = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decoded, mimeType, filename);

    // Seleciona a pasta de destino
    var folder;
    if (folderId && folderId.trim() !== "") {
      try {
        folder = DriveApp.getFolderById(folderId.trim());
      } catch (err) {
        folder = DriveApp.getRootFolder();
      }
    } else {
      // Cria ou busca pasta padrão
      var folders = DriveApp.getFoldersByName("Cabine de Fotos");
      if (folders.hasNext()) {
        folder = folders.next();
      } else {
        folder = DriveApp.createFolder("Cabine de Fotos");
      }
    }

    // Se houver nome de evento, cria/usa subpasta do evento
    if (eventName && eventName.trim() !== "") {
      var subFolders = folder.getFoldersByName(eventName.trim());
      if (subFolders.hasNext()) {
        folder = subFolders.next();
      } else {
        folder = folder.createFolder(eventName.trim());
      }
    }

    var file = folder.createFile(blob);
    // Torna o arquivo legível para link público se desejado
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch(e) {}

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      fileId: file.getId(),
      fileUrl: file.getUrl(),
      downloadUrl: file.getDownloadUrl(),
      name: file.getName(),
      folderName: folder.getName(),
      message: "Arquivo salvo com sucesso no Google Drive!"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString(),
      message: "Erro ao salvar no Google Drive: " + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    service: "Cabine Google Drive Web App",
    time: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}
`;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] || dataUrl;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export interface UploadOptions {
  blob: Blob;
  filename: string;
  mimeType: string;
  eventName: string;
}

export async function uploadToGoogleDrive(
  options: UploadOptions,
  customSettings?: GoogleDriveSettings
): Promise<{ success: boolean; fileUrl?: string; message: string }> {
  const settings = customSettings || getStoredGDriveSettings();

  if (!settings.enabled) {
    return { success: false, message: 'Google Drive está desativado nas configurações.' };
  }

  if (settings.method === 'webhook') {
    if (!settings.webhookUrl || !settings.webhookUrl.startsWith('http')) {
      return { success: false, message: 'URL do Webhook do Google Drive não configurada.' };
    }

    try {
      const base64 = await blobToBase64(options.blob);
      const payload = {
        base64,
        filename: options.filename,
        mimeType: options.mimeType,
        eventName: options.eventName,
        folderId: settings.folderId || '',
      };

      const response = await fetch(settings.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8', // Apps Script handles text/plain avoiding CORS preflight block
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Servidor retornou status HTTP ${response.status}`);
      }

      const result = await response.json().catch(() => ({ success: true, message: 'Enviado com sucesso!' }));
      if (result.success !== false) {
        return {
          success: true,
          fileUrl: result.fileUrl || result.url,
          message: result.message || 'Arquivo salvo no Google Drive com sucesso!',
        };
      } else {
        return {
          success: false,
          message: result.error || result.message || 'Falha ao salvar no Google Drive.',
        };
      }
    } catch (err: any) {
      console.error('Erro no upload para Google Drive Webhook:', err);
      return {
        success: false,
        message: err.message || 'Não foi possível conectar ao Webhook do Google Drive.',
      };
    }
  } else {
    // OAuth direct upload
    if (!settings.accessToken) {
      return { success: false, message: 'Token de acesso do Google Drive não configurado.' };
    }

    try {
      const metadata: Record<string, any> = {
        name: options.filename,
        mimeType: options.mimeType,
      };

      if (settings.folderId) {
        metadata.parents = [settings.folderId];
      }

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', options.blob);

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.accessToken}`,
        },
        body: form,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Erro HTTP ${response.status}`);
      }

      const fileData = await response.json();
      return {
        success: true,
        fileUrl: `https://drive.google.com/file/d/${fileData.id}/view`,
        message: 'Arquivo enviado com sucesso para o Google Drive!',
      };
    } catch (err: any) {
      console.error('Erro no upload OAuth para Google Drive:', err);
      return {
        success: false,
        message: err.message || 'Erro ao enviar via Google Drive API.',
      };
    }
  }
}

export async function testGoogleDriveConnection(
  settings: GoogleDriveSettings
): Promise<{ success: boolean; message: string; fileUrl?: string }> {
  if (settings.method === 'webhook') {
    if (!settings.webhookUrl || !settings.webhookUrl.startsWith('http')) {
      return {
        success: false,
        message: 'Por favor, informe a URL do App da Web do Google Apps Script.',
      };
    }

    try {
      // Send a test text file
      const testContent = `Cabine de Fotos & Video 360 - Teste de Conexão Google Drive\nData: ${new Date().toLocaleString('pt-BR')}\nStatus: Conexão efetuada com sucesso!`;
      const testBlob = new Blob([testContent], { type: 'text/plain' });

      return await uploadToGoogleDrive(
        {
          blob: testBlob,
          filename: `teste_conexao_cabine_${Date.now()}.txt`,
          mimeType: 'text/plain',
          eventName: 'Testes de Conexao',
        },
        { ...settings, enabled: true }
      );
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Falha ao testar conexão com o Google Drive.',
      };
    }
  } else {
    if (!settings.accessToken) {
      return {
        success: false,
        message: 'Por favor, informe o Token de Acesso (Bearer Token) do Google Drive.',
      };
    }

    try {
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user,storageQuota', {
        headers: {
          Authorization: `Bearer ${settings.accessToken}`,
        },
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `Erro HTTP ${response.status}. Token pode ter expirado.`);
      }

      const data = await response.json();
      const userName = data.user?.displayName || data.user?.emailAddress || 'Usuário Google';
      return {
        success: true,
        message: `Conexão autenticada com sucesso no Google Drive de ${userName}!`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Falha ao conectar via Google Drive API.',
      };
    }
  }
}
