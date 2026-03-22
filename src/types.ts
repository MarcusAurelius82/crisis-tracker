export interface Crisis {
  id: string;
  title: string;
  type: string;
  severity: 'RED' | 'ORANGE' | 'GREEN' | 'UNKNOWN';
  lat: number;
  lng: number;
  date: string;
  description?: string;
  source: string;
  url: string;
}

export interface GlobeProps {
  rotationSpeed?: number;
  onCrisisSelect?: (crisis: Crisis | null) => void;
  activeCrises: Crisis[];
}
