import type { ReactNode } from 'react';

function Svg({ children, size = 24, fill = false }: { children: ReactNode; size?: number; fill?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

type P = { size?: number };

export const PlayIcon = ({ size }: P) => <Svg size={size} fill><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" /></Svg>;
export const PauseIcon = ({ size }: P) => <Svg size={size} fill><rect x="5.5" y="4" width="4.5" height="16" rx="1.2" /><rect x="14" y="4" width="4.5" height="16" rx="1.2" /></Svg>;
export const NextIcon = ({ size }: P) => <Svg size={size} fill><path d="M4 5.2v13.6a.8.8 0 0 0 1.25.66L15 13v5.5a1.25 1.25 0 0 0 2.5 0v-13a1.25 1.25 0 0 0-2.5 0V11L5.25 4.54A.8.8 0 0 0 4 5.2z" /></Svg>;
export const PrevIcon = ({ size }: P) => <Svg size={size} fill><path d="M20 5.2v13.6a.8.8 0 0 1-1.25.66L9 13v5.5a1.25 1.25 0 0 1-2.5 0v-13a1.25 1.25 0 0 1 2.5 0V11l9.75-6.46A.8.8 0 0 1 20 5.2z" /></Svg>;
export const ShuffleIcon = ({ size }: P) => <Svg size={size}><path d="M3 7h3.5c2 0 3.3 1 4.3 2.6l2.4 4.8c1 1.6 2.3 2.6 4.3 2.6H21M17.5 4l3.5 3-3.5 3M3 17h3.5c1.4 0 2.5-.5 3.3-1.4M21 17l-3.5 3m0-6l3.5 3M14.2 8.4C15 7.5 16.100 7 17.500 7H21" /></Svg>;
export const RepeatIcon = ({ size }: P) => <Svg size={size}><path d="M17 2.5l3.5 3.5-3.500 3.500M3.500 11V9.500A3.500 3.500 0 0 1 7 6h13.500M7 21.500L3.500 18 7 14.500M20.500 13v1.500A3.500 3.500 0 0 1 17 18H3.500" /></Svg>;
export const SpeakerIcon = ({ size }: P) => <Svg size={size}><rect x="5.500" y="2.500" width="13" height="19" rx="2.500" /><circle cx="12" cy="14" r="3.500" /><circle cx="12" cy="6.800" r=".9" fill="currentColor" /></Svg>;
export const PhoneIcon = ({ size }: P) => <Svg size={size}><rect x="6.500" y="2.500" width="11" height="19" rx="2.500" /><path d="M10.500 18.500h3" /></Svg>;
export const ComputerIcon = ({ size }: P) => <Svg size={size}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></Svg>;
export const TvIcon = ({ size }: P) => <Svg size={size}><rect x="2.500" y="5" width="19" height="12.500" rx="2" /><path d="M7.500 21h9" /></Svg>;
export const QueueIcon = ({ size }: P) => <Svg size={size}><path d="M4 6.500h16M4 12h10M4 17.500h10M17.500 12.500v6l4-3z" /></Svg>;
export const HomeIcon = ({ size }: P) => <Svg size={size}><path d="M3.500 10.500L12 3.500l8.500 7V20a1 1 0 0 1-1 1H15v-6.500H9V21H4.500a1 1 0 0 1-1-1z" /></Svg>;
export const SearchIcon = ({ size }: P) => <Svg size={size}><circle cx="11" cy="11" r="6.500" /><path d="M16 16l4.500 4.500" /></Svg>;
export const LibraryIcon = ({ size }: P) => <Svg size={size}><path d="M5 3.500v17M10 3.500v17M14.500 5.200l4.800 15" /></Svg>;
export const ChevronDown = ({ size }: P) => <Svg size={size}><path d="M5.500 9l6.500 6.500L18.500 9" /></Svg>;
export const ChevronLeft = ({ size }: P) => <Svg size={size}><path d="M15 5.500L8.500 12l6.500 6.500" /></Svg>;
export const MoreIcon = ({ size }: P) => <Svg size={size} fill><circle cx="5" cy="12" r="1.800" /><circle cx="12" cy="12" r="1.800" /><circle cx="19" cy="12" r="1.800" /></Svg>;
export const HeartIcon = ({ size, filled }: P & { filled?: boolean }) => <Svg size={size} fill={filled}><path d="M12 20.500s-7.500-4.600-7.500-10.200A4.300 4.300 0 0 1 12 7.500a4.300 4.300 0 0 1 7.500 2.800c0 5.600-7.500 10.200-7.500 10.200z" /></Svg>;
export const PlusIcon = ({ size }: P) => <Svg size={size}><path d="M12 5v14M5 12h14" /></Svg>;
export const GearIcon = ({ size }: P) => <Svg size={size}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.300l2-1.500-2-3.400-2.300.9a7 7 0 0 0-2.200-1.300L14 3h-4l-.4 2.400a7 7 0 0 0-2.200 1.300l-2.300-.9-2 3.400 2 1.500a7 7 0 0 0 0 2.600l-2 1.500 2 3.400 2.300-.9a7 7 0 0 0 2.200 1.300L10 21h4l.4-2.400a7 7 0 0 0 2.200-1.300l2.300.9 2-3.400-2-1.500c.07-.4.1-.85.1-1.300z" /></Svg>;
export const VolumeIcon = ({ size }: P) => <Svg size={size}><path d="M4 9.500v5h3.500L12 18.500v-13L7.500 9.500zM15.500 9a4.200 4.200 0 0 1 0 6M18 6.500a7.800 7.800 0 0 1 0 11" /></Svg>;

export function DeviceIcon({ type, size }: { type: string; size?: number }) {
  const t = type.toLowerCase();
  if (t === 'smartphone' || t === 'tablet') return <PhoneIcon size={size} />;
  if (t === 'computer') return <ComputerIcon size={size} />;
  if (t === 'tv' || t === 'castvideo' || t === 'stb' || t === 'gameconsole') return <TvIcon size={size} />;
  return <SpeakerIcon size={size} />;
}
