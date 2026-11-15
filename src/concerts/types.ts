export interface Concert {
  id: string;
  name: string;
  date: string;
  time?: string;
  venue: string;
  city: string;
  url: string;
  lineup: string[];
  image?: string;
  status?: string;
  distance?: number;
  /** Which of the listener's artists are on the bill. */
  artists: string[];
}

export interface Place {
  name: string;
  lat: number;
  lon: number;
  radius: number;
}
