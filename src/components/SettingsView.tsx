import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Cloud,
  Code2,
  Copy,
  Database,
  ExternalLink,
  FolderOpen,
  HardDrive,
  Info,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Save,
  ShieldAlert,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  UploadCloud,
} from 'lucide-react';
import type { FirebaseSettings, GoogleDriveSettings } from '../types';
import {
  getStoredFirebaseSettings,
  saveStoredFirebaseSettings,
  clearStoredFirebaseSettings,
  initFirebase,
  testFirebaseConnection,
  getDefaultFirebaseSettings,
} from '../lib/firebase';
import {
  APPS_SCRIPT_TEMPLATE,
  getStoredGDriveSettings,
  saveStoredGDriveSettings,
  testGoogleDriveConnection,
} from '../lib/gdrive';

interface SettingsViewProps {
  notify: (message: string, kind?: 'success' | 'info' | 'error') => void;
  onFirebaseStatusChange?: () => void;
}

export default function SettingsView({ notify, onFirebaseStatusChange }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<'gdrive' | 'firebase'>('gdrive');

  // Firebase state
  const [firebaseConfig, setFirebaseConfig] = useState<FirebaseSettings>(getStoredFirebaseSettings);
  const [testingFirebase, setTestingFirebase] = useState(false);
  const [firebaseTestResult, setFirebaseTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [savingFirebase, setSavingFirebase] = useState(false);

  // Google Drive state
  const [gdriveConfig, setGdriveConfig] = useState<GoogleDriveSettings>(getStoredGDriveSettings);
  const [testingGDrive, setTestingGDrive] = useState(false);
  const [gdriveTestResult, setGdriveTestResult] = useState<{ success: boolean; message: string; fileUrl?: string } | null>(null);
  const [savingGDrive, setSavingGDrive] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [showScriptDetails, setShowScriptDetails] = useState(false);

  // Firebase handlers
  async function handleTestFirebase() {
    setTestingFirebase(true);
    setFirebaseTestResult(null);
    try {
      const result = await testFirebaseConnection(firebaseConfig);
      setFirebaseTestResult(result);
      if (result.success) {
        notify('Conexão com o Firebase Firestore validada com sucesso!', 'success');
      } else {
        notify(result.message, 'error');
      }
    } catch (err: any) {
      setFirebaseTestResult({ success: false, message: err?.message || 'Erro inesperado.' });
      notify('Falha ao testar o Firebase.', 'error');
    } finally {
      setTestingFirebase(false);
    }
  }

  function handleSaveFirebase() {
    setSavingFirebase(true);
    try {
      saveStoredFirebaseSettings(firebaseConfig);
      const initialized = initFirebase(firebaseConfig);
      if (initialized) {
        notify('Configurações do Firebase salvas e banco conectado com sucesso!', 'success');
      } else {
        notify('Configurações salvas localmente.', 'info');
      }
      onFirebaseStatusChange?.();
    } catch {
      notify('Erro ao salvar configurações do Firebase.', 'error');
    } finally {
      setSavingFirebase(false);
    }
  }

  function handleResetFirebase() {
    clearStoredFirebaseSettings();
    const defaults = getDefaultFirebaseSettings();
    setFirebaseConfig(defaults);
    initFirebase(defaults);
    setFirebaseTestResult(null);
    onFirebaseStatusChange?.();
    notify('Configurações do Firebase restauradas para os padrões do ambiente.', 'info');
  }

  // Google Drive handlers
  async function handleTestGDrive() {
    setTestingGDrive(true);
    setGdriveTestResult(null);
    try {
      const result = await testGoogleDriveConnection(gdriveConfig);
      setGdriveTestResult(result);
      if (result.success) {
        notify('Google Drive conectado! Arquivo de teste enviado com sucesso.', 'success');
      } else {
        notify(result.message, 'error');
      }
    } catch (err: any) {
      setGdriveTestResult({ success: false, message: err?.message || 'Erro inesperado ao testar.' });
      notify('Falha ao testar Google Drive.', 'error');
    } finally {
      setTestingGDrive(false);
    }
  }

  function handleSaveGDrive() {
    setSavingGDrive(true);
    try {
      saveStoredGDriveSettings(gdriveConfig);
      notify('Configurações do Google Drive salvas com sucesso!', 'success');
    } catch {
      notify('Erro ao salvar configurações do Google Drive.', 'error');
    } finally {
      setSavingGDrive(false);
    }
  }

  function copyScriptToClipboard() {
    navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE).then(() => {
      setCopiedScript(true);
      notify('Código do Google Apps Script copiado para a área de transferência!');
      setTimeout(() => setCopiedScript(false), 3000);
    });
  }

  return (
    <div className="secondary-page settings-page">
      <section className="page-intro">
        <div>
          <div className="intro-eyebrow">
            <span /> INTEGRAÇÕES & APIS
          </div>
          <h1>
            Configurações do <em>Sistema.</em>
          </h1>
          <p>
            Configure as APIs do Google Drive e Firebase para automatizar o salvamento de tirinhas e sincronizar seus eventos em nuvem.
          </p>
        </div>
      </section>

      {/* Navigation Sub-Tabs */}
      <div className="settings-nav-tabs">
        <button
          className={`settings-nav-tab ${activeTab === 'gdrive' ? 'active' : ''}`}
          onClick={() => setActiveTab('gdrive')}
        >
          <HardDrive size={18} />
          <span>Google Drive API</span>
          {gdriveConfig.enabled && <span className="tab-badge-active">Ativo</span>}
        </button>

        <button
          className={`settings-nav-tab ${activeTab === 'firebase' ? 'active' : ''}`}
          onClick={() => setActiveTab('firebase')}
        >
          <Database size={18} />
          <span>Firebase Firestore</span>
          <span className="tab-badge-active">Banco</span>
        </button>
      </div>

      {/* GOOGLE DRIVE TAB */}
      {activeTab === 'gdrive' && (
        <div className="settings-section-card">
          <div className="settings-card-header">
            <div className="settings-card-title">
              <div className="settings-icon-bubble gdrive">
                <Cloud size={24} />
              </div>
              <div>
                <h2>Integração com Google Drive</h2>
                <p>Envie automaticamente todas as tirinhas de fotos (PNG) e vídeos 360 para a sua conta do Google Drive.</p>
              </div>
            </div>

            <div className="toggle-switch-wrapper">
              <span className="toggle-label">{gdriveConfig.enabled ? 'Sincronização Ativada' : 'Sincronização Desativada'}</span>
              <button
                type="button"
                className={`toggle-switch-btn ${gdriveConfig.enabled ? 'on' : 'off'}`}
                onClick={() => setGdriveConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
                aria-pressed={gdriveConfig.enabled}
              >
                {gdriveConfig.enabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
              </button>
            </div>
          </div>

          <div className="settings-form-body">
            {/* Method selection */}
            <div className="form-group-card">
              <label className="field-label">Método de Conexão com o Google Drive</label>
              <div className="method-selection-grid">
                <button
                  type="button"
                  className={`method-option-card ${gdriveConfig.method === 'webhook' ? 'selected' : ''}`}
                  onClick={() => setGdriveConfig((prev) => ({ ...prev, method: 'webhook' }))}
                >
                  <div className="method-option-head">
                    <Sparkles size={18} />
                    <strong>Google Apps Script Web App</strong>
                    <span className="recommended-pill">Recomendado</span>
                  </div>
                  <p>
                    Conexão estável e sem expiração de token. Você cria um App Web no seu Google Drive com o script pronto em 1 minuto.
                  </p>
                </button>

                <button
                  type="button"
                  className={`method-option-card ${gdriveConfig.method === 'oauth' ? 'selected' : ''}`}
                  onClick={() => setGdriveConfig((prev) => ({ ...prev, method: 'oauth' }))}
                >
                  <div className="method-option-head">
                    <KeyRound size={18} />
                    <strong>Google Drive API Direta</strong>
                  </div>
                  <p>Upload direto via REST API com Token OAuth Bearer.</p>
                </button>
              </div>
            </div>

            {/* Webhook Method Configuration */}
            {gdriveConfig.method === 'webhook' && (
              <div className="form-group-card">
                <label className="field-label" htmlFor="gdrive-webhook-url">
                  URL do App da Web (Google Apps Script)
                </label>
                <input
                  id="gdrive-webhook-url"
                  type="url"
                  placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                  value={gdriveConfig.webhookUrl}
                  onChange={(e) => setGdriveConfig((prev) => ({ ...prev, webhookUrl: e.target.value.trim() }))}
                />
                <span className="field-hint">
                  Insira a URL gerada na implantação do seu Google Apps Script (terminada em <code>/exec</code>).
                </span>

                <div className="apps-script-guide-card">
                  <div className="guide-header">
                    <Code2 size={18} />
                    <strong>Como obter a URL do Google Drive em 3 passos:</strong>
                    <button
                      type="button"
                      className="button button-outline copy-script-btn"
                      onClick={copyScriptToClipboard}
                    >
                      {copiedScript ? <Check size={14} /> : <Copy size={14} />}
                      {copiedScript ? 'Copiado!' : 'Copiar Código do Script'}
                    </button>
                  </div>

                  <ol className="guide-steps-list">
                    <li>
                      Acesse{' '}
                      <a href="https://script.google.com" target="_blank" rel="noopener noreferrer">
                        script.google.com <ExternalLink size={12} />
                      </a>{' '}
                      e clique em <strong>"Novo projeto"</strong>.
                    </li>
                    <li>
                      Apague o código padrão, cole o código copiado e clique em <strong>Salvar</strong> (ícone de disquete ou Ctrl+S).
                    </li>
                    <li>
                      Clique em <strong>"Implantar" &gt; "Nova implantação"</strong> &gt; Tipo <strong>"App da Web"</strong> &gt;
                      Executar como: <em>"Eu"</em> &gt; Quem pode acessar: <em>"Qualquer pessoa"</em> &gt; Clique em <strong>Implantar</strong> e cole a URL acima!
                    </li>
                  </ol>

                  <button
                    type="button"
                    className="text-button view-code-toggle"
                    onClick={() => setShowScriptDetails(!showScriptDetails)}
                  >
                    {showScriptDetails ? 'Ocultar código do script' : 'Ver código do script Google Apps Script'}
                  </button>

                  {showScriptDetails && (
                    <pre className="script-code-preview">
                      <code>{APPS_SCRIPT_TEMPLATE}</code>
                    </pre>
                  )}
                </div>
              </div>
            )}

            {/* OAuth Method Configuration */}
            {gdriveConfig.method === 'oauth' && (
              <div className="form-group-card">
                <label className="field-label" htmlFor="gdrive-access-token">
                  Token de Acesso OAuth 2.0 (Bearer Token)
                </label>
                <input
                  id="gdrive-access-token"
                  type="password"
                  placeholder="ya29.a0AfH6SM..."
                  value={gdriveConfig.accessToken || ''}
                  onChange={(e) => setGdriveConfig((prev) => ({ ...prev, accessToken: e.target.value.trim() }))}
                />
                <span className="field-hint">Token temporário de acesso obtido via Google OAuth 2.0 Playground ou Google Cloud.</span>
              </div>
            )}

            {/* Folder ID */}
            <div className="form-group-card">
              <label className="field-label" htmlFor="gdrive-folder-id">
                ID da Pasta de Destino no Google Drive (Opcional)
              </label>
              <input
                id="gdrive-folder-id"
                type="text"
                placeholder="Ex: 1A2b3C4d5E6f7G8h9I0j (ou deixe em branco para criar automaticamente 'Cabine de Fotos')"
                value={gdriveConfig.folderId}
                onChange={(e) => setGdriveConfig((prev) => ({ ...prev, folderId: e.target.value.trim() }))}
              />
              <span className="field-hint">
                Para salvar em uma pasta específica: abra a pasta no Google Drive no navegador e copie o código no final da URL
                (após <code>drive.google.com/drive/folders/<strong>ID_DA_PASTA</strong></code>).
              </span>
            </div>

            {/* Auto Upload Toggles */}
            <div className="form-group-card">
              <label className="field-label">Opções de Envio Automático</label>
              <div className="checkboxes-grid">
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={gdriveConfig.autoUploadStrips}
                    onChange={(e) => setGdriveConfig((prev) => ({ ...prev, autoUploadStrips: e.target.checked }))}
                  />
                  <span>
                    <strong>Salvar Tirinhas Automaticamente</strong>
                    <small>Envia o arquivo PNG em alta resolução ao finalizar cada sessão de fotos</small>
                  </span>
                </label>

                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={gdriveConfig.autoUploadVideos}
                    onChange={(e) => setGdriveConfig((prev) => ({ ...prev, autoUploadVideos: e.target.checked }))}
                  />
                  <span>
                    <strong>Salvar Vídeos 360 Automaticamente</strong>
                    <small>Envia o vídeo vertical com slow motion ao finalizar o processamento</small>
                  </span>
                </label>
              </div>
            </div>

            {/* Test Feedback */}
            {gdriveTestResult && (
              <div className={`test-result-box ${gdriveTestResult.success ? 'success' : 'error'}`}>
                {gdriveTestResult.success ? <CheckCircle2 size={18} /> : <ShieldAlert size={18} />}
                <div>
                  <strong>{gdriveTestResult.success ? 'Teste concluído com sucesso!' : 'Falha no teste de conexão'}</strong>
                  <p>{gdriveTestResult.message}</p>
                  {gdriveTestResult.fileUrl && (
                    <a
                      href={gdriveTestResult.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="test-file-link"
                    >
                      <FolderOpen size={13} /> Abrir arquivo no Google Drive <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="settings-actions-bar">
              <button
                type="button"
                className="button button-outline"
                onClick={handleTestGDrive}
                disabled={testingGDrive || (gdriveConfig.method === 'webhook' && !gdriveConfig.webhookUrl)}
              >
                {testingGDrive ? <LoaderCircle size={16} className="spin" /> : <UploadCloud size={16} />}
                {testingGDrive ? 'Testando envio...' : 'Testar Conexão com Google Drive'}
              </button>

              <button
                type="button"
                className="button button-dark"
                onClick={handleSaveGDrive}
                disabled={savingGDrive}
              >
                {savingGDrive ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}
                {savingGDrive ? 'Salvando...' : 'Salvar Configurações do Google Drive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FIREBASE TAB */}
      {activeTab === 'firebase' && (
        <div className="settings-section-card">
          <div className="settings-card-header">
            <div className="settings-card-title">
              <div className="settings-icon-bubble firebase">
                <Database size={24} />
              </div>
              <div>
                <h2>Configuração da API do Firebase Firestore</h2>
                <p>
                  Conecte o Cloud Firestore para armazenar eventos, fotos e sincronizar com qualquer celular, tablet ou computador.
                </p>
              </div>
            </div>

            <div className="firebase-status-pill">
              <i className="status-dot-active" />
              <span>Pronto para Conectar</span>
            </div>
          </div>

          <div className="settings-form-body">
            <div className="info-banner">
              <Info size={18} />
              <div>
                <strong>Onde encontrar essas credenciais?</strong>
                <p>
                  No console do Firebase (<code>console.firebase.google.com</code>) &gt; <em>Configurações do Projeto</em> (ícone de engrenagem) &gt; aba <em>Geral</em> &gt; role até <em>"Seus aplicativos"</em> &gt; selecione o App da Web.
                </p>
              </div>
            </div>

            <div className="form-fields-grid">
              <div className="field-item">
                <label className="field-label" htmlFor="fb-api-key">
                  API Key (apiKey) <span className="required-star">*</span>
                </label>
                <input
                  id="fb-api-key"
                  type="text"
                  placeholder="AIzaSyA1b2C3D4..."
                  value={firebaseConfig.apiKey}
                  onChange={(e) => setFirebaseConfig((prev) => ({ ...prev, apiKey: e.target.value.trim() }))}
                  required
                />
              </div>

              <div className="field-item">
                <label className="field-label" htmlFor="fb-auth-domain">
                  Auth Domain (authDomain) <span className="required-star">*</span>
                </label>
                <input
                  id="fb-auth-domain"
                  type="text"
                  placeholder="meu-app.firebaseapp.com"
                  value={firebaseConfig.authDomain}
                  onChange={(e) => setFirebaseConfig((prev) => ({ ...prev, authDomain: e.target.value.trim() }))}
                  required
                />
              </div>

              <div className="field-item">
                <label className="field-label" htmlFor="fb-project-id">
                  Project ID (projectId) <span className="required-star">*</span>
                </label>
                <input
                  id="fb-project-id"
                  type="text"
                  placeholder="meu-app-12345"
                  value={firebaseConfig.projectId}
                  onChange={(e) => setFirebaseConfig((prev) => ({ ...prev, projectId: e.target.value.trim() }))}
                  required
                />
              </div>

              <div className="field-item">
                <label className="field-label" htmlFor="fb-storage-bucket">
                  Storage Bucket (storageBucket)
                </label>
                <input
                  id="fb-storage-bucket"
                  type="text"
                  placeholder="meu-app.appspot.com"
                  value={firebaseConfig.storageBucket}
                  onChange={(e) => setFirebaseConfig((prev) => ({ ...prev, storageBucket: e.target.value.trim() }))}
                />
              </div>

              <div className="field-item">
                <label className="field-label" htmlFor="fb-messaging-sender-id">
                  Messaging Sender ID (messagingSenderId)
                </label>
                <input
                  id="fb-messaging-sender-id"
                  type="text"
                  placeholder="123456789012"
                  value={firebaseConfig.messagingSenderId}
                  onChange={(e) => setFirebaseConfig((prev) => ({ ...prev, messagingSenderId: e.target.value.trim() }))}
                />
              </div>

              <div className="field-item">
                <label className="field-label" htmlFor="fb-app-id">
                  App ID (appId) <span className="required-star">*</span>
                </label>
                <input
                  id="fb-app-id"
                  type="text"
                  placeholder="1:123456789012:web:abcdef..."
                  value={firebaseConfig.appId}
                  onChange={(e) => setFirebaseConfig((prev) => ({ ...prev, appId: e.target.value.trim() }))}
                  required
                />
              </div>
            </div>

            {/* Test Feedback */}
            {firebaseTestResult && (
              <div className={`test-result-box ${firebaseTestResult.success ? 'success' : 'error'}`}>
                {firebaseTestResult.success ? <CheckCircle2 size={18} /> : <ShieldAlert size={18} />}
                <div>
                  <strong>{firebaseTestResult.success ? 'Conexão confirmada!' : 'Falha ao conectar'}</strong>
                  <p>{firebaseTestResult.message}</p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="settings-actions-bar">
              <div className="left-actions">
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={handleResetFirebase}
                  title="Restaurar para as variáveis de ambiente (.env)"
                >
                  <RefreshCw size={15} /> Restaurar Padrões (.env)
                </button>
              </div>

              <div className="right-actions">
                <button
                  type="button"
                  className="button button-outline"
                  onClick={handleTestFirebase}
                  disabled={testingFirebase || !firebaseConfig.apiKey}
                >
                  {testingFirebase ? <LoaderCircle size={16} className="spin" /> : <Database size={16} />}
                  {testingFirebase ? 'Testando conexão...' : 'Testar Conexão Firebase'}
                </button>

                <button
                  type="button"
                  className="button button-dark"
                  onClick={handleSaveFirebase}
                  disabled={savingFirebase}
                >
                  {savingFirebase ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}
                  {savingFirebase ? 'Salvando...' : 'Salvar Configurações Firebase'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
