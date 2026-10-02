import { firebaseEnabled } from './lib/firebase';

export type FilterId = 'color' | 'bw' | 'warm' | 'rose';
export type EventStyle = 'garden' | 'sage' | 'midnight';
export type EventMode = 'booth' | 'video360';
export type CameraMode = 'preview' | 'live' | 'demo';
export type SessionStage = 'idle' | 'capturing' | 'review';

export interface BoothEvent {
  id: string;
  name: string;
  date: string;
  tagline: string;
  color: string;
  style: EventStyle;
  mode: EventMode;
  videoDuration: 15 | 20 | 25;
  videoFilter: FilterId;
  logo?: string;
  template?: string;
  templateLayer: 'background' | 'overlay';
  showText: boolean;
}

export interface PhotoSession {
  id: string;
  eventId: string;
  eventName: string;
  createdAt: string;
  filter: FilterId;
  photos: string[];
  strip: string;
  demo: boolean;
  gdriveUrl?: string;
}

export interface FirebaseSettings {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface GoogleDriveSettings {
  enabled: boolean;
  method: 'webhook' | 'oauth';
  webhookUrl: string;
  folderId: string;
  folderName: string;
  autoUploadStrips: boolean;
  autoUploadVideos: boolean;
  accessToken?: string;
}

export const DEMO_PHOTOS = [
  '/images/booth-demo.jpg',
  '/images/booth-pose-2.jpg',
  '/images/booth-pose-3.jpg',
];

export const DEFAULT_EVENT: BoothEvent = {
  id: 'marina-example',
  name: 'Festa da Marina',
  date: '2026-08-22',
  tagline: 'celebrando bons momentos',
  color: '#df997b',
  style: 'garden',
  mode: 'booth',
  videoDuration: 15,
  videoFilter: 'color',
  templateLayer: 'background',
  showText: true,
};

export const FILTERS: { id: FilterId; label: string; css: string }[] = [
  { id: 'color', label: 'Colorido', css: 'none' },
  { id: 'bw', label: 'Preto e branco', css: 'grayscale(1) contrast(1.05)' },
  { id: 'warm', label: 'Amarelado', css: 'sepia(0.55) saturate(0.85) brightness(1.07)' },
  { id: 'rose', label: 'Rosado', css: 'sepia(0.28) hue-rotate(315deg) saturate(0.8) brightness(1.06)' },
];

export function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function eventDate(date: string, separator = '.') {
  const parts = date.split('-');
  return parts.length === 3 ? [parts[2], parts[1], parts[0]].join(separator) : date;
}

export function eventTitle(name: string) {
  const match = name.match(/^(Festa d[aoe]|Aniversário d[aoe])\s+(.+)$/i);
  return match ? { prefix: match[1], main: match[2] } : { prefix: '', main: name };
}

export function normalizeEvent(value: Partial<BoothEvent>): BoothEvent {
  const duration = value.videoDuration === 20 || value.videoDuration === 25 ? value.videoDuration : 15;
  const mode = value.mode === 'video360' ? 'video360' : 'booth';
  const style = value.style === 'sage' || value.style === 'midnight' ? value.style : 'garden';
  const videoFilter = FILTERS.some((filter) => filter.id === value.videoFilter) ? value.videoFilter! : 'color';
  return {
    ...DEFAULT_EVENT,
    ...value,
    mode,
    style,
    videoDuration: duration,
    videoFilter,
    templateLayer: value.templateLayer === 'overlay' ? 'overlay' : 'background',
    showText: value.showText !== false,
    name: value.name ?? DEFAULT_EVENT.name,
    date: value.date ?? DEFAULT_EVENT.date,
    tagline: value.tagline ?? DEFAULT_EVENT.tagline,
    color: value.color ?? DEFAULT_EVENT.color,
  };
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function makeEventLink(event: BoothEvent) {
  const url = new URL(window.location.href);
  url.search = '';
  // With Firestore configured the short id is enough: the other device reads
  // the event from the database. Without it, the configuration travels in the
  // link itself so shared booths keep working on any static host.
  url.hash = firebaseEnabled
    ? `event=${encodeURIComponent(event.id)}`
    : `event=${encodeURIComponent(event.id)}&data=${base64UrlEncode(JSON.stringify(event))}`;
  return url.toString();
}

function linkParams() {
  const hash = window.location.hash.replace(/^#/, '');
  return hash ? new URLSearchParams(hash) : null;
}

// Ids are used to fetch the event from Firestore; inline data keeps the link
// self-contained when no database is configured.
export function linkedEventId() {
  return linkParams()?.get('event') ?? null;
}

export function readEventFromLink(): BoothEvent | null {
  const data = linkParams()?.get('data');
  if (!data) return null;
  try {
    const value = JSON.parse(base64UrlDecode(data)) as Partial<BoothEvent>;
    if (!value.id || !value.name) return null;
    return normalizeEvent(value);
  } catch {
    return null;
  }
}