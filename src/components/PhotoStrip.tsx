import { Camera } from 'lucide-react';
import { DEMO_PHOTOS, eventDate, eventTitle, type BoothEvent, type FilterId } from '../types';
import { filterCss } from '../lib/strip';

export function Flower({ color = '#df997b', size = 26 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M24 6c8-10 18 1 12 10 13 1 12 16 0 19 4 12-11 18-17 7-10 8-20-4-12-12-12-5-6-19 6-16C14 3 23-3 24 6Z" fill={color} />
      <circle cx="23.5" cy="24" r="5" fill="#fffdf8" />
    </svg>
  );
}

interface PhotoStripProps {
  event: BoothEvent;
  photos?: string[];
  filter?: FilterId;
  placeholders?: boolean;
  className?: string;
}

export default function PhotoStrip({ event, photos = DEMO_PHOTOS, filter = 'color', placeholders = false, className = '' }: PhotoStripProps) {
  const title = eventTitle(event.name || 'Seu evento');
  const nameScale = title.main.length > 30 ? 0.082 : title.main.length > 15 ? 0.11 : 0.175;
  return (
    <div className={`photo-strip strip-${event.style} ${className}`} aria-label={`Tirinha de 5 por 15 centímetros, ${event.name}`}>
      {event.template && event.templateLayer === 'background' && <img className="strip-art strip-art-background" src={event.template} alt="Arte personalizada do evento" />}
      <div className="strip-date">{event.showText ? eventDate(event.date) : ''}</div>
      <div className="strip-photos">
        {[0, 1, 2].map((index) => (
          <div className="strip-photo" key={index}>
            {photos[index] || !placeholders ? <img src={photos[index] ?? DEMO_PHOTOS[index]} alt={`Pose ${index + 1}`} style={{ filter: filterCss(filter) }} /> : <div className="strip-placeholder"><Camera size={20} /><span>pose {index + 1}</span></div>}
          </div>
        ))}
      </div>
      {event.showText && <div className="strip-branding">
        {event.logo ? <img src={event.logo} className="strip-logo" alt="Logo do evento" /> : <Flower color={event.color} />}
        {title.prefix && <span className="strip-title-prefix">{title.prefix.toLowerCase()}</span>}
        <span className="strip-event-name" style={{ fontSize: `calc(var(--strip-width) * ${nameScale})` }}>{title.main}</span>
        <span className="strip-tagline">{event.tagline}</span>
        <span className="strip-bottom-line" style={{ background: event.color }} />
      </div>}
      {event.template && event.templateLayer === 'overlay' && <img className="strip-art strip-art-overlay" src={event.template} alt="Moldura personalizada do evento" />}
    </div>
  );
}